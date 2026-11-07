# ruff: noqa: ARG002
"""MIT OpenAI-compatible gateway router: auth, model routing, and wire format."""

from __future__ import annotations

import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from onyx.db.enums import Permission
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError, register_onyx_exception_handlers
from onyx.llm.interfaces import LLM, LLMConfig, LLMUserIdentity
from onyx.llm.model_response import (
    ChatCompletionDeltaToolCall,
    ChatCompletionMessageToolCall,
    Choice,
    Delta,
    FunctionCall,
    Message,
    ModelResponse,
    ModelResponseStream,
    StreamingChoice,
    Usage,
)
from onyx.llm.models import (
    AssistantMessage,
    ImageContentPart,
    LanguageModelInput,
    NamedToolChoice,
    ReasoningEffort,
    SystemMessage,
    TextContentPart,
    ToolChoice,
    ToolChoiceOptions,
    ToolMessage,
    UserMessage,
)
from onyx.server.gateway import api
from onyx.server.gateway.models import GatewayModelDescriptor
from onyx.utils.variable_functionality import global_version

_PATH = "/gateway/v1/chat/completions"
_GATEWAY_SCOPE = Permission.USE_LLM_GATEWAY.value
_USAGE = Usage(
    prompt_tokens=11,
    completion_tokens=7,
    total_tokens=18,
    cache_creation_input_tokens=0,
    cache_read_input_tokens=3,
)


class _FakeLLM(LLM):
    def __init__(
        self,
        response: ModelResponse | None = None,
        chunks: list[ModelResponseStream] | None = None,
        fail_after_chunks: bool = False,
    ) -> None:
        self._response = response
        self._chunks = chunks or []
        self._fail_after_chunks = fail_after_chunks
        self.calls: list[dict[str, Any]] = []

    @property
    def config(self) -> LLMConfig:
        return LLMConfig(
            model_provider="openai",
            model_name="gpt-test",
            temperature=0.0,
            max_input_tokens=1000,
        )

    def invoke(
        self,
        prompt: LanguageModelInput,
        tools: list[dict] | None = None,
        tool_choice: ToolChoice | None = None,
        structured_response_format: dict | None = None,
        timeout_override: int | None = None,
        max_tokens: int | None = None,
        reasoning_effort: ReasoningEffort = ReasoningEffort.AUTO,
        user_identity: LLMUserIdentity | None = None,
        total_timeout_override: float | None = None,
    ) -> ModelResponse:
        self.calls.append(
            {
                "prompt": prompt,
                "tools": tools,
                "tool_choice": tool_choice,
                "structured_response_format": structured_response_format,
                "max_tokens": max_tokens,
                "reasoning_effort": reasoning_effort,
            }
        )
        if self._response is None:
            raise RuntimeError("provider down")
        return self._response

    def stream(
        self,
        prompt: LanguageModelInput,
        tools: list[dict] | None = None,
        tool_choice: ToolChoice | None = None,
        structured_response_format: dict | None = None,
        timeout_override: int | None = None,
        max_tokens: int | None = None,
        reasoning_effort: ReasoningEffort = ReasoningEffort.AUTO,
        user_identity: LLMUserIdentity | None = None,
    ) -> Iterator[ModelResponseStream]:
        self.calls.append({"prompt": prompt, "tools": tools, "stream": True})
        yield from self._chunks
        if self._fail_after_chunks:
            raise RuntimeError("upstream connection reset")


def _provider(
    *, is_public: bool = True, models: tuple[str, ...] = ("gpt-test",)
) -> SimpleNamespace:
    return SimpleNamespace(
        id=7,
        is_public=is_public,
        groups=[],
        personas=[],
        model_configurations=[
            *(SimpleNamespace(name=name, is_visible=True) for name in models),
            SimpleNamespace(name="hidden-model", is_visible=False),
        ],
    )


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """A test app with the gateway router; LLM and DB lookups faked."""
    state = SimpleNamespace(
        provider=_provider(),
        llm=_FakeLLM(),
        llm_from_provider=MagicMock(),
    )
    state.llm_from_provider.side_effect = lambda **_: state.llm

    monkeypatch.setattr(
        api,
        "fetch_existing_llm_provider_by_id",
        lambda provider_id, _db: state.provider if provider_id == 7 else None,
    )
    monkeypatch.setattr(api, "fetch_user_group_ids", lambda _db, _user: set())
    monkeypatch.setattr(api, "has_global_permission", lambda _user, _perm: False)
    monkeypatch.setattr(
        api, "LLMProviderView", SimpleNamespace(from_model=lambda _p: "provider-view")
    )
    monkeypatch.setattr(api, "llm_from_provider", state.llm_from_provider)

    app = FastAPI()
    register_onyx_exception_handlers(app)

    @app.middleware("http")
    async def _token_scopes(
        request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        raw = request.headers.get("x-test-scopes")
        if raw is not None:
            request.state.token_scopes = [Permission(s) for s in raw.split(",") if s]
        return await call_next(request)

    app.include_router(api.router)
    app.dependency_overrides[api.require_gateway_user] = lambda: MagicMock()
    app.dependency_overrides[api.get_session] = lambda: MagicMock()
    state.client = TestClient(app)
    return state


def _post(
    wire: SimpleNamespace, body: dict[str, Any], scopes: str | None = _GATEWAY_SCOPE
) -> Any:
    headers = {"x-test-scopes": scopes} if scopes is not None else {}
    return wire.client.post(_PATH, json=body, headers=headers)


def _body(**overrides: Any) -> dict[str, Any]:
    return {
        "model": "7/gpt-test",
        "messages": [{"role": "user", "content": "hi"}],
        **overrides,
    }


def _sse_payloads(text: str) -> list[str]:
    return [
        line.removeprefix("data: ")
        for line in text.split("\n\n")
        if line.startswith("data: ")
    ]


# --- model id parsing -------------------------------------------------------


def test_parse_model_id_splits_on_first_slash() -> None:
    assert api.parse_gateway_model_id("12/gpt-5") == (12, "gpt-5")
    assert api.parse_gateway_model_id("3/openai/gpt-oss-120b") == (
        3,
        "openai/gpt-oss-120b",
    )


@pytest.mark.parametrize("model", ["gpt-5", "abc/gpt-5", "5/", "/gpt-5", ""])
def test_parse_model_id_rejects_malformed_ids(model: str) -> None:
    with pytest.raises(OnyxError) as exc:
        api.parse_gateway_model_id(model)
    assert exc.value.status_code == 400


def test_malformed_model_id_is_400(wire: SimpleNamespace) -> None:
    assert _post(wire, _body(model="gpt-test")).status_code == 400


def test_unknown_provider_is_404(wire: SimpleNamespace) -> None:
    assert _post(wire, _body(model="99/gpt-test")).status_code == 404
    wire.llm_from_provider.assert_not_called()


def test_model_not_visible_on_provider_is_404(wire: SimpleNamespace) -> None:
    assert _post(wire, _body(model="7/hidden-model")).status_code == 404
    assert _post(wire, _body(model="7/not-configured")).status_code == 404
    wire.llm_from_provider.assert_not_called()


# --- auth -------------------------------------------------------------------


def test_request_without_token_scopes_is_403(wire: SimpleNamespace) -> None:
    """Session or API-key auth carries no token scopes and never reaches the LLM."""
    assert _post(wire, _body(), scopes=None).status_code == 403
    wire.llm_from_provider.assert_not_called()


def test_token_without_gateway_capable_scope_is_403(wire: SimpleNamespace) -> None:
    response = _post(wire, _body(), scopes=Permission.READ_SEARCH.value)
    assert response.status_code == 403
    wire.llm_from_provider.assert_not_called()


def test_models_endpoint_requires_gateway_capable_scope(wire: SimpleNamespace) -> None:
    response = wire.client.get(
        "/gateway/v1/models", headers={"x-test-scopes": Permission.READ_CHAT.value}
    )
    assert response.status_code == 403


def test_provider_the_user_cannot_access_is_403(wire: SimpleNamespace) -> None:
    wire.provider = _provider(is_public=False)
    assert _post(wire, _body()).status_code == 403
    wire.llm_from_provider.assert_not_called()


def test_mit_gateway_mounts_only_without_ee() -> None:
    assert api.should_mount_mit_gateway() is True
    global_version.set_ee()
    try:
        assert api.should_mount_mit_gateway() is False
    finally:
        global_version.unset_ee()


# --- non-streaming ----------------------------------------------------------


def test_non_streaming_completion_translates_request_and_response(
    wire: SimpleNamespace,
) -> None:
    wire.llm = _FakeLLM(
        response=ModelResponse(
            id="resp-1",
            created="1700000000",
            choice=Choice(
                finish_reason="tool_calls",
                message=Message(
                    content="Calling a tool.",
                    tool_calls=[
                        ChatCompletionMessageToolCall(
                            id="call_1",
                            function=FunctionCall(
                                name="lookup", arguments='{"q": "x"}'
                            ),
                        )
                    ],
                ),
            ),
            usage=_USAGE,
        )
    )
    tools = [
        {
            "type": "function",
            "function": {"name": "lookup", "parameters": {"type": "object"}},
        }
    ]
    response = _post(
        wire,
        _body(
            messages=[
                {"role": "developer", "content": [{"type": "text", "text": "Be"}]},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "look"},
                        {"type": "image_url", "image_url": {"url": "data:x"}},
                    ],
                },
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_0",
                            "type": "function",
                            "function": {"name": "lookup", "arguments": "{}"},
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": "call_0", "content": "result"},
            ],
            tools=tools,
            tool_choice={"type": "function", "function": {"name": "lookup"}},
            max_completion_tokens=64,
            temperature=0.2,
            reasoning_effort="low",
            reasoningSummary="auto",
        ),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "id": "resp-1",
        "object": "chat.completion",
        "created": 1700000000,
        "model": "7/gpt-test",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Calling a tool.",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"arguments": '{"q": "x"}', "name": "lookup"},
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {
            "prompt_tokens": 11,
            "completion_tokens": 7,
            "total_tokens": 18,
            "prompt_tokens_details": {"cached_tokens": 3},
        },
    }

    wire.llm_from_provider.assert_called_once_with(
        model_name="gpt-test", llm_provider="provider-view", temperature=0.2
    )
    (call,) = wire.llm.calls
    assert call["prompt"] == [
        SystemMessage(content="Be"),
        UserMessage(
            content=[
                TextContentPart(text="look"),
                ImageContentPart(image_url={"url": "data:x"}),
            ]
        ),
        AssistantMessage(
            content=None,
            tool_calls=[
                {"id": "call_0", "function": {"name": "lookup", "arguments": "{}"}}
            ],
        ),
        ToolMessage(content="result", tool_call_id="call_0"),
    ]
    assert call["tools"] == tools
    assert call["tool_choice"] == NamedToolChoice(name="lookup")
    assert call["max_tokens"] == 64
    assert call["reasoning_effort"] == ReasoningEffort.LOW


def test_string_tool_choice_maps_to_options(wire: SimpleNamespace) -> None:
    wire.llm = _FakeLLM(
        response=ModelResponse(id="r", created="1", choice=Choice(finish_reason="stop"))
    )
    assert _post(wire, _body(tool_choice="required")).status_code == 200
    assert wire.llm.calls[0]["tool_choice"] == ToolChoiceOptions.REQUIRED


def test_unsupported_message_role_is_400(wire: SimpleNamespace) -> None:
    response = _post(
        wire, _body(messages=[{"role": "function", "name": "f", "content": "x"}])
    )
    assert response.status_code == 400


def test_upstream_failure_before_output_is_an_http_error(
    wire: SimpleNamespace,
) -> None:
    wire.llm = _FakeLLM(response=None)
    response = _post(wire, _body())
    assert response.status_code == 502


# --- streaming --------------------------------------------------------------


def _chunk(
    *,
    content: str | None = None,
    tool_calls: list[ChatCompletionDeltaToolCall] | None = None,
    finish_reason: str | None = None,
    usage: Usage | None = None,
) -> ModelResponseStream:
    return ModelResponseStream(
        id="chunk-1",
        created="1700000001",
        choice=StreamingChoice(
            finish_reason=finish_reason,
            delta=Delta(content=content, tool_calls=tool_calls or []),
        ),
        usage=usage,
    )


def test_streaming_translates_text_tool_call_deltas_finish_and_usage(
    wire: SimpleNamespace,
) -> None:
    wire.llm = _FakeLLM(
        chunks=[
            _chunk(content="Hel"),
            _chunk(content="lo"),
            _chunk(
                tool_calls=[
                    ChatCompletionDeltaToolCall(
                        index=0,
                        id="call_1",
                        function=FunctionCall(name="read", arguments=""),
                    )
                ]
            ),
            _chunk(
                tool_calls=[
                    ChatCompletionDeltaToolCall(
                        index=0, function=FunctionCall(arguments='{"pa')
                    )
                ]
            ),
            _chunk(
                tool_calls=[
                    ChatCompletionDeltaToolCall(
                        index=0, function=FunctionCall(arguments='th": "a"}')
                    )
                ]
            ),
            _chunk(finish_reason="tool_calls", usage=_USAGE),
        ]
    )

    response = _post(wire, _body(stream=True, stream_options={"include_usage": True}))

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    payloads = _sse_payloads(response.text)
    assert payloads[-1] == "[DONE]"
    chunks = [json.loads(p) for p in payloads[:-1]]
    assert len(chunks) == 6
    assert all(c["object"] == "chat.completion.chunk" for c in chunks)
    assert all(c["model"] == "7/gpt-test" for c in chunks)

    deltas = [c["choices"][0]["delta"] for c in chunks]
    assert deltas[0] == {"role": "assistant", "content": "Hel"}
    assert deltas[1] == {"content": "lo"}
    assert deltas[2]["tool_calls"] == [
        {
            "id": "call_1",
            "index": 0,
            "type": "function",
            "function": {"arguments": "", "name": "read"},
        }
    ]
    assert deltas[3]["tool_calls"] == [
        {"index": 0, "type": "function", "function": {"arguments": '{"pa'}}
    ]
    assert deltas[4]["tool_calls"][0]["function"] == {"arguments": 'th": "a"}'}
    assert [c["choices"][0]["finish_reason"] for c in chunks] == [
        None,
        None,
        None,
        None,
        None,
        "tool_calls",
    ]
    assert chunks[-1]["usage"] == {
        "prompt_tokens": 11,
        "completion_tokens": 7,
        "total_tokens": 18,
        "prompt_tokens_details": {"cached_tokens": 3},
    }
    assert all("usage" not in c for c in chunks[:-1])


def test_streaming_failure_mid_stream_emits_error_event_without_done(
    wire: SimpleNamespace,
) -> None:
    wire.llm = _FakeLLM(chunks=[_chunk(content="partial")], fail_after_chunks=True)

    response = _post(wire, _body(stream=True))

    assert response.status_code == 200
    payloads = _sse_payloads(response.text)
    assert "[DONE]" not in payloads
    assert json.loads(payloads[0])["choices"][0]["delta"]["content"] == "partial"
    error = json.loads(payloads[-1])["error"]
    assert error["message"]
    assert error["type"] == "server_error"


def test_streaming_failure_before_first_chunk_is_an_http_error(
    wire: SimpleNamespace,
) -> None:
    wire.llm = _FakeLLM(chunks=[], fail_after_chunks=True)
    assert _post(wire, _body(stream=True)).status_code == 502


# --- model list -------------------------------------------------------------


def test_models_endpoint_lists_accessible_catalog(
    wire: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        api, "fetch_all_accessible_llm_providers", lambda _db, _user: ["p"]
    )
    monkeypatch.setattr(
        api,
        "build_gateway_model_catalog",
        lambda providers: (
            [
                GatewayModelDescriptor(
                    id="7/gpt-test", display_name="GPT", provider="openai"
                )
            ]
            if providers == ["p"]
            else []
        ),
    )
    response = wire.client.get(
        "/gateway/v1/models", headers={"x-test-scopes": _GATEWAY_SCOPE}
    )
    assert response.status_code == 200
    assert response.json() == {
        "object": "list",
        "data": [{"id": "7/gpt-test", "object": "model", "owned_by": "openai"}],
    }


# --- error body shape -------------------------------------------------------


def _assert_openai_error(response: Any, status: int, code: str) -> dict[str, Any]:
    """OpenAI clients (``@ai-sdk/openai-compatible``) read ``error.message``;
    Onyx's own ``error_code``/``detail`` stay for consistency."""
    assert response.status_code == status
    body = response.json()
    error = body["error"]
    assert isinstance(error["message"], str) and error["message"]
    assert error["code"] == code
    assert error["type"] in {"invalid_request_error", "server_error"}
    assert body["error_code"] == code
    assert body["detail"] == error["message"]
    return error


def test_route_errors_use_openai_error_shape(wire: SimpleNamespace) -> None:
    error = _assert_openai_error(
        _post(wire, _body(model="gpt-test")), 400, "INVALID_INPUT"
    )
    assert "<provider_id>/<model_name>" in error["message"]
    assert error["type"] == "invalid_request_error"
    _assert_openai_error(_post(wire, _body(model="99/gpt-test")), 404, "NOT_FOUND")
    _assert_openai_error(
        _post(wire, _body(), scopes=None), 403, "INSUFFICIENT_PERMISSIONS"
    )


def test_upstream_error_uses_openai_error_shape(wire: SimpleNamespace) -> None:
    wire.llm = _FakeLLM(response=None)
    error = _assert_openai_error(_post(wire, _body()), 502, "LLM_PROVIDER_ERROR")
    assert error["type"] == "server_error"
    wire.llm = _FakeLLM(chunks=[], fail_after_chunks=True)
    _assert_openai_error(_post(wire, _body(stream=True)), 502, "LLM_PROVIDER_ERROR")


def test_dependency_auth_error_uses_openai_error_shape(wire: SimpleNamespace) -> None:
    def _deny() -> None:
        raise OnyxError(OnyxErrorCode.INSUFFICIENT_PERMISSIONS, "no gateway scope")

    wire.client.app.dependency_overrides[api.require_gateway_user] = _deny
    error = _assert_openai_error(_post(wire, _body()), 403, "INSUFFICIENT_PERMISSIONS")
    assert error["message"] == "no gateway scope"
    _assert_openai_error(
        wire.client.get("/gateway/v1/models"), 403, "INSUFFICIENT_PERMISSIONS"
    )


def test_request_validation_error_uses_openai_error_shape(
    wire: SimpleNamespace,
) -> None:
    _assert_openai_error(
        wire.client.post(_PATH, json={"model": "7/gpt-test"}),
        422,
        "VALIDATION_ERROR",
    )


def test_non_ascii_digit_provider_id_is_400(wire: SimpleNamespace) -> None:
    with pytest.raises(OnyxError):
        api.parse_gateway_model_id("²/gpt-test")
    _assert_openai_error(_post(wire, _body(model="²/gpt-test")), 400, "INVALID_INPUT")
