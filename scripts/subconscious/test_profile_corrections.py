import unittest

from pydantic import ValidationError

from onyx.server.query_and_chat.burn2.models import ProfileCorrection
from onyx.server.query_and_chat.burn2.profile import effective_profile, profile_context
from onyx.server.query_and_chat.burn2.research import (
    public_research_query,
    research_matches_company,
)


class ProfileCorrectionTests(unittest.TestCase):
    def test_malformed_website_cannot_break_the_next_chat_turn(self):
        value = effective_profile(
            None,
            {"revision": 1, "fields": {"company": "Example", "website": "https://["}},
        )
        self.assertIsNone(public_research_query(value))
        self.assertTrue(research_matches_company(value, "Example"))

    def test_correction_survives_provider_refresh_and_retains_sources(self):
        provider = {
            "status": "ready",
            "profile": {"company": "Old", "website": "old.example.com"},
        }
        correction = {
            "revision": 2,
            "fields": {
                "company": "New",
                "website": "new.example.com",
                "product": "Private launch",
            },
        }
        value = effective_profile(provider, correction)
        self.assertEqual(value["profile"]["company"], "New")
        self.assertEqual(value["provider_profile"]["company"], "Old")
        provider["profile"]["company"] = "Refreshed suggestion"
        refreshed = effective_profile(provider, correction)
        self.assertEqual(refreshed["profile"]["company"], "New")
        self.assertIn("executive corrections", profile_context(refreshed))
        self.assertNotIn("Private launch", public_research_query(refreshed))

    def test_company_correction_never_reuses_old_provider_website(self):
        value = effective_profile(
            {
                "status": "ready",
                "profile": {
                    "company": "Old",
                    "website": "old.example.com",
                    "industry": "Old industry",
                },
            },
            {"revision": 1, "fields": {"company": "New"}},
        )
        self.assertIsNone(public_research_query(value))
        self.assertNotIn("industry", value["profile"])

    def test_manual_profile_works_without_a_provider_match(self):
        value = effective_profile(None, {"revision": 1, "fields": {"company": "New"}})
        self.assertEqual(value["status"], "ready")
        self.assertEqual(value["profile"], {"company": "New"})

    def test_request_rejects_user_ids_unknown_fields_and_unbounded_text(self):
        for fields in (
            {"user_id": "another-user"},
            {"company": "x" * 501},
            {"admin": "true"},
        ):
            with self.subTest(fields=list(fields)):
                with self.assertRaises(ValidationError):
                    ProfileCorrection(revision=0, fields=fields)
        with self.assertRaises(ValidationError):
            ProfileCorrection(revision=-1, fields={"company": "New"})


if __name__ == "__main__":
    unittest.main()
