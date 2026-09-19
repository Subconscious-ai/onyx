"""Opt-in live PDL -> Celery -> GPT Researcher cold-cache acceptance.

Run inside the native API runtime. This uses real provider calls and the actual
startup/read handlers. It excludes login, server boot and browser transport.
Only the selected account's retained profile/research keys are refreshed;
chats, corrections, accepted facts and models are not changed. Private backups
and full source output stay in the required output directory, outside Git.
"""

import argparse
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4


def discovery_passed(receipt: dict[str, Any]) -> bool:
    return bool(
        receipt["cacheEmptyBeforeStart"]
        and receipt["freshProfile"]
        and receipt["freshResearch"]
        and receipt["profileStatus"] == "ready"
        and receipt["researchStatus"] == "ready"
        and receipt["sourceCount"] >= 2
        and receipt["reportCharacters"] >= 200
        and 0 <= receipt["seconds"] <= 60
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=UUID, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--reset-retained-context", action="store_true", required=True)
    args = parser.parse_args()

    from onyx.db.encrypted_kv_store import (
        delete_encrypted_kv,
        load_encrypted_kv,
    )
    from onyx.db.engine.sql_engine import SqlEngine, get_session
    from onyx.db.models import User
    from onyx.key_value_store.interface import KvKeyNotFoundError
    from onyx.server.query_and_chat.burn2.api import (
        prepare_profile,
        read_executive_research,
    )
    from onyx.server.query_and_chat.burn2.research import research_receipt

    os.umask(0o077)
    SqlEngine.init_engine(pool_size=2, max_overflow=0)
    run_id = str(uuid4())
    directory = args.output_dir.resolve() / run_id
    directory.mkdir(parents=True, mode=0o700)
    keys = [f"burn2:{kind}:{args.user_id}" for kind in ("profile", "research")]
    before: dict[str, Any] = {}
    for key in keys:
        try:
            before[key] = load_encrypted_kv(key)
        except KvKeyNotFoundError:
            before[key] = None
    prior = before[keys[1]] or {}
    if prior.get("status") in {"queued", "running"} and (
        time.time() - prior.get("checked_at", 0) < 300
    ):
        raise RuntimeError("Research is in flight; do not reset it")
    (directory / "backup.json").write_text(json.dumps(before))

    with contextmanager(get_session)() as db:
        user = db.get(User, args.user_id)
        if not user or not user.is_active:
            raise RuntimeError("An existing active account is required")
        for key in keys:
            if before[key] is not None:
                delete_encrypted_kv(key)
        for key in keys:
            try:
                load_encrypted_kv(key)
            except KvKeyNotFoundError:
                continue
            raise RuntimeError("Retained context was not empty")

        started_at, started = time.time(), time.monotonic()
        profile = prepare_profile(user)
        receipt = {
            "runId": run_id,
            "startedAt": started_at,
            "cacheEmptyBeforeStart": True,
            "profileSeconds": time.monotonic() - started,
            "profileStatus": profile.get("status"),
            "freshProfile": profile.get("checked_at", 0) >= started_at,
            "priorResearchId": prior.get("research_id"),
            "jobId": profile.get("research", {}).get("job_id"),
        }
        research = read_executive_research(user)
        while research.get("status") in {"queued", "running"}:
            remaining = 60 - (time.monotonic() - started)
            if remaining <= 0:
                break
            # Match the existing browser's two-second research polling interval.
            time.sleep(min(2, remaining))
            research = read_executive_research(user)
        elapsed = time.monotonic() - started
        (directory / "context.json").write_text(
            json.dumps({"profile": profile, "research": research})
        )
        receipt.update(
            seconds=elapsed,
            researchStatus=research.get("status"),
            sourceCount=len(set(research.get("source_urls", []))),
            researchId=research.get("research_id"),
            freshResearch=research.get("checked_at", 0) >= started_at
            and bool(research.get("research_id"))
            and research.get("research_id") != prior.get("research_id"),
            reportCharacters=len(research.get("report", "")),
        )
        receipt["passed"] = discovery_passed(receipt)
        if receipt["passed"]:
            # Reuse the production source/URL validator; no test-only success shape.
            research_receipt(json.dumps(research))
        (directory / "receipt.json").write_text(json.dumps(receipt, indent=2))
        print(json.dumps({**receipt, "privateEvidence": str(directory)}), flush=True)
        return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
