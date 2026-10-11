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
from onyx.server.query_and_chat.causl.statement import CauslStatement
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
    assert isinstance(result[7][0], mcp_tool.MCPTool)
    assert result[7][0]._bound_market_id == "market_b"
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


def test_fact_preparation_requires_a_persisted_executive_statement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = MCPServer(
        id=22,
        name="KB",
        server_url="https://kb.example/api/mcp/library",
        auth_type=MCPAuthenticationType.NONE,
    )
    tool = mcp_tool.MCPTool(
        7,
        MagicMock(),
        server,
        "prepare_library_change",
        "Prepare a fact for review",
        {"type": "object"},
        bound_actor=CauslActor(org_id="org_b", user_id="auth0|alice"),
        bound_issuer="https://auth.example/",
    )
    call = MagicMock(return_value={"content": []})
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    response = tool.run(
        Placement(turn_index=0),
        quote="Our product supports SSO.",
        source={"chatId": str(uuid4()), "messageId": 91},
    )
    call.assert_not_called()
    assert "executive statement" in response.llm_facing_response


@pytest.fixture
def statement_tool() -> tuple[mcp_tool.MCPTool, CauslStatement]:
    actor = CauslActor(org_id="org_b", user_id="auth0|alice")
    statement = CauslStatement(
        actor=actor,
        issuer="https://auth.example/",
        market_id="market_b",
        chat_id=uuid4(),
        message_id=123,
        message="Correct our product record. Our product supports SSO. Other text stays private.",
    )
    server = MCPServer(
        id=22,
        name="KB",
        server_url="https://kb.example/api/mcp/library",
        auth_type=MCPAuthenticationType.NONE,
    )
    tool = mcp_tool.MCPTool(
        7,
        MagicMock(),
        server,
        "prepare_library_change",
        "Prepare a fact for review",
        {
            "type": "object",
            "properties": {
                "quote": {"type": "string"},
                "change": {"type": "object"},
                "source": {"type": "object"},
                "market": {"type": ["string", "null"]},
            },
            "required": ["quote", "change", "source", "market"],
        },
        bound_actor=actor,
        bound_issuer=statement.issuer,
        bound_statement=statement,
    )
    return tool, statement


def test_fact_preparation_replaces_invented_citation_and_market_with_native_source(
    statement_tool: tuple[mcp_tool.MCPTool, CauslStatement],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tool, statement = statement_tool
    call = MagicMock(return_value={"content": []})
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    change = {
        "kind": "product_value",
        "productId": "offering_b",
        "attributeId": "sso",
        "value": "yes",
        "label": "SSO supported",
    }
    tool.run(
        Placement(turn_index=0),
        change=change,
        quote="Our product supports SSO.",
        market="market_a",
        source={
            "chatId": str(uuid4()),
            "messageId": 456,
            "excerpt": "Invented evidence",
        },
    )
    arguments = call.call_args.args[2]
    assert arguments == {
        "change": change,
        "quote": "Our product supports SSO.",
        "market": "market_b",
        "source": {
            "chatId": str(statement.chat_id),
            "messageId": 123,
            "excerpt": "Our product supports SSO.",
        },
    }
    assert "Other text stays private" not in str(arguments)


@pytest.mark.parametrize(
    "quote", ["Our product does not support SSO.", " ", "x" * 1201, None, 123]
)
def test_fact_preparation_refuses_unsupported_quotes_before_any_network_request(
    statement_tool: tuple[mcp_tool.MCPTool, CauslStatement],
    monkeypatch: pytest.MonkeyPatch,
    quote: object,
) -> None:
    tool, _statement = statement_tool
    call = MagicMock()
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    response = tool.run(Placement(turn_index=0), quote=quote)
    call.assert_not_called()
    assert "exact excerpt" in response.llm_facing_response


@pytest.mark.parametrize("mismatch", ["actor", "issuer"])
def test_fact_preparation_refuses_a_statement_from_another_workspace_identity(
    statement_tool: tuple[mcp_tool.MCPTool, CauslStatement],
    monkeypatch: pytest.MonkeyPatch,
    mismatch: str,
) -> None:
    tool, _statement = statement_tool
    if mismatch == "actor":
        tool._bound_actor = CauslActor(org_id="org_a", user_id="auth0|alice")
    else:
        tool._bound_issuer = "https://other-auth.example/"
    call = MagicMock()
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    response = tool.run(Placement(turn_index=0), quote="Our product supports SSO.")
    call.assert_not_called()
    assert "verified executive statement" in response.llm_facing_response


def test_fact_schema_leaves_citation_and_market_to_the_runtime(
    statement_tool: tuple[mcp_tool.MCPTool, CauslStatement],
) -> None:
    tool, _statement = statement_tool
    schema = tool.tool_definition()["function"]["parameters"]
    assert set(schema["properties"]) == {"change", "quote"}
    assert schema["required"] == ["quote", "change"]
    assert set(tool._tool_definition["properties"]) == {
        "change",
        "quote",
        "source",
        "market",
    }


@pytest.mark.parametrize("workspace_bound", [True, False])
def test_native_tool_construction_supplies_fact_source_only_in_the_bound_workspace(
    monkeypatch: pytest.MonkeyPatch,
    statement_tool: tuple[mcp_tool.MCPTool, CauslStatement],
    workspace_bound: bool,
) -> None:
    _tool, statement = statement_tool
    user = User(id=uuid4(), email="alice@test.example", oauth_accounts=[])
    binding = CauslChatBinding(
        user_id=user.id,
        actor=statement.actor,
        issuer=statement.issuer,
        market_id=statement.market_id,
        chat_id=statement.chat_id,
        selection=CauslSelection(page="library", market_id=statement.market_id),
        library_server_id=22,
    )
    saved_tool = Tool(
        id=7,
        name="prepare_library_change",
        display_name="prepare_library_change",
        description="Prepare a fact for review",
        mcp_server_id=22,
        mcp_input_schema={"type": "object"},
    )
    persona = Persona(
        id=11,
        tools=[saved_tool],
        document_sets=[],
        attached_documents=[],
        hierarchy_nodes=[],
    )
    server = MCPServer(
        id=22,
        name="KB",
        auth_type=MCPAuthenticationType.NONE,
        server_url="https://kb.example/api/mcp/library",
    )
    monkeypatch.setattr(
        tool_constructor, "get_current_search_settings", lambda *_args: MagicMock()
    )
    monkeypatch.setattr(
        tool_constructor, "get_default_document_index", lambda *_args: MagicMock()
    )
    monkeypatch.setattr(tool_constructor, "get_mcp_server_by_id", lambda *_args: server)
    monkeypatch.setattr(
        tool_constructor, "get_all_mcp_tools_for_server", lambda *_args: [saved_tool]
    )
    monkeypatch.setattr(
        tool_constructor,
        "resolve_mcp_credentials",
        lambda *_args: ResolvedMCPCredentials(
            connection_config=None,
            user_oauth_token=None,
            auth_type=MCPAuthenticationType.NONE,
        ),
    )
    lookup = MagicMock(return_value=statement)
    monkeypatch.setattr(tool_constructor, "read_causl_statement", lookup)
    db = MagicMock()
    result = tool_constructor._construct_tools_impl(
        persona,
        db,
        MagicMock(),
        user,
        MagicMock(),
        custom_tool_config=tool_constructor.CustomToolConfig(
            chat_session_id=statement.chat_id,
            message_id=statement.message_id,
            causl_binding=binding if workspace_bound else None,
            causl_original_message=statement.message if workspace_bound else None,
        ),
        allow_user_context=False,
    )
    if not workspace_bound:
        assert set(result) == {7}
        lookup.assert_not_called()
        call = MagicMock(return_value={"content": []})
        monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
        result[7][0].run(
            Placement(turn_index=0), None, another_server_argument="unchanged"
        )
        assert call.call_args.args[2] == {"another_server_argument": "unchanged"}
        return
    lookup.assert_called_once_with(
        db, user.id, binding, statement.chat_id, statement.message_id, statement.message
    )
    call = MagicMock(return_value={"content": []})
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    result[7][0].run(Placement(turn_index=0), None, quote="Our product supports SSO.")
    assert call.call_args.args[2]["source"] == {
        "chatId": str(statement.chat_id),
        "messageId": statement.message_id,
        "excerpt": "Our product supports SSO.",
    }


def test_same_named_tool_on_an_ordinary_connection_keeps_its_schema(
    statement_tool: tuple[mcp_tool.MCPTool, CauslStatement],
) -> None:
    tool, _statement = statement_tool
    tool._bound_actor = None
    assert tool.tool_definition()["function"]["parameters"] == tool._tool_definition


@pytest.mark.parametrize("market_id", ["market_b", None])
def test_selected_model_inspection_uses_the_bound_market_before_network_access(
    monkeypatch: pytest.MonkeyPatch, market_id: str | None
) -> None:
    server = MCPServer(
        id=22,
        name="KB",
        auth_type=MCPAuthenticationType.NONE,
        server_url="https://kb.example/api/mcp/library",
    )
    tool = mcp_tool.MCPTool(
        7,
        MagicMock(),
        server,
        "inspect_model",
        "Inspect the saved model",
        {
            "type": "object",
            "properties": {"market": {"type": "string"}, "action": {"type": "string"}},
            "required": ["market", "action"],
        },
        bound_actor=CauslActor(org_id="org_b", user_id="auth0|alice"),
        bound_issuer="https://auth.example/",
        bound_market_id=market_id,
    )
    call = MagicMock(return_value={"content": []})
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    schema = tool.tool_definition()["function"]["parameters"]
    assert schema["required"] == ["action"]
    assert set(schema["properties"]) == {"action"}
    response = tool.run(
        Placement(turn_index=0), market="forged_market_a", action="inspect-model"
    )
    if market_id is None:
        call.assert_not_called()
        assert "selected market" in response.llm_facing_response
    else:
        assert call.call_args.args[2] == {
            "market": market_id,
            "action": "inspect-model",
        }


def test_ordinary_model_tools_keep_their_original_market_parameter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = MCPServer(
        id=22,
        name="Other",
        auth_type=MCPAuthenticationType.NONE,
        server_url="https://other.example/mcp",
    )
    schema = {
        "type": "object",
        "properties": {"market": {"type": "string"}},
        "required": ["market"],
    }
    tool = mcp_tool.MCPTool(
        7, MagicMock(), server, "inspect_model", "An unrelated tool", schema
    )
    assert tool.tool_definition()["function"]["parameters"] == schema
    call = MagicMock(return_value={"content": []})
    monkeypatch.setattr(mcp_tool, "call_mcp_tool", call)
    tool.run(Placement(turn_index=0), market="other_market")
    assert call.call_args.args[2] == {"market": "other_market"}
