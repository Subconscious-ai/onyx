import unittest

from onyx.server.query_and_chat.burn2.profile import (
    interview_context,
    select_profile,
    turn_guidance,
)


class ProfileTests(unittest.TestCase):
    def test_unknown_operating_answers_remain_in_active_turn_context(self):
        result = interview_context(
            ["Baseline is unknown.", "The proposed lever is weekly use."]
        )
        self.assertIn("Baseline is unknown.", result)
        self.assertIn("Do not ask", result)

    def test_provider_profile_never_keeps_contact_or_sensitive_fields(self):
        value = select_profile(
            {
                "likelihood": 9,
                "data": {
                    "full_name": "Pat Example",
                    "job_title": "CEO",
                    "job_company_name": "Example",
                    "personal_emails": ["private@example.com"],
                    "birth_date": "1970-01-01",
                    "phone_numbers": ["123"],
                    "job_company_website": "example.com",
                },
            }
        )
        self.assertEqual(value["company"], "Example")
        self.assertNotIn("personal_emails", str(value))
        self.assertNotIn("1970", str(value))
        self.assertNotIn("123", str(value))

    def test_low_confidence_match_never_becomes_identity(self):
        self.assertIsNone(
            select_profile({"likelihood": 2, "data": {"full_name": "Wrong person"}})
        )

    def test_jerry_is_once_on_fifth_answer_and_suppressed_after_frustration(self):
        self.assertIn("Jerry", turn_guidance(5, "The product is ice cream."))
        self.assertNotIn("Jerry", turn_guidance(4, "The product is ice cream."))
        self.assertNotIn("Jerry", turn_guidance(6, "The product is ice cream."))
        self.assertNotIn("Jerry", turn_guidance(5, "Stop repeating the same question."))
