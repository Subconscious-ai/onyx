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

    def test_answers_a_proposed_sequence_confirmation(self):
        reply, key = choose_reply(
            self.case,
            "Proposed journey: view, quote, sign. Does that sequence fit, or what changes?",
            set(),
        )
        self.assertEqual(key, "journey")
        self.assertIn("Homeowners", reply)

    def test_imperative_confirmation_is_an_actual_request(self):
        _, key = choose_reply(
            self.case,
            "Confirm or correct the customer journey from tariff-page visit to signed contract.",
            set(),
        )
        self.assertEqual(key, "journey")

    def test_passive_description_of_confirmation_does_not_supply_facts(self):
        _, key = choose_reply(
            self.case, "We will confirm the customer journey later.", set()
        )
        self.assertEqual(key, "passive_probe")

    def test_answers_a_named_measure_question(self):
        reply, key = choose_reply(
            self.case,
            "What success measure counts, and what target do you have?",
            set(),
        )
        self.assertEqual(key, "goal")

    def test_buyer_path_question_supplies_the_journey(self):
        _, key = choose_reply(
            self.case,
            "Which key decisions define the path from quote to final order?",
            set(),
        )
        self.assertEqual(key, "journey")

    def test_plain_outcome_choice_supplies_the_private_goal(self):
        _, key = choose_reply(
            self.case,
            "Should messaging drive new sign-ups, plan upgrades, or renewals?",
            set(),
        )
        self.assertEqual(key, "goal")

    def test_short_confirmation_refers_to_the_proposed_journey(self):
        _, key = choose_reply(
            self.case, "Proposed journey: page, quote, contract. Does that fit?", set()
        )
        self.assertEqual(key, "journey")

    def test_single_number_selection_is_a_goal_question(self):
        _, key = choose_reply(
            self.case,
            "Which single number should messaging move, and what is it today?",
            set(),
        )
        self.assertEqual(key, "goal")

    def test_percentage_question_supplies_the_known_measure(self):
        _, key = choose_reply(
            self.case, "What percentage of contracts renewed this year?", set()
        )
        self.assertEqual(key, "goal")

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

    def test_capacity_question_does_not_resupply_a_known_volume_as_capacity(self):
        case = {
            **self.case,
            "facts": [
                {
                    "id": "economics",
                    "topics": "number|job",
                    "answer": "100 jobs monthly.",
                }
            ],
        }
        reply, key = choose_reply(
            case,
            "What is the maximum number of jobs you can complete monthly?",
            {"economics"},
        )
        self.assertEqual(key, "unknown")
        self.assertNotIn("100", reply)

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
