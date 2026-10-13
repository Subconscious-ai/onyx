"""Read current workspace context through native per-user Library OAuth."""

import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError
from sqlalchemy.orm import Session

from onyx.auth.session_identity import require_session_identity
from onyx.db.enums import MCPAuthenticationPerformer, MCPAuthenticationType
from onyx.db.mcp import get_mcp_servers_for_persona
from onyx.db.models import MCPServer, User
from onyx.db.persona import user_can_access_persona
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.features.mcp.credentials import (
    MCPCredentialsError,
    extract_connection_data,
    mcp_token_expired,
    resolve_mcp_credentials,
)
from onyx.server.features.mcp.oauth import refresh_mcp_oauth_token_if_expired
from onyx.server.query_and_chat.causl.models import (
    CauslActor,
    CauslContextEnvelope,
    CauslSelection,
)

MAX_CONTEXT_BYTES = 36_000


@dataclass(frozen=True)
class CauslConfiguration:
    persona_id: int
    library_server_id: int


@dataclass(frozen=True)
class AuthorizedCauslContext:
    configuration: CauslConfiguration
    envelope: CauslContextEnvelope


def configuration() -> CauslConfiguration:
    try:
        persona_id = int(os.environ.get("CAUSL_KB_ASSISTANT_PERSONA_ID", ""))
        server_id = int(os.environ.get("CAUSL_KB_MCP_SERVER_ID", ""))
        if persona_id <= 0 or server_id <= 0:
            raise ValueError("Positive IDs required")
    except ValueError:
        raise OnyxError(
            OnyxErrorCode.SERVICE_UNAVAILABLE, "Workspace assistant is not configured."
        ) from None
    return CauslConfiguration(persona_id, server_id)


def context_url(server_url: str) -> str:
    """Only the admin-configured Library origin can receive its OAuth credential."""
    url = urlsplit(server_url)
    if (
        url.scheme not in ("https", "http")
        or not url.hostname
        or url.username is not None
        or url.password is not None
        or url.path.rstrip("/") != "/api/mcp/library"
        or url.query
        or url.fragment
        or (
            url.scheme == "http"
            and url.hostname not in ("localhost", "127.0.0.1", "::1")
        )
    ):
        raise OnyxError(
            OnyxErrorCode.SERVICE_UNAVAILABLE,
            "The workspace Library connection is not configured.",
        )
    return f"{url.scheme}://{url.netloc}/api/assistant/native-context"


def _library_server(db: Session, user: User, config: CauslConfiguration) -> MCPServer:
    if user.is_anonymous or not user_can_access_persona(db, config.persona_id, user):
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    server = next(
        (
            server
            for server in get_mcp_servers_for_persona(config.persona_id, db, user)
            if server.id == config.library_server_id
        ),
        None,
    )
    if (
        server is None
        or server.auth_type != MCPAuthenticationType.OAUTH
        or server.auth_performer != MCPAuthenticationPerformer.PER_USER
    ):
        raise OnyxError(
            OnyxErrorCode.SERVICE_UNAVAILABLE,
            "A per-user Library connection is required.",
        )
    return server


def _headers(
    db: Session, user: User, server: MCPServer, actor: CauslActor, issuer: str
) -> dict[str, str]:
    try:
        credentials = resolve_mcp_credentials(server, user, db)
    except MCPCredentialsError:
        raise OnyxError(
            OnyxErrorCode.UNAUTHENTICATED, "Connect your Library account."
        ) from None
    if not credentials.can_authenticate() or credentials.connection_config is None:
        raise OnyxError(OnyxErrorCode.UNAUTHENTICATED, "Connect your Library account.")
    headers = {key.lower(): value for key, value in credentials.build_headers().items()}
    if mcp_token_expired(extract_connection_data(credentials.connection_config)):
        refreshed = refresh_mcp_oauth_token_if_expired(
            server, credentials.connection_config.id
        )
        if not refreshed:
            raise OnyxError(
                OnyxErrorCode.UNAUTHENTICATED, "Reconnect your Library account."
            )
        headers["authorization"] = refreshed
    if not headers.get("authorization", "").lower().startswith("bearer "):
        raise OnyxError(OnyxErrorCode.UNAUTHENTICATED, "Connect your Library account.")
    # Stored and client headers cannot override the server-bound actor.
    headers["x-causl-expected-organization"] = actor.org_id
    headers["x-causl-expected-subject"] = actor.user_id
    headers["x-causl-expected-issuer"] = issuer
    return headers


def _read(
    url: str, headers: dict[str, str], selection: CauslSelection
) -> CauslContextEnvelope:
    try:
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            with client.stream(
                "GET", url, headers=headers, params=selection.query()
            ) as response:
                if response.status_code != 200:
                    code = (
                        OnyxErrorCode.UNAUTHORIZED
                        if response.status_code in (401, 403)
                        else OnyxErrorCode.NOT_FOUND
                        if response.status_code == 404
                        else OnyxErrorCode.BAD_GATEWAY
                    )
                    raise OnyxError(code, "Workspace context is unavailable.")
                body = bytearray()
                for chunk in response.iter_bytes(chunk_size=4096):
                    body.extend(chunk)
                    if len(body) > MAX_CONTEXT_BYTES:
                        raise OnyxError(
                            OnyxErrorCode.PAYLOAD_TOO_LARGE,
                            "Workspace context is too large.",
                        )
                return CauslContextEnvelope.model_validate_json(body)
    except httpx.HTTPError:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "The Library connection is unavailable."
        ) from None
    except ValidationError:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "The Library returned invalid context."
        ) from None


def _valid_analysis(analysis: object, selection: CauslSelection) -> bool:
    if not selection.run_id and not selection.studio_id:
        return analysis is None
    if not isinstance(analysis, dict):
        return False
    run = analysis.get("run")
    if not isinstance(run, dict):
        return False
    run_id = run.get("id")
    if not isinstance(run_id, str) or not run_id:
        return False
    if selection.run_id and run_id != selection.run_id:
        return False
    studio = analysis.get("studio")
    return (
        isinstance(studio, dict) and studio.get("id") == str(selection.studio_id)
        if selection.studio_id
        else studio is None
    )


def _validate(
    envelope: CauslContextEnvelope, actor: CauslActor, selection: CauslSelection
) -> None:
    context = envelope.context
    if envelope.actor != actor:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "The Library account does not match this workspace.",
        )
    market = context.get("market")
    record = context.get("record")
    analysis = context.get("analysis")
    valid = (
        context.get("version") == 1
        and context.get("page") == selection.page
        and all(
            isinstance(context.get(key), str)
            and re.fullmatch("[a-f0-9]{64}", context[key])
            for key in ("scopeKey", "digest")
        )
        and (
            isinstance(market, dict) and market.get("id") == selection.market_id
            if selection.market_id
            else market is None
        )
        and (
            isinstance(record, dict)
            and record.get("id") == selection.record.id
            and record.get("type") == selection.record.type
            if selection.record
            else record is None
        )
        and _valid_analysis(analysis, selection)
        and isinstance(context.get("library"), dict)
    )
    if not valid:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "The Library returned mismatched context."
        )


def load_causl_context(
    db: Session, user: User, actor: CauslActor, selection: CauslSelection
) -> AuthorizedCauslContext:
    config = configuration()
    identity = require_session_identity(user.id)
    if identity.subject != actor.user_id:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Your Library account does not match your Onyx sign-in.",
        )
    server = _library_server(db, user, config)
    url = context_url(server.server_url)
    envelope = _read(url, _headers(db, user, server, actor, identity.issuer), selection)
    _validate(envelope, actor, selection)
    if envelope.issuer != identity.issuer:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Your Library account does not match your Onyx sign-in.",
        )
    return AuthorizedCauslContext(config, envelope)
