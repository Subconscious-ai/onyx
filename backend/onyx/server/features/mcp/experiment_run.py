"""Status of an experiment launched from a chat, for the run card.

The card is built from the launch result saved in the conversation. This read
asks the MCP server that launched the run for its status, with the signed-in
user's own connection. It answers only for run ids that a launch tool call in the
caller's own chat session actually returned, so a run id seen elsewhere cannot be
used to look at someone else's runs through the shared server connection.
"""

import json
import re
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from onyx.chat.emitter import NullEmitter
from onyx.db.chat import get_chat_session_by_id
from onyx.db.mcp import get_all_mcp_tools_for_server, get_mcp_server_by_id
from onyx.db.models import ToolCall, User
from onyx.db.tools import get_tool_by_id
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.features.mcp.credentials import (
    MCPCredentialsError,
    resolve_mcp_credentials,
)
from onyx.server.query_and_chat.placement import Placement
from onyx.tools.tool_implementations.mcp.mcp_tool import MCPTool
from onyx.utils.logger import setup_logger

logger = setup_logger()

LAUNCH_TOOL = "start_experiment"
STATUS_TOOL = "get_experiment_status"
_RUN_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class ExperimentRunStatus(BaseModel):
    run_id: str
    status: str
    terminal: bool
    # True or False once terminal; None while the run is still active.
    successful: bool | None = None


def _launch_tool_calls(
    db_session: Session, chat_session_id: UUID, run_id: str
) -> Sequence[ToolCall]:
    return db_session.scalars(
        select(ToolCall).where(
            ToolCall.chat_session_id == chat_session_id,
            ToolCall.tool_call_response.contains(run_id, autoescape=True),
        )
    ).all()


def _launched_run_id(tool_call_response: str) -> str | None:
    """The run id inside a saved launch result, or None if it is not one.

    The chat loop saves an MCP result as ``CustomToolCallSummary`` JSON, whose
    ``tool_result`` is itself ``{"tool_result": "<the server's JSON text>"}``.
    Other paths save the inner wrapper alone. Peel wrappers until the launch
    fields appear.
    """
    data: Any = tool_call_response
    for _ in range(4):
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except ValueError:
                return None
        if not isinstance(data, dict):
            return None
        if "wandb_run_id" in data:
            run_id = data["wandb_run_id"]
            return run_id if isinstance(run_id, str) else None
        if "tool_result" not in data:
            return None
        data = data["tool_result"]
    return None


def _launching_server_id(
    db_session: Session, chat_session_id: UUID, run_id: str
) -> int | None:
    for call in _launch_tool_calls(db_session, chat_session_id, run_id):
        try:
            tool = get_tool_by_id(call.tool_id, db_session)
        except ValueError:
            continue
        if tool.mcp_server_id is None or tool.name != LAUNCH_TOOL:
            continue
        if _launched_run_id(call.tool_call_response) == run_id:
            return tool.mcp_server_id
    return None


def get_experiment_run_status(
    db_session: Session, user: User, chat_session_id: UUID, run_id: str
) -> ExperimentRunStatus:
    if not _RUN_ID.fullmatch(run_id):
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Invalid run id.")
    not_found = OnyxError(
        OnyxErrorCode.NOT_FOUND, "No experiment with this id was launched here."
    )
    try:
        get_chat_session_by_id(chat_session_id, user.id, db_session)
    except ValueError as error:
        raise not_found from error
    server_id = _launching_server_id(db_session, chat_session_id, run_id)
    if server_id is None:
        raise not_found

    mcp_server = get_mcp_server_by_id(server_id, db_session)
    try:
        credentials = resolve_mcp_credentials(mcp_server, user, db_session)
    except MCPCredentialsError as error:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY,
            "Reconnect to the experiment server to see this run.",
        ) from error
    status_tool = next(
        (
            tool
            for tool in get_all_mcp_tools_for_server(mcp_server.id, db_session)
            if tool.name == STATUS_TOOL
        ),
        None,
    )
    if status_tool is None:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "This server does not report run status."
        )

    tool = MCPTool(
        tool_id=status_tool.id,
        emitter=NullEmitter(),
        mcp_server=mcp_server,
        tool_name=status_tool.name,
        tool_description=status_tool.description,
        tool_definition=status_tool.mcp_input_schema or {},
        connection_config=credentials.connection_config,
        user_email=user.email,
        user_id=str(user.id),
        user_oauth_token=credentials.user_oauth_token,
        resolved_credentials=credentials,
    )
    response = tool.run(Placement(turn_index=0), run_id=run_id)
    return _parse_status(response.llm_facing_response, run_id)


def _parse_status(llm_facing_response: str, run_id: str) -> ExperimentRunStatus:
    unavailable = OnyxError(
        OnyxErrorCode.BAD_GATEWAY, "The run status is unavailable right now."
    )
    try:
        outer = json.loads(llm_facing_response)
        if "error" in outer:
            raise unavailable
        result = outer["tool_result"]
        if not isinstance(result, str) or result.startswith("Tool reported an error"):
            raise unavailable
        status = ExperimentRunStatus.model_validate(json.loads(result))
    except (ValueError, KeyError, TypeError, ValidationError) as error:
        raise unavailable from error
    if status.run_id != run_id:
        raise unavailable
    return status
