import copy
import json
import time
from typing import Any

from mcp.client.auth import OAuthClientProvider

from onyx.chat.emitter import Emitter
from onyx.db.enums import MCPAuthenticationType, MCPTransport
from onyx.db.models import MCPConnectionConfig, MCPServer
from onyx.server.features.mcp.client import call_mcp_tool
from onyx.server.features.mcp.credentials import ResolvedMCPCredentials
from onyx.server.features.mcp.models import (
    DENYLISTED_MCP_HEADERS,
    merge_mcp_headers,
)
from onyx.server.features.mcp.oauth import (
    MCPReauthenticationRequired,
    make_oauth_provider,
    refresh_mcp_oauth_token_if_expired,
)
from onyx.server.metrics.mcp_client import record_mcp_client_tool_outcome
from onyx.server.metrics.mcp_common import MCPToolCallStatus
from onyx.server.query_and_chat.causl.model_page import (
    model_page_tool_result,
    model_page_tool_schema,
    model_page_tools,
)
from onyx.server.query_and_chat.causl.models import CauslActor
from onyx.server.query_and_chat.causl.statement import (
    FACT_PREPARATION_TOOL,
    CauslStatement,
    fact_preparation_arguments,
    fact_preparation_schema,
)
from onyx.server.query_and_chat.placement import Placement
from onyx.server.query_and_chat.streaming_models import (
    CustomToolDelta,
    CustomToolStart,
    Packet,
)
from onyx.tools.interface import Tool
from onyx.tools.models import CustomToolCallSummary, ToolResponse
from onyx.tools.tool_name import sanitize_tool_name
from onyx.utils.logger import setup_logger

logger = setup_logger()

_AUTH_ERROR_INDICATORS = (
    "401",
    "unauthorized",
    "authentication",
    "forbidden",
    "access denied",
    "invalid token",
    "invalid api key",
    "invalid credentials",
    "please reconnect to the server",
)

# TODO: for now we're fitting MCP tool responses into the CustomToolCallSummary class
# In the future we may want custom handling for MCP tool responses
# class MCPToolCallSummary(BaseModel):
#     tool_name: str
#     server_url: str
#     tool_result: Any
#     server_name: str


def _normalize_parameters_schema(schema: dict[str, Any] | None) -> dict[str, Any]:
    # Azure OpenAI rejects object schemas that omit `properties` with
    # "object schema missing properties". MCP servers (e.g. AWS Knowledge MCP's
    # aws___list_regions) may legally return `{"type": "object"}` with no
    # properties for zero-arg tools, so seed `properties: {}` ourselves.
    if not schema:
        return {"type": "object", "properties": {}}
    if schema.get("type", "object") == "object" and "properties" not in schema:
        return {**schema, "type": "object", "properties": {}}
    return schema


class MCPTool(Tool[None]):
    """Tool implementation for MCP (Model Context Protocol) servers"""

    def __init__(
        self,
        tool_id: int,
        emitter: Emitter,
        mcp_server: MCPServer,  # TODO: these should be basemodels instead of db objects
        tool_name: str,
        tool_description: str,
        tool_definition: dict[str, Any],
        connection_config: MCPConnectionConfig | None = None,
        user_email: str = "",
        user_id: str = "",
        user_oauth_token: str | None = None,
        additional_headers: dict[str, str] | None = None,
        resolved_credentials: ResolvedMCPCredentials | None = None,
        bound_actor: CauslActor | None = None,
        bound_issuer: str | None = None,
        bound_statement: CauslStatement | None = None,
        bound_market_id: str | None = None,
        bound_model_page: str | None = None,
    ) -> None:
        super().__init__(emitter=emitter)

        self._id = tool_id
        self.mcp_server = mcp_server
        self.connection_config = connection_config
        self.user_email = user_email
        self._user_id = user_id
        self._user_oauth_token = user_oauth_token
        self._additional_headers = additional_headers or {}
        self._resolved_credentials = resolved_credentials
        self._bound_actor = bound_actor
        self._bound_issuer = bound_issuer
        self._bound_statement = bound_statement
        self._bound_market_id = bound_market_id
        self._bound_model_page = bound_model_page

        self._mcp_tool_name = tool_name
        self._name = tool_name  # NOTE: this may change in _disambiguate_mcp_tool_names
        self._tool_definition = tool_definition
        self._description = tool_description
        self._display_name = tool_definition.get("displayName", tool_name)
        self._llm_name = sanitize_tool_name(f"mcp_{mcp_server.name}_{tool_name}")

    @property
    def id(self) -> int:
        return self._id

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def display_name(self) -> str:
        return self._display_name

    def use_disambiguated_name(self) -> None:
        self._name = self._llm_name

    def _uses_model_page(self) -> bool:
        return (
            self._bound_actor is not None
            and bool(self._bound_model_page)
            and self._mcp_tool_name in model_page_tools()
        )

    def with_model_page_tools(self) -> list["MCPTool"]:
        """Expand only the actor-bound Models slot; retain Library authorization."""
        if self._mcp_tool_name != "inspect_model" or not self._uses_model_page():
            return [self]
        tools = [self]
        for name, entry in model_page_tools().items():
            # prepare_model_change retains its existing persona permission and slot.
            if name in {"inspect_model", "prepare_model_change"}:
                continue
            tool = copy.copy(self)
            tool._mcp_tool_name = name
            tool._name = name
            tool._llm_name = sanitize_tool_name(f"mcp_{self.mcp_server.name}_{name}")
            tool._display_name = name
            tool._description = entry["description"]
            tools.append(tool)
        return tools

    def tool_definition(self) -> dict:
        """Return the tool definition from the MCP server"""
        # Convert MCP tool definition to OpenAI function calling format
        schema = _normalize_parameters_schema(self._tool_definition)
        if (
            self._bound_actor is not None
            and self._mcp_tool_name == FACT_PREPARATION_TOOL
        ):
            schema = fact_preparation_schema(schema)
        if self._bound_actor is not None and self._mcp_tool_name in {
            "inspect_model",
            "prepare_model_change",
            "inspect_report",
            "prepare_report",
        }:
            schema = {
                **schema,
                "properties": {
                    key: value
                    for key, value in schema.get("properties", {}).items()
                    if key != "market"
                },
                "required": [
                    key for key in schema.get("required", []) if key != "market"
                ],
            }
        if self._uses_model_page():
            schema = model_page_tool_schema(self._mcp_tool_name)
        return {
            "type": "function",
            "function": {
                "name": self._name,
                "description": self._description,
                "parameters": schema,
            },
        }

    def emit_start(self, placement: Placement) -> None:
        self.emitter.emit(
            Packet(
                placement=placement,
                obj=CustomToolStart(tool_name=self._name),
            )
        )

    def run(
        self,
        placement: Placement,
        override_kwargs: None = None,  # noqa: ARG002
        **llm_kwargs: Any,
    ) -> ToolResponse:
        """Execute the MCP tool by calling the MCP server"""
        _start = time.monotonic()
        _server = self.mcp_server.name
        outcome = MCPToolCallStatus.ERROR
        try:
            if self._uses_model_page() and self._bound_model_page is not None:
                result = model_page_tool_result(
                    self._mcp_tool_name, self._bound_model_page, llm_kwargs
                )
                self.emitter.emit(
                    Packet(
                        placement=placement,
                        obj=CustomToolDelta(
                            tool_name=self._name, response_type="json", data=result
                        ),
                    )
                )
                outcome = MCPToolCallStatus.SUCCESS
                return ToolResponse(
                    rich_response=CustomToolCallSummary(
                        tool_name=self._name, response_type="json", tool_result=result
                    ),
                    llm_facing_response=json.dumps(result),
                )
            if self._bound_actor is not None and self._mcp_tool_name in {
                "inspect_model",
                "prepare_model_change",
                "inspect_report",
                "prepare_report",
            }:
                if not self._bound_market_id:
                    raise ValueError(
                        "Open a selected market before using its model or report tools."
                    )
                llm_kwargs = {**llm_kwargs, "market": self._bound_market_id}
            if (
                self._bound_actor is not None
                and self._mcp_tool_name == FACT_PREPARATION_TOOL
            ):
                llm_kwargs = fact_preparation_arguments(
                    llm_kwargs,
                    self._bound_statement,
                    self._bound_actor,
                    self._bound_issuer,
                )
            request_headers = {
                name: value
                for name, value in self._additional_headers.items()
                if name.lower() not in DENYLISTED_MCP_HEADERS
            }
            if denylisted := sorted(
                set(self._additional_headers) - set(request_headers)
            ):
                logger.warning(
                    "MCP tool '%s' received denylisted headers that were filtered: %s",
                    self._name,
                    denylisted,
                )
            credentials = self._resolved_credentials or ResolvedMCPCredentials(
                connection_config=self.connection_config,
                user_oauth_token=self._user_oauth_token,
                auth_type=self.mcp_server.auth_type,
                user_email=self.user_email,
            )
            headers = merge_mcp_headers(
                request_headers,
                credentials.build_headers(),
            )

            # Extra request headers can stand in for missing credentials, but
            # not for a dead OAuth grant — its stale bearer wins the header
            # merge, so the call can only fail upstream.
            if not credentials.can_authenticate() and (
                self._bound_actor is not None
                or credentials.needs_reauth()
                or not self._additional_headers
            ):
                auth_error_msg = (
                    f"The {self._name} tool from {self.mcp_server.name} requires "
                    "connection values. Tell the user to connect to the server "
                    "from the MCP dropdown before using this tool."
                )
                logger.warning(
                    "Authentication required for MCP tool '%s' but no credentials found",
                    self._name,
                )

                error_result = {"error": auth_error_msg}
                llm_facing_response = json.dumps(error_result)

                # Emit CustomToolDelta packet
                self.emitter.emit(
                    Packet(
                        placement=placement,
                        obj=CustomToolDelta(
                            tool_name=self._name,
                            response_type="json",
                            data=error_result,
                        ),
                    )
                )

                outcome = MCPToolCallStatus.AUTH_ERROR
                return ToolResponse(
                    rich_response=CustomToolCallSummary(
                        tool_name=self._name,
                        response_type="json",
                        tool_result=error_result,
                    ),
                    llm_facing_response=llm_facing_response,
                )

            # For OAuth servers, construct OAuthClientProvider so the MCP SDK
            # can refresh expired tokens automatically
            auth: OAuthClientProvider | None = None
            if (
                self.mcp_server.auth_type == MCPAuthenticationType.OAUTH
                and self.connection_config is not None
                and self._user_id
            ):
                if self.mcp_server.transport == MCPTransport.SSE:
                    # httpx.Auth refresh can't run over an open SSE stream;
                    # refresh proactively here instead. Non-fatal on failure.
                    try:
                        refreshed_header = refresh_mcp_oauth_token_if_expired(
                            self.mcp_server,
                            self.connection_config.id,
                        )
                        if refreshed_header:
                            headers["Authorization"] = refreshed_header
                    except Exception:
                        logger.exception(
                            "MCP tool '%s': proactive SSE OAuth token refresh failed; using existing token",
                            self._name,
                        )
                else:
                    auth = make_oauth_provider(
                        self.mcp_server,
                        self.connection_config.id,
                        None,
                    )

            if self._bound_actor is not None:
                headers = merge_mcp_headers(
                    headers,
                    {
                        "x-causl-expected-organization": self._bound_actor.org_id,
                        "x-causl-expected-subject": self._bound_actor.user_id,
                        "x-causl-expected-issuer": self._bound_issuer or "",
                    },
                )

            tool_result = call_mcp_tool(
                self.mcp_server.server_url,
                self._mcp_tool_name,
                llm_kwargs,
                connection_headers=headers,
                transport=self.mcp_server.transport or MCPTransport.STREAMABLE_HTTP,
                auth=auth,
            )

            logger.info("MCP tool '%s' executed successfully", self._name)

            # Format the tool result for response
            tool_result_dict = {"tool_result": tool_result}
            llm_facing_response = json.dumps(tool_result_dict)

            # Emit CustomToolDelta packet
            self.emitter.emit(
                Packet(
                    placement=placement,
                    obj=CustomToolDelta(
                        tool_name=self._name,
                        response_type="json",
                        data=tool_result_dict,
                    ),
                )
            )

            response = ToolResponse(
                rich_response=CustomToolCallSummary(
                    tool_name=self._name,
                    response_type="json",
                    tool_result=tool_result_dict,
                ),
                llm_facing_response=llm_facing_response,
            )
            outcome = MCPToolCallStatus.SUCCESS
            return response

        except Exception as e:
            error_str = str(e).lower()
            logger.error("Failed to execute MCP tool '%s': %s", self._name, e)

            is_auth_error = isinstance(e, MCPReauthenticationRequired) or any(
                indicator in error_str for indicator in _AUTH_ERROR_INDICATORS
            )

            if is_auth_error:
                outcome = MCPToolCallStatus.AUTH_ERROR
                auth_error_msg = (
                    f"Authentication failed for the {self._name} tool from {self.mcp_server.name}. "
                    f"Please use the MCP dropdown in the chat bar to update your credentials "
                    f"for the {self.mcp_server.name} server. Original error: {str(e)}"
                )
                error_result = {"error": auth_error_msg}
            else:
                error_result = {"error": f"Tool execution failed: {str(e)}"}

            llm_facing_response = json.dumps(error_result)

            # Emit CustomToolDelta packet
            self.emitter.emit(
                Packet(
                    placement=placement,
                    obj=CustomToolDelta(
                        tool_name=self._name,
                        response_type="json",
                        data=error_result,
                    ),
                )
            )

            return ToolResponse(
                rich_response=CustomToolCallSummary(
                    tool_name=self._name,
                    response_type="json",
                    tool_result=error_result,
                ),
                llm_facing_response=llm_facing_response,
            )
        finally:
            record_mcp_client_tool_outcome(
                server_name=_server,
                tool_name=self._name,
                start_time=_start,
                status=outcome,
            )
