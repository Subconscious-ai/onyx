from collections.abc import Coroutine
import json
from typing import Any

import pytest
from mcp import ClientSession
from mcp.types import CallToolResult, TextContent

from onyx.server.features.mcp import client
from onyx.server.features.mcp.oauth import MCPReauthenticationRequired


def test_sync_client_unwraps_nested_reauthentication_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reauthentication_required = MCPReauthenticationRequired()

    def raise_nested_error(coroutine: Coroutine[Any, Any, object]) -> object:
        coroutine.close()
        raise ExceptionGroup(
            "transport cleanup",
            [ExceptionGroup("request failed", [reauthentication_required])],
        )

    async def operation(_session: ClientSession) -> None:
        raise AssertionError("transport should fail before opening a session")

    monkeypatch.setattr(client, "run_async_sync_no_cancel", raise_nested_error)

    with pytest.raises(MCPReauthenticationRequired) as exc_info:
        client._call_mcp_client_function_sync(
            operation,
            "https://mcp.example.com/mcp",
        )

    assert exc_info.value is reauthentication_required


def test_rehoboam_evidence_views_become_chat_file_blocks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    saved: list[tuple[bytes, str]] = []

    class FileStore:
        def save_file(self, content: Any, file_type: str, **_: Any) -> str:
            saved.append((content.read(), file_type))
            return "view-1"

    monkeypatch.setattr(
        "onyx.file_store.file_store.get_default_file_store", lambda: FileStore()
    )
    view = {"id": "effect-interval/v1", "result": {"run_id": "run-1"}}
    result = CallToolResult(
        content=[TextContent(type="text", text="Effect summary")],
        structuredContent={
            "data": {"charts": [{"type": "vega_lite", "view": view}, {"spec": {}}]}
        },
    )

    assert client.process_mcp_result(result) == (
        "Effect summary\n\n```rehoboam-view\n/api/chat/file/view-1\n```"
    )
    assert saved == [(json.dumps(view).encode(), "application/json")]
