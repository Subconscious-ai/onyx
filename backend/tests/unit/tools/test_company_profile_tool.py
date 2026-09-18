"""Native tool boundary checks; storage is mocked, no personal profiles are changed."""

import os
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from onyx.server.query_and_chat.placement import Placement
from onyx.tools.models import ToolCallException
from onyx.tools.tool_implementations.company_profile.company_profile_tool import (
    CompanyProfileTool,
)


class CompanyProfileToolTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"BURN2_ENABLED": "true"})
        environment.start()
        self.addCleanup(environment.stop)
        self.owner = uuid4()
        self.tool = CompanyProfileTool(
            tool_id=123, user_id=self.owner, emitter=MagicMock()
        )
        self.placement = Placement(turn_index=0)

    def test_update_uses_constructor_identity_and_returns_actual_revision(self):
        with (
            patch(
                "onyx.db.burn2_profile.correct_profile",
                return_value={"correction": {"revision": 3}},
            ) as save,
            patch(
                "onyx.chat.incognito.current_turn_persists_content", return_value=True
            ),
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research",
                return_value={"status": "queued"},
            ),
        ):
            result = self.tool.run(
                self.placement,
                None,
                operation="update",
                revision=2,
                fields={"company": "Synthetic"},
            )
        self.assertEqual(save.call_args.args[0], self.owner)
        self.assertEqual(save.call_args.args[1].revision, 2)
        self.assertIn('"revision": 3', result.llm_facing_response)

    def test_no_identity_override_or_incognito_write(self):
        with (
            patch("onyx.db.burn2_profile.correct_profile") as save,
            patch(
                "onyx.chat.incognito.current_turn_persists_content", return_value=False
            ),
        ):
            for arguments in (
                {
                    "operation": "update",
                    "revision": 0,
                    "fields": {"company": "Synthetic"},
                },
                {"operation": "read", "user_id": str(uuid4())},
            ):
                with (
                    self.subTest(arguments=list(arguments)),
                    self.assertRaises(ToolCallException),
                ):
                    self.tool.run(self.placement, None, **arguments)
            save.assert_not_called()

    def test_read_uses_authenticated_owner(self):
        with patch(
            "onyx.db.burn2_profile.read_profile",
            return_value={"correction": {"revision": 7}},
        ) as read:
            result = self.tool.run(self.placement, None, operation="read")
        read.assert_called_once_with(self.owner)
        self.assertIn('"revision": 7', result.llm_facing_response)

    def test_full_history_incognito_cannot_save_profile(self):
        with (
            patch(
                "shared_configs.contextvars.get_current_incognito_record_mode",
                return_value="full_history",
            ),
            patch("onyx.db.burn2_profile.correct_profile") as save,
        ):
            with self.assertRaises(ToolCallException):
                self.tool.run(
                    self.placement,
                    None,
                    operation="update",
                    revision=0,
                    fields={"company": "Synthetic"},
                )
        save.assert_not_called()

    def test_saved_correction_is_reported_when_research_is_unavailable(self):
        with (
            patch(
                "onyx.db.burn2_profile.correct_profile",
                return_value={"correction": {"revision": 3}},
            ),
            patch(
                "onyx.chat.incognito.current_turn_persists_content", return_value=True
            ),
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research",
                side_effect=ConnectionError("synthetic cache outage"),
            ),
        ):
            result = self.tool.run(
                self.placement,
                None,
                operation="update",
                revision=2,
                fields={"company": "Synthetic"},
            )
        self.assertIn('"revision": 3', result.llm_facing_response)
        self.assertIn('"unavailable"', result.llm_facing_response)

    def test_conflict_does_not_report_success_or_start_research(self):
        with (
            patch(
                "onyx.db.burn2_profile.correct_profile",
                side_effect=ValueError("Profile changed. Reload before saving."),
            ),
            patch(
                "onyx.chat.incognito.current_turn_persists_content", return_value=True
            ),
            patch(
                "onyx.server.query_and_chat.burn2.background.ensure_research"
            ) as research,
        ):
            with self.assertRaises(ToolCallException):
                self.tool.run(
                    self.placement,
                    None,
                    operation="update",
                    revision=2,
                    fields={"company": "Synthetic"},
                )
        research.assert_not_called()
        self.tool.emitter.emit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
