"""User-owned professional context and corrections in native Postgres storage."""

import time
from typing import Any
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert as pg_insert

from onyx.db.encrypted_kv_store import load_encrypted_kv, upsert_encrypted_kv
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import EncryptedKeyValueStore
from onyx.key_value_store.interface import KvKeyNotFoundError
from onyx.server.query_and_chat.burn2.models import ProfileCorrection
from onyx.server.query_and_chat.burn2.profile import effective_profile


def _read(key: str) -> dict[str, Any] | None:
    try:
        return dict(load_encrypted_kv(key))
    except KvKeyNotFoundError:
        return None


def read_profile(user_id: UUID) -> dict[str, Any]:
    return effective_profile(
        _read(f"burn2:profile:{user_id}"),
        _read(f"burn2:profile-correction:{user_id}"),
    )


def save_profile(user_id: UUID, value: dict[str, Any]) -> None:
    upsert_encrypted_kv(f"burn2:profile:{user_id}", value)


def correct_profile(user_id: UUID, correction: ProfileCorrection) -> dict[str, Any]:
    """Serialize revisions without locking provider requests or replacing PDL data."""
    key = f"burn2:profile-correction:{user_id}"
    with get_session_with_current_tenant() as db:
        db.execute(
            pg_insert(EncryptedKeyValueStore)
            .values(key=key, value={"revision": 0, "fields": {}})
            .on_conflict_do_nothing(index_elements=["key"])
        )
        row = (
            db.query(EncryptedKeyValueStore).filter_by(key=key).with_for_update().one()
        )
        previous = row.value.get_value(apply_mask=False)
        if previous["revision"] != correction.revision:
            raise ValueError("Company profile changed. Reload before saving.")
        fields = {**previous["fields"]}
        if "company" in correction.fields and correction.fields[
            "company"
        ] != fields.get("company"):
            fields = {
                key: value for key, value in fields.items() if key in {"name", "role"}
            }
        fields.update(correction.fields)
        value = {
            "revision": correction.revision + 1,
            "fields": fields,
            "updated_at": time.time(),
            "updated_by": str(user_id),
        }
        # Preserve each edit in the same native store and transaction.
        db.execute(
            pg_insert(EncryptedKeyValueStore).values(
                key=f"{key}:revision:{value['revision']}", value=value
            )
        )
        db.execute(
            pg_insert(EncryptedKeyValueStore)
            .values(key=key, value=value)
            .on_conflict_do_update(index_elements=["key"], set_={"value": value})
        )
        db.commit()
    return read_profile(user_id)
