import json

from sqlalchemy.orm import Session

from onyx.db.causl_workspace import read_causl_binding
from onyx.db.models import ChatSession, User
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.prompts.causl_workspace import WORKSPACE_INSTRUCTIONS
from onyx.server.query_and_chat.causl.context import load_causl_context
from onyx.server.query_and_chat.causl.models import CauslChatBinding, CauslSelection


def workspace_turn(
    db: Session,
    user: User,
    chat: ChatSession,
    selection: CauslSelection | None,
) -> tuple[CauslChatBinding | None, str | None]:
    binding = read_causl_binding(db, user.id, chat.id)
    if binding is None:
        if selection is not None:
            raise OnyxError(
                OnyxErrorCode.UNAUTHORIZED, "Open this conversation from the workspace."
            )
        return None, None
    current = selection or binding.selection
    if (
        chat.user_id != user.id
        or current.market_id != binding.market_id
        or chat.project_id is not None
    ):
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "This conversation belongs to another workspace.",
        )
    loaded = load_causl_context(db, user, binding.actor, current)
    if (
        loaded.envelope.issuer != binding.issuer
        or loaded.configuration.library_server_id != binding.library_server_id
        or loaded.configuration.persona_id != chat.persona_id
    ):
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    model = loaded.envelope.context.get("model")
    model_phase = ""
    if (
        current.page == "models"
        and isinstance(model, dict)
        and isinstance(model.get("id"), str)
        and model["id"]
        and type(model.get("revision")) is int
        and model["revision"] > 0
    ):
        model_phase = (
            "A saved model exists for this market. Work on that model. "
            "Do not restart discovery or offer alternative journeys unless requested. "
            "Answer the current request from saved inputs and executed calculations. "
            "Honor requests for no questions, no research, or no edits, then stop after the answer. "
            "Unknown evidence can remain unknown without a follow-up question.\n"
        )
    prompt = (
        WORKSPACE_INSTRUCTIONS
        + "\nCurrent authorized KB context follows.\n"
        + model_phase
        + json.dumps(
            loaded.envelope.model_dump(mode="json", by_alias=True), ensure_ascii=False
        )
    )
    return binding, prompt
