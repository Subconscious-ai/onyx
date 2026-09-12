"""Run with native backend dependencies; model review must preserve source and tool evidence."""

import unittest

from onyx.chat.models import ChatMessageSimple, ToolCallSimple
from onyx.configs.constants import MessageType
from onyx.server.query_and_chat.burn2.profile import project_chat_history


class ModelHistoryTests(unittest.TestCase):
    def test_incognito_replacement_cannot_hide_history_without_model_receipt(self):
        source = ChatMessageSimple(
            message="Try a scenario.", token_count=4, message_type=MessageType.USER
        )
        narration = ChatMessageSimple(
            message="Saved conversation context.",
            token_count=4,
            message_type=MessageType.ASSISTANT,
        )
        projected = project_chat_history(
            [narration, source],
            len,
            model_context='{"contextType":"saved-business-model/v1"}',
        )
        self.assertIs(projected[0], narration)

    def test_final_history_cannot_reintroduce_prediction_summaries(self):
        source = ChatMessageSimple(
            message="Target $15,000; baseline $10,000.",
            token_count=8,
            message_type=MessageType.USER,
        )
        narration = ChatMessageSimple(
            message="An old preview gives $12,000.",
            token_count=7,
            message_type=MessageType.ASSISTANT,
        )
        summary = narration.model_copy(
            update={"message": "Conversation summary: projected result is $12,000."}
        )
        call = ChatMessageSimple(
            message="Compute the requested result.",
            token_count=15,
            message_type=MessageType.ASSISTANT,
            tool_calls=[
                ToolCallSimple(
                    tool_call_id="calculation",
                    tool_name="run_python",
                    tool_arguments={"code": "print(1000 * .12 * 100)"},
                    token_count=8,
                )
            ],
        )
        result = ChatMessageSimple(
            message="12000",
            token_count=1,
            message_type=MessageType.TOOL_CALL_RESPONSE,
            tool_call_id="calculation",
        )
        receipt = ChatMessageSimple(
            message='Model context: {"contextType":"saved-business-model/v1"}',
            token_count=10,
            message_type=MessageType.USER,
        )
        original = [summary, source, narration, call, result, receipt]
        before = [message.model_dump() for message in original]
        projected = project_chat_history(
            original,
            len,
            model_context='{"contextType":"saved-business-model/v1"}',
            summary=summary,
        )
        self.assertNotIn("12,000", projected[0].message)
        self.assertNotIn("12,000", projected[2].message)
        self.assertEqual(projected[0].token_count, len(projected[0].message))
        self.assertEqual(projected[2].token_count, len(projected[2].message))
        for index in (1, 3, 4, 5):
            self.assertIs(projected[index], original[index])
        self.assertEqual([message.model_dump() for message in original], before)

    def test_interview_history_keeps_summary_and_questions_without_brief_metadata(self):
        summary = ChatMessageSimple(
            message="Executive facts and source context.",
            token_count=6,
            message_type=MessageType.ASSISTANT,
        )
        question = ChatMessageSimple(
            message='Which objective matters?\n<interview-brief>{"draft":true}</interview-brief>',
            token_count=20,
            message_type=MessageType.ASSISTANT,
        )
        projected = project_chat_history(
            [summary, question], len, model_context=None, summary=summary
        )
        self.assertIs(projected[0], summary)
        self.assertEqual(projected[1].message, "Which objective matters?")
        self.assertIn("interview-brief", question.message)


if __name__ == "__main__":
    unittest.main()
