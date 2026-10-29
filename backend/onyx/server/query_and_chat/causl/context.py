"""Read current workspace context through native per-user Library OAuth."""

import json
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from pydantic import ValidationError
from sqlalchemy.orm import Session

from onyx.auth.session_identity import require_session_identity
from onyx.db.burn2_brief import owned_snapshot
from onyx.db.causl_workspace import read_causl_binding, update_interview_market
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

# KB context is capped at 64 KB; leave room for the verified actor envelope.
MAX_CONTEXT_BYTES = 68_000


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
    db: Session, user: User, server: MCPServer, actor: CauslActor | None, issuer: str
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
    headers.pop("x-causl-expected-organization", None)
    if actor is not None:
        headers["x-causl-expected-organization"] = actor.org_id
    headers["x-causl-expected-subject"] = (
        actor.user_id if actor else require_session_identity(user.id).subject
    )
    headers["x-causl-expected-issuer"] = issuer
    return headers


def _read(
    url: str,
    headers: dict[str, str],
    selection: CauslSelection,
    *,
    start_research: bool = False,
) -> CauslContextEnvelope:
    try:
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            with client.stream(
                "POST" if start_research else "GET",
                url,
                headers=headers,
                params=selection.query(),
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


def _valid_inferred_analysis(
    analysis: object, selection: CauslSelection, record: object, run_id: str
) -> bool:
    if (
        not isinstance(analysis, dict)
        or not selection.record
        or selection.record.type != "estimate"
    ):
        return False
    properties = record.get("properties") if isinstance(record, dict) else None
    if (
        not isinstance(properties, dict)
        or properties.get("subconsciousExperimentId") != run_id
    ):
        return False
    estimates = analysis.get("estimates")
    return (
        analysis.get("studio") is None
        and isinstance(estimates, list)
        and any(
            isinstance(estimate, dict)
            and estimate.get("id") == selection.record.id
            and estimate.get("runId") == run_id
            for estimate in estimates
        )
    )


def _valid_analysis(
    analysis: object, selection: CauslSelection, record: object
) -> bool:
    if not selection.run_id and not selection.studio_id and analysis is None:
        return True
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
    if not selection.run_id and not selection.studio_id:
        return _valid_inferred_analysis(analysis, selection, record, run_id)
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
        and _valid_analysis(analysis, selection, record)
        and isinstance(context.get("library"), dict)
    )
    if not valid:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "The Library returned mismatched context."
        )


def load_causl_context(
    db: Session,
    user: User,
    actor: CauslActor | None,
    selection: CauslSelection,
    *,
    start_research: bool = False,
) -> AuthorizedCauslContext:
    config = configuration()
    identity = require_session_identity(user.id)
    if actor is not None and identity.subject != actor.user_id:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Your Library account does not match your Onyx sign-in.",
        )
    server = _library_server(db, user, config)
    url = context_url(server.server_url)
    envelope = _read(
        url,
        _headers(db, user, server, actor, identity.issuer),
        selection,
        start_research=start_research,
    )
    _validate(envelope, actor or envelope.actor, selection)
    if envelope.issuer != identity.issuer or envelope.actor.user_id != identity.subject:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Your Library account does not match your Onyx sign-in.",
        )
    return AuthorizedCauslContext(config, envelope)


def load_interview_context(
    db: Session, user: User, *, start_research: bool = False
) -> AuthorizedCauslContext:
    """The verified Library token selects the initial organization, never the email."""
    config = configuration()
    identity = require_session_identity(user.id)
    server = _library_server(db, user, config)
    selection = CauslSelection(page="workspace")
    envelope = _read(
        context_url(server.server_url),
        _headers(db, user, server, None, identity.issuer),
        selection,
        start_research=start_research,
    )
    if envelope.actor.user_id != identity.subject or envelope.issuer != identity.issuer:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Your Library account does not match your sign-in.",
        )
    _validate(envelope, envelope.actor, selection)
    return AuthorizedCauslContext(config, envelope)


def send_interview_brief(db: Session, user: User, chat_id: UUID) -> None:
    """Hand the saved interview brief to the Library as soon as Onyx prepares it."""
    binding = read_causl_binding(db, user.id, chat_id)
    if binding is None or binding.mode != "interview":
        native_research = os.environ.get("BURN2_RESEARCH_PERSONA_ID", "")
        if native_research.isdecimal() and int(native_research) > 0:
            raise OnyxError(
                OnyxErrorCode.UNAUTHORIZED,
                "Reconnect your Library account before saving this business draft.",
            )
        return
    server = _library_server(db, user, configuration())
    if server.id != binding.library_server_id:
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)
    url = context_url(server.server_url).removesuffix("native-context") + "onyx-brief"
    snapshot = owned_snapshot(chat_id, user.id, db)
    messages = [
        {"type": row["type"], "message": row["message"]}
        for row in snapshot["transcript"]
        if row["type"] in ("user", "assistant")
    ]
    payload = {
        "format": "burn/onyx-interview",
        "version": 1,
        "chatId": str(chat_id),
        "messages": messages,
    }
    from onyx.db.burn2_profile import read_profile
    from onyx.db.burn2_research import read_research
    from onyx.server.query_and_chat.burn2.research import model_business_context
    from onyx.server.query_and_chat.burn2.validation import latest_saved_brief

    brief = latest_saved_brief(
        snapshot["transcript"],
        [row["message"] for row in messages if row["type"] == "user"],
    )
    if brief:
        research = read_research(user.id)
        preparation = model_business_context(
            read_profile(user.id), research, brief.get("company")
        )
        if preparation is not None:
            payload["businessContext"] = preparation
            if research and preparation["research"].get("status") == "ready":
                captures = research.get("source_captures")
                operation_id = research.get("job_id")
                if (
                    isinstance(operation_id, str)
                    and isinstance(captures, list)
                    and 0 < len(captures) <= 4
                    and all(isinstance(source, dict) for source in captures)
                ):
                    sources = [
                        {
                            key: source[key]
                            for key in ("url", "title", "text", "sha256", "fetched_at")
                            if key in source
                        }
                        for source in captures
                    ]
                    native = {"operationId": operation_id, "sources": sources}
                    if (
                        len(json.dumps(native, ensure_ascii=False).encode("utf-8"))
                        <= 1_000_000
                    ):
                        payload["nativeResearch"] = native
    with httpx.Client(timeout=10, follow_redirects=False) as client:
        response = client.post(
            url,
            headers=_headers(db, user, server, binding.actor, binding.issuer),
            json=payload,
        )
    if response.status_code != 200:
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "The Library did not save the brief."
        )
    try:
        saved = response.json()
        market_id = saved.get("marketId") if isinstance(saved, dict) else None
        if not isinstance(market_id, str) or not market_id.strip():
            raise ValueError("Missing saved market")
        CauslSelection.model_validate(
            {
                **binding.selection.model_dump(by_alias=True),
                "marketId": market_id,
            }
        )
    except (ValueError, ValidationError):
        raise OnyxError(
            OnyxErrorCode.BAD_GATEWAY, "The Library did not return the saved market."
        ) from None
    db.expire_all()
    if owned_snapshot(chat_id, user.id, db)["digest"] != snapshot["digest"]:
        raise OnyxError(
            OnyxErrorCode.CONFLICT, "The interview changed. Save the current draft."
        )
    update_interview_market(db, binding, market_id, snapshot["digest"])
