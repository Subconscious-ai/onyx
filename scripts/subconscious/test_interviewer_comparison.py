import tempfile
import unittest
from pathlib import Path

from interviewer_comparison import (
    Budget,
    BudgetExceeded,
    generation_completed,
    human_seconds,
    reveal,
)


class ComparisonBoundaryTests(unittest.TestCase):
    def test_budget_is_shared_across_platforms_and_restarts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            Budget(path).reserve("customer", "onyx", 12)
            Budget(path).reserve("customer", "parlant", 7)
            with self.assertRaises(BudgetExceeded):
                Budget(path).reserve("customer", "elevenlabs", 2)
            self.assertEqual(Budget(path).total("customer"), 19)

    def test_unknown_or_unasked_facts_do_not_rescue_the_interviewer(self):
        case = {"facts": [{"id": "goal", "answer": "Increase retention."}]}
        self.assertEqual(reveal(case, [], set())[0], "Thanks.")
        self.assertIn("don't know", reveal(case, ["invented"], set())[0])
        reply, repeated = reveal(case, ["goal"], {"goal"})
        self.assertIn("already", reply)
        self.assertEqual(repeated, ["goal"])

    def test_global_comparison_cap_cannot_be_reset_with_a_new_customer(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            for number in range(12):
                Budget(path).reserve(str(number), "all-components", 20)
            with self.assertRaises(BudgetExceeded):
                Budget(path).reserve("another-customer", "inference", 0.01)
            self.assertEqual(Budget(path).total(), 240)

    def test_human_time_cannot_disappear_from_the_clock(self):
        self.assertGreater(human_seconds("A question?", "An answer."), 0)
        self.assertGreater(human_seconds("word " * 100, "word " * 100), 40)

    def test_ready_preamble_is_not_a_finished_interview_turn(self):
        event = {"kind": "status", "data": {"status": "ready", "data": {}}}
        self.assertFalse(generation_completed(event))
        event["data"]["data"]["stage"] = "completed"
        self.assertTrue(generation_completed(event))


if __name__ == "__main__":
    unittest.main()
