"""OpenAI-compatible LLM gateway (MIT).

Serves ``GET /v1/models`` and ``POST /v1/chat/completions`` at
``GATEWAY_PATH_PREFIX`` for Craft's sandbox clients (opencode via
``@ai-sdk/openai-compatible``, EDSL via the OpenAI client). Model ids are
``<llm_provider_id>/<model_name>``. Mounted only when Enterprise code is not
loaded; an EE deployment serves its own gateway at the same prefix.
"""

import contextvars
import json
from collections.abc import Callable, Coroutine, Generator, Iterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.responses import Response

from onyx.auth.permissions import has_global_permission, require_permission
from onyx.db.engine.sql_engine import get_session
from onyx.db.enums import Permission
from onyx.db.llm import (
    can_user_access_llm_provider,
    fetch_all_accessible_llm_providers,
    fetch_existing_llm_provider_by_id,
    fetch_user_group_ids,
)
from onyx.db.models import User
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError, log_onyx_error
from onyx.llm.factory import llm_from_provider
from onyx.llm.interfaces import LLM
from onyx.llm.model_response import ChatCompletionDeltaToolCall, ModelResponseStream
from onyx.llm.models import (
    AssistantMessage,
    ChatCompletionMessage,
    ContentPart,
    ImageContentPart,
    ImageUrlDetail,
    NamedToolChoice,
    ReasoningEffort,
    SystemMessage,
    TextContentPart,
    ToolCall,
    ToolChoice,
    ToolChoiceOptions,
    ToolMessage,
    UserMessage,
)
from onyx.llm.tracing_wrap import _finalize_tool_calls, _merge_tool_call_delta
from onyx.llm.utils import litellm_exception_to_safe_error
from onyx.server.features.build.craft_gateway import gateway_request_flow
from onyx.server.gateway.configs import GATEWAY_PATH_PREFIX
from onyx.server.gateway.model_catalog import build_gateway_model_catalog
from onyx.server.gateway.models import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ModelListResponse,
)
from onyx.server.manage.llm.models import LLMProviderView
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import (
    llm_generation_span,
    record_llm_response,
    record_llm_span_output,
)
from onyx.utils.logger import setup_logger
from onyx.utils.variable_functionality import global_version

logger = setup_logger()


def _openai_error_response(exc: OnyxError) -> JSONResponse:
    """OpenAI clients read ``{"error": {"message", "type", "code"}}``; the
    AI SDK shows only the HTTP status text for any other body. Onyx's
    ``error_code``/``detail`` are kept alongside."""
    log_onyx_error(exc)
    code = exc.error_code.code
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.detail,
                "type": (
                    "server_error"
                    if exc.status_code >= 500
                    else "invalid_request_error"
                ),
                "code": code,
            },
            "error_code": code,
            "detail": exc.detail,
        },
        headers=exc.headers,
    )


class _OpenAIErrorRoute(APIRoute):
    """Gives every error on a gateway route, including auth dependencies and
    request validation, the OpenAI error body."""

    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def route_handler(request: Request) -> Response:
            try:
                return await handler(request)
            except OnyxError as e:
                return _openai_error_response(e)
            except RequestValidationError as e:
                detail = f"{e}".replace("\n", " ")
                return _openai_error_response(
                    OnyxError(
                        OnyxErrorCode.VALIDATION_ERROR,
                        detail,
                        status_code_override=422,
                    )
                )
            except HTTPException as e:
                return _openai_error_response(
                    OnyxError(
                        OnyxErrorCode.for_status(e.status_code),
                        str(e.detail),
                        status_code_override=e.status_code,
                        headers=dict(e.headers) if e.headers else None,
                    )
                )

        return route_handler


router = APIRouter(prefix=GATEWAY_PATH_PREFIX, route_class=_OpenAIErrorRoute)

require_gateway_user = require_permission(Permission.USE_LLM_GATEWAY)

_REASONING_EFFORTS: dict[str, ReasoningEffort] = {
    "none": ReasoningEffort.OFF,
    "minimal": ReasoningEffort.LOW,
    "low": ReasoningEffort.LOW,
    "medium": ReasoningEffort.MEDIUM,
    "high": ReasoningEffort.HIGH,
    "xhigh": ReasoningEffort.XHIGH,
}

# Upstream statuses passed through to the client; anything else is a 502.
_PASSTHROUGH_UPSTREAM_STATUSES = frozenset({400, 413, 429})


def should_mount_mit_gateway() -> bool:
    """The EE app mounts its own gateway at the same prefix."""
    return not global_version.is_ee_version()


def parse_gateway_model_id(model: str) -> tuple[int, str]:
    """Split ``<provider_id>/<model_name>`` on the first slash; model names
    may contain slashes."""
    provider_id, separator, model_name = model.partition("/")
    if (
        not separator
        or not model_name
        or not (provider_id.isascii() and provider_id.isdigit())
    ):
        raise OnyxError(
            OnyxErrorCode.INVALID_INPUT,
            f"Model id {model!r} must have the form '<provider_id>/<model_name>'.",
        )
    return int(provider_id), model_name


def _require_gateway_flow(request: Request, user: User) -> LLMFlow:
    flow = gateway_request_flow(request, user)
    if flow is None:
        raise OnyxError(
            OnyxErrorCode.INSUFFICIENT_PERMISSIONS,
            "This credential cannot use the LLM gateway.",
        )
    return flow


def _resolve_llm(
    db_session: Session, user: User, model: str, temperature: float | None
) -> LLM:
    provider_id, model_name = parse_gateway_model_id(model)
    provider = fetch_existing_llm_provider_by_id(provider_id, db_session)
    if provider is None:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Unknown model {model!r}.")
    # persona=None: gateway calls have no agent context, same as Craft's catalog.
    if not can_user_access_llm_provider(
        provider,
        fetch_user_group_ids(db_session, user),
        persona=None,
        can_manage_llms=has_global_permission(user, Permission.MANAGE_LLMS),
    ):
        raise OnyxError(
            OnyxErrorCode.INSUFFICIENT_PERMISSIONS,
            f"You do not have access to the provider of model {model!r}.",
        )
    if not any(
        config.is_visible and config.name == model_name
        for config in provider.model_configurations
    ):
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Unknown model {model!r}.")
    return llm_from_provider(
        model_name=model_name,
        llm_provider=LLMProviderView.from_model(provider),
        temperature=temperature,
    )


def _text_of(content: Any) -> str:
    """Flatten string-or-text-parts content (system, tool, assistant)."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Invalid content part.")
            if part.get("type") == "text":
                texts.append(str(part.get("text") or ""))
            elif part.get("type") != "refusal":
                raise OnyxError(
                    OnyxErrorCode.INVALID_INPUT,
                    f"Content part type {part.get('type')!r} is not supported here.",
                )
        return "\n".join(texts)
    raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Invalid message content.")


def _user_content(content: Any) -> str | list[ContentPart]:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Invalid user message content.")
    parts: list[ContentPart] = []
    for part in content:
        part_type = part.get("type") if isinstance(part, dict) else None
        if part_type == "text":
            parts.append(
                TextContentPart(
                    text=str(part.get("text") or ""),
                    cache_control=part.get("cache_control"),
                )
            )
        elif part_type == "image_url":
            image_url = part.get("image_url")
            if isinstance(image_url, str):
                image_url = {"url": image_url}
            parts.append(ImageContentPart(image_url=ImageUrlDetail(**image_url)))
        else:
            raise OnyxError(
                OnyxErrorCode.INVALID_INPUT,
                f"User content part type {part_type!r} is not supported.",
            )
    return parts


def _tool_calls(raw: Any) -> list[ToolCall] | None:
    if not raw:
        return None
    calls: list[ToolCall] = []
    for call in raw:
        function = call.get("function") or {}
        arguments = function.get("arguments")
        if not isinstance(arguments, str):
            arguments = json.dumps(arguments if arguments is not None else {})
        calls.append(
            ToolCall(
                id=str(call.get("id") or ""),
                function={"name": function.get("name") or "", "arguments": arguments},
            )
        )
    return calls


def to_llm_messages(messages: list[dict[str, Any]]) -> list[ChatCompletionMessage]:
    converted: list[ChatCompletionMessage] = []
    try:
        for message in messages:
            role = message.get("role")
            cache_control = message.get("cache_control")
            if role in ("system", "developer"):
                converted.append(
                    SystemMessage(
                        content=_text_of(message.get("content")),
                        cache_control=cache_control,
                    )
                )
            elif role == "user":
                converted.append(
                    UserMessage(
                        content=_user_content(message.get("content")),
                        cache_control=cache_control,
                    )
                )
            elif role == "assistant":
                content = message.get("content")
                converted.append(
                    AssistantMessage(
                        content=None if content is None else _text_of(content),
                        tool_calls=_tool_calls(message.get("tool_calls")),
                        cache_control=cache_control,
                    )
                )
            elif role == "tool":
                converted.append(
                    ToolMessage(
                        content=_text_of(message.get("content")),
                        tool_call_id=str(message.get("tool_call_id") or ""),
                        cache_control=cache_control,
                    )
                )
            else:
                raise OnyxError(
                    OnyxErrorCode.INVALID_INPUT,
                    f"Message role {role!r} is not supported.",
                )
    except (ValidationError, AttributeError, TypeError) as e:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, f"Invalid messages: {e}") from e
    return converted


def _tool_choice(raw: Any) -> ToolChoice | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            return ToolChoiceOptions(raw)
        except ValueError as e:
            raise OnyxError(
                OnyxErrorCode.INVALID_INPUT, f"Unsupported tool_choice {raw!r}."
            ) from e
    if isinstance(raw, dict) and isinstance(raw.get("function"), dict):
        name = raw["function"].get("name")
        if name:
            return NamedToolChoice(name=name)
    raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Unsupported tool_choice.")


def _llm_kwargs(body: ChatCompletionRequest) -> dict[str, Any]:
    response_format = body.response_format
    if response_format and response_format.get("type") == "text":
        response_format = None
    return {
        "tools": body.tools or None,
        "tool_choice": _tool_choice(body.tool_choice),
        "structured_response_format": response_format,
        "max_tokens": body.max_completion_tokens or body.max_tokens,
        "reasoning_effort": _REASONING_EFFORTS.get(
            (body.reasoning_effort or "").lower(), ReasoningEffort.AUTO
        ),
    }


def _provider_error(e: Exception, llm: LLM) -> OnyxError:
    if isinstance(e, OnyxError):
        return e
    info = litellm_exception_to_safe_error(e, llm, fallback_to_error_msg=True)
    logger.warning("LLM gateway upstream error (%s): %s", info.error_code, e)
    upstream_status = getattr(e, "status_code", None)  # ods: ignore[getattr]
    return OnyxError(
        OnyxErrorCode.LLM_PROVIDER_ERROR,
        info.message,
        status_code_override=(
            upstream_status
            if upstream_status in _PASSTHROUGH_UPSTREAM_STATUSES
            else None
        ),
    )


def _traced_stream(
    llm: LLM,
    flow: LLMFlow,
    prompt: list[ChatCompletionMessage],
    kwargs: dict[str, Any],
) -> Generator[ModelResponseStream, None, None]:
    with llm_generation_span(
        llm, flow=flow, input_messages=prompt, tools=kwargs["tools"]
    ) as span:
        content: list[str] = []
        usage = None
        tool_call_buffer: dict[int, ChatCompletionDeltaToolCall] = {}
        try:
            for chunk in llm.stream(prompt, **kwargs):
                if chunk.usage:
                    usage = chunk.usage
                if chunk.choice.delta.content:
                    content.append(chunk.choice.delta.content)
                for delta in chunk.choice.delta.tool_calls:
                    _merge_tool_call_delta(tool_call_buffer, delta)
                yield chunk
        except Exception as exc:
            span.set_error({"message": f"{type(exc).__name__}: {exc}", "data": None})
            raise
        finally:
            record_llm_span_output(
                span,
                output="".join(content) or None,
                usage=usage,
                tool_calls=_finalize_tool_calls(tool_call_buffer),
            )


def _next_chunk(
    ctx: contextvars.Context, chunks: Generator[ModelResponseStream, None, None]
) -> ModelResponseStream | None:
    try:
        return ctx.run(chunks.__next__)
    except StopIteration:
        return None


def _sse(payload: dict[str, Any] | str) -> str:
    data = payload if isinstance(payload, str) else json.dumps(payload)
    return f"data: {data}\n\n"


def _sse_body(
    ctx: contextvars.Context,
    chunks: Generator[ModelResponseStream, None, None],
    first: ModelResponseStream | None,
    model: str,
    llm: LLM,
) -> Iterator[str]:
    # Every step of the LLM stream runs in one Context: the trace span is a
    # context variable, and Starlette moves each step to a new thread context.
    chunk = first
    include_role = True
    try:
        while chunk is not None:
            yield _sse(
                ChatCompletionChunk.from_stream_chunk(
                    chunk, model=model, include_role=include_role
                ).to_wire()
            )
            include_role = False
            chunk = _next_chunk(ctx, chunks)
        yield _sse("[DONE]")
    except Exception as e:
        info = litellm_exception_to_safe_error(e, llm, fallback_to_error_msg=True)
        logger.warning("LLM gateway stream failed (%s): %s", info.error_code, e)
        yield _sse(
            {
                "error": {
                    "message": info.message,
                    "type": "server_error",
                    "code": info.error_code,
                }
            }
        )
    finally:
        ctx.run(chunks.close)


@router.get("/v1/models")
def list_models(
    request: Request,
    user: User = Depends(require_gateway_user),
    db_session: Session = Depends(get_session),
) -> JSONResponse:
    _require_gateway_flow(request, user)
    catalog = build_gateway_model_catalog(
        fetch_all_accessible_llm_providers(db_session, user)
    )
    return JSONResponse(ModelListResponse.from_catalog(catalog).to_wire())


@router.post("/v1/chat/completions", response_model=None)
def create_chat_completion(
    request: Request,
    body: ChatCompletionRequest,
    user: User = Depends(require_gateway_user),
    db_session: Session = Depends(get_session),
) -> JSONResponse | StreamingResponse:
    flow = _require_gateway_flow(request, user)
    llm = _resolve_llm(db_session, user, body.model, body.temperature)
    prompt = to_llm_messages(body.messages)
    kwargs = _llm_kwargs(body)

    if not body.stream:
        with llm_generation_span(
            llm, flow=flow, input_messages=prompt, tools=kwargs["tools"]
        ) as span:
            try:
                response = llm.invoke(prompt, **kwargs)
            except Exception as e:
                span.set_error({"message": f"{type(e).__name__}: {e}", "data": None})
                raise _provider_error(e, llm) from e
            record_llm_response(span, response)
        return JSONResponse(
            ChatCompletionResponse.from_model_response(
                response, model=body.model
            ).to_wire()
        )

    # Pull the first chunk here so a failure before any output is an HTTP
    # error the client can retry, not a 200 with an error event.
    ctx = contextvars.copy_context()
    chunks = _traced_stream(llm, flow, prompt, kwargs)
    try:
        first = _next_chunk(ctx, chunks)
    except Exception as e:
        raise _provider_error(e, llm) from e
    return StreamingResponse(
        _sse_body(ctx, chunks, first, body.model, llm),
        media_type="text/event-stream",
    )
