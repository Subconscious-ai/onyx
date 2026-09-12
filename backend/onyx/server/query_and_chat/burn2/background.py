"""Schedule native background preparation without waiting on provider work."""

import os
import time
from uuid import UUID, uuid4

from onyx.background.celery.apps.client import celery_app as client_app
from onyx.cache.factory import get_cache_backend
from onyx.configs.constants import OnyxCeleryQueues
from onyx.db.burn2_profile import read_profile
from onyx.db.burn2_research import read_research, research_connection, save_research
from onyx.server.query_and_chat.burn2.research import (
    public_research_query,
    research_reusable,
)
from onyx.utils.logger import setup_logger
from shared_configs.contextvars import get_current_tenant_id

logger = setup_logger()
RESEARCH_TASK = "onyx.background.celery.tasks.burn2.tasks.research_company"
BRIEF_TASK = "onyx.background.celery.tasks.burn2.tasks.prepare_saved_brief"


def ensure_research(user_id: UUID) -> dict:
    configured = os.environ.get("BURN2_RESEARCH_PERSONA_ID", "")
    if os.environ.get("BURN2_ENABLED") != "true" or not configured.isdecimal():
        return {"status": "disabled"}
    query = public_research_query(read_profile(user_id))
    if not query:
        return {"status": "needs_company"}
    lock = get_cache_backend().lock(f"burn2:research:{user_id}", timeout=20)
    if not lock.acquire(blocking=False):
        return read_research(user_id) or {"status": "queued"}
    try:
        state = read_research(user_id)
        if research_reusable(state, query):
            return state
        # Prevent background refresh from repeatedly retrying a failed provider.
        if (
            state
            and state.get("query") == query
            and state.get("status") == "unavailable"
            and time.time() - state.get("checked_at", 0) < 300
        ):
            return state
        research_connection(user_id, int(configured))
        state = {
            "status": "queued",
            "query": query,
            "checked_at": time.time(),
            "job_id": str(uuid4()),
        }
        save_research(user_id, state)
        try:
            client_app.send_task(
                RESEARCH_TASK,
                kwargs={
                    "user_id": str(user_id),
                    "persona_id": int(configured),
                    "job_id": state["job_id"],
                    "tenant_id": get_current_tenant_id(),
                },
                queue=OnyxCeleryQueues.PRIMARY,
                expires=300,
            )
        except Exception:
            state = {
                **state,
                "status": "unavailable",
                "reason": "Research could not be scheduled",
            }
            save_research(user_id, state)
        return state
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
        client_app.send_task(
            BRIEF_TASK,
            kwargs={
                "user_id": str(user_id),
                "chat_id": str(chat_id),
                "tenant_id": get_current_tenant_id(),
            },
            queue=OnyxCeleryQueues.PRIMARY,
            expires=300,
            countdown=1,
        )
    except Exception as error:
        logger.warning("Burn brief scheduling unavailable: %s", type(error).__name__)
