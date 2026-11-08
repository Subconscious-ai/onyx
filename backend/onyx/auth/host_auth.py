"""Request-bound KB access tokens reuse native OIDC users and admission rules."""

import ipaddress
import os
import re
import socket
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from urllib.parse import urlsplit
from uuid import UUID

import jwt
from fastapi import Request
from fastapi_users.exceptions import UserAlreadyExists, UserNotExists
from httpx_oauth.exceptions import GetIdEmailError
from sqlalchemy.ext.asyncio import AsyncSession

from onyx.auth.jwt import verify_jwt_token
from onyx.auth.oidc_client import VerifiedEmailOpenID
from onyx.auth.session_identity import SessionIdentity, request_session_identity
from onyx.db.models import User
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.security.store import get_security_settings
from onyx.utils.logger import setup_logger
from shared_configs.configs import MULTI_TENANT

if TYPE_CHECKING:
    from onyx.auth.users import UserManager

logger = setup_logger()


@dataclass(frozen=True)
class HostSession:
    identity: SessionIdentity
    organization_id: str
    access_token: str = field(repr=False)


_host_session: ContextVar[HostSession | None] = ContextVar(
    "causl_host_session", default=None
)


def _denied() -> OnyxError:
    return OnyxError(
        OnyxErrorCode.UNAUTHENTICATED, "Your shared account session is unavailable."
    )


def host_auth_requested(request: Request) -> bool:
    if request.headers.get("X-Causl-Host-Auth") == "1":
        return True
    if os.environ.get("CAUSL_KB_HOST_AUTH_ENABLED") != "true":
        return False
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or len(token) > 32768:
        return False
    try:
        # This only selects the strict verifier. These claims grant no access.
        payload = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return False
    issuer = get_security_settings().jwt_expected_issuer
    return bool(issuer) and payload.get("iss") == issuer


async def authenticate_host(
    request: Request, db: AsyncSession, manager: "UserManager"
) -> tuple[User, HostSession]:
    # Multi-tenant Onyx needs an independently verified workspace pin before
    # admission. The current first-party deployment uses one native workspace.
    settings = get_security_settings()
    if (
        os.environ.get("CAUSL_KB_HOST_AUTH_ENABLED") != "true"
        or MULTI_TENANT
        or not settings.jwt_expected_issuer
        or not settings.jwt_expected_audience
        or not settings.jwt_public_key_url
    ):
        raise _denied()
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 32768:
        raise _denied()
    payload = await verify_jwt_token(token)
    if (
        not payload
        or payload.get("iss") != settings.jwt_expected_issuer
        or not isinstance(payload.get("sub"), str)
        or not payload["sub"]
        or not isinstance(payload.get("org_id"), str)
        or not payload["org_id"]
        or not isinstance(payload.get("exp"), (int, float))
        or payload["exp"] <= time.time()
    ):
        raise _denied()

    # Reuse the enabled native provider and its guarded discovery cache. Local
    # imports avoid the users -> OIDC router -> users module-load cycle.
    from onyx.server.oidc_multi import get_oauth_client, resolve_oidc_provider

    provider, config = await db.run_sync(
        lambda session: resolve_oidc_provider(
            session, os.environ.get("CAUSL_KB_AUTH0_PROVIDER_NAME", "auth0")
        )
    )
    client = await get_oauth_client(provider, config)
    if (
        not isinstance(client, VerifiedEmailOpenID)
        or client.expected_issuer != payload["iss"]
    ):
        raise _denied()
    try:
        user = await manager.get_by_oauth_account(provider.name, payload["sub"])
    except UserNotExists:
        try:
            subject, email = await client.get_id_email(token)
        except GetIdEmailError as exc:
            raise _denied() from exc
        if subject != payload["sub"] or not email:
            raise _denied()
        try:
            user = await manager.oauth_callback(
                provider.name,
                "",  # Create the subject binding without persisting a KB credential.
                subject,
                email,
                request=request,
                associate_by_email=False,
                allow_email_link=False,
                is_verified_by_default=True,
                allowed_email_domains_override=provider.allowed_email_domains,
                auto_join_verified_email=client.allows_verified_email_to_join(email),
            )
        except UserAlreadyExists as exc:
            raise _denied() from exc
    if not user.is_active or not user.account_type.is_web_login():
        raise _denied()
    return user, HostSession(
        identity=SessionIdentity(
            native_user_id=user.id, issuer=payload["iss"], subject=payload["sub"]
        ),
        organization_id=payload["org_id"],
        access_token=token,
    )


@contextmanager
def host_request(session: HostSession | None) -> Iterator[None]:
    token = _host_session.set(session)
    try:
        if session is None:
            yield
        else:
            with request_session_identity(session.identity):
                yield
    finally:
        _host_session.reset(token)


def host_session_for(user_id: UUID) -> HostSession | None:
    session = _host_session.get()
    if session is not None and session.identity.native_user_id != user_id:
        raise _denied()
    return session


def require_host_subscription_provider(
    provider: str,
    api_key: str | None = None,
    api_base: str | None = None,
    has_provider_overrides: bool = False,
) -> bool:
    """Require subscription billing; return whether native Claude must be pinned."""
    session = _host_session.get()
    if session is None or provider == "chatgpt":
        return False
    if (
        provider == "anthropic"
        and bool(api_key and api_key.startswith("sk-ant-oat"))
        and api_base in (None, "https://api.anthropic.com")
        and not has_provider_overrides
    ):
        return True
    # Owner-approved metered app chat (2026-11-08): Bedrock bills the AWS account per
    # token, so it is opt-in per deployment and never enables any other provider.
    if (
        provider == "bedrock"
        and os.environ.get("CAUSL_KB_APP_BEDROCK_ENABLED", "").lower() == "true"
    ):
        return False
    # Explicit local QA approval expires and never applies to other identities.
    try:
        qa_until = int(os.environ.get("CAUSL_KB_QA_BEDROCK_UNTIL", "0"))
    except ValueError:
        qa_until = 0
    if (
        provider == "bedrock"
        and str(session.identity.native_user_id)
        == os.environ.get("CAUSL_KB_QA_BEDROCK_USER_ID")
        and session.organization_id == os.environ.get("CAUSL_KB_QA_BEDROCK_ORG_ID")
        and time.time() < qa_until
    ):
        return False
    raise OnyxError(
        OnyxErrorCode.SERVICE_UNAVAILABLE,
        "Application chat requires a configured ChatGPT or Claude subscription provider. "
        "Paid provider fallback is disabled.",
    )


def _pinned_host_mcp_url(server_id: int) -> str | None:
    """Exact URL of an extra first-party MCP server that verifies the shared Auth0
    token itself (e.g. the EDSL study server ep-mcp). Configured only by deployment env
    `CAUSL_KB_HOST_MCP_SERVERS="<server id>=<url>,..."`, never by the admin UI, so
    changing a server's stored URL cannot redirect the user's token."""
    for entry in os.environ.get("CAUSL_KB_HOST_MCP_SERVERS", "").split(","):
        key, sep, url = entry.strip().partition("=")
        if sep and key.strip() == str(server_id):
            return url.strip()
    return None


_UNSAFE_PIN_HOSTS = frozenset({"localhost", "metadata", "metadata.google.internal"})


def _safe_pin(pinned: str) -> bool:
    """A pin must name a first-party service by DNS name: HTTPS, or HTTP to a
    single-label Compose service. IP literals and loopback/metadata names are
    refused, so a pin can never reopen what the SSRF guard blocks."""
    pin = urlsplit(pinned)
    host = pin.hostname
    if not host or host.endswith(".") or host in _UNSAFE_PIN_HOSTS:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    try:
        socket.inet_aton(host)  # numeric IPv4 shorthands such as 127.1 or 2130706433
        return False
    except OSError:
        pass
    if not re.search(r"[a-z]", host.rsplit(".", 1)[-1]):
        return False
    if pin.query or pin.fragment or pin.username or pin.password:
        return False
    return pin.scheme == "https" or (
        pin.scheme == "http" and bool(_SERVICE_LABEL.fullmatch(host))
    )


def is_pinned_host_mcp_server(server_id: int) -> bool:
    pinned = _pinned_host_mcp_url(server_id)
    return bool(pinned) and _safe_pin(pinned)


def is_pinned_host_mcp_url(url: str) -> bool:
    """True only for a request to exactly the URL of a safe
    `CAUSL_KB_HOST_MCP_SERVERS` pin (same scheme, host, port and path; no
    query, fragment or userinfo). The MCP SSRF guard lets only these through."""
    req = urlsplit(url)
    if req.query or req.fragment or req.username or req.password:
        return False
    for entry in os.environ.get("CAUSL_KB_HOST_MCP_SERVERS", "").split(","):
        _, sep, pinned = entry.strip().partition("=")
        pinned = pinned.strip()
        if not (sep and pinned and _safe_pin(pinned)):
            continue
        pin = urlsplit(pinned)
        if (req.scheme, req.netloc, req.path) == (pin.scheme, pin.netloc, pin.path):
            return True
    return False


_SERVICE_LABEL = re.compile(r"[a-z][a-z0-9-]*")


def _same_pinned_url(server_url: str, pinned: str) -> bool:
    url, pin = urlsplit(server_url), urlsplit(pinned)
    # HTTPS, or plain HTTP only to a single DNS label (a Compose service name on
    # the host's private network). IP literals and digit-only hosts never match.
    private_http = pin.scheme == "http" and bool(
        pin.hostname and _SERVICE_LABEL.fullmatch(pin.hostname)
    )
    return (
        (pin.scheme == "https" or private_http)
        and bool(pin.hostname)
        and not (pin.query or pin.fragment or pin.username or pin.password)
        and (url.scheme, url.netloc, url.path.rstrip("/"))
        == (pin.scheme, pin.netloc, pin.path.rstrip("/"))
        and not (url.query or url.fragment or url.username or url.password)
    )


def library_host_token(user_id: UUID, server_id: int, server_url: str) -> str | None:
    session = host_session_for(user_id)
    if session is None:
        return None
    pinned = _pinned_host_mcp_url(server_id)
    if pinned is not None and str(server_id) != os.environ.get(
        "CAUSL_KB_MCP_SERVER_ID"
    ):
        if not _same_pinned_url(server_url, pinned):
            # Fail only this server: it gets no token (its own calls then 401),
            # while the Library and every other tool in the chat keep working.
            logger.warning(
                "MCP server %s URL does not match its CAUSL_KB_HOST_MCP_SERVERS pin; "
                "the shared token is withheld",
                server_id,
            )
            return None
        return session.access_token
    if str(server_id) != os.environ.get("CAUSL_KB_MCP_SERVER_ID"):
        return None
    origin = os.environ.get("CAUSL_KB_HOST_ORIGIN", "")
    url = urlsplit(server_url)
    trusted = urlsplit(origin)
    if (
        not origin
        or trusted.scheme != "https"
        or trusted.path not in ("", "/")
        or trusted.query
        or trusted.fragment
        or trusted.username
        or trusted.password
        or not trusted.hostname
        or url.scheme != trusted.scheme
        or url.netloc != trusted.netloc
        or url.path.rstrip("/") != "/api/mcp/library"
        or url.query
        or url.fragment
        or url.username
        or url.password
    ):
        raise _denied()
    return session.access_token
