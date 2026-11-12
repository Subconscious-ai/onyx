"""Twenty owns record permission checks; native Onyx owns personal conversations."""

import json
import os
from time import monotonic
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from pydantic import ValidationError

from onyx.auth.host_auth import HostSession, host_session_for
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.models import TwentyContext

if TYPE_CHECKING:
    from onyx.db.models import Tool as ToolModel


def require_twenty_session(user_id: UUID) -> HostSession:
    session = host_session_for(user_id)
    if session is None:
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED, "Open this conversation in Twenty.")
    return session


def authorize_twenty_context(
    session: HostSession,
    scope: dict[str, Any],
    *,
    client: httpx.Client | None = None,
    timeout: float = 15,
) -> TwentyContext:
    origin = os.environ.get("TWENTY_PANEL_ORIGIN", "")
    parsed = urlsplit(origin)
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
        or not (
            parsed.scheme == "https"
            or (
                parsed.scheme == "http"
                and parsed.hostname in ("localhost", "127.0.0.1", "::1")
            )
        )
    ):
        raise OnyxError(
            OnyxErrorCode.SERVICE_UNAVAILABLE, "Twenty context is not configured."
        )
    if len(json.dumps(scope).encode()) > 128_000:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT)
    try:

        def exchange(transport: httpx.Client) -> TwentyContext:
            deadline = monotonic() + timeout

            def check_deadline() -> None:
                if monotonic() >= deadline:
                    raise ValueError("Twenty context deadline exceeded")

            with transport.stream(
                "POST",
                origin + "/rest/ai/shared-panel/personal-authorize",
                headers={"Authorization": f"Bearer {session.access_token}"},
                json=scope,
                timeout=timeout,
                follow_redirects=False,
            ) as response:
                check_deadline()
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    check_deadline()
                    content.extend(chunk)
                    if len(content) > 256_000:
                        raise ValueError("Context response exceeds its bound")
            return TwentyContext.model_validate_json(content)

        if client is None:
            with httpx.Client(trust_env=False) as transport:
                context = exchange(transport)
        else:
            context = exchange(client)
        if (
            context.subject != session.identity.subject
            or context.issuer != session.identity.issuer
            or context.orgId != session.organization_id
        ):
            raise ValueError("Context identity changed")
        if "contextId" not in scope and context.references() != scope:
            raise ValueError("Context scope changed")
        return context
    except (httpx.HTTPError, ValueError, ValidationError) as exc:
        raise OnyxError(
            OnyxErrorCode.UNAUTHORIZED,
            "Twenty record access is unavailable. Reopen Twenty or select an accessible record.",
        ) from exc


def twenty_read_only_tool_ids(
    tools: list["ToolModel"],
    allowed_tool_ids: list[int] | None,
    forced_tool_id: int | None,
) -> list[int]:
    from onyx.tools.constants import FILE_READER_TOOL_ID, SEARCH_TOOL_ID

    permitted = [
        tool.id
        for tool in tools
        if tool.in_code_tool_id in (FILE_READER_TOOL_ID, SEARCH_TOOL_ID)
        and (allowed_tool_ids is None or tool.id in allowed_tool_ids)
    ]
    if forced_tool_id is not None and forced_tool_id not in permitted:
        raise OnyxError(
            OnyxErrorCode.INVALID_INPUT,
            "Only search and attachment reading are available for Twenty record conversations.",
        )
    return permitted
