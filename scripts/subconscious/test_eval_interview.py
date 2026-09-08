"""Protect evaluation metrics from formatting and unit false positives."""

import unittest

from eval_interview import Turn, assess, assess_tools


class EvaluationChecks(unittest.TestCase):
    def test_unknown_cells_and_source_queries_are_not_questions(self):
        answer = (
            "| Actual renewal | ? |\n"
            "| Actual price | ? |\n"
            "[Reference](https://example.com/report?year=2026)\n"
            "Which decision matters?"
        )
        self.assertNotIn(
            "Multiple questions create interview homework",
            assess(Turn("Draft a model"), answer, ""),
        )

    def test_two_executive_questions_still_fail(self):
        self.assertIn(
            "Multiple questions create interview homework",
            assess(Turn("Draft a model"), "Which market? What target?", ""),
        )

    def test_probability_output_remains_in_fraction_units(self):
        packets = [{"type": "python_tool_delta", "stdout": "required_rate: 0.8"}]
        self.assertEqual(
            assess_tools(Turn("Calculate renewal", expected_numbers=(0.8,)), packets),
            [],
        )
        self.assertTrue(
            assess_tools(Turn("Calculate renewal", expected_numbers=(0.08,)), packets)
        )


if __name__ == "__main__":
    unittest.main()
