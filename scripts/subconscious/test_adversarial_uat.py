import unittest

from adversarial_uat import choose_reply, equation_failures, observed_ready, read_brief


class AdaptiveTesterTests(unittest.TestCase):
    def test_passive_recap_does_not_get_unsolicited_missing_facts(self):
        reply, reason = choose_reply(
            self.case, "Noted. We will use that in the model.", set()
        )
        self.assertEqual(reply, "Thanks.")
        self.assertEqual(reason, "passive_probe")

    def setUp(self):
        self.case = {
            "facts": [
                {
                    "id": "goal",
                    "topics": "target|goal|deadline",
                    "answer": "Target 7% in three months.",
                },
                {
                    "id": "journey",
                    "topics": "journey|customer|steps",
                    "answer": "Homeowners visit, request a quote, then sign.",
                },
            ],
            "unknown_answer": "I don't know. Keep it unknown.",
        }

    def test_answers_actual_question_not_fixed_next_turn(self):
        seen = set()
        reply, key = choose_reply(self.case, "Which customer steps matter?", seen)
        self.assertEqual(key, "journey")
        self.assertIn("Homeowners", reply)

    def test_customer_segment_target_does_not_answer_numeric_goal(self):
        reply, key = choose_reply(
            self.case, "Which customer segment should we target?", set()
        )
        self.assertEqual(key, "journey")

    def test_repeated_question_does_not_invent_new_answer(self):
        reply, key = choose_reply(
            self.case, "Which customer steps matter?", {"journey"}
        )
        self.assertIn("already", reply)
        self.assertEqual(key, "repeat:journey")

    def test_specific_visitor_segment_is_journey_question(self):
        reply, key = choose_reply(
            self.case,
            "Which specific visitor segment does the baseline conversion rate refer to?",
            set(),
        )
        self.assertEqual(key, "journey")

    def test_unknown_question_stays_unknown(self):
        reply, key = choose_reply(self.case, "What is your churn rate?", set())
        self.assertEqual(key, "unknown")
        self.assertIn("unknown", reply)

    def test_idle_recaps_do_not_rescue_an_unresolved_journey(self):
        reply, key = choose_reply(self.case, "Thanks, noted.", {"goal"})
        self.assertEqual(key, "passive_probe")
        self.assertEqual(reply, "Thanks.")

    def test_sold_units_cannot_be_converted_twice(self):
        case = {
            "forbidden_equation_patterns": [
                r"(?:pints|sales).*(?:×|\*|times).*conversion"
            ]
        }
        bad = {
            "model": {
                "equation": {
                    "text": "Stores × weeks × pints per store per week × price × purchase conversion"
                }
            }
        }
        good = {
            "model": {
                "equation": {
                    "text": "Stores × weeks × pints per store per week × price"
                }
            }
        }
        self.assertEqual(len(equation_failures(case, bad)), 1)
        self.assertEqual(equation_failures(case, good), [])

    def test_ready_uses_saved_structured_data_not_spoken_claim(self):
        self.assertFalse(observed_ready(None))
        self.assertIsNone(read_brief("Your brief is ready"))
        self.assertFalse(
            observed_ready(
                {
                    "objective": {"status": "executive"},
                    "keyResults": [],
                    "journey": [],
                    "transitions": [],
                }
            )
        )


if __name__ == "__main__":
    unittest.main()
