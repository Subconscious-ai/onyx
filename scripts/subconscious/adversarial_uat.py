"""Bounded, rule-based executive UAT through native frontend APIs.

Not an LLM executive or browser test. Never claims KB persistence/calculation proof.
Profile POST uses the signed-in QA email; optional company fixtures are explicit QA corrections.
Retains synthetic chats and private receipts for independent browser/model review.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from eval_interview import (
    allowed_bedrock_models,
    native_messages,
    questions,
    write_private_json,
)


def choose_reply(case: dict, answer: str, revealed: set[str]) -> tuple[str, str]:
    asked = " ".join(questions(answer))
    if asked:
        # Prefer the question's intent over incidental words (e.g. 'target' in
        # 'Which customer segment should we target?' is not a numeric-goal ask).
        intent = None
        if re.search(
            r"segment|population|audience|who |journey|steps|customer action",
            asked,
            re.I,
        ):
            intent = "journey"
        elif re.search(r"why |reason|caus|influence|key factor", asked, re.I):
            return case.get(
                "unknown_answer",
                "I don't know. Keep it unknown and help me build the first model.",
            ), "unknown"
        matches = [
            f
            for f in case["facts"]
            if (f["id"] == intent if intent else re.search(f["topics"], asked, re.I))
        ]
        fresh = [f for f in matches if f["id"] not in revealed]
        if fresh:
            fact = fresh[0]
            return fact["answer"], fact["id"]
        if matches:
            fact = matches[0]
            return "I already supplied that: " + fact[
                "answer"
            ] + " Please move forward.", "repeat:" + fact["id"]
        return case.get(
            "unknown_answer",
            "I don't know. Keep it unknown and help me build the first model.",
        ), "unknown"
    # A passive interviewer must not receive facts the executive was never asked for.
    return "Thanks.", "passive_probe"


def read_brief(message: str) -> dict | None:
    try:
        return json.loads(
            message.split("<interview-brief>", 1)[1].split("</interview-brief>", 1)[0]
        )
    except (IndexError, ValueError):
        return None


def observed_ready(brief: dict | None) -> bool:
    """Diagnostic structured coverage, NOT the frontend modelReadiness oracle."""
    if not brief:
        return False
    return bool(
        brief.get("objective", {}).get("status") == "executive"
        and any(
            k.get("target", {}).get("status") == "executive"
            and k.get("deadline", {}).get("status") == "executive"
            for k in brief.get("keyResults", [])
        )
        and len(brief.get("journey", [])) >= 2
        and brief.get("transitions")
        and not brief.get("conflicts")
    )


def equation_failures(case: dict, brief: dict | None) -> list[str]:
    equation = (brief or {}).get("model", {}).get("equation", {}).get("text", "")
    return [
        "Model equation violates independent business oracle: " + pattern
        for pattern in case.get("forbidden_equation_patterns", [])
        if re.search(pattern, equation, re.I)
    ]


def run(args) -> int:  # noqa: C901 - linear UAT receipt orchestration
    cases = json.loads(args.cases.read_text())
    jar = http.cookiejar.MozillaCookieJar(args.cookies)
    jar.load(ignore_discard=True)

    def api(path: str, body: dict | None = None, method: str | None = None):
        # Separate opener per request, immutable read-only cookie jar: profile overlaps chat.
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        return opener.open(
            urllib.request.Request(  # noqa: S310 - CLI validates HTTP(S) origin
                args.origin.rstrip("/") + "/api" + path,
                data=json.dumps(body).encode() if body is not None else None,
                headers={"Content-Type": "application/json"},
                method=method,
            ),
            timeout=min(90, args.deadline),
        )

    def get(path, body=None):
        with api(path, body) as response:
            return json.load(response)

    persona = get(f"/persona/{args.agent}")
    model = args.model_configuration or persona.get("default_model_configuration_id")
    if model not in allowed_bedrock_models(get("/llm/provider")["providers"]):
        raise ValueError(
            "Native interviewer must use configured non-Anthropic AWS Bedrock model"
        )
    summaries = []
    for name, case in cases.items():
        if args.case and name not in args.case:
            continue
        started = time.monotonic()

        def stamp(start=started):
            return round(time.monotonic() - start, 3)

        receipt: dict[str, Any] = {
            "case": name,
            "tester": "adaptive rules, not LLM",
            "model_configuration_id": model,
            "clock_start": "profile POST dispatch using authenticated QA email",
            "profile": None,
            "turns": [],
            "research_checkpoints": [],
            "failures": [],
            "numerical_oracle": case["oracle"],
            "causl_kb_saved_and_reopened": None,
            "saved_model_calculations_verified": None,
            "browser_email_entry_verified": False,
            "fresh_discovery_verified": False,
        }
        path = args.output / (name + ".json")
        pool = ThreadPoolExecutor(max_workers=1)

        def profile(clock=stamp, case=case):
            result = get("/chat/executive-profile", {})
            if case.get("company_profile"):
                with api(
                    "/chat/executive-profile",
                    {
                        "revision": result.get("correction", {}).get("revision", 0),
                        "fields": case["company_profile"],
                    },
                    method="PATCH",
                ) as response:
                    result = json.load(response)
            return {
                "at_seconds": clock(),
                "result": result,
                "company_context_origin": "synthetic QA correction"
                if case.get("company_profile")
                else "native profile",
            }

        pending = pool.submit(profile)
        sid = None
        try:
            sid = get(
                "/chat/create-chat-session",
                {"persona_id": args.agent, "description": "Adversarial UAT: " + name},
            )["chat_session_id"]
            receipt["chat_id"] = sid
            answer = ""
            revealed = set(case.get("opening_reveals", []))
            previous_question = ""
            adversary_sent = False
            for index in range(args.max_turns):
                if stamp() >= args.deadline:
                    receipt["failures"].append("Bounded diagnostic deadline exceeded")
                    break
                if index == 0:
                    message, reason = case["opening"], "opening"
                elif not adversary_sent and index >= case.get("adversary_after", 99):
                    message, reason = case["adversary"], "adversary"
                    adversary_sent = True
                else:
                    message, reason = choose_reply(case, answer, revealed)
                if reason.startswith("repeat:"):
                    receipt["failures"].append(
                        "Already answered fact re-requested: " + reason[7:]
                    )
                elif reason in {f["id"] for f in case["facts"]}:
                    revealed.add(reason)
                sent_at = stamp()
                fragments, tools, errors = [], [], []
                first = None
                with api(
                    "/chat/send-chat-message",
                    {
                        "message": message,
                        "chat_session_id": sid,
                        "parent_message_id": -1,
                        "origin": "webapp",
                        "llm_override": {"model_configuration_id": model},
                        "allowed_tool_ids": [t["id"] for t in persona.get("tools", [])],
                    },
                ) as response:
                    for line in response:
                        if not line.strip():
                            continue
                        packet = json.loads(line)
                        obj = packet.get("obj", {})
                        if obj.get("type") in (
                            "message_start",
                            "message_delta",
                        ) and obj.get("content"):
                            first = first if first is not None else stamp()
                            fragments.append(obj["content"])
                        if "tool" in obj.get("type", ""):
                            tools.append(obj)
                        if packet.get("error"):
                            errors.append(
                                "Stream error: "
                                + str(packet.get("error_code") or packet["error"])[:200]
                            )
                answer = "".join(fragments)
                spoken = answer.split("<interview-brief>", 1)[0]
                asked = questions(spoken)
                if asked and asked[-1] == previous_question:
                    errors.append("Verbatim repeated question")
                previous_question = asked[-1] if asked else ""
                if len(asked) > 1:
                    errors.append("More than one interview question")
                if not spoken.strip():
                    errors.append("Empty spoken reply")
                receipt["turns"].append(
                    {
                        "turn": index + 1,
                        "reason": reason,
                        "input": message,
                        "answer": answer,
                        "sent_at_seconds": sent_at,
                        "first_content_at_seconds": first,
                        "completed_at_seconds": stamp(),
                        "tool_packets": tools,
                        "failures": errors,
                    }
                )
                receipt["failures"].extend(errors)
                try:
                    research = get("/chat/executive-research")
                    receipt["research_checkpoints"].append(
                        {"at_seconds": stamp(), "result": research}
                    )
                except Exception as error:
                    receipt["research_checkpoints"].append(
                        {"at_seconds": stamp(), "error": type(error).__name__}
                    )
                prepared = get("/chat/executive-brief?chat_id=" + sid)
                brief = (
                    read_brief(prepared.get("message", ""))
                    if prepared.get("saved")
                    else None
                )
                receipt["last_preparation"] = prepared
                write_private_json(path, receipt)
                print(
                    json.dumps(
                        {
                            "case": name,
                            "turn": index + 1,
                            "elapsed": stamp(),
                            "saved": prepared.get("saved"),
                            "structured_coverage": observed_ready(brief),
                            "failures": errors,
                        }
                    ),
                    flush=True,
                )
                if (
                    observed_ready(brief)
                    or re.search(r"Open business model", spoken, re.I)
                ) and (not case.get("adversary") or adversary_sent):
                    break
            # Read-only background polling; never manually prepare or repair a brief.
            while stamp() < args.deadline:
                prepared = get("/chat/executive-brief?chat_id=" + sid)
                if prepared.get("saved"):
                    receipt["brief_saved_at_seconds"] = stamp()
                    break
                time.sleep(2)
            receipt["last_preparation"] = prepared
            session = get("/chat/get-chat-session/" + sid)
            messages = native_messages(session)
            submitted = [t["input"] for t in receipt["turns"]]
            receipt["source_messages_retained"] = [
                m["message"] for m in messages if m["type"] == "user"
            ] == submitted
            brief = (
                read_brief(prepared.get("message", ""))
                if prepared.get("saved")
                else None
            )
            receipt["saved_structured_coverage"] = observed_ready(brief)
            receipt["brief_reopened"] = bool(
                prepared.get("saved")
                and messages
                and messages[-1]["message"] == prepared.get("message")
            )
            if not receipt["source_messages_retained"]:
                receipt["failures"].append("Source messages changed or missing")
            if not receipt["brief_reopened"]:
                receipt["failures"].append("Saved brief not proven by reopened chat")
            if not observed_ready(brief):
                receipt["failures"].append(
                    "Saved brief lacks goal, target/deadline, journey, or has conflicts"
                )
            serialized = json.dumps(brief or {})
            receipt["failures"].extend(equation_failures(case, brief))
            for pattern in case.get("brief_required_patterns", []):
                if not re.search(pattern, serialized, re.I):
                    receipt["failures"].append(
                        "Saved brief missing required fact pattern: " + pattern
                    )
            write_private_json(
                args.output / (name + "-handoff.json"),
                {
                    "format": "burn/onyx-interview",
                    "version": 1,
                    "chatId": sid,
                    "messages": messages,
                },
            )
        except Exception as error:
            receipt["failures"].append("Interrupted: " + type(error).__name__)
            receipt["http_status"] = getattr(error, "code", None)
        finally:
            try:
                receipt["profile"] = pending.result(
                    timeout=max(1, args.deadline - stamp())
                )
            except Exception as error:
                receipt["profile"] = {"error": type(error).__name__}
            pool.shutdown(wait=False)
            receipt["elapsed_seconds"] = stamp()
            receipt["brief_within_60s"] = bool(
                receipt.get("brief_reopened")
                and receipt.get("saved_structured_coverage")
                and receipt.get("brief_saved_at_seconds", 9999) <= 60
            )
            # Full requested experience cannot pass without the separate KB/browser oracle.
            receipt["full_pipeline_60s_proven"] = False
            if not receipt["brief_within_60s"]:
                receipt["failures"].append(
                    "Saved structured brief within 60 seconds not proven"
                )
            write_private_json(path, receipt)
            summaries.append(
                {
                    k: receipt.get(k)
                    for k in (
                        "case",
                        "chat_id",
                        "elapsed_seconds",
                        "brief_saved_at_seconds",
                        "brief_within_60s",
                        "saved_structured_coverage",
                        "brief_reopened",
                        "profile",
                        "failures",
                    )
                }
            )
            write_private_json(args.output / "summary.json", summaries)
            print(
                json.dumps(
                    {
                        k: receipt.get(k)
                        for k in (
                            "case",
                            "elapsed_seconds",
                            "brief_within_60s",
                            "failures",
                        )
                    }
                ),
                flush=True,
            )
    return int(any(r["failures"] for r in summaries))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="https://burn.subconscious.ai")
    parser.add_argument("--cookies", required=True)
    parser.add_argument("--agent", type=int, default=5)
    parser.add_argument("--model-configuration", type=int)
    parser.add_argument(
        "--cases",
        type=Path,
        default=Path(__file__).with_name("adversarial_uat_cases.json"),
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--case", action="append")
    parser.add_argument("--max-turns", type=int, default=6)
    parser.add_argument("--deadline", type=int, default=180)
    args = parser.parse_args()
    if urllib.parse.urlsplit(args.origin).scheme not in ("http", "https"):
        parser.error("HTTP(S) origin required")
    raise SystemExit(run(args))
