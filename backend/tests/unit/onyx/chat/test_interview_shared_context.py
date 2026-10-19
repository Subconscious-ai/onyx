"""Bound interviews retain preparation while workspace chats exclude private context."""

import time
from typing import Literal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from onyx.chat import process_message
from onyx.chat.chat_state import ChatTurnSetup
from onyx.chat.models import ChatHistoryResult
from onyx.configs.constants import MessageType
from onyx.db import burn2_profile, burn2_research
from onyx.db.models import ChatMessage, ChatSession, Persona, User
from onyx.hooks.executor import HookSkipped
from onyx.server.query_and_chat.burn2.research import public_research_query
from onyx.server.query_and_chat.causl.models import (
    CauslActor,
    CauslChatBinding,
    CauslSelection,
)
from onyx.server.query_and_chat.models import SendMessageRequest


@pytest.mark.parametrize("mode", ["interview", "workspace"])
@pytest.mark.parametrize(
    "message",
    [
        "Raise conversion to 7% in three months.",
        "Show me ten useful facts saved in our Library about products, study capabilities and Enterprise process.",
        "What facts are saved in our Library about Enterprise?",
        "Our goal is to give executives ten saved facts in sixty seconds. Help me model that customer journey.",
        "Do not show saved facts yet. Capture my goal and customer journey first.",
    ],
)
def test_bound_turn_uses_current_shared_context_without_losing_interview_preparation(
    monkeypatch: pytest.MonkeyPatch,
    mode: Literal["interview", "workspace"],
    message: str,
) -> None:
    user = User(id=uuid4(), email="alice@example.com", use_memories=False)
    persona = Persona(id=11, name="Executive interview", tools=[], user_files=[])
    chat = ChatSession(
        id=uuid4(), user_id=user.id, persona=persona, incognito_record_mode=None
    )
    binding = CauslChatBinding(
        user_id=user.id,
        actor=CauslActor(org_id="org_b", user_id="auth0|alice"),
        issuer="https://auth.example/",
        market_id="market_b",
        chat_id=chat.id,
        selection=CauslSelection(page="workspace", market_id="market_b"),
        library_server_id=22,
        mode=mode,
    )
    profile = {
        "status": "ready",
        "profile": {"name": "Alice", "company": "Acme", "website": "acme.com"},
    }
    research = {
        "status": "ready",
        "query": public_research_query(profile),
        "checked_at": time.time(),
        "report": "Acme sells energy plans through its public website.",
        "source_urls": ["https://acme.com/plans"],
    }
    read_profile = MagicMock(return_value=profile)
    read_research = MagicMock(return_value=research)
    monkeypatch.setattr(burn2_profile, "read_profile", read_profile)
    monkeypatch.setattr(burn2_research, "read_research", read_research)
    monkeypatch.setenv("BURN2_ENABLED", "true")
    monkeypatch.setattr(process_message, "get_current_tenant_id", lambda: "public")
    monkeypatch.setattr(process_message, "get_chat_session_by_id", lambda **_kw: chat)
    workspace_turn = MagicMock()
    monkeypatch.setattr(process_message, "workspace_turn", workspace_turn)
    llm = MagicMock()
    llm.config.max_input_tokens = 100_000
    monkeypatch.setattr(process_message, "get_llm_for_persona", lambda **_kw: llm)
    monkeypatch.setattr(process_message, "get_llm_token_counter", lambda *_a: len)
    monkeypatch.setattr(
        process_message, "_build_model_display_name", lambda *_a: "Test"
    )
    monkeypatch.setattr(process_message, "create_chat_history_chain", lambda **_kw: [])
    monkeypatch.setattr(
        process_message,
        "get_or_create_root_message",
        lambda **_kw: ChatMessage(id=1, message_type=MessageType.SYSTEM),
    )
    monkeypatch.setattr(process_message, "execute_hook", lambda **_kw: HookSkipped())
    monkeypatch.setattr(process_message, "get_tokenizer", lambda *_a: MagicMock())
    monkeypatch.setattr(
        process_message,
        "create_new_chat_message",
        lambda **kw: ChatMessage(
            id=2, message=kw["message"], message_type=MessageType.USER
        ),
    )
    monkeypatch.setattr(process_message, "find_summary_for_branch", lambda *_a: None)
    monkeypatch.setattr(process_message, "calculate_reserved_tokens", lambda **_kw: 0)
    monkeypatch.setattr(process_message, "get_tools", lambda *_a: [])
    monkeypatch.setattr(process_message, "load_all_chat_files", lambda *_a: [])
    monkeypatch.setattr(
        process_message, "reserve_message_id", lambda **_kw: ChatMessage(id=3)
    )
    for name in (
        "mt_cloud_telemetry",
        "check_llm_cost_limit_for_provider",
        "verify_user_files",
        "reset_cancel_status",
        "set_processing_status",
    ):
        monkeypatch.setattr(process_message, name, lambda *_a, **_kw: None)
    convert = MagicMock(
        return_value=ChatHistoryResult(
            simple_messages=[], all_injected_file_metadata={}
        )
    )
    monkeypatch.setattr(process_message, "convert_chat_history", convert)

    # A later turn must consume a new KB result, rather than the prior brief.
    for current_fact in (
        "Accepted conversion baseline: 5.5%",
        "Accepted conversion baseline: 6%",
    ):
        workspace_turn.return_value = (binding, current_fact)
        request = SendMessageRequest(chat_session_id=chat.id, message=message)
        turn = process_message.build_chat_turn(
            request, user, MagicMock(), llm_overrides=None
        )
        next(turn)  # Native response-message IDs precede setup.
        with pytest.raises(StopIteration) as completed:
            next(turn)
        setup: ChatTurnSetup = completed.value.value
        context = convert.call_args.kwargs["additional_context"]
        assert current_fact in context
        assert setup.causl_binding == binding
        assert setup.causl_original_message == request.message
        if mode == "interview":
            assert "Alice" in context
            assert research["report"] in context
            assert "https://acme.com/plans" in context
            assert request.message in context
            assert "not accepted market memory" in context
            assert setup.trusted_turn_instructions
            if message.startswith(("Show", "What")):
                assert setup.saved_fact_request is True
                assert setup.use_persona_prompt is False
                assert "Question budget" not in setup.trusted_turn_instructions
                assert "Capture the goal" not in setup.trusted_turn_instructions
                assert "market_search" in setup.trusted_turn_instructions
            else:
                assert setup.saved_fact_request is False
                assert setup.use_persona_prompt is True
                assert "30 spoken words" in setup.trusted_turn_instructions
        else:
            assert context == current_fact
            assert setup.saved_fact_request is False
            assert setup.trusted_turn_instructions is None
    assert workspace_turn.call_count == 2
    if mode == "interview":
        assert read_profile.call_count == read_research.call_count == 2
    else:
        read_profile.assert_not_called()
        read_research.assert_not_called()
