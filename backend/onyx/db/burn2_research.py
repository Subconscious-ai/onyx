"""User-scoped research in native encrypted Postgres, with native tool access."""

from typing import Any
from uuid import UUID

from onyx.db.encrypted_kv_store import load_encrypted_kv, upsert_encrypted_kv
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.enums import MCPTransport
from onyx.db.models import MCPServer, User
from onyx.db.persona import get_persona_by_id
from onyx.key_value_store.interface import KvKeyNotFoundError
from onyx.server.features.mcp.credentials import resolve_mcp_credentials


def read_research(user_id: UUID) -> dict[str, Any] | None:
    try:
        return dict(load_encrypted_kv(f"burn2:research:{user_id}"))
    except KvKeyNotFoundError:
        return None


def save_research(user_id: UUID, value: dict[str, Any]) -> None:
    upsert_encrypted_kv(f"burn2:research:{user_id}", value)


def research_connection(
    user_id: UUID, persona_id: int
) -> tuple[str, dict[str, str], MCPTransport]:
    with get_session_with_current_tenant() as db:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            raise ValueError("Active account required")
        persona = get_persona_by_id(persona_id, user, db, is_for_edit=False)
        if persona.name != "Burn 2.0":
            raise ValueError("Beca research configuration required")
        tools = [
            tool
            for tool in persona.tools
            if tool.name == "deep_research" and tool.mcp_server_id
        ]
        if len(tools) != 1:
            raise ValueError("One authorized public research tool required")
        server = db.get(MCPServer, tools[0].mcp_server_id)
        if not server:
            raise ValueError("Research server unavailable")
        credentials = resolve_mcp_credentials(server, user, db)
        if not credentials.can_authenticate():
            raise ValueError("Research credentials unavailable")
        return (
            server.server_url,
            credentials.build_headers(),
            server.transport or MCPTransport.STREAMABLE_HTTP,
        )
