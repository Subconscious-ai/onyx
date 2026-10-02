import tempfile
import unittest
from pathlib import Path

from interviewer_comparison import (
    Budget,
    BudgetExceeded,
    NativeOnyx,
    generation_completed,
    human_seconds,
    reveal,
)


class NativeConfigurationTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_stored_turn_instruction_must_match_the_frozen_candidate(self):
        moderator = object.__new__(NativeOnyx)

        async def persona_read(_method, _path, _body=None):
            return {
                "system_prompt": "Prepared interview",
                "task_prompt": "Generic chat",
                "tools": [],
                "name": "Burn 2.0 Nova QA",
                "default_model_configuration_id": 19,
            }

        moderator.api = persona_read
        with self.assertRaises(ValueError):
            await moderator.configure(
                {
                    "native_persona_id": 9,
                    "instructions": "Prepared interview",
                    "task_prompt": "Model consequence then stop",
                }
            )

    async def test_burn_assessment_keeps_the_personas_native_research_tools(self):
        # The adapter must not silently reduce a prepared consultant to a calculator.
        moderator = object.__new__(NativeOnyx)

        async def persona_read(_method, _path, _body=None):
            return {
                "system_prompt": "Prepared interview",
                "name": "Burn 2.0 Nova QA",
                "tools": [{"id": 6}, {"id": 51}, {"id": 29}],
                "default_model_configuration_id": 19,
            }

        moderator.api = persona_read
        await moderator.configure(
            {"native_persona_id": 9, "instructions": "Prepared interview"}
        )
        self.assertEqual(moderator.tool_ids, [6, 51, 29])
        self.assertTrue(moderator.burn_brief_enabled)
        self.assertEqual(moderator.model_configuration_id, 19)

    async def test_saved_brief_requires_a_native_readback_not_a_spoken_promise(self):
        moderator = object.__new__(NativeOnyx)
        moderator.chat_id = "existing-qa-chat"
        moderator.burn_brief_enabled = True

        async def saved_read(_method, path, _body=None):
            if "executive-brief" in path:
                return {
                    "saved": True,
                    "message": 'Commentary.<interview-brief>{"company":"Example"}</interview-brief>',
                    "message_id": 123,
                }
            return {"messages": [{"message": "I saved the model."}]}

        moderator.api = saved_read
        retained = await moderator.retained()
        self.assertTrue(retained["native_brief_saved"])
        self.assertEqual(retained["brief"], {"company": "Example"})
        self.assertFalse(retained["saved_business_model"])


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

    def test_final_synthesis_is_read_without_another_typing_or_reflection_charge(self):
        self.assertEqual(human_seconds("This is four words.", None), 1)
        self.assertEqual(human_seconds("This is four words.", "Two words"), 5)

    def test_ready_preamble_is_not_a_finished_interview_turn(self):
        event = {"kind": "status", "data": {"status": "ready", "data": {}}}
        self.assertFalse(generation_completed(event))
        event["data"]["data"]["stage"] = "completed"
        self.assertTrue(generation_completed(event))


if __name__ == "__main__":
    unittest.main()
