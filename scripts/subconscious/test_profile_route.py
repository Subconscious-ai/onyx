"""Native handler proof: committed corrections survive research scheduling errors."""

import time
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from onyx.server.query_and_chat.burn2.api import (
    correct_executive_profile,
    prepare_profile,
    read_executive_research,
)
from onyx.server.query_and_chat.burn2.models import ProfileCorrection
from onyx.server.query_and_chat.burn2.research import public_research_query


class ProfileRouteTests(unittest.TestCase):
    def test_entry_retains_loaded_provider_evidence_without_an_interview_brief(self):
        user = MagicMock(id=uuid4())
        db = MagicMock()
        profile = {
            "status": "ready",
            "profile": {"company": "Acme", "website": "acme.example"},
        }
        with (
            patch(
                "onyx.server.query_and_chat.burn2.api._prepare_profile",
                return_value=profile,
            ),
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research",
                return_value={"status": "running"},
            ),
            patch(
                "onyx.server.query_and_chat.causl.context.save_preparation_context",
                return_value={"providerClaims": 1},
            ) as save,
        ):
            result = prepare_profile(user, db)
        self.assertTrue(result["memory_saved"])
        self.assertEqual(result["profile"], profile["profile"])
        self.assertEqual(save.call_args.args[:2], (db, user))
        self.assertEqual(save.call_args.args[2]["profileSource"], "pdl")

    def test_completed_research_is_retained_before_the_poll_returns(self):
        user = MagicMock(id=uuid4())
        db = MagicMock()
        profile = {
            "status": "ready",
            "profile": {"company": "Acme", "website": "acme.example"},
        }
        research = {
            "status": "ready",
            "query": public_research_query(profile),
            "checked_at": time.time(),
            "report": "Acme sells widgets.",
            "source_urls": ["https://acme.example/products"],
        }
        with (
            patch.dict("os.environ", {"BURN2_ENABLED": "true"}),
            patch("onyx.db.burn2_profile.read_profile", return_value=profile),
            patch("onyx.db.burn2_research.read_research", return_value=research),
            patch(
                "onyx.server.query_and_chat.causl.context.save_preparation_context",
                return_value={"providerClaims": 2},
            ) as save,
        ):
            result = read_executive_research(user, db)
        self.assertTrue(result["memory_saved"])
        self.assertEqual(result["report"], "Acme sells widgets.")
        self.assertEqual(
            save.call_args.args[2]["research"]["source_urls"], research["source_urls"]
        )

    def test_failed_retention_does_not_hide_loaded_provider_data_or_claim_a_save(self):
        user = MagicMock(id=uuid4())
        profile = {"status": "ready", "profile": {"company": "Acme"}}
        with (
            patch(
                "onyx.server.query_and_chat.burn2.api._prepare_profile",
                return_value=profile,
            ),
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research",
                return_value={"status": "running"},
            ),
            patch(
                "onyx.server.query_and_chat.causl.context.save_preparation_context",
                side_effect=ConnectionError("Unavailable"),
            ),
        ):
            result = prepare_profile(user, MagicMock())
        self.assertFalse(result["memory_saved"])
        self.assertEqual(result["profile"], profile["profile"])

    def test_reentry_confirms_already_saved_provider_evidence(self):
        user = MagicMock(id=uuid4())
        profile = {"status": "ready", "profile": {"company": "Acme"}}
        with (
            patch(
                "onyx.server.query_and_chat.burn2.api._prepare_profile",
                return_value=profile,
            ),
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research",
                return_value={"status": "running"},
            ),
            patch(
                "onyx.server.query_and_chat.causl.context.save_preparation_context",
                return_value={"providerClaims": 0, "replayed": True},
            ),
        ):
            result = prepare_profile(user, MagicMock())
        self.assertTrue(result["memory_saved"])

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


if __name__ == "__main__":
    unittest.main()
