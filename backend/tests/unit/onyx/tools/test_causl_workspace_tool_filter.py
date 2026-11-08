from types import SimpleNamespace

import pytest

from onyx.tools.tool_constructor import _hidden_in_causl_workspace


def _tool(server_id: int | None, in_code: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(mcp_server_id=server_id, in_code_tool_id=in_code)


def test_workspace_keeps_library_and_pinned_servers_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    binding = SimpleNamespace(mode="workspace", library_server_id=8)
    monkeypatch.delenv("CAUSL_KB_HOST_MCP_SERVERS", raising=False)
    assert not _hidden_in_causl_workspace(binding, _tool(8))
    assert _hidden_in_causl_workspace(binding, _tool(9))
    assert not _hidden_in_causl_workspace(binding, _tool(None, in_code="SearchTool"))
    monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", "9=http://ep-mcp:8000/mcp")
    assert not _hidden_in_causl_workspace(binding, _tool(9))
    assert _hidden_in_causl_workspace(binding, _tool(10))


def test_non_workspace_chats_are_not_filtered() -> None:
    assert not _hidden_in_causl_workspace(None, _tool(9))
    other = SimpleNamespace(mode="model", library_server_id=8)
    assert not _hidden_in_causl_workspace(other, _tool(9))
