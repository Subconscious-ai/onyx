"""Protect evaluation metrics from formatting and unit false positives."""

import io
import json
import tempfile
import unittest
import urllib.error
import urllib.parse
from email.message import Message
from pathlib import Path
from unittest.mock import patch

import eval_interview
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
    def test_scenario_tools_include_only_defaults_and_required_authorized_design(self):
        tools = [
            {"id": 11, "name": "run_python"},
            {"id": 12, "name": "web_search"},
            {"id": 13, "name": "internal_search"},
            {"id": 14, "name": "deep_research"},
            {"id": 15, "name": "get_research_context"},
            {"id": 16, "name": "get_research_sources"},
            {"id": 21, "name": "check_causality"},
            {"id": 22, "name": "generate_attributes_levels"},
            {"id": 23, "name": "generate_dependent_variable"},
            {"id": 24, "name": "create_experiment_draft"},
            {"id": 25, "name": "get_experiment_draft"},
            {"id": 31, "name": "start_experiment"},
            {"id": 32, "name": "delete_project"},
        ]
        turns = [
            Turn(
                "Design",
                tools_required=("check_causality", "generate_attributes_levels"),
            ),
            Turn(
                "Draft",
                tools_required=("create_experiment_draft", "get_experiment_draft"),
            ),
        ]
        self.assertEqual(
            eval_interview.scenario_tool_ids(tools, turns),
            [11, 12, 13, 14, 15, 16, 21, 22, 24, 25],
        )
        self.assertEqual(
            eval_interview.scenario_tool_ids(tools, [Turn("Calculate")]),
            [11, 12, 13, 14, 15, 16],
        )
        self.assertEqual(
            eval_interview.scenario_tool_ids(
                tools, [Turn("Metric", tools_required=("generate_dependent_variable",))]
            ),
            [11, 12, 13, 14, 15, 16, 23],
        )

    def test_scenario_tools_reject_launch_even_when_persona_authorizes_it(self):
        with self.assertRaisesRegex(
            ValueError, "Unsupported scenario tools: start_experiment"
        ):
            eval_interview.scenario_tool_ids(
                [{"id": 31, "name": "start_experiment"}],
                [Turn("Launch", tools_required=("start_experiment",))],
            )

    def test_missing_required_scenario_tool_fails_before_chat_creation(self):
        requested_paths = []

        def open_response(request, **_options):
            path = urllib.parse.urlsplit(request.full_url).path
            requested_paths.append(path)
            responses = {
                "/api/persona/2": {"default_model_configuration_id": 7, "tools": []},
                "/api/llm/provider": {
                    "providers": [
                        {
                            "provider": "bedrock",
                            "model_configurations": [{"id": 7, "name": "fixture"}],
                        }
                    ]
                },
            }
            if path not in responses:
                self.fail(
                    "Missing tool preflight must stop before chat creation: " + path
                )
            return io.StringIO(json.dumps(responses[path]))

        with tempfile.TemporaryDirectory() as directory:
            scenario = Path(directory) / "scenario.json"
            scenario.write_text(
                json.dumps(
                    {
                        "draft": [
                            {
                                "message": "Draft",
                                "tools_required": ["generate_attributes_levels"],
                            }
                        ]
                    }
                )
            )
            with (
                patch(
                    "sys.argv",
                    [
                        "eval_interview",
                        "--cookies",
                        "fixture.cookies",
                        "--agent",
                        "2",
                        "--output",
                        str(Path(directory) / "out.json"),
                        "--scenario-file",
                        str(scenario),
                    ],
                ),
                patch("eval_interview.http.cookiejar.MozillaCookieJar.load"),
                patch(
                    "eval_interview.urllib.request.OpenerDirector.open",
                    side_effect=open_response,
                ),
                self.assertRaisesRegex(
                    ValueError,
                    "Required scenario tools unavailable: generate_attributes_levels",
                ),
            ):
                eval_interview.main()
        self.assertEqual(requested_paths, ["/api/persona/2", "/api/llm/provider"])

    def test_executive_proof_roast_uses_fifth_turn_and_opt_out_reaches_it(self):
        cases = json.loads(
            Path(__file__).with_name("executive-proof-cases.json").read_text()
        )
        turns = cases["correction_unknowns_and_roast"]
        self.assertEqual(len(turns), 5)
        self.assertEqual([turn["jerry"] for turn in turns], [False] * 4 + [True])
        self.assertFalse(turns[4]["questions_allowed"])
        self.assertTrue(turns[4]["prepare_brief"])
        self.assertEqual(len(cases["humor_opt_out"]), 5)
        self.assertFalse(cases["humor_opt_out"][4]["jerry"])

    def test_question_examples_do_not_hide_the_question_topic(self):
        turn = Turn("Thanks", asks_about="channel", brief_required=False)
        self.assertEqual(
            assess(
                turn,
                "Which channel carries the message (e.g., email, TV or radio)?",
                "",
            ),
            [],
        )

    def test_energy_acknowledgement_must_advance_discovery(self):
        cases = json.loads(
            Path(__file__).with_name("energy_progress_cases.json").read_text()
        )
        turn = Turn(**cases["energy_progress"][1])
        self.assertTrue(
            assess(
                turn,
                "Your goal is to raise conversion from 5.5% to 7% within three months.",
                "Which customer segment does the campaign target?",
            )
        )
        self.assertEqual(
            assess(
                turn,
                "What customer action counts as a conversion?",
                "Which customer segment does the campaign target?",
            ),
            [],
        )
        handoff = Turn(**cases["energy_progress"][3])
        self.assertTrue(assess(handoff, 'View "Model Draft 1" in Brief.', ""))
        self.assertEqual(
            assess(
                handoff,
                "The draft connects tariff-page visits to signed contracts. "
                "Traffic remains unknown. Select Open business model when it appears.",
                "",
            ),
            [],
        )

    def test_prototype_cases_detect_declared_unknowns_and_assistant_company_confusion(
        self,
    ):
        cases = json.loads(Path(__file__).with_name("prototype_cases.json").read_text())
        checks = [
            (
                "services",
                "How many discovery meetings happen each quarter?",
                "Meeting volume remains unknown.",
            ),
            (
                "separate_greeting",
                "What is the revenue target for Beca this quarter?",
                "What business objective should the interview address?",
            ),
        ]
        for case, rejected, accepted in checks:
            with self.subTest(case=case):
                turn = Turn(**cases[case][0])
                self.assertTrue(assess(turn, rejected, ""))
                self.assertEqual(assess(turn, accepted, ""), [])

    def test_prototype_scenario_claim_requires_actual_calculation_evidence(self):
        cases = json.loads(Path(__file__).with_name("prototype_cases.json").read_text())
        turn = Turn(**cases["software"][2])
        self.assertTrue(assess_tools(turn, [], "The 12% scenario gives $12,000."))
        self.assertEqual(
            assess_tools(turn, [], "Preview the proposed 12% scenario in Brief."), []
        )
        self.assertEqual(
            assess_tools(
                turn,
                [{"type": "python_tool_delta", "stdout": "12000"}],
                "The 12% scenario gives $12,000.",
            ),
            [],
        )

    def test_background_checkpoint_waits_for_saved_source_without_manual_preparation(
        self,
    ):
        source = [
            {"message_type": "user", "message": "Baseline unknown"},
            {"message_type": "assistant", "message": "Unknown recorded"},
        ]
        brief = {
            "version": 2,
            "objective": {"text": "Goal"},
            "horizon": "",
            "keyResults": [],
            "model": {"inputs": []},
        }
        saved = (
            "Unknown recorded\n<interview-brief>"
            + json.dumps(brief)
            + "</interview-brief>"
        )
        reads = 0

        def api(path, body=None):
            nonlocal reads
            self.assertIsNone(body)
            if path.startswith("/chat/executive-brief?"):
                reads += 1
                return io.StringIO(
                    json.dumps(
                        {"saved": False}
                        if reads == 1
                        else {"saved": True, "message": saved, "message_id": 2}
                    )
                )
            return io.StringIO(
                json.dumps(
                    {
                        "messages": source
                        if reads == 0
                        else [source[0], {**source[1], "message": saved}]
                    }
                )
            )

        with patch("eval_interview.time.sleep"):
            result = checkpoint(
                api,
                "synthetic",
                Turn("Baseline unknown", background_brief=True),
                ["Baseline unknown"],
            )
        self.assertEqual(result["failures"], [])
        self.assertEqual(reads, 2)

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

    def test_evaluation_requires_aws_billing_not_a_particular_model_vendor(self):
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
            {
                "provider": "anthropic",
                "model_configurations": [{"id": 5, "name": "claude-sonnet"}],
            },
        ]
        self.assertEqual(allowed_bedrock_models(providers), {1, 2})

    def test_failed_preparation_preserves_a_failure_receipt_and_checks_storage(self):
        source = {
            "messages": [
                {"message_type": "user", "message": "Baseline unknown"},
                {"message_type": "assistant", "message": "Unknown recorded"},
            ]
        }

        def api(path, _body=None):
            if path.endswith("executive-brief"):
                raise urllib.error.HTTPError(
                    path, 502, "Provider error", Message(), None
                )
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

    def test_derived_rate_preserves_unknown_baseline_without_duplicate_input(self):
        brief = {
            "keyResults": [
                {
                    "metric": "Renewal rate",
                    "target": {"text": "95 percent"},
                    "baseline": {
                        "status": "unknown",
                        "text": "Current renewal rate is unknown",
                    },
                }
            ],
            "model": {
                "inputs": [
                    {
                        "name": "Budget approvals",
                        "value": {"status": "unknown", "text": "Unknown"},
                    }
                ]
            },
        }
        before = [
            {"type": "user", "message": "Renewal baseline is unknown."},
            {"type": "assistant", "message": "Noted."},
        ]

        def check():
            text = (
                "Noted.\n<interview-brief>" + json.dumps(brief) + "</interview-brief>"
            )
            return assess_prepared(
                Turn("Prepare", unknown_inputs=("renewal",)),
                before,
                [before[0], {"type": "assistant", "message": text}],
                {"saved": True, "message": text},
            )

        self.assertEqual(
            check(),
            [],
            "A computed rate retains uncertainty in the matching OKR baseline",
        )
        brief["model"]["inputs"].append(
            {"name": "Renewal rate", "value": {"status": "executive", "text": "0.8"}}
        )
        self.assertTrue(
            check(), "An unknown OKR cannot conceal a fabricated operating input"
        )
        brief["model"]["inputs"].pop()
        brief["keyResults"][0]["baseline"] = {"status": "executive", "text": "0.8"}
        self.assertTrue(
            check(),
            "A fabricated baseline still fails when the model has no rate input",
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
