"""Protect evaluation metrics from formatting and unit false positives."""

import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

from eval_interview import (
    Turn,
    allowed_bedrock_models,
    assess,
    assess_prepared,
    assess_tools,
    checkpoint,
    write_private_json,
)


class EvaluationChecks(unittest.TestCase):
    def test_saved_brief_must_preserve_explicit_behavior_before_model_handoff(self):
        turn = Turn("Prepare", sourced_journey_required=True)
        brief = {
            "keyResults": [],
            "journey": [],
            "transitions": [],
            "model": {"inputs": []},
        }

        def check():
            text = (
                "Known.\n<interview-brief>" + json.dumps(brief) + "</interview-brief>"
            )
            before = [
                {"type": "user", "message": "Managers schedule then renew."},
                {"type": "assistant", "message": "Known."},
            ]
            return assess_prepared(
                turn,
                before,
                [before[0], {"type": "assistant", "message": text}],
                {"saved": True, "message": text},
            )

        self.assertIn(
            "Explicit customer behavior missing from the sourced journey", check()
        )
        brief["journey"] = [
            {"id": "schedule", "status": "executive"},
            {"id": "renew", "status": "executive"},
        ]
        brief["transitions"] = [
            {"from": "schedule", "to": "renew", "behavior": {"status": "assumption"}}
        ]
        self.assertTrue(
            check(), "An inferred link cannot substitute for a stated transition"
        )
        brief["transitions"][0]["behavior"]["status"] = "executive"
        self.assertEqual(check(), [])

    def test_rhetorical_roast_does_not_count_as_executive_homework(self):
        turn = Turn(
            "No questions.", brief_required=False, questions_allowed=False, jerry=True
        )
        self.assertEqual(
            assess(
                turn,
                "Jerry: An unstoppable machine? The spreadsheet still needs batteries.\nUnknown inputs remain unknown.",
                "",
            ),
            [],
        )
        self.assertIn(
            "Repeated uncertainty needs a useful synthesis before more questions",
            assess(
                turn,
                "Jerry: An unstoppable machine? The spreadsheet still needs batteries.\nWhat is the baseline?",
                "",
            ),
        )

    def test_evaluation_never_selects_anthropic_even_through_bedrock(self):
        providers = [
            {
                "provider": "bedrock",
                "model_configurations": [
                    {"id": 1, "name": "openai.gpt-oss-120b-1:0"},
                    {"id": 2, "name": "anthropic.claude-sonnet"},
                    {"id": 3, "name": ""},
                ],
            },
            {
                "provider": "openai",
                "model_configurations": [{"id": 4, "name": "gpt-4"}],
            },
        ]
        self.assertEqual(allowed_bedrock_models(providers), {1})

    def test_failed_preparation_preserves_a_failure_receipt_and_checks_storage(self):
        source = {
            "messages": [
                {"message_type": "user", "message": "Baseline unknown"},
                {"message_type": "assistant", "message": "Unknown recorded"},
            ]
        }

        def api(path, _body=None):
            if path.endswith("executive-brief"):
                raise urllib.error.HTTPError(path, 502, "Provider error", {}, None)
            return io.StringIO(json.dumps(source))

        result = checkpoint(api, "fixture", Turn("Prepare"), ["Baseline unknown"])
        self.assertEqual(result["failures"], ["Preparation failed: HTTP 502"])
        self.assertTrue(result["failure_preserved_transcript"])
        self.assertNotIn("handoff", result)

    def test_private_run_artifacts_are_not_world_readable_or_silently_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "run.json"
            write_private_json(path, {"synthetic": True}, exclusive=True)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                write_private_json(path, {"replacement": True}, exclusive=True)

    def test_jerry_must_arrive_on_the_scheduled_turn_only(self):
        turn = Turn("A magnificent plan.", brief_required=False, jerry=True)
        self.assertTrue(assess(turn, "The plan is noted.", ""))
        self.assertEqual(
            assess(
                turn,
                "Jerry: The spreadsheet runs on applause.\nThe target is noted.",
                "",
            ),
            [],
        )
        self.assertTrue(
            assess(
                Turn("Continue", brief_required=False, jerry=False),
                "Jerry: Another joke.",
                "",
            )
        )

    def test_saved_response_not_http_success_proves_memory(self):
        brief = {
            "keyResults": [
                {"target": {"text": "95 percent"}, "baseline": {"status": "unknown"}}
            ],
            "model": {
                "inputs": [
                    {
                        "name": "Current renewal rate",
                        "value": {"status": "unknown", "text": "Unknown"},
                    }
                ]
            },
        }
        text = (
            "Target corrected.\n<interview-brief>"
            + json.dumps(brief)
            + "</interview-brief>"
        )
        before = [
            {
                "type": "user",
                "message": "Correction: target 95 percent; current rate unknown.",
            },
            {"type": "assistant", "message": "Target corrected."},
        ]
        after = [before[0], {"type": "assistant", "message": text}]
        prepared = {"saved": True, "message": text}
        turn = Turn("Prepare", target_requires="95", unknown_inputs=("renewal",))
        self.assertEqual(assess_prepared(turn, before, after, prepared), [])
        self.assertTrue(
            assess_prepared(turn, before, before, prepared),
            "HTTP success without saved metadata must fail",
        )
        self.assertTrue(
            assess_prepared(turn, before, after, {**prepared, "saved": False})
        )
        changed = [{**before[0], "message": "Rewritten evidence"}, after[1]]
        self.assertTrue(assess_prepared(turn, before, changed, prepared))
        self.assertTrue(
            assess_prepared(
                Turn("Prepare", target_requires="90"), before, after, prepared
            ),
            "A stale target must fail",
        )
        self.assertTrue(
            assess_prepared(
                Turn("Prepare", unknown_inputs=("eligible customers",)),
                before,
                after,
                prepared,
            ),
            "Omitted unknown inputs must fail",
        )

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

    def test_native_internal_search_receipt_is_not_a_missing_tool(self):
        self.assertEqual(
            assess_tools(
                Turn("Find a case", tools_required=("internal_search",)),
                [{"type": "search_tool_start", "is_internet_search": False}],
            ),
            [],
        )
        self.assertTrue(
            assess_tools(
                Turn("Find a case", tools_required=("internal_search",)),
                [{"type": "search_tool_start", "is_internet_search": True}],
            )
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
