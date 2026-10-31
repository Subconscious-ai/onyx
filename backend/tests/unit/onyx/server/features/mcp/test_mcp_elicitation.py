"""Behavior of the trusted launch approval that answers an MCP elicitation.

Rehoboam's ``start_experiment`` asks the MCP client to show the exact paid
specification and wait for a human yes. These tests drive the approval from the
outside: an MCP server asks, the packet stream shows a card, an authenticated
user answers over HTTP, and the server receives the answer.
"""

import asyncio
import json
from queue import Empty, Queue
from typing import Any, cast

import anyio
import pytest
from mcp import types
from mcp.server.lowlevel import Server
from mcp.shared.memory import create_connected_server_and_client_session

from onyx.chat.emitter import Emitter
from onyx.db.enums import MCPAuthenticationType
from onyx.server.features.mcp import client as mcp_client
from onyx.server.features.mcp.elicitation import (
    ElicitationAlreadyAnswered,
    ElicitationNotFound,
    build_elicitation_callback,
    submit_decision,
)
from onyx.server.query_and_chat.placement import Placement
from onyx.server.query_and_chat.streaming_models import (
    CustomToolApprovalRequest,
    CustomToolApprovalResult,
    Packet,
)
from tests.unit.onyx.server.features.mcp.mcp_fake_redis import FakeRedis

# Captured from Rehoboam's server (fastmcp 3.4.0) answering
# ``ctx.elicit(message, ["approve_exact_specification"], response_title=...,
# response_description=...)``. The client answers with ``{"value": <const>}``.
REHOBOAM_APPROVAL_SCHEMA: dict[str, Any] = {
    "properties": {
        "value": {
            "const": "approve_exact_specification",
            "title": "Paid experiment approval",
            "type": "string",
            "description": "Approve this exact specification and no other.",
        }
    },
    "required": ["value"],
    "title": "ScalarElicitationType",
    "type": "object",
}
SPEC_MESSAGE = (
    "Approve one paid experiment for this exact normalized specification?\n\n"
    "Specification hash: sha256:abc123\n"
)


def _params(
    message: str = SPEC_MESSAGE, schema: dict[str, Any] | None = None
) -> types.ElicitRequestFormParams:
    return types.ElicitRequestFormParams(
        message=message,
        requestedSchema=cast(Any, schema or REHOBOAM_APPROVAL_SCHEMA),
    )


def _build(
    *,
    redis: FakeRedis,
    user_id: str = "user-1",
    timeout_seconds: float = 2.0,
) -> tuple[Any, Queue]:
    queue: Queue = Queue()
    callback = build_elicitation_callback(
        redis_client=cast(Any, redis),
        emitter=Emitter(merged_queue=queue),
        placement=Placement(turn_index=0, tab_index=0),
        tool_name="mcp_rehoboam_start_experiment",
        user_id=user_id,
        timeout_seconds=timeout_seconds,
        poll_interval_seconds=0.005,
    )
    return callback, queue


async def _next_packet(queue: Queue, kind: type) -> Any:
    for _ in range(400):
        try:
            _, packet = queue.get_nowait()
        except Empty:
            await asyncio.sleep(0.005)
            continue
        assert isinstance(packet, Packet)
        assert isinstance(packet.obj, kind), packet.obj
        return packet.obj
    raise AssertionError(f"no {kind.__name__} packet arrived")


def _drain(queue: Queue) -> list[Any]:
    packets = []
    while True:
        try:
            packets.append(queue.get_nowait()[1].obj)
        except Empty:
            return packets


@pytest.mark.asyncio
async def test_approve_returns_the_exact_confirmation_value_and_closes_the_card() -> (
    None
):
    redis = FakeRedis()
    callback, queue = _build(redis=redis)

    task = asyncio.create_task(callback(None, _params()))
    request = await _next_packet(queue, CustomToolApprovalRequest)

    # The card carries the server's own words, unmodified, and the labels.
    assert request.message == SPEC_MESSAGE
    assert request.title == "Paid experiment approval"
    assert request.description == "Approve this exact specification and no other."
    assert request.tool_name == "mcp_rehoboam_start_experiment"

    submit_decision(cast(Any, redis), request.approval_id, "user-1", "approve")
    result = await task

    assert isinstance(result, types.ElicitResult)
    assert result.action == "accept"
    assert result.content == {"value": "approve_exact_specification"}
    closed = await _next_packet(queue, CustomToolApprovalResult)
    assert (closed.approval_id, closed.outcome) == (request.approval_id, "approved")
    assert redis.store == {}  # nothing lingers after the answer


@pytest.mark.asyncio
async def test_decline_launches_nothing() -> None:
    redis = FakeRedis()
    callback, queue = _build(redis=redis)

    task = asyncio.create_task(callback(None, _params()))
    request = await _next_packet(queue, CustomToolApprovalRequest)
    submit_decision(cast(Any, redis), request.approval_id, "user-1", "decline")
    result = await task

    assert isinstance(result, types.ElicitResult)
    assert result.action == "decline"
    assert result.content is None
    closed = await _next_packet(queue, CustomToolApprovalResult)
    assert closed.outcome == "declined"


@pytest.mark.asyncio
async def test_no_answer_in_time_cancels_and_marks_the_card_expired() -> None:
    redis = FakeRedis()
    callback, queue = _build(redis=redis, timeout_seconds=0.05)

    result = await callback(None, _params())

    assert isinstance(result, types.ElicitResult)
    assert result.action == "cancel"
    packets = _drain(queue)
    assert [type(p) for p in packets] == [
        CustomToolApprovalRequest,
        CustomToolApprovalResult,
    ]
    assert packets[1].outcome == "expired"
    assert redis.store == {}


@pytest.mark.asyncio
async def test_a_different_user_cannot_answer_and_the_owner_still_can() -> None:
    redis = FakeRedis()
    callback, queue = _build(redis=redis)

    task = asyncio.create_task(callback(None, _params()))
    request = await _next_packet(queue, CustomToolApprovalRequest)

    with pytest.raises(ElicitationNotFound):
        submit_decision(cast(Any, redis), request.approval_id, "user-2", "approve")
    assert not task.done()

    submit_decision(cast(Any, redis), request.approval_id, "user-1", "approve")
    result = await task
    assert isinstance(result, types.ElicitResult)
    assert result.action == "accept"


@pytest.mark.asyncio
async def test_first_answer_wins() -> None:
    redis = FakeRedis()
    callback, queue = _build(redis=redis)

    task = asyncio.create_task(callback(None, _params()))
    request = await _next_packet(queue, CustomToolApprovalRequest)
    submit_decision(cast(Any, redis), request.approval_id, "user-1", "decline")

    with pytest.raises(ElicitationAlreadyAnswered):
        submit_decision(cast(Any, redis), request.approval_id, "user-1", "approve")

    result = await task
    assert isinstance(result, types.ElicitResult)
    assert result.action == "decline"


def test_answering_an_unknown_or_expired_approval_is_not_found() -> None:
    with pytest.raises(ElicitationNotFound):
        submit_decision(cast(Any, FakeRedis()), "never-issued", "user-1", "approve")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "schema",
    [
        # Two fields: not a plain yes.
        {
            "type": "object",
            "properties": {
                "value": {"type": "string", "const": "yes"},
                "extra": {"type": "string", "const": "x"},
            },
            "required": ["value", "extra"],
        },
        # Free text: the user would have to type something the server defines.
        {
            "type": "object",
            "properties": {"value": {"type": "string"}},
            "required": ["value"],
        },
        # Several choices: Onyx does not guess which one means yes.
        {
            "type": "object",
            "properties": {"value": {"type": "string", "enum": ["a", "b"]}},
            "required": ["value"],
        },
        # Not a string.
        {
            "type": "object",
            "properties": {"value": {"type": "boolean"}},
            "required": ["value"],
        },
        # Optional answer.
        {
            "type": "object",
            "properties": {"value": {"type": "string", "const": "yes"}},
        },
    ],
)
async def test_any_request_that_is_not_a_single_fixed_confirmation_is_declined(
    schema: dict[str, Any],
) -> None:
    callback, queue = _build(redis=FakeRedis())

    result = await callback(None, _params(schema=schema))

    assert isinstance(result, types.ElicitResult)
    assert result.action == "decline"
    assert _drain(queue) == []  # the user is never shown a card they cannot use


@pytest.mark.asyncio
async def test_url_mode_is_declined() -> None:
    callback, queue = _build(redis=FakeRedis())
    params = types.ElicitRequestURLParams(
        message="Sign in", url="https://example.com/auth", elicitationId="e-1"
    )

    result = await callback(None, params)

    assert isinstance(result, types.ElicitResult)
    assert result.action == "decline"
    assert _drain(queue) == []


@pytest.mark.asyncio
async def test_a_specification_too_long_to_show_in_full_is_declined() -> None:
    callback, queue = _build(redis=FakeRedis())

    result = await callback(None, _params(message="x" * 200_001))

    assert isinstance(result, types.ElicitResult)
    assert result.action == "decline"
    assert _drain(queue) == []


@pytest.mark.asyncio
async def test_no_signed_in_user_means_no_approval() -> None:
    callback, queue = _build(redis=FakeRedis(), user_id="")

    result = await callback(None, _params())

    assert isinstance(result, types.ElicitResult)
    assert result.action == "decline"
    assert _drain(queue) == []


@pytest.mark.asyncio
async def test_a_real_mcp_client_session_answers_a_server_elicitation() -> None:
    """The SDK accepts our result and the server's tool receives the answer."""
    redis = FakeRedis()
    callback, queue = _build(redis=redis)
    seen: dict[str, Any] = {}

    server: Server = Server("fake-rehoboam")

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="start_experiment",
                description="Paid run",
                inputSchema={"type": "object", "properties": {}},
            )
        ]

    @server.call_tool()
    async def call_tool(
        name: str, arguments: dict[str, Any]
    ) -> list[types.TextContent]:
        del arguments
        assert name == "start_experiment"
        answer = await server.request_context.session.elicit_form(
            message=SPEC_MESSAGE,
            requestedSchema=cast(Any, REHOBOAM_APPROVAL_SCHEMA),
            related_request_id=server.request_context.request_id,
        )
        seen["action"] = answer.action
        seen["content"] = answer.content
        return [types.TextContent(type="text", text=json.dumps(answer.content))]

    async def user_approves() -> None:
        request = await _next_packet(queue, CustomToolApprovalRequest)
        submit_decision(cast(Any, redis), request.approval_id, "user-1", "approve")

    async with create_connected_server_and_client_session(
        server, elicitation_callback=callback
    ) as session:
        async with anyio.create_task_group() as group:
            group.start_soon(user_approves)
            result = await session.call_tool("start_experiment", {})

    assert seen == {
        "action": "accept",
        "content": {"value": "approve_exact_specification"},
    }
    assert not result.isError


@pytest.fixture
def session_kwargs(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Swap the real transport and session for fakes; return what the session got."""
    captured: dict[str, Any] = {}

    class RecordingSession:
        def __init__(self, _read: Any, _write: Any, **kwargs: Any) -> None:
            captured.update(kwargs)

        async def __aenter__(self) -> "RecordingSession":
            return self

        async def __aexit__(self, *_exc: object) -> None:
            return None

        async def initialize(self) -> None:
            return None

        async def call_tool(self, _name: str, _arguments: dict[str, Any]) -> Any:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text="ok")]
            )

    class FakeTransport:
        async def __aenter__(self) -> tuple[Any, Any, Any]:
            return object(), object(), None

        async def __aexit__(self, *_exc: object) -> None:
            return None

    monkeypatch.setattr(mcp_client, "ClientSession", RecordingSession)
    monkeypatch.setattr(
        mcp_client, "streamablehttp_client", lambda *_a, **_k: FakeTransport()
    )
    return captured


def test_call_mcp_tool_hands_the_callback_to_the_client_session(
    session_kwargs: dict[str, Any],
) -> None:
    async def callback(context: Any, params: Any) -> types.ElicitResult:
        del context, params
        return types.ElicitResult(action="decline")

    out = mcp_client.call_mcp_tool(
        "https://mcp.example.com/mcp",
        "start_experiment",
        {},
        elicitation_callback=callback,
    )

    assert out == "ok"
    assert session_kwargs["elicitation_callback"] is callback


def test_without_a_callback_the_session_does_not_advertise_elicitation(
    session_kwargs: dict[str, Any],
) -> None:
    mcp_client.call_mcp_tool("https://mcp.example.com/mcp", "search", {})

    assert session_kwargs["elicitation_callback"] is None


def _tool(user_id: str, emitter: Any) -> Any:
    from unittest.mock import MagicMock

    from onyx.tools.tool_implementations.mcp.mcp_tool import MCPTool

    server = MagicMock()
    server.name = "Rehoboam"
    server.server_url = "https://mcp.example"
    server.auth_type = MCPAuthenticationType.NONE
    server.transport = None
    return MCPTool(
        tool_id=1,
        emitter=emitter,
        mcp_server=server,
        tool_name="start_experiment",
        tool_description="Paid run",
        tool_definition={"type": "object", "properties": {}},
        user_id=user_id,
    )


def _callback_given_to_the_server(monkeypatch: pytest.MonkeyPatch, tool: Any) -> Any:
    from unittest.mock import MagicMock

    from onyx.tools.tool_implementations.mcp import mcp_tool

    call = MagicMock(return_value="ok")
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    monkeypatch.setattr(mcp_tool, "get_redis_client", lambda: FakeRedis())
    tool.run(Placement(turn_index=0))
    return call.call_args.kwargs["elicitation_callback"]


def test_a_signed_in_chat_user_can_be_asked_to_approve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitter = Emitter(merged_queue=Queue())

    callback = _callback_given_to_the_server(monkeypatch, _tool("user-1", emitter))

    assert callable(callback)


def test_a_call_with_no_user_is_never_offered_an_approval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitter = Emitter(merged_queue=Queue())

    assert _callback_given_to_the_server(monkeypatch, _tool("", emitter)) is None


def test_a_call_with_nowhere_to_show_the_card_is_never_offered_an_approval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from onyx.chat.emitter import NullEmitter

    assert (
        _callback_given_to_the_server(monkeypatch, _tool("user-1", NullEmitter()))
        is None
    )


@pytest.mark.parametrize(
    "obj",
    [
        CustomToolApprovalRequest(
            tool_name="mcp_rehoboam_start_experiment",
            approval_id="a1",
            message=SPEC_MESSAGE,
            title="Paid experiment approval",
            description=None,
            expires_in_seconds=180,
        ),
        CustomToolApprovalResult(approval_id="a1", outcome="approved"),
    ],
)
def test_approval_packets_survive_the_wire_the_chat_stream_uses(obj: Any) -> None:
    packet = Packet(placement=Placement(turn_index=0, tab_index=0), obj=obj)

    assert Packet.model_validate_json(packet.model_dump_json()) == packet
