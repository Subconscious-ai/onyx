"""Fresh OIDC identity attached to one validated native session, never an email profile."""

import asyncio
import os
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError


class OIDCIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)
    issuer: str
    subject: str


class SessionIdentity(OIDCIdentity):
    native_user_id: UUID


_login_identity: ContextVar[OIDCIdentity | None] = ContextVar(
    "oidc_login_identity", default=None
)
_session_identity: ContextVar[SessionIdentity | None] = ContextVar(
    "verified_session_identity", default=None
)


@contextmanager
def request_session_identity(identity: SessionIdentity) -> Iterator[None]:
    token = _session_identity.set(identity)
    try:
        yield
    finally:
        _session_identity.reset(token)


@contextmanager
def oidc_login_identity(identity: OIDCIdentity | None) -> Iterator[None]:
    token = _login_identity.set(identity)
    try:
        yield
    finally:
        _login_identity.reset(token)


async def record_issued_identity(token: str, user_id: UUID) -> None:
    from onyx.db.session_identity import save_session_identity

    identity = _login_identity.get()
    if (
        identity is not None
        and os.environ.get("CAUSL_KB_ASSISTANT_PERSONA_ID")
        and os.environ.get("CAUSL_KB_MCP_SERVER_ID")
    ):
        await asyncio.to_thread(
            save_session_identity,
            token,
            SessionIdentity(native_user_id=user_id, **identity.model_dump()),
        )


async def read_validated_identity(token: str, user_id: UUID) -> None:
    from onyx.db.session_identity import read_session_identity

    identity = (
        await asyncio.to_thread(read_session_identity, token, user_id)
        if os.environ.get("CAUSL_KB_ASSISTANT_PERSONA_ID")
        and os.environ.get("CAUSL_KB_MCP_SERVER_ID")
        else None
    )
    _session_identity.set(identity)


async def remove_session_identity(token: str) -> None:
    from onyx.db.session_identity import delete_session_identity

    if os.environ.get("CAUSL_KB_ASSISTANT_PERSONA_ID") and os.environ.get(
        "CAUSL_KB_MCP_SERVER_ID"
    ):
        await asyncio.to_thread(delete_session_identity, token)


def require_session_identity(user_id: UUID) -> SessionIdentity:
    identity = _session_identity.get()
    if identity is None or identity.native_user_id != user_id:
        raise OnyxError(
            OnyxErrorCode.UNAUTHENTICATED,
            "Sign in through your shared organization account to open this workspace.",
        )
    return identity
