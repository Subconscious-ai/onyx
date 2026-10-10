from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from onyx.db.enums import (
    MCPAuthenticationPerformer,
    MCPAuthenticationType,
    MCPTransport,
)
from onyx.db.models import MCPConnectionConfig, MCPServer, Persona, Tool, User
from onyx.server.features.mcp.credentials import ResolvedMCPCredentials
from onyx.server.query_and_chat.causl.models import (
    CauslActor,
    CauslChatBinding,
    CauslSelection,
)
from onyx.server.query_and_chat.placement import Placement
from onyx.tools import tool_constructor
from onyx.tools.models import SearchToolUsage
from onyx.tools.tool_implementations.company_profile.company_profile_tool import (
    CompanyProfileTool,
)
from onyx.tools.tool_implementations.file_reader.file_reader_tool import FileReaderTool
from onyx.tools.tool_implementations.mcp import mcp_tool
from onyx.tools.tool_implementations.open_url.open_url_tool import OpenURLTool
from onyx.tools.tool_implementations.search.search_tool import SearchTool


def test_workspace_tools_exclude_personal_search_profile_and_unrelated_connections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User(
        id=uuid4(),
        email="alice@test.example",
        oauth_accounts=[],
        enable_memory_tool=True,
    )
    tools = [
        Tool(id=1, in_code_tool_id=SearchTool.__name__),
        Tool(id=2, in_code_tool_id=CompanyProfileTool.__name__),
        Tool(id=3, in_code_tool_id=OpenURLTool.__name__),
        Tool(id=4, in_code_tool_id=FileReaderTool.__name__),
        Tool(id=5, mcp_server_id=99),
        Tool(id=6, openapi_schema={"openapi": "3.0.0"}),
    ]
    library_tool = Tool(
        id=7,
        name="library_snapshot",
        description="Read accepted KB facts",
        display_name="library_snapshot",
        mcp_server_id=22,
        mcp_input_schema={"type": "object"},
    )
    persona = Persona(
        id=11,
        tools=tools + [library_tool],
        document_sets=[],
        attached_documents=[],
        hierarchy_nodes=[],
    )
    actor = CauslActor(org_id="org_b", user_id="auth0|alice")
    binding = CauslChatBinding(
        user_id=user.id,
        issuer="https://auth.example/",
        actor=actor,
        market_id="market_b",
        chat_id=uuid4(),
        selection=CauslSelection(page="models", market_id="market_b"),
        library_server_id=22,
    )
    server = MCPServer(
        id=22,
        name="KB",
        server_url="https://kb.example/api/mcp/library",
        auth_type=MCPAuthenticationType.OAUTH,
        auth_performer=MCPAuthenticationPerformer.PER_USER,
    )
    credentials = ResolvedMCPCredentials(
        connection_config=MCPConnectionConfig(
            id=33,
            config={
                "headers": {},
                "tokens": {"access_token": "token", "token_type": "Bearer"},
            },
        ),
        user_oauth_token=None,
        auth_type=MCPAuthenticationType.OAUTH,
    )
    for cls in [SearchTool, CompanyProfileTool, OpenURLTool, FileReaderTool]:
        monkeypatch.setattr(cls, "is_available", lambda *_args: True)
    monkeypatch.setattr(
        tool_constructor, "get_current_search_settings", lambda *_args: MagicMock()
    )
    monkeypatch.setattr(
        tool_constructor, "get_default_document_index", lambda *_args: MagicMock()
    )
    connection_lookup = MagicMock(return_value=server)
    monkeypatch.setattr(tool_constructor, "get_mcp_server_by_id", connection_lookup)
    monkeypatch.setattr(
        tool_constructor, "get_all_mcp_tools_for_server", lambda *_args: [library_tool]
    )
    monkeypatch.setattr(
        tool_constructor, "resolve_mcp_credentials", lambda *_args: credentials
    )
    memory_lookup = MagicMock()
    monkeypatch.setattr(tool_constructor, "get_builtin_tool", memory_lookup)
    result = tool_constructor._construct_tools_impl(
        persona,
        MagicMock(),
        MagicMock(),
        user,
        MagicMock(),
        custom_tool_config=tool_constructor.CustomToolConfig(causl_binding=binding),
        allow_user_context=False,
        search_usage_forcing_setting=SearchToolUsage.ENABLED,
    )
    assert set(result) == {4, 7}
    connection_lookup.assert_called_once()
    assert connection_lookup.call_args.args[0] == 22
    memory_lookup.assert_not_called()


def test_bound_actor_headers_win_after_oauth_rotation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = MCPServer(
        id=22,
        name="KB",
        server_url="https://kb.example/api/mcp/library",
        transport=MCPTransport.SSE,
        auth_type=MCPAuthenticationType.OAUTH,
        auth_performer=MCPAuthenticationPerformer.PER_USER,
    )
    connection = MCPConnectionConfig(
        id=33,
        config={
            "headers": {"X-Causl-Expected-Organization": "org_a"},
            "tokens": {"access_token": "old-token", "token_type": "Bearer"},
        },
    )
    credentials = ResolvedMCPCredentials(
        connection_config=connection,
        user_oauth_token=None,
        auth_type=MCPAuthenticationType.OAUTH,
    )
    tool = mcp_tool.MCPTool(
        7,
        MagicMock(),
        server,
        "library_snapshot",
        "Read KB",
        {"type": "object"},
        connection_config=connection,
        user_id=str(uuid4()),
        resolved_credentials=credentials,
        additional_headers={"X-Causl-Expected-Subject": "auth0|bob"},
        bound_actor=CauslActor(org_id="org_b", user_id="auth0|alice"),
        bound_issuer="https://auth.example/",
    )
    monkeypatch.setattr(
        mcp_tool, "refresh_mcp_oauth_token_if_expired", lambda *_args: "Bearer renewed"
    )
    call = MagicMock(return_value={"content": []})
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    tool.run(Placement(turn_index=0))
    assert call.call_count == 1
    headers = {
        key.lower(): value
        for key, value in call.call_args.kwargs["connection_headers"].items()
    }
    assert headers["authorization"] == "Bearer renewed"
    assert headers["x-causl-expected-organization"] == "org_b"
    assert headers["x-causl-expected-subject"] == "auth0|alice"
    assert headers["x-causl-expected-issuer"] == "https://auth.example/"


def test_bound_tool_does_not_use_client_headers_to_replace_a_missing_grant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = MCPServer(id=22, name="KB", auth_type=MCPAuthenticationType.OAUTH)
    credentials = ResolvedMCPCredentials(
        connection_config=None,
        user_oauth_token=None,
        auth_type=MCPAuthenticationType.OAUTH,
    )
    tool = mcp_tool.MCPTool(
        7,
        MagicMock(),
        server,
        "library_snapshot",
        "Read KB",
        {"type": "object"},
        resolved_credentials=credentials,
        additional_headers={"Authorization": "Bearer client-credential"},
        bound_actor=CauslActor(org_id="org_b", user_id="auth0|alice"),
        bound_issuer="https://auth.example/",
    )
    call = MagicMock()
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    response = tool.run(Placement(turn_index=0))
    call.assert_not_called()
    assert "requires connection values" in response.llm_facing_response
