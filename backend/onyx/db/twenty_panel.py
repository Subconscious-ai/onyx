"""Personal record scopes reuse the native encrypted conversation association store."""

import json
from concurrent.futures import ThreadPoolExecutor
from time import monotonic
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from onyx.db.enums import ChatSessionSharedStatus
from onyx.db.models import ChatSession, EncryptedKeyValueStore
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.models import TwentyContext
from onyx.server.query_and_chat.causl.twenty import (
    authorize_twenty_context,
    require_twenty_session,
)


def read_twenty_binding(db: Session, chat_id: UUID) -> TwentyContext | None:
    row = db.get(EncryptedKeyValueStore, f"twenty:chat:{chat_id}")
    return (
        None
        if row is None
        else TwentyContext.model_validate(row.value.get_value(apply_mask=False))
    )


def authorize_twenty_chat(db: Session, user_id: UUID | None, chat: ChatSession) -> None:
    binding = read_twenty_binding(db, chat.id)
    if binding is None:
        return
    if (
        user_id is None
        or chat.user_id != user_id
        or chat.shared_status != ChatSessionSharedStatus.PRIVATE
    ):
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    authorize_twenty_context(require_twenty_session(user_id), binding.references())


def bind_twenty_context(
    db: Session, chat: ChatSession, user_id: UUID, context: TwentyContext
) -> None:
    db.refresh(chat, with_for_update=True)
    if (
        chat.user_id != user_id
        or chat.project_id is not None
        or chat.shared_status != ChatSessionSharedStatus.PRIVATE
    ):
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    db.execute(
        text("select pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"twenty:chat:{chat.id}"},
    )
    if db.get(EncryptedKeyValueStore, f"causl:chat:{chat.id}") is not None:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED, "Start a new personal conversation in Twenty."
        )
    current = read_twenty_binding(db, chat.id)
    if current is not None and (
        current.workspaceId != context.workspaceId
        or current.workspaceMemberId != context.workspaceMemberId
        or current.userWorkspaceId != context.userWorkspaceId
        or current.subject != context.subject
        or current.issuer != context.issuer
        or current.orgId != context.orgId
    ):
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    sources = {}
    for source in [*(current.sources if current else []), *context.sources]:
        reference = source.model_copy(update={"records": []})
        sources[json.dumps(reference.model_dump(mode="json"), sort_keys=True)] = (
            reference
        )
    if len(sources) > 100:
        raise OnyxError(
            OnyxErrorCode.INVALID_INPUT,
            "Start a new conversation to add more record sources.",
        )
    updated = context.model_copy(update={"sources": list(sources.values())})
    value = updated.model_dump(mode="json", exclude_none=True)
    if len(json.dumps(value).encode()) > 128_000:
        raise OnyxError(
            OnyxErrorCode.INVALID_INPUT,
            "Start a new conversation to add more record sources.",
        )
    statement = pg_insert(EncryptedKeyValueStore).values(
        key=f"twenty:chat:{chat.id}", value=value
    )
    db.execute(
        statement.on_conflict_do_update(
            index_elements=["key"], set_={"value": statement.excluded.value}
        )
    )
    db.commit()
    db.expire_all()


def filter_twenty_chats(
    db: Session, user_id: UUID | None, chats: list[ChatSession]
) -> list[ChatSession]:
    bindings = {chat.id: read_twenty_binding(db, chat.id) for chat in chats}
    if not any(bindings.values()):
        return chats
    candidates = [
        (chat.id, bindings[chat.id])
        for chat in chats
        if bindings[chat.id] is not None
        and user_id is not None
        and chat.user_id == user_id
        and chat.shared_status == ChatSessionSharedStatus.PRIVATE
    ]
    # Both callers are read-only history queries; release the connection before HTTP.
    connection = db.get_bind()
    db.close()
    if isinstance(connection, Connection):
        connection.close()
    try:
        session = require_twenty_session(user_id) if user_id is not None else None
    except OnyxError:
        session = None
    if session is None:
        return [chat for chat in chats if bindings[chat.id] is None]

    deadline = monotonic() + 15

    def authorized(candidate: tuple[UUID, TwentyContext | None]) -> UUID | None:
        chat_id, binding = candidate
        remaining = deadline - monotonic()
        if binding is None or remaining <= 0:
            return None
        try:
            authorize_twenty_context(session, binding.references(), timeout=remaining)
        except OnyxError:
            return None
        return chat_id

    with ThreadPoolExecutor(max_workers=4) as executor:
        visible_ids = set(executor.map(authorized, candidates))
    return [
        chat for chat in chats if bindings[chat.id] is None or chat.id in visible_ids
    ]


def ensure_twenty_chat_can_be_shared(db: Session, chat: ChatSession) -> None:
    db.refresh(chat, with_for_update=True)
    if read_twenty_binding(db, chat.id) is not None:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED, "Twenty record conversations stay private."
        )
