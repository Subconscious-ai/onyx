"""Native handler proof: committed corrections survive research scheduling errors."""

import os
import time
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

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
        self.cache = MagicMock()
        self.cache.lock.return_value.acquire.return_value = True
        self.stack.enter_context(
            patch.object(api, "get_cache_backend", return_value=self.cache)
        )
        self.provider = self.stack.enter_context(patch.object(requests, "get"))
        self.provider.return_value.status_code = 404

    def save(self, _uid, value):
        self.state = dict(value)

    def test_retained_pdl_outcome_does_not_authorize_another_paid_lookup(self):
        self.state = {
            "status": "ready",
            "profile": {"company": "Example"},
            "checked_at": time.time() - 90000,
            "source": "People Data Labs",
        }
        result = api._prepare_profile(self.user)
        self.assertEqual(result, self.state)
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
