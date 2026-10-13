"""Only a live native session issued by verified OIDC can claim a KB caller."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from onyx.auth import session_identity
from onyx.auth.session_identity import OIDCIdentity, SessionIdentity
from onyx.auth.users import RefreshableDatabaseStrategy
from onyx.db import session_identity as identity_db
from onyx.db.models import AccessToken, User
from onyx.error_handling.exceptions import OnyxError


@pytest.fixture
def identity_storage(monkeypatch: pytest.MonkeyPatch) -> dict[str, SessionIdentity]:
    monkeypatch.setenv("CAUSL_KB_ASSISTANT_PERSONA_ID", "11")
    monkeypatch.setenv("CAUSL_KB_MCP_SERVER_ID", "22")
    stored: dict[str, SessionIdentity] = {}
    monkeypatch.setattr(
        identity_db,
        "save_session_identity",
        lambda token, identity: stored.__setitem__(token, identity),
    )
    monkeypatch.setattr(
        identity_db,
        "read_session_identity",
        lambda token, user_id: (
            stored.get(token)
            if token in stored and stored[token].native_user_id == user_id
            else None
        ),
    )
    monkeypatch.setattr(
        identity_db, "delete_session_identity", lambda token: stored.pop(token, None)
    )
    monkeypatch.setattr(
        session_identity,
        "_session_identity",
        session_identity.ContextVar("test_identity", default=None),
    )
    return stored


@pytest.mark.asyncio
async def test_postgres_session_carries_fresh_oidc_identity_through_refresh(
    identity_storage: dict[str, SessionIdentity],
) -> None:
    user = User(id=uuid4(), email="alice@example.test")
    issued = AccessToken(token="native-session", user_id=user.id)
    token_db = MagicMock()
    token_db.create = AsyncMock(return_value=issued)
    token_db.get_by_token = AsyncMock(return_value=issued)
    token_db.update = AsyncMock()
    strategy = RefreshableDatabaseStrategy(token_db, lifetime_seconds=3600)
    manager = MagicMock()
    manager.parse_id.return_value = user.id
    manager.get = AsyncMock(return_value=user)
    identity = OIDCIdentity(issuer="https://auth.example/", subject="auth0|alice")
    with session_identity.oidc_login_identity(identity):
        token = await strategy.write_token(user)
    assert identity_storage[token].subject == "auth0|alice"
    assert await strategy.refresh_token(token, user) == token
    assert await strategy.read_token(token, manager) is user
    assert (
        session_identity.require_session_identity(user.id).issuer
        == "https://auth.example/"
    )
    with pytest.raises(OnyxError):
        session_identity.require_session_identity(uuid4())


@pytest.mark.asyncio
async def test_legacy_password_session_is_valid_for_native_chat_but_has_no_kb_identity(
    identity_storage: dict[str, SessionIdentity],
) -> None:
    user = User(id=uuid4(), email="alice@example.test")
    issued = AccessToken(token="password-session", user_id=user.id)
    token_db = MagicMock()
    token_db.create = AsyncMock(return_value=issued)
    token_db.get_by_token = AsyncMock(return_value=issued)
    manager = MagicMock()
    manager.parse_id.return_value = user.id
    manager.get = AsyncMock(return_value=user)
    strategy = RefreshableDatabaseStrategy(token_db, lifetime_seconds=3600)
    token = await strategy.write_token(user)
    assert token not in identity_storage
    assert await strategy.read_token(token, manager) is user
    with pytest.raises(OnyxError):
        session_identity.require_session_identity(user.id)


@pytest.mark.asyncio
async def test_expired_or_removed_token_never_revives_from_identity_metadata(
    identity_storage: dict[str, SessionIdentity], monkeypatch: pytest.MonkeyPatch
) -> None:
    user = User(id=uuid4(), email="alice@example.test")
    identity_storage["expired-session"] = SessionIdentity(
        native_user_id=user.id, issuer="https://auth.example/", subject="auth0|alice"
    )
    token_db = MagicMock()
    token_db.get_by_token = AsyncMock(return_value=None)
    read_metadata = AsyncMock()
    monkeypatch.setattr("onyx.auth.users.read_validated_identity", read_metadata)
    strategy = RefreshableDatabaseStrategy(token_db, lifetime_seconds=3600)
    assert await strategy.read_token("expired-session", MagicMock()) is None
    read_metadata.assert_not_called()
    assert token_db.get_by_token.call_args.args[1] is not None


@pytest.mark.asyncio
async def test_logout_removes_session_association(
    identity_storage: dict[str, SessionIdentity],
) -> None:
    user = User(id=uuid4(), email="alice@example.test")
    identity_storage["live-session"] = SessionIdentity(
        native_user_id=user.id, issuer="https://auth.example/", subject="auth0|alice"
    )
    token_db = MagicMock()
    token_db.get_by_token = AsyncMock(
        return_value=AccessToken(token="live-session", user_id=user.id)
    )
    token_db.delete = AsyncMock()
    strategy = RefreshableDatabaseStrategy(token_db)
    await strategy.destroy_token("live-session", user)
    assert "live-session" not in identity_storage
    token_db.delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_identity_support_does_not_touch_ordinary_login_when_feature_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CAUSL_KB_ASSISTANT_PERSONA_ID", raising=False)
    monkeypatch.delenv("CAUSL_KB_MCP_SERVER_ID", raising=False)
    write = MagicMock()
    read = MagicMock()
    monkeypatch.setattr(identity_db, "save_session_identity", write)
    monkeypatch.setattr(identity_db, "read_session_identity", read)
    with session_identity.oidc_login_identity(
        OIDCIdentity(issuer="https://auth.example/", subject="alice")
    ):
        await session_identity.record_issued_identity("native-token", uuid4())
    await session_identity.read_validated_identity("native-token", uuid4())
    write.assert_not_called()
    read.assert_not_called()


def test_identity_key_contains_no_session_token_or_subject(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored: list[tuple[str, dict[str, Any]]] = []
    monkeypatch.setattr(
        identity_db,
        "upsert_encrypted_kv",
        lambda key, value: stored.append((key, value)),
    )
    identity_db.save_session_identity(
        "SECRET_NATIVE_SESSION",
        SessionIdentity(
            native_user_id=uuid4(),
            issuer="https://auth.example/",
            subject="auth0|alice",
        ),
    )
    key, value = stored[0]
    assert "SECRET_NATIVE_SESSION" not in key
    assert "SECRET_NATIVE_SESSION" not in str(value)
    assert key.startswith("oidc:session:")
