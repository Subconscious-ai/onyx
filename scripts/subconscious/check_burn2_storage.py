"""Read-only authorization/CAS checks against a synthetic saved native chat.

Run inside the native API container; no model calls or transcript mutations.
"""

import argparse
from uuid import UUID, uuid4

from onyx.db.burn2_brief import owned_snapshot, save_brief
from onyx.db.chat import get_chat_session_by_id
from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant

parser = argparse.ArgumentParser()
parser.add_argument("--chat", type=UUID, required=True)
parser.add_argument("--owner", type=UUID, required=True)
args = parser.parse_args()
SqlEngine.init_engine(pool_size=2, max_overflow=0)
with get_session_with_current_tenant() as db:
    session = get_chat_session_by_id(args.chat, args.owner, db)
    if not session.description.startswith("Executive regression:"):
        raise ValueError("Synthetic regression conversation required")
    before = owned_snapshot(args.chat, args.owner, db)
    try:
        owned_snapshot(args.chat, uuid4(), db)
    except ValueError:
        pass
    else:
        raise AssertionError("Foreign owner accessed the transcript")
    try:
        save_brief(args.chat, args.owner, {**before, "digest": "stale"}, {}, 0, db)
    except ValueError:
        pass
    else:
        raise AssertionError("Stale snapshot changed the transcript")
    assert owned_snapshot(args.chat, args.owner, db) == before
print(
    "PASS: owner read, foreign-owner denial, stale-snapshot denial, unchanged saved transcript.",
    flush=True,
)
