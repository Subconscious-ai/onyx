from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from onyx.configs.constants import MessageType
from onyx.db.models import ChatMessage, ChatSession
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.models import CauslChatBinding
from onyx.server.query_and_chat.causl.statement import CauslStatement


def read_causl_statement(
    db: Session,
    user_id: UUID,
    binding: CauslChatBinding,
    chat_id: UUID | None,
    message_id: int | None,
    original_message: str | None,
) -> CauslStatement | None:
    if chat_id is None or message_id is None or original_message is None:
        return None
    if binding.user_id != user_id or binding.chat_id != chat_id:
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    message = db.scalar(
        select(ChatMessage.message)
        .join(ChatSession, ChatSession.id == ChatMessage.chat_session_id)
        .where(
            ChatSession.user_id == user_id,
            ChatSession.id == chat_id,
            ChatMessage.id == message_id,
            ChatMessage.message_type == MessageType.USER,
            ChatMessage.message == original_message,
            ChatSession.deleted.is_(False),
        )
    )
    if message is None:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED, "The executive statement is unavailable."
        )
    return CauslStatement(
        actor=binding.actor,
        issuer=binding.issuer,
        market_id=binding.market_id,
        chat_id=chat_id,
        message_id=message_id,
        message=message,
    )
