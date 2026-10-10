from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from onyx.auth.permissions import require_permission
from onyx.db.causl_workspace import open_causl_chat
from onyx.db.engine.sql_engine import get_session
from onyx.db.enums import Permission
from onyx.db.models import User
from onyx.server.query_and_chat.causl.context import load_causl_context
from onyx.server.query_and_chat.causl.models import (
    CauslWorkspaceRequest,
    CauslWorkspaceResponse,
)

router = APIRouter()


@router.post("/causl-workspace")
def open_workspace(
    request: CauslWorkspaceRequest,
    response: Response,
    user: User = Depends(require_permission(Permission.WRITE_CHAT)),
    db_session: Session = Depends(get_session),
) -> CauslWorkspaceResponse:
    loaded = load_causl_context(db_session, user, request.actor, request.selection)
    binding = open_causl_chat(
        db_session,
        user,
        loaded.envelope.actor,
        loaded.envelope.issuer,
        request.selection,
        loaded.configuration.persona_id,
        loaded.configuration.library_server_id,
        request.chat_id,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return CauslWorkspaceResponse(
        chat_id=binding.chat_id,
        agent_id=loaded.configuration.persona_id,
        scope_key=loaded.envelope.context["scopeKey"],
        context_digest=loaded.envelope.context["digest"],
    )
