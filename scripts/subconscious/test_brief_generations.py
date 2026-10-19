"""Native backend unit regression: latest-turn preparation wins without new infra."""

import unittest
from contextlib import ExitStack
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry
from fastapi import HTTPException

from onyx.background.celery.tasks.burn2.tasks import prepare_saved_brief
from onyx.server.query_and_chat.burn2.background import enqueue_brief


class BriefGenerationTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.user_id = uuid4()
        self.chat_id = uuid4()
        self.tenant = "public"
        self.key = f"burn2:brief-generation:{self.tenant}:{self.user_id}:{self.chat_id}"
        self.values = {}
        self.cache = MagicMock()
        self.cache.get.side_effect = lambda key: self.values.get(key)

        def retain(key, value, ex=None):
            self.assertEqual(ex, 300)
            self.values[key] = value.encode() if isinstance(value, str) else value

        self.cache.set.side_effect = retain
        self.stack.enter_context(
            patch.dict("os.environ", {"BURN2_BACKGROUND_PREPARATION": "true"})
        )
        for module in (
            "onyx.server.query_and_chat.burn2.background",
            "onyx.background.celery.tasks.burn2.tasks",
        ):
            self.stack.enter_context(
                patch(module + ".get_cache_backend", return_value=self.cache)
            )
            self.stack.enter_context(
                patch(module + ".get_current_tenant_id", return_value=self.tenant)
            )
        self.send = self.stack.enter_context(
            patch("onyx.server.query_and_chat.burn2.background.client_app.send_task")
        )
        session = self.stack.enter_context(
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_session_with_current_tenant"
            )
        )
        session.return_value.__enter__.return_value.get.return_value = MagicMock(
            is_active=True
        )
        self.permission = self.stack.enter_context(
            patch("onyx.auth.permissions.has_global_permission", return_value=True)
        )
        self.prepare = self.stack.enter_context(
            patch("onyx.server.query_and_chat.burn2.api.prepare_brief")
        )
        self.retry = self.stack.enter_context(
            patch.object(prepare_saved_brief, "retry", side_effect=Retry())
        )

    def enqueue(self):
        enqueue_brief(self.user_id, self.chat_id)
        return self.send.call_args.kwargs["kwargs"]

    def invoke(self, kwargs):
        try:
            prepare_saved_brief.run(**kwargs)
        except Retry:
            pass

    def test_six_rapid_turns_prepare_only_latest_generation(self):
        jobs = [self.enqueue() for _ in range(6)]
        self.assertEqual(len({job["generation"] for job in jobs}), 6)
        self.assertEqual(self.values[self.key], jobs[-1]["generation"].encode())
        for job in jobs:
            self.invoke(job)
        self.prepare.assert_called_once()
        self.retry.assert_not_called()
        for call in self.send.call_args_list:
            self.assertEqual(call.kwargs["countdown"], 3)
            self.assertEqual(call.kwargs["expires"], 300)
        self.assertTrue(
            all(call.kwargs["ex"] == 300 for call in self.cache.set.call_args_list)
        )

    def test_new_turn_during_old_extraction_stops_old_cas_retry(self):
        old = self.enqueue()
        new = None

        def changed_during_extract(*_args):
            nonlocal new
            new = self.enqueue()
            raise HTTPException(409, "Conversation changed")

        self.prepare.side_effect = changed_during_extract
        self.invoke(old)
        self.retry.assert_not_called()
        self.assertEqual(self.values[self.key], new["generation"].encode())
        self.prepare.side_effect = None
        self.invoke(new)
        self.assertEqual(self.prepare.call_count, 2)
        self.cache.delete.assert_not_called()

    def test_current_generation_retries_lock_contention_then_saves(self):
        latest = self.enqueue()
        self.prepare.side_effect = HTTPException(409, "Draft updating")
        self.invoke(latest)
        self.retry.assert_called_once()
        self.assertEqual(self.retry.call_args.kwargs["countdown"], 5)
        self.assertEqual(prepare_saved_brief.max_retries, 4)
        self.prepare.side_effect = None
        self.invoke(latest)
        self.assertEqual(self.prepare.call_count, 2)

    def test_authorization_is_not_bypassed_for_latest_generation(self):
        latest = self.enqueue()
        self.permission.return_value = False
        self.invoke(latest)
        self.prepare.assert_not_called()
        self.retry.assert_not_called()

    def test_legacy_queued_task_without_generation_still_prepares(self):
        self.invoke(
            {
                "user_id": str(self.user_id),
                "chat_id": str(self.chat_id),
                "tenant_id": self.tenant,
            }
        )
        self.prepare.assert_called_once()


if __name__ == "__main__":
    unittest.main()
