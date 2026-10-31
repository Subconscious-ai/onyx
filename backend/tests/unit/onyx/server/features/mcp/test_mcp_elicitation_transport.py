"""A paid launch asked over a real MCP connection, answered by the real user path.

A FastMCP server reached over streamable HTTP stops its tool to ask for approval,
exactly as Rehoboam's ``start_experiment`` does. ``MCPTool.run`` runs in a worker
thread as it does in a chat turn; the signed-in user answers from another thread
through the same function the HTTP route calls.
"""

import json
import threading
import time
from queue import Empty, Queue
from types import SimpleNamespace
from typing import Any, Iterator
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastmcp import Context, FastMCP
from fastmcp.server.elicitation import AcceptedElicitation
from mcp.shared._httpx_utils import create_mcp_http_client

from onyx.chat.emitter import Emitter
from onyx.db.enums import MCPAuthenticationType
from onyx.server.features.mcp import api as mcp_api
from onyx.server.features.mcp import client as mcp_client
from onyx.server.query_and_chat.placement import Placement
from onyx.server.query_and_chat.streaming_models import (
    CustomToolApprovalRequest,
    CustomToolApprovalResult,
)
from onyx.tools.tool_implementations.mcp import mcp_tool
from onyx.tools.tool_implementations.mcp.mcp_tool import MCPTool
from tests.unit.onyx.server.features.mcp.mcp_fake_redis import FakeRedis
from tests.unit.onyx.server.features.mcp.mcp_test_server import serve

CONFIRMATION = "approve_exact_specification"


def _fake_rehoboam() -> FastMCP:
    server = FastMCP("fake-rehoboam")

    @server.tool()
    async def start_experiment(ctx: Context) -> str:
        answer = await ctx.elicit(
            "Approve one paid experiment?\nSpecification hash: sha256:abc",
            [CONFIRMATION],
        )
        if isinstance(answer, AcceptedElicitation) and answer.data == CONFIRMATION:
            return "launched run-1"
        return "not launched"

    return server


@pytest.fixture
def server_url() -> Iterator[str]:
    with serve(_fake_rehoboam()) as url:
        yield url


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr(mcp_tool, "get_redis_client", lambda: fake)
    monkeypatch.setattr(mcp_api, "get_redis_client", lambda: fake)
    # The guard blocks loopback addresses; the server under test is on loopback.
    monkeypatch.setattr(
        mcp_client, "mcp_ssrf_httpx_client_factory", create_mcp_http_client
    )
    return fake


def _launch_from_a_chat_turn(
    server_url: str, user_id: str, queue: Queue
) -> tuple[threading.Thread, dict[str, Any]]:
    server = MagicMock()
    server.name = "Rehoboam"
    server.server_url = server_url
    server.auth_type = MCPAuthenticationType.NONE
    server.transport = None
    tool = MCPTool(
        tool_id=1,
        emitter=Emitter(merged_queue=queue, drain_done=threading.Event()),
        mcp_server=server,
        tool_name="start_experiment",
        tool_description="Paid run",
        tool_definition={"type": "object", "properties": {}},
        user_id=user_id,
    )
    outcome: dict[str, Any] = {}

    def run() -> None:
        outcome["response"] = tool.run(Placement(turn_index=0))

    thread = threading.Thread(target=run)
    thread.start()
    return thread, outcome


def _wait_for(queue: Queue, kind: type) -> Any:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            _, packet = queue.get(timeout=0.2)
        except Empty:
            continue
        if isinstance(packet.obj, kind):
            return packet.obj
    raise AssertionError(f"no {kind.__name__} arrived")


def _tool_result(outcome: dict[str, Any]) -> str:
    return json.loads(outcome["response"].llm_facing_response)["tool_result"]


@pytest.mark.usefixtures("redis")
def test_approving_the_card_lets_the_server_launch(server_url: str) -> None:
    user: Any = SimpleNamespace(id=uuid4())
    queue: Queue = Queue()
    thread, outcome = _launch_from_a_chat_turn(server_url, str(user.id), queue)

    request = _wait_for(queue, CustomToolApprovalRequest)
    assert "Specification hash: sha256:abc" in request.message
    mcp_api.answer_mcp_elicitation(
        request.approval_id, mcp_api.MCPElicitationAnswer(decision="approve"), user
    )
    thread.join(timeout=20)

    assert not thread.is_alive()
    assert _tool_result(outcome) == "launched run-1"
    closed = _wait_for(queue, CustomToolApprovalResult)
    assert (closed.approval_id, closed.outcome) == (request.approval_id, "approved")


@pytest.mark.usefixtures("redis")
def test_declining_the_card_launches_nothing(server_url: str) -> None:
    user: Any = SimpleNamespace(id=uuid4())
    queue: Queue = Queue()
    thread, outcome = _launch_from_a_chat_turn(server_url, str(user.id), queue)

    request = _wait_for(queue, CustomToolApprovalRequest)
    mcp_api.answer_mcp_elicitation(
        request.approval_id, mcp_api.MCPElicitationAnswer(decision="decline"), user
    )
    thread.join(timeout=20)

    assert _tool_result(outcome) == "not launched"
    assert _wait_for(queue, CustomToolApprovalResult).outcome == "declined"
