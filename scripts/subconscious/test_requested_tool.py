"""Explicit executive tool requests use native Onyx forcing without another model call."""

import unittest

from onyx.server.query_and_chat.burn2.requested_tool import requested_tool


class RequestedToolTest(unittest.TestCase):
    def test_routes_explicit_requests_to_enabled_native_tools(self):
        tools = {"deep_research": 29, "run_python": 6}
        self.assertEqual(
            requested_tool("Use GPT Researcher for public context.", tools), 29
        )
        self.assertEqual(
            requested_tool("Scenario only. Use Python to calculate revenue.", tools), 6
        )

    def test_preserves_denials_disabled_tools_and_ordinary_followups(self):
        tools = {"deep_research": 29, "run_python": 6}
        for message in [
            "Do not use Python.",
            "Don't use GPT Researcher.",
            "The baseline is unknown.",
        ]:
            self.assertIsNone(requested_tool(message, tools))
        self.assertIsNone(requested_tool("Use Python to calculate revenue.", {}))


if __name__ == "__main__":
    unittest.main()
