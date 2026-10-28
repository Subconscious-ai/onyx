"""Native worker boundaries: access, durable receipts and stale-result rejection."""

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
from onyx.server.query_and_chat.burn2.research import (
    collect_public_research,
    public_research_query,
)
from onyx.tools.tool_implementations.open_url.models import WebContent
from onyx.tools.tool_implementations.web_search.clients.exa_client import ExaClient
from onyx.tools.tool_implementations.web_search.models import WebSearchResult


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
        self.provider = MagicMock()
        self.provider.search.return_value = [
            WebSearchResult(
                title="Published product",
                link="https://example.com/product",
                snippet="Search summary",
            )
        ]
        self.provider.contents.return_value = [
            WebContent(
                title="Published product",
                link="https://example.com/product",
                full_content="Published product",
            )
        ]
        self.connection = MagicMock(return_value=self.provider)
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
                ("research_connection", self.connection),
                ("get_current_tenant_id", lambda: "public"),
            ):
                self.stack.enter_context(patch.object(module, name, value))
        self.stack.enter_context(patch.object(background, "save_research", self.save))
        self.stack.enter_context(
            patch.object(background, "update_research_if_current", self.update)
        )
        self.stack.enter_context(
            patch.object(tasks, "update_research_if_current", self.update)
        )

    def save(self, uid, value):
        self.assertEqual(uid, self.user)
        self.state = dict(value)

    def update(self, uid, value, *, job_id, status):
        if (
            not self.state
            or self.state.get("job_id") != job_id
            or self.state.get("status") != status
        ):
            return False
        self.save(uid, value)
        return True

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

    def test_expired_same_scope_does_not_authorize_another_paid_operation(self):
        original = {
            "job_id": "retained-operation",
            "status": "ready",
            "query": public_research_query(self.profile),
            "checked_at": time.time() - 90000,
            "source_urls": ["https://example.com/product"],
            "report": "Retained original product evidence.",
        }
        self.state = dict(original)
        result = background.ensure_research(self.user)
        self.assertEqual(result["job_id"], "retained-operation")
        self.assertEqual(result["source_urls"], ["https://example.com/product"])
        self.queue.assert_not_called()
        self.assertEqual(self.state, original)

    def test_native_exa_capture_survives_without_a_gpt_researcher_tool(self):
        provider = MagicMock()
        provider.search.return_value = [
            WebSearchResult(
                title="Original product page",
                link="https://example.com/product",
                snippet="A search summary is not the original evidence.",
            )
        ]
        provider.contents.return_value = [
            WebContent(
                title="Original product page",
                link="https://example.com/product",
                full_content="Pricing starts at $40 per seat per month.\n",
            )
        ]
        self.connection.return_value = provider
        operation = background.ensure_research(self.user)["job_id"]
        self.run_research()
        self.assertEqual(self.state["status"], "ready")
        self.assertEqual(self.state["job_id"], operation)
        self.assertEqual(self.state["source_urls"], ["https://example.com/product"])
        capture = self.state["source_captures"][0]
        self.assertEqual(capture["text"], "Pricing starts at $40 per seat per month.\n")
        self.assertEqual(capture["url"], "https://example.com/product")
        self.assertEqual(capture["title"], "Original product page")
        self.assertEqual(self.state["acceptance"], "unaccepted")
        background.ensure_research(self.user)
        self.queue.assert_called_once()

    def test_expired_never_started_job_requeues_the_same_operation(self):
        self.state = {
            "job_id": "never-started",
            "status": "queued",
            "query": public_research_query(self.profile),
            "checked_at": time.time() - 400,
        }
        result = background.ensure_research(self.user)
        self.assertEqual(result["job_id"], "never-started")
        self.queue.assert_called_once()
        self.run_research()
        self.assertEqual(self.state["status"], "ready")
        self.assertEqual(self.state["job_id"], "never-started")

    def test_expired_running_operation_is_truthful_without_recharging(self):
        self.state = {
            "job_id": "started",
            "status": "running",
            "query": public_research_query(self.profile),
            "checked_at": time.time() - 400,
        }
        result = background.ensure_research(self.user)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["job_id"], "started")
        self.queue.assert_not_called()

    def test_busy_research_lock_never_returns_the_previous_company_receipt(self):
        self.state = {
            "status": "ready",
            "query": "old company",
            "source_urls": ["https://old.example.com"],
            "checked_at": time.time(),
        }
        self.cache.lock.return_value.acquire.return_value = False
        result = background.ensure_research(self.user)
        self.assertEqual(result["status"], "queued")
        self.assertNotIn("source_urls", result)

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

    def test_material_scope_change_replaces_job_and_late_receipt_cannot_overwrite(self):
        background.ensure_research(self.user)
        old_job = self.state["job_id"]
        self.profile["profile"]["website"] = "different.example.com"
        background.ensure_research(self.user)
        self.assertNotEqual(self.state["job_id"], old_job)
        with patch.object(tasks, "collect_public_research") as call:
            tasks.research_company.run(
                user_id=str(self.user), persona_id=5, job_id=old_job, tenant_id="public"
            )
            call.assert_not_called()

    def test_worker_persists_original_sources_without_browser(self):
        background.ensure_research(self.user)
        self.run_research()
        self.assertEqual(self.state["status"], "ready")
        self.assertEqual(self.state["source_urls"], ["https://example.com/product"])
        background.ensure_research(self.user)
        self.queue.assert_called_once()

    def test_company_change_during_research_discards_old_result(self):
        background.ensure_research(self.user)

        def switched(*_args, **_kwargs):
            self.profile["profile"]["website"] = "different.example.com"
            return [
                WebContent(
                    title="Old company",
                    link="https://example.com/product",
                    full_content="Old company",
                )
            ]

        with patch.object(self.provider, "contents", side_effect=switched):
            self.run_research()
        self.assertNotEqual(self.state["status"], "ready")
        background.ensure_research(self.user)
        self.assertEqual(self.state["query"], public_research_query(self.profile))

    def test_missing_original_capture_is_durable_failure(self):
        background.ensure_research(self.user)
        self.provider.contents.return_value = []
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
        queued = self.queue.call_args.kwargs["kwargs"]
        self.assertEqual(queued["user_id"], str(self.user))
        self.assertEqual(queued["chat_id"], str(chat))
        self.assertEqual(queued["tenant_id"], "public")
        self.assertIsInstance(queued["generation"], str)
        self.assertTrue(queued["generation"])
        self.assertEqual(self.cache.set.call_args.args[1], queued["generation"])
        self.assertEqual(self.queue.call_args.kwargs["expires"], 300)


class ResearchAccessTests(unittest.TestCase):
    def test_native_exa_tool_uses_bounded_existing_configuration_without_gpt(self):
        db = MagicMock()
        db.get.return_value = SimpleNamespace(is_active=True)
        persona = SimpleNamespace(
            name="Burn 2.0", tools=[SimpleNamespace(name="web_search")]
        )
        configured = SimpleNamespace(
            provider_type="exa",
            api_key=SimpleNamespace(get_value=lambda **_kwargs: "fixture"),
            config={"num_results": "10"},
        )
        with (
            patch.object(storage, "get_session_with_current_tenant") as session,
            patch.object(storage, "get_persona_by_id", return_value=persona),
            patch.object(
                storage, "fetch_active_web_search_provider", return_value=configured
            ),
        ):
            session.return_value.__enter__.return_value = db
            provider = storage.research_connection(uuid4(), 5)
        provider.exa = MagicMock()
        provider.exa.search_and_contents.return_value.results = []
        self.assertEqual(provider.search("public business"), [])
        self.assertEqual(
            provider.exa.search_and_contents.call_args.kwargs["num_results"], 4
        )

    def test_authorized_readback_keeps_aged_sources_without_spending(self):
        from onyx.server.query_and_chat.burn2.api import read_executive_research

        profile = {"status": "ready", "profile": {"website": "example.com"}}
        research = {
            "status": "ready",
            "query": public_research_query(profile),
            "checked_at": time.time() - 90000,
            "source_urls": ["https://example.com/pricing"],
            "job_id": "retained",
            "source_captures": [{"text": "Exact private capture bytes"}],
        }
        with (
            patch.dict(os.environ, {"BURN2_ENABLED": "true"}),
            patch("onyx.db.burn2_profile.read_profile", return_value=profile),
            patch.object(storage, "read_research", return_value=research),
        ):
            result = read_executive_research(SimpleNamespace(id=uuid4()))
        self.assertEqual(result["source_urls"], ["https://example.com/pricing"])
        self.assertEqual(result["job_id"], "retained")
        self.assertTrue(result["stale"])
        self.assertNotIn("source_captures", result)

    def test_capture_urls_match_producer_port_and_fragment_constraints(self):
        from onyx.server.query_and_chat.burn2.research import public_source_url

        for url in (
            "https://example.com:8443/pricing",
            "https://example.com/pricing#plans",
        ):
            with self.subTest(url=url):
                self.assertIsNone(public_source_url(url))
        self.assertEqual(
            public_source_url("https://example.com/pricing"),
            "https://example.com/pricing",
        )

    def test_native_capture_retains_sdk_text_before_hashing(self):
        provider = ExaClient(api_key="fixture")
        provider.exa = MagicMock()
        provider.exa.search_and_contents.return_value.results = [
            SimpleNamespace(
                title="Pricing",
                url="https://example.com/pricing",
                highlights=["summary"],
                author=None,
                published_date=None,
            )
        ]
        provider.exa.get_contents.return_value.results = [
            SimpleNamespace(
                title="Pricing",
                url="https://example.com/pricing",
                text="  Price $40.\n",
                published_date=None,
            )
        ]
        receipt = collect_public_research(provider, "public company pricing")
        capture = receipt["source_captures"][0]
        self.assertEqual(capture["text"], "  Price $40.\n")
        self.assertEqual(
            capture["sha256"],
            "259675da5a3cdab7fe65c9b6b7dd34d820d395e02b36e4242a2d3b47fb68bb0d",
        )

    def test_native_persona_and_exa_credentials_are_required(self):
        user = SimpleNamespace(is_active=True)
        db = MagicMock()
        db.get.return_value = user
        persona = SimpleNamespace(
            name="Burn 2.0",
            tools=[SimpleNamespace(name="web_search")],
        )
        provider = SimpleNamespace(provider_type="exa", api_key=None, config={})
        with (
            patch.object(storage, "get_session_with_current_tenant") as session,
            patch.object(storage, "get_persona_by_id", return_value=persona) as access,
            patch.object(
                storage, "fetch_active_web_search_provider", return_value=provider
            ),
        ):
            session.return_value.__enter__.return_value = db
            with self.assertRaisesRegex(ValueError, "API key is required"):
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
