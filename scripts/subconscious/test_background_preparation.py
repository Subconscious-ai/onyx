"""Native worker boundaries: access, durable receipts and stale-result rejection."""

import json
import os
import time
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from onyx.background.celery.tasks.burn2 import tasks
from onyx.db import burn2_research as storage
from onyx.server.query_and_chat.burn2 import background
from onyx.server.query_and_chat.burn2.research import public_research_query


class BackgroundPreparationTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(
            patch.dict(
                os.environ,
                {
                    "BURN2_ENABLED": "true",
                    "BURN2_RESEARCH_PERSONA_ID": "5",
                    "BURN2_BACKGROUND_PREPARATION": "true",
                },
            )
        )
        self.user = uuid4()
        self.profile = {"status": "ready", "profile": {"website": "example.com"}}
        self.state = None
        self.connection = MagicMock(
            return_value=("https://research.example.com/mcp", {}, "streamable-http")
        )
        self.queue = self.stack.enter_context(
            patch.object(background.client_app, "send_task")
        )
        self.cache = MagicMock()
        self.cache.lock.return_value.acquire.return_value = True
        for module in (background, tasks):
            for name, value in (
                ("get_cache_backend", lambda: self.cache),
                ("read_profile", lambda _uid: self.profile),
                ("read_research", lambda _uid: self.state),
                ("save_research", self.save),
                ("research_connection", self.connection),
                ("get_current_tenant_id", lambda: "public"),
            ):
                self.stack.enter_context(patch.object(module, name, value))

    def save(self, uid, value):
        self.assertEqual(uid, self.user)
        self.state = dict(value)

    def run_research(self):
        tasks.research_company.run(
            user_id=str(self.user),
            persona_id=5,
            job_id=self.state["job_id"],
            tenant_id="public",
        )

    def test_one_native_job_for_repeated_entry_and_receipt_reuse(self):
        first = background.ensure_research(self.user)
        second = background.ensure_research(self.user)
        self.assertEqual(first, second)
        self.queue.assert_called_once()
        self.assertEqual(self.queue.call_args.kwargs["kwargs"]["tenant_id"], "public")
        self.assertEqual(self.queue.call_args.kwargs["expires"], 300)

    def test_denied_tool_access_never_queues_or_saves(self):
        self.connection.side_effect = ValueError("No access")
        self.assertEqual(background.ensure_research(self.user)["status"], "unavailable")
        self.queue.assert_not_called()
        self.assertIsNone(self.state)

    def test_queue_failure_is_persisted_and_not_retried_each_render(self):
        self.queue.side_effect = RuntimeError("Broker unavailable")
        background.ensure_research(self.user)
        self.assertEqual(self.state["status"], "unavailable")
        background.ensure_research(self.user)
        self.queue.assert_called_once()

    def test_stale_job_is_replaced_and_late_receipt_cannot_overwrite(self):
        background.ensure_research(self.user)
        old_job = self.state["job_id"]
        self.state["checked_at"] = time.time() - 600
        background.ensure_research(self.user)
        self.assertNotEqual(self.state["job_id"], old_job)
        with patch.object(tasks, "call_mcp_tool") as call:
            tasks.research_company.run(
                user_id=str(self.user), persona_id=5, job_id=old_job, tenant_id="public"
            )
            call.assert_not_called()

    def test_worker_persists_original_sources_without_browser(self):
        background.ensure_research(self.user)
        with patch.object(
            tasks,
            "call_mcp_tool",
            return_value=json.dumps(
                {
                    "status": "success",
                    "data": {
                        "context": ["Published product"],
                        "source_urls": ["https://example.com/product"],
                    },
                }
            ),
        ):
            self.run_research()
        self.assertEqual(self.state["status"], "ready")
        self.assertEqual(self.state["source_urls"], ["https://example.com/product"])
        background.ensure_research(self.user)
        self.queue.assert_called_once()

    def test_company_change_during_research_discards_old_result(self):
        background.ensure_research(self.user)

        def switched(*_args, **_kwargs):
            self.profile["profile"]["website"] = "different.example.com"
            return json.dumps(
                {"context": "Old company", "source_urls": ["https://example.com"]}
            )

        with patch.object(tasks, "call_mcp_tool", side_effect=switched):
            self.run_research()
        self.assertNotEqual(self.state["status"], "ready")
        background.ensure_research(self.user)
        self.assertEqual(self.state["query"], public_research_query(self.profile))

    def test_nested_tool_failure_is_durable_failure(self):
        background.ensure_research(self.user)
        with patch.object(
            tasks, "call_mcp_tool", return_value='{"status":"unavailable"}'
        ):
            self.run_research()
        self.assertEqual(self.state["status"], "unavailable")
        self.assertNotIn("report", self.state)

    def test_tenant_mismatch_never_touches_research_or_brief(self):
        with self.assertRaisesRegex(ValueError, "tenant context"):
            tasks.research_company.run(
                user_id=str(self.user), persona_id=5, job_id="x", tenant_id="another"
            )
        with self.assertRaisesRegex(ValueError, "tenant context"):
            tasks.prepare_saved_brief.run(
                user_id=str(self.user), chat_id=str(uuid4()), tenant_id="another"
            )
        self.connection.assert_not_called()

    def test_brief_enqueue_is_bounded_and_carries_native_identity(self):
        chat = uuid4()
        background.enqueue_brief(self.user, chat)
        self.assertEqual(
            self.queue.call_args.kwargs["kwargs"],
            {"user_id": str(self.user), "chat_id": str(chat), "tenant_id": "public"},
        )
        self.assertEqual(self.queue.call_args.kwargs["expires"], 300)


class ResearchAccessTests(unittest.TestCase):
    def test_native_persona_and_credentials_are_required(self):
        user = SimpleNamespace(is_active=True)
        server = SimpleNamespace(
            server_url="https://research.example.com/mcp", transport=None
        )
        db = MagicMock()
        db.get.side_effect = [user, server]
        persona = SimpleNamespace(
            name="Burn 2.0",
            tools=[SimpleNamespace(name="deep_research", mcp_server_id=4)],
        )
        credentials = MagicMock()
        credentials.can_authenticate.return_value = False
        with (
            patch.object(storage, "get_session_with_current_tenant") as session,
            patch.object(storage, "get_persona_by_id", return_value=persona) as access,
            patch.object(storage, "resolve_mcp_credentials", return_value=credentials),
        ):
            session.return_value.__enter__.return_value = db
            with self.assertRaisesRegex(ValueError, "credentials"):
                storage.research_connection(uuid4(), 5)
            access.assert_called_once_with(5, user, db, is_for_edit=False)

    def test_inactive_account_cannot_resolve_tools(self):
        with (
            patch.object(storage, "get_session_with_current_tenant") as session,
            patch.object(storage, "get_persona_by_id") as access,
        ):
            session.return_value.__enter__.return_value.get.return_value = (
                SimpleNamespace(is_active=False)
            )
            with self.assertRaisesRegex(ValueError, "Active account"):
                storage.research_connection(uuid4(), 5)
            access.assert_not_called()


if __name__ == "__main__":
    unittest.main()
