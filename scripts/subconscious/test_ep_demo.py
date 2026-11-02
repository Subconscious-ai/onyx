"""The demo harness reads Onyx's non-streaming reply the way Onyx writes it."""

from ep_demo import parse_turn


def test_tool_calls_and_images_are_read_from_a_full_response() -> None:
    body = {
        "answer": "Here is the distribution.",
        "tool_calls": [
            {
                "tool_name": "mcp_ep_plot_distribution",
                "tool_arguments": {"name": "r", "column": "clarity"},
                "tool_result": '{"tool_result": "![Analysis chart](/api/chat/file/0123456789abcdef0123)\\n{...}"}',
            }
        ],
        "top_documents": [],
        "message_id": 7,
    }

    turn = parse_turn("Draw it", body)

    assert turn.answer == "Here is the distribution."
    assert [t["tool_name"] for t in turn.tools] == ["mcp_ep_plot_distribution"]
    assert turn.images == ["0123456789abcdef0123"]


def test_a_reply_without_tools_or_images_is_fine() -> None:
    turn = parse_turn("Hi", {"answer": "Hello.", "message_id": 1})

    assert turn.answer == "Hello."
    assert turn.tools == [] and turn.images == []
