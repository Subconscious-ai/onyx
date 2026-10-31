"""Reading a launched experiment's status for the run card in the chat.

The card is built from the launch result saved in the conversation and then asks
Rehoboam's own status tool (through the same MCP connection the launch used)
whether the run finished. These tests drive that read through a real MCP server.
"""

import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastmcp import FastMCP
from mcp.shared._httpx_utils import create_mcp_http_client

from onyx.db.enums import MCPAuthenticationType
from onyx.error_handling.exceptions import OnyxError
from onyx.server.features.mcp import client as mcp_client
from onyx.server.features.mcp import experiment_run
from onyx.tools.models import CustomToolCallSummary
from tests.unit.onyx.server.features.mcp.mcp_test_server import serve

CHAT_SESSION = uuid4()
LAUNCH_TOOL_ID = 7
STATUS_TOOL_ID = 8
SERVER_ID = 3


class FakeRehoboam:
    def __init__(self) -> None:
        self.status_calls: list[str] = []
        self.states: dict[str, dict[str, Any]] = {
            "run1": {"status": "running", "terminal": False, "successful": None},
            "run2": {"status": "finished", "terminal": True, "successful": True},
            "run3": {"status": "failed", "terminal": True, "successful": False},
        }
        self.broken = False
        self.answers_for: str | None = None

    def server(self) -> FastMCP:
        server = FastMCP("fake-rehoboam")

        @server.tool()
        def get_experiment_status(run_id: str) -> str:
            self.status_calls.append(run_id)
            if self.broken:
                raise RuntimeError("provider unavailable")
            answered = self.answers_for or run_id
            return json.dumps({"run_id": answered, **self.states[run_id]})

        return server


@pytest.fixture
def rehoboam() -> FakeRehoboam:
    return FakeRehoboam()


@pytest.fixture
def server_url(rehoboam: FakeRehoboam) -> Iterator[str]:
    with serve(rehoboam.server()) as url:
        yield url


def _launch_result(run_id: str, shape: str = "chat") -> str:
    """What the conversation saved for the launch tool call.

    ``chat`` is what the chat loop writes for an MCP tool: the whole
    ``CustomToolCallSummary``. ``wrapped`` is the inner wrapper alone, which
    other code paths save.
    """
    inner = json.dumps({"wandb_run_id": run_id, "launch_state": "submitted"})
    if shape == "wrapped":
        return json.dumps({"tool_result": inner})
    return CustomToolCallSummary(
        tool_name="start_experiment",
        response_type="json",
        tool_result={"tool_result": inner},
    ).model_dump_json()


@pytest.fixture
def conversation(monkeypatch: pytest.MonkeyPatch, server_url: str) -> dict[str, Any]:
    """A chat session whose launch tool call saved run ids run1..run3."""
    server = MagicMock()
    server.id = SERVER_ID
    server.name = "Rehoboam"
    server.server_url = server_url
    server.auth_type = MCPAuthenticationType.NONE
    server.transport = None

    tools = {
        LAUNCH_TOOL_ID: SimpleNamespace(
            id=LAUNCH_TOOL_ID, name="start_experiment", mcp_server_id=SERVER_ID
        ),
        STATUS_TOOL_ID: SimpleNamespace(
            id=STATUS_TOOL_ID,
            name="get_experiment_status",
            description="Read run status",
            mcp_input_schema={"type": "object", "properties": {}},
            mcp_server_id=SERVER_ID,
        ),
        99: SimpleNamespace(id=99, name="web_search", mcp_server_id=None),
        100: SimpleNamespace(id=100, name="find_experiments", mcp_server_id=SERVER_ID),
    }
    state: dict[str, Any] = {
        "owned": True,
        "launches": {
            "run1": [LAUNCH_TOOL_ID],
            "run2": [LAUNCH_TOOL_ID],
            "run3": [LAUNCH_TOOL_ID],
        },
        "tools": tools,
    }

    def get_chat_session_by_id(session_id: Any, user_id: Any, db_session: Any) -> Any:
        del user_id, db_session
        if not state["owned"] or session_id != CHAT_SESSION:
            raise ValueError("Invalid Chat Session ID provided")
        return SimpleNamespace(id=session_id)

    def launch_tool_calls(db_session: Any, chat_session_id: Any, run_id: str) -> Any:
        del db_session, chat_session_id
        shape = state.get("launch_shape", "chat")
        response = state.get("raw_launch_response")
        if response is not None:
            return [
                SimpleNamespace(tool_id=LAUNCH_TOOL_ID, tool_call_response=response)
            ]
        return [
            SimpleNamespace(
                tool_id=tool_id, tool_call_response=_launch_result(run_id, shape)
            )
            for tool_id in state["launches"].get(run_id, [])
        ]

    monkeypatch.setattr(
        experiment_run, "get_chat_session_by_id", get_chat_session_by_id
    )
    monkeypatch.setattr(experiment_run, "_launch_tool_calls", launch_tool_calls)
    monkeypatch.setattr(
        experiment_run, "get_tool_by_id", lambda tool_id, _db: tools[tool_id]
    )
    monkeypatch.setattr(experiment_run, "get_mcp_server_by_id", lambda *_a: server)
    monkeypatch.setattr(
        experiment_run,
        "get_all_mcp_tools_for_server",
        lambda *_a: [t for t in tools.values() if t.mcp_server_id == SERVER_ID],
    )
    monkeypatch.setattr(
        experiment_run,
        "resolve_mcp_credentials",
        lambda *_a, **_k: MagicMock(
            connection_config=None,
            user_oauth_token=None,
            build_headers=lambda: {},
            can_authenticate=lambda: True,
            needs_reauth=lambda: False,
            auth_type=MCPAuthenticationType.NONE,
        ),
    )
    # The guard blocks loopback addresses; the fake server is on loopback.
    monkeypatch.setattr(
        mcp_client, "mcp_ssrf_httpx_client_factory", create_mcp_http_client
    )
    return state


def _read(run_id: str) -> Any:
    user: Any = SimpleNamespace(id=uuid4(), email="a@example.com")
    return experiment_run.get_experiment_run_status(
        MagicMock(), user, CHAT_SESSION, run_id
    )


@pytest.mark.usefixtures("conversation")
def test_a_running_launch_reports_running_and_not_done() -> None:
    result = _read("run1")

    assert result.model_dump() == {
        "run_id": "run1",
        "status": "running",
        "terminal": False,
        "successful": None,
    }


def test_a_launch_saved_in_the_other_wrapper_shape_is_read_too(
    conversation: dict[str, Any],
) -> None:
    conversation["launch_shape"] = "wrapped"

    assert _read("run1").status == "running"


@pytest.mark.usefixtures("conversation")
def test_a_finished_launch_reports_success() -> None:
    result = _read("run2")

    assert (result.status, result.terminal, result.successful) == (
        "finished",
        True,
        True,
    )


@pytest.mark.usefixtures("conversation")
def test_a_failed_launch_reports_failure() -> None:
    result = _read("run3")

    assert (result.status, result.terminal, result.successful) == (
        "failed",
        True,
        False,
    )


def test_a_run_not_launched_in_this_conversation_is_not_found_and_never_asked(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    conversation["launches"] = {}

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 404
    assert rehoboam.status_calls == []


def test_someone_elses_conversation_is_not_found(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    conversation["owned"] = False

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 404
    assert rehoboam.status_calls == []


def test_a_run_id_that_only_appears_in_some_other_tools_result_is_not_found(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    conversation["launches"] = {"run1": [99]}  # a web search that mentioned it

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 404
    assert rehoboam.status_calls == []


def test_a_run_id_listed_by_another_tool_on_the_same_server_is_not_a_launch(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    conversation["launches"] = {"run1": [100]}  # find_experiments listed it

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 404
    assert rehoboam.status_calls == []


def test_a_launch_result_for_a_different_run_does_not_authorize_this_one(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    # The saved launch result names run2 but also mentions run1 in free text.
    inner = json.dumps(
        {"wandb_run_id": "run2", "launch_state": "submitted", "note": "after run1"}
    )
    response = CustomToolCallSummary(
        tool_name="start_experiment",
        response_type="json",
        tool_result={"tool_result": inner},
    ).model_dump_json()
    conversation["raw_launch_response"] = response

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 404
    assert rehoboam.status_calls == []


def test_an_answer_about_a_different_run_is_never_shown_as_this_runs(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    del conversation
    rehoboam.answers_for = "run2"

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 502


@pytest.mark.parametrize("run_id", ["../x", "a b", "", "x" * 200, "run1;drop"])
def test_a_malformed_run_id_is_rejected_before_anything_is_read(
    run_id: str, rehoboam: FakeRehoboam
) -> None:
    with pytest.raises(OnyxError) as error:
        _read(run_id)

    assert error.value.status_code == 400
    assert rehoboam.status_calls == []


def test_a_provider_failure_is_a_bad_gateway_not_a_failed_run(
    conversation: dict[str, Any], rehoboam: FakeRehoboam
) -> None:
    del conversation
    rehoboam.broken = True

    with pytest.raises(OnyxError) as error:
        _read("run1")

    assert error.value.status_code == 502
