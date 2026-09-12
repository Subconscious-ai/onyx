"""Native transcript ownership and optimistic model-brief persistence."""

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.orm import Session

from onyx.chat.chat_utils import create_chat_history_chain
from onyx.configs.constants import MessageType
from onyx.db.chat import get_chat_session_by_id
from onyx.db.models import ChatMessage


def owned_snapshot(session_id: UUID, user_id: UUID, db: Session) -> dict[str, Any]:
    session = get_chat_session_by_id(session_id, user_id, db)
    if session.user_id != user_id or session.incognito_record_mode is not None:
        raise ValueError("A private saved executive conversation is required")
    chain = create_chat_history_chain(
        session_id, db, prefetch_top_two_level_tool_calls=False
    )
    if not chain or chain[-1].message_type != MessageType.ASSISTANT:
        raise ValueError("Wait for the current answer before preparing the brief")
    transcript = [
        {"id": row.id, "type": row.message_type.value, "message": row.message}
        for row in chain
    ]
    if len(transcript) > 80 or sum(len(row["message"]) for row in transcript) > 120000:
        raise ValueError("Conversation exceeds the model handoff limit")
    return {
        "persona_id": session.persona_id,
        "last_id": chain[-1].id,
        "last_text": chain[-1].message,
        "digest": hashlib.sha256(
            json.dumps(transcript, sort_keys=True).encode()
        ).hexdigest(),
        "statements": [row["message"] for row in transcript if row["type"] == "user"],
        "transcript": transcript,
    }


def save_brief(
    session_id: UUID,
    user_id: UUID,
    expected: dict[str, Any],
    brief: dict[str, Any],
    token_count: int,
    db: Session,
) -> int:
    db.expire_all()
    fresh = owned_snapshot(session_id, user_id, db)
    if fresh["digest"] != expected["digest"]:
        raise ValueError("Conversation changed; prepare the current model brief")
    spoken = fresh["last_text"].split("<interview-brief>", 1)[0].rstrip()
    text = (
        spoken
        + "\n\n<interview-brief>"
        + json.dumps(brief, ensure_ascii=False)
        + "</interview-brief>"
    )
    result = db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.id == fresh["last_id"],
            ChatMessage.chat_session_id == session_id,
            ChatMessage.message == fresh["last_text"],
            ChatMessage.latest_child_message_id.is_(None),
        )
        .values(message=text, token_count=token_count)
    )
    if result.rowcount != 1:
        db.rollback()
        raise ValueError("Conversation changed; prepare the current model brief")
    db.commit()
    return fresh["last_id"]
