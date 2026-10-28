"""Native conversation associations contain scope and page hints, never a KB copy."""

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from onyx.configs.constants import MessageType
from onyx.db.chat import create_chat_session, get_chat_session_by_id
from onyx.db.models import ChatMessage, ChatSession, EncryptedKeyValueStore, User
from onyx.db.persona import user_can_access_persona
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.models import (
    CauslActor,
    CauslChatBinding,
    CauslSelection,
)


def read_causl_binding(
    db: Session, user_id: UUID, chat_id: UUID
) -> CauslChatBinding | None:
    row = db.get(EncryptedKeyValueStore, f"causl:chat:{chat_id}")
    if row is None:
        return None
    binding = CauslChatBinding.model_validate(row.value.get_value(apply_mask=False))
    if binding.user_id != user_id or binding.chat_id != chat_id:
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    return binding


def _write(db: Session, key: str, value: dict[str, Any]) -> None:
    cached = db.get(EncryptedKeyValueStore, key)
    stmt = pg_insert(EncryptedKeyValueStore).values(key=key, value=value)
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["key"], set_={"value": stmt.excluded.value}
        )
    )
    if cached is not None:
        db.expire(cached, ["value"])


def _scope_key(
    user_id: UUID, actor: CauslActor, issuer: str, market_id: str | None
) -> str:
    scope = json.dumps([str(user_id), issuer, actor.org_id, actor.user_id, market_id])
    return f"causl:scope:{hashlib.sha256(scope.encode()).hexdigest()}"


def bind_interview_chat(
    db: Session,
    user: User,
    chat: ChatSession,
    actor: CauslActor,
    issuer: str,
    library_server_id: int,
) -> CauslChatBinding:
    if (
        chat.user_id != user.id
        or chat.project_id is not None
        or chat.incognito_record_mode is not None
    ):
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    db.execute(
        text("select pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"causl:chat:{chat.id}"},
    )
    existing = read_causl_binding(db, user.id, chat.id)
    if existing is not None:
        if (
            existing.actor != actor
            or existing.issuer != issuer
            or existing.library_server_id != library_server_id
        ):
            raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
        db.commit()
        return existing
    if (
        db.scalar(
            select(ChatMessage.id)
            .where(
                ChatMessage.chat_session_id == chat.id,
                ChatMessage.message_type.in_([MessageType.USER, MessageType.ASSISTANT]),
            )
            .limit(1)
        )
        is not None
    ):
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Start a new interview to connect shared market memory. Your existing chat is retained.",
        )
    binding = CauslChatBinding(
        user_id=user.id,
        actor=actor,
        issuer=issuer,
        market_id=None,
        chat_id=chat.id,
        selection=CauslSelection(page="workspace"),
        library_server_id=library_server_id,
        mode="interview",
    )
    _write(db, f"causl:chat:{chat.id}", binding.model_dump(mode="json"))
    db.commit()
    return binding


def update_interview_market(
    db: Session, expected: CauslChatBinding, market_id: str
) -> None:
    """Retain the Library's market without replacing a newer chat association."""
    db.execute(
        text("select pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"causl:chat:{expected.chat_id}"},
    )
    db.expire_all()
    current = read_causl_binding(db, expected.user_id, expected.chat_id)
    if current != expected or current.mode != "interview":
        raise OnyxError(
            OnyxErrorCode.CONFLICT, "The interview changed. Save the current draft."
        )
    updated = current.model_copy(
        update={
            "market_id": market_id,
            "selection": current.selection.model_copy(update={"market_id": market_id}),
        }
    )
    _write(db, f"causl:chat:{current.chat_id}", updated.model_dump(mode="json"))
    db.commit()


def open_causl_chat(
    db: Session,
    user: User,
    actor: CauslActor,
    issuer: str,
    selection: CauslSelection,
    persona_id: int,
    library_server_id: int,
    requested_chat_id: UUID | None = None,
) -> CauslChatBinding:
    """Create or restore under one transaction; never adopt an unbound old chat."""
    key = _scope_key(user.id, actor, issuer, selection.market_id)
    db.execute(
        text("select pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key}
    )
    scope_row = db.get(EncryptedKeyValueStore, key)
    chat_id = requested_chat_id
    if chat_id is None and scope_row is not None:
        chat_id = UUID(scope_row.value.get_value(apply_mask=False)["chat_id"])
    if chat_id is not None:
        binding = read_causl_binding(db, user.id, chat_id)
        if (
            binding is None
            or binding.actor != actor
            or binding.issuer != issuer
            or binding.market_id != selection.market_id
            or binding.library_server_id != library_server_id
        ):
            raise OnyxError(
                OnyxErrorCode.UNAUTHORIZED,
                "This conversation belongs to another workspace.",
            )
        try:
            chat = get_chat_session_by_id(chat_id, user.id, db)
        except ValueError:
            raise OnyxError(
                OnyxErrorCode.SESSION_NOT_FOUND, "This conversation is unavailable."
            ) from None
        if chat.user_id != user.id or chat.persona_id != persona_id:
            raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    else:
        if not user_can_access_persona(db, persona_id, user, get_editable=False):
            raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
        chat = create_chat_session(
            db, "Business workspace", user.id, persona_id, commit=False
        )
    binding = CauslChatBinding(
        user_id=user.id,
        actor=actor,
        issuer=issuer,
        market_id=selection.market_id,
        chat_id=chat.id,
        selection=selection,
        library_server_id=library_server_id,
    )
    _write(db, f"causl:chat:{chat.id}", binding.model_dump(mode="json"))
    _write(db, key, {"chat_id": str(chat.id)})
    db.commit()
    return binding
