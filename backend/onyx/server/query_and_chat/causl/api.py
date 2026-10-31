from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from onyx.auth.permissions import require_permission
from onyx.db.causl_workspace import open_causl_chat
from onyx.db.chat import get_chat_session_by_id
from onyx.db.engine.sql_engine import get_session
from onyx.db.enums import Permission
from onyx.db.models import User
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.context import (
    load_causl_context,
    load_interview_context,
)
from onyx.server.query_and_chat.causl.models import (
    CauslIdentityResponse,
    CauslSelection,
    CauslWorkspaceRequest,
    CauslWorkspaceResponse,
)
from onyx.server.query_and_chat.causl.turn import read_workspace_context

router = APIRouter()


@router.get("/causl-identity")
def workspace_identity(
    response: Response,
    user: User = Depends(require_permission(Permission.WRITE_CHAT)),
    db_session: Session = Depends(get_session),
) -> CauslIdentityResponse:
    """Bootstrap a public geography parent from the existing verified native grant."""
    loaded = load_interview_context(db_session, user)
    response.headers["Cache-Control"] = "private, no-store"
    return CauslIdentityResponse(
        actor=loaded.envelope.actor, issuer=loaded.envelope.issuer
    )


@router.get("/causl-memory")
def read_memory(
    chat_id: UUID,
    response: Response,
    user: User = Depends(require_permission(Permission.WRITE_CHAT)),
    db_session: Session = Depends(get_session),
) -> dict[str, Any]:
    try:
        chat = get_chat_session_by_id(
            chat_id, user.id, db_session, eager_load_persona=True
        )
    except ValueError:
        raise OnyxError(OnyxErrorCode.NOT_FOUND) from None
    if chat.user_id != user.id:
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    binding, envelope = read_workspace_context(db_session, user, chat, None)
    if envelope is None:
        raise OnyxError(
            OnyxErrorCode.NOT_FOUND, "Shared market memory is not connected."
        )
    if binding is not None and binding.mode == "colossus":
        loaded = load_causl_context(
            db_session, user, binding.actor, CauslSelection(page="workspace")
        )
        if loaded.envelope.issuer != binding.issuer:
            raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
        envelope = loaded.envelope
    response.headers["Cache-Control"] = "private, no-store"
    return {
        "library": envelope.context["library"],
        "digest": envelope.context["digest"],
    }


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
        actor=loaded.envelope.actor,
    )
