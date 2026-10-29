"""Schedule native background preparation without waiting on provider work."""

import os
import time
from uuid import UUID, uuid4

from onyx.background.celery.apps.client import celery_app as client_app
from onyx.cache.factory import get_cache_backend
from onyx.configs.constants import OnyxCeleryQueues
from onyx.db.burn2_profile import read_profile
from onyx.db.burn2_research import (
    read_research,
    research_connection,
    save_research,
    update_research_if_current,
)
from onyx.server.query_and_chat.burn2.research import (
    public_research_query,
    research_readback,
    research_reusable,
)
from onyx.utils.logger import setup_logger
from shared_configs.contextvars import get_current_tenant_id

logger = setup_logger()
RESEARCH_TASK = "onyx.background.celery.tasks.burn2.tasks.research_company"
BRIEF_TASK = "onyx.background.celery.tasks.burn2.tasks.prepare_saved_brief"


def _schedule_research(user_id: UUID, persona_id: int, state: dict) -> dict:
    try:
        client_app.send_task(
            RESEARCH_TASK,
            kwargs={
                "user_id": str(user_id),
                "persona_id": persona_id,
                "job_id": state["job_id"],
                "tenant_id": get_current_tenant_id(),
            },
            queue=OnyxCeleryQueues.PRIMARY,
            expires=300,
        )
    except Exception as error:
        logger.warning("Burn research queue unavailable: %s", type(error).__name__)
        state = {
            **state,
            "status": "unavailable",
            "reason": "Research could not be scheduled",
        }
        update_research_if_current(
            user_id, state, job_id=state["job_id"], status="queued"
        )
    return state


def ensure_research(user_id: UUID) -> dict:
    configured = os.environ.get("BURN2_RESEARCH_PERSONA_ID", "")
    if os.environ.get("BURN2_ENABLED") != "true" or not configured.isdecimal():
        return {"status": "disabled"}
    profile = read_profile(user_id)
    if profile.get("preparation_pending"):
        return {"status": "pending"}
    query = public_research_query(profile)
    if not query:
        return {"status": "needs_company"}
    operation = (
        profile.get("job_id")
        if profile.get("refresh_revision")
        == profile.get("correction", {}).get("revision", 0)
        else None
    )
    lock = get_cache_backend().lock(f"burn2:research:{user_id}", timeout=20)
    if not lock.acquire(blocking=False):
        state = research_readback(read_research(user_id), query)
        if state and (not operation or state.get("job_id") == operation):
            return state
        return {"status": "queued"}
    try:
        state = read_research(user_id)
        # A queued job has not crossed the worker's atomic running transition.
        if (
            state is not None
            and state.get("query") == query
            and (
                not operation
                or state.get("job_id") == operation
                or (
                    state.get("status") in {"queued", "running"}
                    and research_reusable(state, query)
                )
            )
        ):
            if state.get("status") == "queued" and not research_reusable(state, query):
                recovered = {**state, "checked_at": time.time()}
                if update_research_if_current(
                    user_id, recovered, job_id=state["job_id"], status="queued"
                ):
                    return _schedule_research(user_id, int(configured), recovered)
                return research_readback(read_research(user_id), query) or {
                    "status": "unavailable"
                }
            return research_readback(state, query) or {"status": "unavailable"}
        research_connection(user_id, int(configured))
        state = {
            "status": "queued",
            "query": query,
            "checked_at": time.time(),
            "job_id": operation or str(uuid4()),
        }
        save_research(user_id, state)
        return _schedule_research(user_id, int(configured), state)
    except Exception as error:
        logger.warning("Burn research scheduling unavailable: %s", type(error).__name__)
        return {"status": "unavailable"}
    finally:
        if lock.owned():
            lock.release()


def enqueue_brief(user_id: UUID, chat_id: UUID) -> None:
    if os.environ.get("BURN2_BACKGROUND_PREPARATION") != "true":
        return
    try:
        tenant_id = get_current_tenant_id()
        generation = uuid4().hex
        get_cache_backend().set(
            f"burn2:brief-generation:{tenant_id}:{user_id}:{chat_id}",
            generation,
            ex=300,
        )
        client_app.send_task(
            BRIEF_TASK,
            kwargs={
                "user_id": str(user_id),
                "chat_id": str(chat_id),
                "tenant_id": tenant_id,
                "generation": generation,
            },
            queue=OnyxCeleryQueues.PRIMARY,
            expires=300,
            countdown=3,
        )
    except Exception as error:
        logger.warning("Burn brief scheduling unavailable: %s", type(error).__name__)
