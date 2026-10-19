from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from onyx.chat import process_message
from onyx.chat.process_message import (
    _resolve_query_processing_hook_result,
    remove_answer_citations,
)
from onyx.configs.constants import MessageType
from onyx.db.models import ChatMessage, ChatSession, Persona, User
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.hooks.executor import HookSkipped, HookSoftFailed
from onyx.hooks.points.query_processing import QueryProcessingResponse
from onyx.server.query_and_chat.causl.models import (
    CauslActor,
    CauslChatBinding,
    CauslSelection,
)
from onyx.server.query_and_chat.models import SendMessageRequest


def test_remove_answer_citations_strips_http_markdown_citation() -> None:
    answer = "The answer is Paris [[1]](https://example.com/doc)."

    assert remove_answer_citations(answer) == "The answer is Paris."


def test_remove_answer_citations_strips_empty_markdown_citation() -> None:
    answer = "The answer is Paris [[1]]()."

    assert remove_answer_citations(answer) == "The answer is Paris."


def test_remove_answer_citations_strips_citation_with_parentheses_in_url() -> None:
    answer = (
        "The answer is Paris "
        "[[1]](https://en.wikipedia.org/wiki/Function_(mathematics))."
    )

    assert remove_answer_citations(answer) == "The answer is Paris."


def test_remove_answer_citations_preserves_non_citation_markdown_links() -> None:
    answer = (
        "See [reference](https://example.com/Function_(mathematics)) "
        "for context [[1]](https://en.wikipedia.org/wiki/Function_(mathematics))."
    )

    assert (
        remove_answer_citations(answer)
        == "See [reference](https://example.com/Function_(mathematics)) for context."
    )


# ---------------------------------------------------------------------------
# Query Processing hook response handling (_resolve_query_processing_hook_result)
# ---------------------------------------------------------------------------


def test_hook_skipped_leaves_message_text_unchanged() -> None:
    result = _resolve_query_processing_hook_result(HookSkipped(), "original query")
    assert result == "original query"


def test_hook_soft_failed_leaves_message_text_unchanged() -> None:
    result = _resolve_query_processing_hook_result(HookSoftFailed(), "original query")
    assert result == "original query"


def test_null_query_raises_query_rejected() -> None:
    with pytest.raises(OnyxError) as exc_info:
        _resolve_query_processing_hook_result(
            QueryProcessingResponse(query=None), "original query"
        )
    assert exc_info.value.error_code is OnyxErrorCode.QUERY_REJECTED


def test_empty_string_query_raises_query_rejected() -> None:
    """Empty string is falsy — must be treated as rejection, same as None."""
    with pytest.raises(OnyxError) as exc_info:
        _resolve_query_processing_hook_result(
            QueryProcessingResponse(query=""), "original query"
        )
    assert exc_info.value.error_code is OnyxErrorCode.QUERY_REJECTED


def test_whitespace_only_query_raises_query_rejected() -> None:
    """Whitespace-only string is truthy but meaningless — must be treated as rejection."""
    with pytest.raises(OnyxError) as exc_info:
        _resolve_query_processing_hook_result(
            QueryProcessingResponse(query="   "), "original query"
        )
    assert exc_info.value.error_code is OnyxErrorCode.QUERY_REJECTED


def test_absent_query_field_raises_query_rejected() -> None:
    """query defaults to None when not provided."""
    with pytest.raises(OnyxError) as exc_info:
        _resolve_query_processing_hook_result(
            QueryProcessingResponse(), "original query"
        )
    assert exc_info.value.error_code is OnyxErrorCode.QUERY_REJECTED


def test_rejection_message_surfaced_in_error_when_provided() -> None:
    with pytest.raises(OnyxError) as exc_info:
        _resolve_query_processing_hook_result(
            QueryProcessingResponse(
                query=None, rejection_message="Queries about X are not allowed."
            ),
            "original query",
        )
    assert "Queries about X are not allowed." in str(exc_info.value)


def test_fallback_rejection_message_when_none() -> None:
    """No rejection_message → generic fallback used in OnyxError detail."""
    with pytest.raises(OnyxError) as exc_info:
        _resolve_query_processing_hook_result(
            QueryProcessingResponse(query=None, rejection_message=None),
            "original query",
        )
    assert "No rejection reason was provided." in str(exc_info.value)


def test_nonempty_query_rewrites_message_text() -> None:
    result = _resolve_query_processing_hook_result(
        QueryProcessingResponse(query="rewritten query"), "original query"
    )
    assert result == "rewritten query"


@pytest.mark.parametrize("workspace_bound", [True, False])
@pytest.mark.parametrize("hook_query", ["Our product supports SSO.", None])
def test_native_message_storage_keeps_executive_words_when_a_hook_adds_a_claim(
    monkeypatch: pytest.MonkeyPatch, workspace_bound: bool, hook_query: str | None
) -> None:
    user = User(id=uuid4(), email="alice@example.test")
    persona = Persona(id=11, name="Business workspace")
    chat = ChatSession(
        id=uuid4(), user_id=user.id, persona=persona, incognito_record_mode=None
    )
    binding = CauslChatBinding(
        user_id=user.id,
        actor=CauslActor(org_id="org_b", user_id="auth0|alice"),
        issuer="https://auth.example/",
        market_id="market_b",
        chat_id=chat.id,
        selection=CauslSelection(page="library", market_id="market_b"),
        library_server_id=22,
    )
    monkeypatch.setattr(process_message, "get_current_tenant_id", lambda: "public")
    monkeypatch.setattr(
        process_message, "get_chat_session_by_id", lambda **_kwargs: chat
    )
    monkeypatch.setattr(
        process_message,
        "workspace_turn",
        lambda *_args, **_kwargs: (binding if workspace_bound else None, "{}"),
    )
    monkeypatch.setattr(process_message, "mt_cloud_telemetry", lambda **_kwargs: None)
    monkeypatch.setattr(
        process_message, "get_llm_for_persona", lambda **_kwargs: MagicMock()
    )
    monkeypatch.setattr(
        process_message, "check_llm_cost_limit_for_provider", lambda **_kwargs: None
    )
    monkeypatch.setattr(
        process_message, "get_llm_token_counter", lambda *_args: MagicMock()
    )
    monkeypatch.setattr(
        process_message, "_build_model_display_name", lambda *_args: "Mock model"
    )
    monkeypatch.setattr(process_message, "verify_user_files", lambda **_kwargs: None)
    monkeypatch.setattr(
        process_message, "create_chat_history_chain", lambda **_kwargs: []
    )
    monkeypatch.setattr(
        process_message,
        "get_or_create_root_message",
        lambda **_kwargs: ChatMessage(id=1, message_type=MessageType.SYSTEM),
    )
    hook = MagicMock(return_value=QueryProcessingResponse(query=hook_query))
    monkeypatch.setattr(process_message, "execute_hook", hook)
    monkeypatch.setattr(process_message, "get_tokenizer", lambda *_args: MagicMock())
    save = MagicMock(side_effect=RuntimeError("stop after message capture"))
    monkeypatch.setattr(process_message, "create_new_chat_message", save)
    request = SendMessageRequest(
        chat_session_id=chat.id, message="Please read our product record."
    )
    if hook_query is None:
        with pytest.raises(OnyxError) as error:
            next(
                process_message.build_chat_turn(
                    request, user, MagicMock(), llm_overrides=None
                )
            )
        assert error.value.error_code is OnyxErrorCode.QUERY_REJECTED
        hook.assert_called_once()
        save.assert_not_called()
        return
    with pytest.raises(RuntimeError, match="stop after message capture"):
        next(
            process_message.build_chat_turn(
                request, user, MagicMock(), llm_overrides=None
            )
        )
    hook.assert_called_once()
    expected = (
        "Please read our product record."
        if workspace_bound
        else "Our product supports SSO."
    )
    assert save.call_args.kwargs["message"] == expected
