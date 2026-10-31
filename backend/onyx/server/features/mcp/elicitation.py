"""Trusted approval for MCP elicitation.

An MCP server may stop a tool call and ask the client to show the user one
exact action to approve (Rehoboam does this before a paid experiment). Onyx
answers by streaming an approval card to the chat and waiting for the signed-in
user's own HTTP request. The model never sees the question and cannot answer it.

Only one shape is supported: a single required string field that has exactly
one allowed value, which is a plain "yes, this exact thing". Any other request
is declined instead of guessed at, so the user is never shown a card Onyx
cannot interpret.
"""

import asyncio
import json
import time
import uuid
from collections.abc import Awaitable, Callable
from enum import Enum
from typing import Any, Literal

from mcp import types
from mcp.client.session import ElicitationFnT
from mcp.shared.context import RequestContext

from onyx.chat.emitter import Emitter
from onyx.redis.redis_pool import TenantRedisClient
from onyx.server.query_and_chat.placement import Placement
from onyx.server.query_and_chat.streaming_models import (
    CustomToolApprovalRequest,
    CustomToolApprovalResult,
    Packet,
)
from onyx.utils.logger import setup_logger

logger = setup_logger()

# Long enough to read a specification, shorter than MCP_TOOL_CALL_TIMEOUT_SECONDS
# (300) so the tool call ends with our answer, not a transport timeout.
APPROVAL_TIMEOUT_SECONDS = 180
# The user must be able to read the whole action they approve.
MAX_APPROVAL_MESSAGE_CHARS = 200_000
_KEY_PREFIX = "mcp_elicitation"
_POLL_INTERVAL_SECONDS = 0.5


class ElicitationDecision(str, Enum):
    APPROVE = "approve"
    DECLINE = "decline"


class ElicitationNotFound(Exception):
    """No pending approval with this id belongs to this user (or it expired)."""


class ElicitationAlreadyAnswered(Exception):
    """The approval already has an answer; the first answer wins."""


def _request_key(approval_id: str) -> str:
    return f"{_KEY_PREFIX}:{approval_id}"


def _answer_key(approval_id: str) -> str:
    return f"{_KEY_PREFIX}:{approval_id}:answer"


def _text(value: str | bytes | None) -> str | None:
    if isinstance(value, bytes):
        return value.decode()
    return value


def submit_decision(
    redis_client: TenantRedisClient,
    approval_id: str,
    user_id: str,
    decision: Literal["approve", "decline"],
) -> None:
    """Record the user's answer. Raises if it is not theirs, gone, or answered."""
    raw = _text(redis_client.get(_request_key(approval_id)))
    if raw is None:
        raise ElicitationNotFound()
    owner = json.loads(raw).get("user_id")
    if not user_id or owner != user_id:
        # Same error as a missing id so one user cannot probe another's ids.
        raise ElicitationNotFound()
    stored = redis_client.set(
        _answer_key(approval_id),
        ElicitationDecision(decision).value,
        nx=True,
        ex=APPROVAL_TIMEOUT_SECONDS * 2,
    )
    if not stored:
        raise ElicitationAlreadyAnswered()


def _confirmation_field(
    schema: dict[str, Any],
) -> tuple[str, str, str | None, str | None] | None:
    """(field, value, title, description) when the schema is one fixed yes."""
    properties = schema.get("properties")
    if not isinstance(properties, dict) or len(properties) != 1:
        return None
    (field, spec), *_ = properties.items()
    if not isinstance(spec, dict) or spec.get("type") != "string":
        return None
    if schema.get("required") != [field]:
        return None
    if "const" in spec:
        value = spec["const"]
    elif isinstance(spec.get("enum"), list) and len(spec["enum"]) == 1:
        value = spec["enum"][0]
    else:
        return None
    if not isinstance(value, str) or not value:
        return None
    title = spec.get("title")
    description = spec.get("description")
    return (
        field,
        value,
        title if isinstance(title, str) else None,
        description if isinstance(description, str) else None,
    )


def build_elicitation_callback(
    *,
    redis_client: TenantRedisClient,
    emitter: Emitter,
    placement: Placement,
    tool_name: str,
    user_id: str,
    timeout_seconds: float = APPROVAL_TIMEOUT_SECONDS,
    poll_interval_seconds: float = _POLL_INTERVAL_SECONDS,
) -> ElicitationFnT:
    """Callback for ``ClientSession(elicitation_callback=...)``."""

    async def callback(
        context: RequestContext[Any, Any],  # noqa: ARG001
        params: types.ElicitRequestParams,
    ) -> types.ElicitResult | types.ErrorData:
        declined = types.ElicitResult(action="decline")
        if not user_id:
            return declined
        if not isinstance(params, types.ElicitRequestFormParams):
            return declined
        confirmation = _confirmation_field(dict(params.requestedSchema))
        if confirmation is None:
            logger.warning(
                "Declined an MCP elicitation from '%s': unsupported request shape",
                tool_name,
            )
            return declined
        if len(params.message) > MAX_APPROVAL_MESSAGE_CHARS:
            logger.warning(
                "Declined an MCP elicitation from '%s': message too long", tool_name
            )
            return declined

        field, value, title, description = confirmation
        approval_id = uuid.uuid4().hex
        redis_client.set(
            _request_key(approval_id),
            json.dumps({"user_id": user_id}),
            ex=int(timeout_seconds) + 60,
        )
        emitter.emit(
            Packet(
                placement=placement,
                obj=CustomToolApprovalRequest(
                    tool_name=tool_name,
                    approval_id=approval_id,
                    message=params.message,
                    title=title,
                    description=description,
                    expires_in_seconds=int(timeout_seconds),
                ),
            )
        )

        outcome: Literal["approved", "declined", "expired"] = "expired"
        try:
            decision = await _wait_for_answer(
                redis_client, approval_id, timeout_seconds, poll_interval_seconds
            )
            if decision == ElicitationDecision.APPROVE.value:
                outcome = "approved"
            elif decision == ElicitationDecision.DECLINE.value:
                outcome = "declined"
        finally:
            redis_client.delete(_request_key(approval_id), _answer_key(approval_id))
            emitter.emit(
                Packet(
                    placement=placement,
                    obj=CustomToolApprovalResult(
                        approval_id=approval_id, outcome=outcome
                    ),
                )
            )

        if outcome == "approved":
            return types.ElicitResult(action="accept", content={field: value})
        if outcome == "declined":
            return declined
        return types.ElicitResult(action="cancel")

    return callback


async def _wait_for_answer(
    redis_client: TenantRedisClient,
    approval_id: str,
    timeout_seconds: float,
    poll_interval_seconds: float,
) -> str | None:
    deadline = time.monotonic() + timeout_seconds
    read: Callable[[], Awaitable[Any]] = lambda: asyncio.to_thread(  # noqa: E731
        redis_client.get, _answer_key(approval_id)
    )
    while True:
        answer = _text(await read())
        if answer is not None:
            return answer
        if time.monotonic() >= deadline:
            return None
        await asyncio.sleep(poll_interval_seconds)
