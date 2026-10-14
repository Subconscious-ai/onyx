import hashlib
from uuid import UUID

from sqlalchemy import delete

from onyx.auth.session_identity import SessionIdentity
from onyx.db.encrypted_kv_store import load_encrypted_kv, upsert_encrypted_kv
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import EncryptedKeyValueStore
from onyx.key_value_store.interface import KvKeyNotFoundError


def _key(token: str) -> str:
    return f"oidc:session:{hashlib.sha256(token.encode()).hexdigest()}"


def save_session_identity(token: str, identity: SessionIdentity) -> None:
    upsert_encrypted_kv(_key(token), identity.model_dump(mode="json"))


def read_session_identity(token: str, user_id: UUID) -> SessionIdentity | None:
    try:
        raw = load_encrypted_kv(_key(token))
    except KvKeyNotFoundError:
        return None
    identity = SessionIdentity.model_validate(raw)
    return identity if identity.native_user_id == user_id else None


def delete_session_identity(token: str) -> None:
    with get_session_with_current_tenant() as db:
        db.execute(
            delete(EncryptedKeyValueStore).where(
                EncryptedKeyValueStore.key == _key(token)
            )
        )
        db.commit()
