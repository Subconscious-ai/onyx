"""Run in the native backend environment; no database or provider calls."""

import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry
from fastapi import HTTPException

from onyx.background.celery.tasks.burn2.tasks import prepare_saved_brief


class BriefBackgroundTests(unittest.TestCase):
    def invoke(self, failure=None, allowed=True):
        with (
            patch.dict("os.environ", {"BURN2_BACKGROUND_PREPARATION": "true"}),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_current_tenant_id",
                return_value="public",
            ),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_session_with_current_tenant"
            ) as session,
            patch("onyx.auth.permissions.has_global_permission", return_value=allowed),
            patch(
                "onyx.server.query_and_chat.burn2.api.prepare_brief",
                side_effect=failure,
            ) as prepare,
            patch.object(prepare_saved_brief, "retry", side_effect=Retry()) as retry,
        ):
            session.return_value.__enter__.return_value.get.return_value = MagicMock(
                is_active=True
            )
            try:
                prepare_saved_brief.run(
                    user_id=str(uuid4()), chat_id=str(uuid4()), tenant_id="public"
                )
            except Retry:
                pass
            return prepare, retry

    def test_transient_lock_and_provider_errors_schedule_a_bounded_retry(self):
        for status in (409, 502):
            with self.subTest(status=status):
                prepare, retry = self.invoke(HTTPException(status, "Synthetic error"))
                prepare.assert_called_once()
                retry.assert_called_once()
                self.assertEqual(retry.call_args.kwargs["countdown"], 5)
                self.assertEqual(retry.call_args.kwargs["expires"], 120)
        self.assertEqual(prepare_saved_brief.max_retries, 4)

    def test_permission_failure_does_not_retry_or_prepare(self):
        prepare, retry = self.invoke(allowed=False)
        prepare.assert_not_called()
        retry.assert_not_called()

    def test_success_does_not_repeat_preparation(self):
        prepare, retry = self.invoke()
        prepare.assert_called_once()
        retry.assert_not_called()

    def test_nontransient_error_does_not_retry(self):
        _, retry = self.invoke(HTTPException(404, "Not found"))
        retry.assert_not_called()


if __name__ == "__main__":
    unittest.main()
