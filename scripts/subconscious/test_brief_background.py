"""Run in the native backend environment; no database or provider calls."""

import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry
from fastapi import HTTPException

from onyx.background.celery.tasks.burn2.tasks import prepare_saved_brief


class BriefBackgroundTests(unittest.TestCase):
    def invoke(self, failure=None, allowed=True, retries=0, provider_failures=0):
        arguments = {
            "user_id": str(uuid4()),
            "chat_id": str(uuid4()),
            "tenant_id": "public",
            "provider_failures": provider_failures,
        }
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
            prepare_saved_brief.push_request(retries=retries, kwargs=arguments)
            try:
                prepare_saved_brief.run(**arguments)
            except Retry:
                pass
            finally:
                prepare_saved_brief.pop_request()
            return prepare, retry

    def native_retry(
        self, status: int, retries: int, provider_failures: int | None = None
    ) -> None:
        """Exercise Celery's retry limit/signature; isolate storage and the broker."""
        arguments: dict[str, str | int] = {
            "user_id": str(uuid4()),
            "chat_id": str(uuid4()),
            "tenant_id": "public",
        }
        if provider_failures is not None:
            arguments["provider_failures"] = provider_failures
        with (
            patch.dict("os.environ", {"BURN2_BACKGROUND_PREPARATION": "true"}),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_current_tenant_id",
                return_value="public",
            ),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_session_with_current_tenant"
            ) as session,
            patch("onyx.auth.permissions.has_global_permission", return_value=True),
            patch(
                "onyx.server.query_and_chat.burn2.api.prepare_brief",
                side_effect=HTTPException(status, "Synthetic transient failure"),
            ),
        ):
            session.return_value.__enter__.return_value.get.return_value = MagicMock(
                is_active=True
            )
            prepare_saved_brief.push_request(
                id=str(uuid4()),
                retries=retries,
                kwargs=arguments,
                called_directly=False,
                is_eager=True,
            )
            try:
                prepare_saved_brief.run(**arguments)
            finally:
                prepare_saved_brief.pop_request()

    def test_native_retry_waits_past_the_75_second_lock_lifetime(self) -> None:
        with self.assertRaises(Retry) as retried:
            self.native_retry(409, retries=15)
        self.assertEqual(retried.exception.when, 5)

    def test_native_provider_retry_is_not_consumed_by_lock_contention(self) -> None:
        with self.assertRaises(Retry) as retried:
            self.native_retry(502, retries=8)
        self.assertEqual(retried.exception.when, 5)
        self.assertEqual(retried.exception.sig.kwargs["provider_failures"], 1)
        self.assertEqual(retried.exception.sig.kwargs["tenant_id"], "public")

    def test_native_provider_backoff_counts_provider_failures_only(self) -> None:
        for failures, delay in enumerate((5, 10, 20, 40)):
            with self.subTest(failures=failures):
                with self.assertRaises(Retry) as retried:
                    self.native_retry(
                        502, retries=8 + failures, provider_failures=failures
                    )
                self.assertEqual(retried.exception.when, delay)
                self.assertEqual(
                    retried.exception.sig.kwargs["provider_failures"], failures + 1
                )
        with self.assertRaises(HTTPException) as exhausted:
            self.native_retry(502, retries=12, provider_failures=4)
        self.assertEqual(exhausted.exception.status_code, 502)

    def test_native_contention_retries_remain_bounded_after_provider_failures(
        self,
    ) -> None:
        with self.assertRaises(HTTPException) as exhausted:
            self.native_retry(409, retries=20, provider_failures=4)
        self.assertEqual(exhausted.exception.status_code, 409)

    def test_transient_lock_and_provider_errors_schedule_a_bounded_retry(self):
        for status in (409, 502):
            with self.subTest(status=status):
                prepare, retry = self.invoke(HTTPException(status, "Synthetic error"))
                prepare.assert_called_once()
                retry.assert_called_once()
                self.assertEqual(retry.call_args.kwargs["countdown"], 5)
                self.assertEqual(retry.call_args.kwargs["expires"], 120)
        self.assertEqual(prepare_saved_brief.max_retries, 4)

    def test_waiting_for_another_turn_does_not_back_off_like_a_provider_failure(self):
        # An older extraction can hold the lock through several quick answers.
        # The newest answer must retry promptly once that lock becomes free.
        _, busy = self.invoke(HTTPException(409, "Preparation in progress"), retries=3)
        self.assertLessEqual(busy.call_args.kwargs["countdown"], 5)
        self.assertGreaterEqual(busy.call_args.kwargs["max_retries"], 12)
        _, provider = self.invoke(
            HTTPException(502, "Provider unavailable"), retries=3, provider_failures=3
        )
        self.assertEqual(provider.call_args.kwargs["countdown"], 40)

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
