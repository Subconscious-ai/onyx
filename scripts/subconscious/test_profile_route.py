"""Native handler proof: committed corrections survive research scheduling errors."""

import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

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


if __name__ == "__main__":
    unittest.main()
