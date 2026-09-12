"""Native workers retain preparation when the interview browser closes."""

import os
import time
from uuid import UUID

from celery import shared_task

from onyx.cache.factory import get_cache_backend
from onyx.db.burn2_profile import read_profile
from onyx.db.burn2_research import read_research, research_connection, save_research
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import User
from onyx.server.features.mcp.client import call_mcp_tool
from onyx.server.query_and_chat.burn2.research import (
    public_research_query,
    research_receipt,
)
from onyx.utils.logger import setup_logger
from shared_configs.contextvars import get_current_tenant_id

logger = setup_logger()


@shared_task(ignore_result=True, trail=False)
def research_company(
    *, user_id: str, persona_id: int, job_id: str, tenant_id: str
) -> None:
    if tenant_id != get_current_tenant_id():
        raise ValueError("Research tenant context mismatch")
    if os.environ.get("BURN2_ENABLED") != "true":
        return
    user_uuid = UUID(user_id)
    lock = get_cache_backend().lock(f"burn2:research-work:{user_id}", timeout=180)
    if not lock.acquire(blocking=False):
        return
    try:
        state = read_research(user_uuid)
        if not state or state.get("job_id") != job_id or state.get("status") == "ready":
            return
        query = public_research_query(read_profile(user_uuid))
        if query != state.get("query"):
            return
        state = {**state, "status": "running", "checked_at": time.time()}
        save_research(user_uuid, state)
        try:
            url, headers, transport = research_connection(user_uuid, persona_id)
            receipt = research_receipt(
                call_mcp_tool(
                    url,
                    "deep_research",
                    {"query": query},
                    connection_headers=headers,
                    transport=transport,
                )
            )
            result = {**state, **receipt, "status": "ready", "checked_at": time.time()}
        except Exception as error:
            logger.warning("Burn public research unavailable: %s", type(error).__name__)
            result = {
                **state,
                "status": "unavailable",
                "checked_at": time.time(),
                "reason": "Public research did not complete",
            }
        current = read_research(user_uuid)
        if (
            current
            and current.get("job_id") == job_id
            and public_research_query(read_profile(user_uuid)) == query
        ):
            save_research(user_uuid, result)
    finally:
        if lock.owned():
            lock.release()


@shared_task(ignore_result=True, trail=False)
def prepare_saved_brief(*, user_id: str, chat_id: str, tenant_id: str) -> None:
    if tenant_id != get_current_tenant_id():
        raise ValueError("Brief tenant context mismatch")
    if os.environ.get("BURN2_BACKGROUND_PREPARATION") != "true":
        return
    from onyx.auth.permissions import has_global_permission
    from onyx.db.enums import Permission
    from onyx.server.query_and_chat.burn2.api import PrepareBrief, prepare_brief

    with get_session_with_current_tenant() as db:
        user = db.get(User, UUID(user_id))
        if (
            not user
            or not user.is_active
            or not has_global_permission(user, Permission.WRITE_CHAT)
        ):
            return
        try:
            prepare_brief(PrepareBrief(chat_id=UUID(chat_id)), user, db)
        except Exception as error:
            logger.warning(
                "Burn background brief unavailable: %s", type(error).__name__
            )
