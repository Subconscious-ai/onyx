"""A missing working company requires the existing native profile tool once per loop."""

import ast
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from onyx.server.query_and_chat.burn2 import requested_tool as tool_selection
from onyx.server.query_and_chat.burn2.requested_tool import initial_profile_tool


class ProfileTool:
    def __init__(self, tool_id):
        self.id = tool_id


class InitialProfileToolTest(unittest.TestCase):
    def setUp(self):
        self.read_profile = Mock(return_value={"profile": {}})
        profile_db = ModuleType("onyx.db.burn2_profile")
        profile_db.read_profile = self.read_profile
        profile_tool = ModuleType(
            "onyx.tools.tool_implementations.company_profile.company_profile_tool"
        )
        profile_tool.CompanyProfileTool = ProfileTool
        self.modules = patch.dict(
            sys.modules,
            {profile_db.__name__: profile_db, profile_tool.__name__: profile_tool},
        )
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.profile_tool = ProfileTool(937)
        self.other_tool = SimpleNamespace(id=6, name="run_python")
        self.arguments = dict(
            enabled=True,
            persona_name="Burn 2.0",
            user_id=uuid4(),
            incognito=False,
            tools=[self.other_tool, self.profile_tool],
            forced_tool_id=None,
        )

    def test_missing_company_requires_actual_assigned_tool_without_mutating_tools(self):
        before = list(self.arguments["tools"])
        self.assertEqual(initial_profile_tool(**self.arguments), 937)
        self.read_profile.assert_called_once_with(self.arguments["user_id"])
        self.assertEqual(self.arguments["tools"], before)

    def test_current_interview_name_starts_required_profile_tool(self):
        self.arguments["persona_name"] = "Executive interview"
        self.assertEqual(initial_profile_tool(**self.arguments), 937)

    def test_current_interview_enters_native_context_and_preparation_gates(self):
        path = (
            Path(tool_selection.__file__).resolve().parents[3]
            / "chat/process_message.py"
        )
        gates = [
            node
            for node in ast.walk(ast.parse(path.read_text()))
            if isinstance(node, ast.Compare)
            and isinstance(node.left, ast.Attribute)
            and node.left.attr == "name"
            and "persona" in ast.unparse(node.left)
            and "Burn 2.0" in ast.unparse(node)
        ]
        self.assertEqual(len(gates), 5)
        for node in gates:
            predicate = compile(ast.Expression(body=node), str(path), "eval")
            for name, expected in [
                ("Executive interview", True),
                ("Burn 2.0", True),
                ("Other agent", False),
            ]:
                persona = SimpleNamespace(name=name)
                self.assertEqual(
                    eval(  # noqa: S307 - evaluate repository-owned persona gate only
                        predicate,
                        {},
                        {"persona": persona, "setup": SimpleNamespace(persona=persona)},
                    ),
                    expected,
                    ast.unparse(node),
                )

    def test_existing_company_keeps_native_auto_selection(self):
        self.read_profile.return_value = {"profile": {"company": "Actual company"}}
        self.assertIsNone(initial_profile_tool(**self.arguments))

    def test_whitespace_company_is_missing(self):
        self.read_profile.return_value = {"profile": {"company": "  "}}
        self.assertEqual(initial_profile_tool(**self.arguments), 937)

    def test_exclusions_do_not_read_private_profile(self):
        cases = [
            {"enabled": False},
            {"persona_name": "Other agent"},
            {"user_id": None},
            {"incognito": True},
            {"forced_tool_id": 6},
            {"tools": []},
            {"tools": [SimpleNamespace(id=937, name="company_profile")]},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                args = {**self.arguments, **changes}
                self.assertEqual(initial_profile_tool(**args), args["forced_tool_id"])
                self.read_profile.assert_not_called()

    def test_native_required_selection_restores_all_tools_after_first_cycle(self):
        path = Path(tool_selection.__file__).resolve().parents[3] / "chat/llm_loop.py"
        selection = next(
            node
            for node in ast.walk(ast.parse(path.read_text()))
            if isinstance(node, ast.If)
            and isinstance(node.test, ast.Name)
            and node.test.id == "forced_tool_id"
        )
        code = compile(ast.Module(body=[selection], type_ignores=[]), str(path), "exec")
        tools = self.arguments["tools"]
        scope = {
            "tools": tools,
            "forced_tool_id": initial_profile_tool(**self.arguments),
            "out_of_cycles": False,
            "ran_image_gen": False,
            "ToolChoiceOptions": SimpleNamespace(REQUIRED="required", AUTO="auto"),
        }
        exec(code, scope)  # noqa: S102 - execute only the checked-in native selection branch
        self.assertEqual(scope["tool_choice"], "required")
        self.assertEqual(scope["final_tools"], [self.profile_tool])
        self.assertIsNone(scope["forced_tool_id"])
        exec(code, scope)  # noqa: S102 - execute only the checked-in native selection branch
        self.assertEqual(scope["tool_choice"], "auto")
        self.assertEqual(scope["final_tools"], tools)


if __name__ == "__main__":
    unittest.main()
