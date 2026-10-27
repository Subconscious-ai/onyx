"""User-scoped research in native encrypted Postgres, with native tool access."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert as pg_insert

from onyx.db.encrypted_kv_store import load_encrypted_kv, upsert_encrypted_kv
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import EncryptedKeyValueStore, User
from onyx.db.persona import get_persona_by_id
from onyx.db.web_search import fetch_active_web_search_provider
from onyx.key_value_store.interface import KvKeyNotFoundError
from onyx.tools.tool_implementations.web_search.clients.exa_client import ExaClient
from onyx.tools.tool_implementations.web_search.providers import (
    build_search_provider_from_config,
)
from shared_configs.enums import WebSearchProviderType


def read_research(user_id: UUID) -> dict[str, Any] | None:
    try:
        value = load_encrypted_kv(f"burn2:research:{user_id}")
        if not isinstance(value, dict):
            raise ValueError("Saved research must be an object")
        return cast(dict[str, Any], value)
    except KvKeyNotFoundError:
        return None


def save_research(user_id: UUID, value: dict[str, Any]) -> None:
    upsert_encrypted_kv(f"burn2:research:{user_id}", value)


def update_research_if_current(
    user_id: UUID,
    value: dict[str, Any],
    *,
    job_id: str,
    status: str,
) -> bool:
    """Serialize worker transitions against replacement jobs in the same row."""
    key = f"burn2:research:{user_id}"
    with get_session_with_current_tenant() as db:
        row = (
            db.query(EncryptedKeyValueStore)
            .filter_by(key=key)
            .with_for_update()
            .first()
        )
        if row is None:
            return False
        current = row.value.get_value(apply_mask=False)
        if current.get("job_id") != job_id or current.get("status") != status:
            return False
        db.execute(
            pg_insert(EncryptedKeyValueStore)
            .values(key=key, value=value)
            .on_conflict_do_update(index_elements=["key"], set_={"value": value})
        )
        db.commit()
    return True


def research_connection(user_id: UUID, persona_id: int) -> ExaClient:
    with get_session_with_current_tenant() as db:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            raise ValueError("Active account required")
        persona = get_persona_by_id(persona_id, user, db, is_for_edit=False)
        if persona.name != "Burn 2.0":
            raise ValueError("Beca research configuration required")
        if not any(tool.name == "web_search" for tool in persona.tools):
            raise ValueError("Authorized native web search tool required")
        configured = fetch_active_web_search_provider(db)
        if (
            not configured
            or configured.provider_type != WebSearchProviderType.EXA.value
        ):
            raise ValueError("Active Exa research provider required")
        config = configured.config or {}
        num_results = int(config.get("num_results") or "4")
        if num_results < 1:
            raise ValueError("Positive Exa source limit required")
        # Two bounded calls, each with the existing three-attempt retry policy.
        provider = build_search_provider_from_config(
            provider_type=WebSearchProviderType.EXA,
            api_key=(
                configured.api_key.get_value(apply_mask=False)
                if configured.api_key
                else None
            ),
            config={
                **config,
                "num_results": str(min(4, num_results)),
                "timeout_seconds": "3",
            },
        )
        if not isinstance(provider, ExaClient):
            raise ValueError("Exa source capture unavailable")
        return provider
