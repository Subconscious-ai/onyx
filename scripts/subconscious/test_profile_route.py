"""Native handler proof: committed corrections survive research scheduling errors."""

import os
import time
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.burn2 import api
from onyx.server.query_and_chat.burn2.api import correct_executive_profile
from onyx.server.query_and_chat.burn2.models import ProfileCorrection


class ProfileRouteTests(unittest.TestCase):
    def test_saved_correction_survives_unavailable_research_queue(self):
        user = MagicMock(id=uuid4())
        body = ProfileCorrection(revision=0, fields={"company": "Synthetic client"})
        saved = {
            "status": "ready",
            "profile": {"company": "Synthetic client"},
            "correction": {"revision": 1},
        }
        with (
            patch.dict("os.environ", {"BURN2_ENABLED": "true"}),
            patch(
                "onyx.db.burn2_profile.correct_profile", return_value=saved
            ) as correct,
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research",
                side_effect=ConnectionError("Queue unavailable"),
            ),
        ):
            result = correct_executive_profile(body, user)
        correct.assert_called_once_with(user.id, body)
        self.assertEqual(result["correction"]["revision"], 1)
        self.assertEqual(result["profile"], saved["profile"])
        self.assertEqual(result["research"]["status"], "unavailable")


class ProfilePreparationTests(unittest.TestCase):
    def setUp(self):
        import requests

        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.user = SimpleNamespace(id=uuid4(), email="executive@example.com")
        self.state = {"status": "unavailable", "profile": {}}
        self.stack.enter_context(
            patch.dict(os.environ, {"BURN2_ENABLED": "true", "PDL_API_KEY": "fixture"})
        )
        self.stack.enter_context(
            patch("onyx.db.burn2_profile.read_profile", lambda _uid: dict(self.state))
        )
        self.stack.enter_context(patch("onyx.db.burn2_profile.save_profile", self.save))
        self.stack.enter_context(
            patch("onyx.db.burn2_research.read_research", return_value=None)
        )
        self.cache = MagicMock()
        self.cache.lock.return_value.acquire.return_value = True
        self.stack.enter_context(
            patch.object(api, "get_cache_backend", return_value=self.cache)
        )
        self.provider = self.stack.enter_context(patch.object(requests, "get"))
        self.provider.return_value.status_code = 404

    def save(self, _uid, value):
        if "correction" in self.state:
            value = {**value, "correction": self.state["correction"]}
        self.state = dict(value)

    def test_retained_pdl_outcome_does_not_authorize_another_paid_lookup(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": time.time() - 90000,
            "source": "People Data Labs",
        }
        with patch(
            "onyx.server.query_and_chat.burn2.background.ensure_research",
            return_value={"status": "ready"},
        ):
            result = api.prepare_profile(self.user)
        self.assertEqual(result["profile"], self.state["profile"])
        self.assertEqual(result["checked_at"], self.state["checked_at"])
        self.provider.assert_not_called()

    def test_explicit_refresh_retains_one_operation_for_repeated_requests(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": 10,
            "correction": {"revision": 0, "fields": {}},
        }
        operation = uuid4()
        body = SimpleNamespace(operation_id=operation, checked_at=10, revision=0)
        with patch(
            "onyx.server.query_and_chat.burn2.background.ensure_research",
            return_value={"status": "needs_company"},
        ):
            first = api.prepare_profile(user=self.user, body=body)
            second = api.prepare_profile(user=self.user, body=body)
        self.provider.assert_called_once()
        self.assertEqual(first["job_id"], str(operation))
        self.assertEqual(second["job_id"], str(operation))

    def test_explicit_refresh_keeps_company_during_concurrent_same_operation(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example", "website": "example.com"},
            "checked_at": 10,
        }
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)
        during = []

        def response(*_args, **_kwargs):
            during.append(api.prepare_profile(user=self.user, body=body))
            return SimpleNamespace(status_code=404)

        self.provider.side_effect = response
        with patch(
            "onyx.server.query_and_chat.burn2.background.ensure_research",
            return_value={"status": "needs_company"},
        ) as research:
            api.prepare_profile(user=self.user, body=body)
        self.provider.assert_called_once()
        self.assertEqual(during[0]["profile"]["company"], "Example")
        self.assertEqual(during[0]["status"], "updating")
        self.assertEqual(during[0]["job_id"], str(body.operation_id))
        research.assert_called_once()

    def test_failed_refresh_preserves_old_profile_without_fresh_match(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": 10,
        }
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)
        result = api._prepare_profile(self.user, body)
        self.assertEqual(result["profile"]["company"], "Example")
        self.assertEqual(result["preparation_status"], "not_found")
        self.assertEqual(result["provider_checked_at"], 10)
        self.assertFalse(result["preparation_pending"])
        self.assertEqual(result, api._prepare_profile(self.user, body))
        self.provider.assert_called_once()

    def test_research_scheduling_race_preserves_completed_pdl_operation_for_retry(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": 10,
        }
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)
        with patch(
            "onyx.server.query_and_chat.burn2.background.ensure_research",
            side_effect=[
                {"status": "queued"},
                {"status": "queued", "job_id": str(body.operation_id)},
            ],
        ):
            with self.assertRaises(OnyxError) as error:
                api.prepare_profile(user=self.user, body=body)
            self.assertEqual(error.exception.status_code, 503)
            result = api.prepare_profile(user=self.user, body=body)
        self.assertEqual(result["research"]["job_id"], str(body.operation_id))
        self.provider.assert_called_once()

    def test_stale_refresh_snapshot_does_not_call_pdl(self):
        self.state = {"status": "ready", "checked_at": 11, "profile": {}}
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)
        with self.assertRaises(OnyxError):
            api.prepare_profile(user=self.user, body=body)
        self.provider.assert_not_called()

    def test_company_correction_during_refresh_cannot_schedule_old_operation(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": 10,
            "correction": {"revision": 0, "fields": {}},
        }
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)

        def corrected(*_args, **_kwargs):
            self.state["correction"]["revision"] = 1
            return SimpleNamespace(status_code=404)

        self.provider.side_effect = corrected
        with (
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research"
            ) as research,
            self.assertRaises(OnyxError),
        ):
            api.prepare_profile(user=self.user, body=body)
        research.assert_not_called()

    def test_fresh_operation_cannot_replace_active_research(self):
        self.state = {"status": "ready", "checked_at": 10, "profile": {}}
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)
        with (
            patch(
                "onyx.db.burn2_research.read_research",
                return_value={
                    "job_id": "another-operation",
                    "status": "running",
                    "query": "existing company",
                    "checked_at": time.time(),
                },
            ),
            self.assertRaises(OnyxError),
        ):
            api.prepare_profile(user=self.user, body=body)
        self.provider.assert_not_called()

    def test_explicit_timeout_retains_context_and_same_operation_without_retry(self):
        import requests

        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": 10,
        }
        body = api.ProfilePreparation(operation_id=uuid4(), checked_at=10, revision=0)
        self.provider.side_effect = requests.Timeout("response unknown")
        first = api._prepare_profile(self.user, body)
        self.assertEqual(first["profile"]["company"], "Example")
        self.assertEqual(first["preparation_status"], "unavailable")
        self.assertEqual(first["provider_checked_at"], 10)
        self.assertEqual(first, api._prepare_profile(self.user, body))
        self.provider.assert_called_once()

    def test_explicit_pending_operation_expires_without_repeat_charge(self):
        operation = uuid4()
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": time.time() - 90,
            "job_id": str(operation),
            "preparation_pending": True,
        }
        body = api.ProfilePreparation(operation_id=operation, checked_at=10, revision=0)
        with patch(
            "onyx.server.query_and_chat.burn2.background.ensure_research",
            return_value={"status": "pending"},
        ) as research:
            result = api.prepare_profile(user=self.user, body=body)
            reloaded = api.prepare_profile(self.user)
        self.assertEqual(result["preparation_status"], "unavailable")
        self.assertFalse(result["preparation_pending"])
        self.assertEqual(result["research"]["status"], "unavailable")
        self.assertEqual(reloaded["research"]["status"], "unavailable")
        research.assert_not_called()
        self.provider.assert_not_called()

    def test_timeout_retains_one_attempt_instead_of_retrying_each_entry(self):
        import requests

        self.provider.side_effect = requests.Timeout("provider response unknown")
        first = api._prepare_profile(self.user)
        second = api._prepare_profile(self.user)
        self.assertEqual(first["status"], "unavailable")
        self.assertEqual(first, second)
        self.assertIn("checked_at", self.state)
        self.provider.assert_called_once()

    def test_expired_pending_pdl_attempt_is_unavailable_without_another_charge(self):
        self.state = {
            "status": "updating",
            "profile": None,
            "checked_at": time.time() - 90,
            "source": "People Data Labs",
        }
        result = api._prepare_profile(self.user)
        self.assertEqual(result["status"], "unavailable")
        self.provider.assert_not_called()

    def test_another_entry_observes_committed_attempt_before_provider_starts(self):
        during = []

        def response(*_args, **_kwargs):
            self.provider.side_effect = AssertionError("Duplicate paid PDL lookup")
            during.append(api._prepare_profile(self.user))
            return SimpleNamespace(status_code=404)

        self.provider.side_effect = response
        result = api._prepare_profile(self.user)
        self.assertEqual(during[0]["status"], "updating")
        self.assertEqual(result["status"], "not_found")
        self.provider.assert_called_once()


if __name__ == "__main__":
    unittest.main()
