"""Host credentials must select the native subject, never an email or cookie."""

import time
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import jwt
import pytest
from fastapi import Request
from fastapi_users.exceptions import UserAlreadyExists, UserNotExists

from onyx.auth import host_auth, users
from onyx.auth.oidc_client import VerifiedEmailOpenID
from onyx.auth.session_identity import SessionIdentity, require_session_identity
from onyx.db.enums import AccountType, MCPAuthenticationType
from onyx.db.models import MCPServer, User
from onyx.error_handling.exceptions import OnyxError
from onyx.server import oidc_multi
from onyx.server.features.mcp.credentials import resolve_mcp_credentials


@pytest.fixture
def setup_host(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    monkeypatch.setenv("CAUSL_KB_HOST_AUTH_ENABLED", "true")
    monkeypatch.setenv("CAUSL_KB_HOST_ORIGIN", "https://kb.example")
    monkeypatch.setenv("CAUSL_KB_MCP_SERVER_ID", "22")
    monkeypatch.setattr(host_auth, "MULTI_TENANT", False)
    settings = SimpleNamespace(
        jwt_expected_issuer="https://auth.example/",
        jwt_expected_audience="kb-api",
        jwt_public_key_url="https://auth.example/jwks",
    )
    monkeypatch.setattr(host_auth, "get_security_settings", lambda: settings)
    payload = {
        "iss": settings.jwt_expected_issuer,
        "sub": "auth0|alice",
        "org_id": "org_a",
        "exp": time.time() + 300,
    }
    verify = AsyncMock(return_value=payload)
    monkeypatch.setattr(host_auth, "verify_jwt_token", verify)
    client = MagicMock(spec=VerifiedEmailOpenID)
    client.expected_issuer = settings.jwt_expected_issuer
    client.get_id_email = AsyncMock(return_value=(payload["sub"], "alice@example.test"))
    client.allows_verified_email_to_join.return_value = False
    provider = SimpleNamespace(name="auth0", allowed_email_domains=["example.test"])
    monkeypatch.setattr(oidc_multi, "resolve_oidc_provider", lambda *_: (provider, {}))
    monkeypatch.setattr(oidc_multi, "get_oauth_client", AsyncMock(return_value=client))
    db = MagicMock()
    db.run_sync = AsyncMock(side_effect=lambda call: call(None))
    user = User(
        id=uuid4(),
        email="alice@example.test",
        is_active=True,
        account_type=AccountType.STANDARD,
    )
    manager = MagicMock()
    manager.get_by_oauth_account = AsyncMock(return_value=user)
    manager.oauth_callback = AsyncMock(return_value=user)
    request = Request(
        {
            "type": "http",
            "headers": [
                (b"authorization", b"Bearer signed-host-token"),
                (b"x-causl-host-auth", b"1"),
            ],
        }
    )
    return SimpleNamespace(
        settings=settings,
        payload=payload,
        verify=verify,
        client=client,
        db=db,
        user=user,
        manager=manager,
        request=request,
    )


@pytest.mark.asyncio
async def test_bearer_subject_overrides_a_different_cookie_user(
    setup_host: SimpleNamespace,
) -> None:
    s = setup_host
    cookie_user = User(id=uuid4(), email="bob@example.test")
    user = await users._resolve_optional_user(s.request, s.db, cookie_user, s.manager)
    assert user is s.user
    s.manager.get_by_oauth_account.assert_awaited_once_with("auth0", "auth0|alice")
    s.manager.oauth_callback.assert_not_awaited()
    s.client.get_id_email.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_marker_still_uses_subject_binding(
    setup_host: SimpleNamespace,
) -> None:
    s = setup_host
    token = jwt.encode(
        s.payload, "test-only-signing-key-with-at-least-32-bytes", algorithm="HS256"
    )
    request = Request(
        {"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]}
    )
    cookie_user = User(id=uuid4(), email="bob@example.test")
    assert (
        await users._resolve_optional_user(request, s.db, cookie_user, s.manager)
        is s.user
    )
    s.manager.get_by_oauth_account.assert_awaited_once_with("auth0", "auth0|alice")


@pytest.mark.asyncio
async def test_request_dependency_resets_host_identity_on_close(
    setup_host: SimpleNamespace,
) -> None:
    s = setup_host
    dependency = users.optional_user(s.request, s.db, None, s.manager)
    assert await anext(dependency) is s.user
    session = host_auth.host_session_for(s.user.id)
    assert session is not None
    assert session.identity.subject == "auth0|alice"
    await dependency.aclose()
    assert host_auth.host_session_for(s.user.id) is None


@pytest.mark.asyncio
async def test_native_admission_strict_option_rejects_unlinked_email_collision(
    setup_host: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    s = setup_host
    manager = users.UserManager(MagicMock())
    manager.get_by_oauth_account = AsyncMock(side_effect=UserNotExists())
    manager.user_db.get_by_email = AsyncMock(return_value=s.user)
    manager.user_db.add_oauth_account = AsyncMock()

    @asynccontextmanager
    async def tenant(_tenant: str):
        yield s.db

    monkeypatch.setattr(manager, "_tenant_session_with_bound_user_db", tenant)
    monkeypatch.setattr(users, "verify_email_in_whitelist", lambda *_: None)
    monkeypatch.setattr(users, "verify_email_domain", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        users, "get_security_settings", lambda: SimpleNamespace(valid_email_domains=[])
    )
    pin = users.SESSION_TENANT_OVERRIDE_CONTEXTVAR.set("test_workspace")
    try:
        with pytest.raises(UserAlreadyExists):
            await manager.oauth_callback(
                "auth0", "", "auth0|new-subject", s.user.email, allow_email_link=False
            )
    finally:
        users.SESSION_TENANT_OVERRIDE_CONTEXTVAR.reset(pin)
    manager.user_db.add_oauth_account.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "claim,value",
    [
        ("exp", None),
        ("exp", 0),
        ("org_id", ""),
        ("iss", "https://other.example/"),
        ("sub", ""),
    ],
)
async def test_invalid_host_claims_never_fall_back_to_cookie(
    setup_host: SimpleNamespace, claim: str, value: object
) -> None:
    s = setup_host
    s.payload[claim] = value
    with pytest.raises(OnyxError):
        await users._resolve_optional_user(s.request, s.db, s.user, s.manager)
    s.manager.get_by_oauth_account.assert_not_awaited()


@pytest.mark.asyncio
async def test_new_subject_reuses_native_admission_without_storing_token(
    setup_host: SimpleNamespace,
) -> None:
    s = setup_host
    s.manager.get_by_oauth_account.side_effect = UserNotExists()
    user, session = await host_auth.authenticate_host(s.request, s.db, s.manager)
    assert user is s.user and session.identity.subject == "auth0|alice"
    args, kwargs = s.manager.oauth_callback.call_args
    assert args[:3] == ("auth0", "", "auth0|alice")
    assert kwargs["allow_email_link"] is False
    assert kwargs["allowed_email_domains_override"] == ["example.test"]
    assert kwargs["auto_join_verified_email"] is False
    assert "signed-host-token" not in repr(session)


@pytest.mark.asyncio
async def test_userinfo_subject_mismatch_and_email_collision_fail_closed(
    setup_host: SimpleNamespace,
) -> None:
    s = setup_host
    s.manager.get_by_oauth_account.side_effect = UserNotExists()
    s.client.get_id_email.return_value = ("auth0|other", "alice@example.test")
    with pytest.raises(OnyxError):
        await host_auth.authenticate_host(s.request, s.db, s.manager)
    s.manager.oauth_callback.assert_not_awaited()
    s.client.get_id_email.return_value = ("auth0|alice", "alice@example.test")
    s.manager.oauth_callback.side_effect = UserAlreadyExists()
    with pytest.raises(OnyxError):
        await host_auth.authenticate_host(s.request, s.db, s.manager)


def test_library_forwarding_is_bound_to_user_server_and_exact_origin(
    setup_host: SimpleNamespace,
) -> None:
    s = setup_host
    session = host_auth.HostSession(
        identity=SessionIdentity(
            native_user_id=s.user.id, issuer=s.payload["iss"], subject=s.payload["sub"]
        ),
        organization_id="org_a",
        access_token="host-secret",
    )
    server = MCPServer(
        id=22,
        server_url="https://kb.example/api/mcp/library",
        auth_type=MCPAuthenticationType.OAUTH,
    )
    with host_auth.host_request(session):
        assert require_session_identity(s.user.id).subject == "auth0|alice"
        credentials = resolve_mcp_credentials(server, s.user, s.db)
        assert credentials.build_headers() == {"Authorization": "Bearer host-secret"}
        assert credentials.connection_config is None
        assert credentials.can_authenticate()
        with pytest.raises(OnyxError):
            host_auth.library_host_token(uuid4(), 22, server.server_url)
        for url in (
            "https://evil.example/api/mcp/library",
            "https://kb.example/api/other",
            "https://kb.example/api/mcp/library?redirect=evil",
        ):
            with pytest.raises(OnyxError):
                host_auth.library_host_token(s.user.id, 22, url)
        assert host_auth.library_host_token(s.user.id, 99, server.server_url) is None
    assert host_auth.host_session_for(s.user.id) is None
    with pytest.raises(OnyxError):
        require_session_identity(s.user.id)


def test_pinned_mcp_server_gets_host_token_only_at_its_exact_url(
    setup_host: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An env-pinned first-party server (ep-mcp) receives the shared Auth0 token
    as Bearer; a different stored URL, another server or another user does not."""
    s = setup_host
    monkeypatch.setenv(
        "CAUSL_KB_HOST_MCP_SERVERS",
        "31=http://ep-mcp:8000/mcp, 32=http://ep.public.example/mcp,"
        " 34=http://[2001:db8::1]/mcp, 35=http://2130706433/mcp",
    )
    session = host_auth.HostSession(
        identity=SessionIdentity(
            native_user_id=s.user.id, issuer=s.payload["iss"], subject=s.payload["sub"]
        ),
        organization_id="org_a",
        access_token="host-secret",
    )
    ep = MCPServer(
        id=31, server_url="http://ep-mcp:8000/mcp", auth_type=MCPAuthenticationType.NONE
    )
    assert host_auth.library_host_token(s.user.id, 31, ep.server_url) is None
    with host_auth.host_request(session):
        credentials = resolve_mcp_credentials(ep, s.user, s.db)
        assert credentials.build_headers() == {"Authorization": "Bearer host-secret"}
        assert host_auth.library_host_token(s.user.id, 31, "http://ep-mcp:8000/mcp/")
        # A URL that does not match its pin withholds the token for that server
        # only; the Library server in the same chat still gets it.
        for url in (
            "http://evil:8000/mcp",
            "https://ep-mcp:8000/mcp",
            "http://ep-mcp:8000/other",
            "http://ep-mcp:8000/mcp?x=1",
        ):
            assert host_auth.library_host_token(s.user.id, 31, url) is None
        library = MCPServer(
            id=22,
            server_url="https://kb.example/api/mcp/library",
            auth_type=MCPAuthenticationType.OAUTH,
        )
        assert resolve_mcp_credentials(library, s.user, s.db).build_headers() == {
            "Authorization": "Bearer host-secret"
        }
        # Plain HTTP only to a single DNS label: never a dotted name, an IP
        # literal or a digit-only host.
        for server_id, url in (
            (32, "http://ep.public.example/mcp"),
            (34, "http://[2001:db8::1]/mcp"),
            (35, "http://2130706433/mcp"),
        ):
            assert host_auth.library_host_token(s.user.id, server_id, url) is None
        assert host_auth.library_host_token(s.user.id, 33, ep.server_url) is None
        with pytest.raises(OnyxError):
            host_auth.library_host_token(uuid4(), 31, ep.server_url)


def test_bedrock_qa_grant_is_user_org_and_time_bound(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    session = host_auth.HostSession(
        identity=SessionIdentity(
            native_user_id=user_id, issuer="https://auth.example/", subject="auth0|qa"
        ),
        organization_id="org_qa",
        access_token="private",
    )
    monkeypatch.delenv("CAUSL_KB_APP_BEDROCK_ENABLED", raising=False)
    with host_auth.host_request(session):
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_USER_ID", str(user_id))
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_ORG_ID", "org_qa")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_UNTIL", str(int(time.time()) + 600))
        host_auth.require_host_subscription_provider("bedrock")
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("openai")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_ORG_ID", "org_other")
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_ORG_ID", "org_qa")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_USER_ID", str(uuid4()))
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_USER_ID", str(user_id))
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_UNTIL", str(int(time.time()) - 1))
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")
        monkeypatch.setenv("CAUSL_KB_QA_BEDROCK_UNTIL", "invalid")
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")


def test_app_bedrock_flag_allows_only_bedrock(monkeypatch: pytest.MonkeyPatch) -> None:
    session = host_auth.HostSession(
        identity=SessionIdentity(
            native_user_id=uuid4(), issuer="https://auth.example/", subject="auth0|any"
        ),
        organization_id="org_any",
        access_token="private",
    )
    monkeypatch.delenv("CAUSL_KB_APP_BEDROCK_ENABLED", raising=False)
    with host_auth.host_request(session):
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")
        monkeypatch.setenv("CAUSL_KB_APP_BEDROCK_ENABLED", "false")
        with pytest.raises(OnyxError):
            host_auth.require_host_subscription_provider("bedrock")
        monkeypatch.setenv("CAUSL_KB_APP_BEDROCK_ENABLED", "TRUE")
        assert host_auth.require_host_subscription_provider("bedrock") is False
        for other in ("openai", "databricks"):
            with pytest.raises(OnyxError):
                host_auth.require_host_subscription_provider(other)


def test_pinned_host_mcp_url_matches_only_the_exact_pin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CAUSL_KB_HOST_MCP_SERVERS", raising=False)
    assert not host_auth.is_pinned_host_mcp_url("http://ep-mcp:8000/mcp")
    monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", "9=http://ep-mcp:8000/mcp")
    assert host_auth.is_pinned_host_mcp_url("http://ep-mcp:8000/mcp")
    for other in (
        "http://ep-mcp:8000/mcp/",
        "http://ep-mcp:8000/mcp//",
        "http://ep-mcp:8000/other",
        "http://ep-mcp:9000/mcp",
        "http://ep-mcp:8000/mcp?x=1",
        "http://169.254.169.254/latest",
        "http://cache:6379/mcp",
    ):
        assert not host_auth.is_pinned_host_mcp_url(other)
    for unsafe in (
        "http://10.0.0.5:8000/mcp",
        "https://169.254.169.254/latest",
        "https://[fd00::1]/mcp",
        "http://localhost:8000/mcp",
        "http://metadata/computeMetadata",
    ):
        monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", f"9={unsafe}")
        assert not host_auth.is_pinned_host_mcp_url(unsafe)
        assert not host_auth.is_pinned_host_mcp_server(9)
    monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", "9=")
    assert not host_auth.is_pinned_host_mcp_server(9)
    monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", "9=https://studies.example.com/mcp")
    assert host_auth.is_pinned_host_mcp_server(9)
    assert host_auth.is_pinned_host_mcp_url("https://studies.example.com/mcp")
