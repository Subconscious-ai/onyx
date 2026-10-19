"""Exercise request identity through native HTTP routes and streamed worker context."""

from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import APIRouter, FastAPI, Request
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from onyx.auth import session_identity
from onyx.auth.session_identity import SessionIdentity
from onyx.auth.users import RefreshableDatabaseStrategy
from onyx.db import session_identity as identity_db
from onyx.db.models import AccessToken, ChatSession, MCPServer, User
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError, register_onyx_exception_handlers
from onyx.server.query_and_chat import chat_backend
from onyx.server.query_and_chat.causl import api, context, turn
from onyx.server.query_and_chat.causl.models import (
    CauslActor,
    CauslChatBinding,
    CauslContextEnvelope,
    CauslSelection,
)
from onyx.server.query_and_chat.models import SendMessageRequest
from onyx.server.query_and_chat.streaming_models import OverallStop


def test_http_open_and_stream_keep_two_native_callers_separate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CAUSL_KB_ASSISTANT_PERSONA_ID", "11")
    monkeypatch.setenv("CAUSL_KB_MCP_SERVER_ID", "22")
    monkeypatch.setattr(
        session_identity,
        "_session_identity",
        session_identity.ContextVar("http_test_identity", default=None),
    )
    users = {
        name: User(id=uuid4(), email=f"{name}@example.test")
        for name in ("alice", "bob")
    }
    tokens = {
        name: AccessToken(token=name, user_id=user.id) for name, user in users.items()
    }
    tokens["password"] = AccessToken(token="password", user_id=users["alice"].id)
    identities = {
        name: SessionIdentity(
            native_user_id=user.id,
            issuer="https://auth.example/",
            subject=f"auth0|{name}",
        )
        for name, user in users.items()
    }
    monkeypatch.setattr(
        identity_db,
        "read_session_identity",
        lambda token, _user_id: identities.get(token),
    )
    token_db = MagicMock()
    token_db.get_by_token = AsyncMock(
        side_effect=lambda token, _cutoff: tokens.get(token)
    )
    manager = MagicMock()
    manager.parse_id.side_effect = lambda value: UUID(str(value))
    manager.get = AsyncMock(
        side_effect=lambda user_id: next(u for u in users.values() if u.id == user_id)
    )
    strategy = RefreshableDatabaseStrategy(token_db, lifetime_seconds=3600)

    async def authenticated(request: Request) -> User:
        user = await strategy.read_token(request.headers["x-test-session"], manager)
        if user is None:
            raise OnyxError(OnyxErrorCode.UNAUTHENTICATED)
        return user

    db = MagicMock(spec=Session)

    def database() -> Session:
        return db

    def no_limit() -> None:
        return None

    app = FastAPI()
    register_onyx_exception_handlers(app)
    selected_router = APIRouter()
    selected_paths = {
        "/chat/causl-workspace",
        "/chat/causl-memory",
        "/chat/send-chat-message",
    }
    for route in chat_backend.router.routes:
        if isinstance(route, APIRoute) and route.path in selected_paths:
            selected_router.routes.append(route)
            for dependency in route.dependant.dependencies:
                if dependency.call is not None:
                    app.dependency_overrides[dependency.call] = (
                        authenticated
                        if dependency.name == "user"
                        else database
                        if dependency.name == "db_session"
                        else no_limit
                    )
    app.include_router(selected_router)

    server = MCPServer(id=22, server_url="https://kb.example/api/mcp/library")
    monkeypatch.setattr(context, "_library_server", lambda *_args: server)
    monkeypatch.setattr(
        context,
        "_headers",
        lambda _db, _user, _server, actor, issuer: {
            "subject": actor.user_id,
            "organization": actor.org_id,
            "issuer": issuer,
        },
    )
    reads: list[str] = []

    def read_kb(
        _url: str, headers: dict[str, str], selection: CauslSelection
    ) -> CauslContextEnvelope:
        reads.append(headers["subject"])
        return CauslContextEnvelope(
            issuer=headers["issuer"],
            actor=CauslActor(
                org_id=headers["organization"], user_id=headers["subject"]
            ),
            context={
                "version": 1,
                "page": selection.page,
                "market": {"id": selection.market_id},
                "record": None,
                "analysis": None,
                "library": {},
                "scopeKey": "b" * 64,
                "digest": "c" * 64,
            },
        )

    monkeypatch.setattr(context, "_read", read_kb)
    bindings: dict[UUID, CauslChatBinding] = {}

    def open_chat(
        _db: Session,
        user: User,
        actor: CauslActor,
        issuer: str,
        selection: CauslSelection,
        _persona_id: int,
        server_id: int,
        _chat_id: UUID | None,
    ) -> CauslChatBinding:
        binding = CauslChatBinding(
            user_id=user.id,
            actor=actor,
            issuer=issuer,
            market_id=selection.market_id,
            chat_id=uuid4(),
            selection=selection,
            library_server_id=server_id,
        )
        bindings[binding.chat_id] = binding
        return binding

    monkeypatch.setattr(api, "open_causl_chat", open_chat)
    monkeypatch.setattr(
        turn, "read_causl_binding", lambda _db, _user_id, chat_id: bindings[chat_id]
    )

    def saved_chat(
        chat_id: UUID, user_id: UUID, *_args: Any, **_kwargs: Any
    ) -> ChatSession:
        binding = bindings[chat_id]
        if binding.user_id != user_id:
            raise ValueError("Not this caller's chat")
        return ChatSession(id=chat_id, user_id=user_id, persona_id=11)

    monkeypatch.setattr(api, "get_chat_session_by_id", saved_chat)
    monkeypatch.setattr(chat_backend, "mt_cloud_telemetry", lambda **_kwargs: None)
    monkeypatch.setattr(chat_backend, "get_current_tenant_id", lambda: "public")

    def stream(
        new_msg_req: SendMessageRequest, user: User, **_kwargs: Any
    ) -> Generator[OverallStop, None, None]:
        assert new_msg_req.chat_session_id is not None
        binding = bindings[new_msg_req.chat_session_id]
        chat = ChatSession(
            id=binding.chat_id, user_id=binding.user_id, persona_id=11, project_id=None
        )
        # Native model threads use the same context-copy operation.
        copied = copy_context()

        def authorized_turn() -> tuple[CauslChatBinding | None, str | None]:
            return copied.run(
                turn.workspace_turn, db, user, chat, new_msg_req.causl_selection
            )

        with ThreadPoolExecutor(max_workers=1) as executor:
            found, prompt = executor.submit(authorized_turn).result()
        assert found is not None and prompt is not None
        assert found.actor.user_id in prompt
        yield OverallStop(stop_reason=found.actor.user_id)

    monkeypatch.setattr(chat_backend, "handle_stream_message_objects", stream)
    selection = {"page": "models", "marketId": "market_b"}

    def open_body(name: str) -> dict[str, Any]:
        return {
            "actor": {"orgId": "org_b", "userId": f"auth0|{name}"},
            "selection": selection,
        }

    with TestClient(app) as client:
        alice = client.post(
            "/chat/causl-workspace",
            headers={"x-test-session": "alice"},
            json=open_body("alice"),
        )
        assert alice.status_code == 200
        assert alice.headers["cache-control"] == "private, no-store"
        bob_as_alice = client.post(
            "/chat/causl-workspace",
            headers={"x-test-session": "bob"},
            json=open_body("alice"),
        )
        assert bob_as_alice.status_code == 403
        bob = client.post(
            "/chat/causl-workspace",
            headers={"x-test-session": "bob"},
            json=open_body("bob"),
        )
        assert bob.status_code == 200
        password = client.post(
            "/chat/causl-workspace",
            headers={"x-test-session": "password"},
            json=open_body("alice"),
        )
        assert password.status_code == 401
        memory = client.get(
            "/chat/causl-memory",
            params={"chat_id": alice.json()["chatId"]},
            headers={"x-test-session": "alice"},
        )
        assert memory.status_code == 200
        assert memory.json() == {"library": {}, "digest": "c" * 64}
        assert memory.headers["cache-control"] == "private, no-store"
        foreign_memory = client.get(
            "/chat/causl-memory",
            params={"chat_id": alice.json()["chatId"]},
            headers={"x-test-session": "bob"},
        )
        assert foreign_memory.status_code == 404
        for name, opened in (("bob", bob), ("alice", alice)):
            result = client.post(
                "/chat/send-chat-message",
                headers={"x-test-session": name},
                json={
                    "message": "Read the current market",
                    "chat_session_id": opened.json()["chatId"],
                    "causl_selection": selection,
                },
            )
            assert result.status_code == 200
            assert result.json()["stop_reason"] == f"auth0|{name}"
        foreign = client.post(
            "/chat/send-chat-message",
            headers={"x-test-session": "bob"},
            json={
                "message": "Read Alice's market",
                "chat_session_id": alice.json()["chatId"],
                "causl_selection": selection,
            },
        )
        assert "error" in foreign.json()
    assert reads == [
        "auth0|alice",
        "auth0|bob",
        "auth0|alice",
        "auth0|bob",
        "auth0|alice",
    ]
