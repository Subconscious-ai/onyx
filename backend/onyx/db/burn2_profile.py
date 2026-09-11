"""User-bound professional context in native encrypted Postgres storage."""

from typing import Any
from uuid import UUID

from onyx.db.encrypted_kv_store import load_encrypted_kv, upsert_encrypted_kv
from onyx.key_value_store.interface import KvKeyNotFoundError


def read_profile(user_id: UUID) -> dict[str, Any] | None:
    try:
        return dict(load_encrypted_kv(f"burn2:profile:{user_id}"))
    except KvKeyNotFoundError:
        return None


def save_profile(user_id: UUID, value: dict[str, Any]) -> None:
    upsert_encrypted_kv(f"burn2:profile:{user_id}", value)
