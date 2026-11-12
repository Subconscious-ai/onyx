from types import SimpleNamespace
from typing import cast

import pytest

from onyx.db.models import Tool as ToolDBModel
from onyx.server.query_and_chat.causl.models import CauslChatBinding
from onyx.tools.tool_constructor import _hidden_in_causl_workspace


def _tool(server_id: int | None, in_code: str | None = None) -> ToolDBModel:
    return cast(
        ToolDBModel, SimpleNamespace(mcp_server_id=server_id, in_code_tool_id=in_code)
    )


def _binding(mode: str, library_server_id: int = 8) -> CauslChatBinding:
    return cast(
        CauslChatBinding,
        SimpleNamespace(mode=mode, library_server_id=library_server_id),
    )


def test_workspace_keeps_library_and_pinned_servers_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    binding = _binding("workspace")
    monkeypatch.delenv("CAUSL_KB_HOST_MCP_SERVERS", raising=False)
    assert not _hidden_in_causl_workspace(binding, _tool(8))
    assert _hidden_in_causl_workspace(binding, _tool(9))
    assert _hidden_in_causl_workspace(binding, _tool(None))
    assert not _hidden_in_causl_workspace(binding, _tool(None, in_code="SearchTool"))
    monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", "9=http://ep-mcp:8000/mcp")
    assert not _hidden_in_causl_workspace(binding, _tool(9))
    assert _hidden_in_causl_workspace(binding, _tool(10))


def test_non_workspace_chats_are_not_filtered() -> None:
    assert not _hidden_in_causl_workspace(None, _tool(9))
    assert not _hidden_in_causl_workspace(_binding("interview"), _tool(9))
