"""Which chat callers can answer a tool server's request for approval.

A person can click an approval card only in a browser stream. The non-streaming
API, Slack, evals and API-key or PAT clients run the same pipeline with nobody to
click, so they must not wait on a card.
"""

import asyncio
import inspect
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from starlette.requests import Request
from starlette.responses import StreamingResponse

from onyx.chat import process_message
from onyx.chat.emitter import Emitter, NullEmitter
from onyx.server.query_and_chat import chat_backend
from onyx.server.query_and_chat.models import MessageOrigin, SendMessageRequest
from onyx.server.query_and_chat.streaming_models import OverallStop


@pytest.fixture
def seen(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def stream(**kwargs: Any) -> Generator[OverallStop, None, None]:
        calls.append(kwargs)
        yield OverallStop(stop_reason="end_turn")

    monkeypatch.setattr(chat_backend, "handle_stream_message_objects", stream)
    monkeypatch.setattr(chat_backend, "handle_multi_model_stream", stream)
    monkeypatch.setattr(chat_backend, "mt_cloud_telemetry", lambda **_: None)
    monkeypatch.setattr(chat_backend, "get_current_tenant_id", lambda: "tenant")
    return calls


def _send(
    monkeypatch: pytest.MonkeyPatch,
    origin: MessageOrigin,
    *,
    api_key: bool = False,
    **extra: Any,
) -> None:
    request = Request({"type": "http", "headers": []})
    body = SendMessageRequest(
        message="hi", chat_session_id=uuid4(), origin=origin, **extra
    )
    user = MagicMock()
    user.is_anonymous = False
    user.id = uuid4()
    monkeypatch.setattr(
        chat_backend,
        "get_hashed_api_key_from_request",
        lambda _request: "hash" if api_key else None,
    )
    response = chat_backend.handle_send_chat_message(
        chat_message_req=body,
        request=request,
        user=user,
        _rate_limit_check=None,
        _api_key_usage_check=None,
    )
    assert isinstance(response, StreamingResponse)

    async def drain() -> None:
        async for _ in response.body_iterator:
            pass

    asyncio.run(drain())


def test_a_browser_stream_can_answer_a_request_for_approval(
    seen: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    _send(monkeypatch, MessageOrigin.WEBAPP)

    assert [call["interactive"] for call in seen] == [True]


def test_a_browser_side_by_side_stream_can_answer_too(
    seen: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    from onyx.server.query_and_chat.models import LLMOverride

    _send(
        monkeypatch,
        MessageOrigin.WEBAPP,
        llm_overrides=[
            LLMOverride(model_provider="p", model_version="a"),
            LLMOverride(model_provider="p", model_version="b"),
        ],
    )

    assert [call["interactive"] for call in seen] == [True]


def test_an_api_key_client_is_not_asked_to_click(
    seen: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    _send(monkeypatch, MessageOrigin.WEBAPP, api_key=True)

    assert [call["interactive"] for call in seen] == [False]


def test_a_request_that_says_it_is_api_traffic_is_not_asked_to_click(
    seen: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    _send(monkeypatch, MessageOrigin.API)

    assert [call["interactive"] for call in seen] == [False]


@pytest.mark.parametrize(
    "entrypoint",
    [
        process_message.handle_stream_message_objects,
        process_message.handle_multi_model_stream,
        process_message._stream_chat_turn,
        process_message._run_models,
    ],
)
def test_callers_that_say_nothing_are_not_interactive(entrypoint: Any) -> None:
    # Slack, evals and the non-streaming API call the first of these without the
    # argument, so the default is what decides for them.
    assert inspect.signature(entrypoint).parameters["interactive"].default is False


def test_an_emitter_is_live_only_when_interactive_and_not_stopped() -> None:
    import queue
    import threading

    stop = threading.Event()

    def make(**kwargs: Any) -> Emitter:
        return Emitter(merged_queue=queue.Queue(), **kwargs)

    assert make(drain_done=stop, interactive=True).is_live
    assert not make(drain_done=stop).is_live  # the non-streaming API, Slack, evals
    assert not make(interactive=True).is_live  # no stream behind it
    assert not NullEmitter().is_live
    stop.set()
    assert not make(drain_done=stop, interactive=True).is_live
