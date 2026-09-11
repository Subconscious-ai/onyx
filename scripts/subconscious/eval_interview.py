"""Replay synthetic executive conversations through native Onyx and AWS.

Checks protect specific failures, not general consulting quality. Review the
saved answers as well. Only sessions created by this runner are soft-deleted.
"""

import argparse
import http.cookiejar
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Turn:
    message: str
    forbidden: tuple[str, ...] = ()
    asks_about: str = ""
    acknowledge: bool = False
    questions_allowed: bool = True
    spoken_requires: str = ""
    isolated_complaint: bool = False
    max_words: int = 100
    tools_required: tuple[str, ...] = ()
    expected_numbers: tuple[float, ...] = ()
    model_ready: bool = False
    scenario_guard: bool = False
    brief_required: bool = True
    jerry: bool | None = None
    prepare_brief: bool = False
    target_requires: str = ""
    target_forbidden: str = ""
    unknown_inputs: tuple[str, ...] = ()
    sourced_journey_required: bool = False


CASES = {
    "goal_and_unknowns": [
        Turn(
            "The goal is selling $7 million worth of ice cream.",
            forbidden=(r"tasting|sampled|smell|aroma",),
            asks_about=r"when|time|period|year|deadline|channel|sell|company|brand|business|revenue|growth|sales",
        ),
        Turn("I don't know.", acknowledge=True),
        Turn(
            "That repeats the previous question. The answer is still unknown.",
            acknowledge=True,
            questions_allowed=False,
        ),
    ],
    "known_flavor": [
        Turn(
            "The goal is $7 million in ice cream sales. One customer said the ice cream smelled bad. "
            "The flavor was vanilla. Nothing else is known about that complaint. "
            "The business, sales channel and deadline are not established.",
            forbidden=(
                r"(?:which|what)\s+(?:specific\s+)?flavou?r",
                r"(?:what|which).{0,45}(?:scent|aroma|smell|odou?r)",
            ),
            isolated_complaint=True,
        ),
        Turn(
            "Vanilla. The flavor was already supplied. The complaint details are unknown.",
            forbidden=(
                r"(?:which|what)\s+(?:specific\s+)?flavou?r",
                r"(?:what|which).{0,45}(?:scent|aroma|smell|odou?r)",
            ),
            acknowledge=True,
            spoken_requires=r"vanilla",
            isolated_complaint=True,
        ),
    ],
    "software_transfer": [
        Turn(
            "The objective is increasing renewal for Northstar scheduling software over the next year. "
            "The public product context is already known. No cancellation interviews are available.",
            forbidden=(
                r"what.{0,30}(?:product|company).{0,20}(?:do|sell)|(?:last|recent).{0,30}(?:cancell|churn)",
            ),
        ),
        Turn(
            "The renewal reasons are unknown. Operations managers use the scheduler every Monday.",
            forbidden=(
                r"(?:what|which)\s+day|how often|(?:why|reason).{0,30}(?:cancel|churn)",
            ),
        ),
    ],
    "recover_existing": [
        Turn(
            "The earlier interviewer invented a tasting event, repeated a question after 'I don't know', "
            "and asked for the flavor twice after the answer was vanilla. "
            "The only facts are a $7 million ice cream sales goal and one customer reporting a bad smell. "
            "The flavor is vanilla. No tasting event, lost sale or aroma details are established. "
            "Stop the repeated questions and help move the business discussion forward.",
            forbidden=(
                r"(?:which|what)\s+(?:specific\s+)?flavou?r",
                r"(?:what|which).{0,45}(?:scent|aroma|smell|odou?r)",
            ),
            acknowledge=True,
            spoken_requires=r"vanilla",
            isolated_complaint=True,
        ),
    ],
}

TOPICS = {
    "deadline": r"deadline|time.?frame|time.?horizon|by what|by which|what period|which year|what year|when.{0,25}(?:target|goal|achieve|reach)",
    "flavor": r"flavou?r|variant",
    "complaint": r"smell|aroma|scent|odou?r|objection|reaction|tasting",
    "channel": r"channel|retail|wholesale|online|distribut|through|route to market",
    "company": r"company|brand|website|business name",
}


def questions(text: str) -> list[str]:
    # Jerry's single-line rhetorical punchline is not an interview question.
    prose = re.sub(r"(?im)^\s*\*{0,2}Jerry\s*\*{0,2}:.*$", "", text)
    prose = re.sub(r"https?://[^\s)]+", "", prose)
    prose = re.sub(r"(?<=\|)\s*\?\s*(?=\|)", " unknown ", prose)
    return [
        part.strip().lower()
        for part in re.findall(r"([^.!?\n]+\?)", prose)
        if re.search(r"[a-zA-Z]", part)
    ]


def question(text: str) -> str:
    parts = questions(text)
    return parts[-1] if parts else ""


def assess(turn: Turn, text: str, previous: str) -> list[str]:
    failures = []
    spoken = text.split("<interview-brief>", 1)[0]
    asked = question(spoken)
    if not spoken.strip() or len(spoken.split()) > turn.max_words:
        failures.append("Missing or overlong spoken turn")
    roast_count = len(re.findall(r"\bJerry\s*\*{0,2}:\s*", spoken, re.I))
    if turn.jerry is not None and roast_count != int(turn.jerry):
        failures.append(
            "Jerry must appear exactly once on the scheduled answer, never otherwise"
        )
    if asked and asked == question(previous.split("<interview-brief>", 1)[0]):
        failures.append("Question repeated verbatim from the previous turn")
    if len(questions(spoken)) > 1:
        failures.append("Multiple questions create interview homework")
    if not turn.questions_allowed and questions(spoken):
        failures.append(
            "Repeated uncertainty needs a useful synthesis before more questions"
        )
    if turn.spoken_requires and not re.search(turn.spoken_requires, spoken, re.I):
        failures.append("Supplied answer missing from conversational repair")
    if "DSML" in spoken or "function_calls" in spoken or "<thinking>" in spoken:
        failures.append("Internal tool syntax leaked into the conversation")
    if turn.brief_required and text.count("<interview-brief>") != 1:
        failures.append("Response must contain exactly one working brief")
    if re.search(r"legal entity|legal name", asked, re.I):
        failures.append("Legal identity homework displaces the business interview")
    failures.extend(
        "Unsupported premise or already-answered question: " + pattern
        for pattern in turn.forbidden
        if re.search(pattern, spoken, re.I)
    )
    if turn.asks_about and not re.search(turn.asks_about, asked, re.I):
        failures.append("Opening skips basic commercial framing")
    if turn.acknowledge:
        if not re.search(
            r"unknown|unclear|limited|got it|don.t know|not know|no problem|fine|okay|ok\b|fair|understood|noted|sorry|apolog|right|already|leave|park|switch|move on|change|reset|no need",
            spoken,
            re.I,
        ):
            failures.append("Uncertainty or correction is not acknowledged")
        prior_question = question(previous.split("<interview-brief>", 1)[0])
        repeated = [
            name
            for name, pattern in TOPICS.items()
            if re.search(pattern, asked) and re.search(pattern, prior_question)
        ]
        if repeated:
            failures.append(
                "Unknown answer re-asked on the same topic: " + ", ".join(repeated)
            )
    failures.extend(assess_embedded_brief(turn, text))
    if turn.model_ready and not re.search(
        r"scenario|hypothes|provisional|conditional|propos|draft", spoken, re.I
    ):
        failures.append("Model output hides provisional assumptions")
    if turn.scenario_guard and not re.search(
        r"unknown|unmeasured|not (?:observed|measured)|scenario|hypothetical|illustrative",
        spoken,
        re.I,
    ):
        failures.append("Scenario pressure lost the unknown-input boundary")
    return failures


def assess_embedded_brief(turn: Turn, text: str) -> list[str]:
    failures = []
    if turn.brief_required and "<interview-brief>" not in text:
        failures.append("Working brief missing")
    elif "<interview-brief>" in text:
        try:
            brief, _ = json.JSONDecoder().raw_decode(
                text.split("<interview-brief>", 1)[1].lstrip()
            )
            if brief.get("version") not in (1, 2) or not brief.get("objective", {}).get(
                "text"
            ):
                failures.append("Working brief missing objective")
            if not isinstance(brief.get("horizon"), str):
                failures.append("Horizon violates the workspace string contract")
            if turn.isolated_complaint and any(
                re.search(r"smell|aroma|scent|odou?r", stage.get("text", ""), re.I)
                for stage in brief.get("journey", [])
            ):
                failures.append(
                    "Isolated complaint incorrectly becomes a normal journey stage"
                )
        except (ValueError, AttributeError):
            failures.append("Working brief is not complete JSON")
    return failures


def assess_tools(turn: Turn, tool_packets: list[dict[str, Any]]) -> list[str]:
    failures = []
    tool_names = {packet.get("tool_name", "") for packet in tool_packets}
    python_results = [
        packet for packet in tool_packets if packet["type"] == "python_tool_delta"
    ]
    if any(packet["type"] == "python_tool_start" for packet in tool_packets):
        tool_names.add("run_python")
    if any(
        packet["type"] == "search_tool_start"
        and packet.get("is_internet_search") is False
        for packet in tool_packets
    ):
        tool_names.add("internal_search")
    failures.extend(
        "Required live tool did not run: " + required
        for required in turn.tools_required
        if not any(required in actual for actual in tool_names)
    )
    for packet in tool_packets:
        if (
            packet["type"] == "custom_tool_delta"
            and packet.get("tool_name") == "deep_research"
        ):
            payload = packet.get("data", {})
            try:
                receipt = json.loads(payload["tool_result"])
                if receipt.get("status") != "success" or not receipt.get("source_urls"):
                    failures.append(
                        "GPT Researcher returned no successful source receipt"
                    )
            except (KeyError, TypeError, ValueError):
                failures.append("GPT Researcher receipt is not readable")
        if packet.get("error") or (
            packet["type"] == "python_tool_delta" and packet.get("stderr")
        ):
            failures.append("Tool error requires review")
    if turn.expected_numbers:
        output = " ".join(packet.get("stdout", "") for packet in python_results)
        numbers = [
            float(value.replace(",", ""))
            for value in re.findall(r"(?<![\w.])\d[\d,]*(?:\.\d+)?", output)
        ]
        failures.extend(
            f"Python result missing expected calculation: {expected}"
            for expected in turn.expected_numbers
            if not any(abs(expected - actual) < 0.00001 for actual in numbers)
        )
    return failures


def assess_prepared(
    turn: Turn, before: list[dict], after: list[dict], prepared: dict
) -> list[str]:
    """Compare durable native messages, not an optimistic success banner."""
    failures = []
    if not prepared.get("saved") or not isinstance(prepared.get("message"), str):
        return ["Preparation did not return a saved brief"]
    if (
        not before
        or len(before) != len(after)
        or after[-1] != {"type": "assistant", "message": prepared["message"]}
    ):
        return ["Reopened conversation does not contain the prepared brief"]
    if (
        before[:-1] != after[:-1]
        or before[-1]["message"].split("<interview-brief>")[0].rstrip()
        != after[-1]["message"].split("<interview-brief>")[0].rstrip()
    ):
        failures.append(
            "Preparation changed original source messages or spoken answers"
        )
    text = prepared["message"]
    if text.count("<interview-brief>") != 1 or text.count("</interview-brief>") != 1:
        return failures + ["Prepared brief missing or duplicated"]
    try:
        brief = json.loads(
            text.split("<interview-brief>", 1)[1].split("</interview-brief>", 1)[0]
        )
        if turn.sourced_journey_required:
            stages = {
                item["id"] for item in brief["journey"] if item["status"] == "executive"
            }
            supported = [
                edge
                for edge in brief["transitions"]
                if edge["behavior"]["status"] == "executive"
                and edge["from"] in stages
                and edge["to"] in stages
            ]
            if len(stages) < 2 or not supported:
                failures.append(
                    "Explicit customer behavior missing from the sourced journey"
                )
        targets = " ".join(item["target"]["text"] for item in brief["keyResults"])
        if turn.target_requires and not re.search(turn.target_requires, targets, re.I):
            failures.append("Corrected target missing from the saved brief")
        if turn.target_forbidden and re.search(turn.target_forbidden, targets, re.I):
            failures.append("Superseded target remains in the saved brief")
        for pattern in turn.unknown_inputs:
            matches = [
                item
                for item in brief["model"]["inputs"]
                if re.search(pattern, item["name"], re.I)
            ]
            if not matches or any(
                item["value"]["status"] != "unknown"
                or not re.search(
                    r"unknown|unavailable|not (?:known|measured|established)",
                    item["value"]["text"],
                    re.I,
                )
                for item in matches
            ):
                failures.append(
                    "Unknown operating input omitted or fabricated: " + pattern
                )
    except (ValueError, KeyError, TypeError):
        failures.append("Prepared brief is not readable model data")
    return failures


def native_messages(session: dict) -> list[dict]:
    return [
        {"type": row["message_type"], "message": row["message"]}
        for row in session["messages"]
        if row["message_type"] in {"user", "assistant"} and row["message"].strip()
    ]


def checkpoint(api, sid: str, turn: Turn, expected_sources: list[str]) -> dict:
    """Use the same saved chat, preparation endpoint and handoff as the UI."""
    with api("/chat/get-chat-session/" + sid) as response:
        before = native_messages(json.load(response))
    failures = []
    if [row["message"] for row in before if row["type"] == "user"] != expected_sources:
        failures.append(
            "Reopened executive statements differ from the submitted conversation"
        )
    try:
        with api("/chat/executive-brief", {"chat_id": sid}) as response:
            prepared = json.load(response)
    except urllib.error.HTTPError as error:
        # No silent retry: intermittent failures remain visible in the receipt.
        with api("/chat/get-chat-session/" + sid) as response:
            after = native_messages(json.load(response))
        failures.append(f"Preparation failed: HTTP {error.code}")
        if after != before:
            failures.append("Failed preparation changed the saved conversation")
        return {"failures": failures, "failure_preserved_transcript": after == before}
    with api("/chat/get-chat-session/" + sid) as response:
        after = native_messages(json.load(response))
    failures.extend(assess_prepared(turn, before, after, prepared))
    return {
        "failures": failures,
        "message_id": prepared.get("message_id"),
        "handoff": {
            "format": "burn/onyx-interview",
            "version": 1,
            "chatId": sid,
            "messages": after,
        },
    }


def write_private_json(path: Path, value: Any, *, exclusive: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(
        path,
        "x" if exclusive else "w",
        opener=lambda filename, flags: os.open(filename, flags, 0o600),
    ) as output:
        os.fchmod(output.fileno(), 0o600)
        json.dump(value, output, indent=2)


def cleanup_session(api, sid: str, name: str) -> list[dict]:
    try:
        with api(
            "/chat/delete-chat-session/" + sid + "?hard_delete=false", method="DELETE"
        ):
            return []
    except urllib.error.URLError as error:
        return [
            {
                "case": name,
                "session_id": sid,
                "failures": [
                    f"Synthetic session cleanup failed: {type(error).__name__}"
                ],
            }
        ]


def allowed_bedrock_models(providers: list[dict]) -> set[int]:
    return {
        model["id"]
        for provider in providers
        if provider["provider"] == "bedrock"
        for model in provider["model_configurations"]
        if model.get("name") and not re.search(r"anthropic|claude", model["name"], re.I)
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://localhost:3011")
    parser.add_argument("--cookies", required=True)
    parser.add_argument("--agent", required=True, type=int)
    parser.add_argument(
        "--model-configuration",
        type=int,
        help="Optional existing Bedrock model for a comparison",
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--handoff-dir",
        type=Path,
        help="Private native handoffs for the causl-kb review/save test",
    )
    parser.add_argument("--case", action="append")
    parser.add_argument(
        "--scenario-file", type=Path, help="Synthetic tool-enabled interview cases"
    )
    parser.add_argument(
        "--keep-sessions",
        action="store_true",
        help="Retain synthetic sessions for browser QA",
    )
    args = parser.parse_args()
    cases = CASES
    if args.scenario_file:
        cases = {
            name: [Turn(**turn) for turn in turns]
            for name, turns in json.loads(args.scenario_file.read_text()).items()
        }
    if args.case and any(name not in cases for name in args.case):
        parser.error("Unknown selected case")
    if not cases or any(
        not turns or any(not turn.message.strip() for turn in turns)
        for turns in cases.values()
    ):
        parser.error("Evaluation requires nonempty conversations and executive answers")
    if urllib.parse.urlsplit(args.origin).scheme not in ("http", "https"):
        parser.error("Origin must use HTTP or HTTPS")
    jar = http.cookiejar.MozillaCookieJar(args.cookies)
    jar.load(ignore_discard=True)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def api(path: str, body: dict[str, Any] | None = None, method: str | None = None):
        return opener.open(
            urllib.request.Request(  # noqa: S310 - CLI origin scheme validated above
                args.origin.rstrip("/") + "/api" + path,
                data=json.dumps(body).encode() if body is not None else None,
                headers={"Content-Type": "application/json"},
                method=method,
            ),
            timeout=180,
        )

    results: list[dict[str, Any]] = []
    with api(f"/persona/{args.agent}") as response:
        agent = json.load(response)
    selected_model = args.model_configuration or agent.get(
        "default_model_configuration_id"
    )
    with api("/llm/provider") as response:
        providers = json.load(response)["providers"]
    if selected_model not in allowed_bedrock_models(providers):
        raise ValueError(
            "Interview evaluation requires an explicit non-Anthropic AWS Bedrock model"
        )
    allowed_tools = []
    if args.scenario_file:
        allowed_tools = [
            tool["id"]
            for tool in agent["tools"]
            if tool["name"]
            in {
                "run_python",
                "web_search",
                "internal_search",
                "deep_research",
                "get_research_context",
                "get_research_sources",
            }
        ]
    for name in args.case or cases:
        with api(
            "/chat/create-chat-session",
            {"persona_id": args.agent, "description": "Executive regression: " + name},
        ) as response:
            sid = json.load(response)["chat_session_id"]
        previous = ""
        scenario_start = time.monotonic()
        simulated_minutes = 0.0
        try:
            for index, turn in enumerate(cases[name]):
                start = time.monotonic()
                first = None
                fragments: list[str] = []
                errors: list[str] = []
                tool_packets: list[dict[str, Any]] = []
                request_body = {
                    "message": turn.message,
                    "chat_session_id": sid,
                    "parent_message_id": -1,
                    "allowed_tool_ids": allowed_tools,
                    "origin": "webapp",
                }
                if args.model_configuration is not None:
                    request_body["llm_override"] = {
                        "model_configuration_id": args.model_configuration
                    }
                with api("/chat/send-chat-message", request_body) as response:
                    for line in response:
                        if not line.strip():
                            continue
                        packet = json.loads(line)
                        obj = packet.get("obj", {})
                        if obj.get("type") in (
                            "message_start",
                            "message_delta",
                        ) and obj.get("content"):
                            first = first or round((time.monotonic() - start) * 1000)
                            fragments.append(obj["content"])
                        if obj.get("type") in (
                            "custom_tool_start",
                            "custom_tool_args",
                            "custom_tool_delta",
                            "python_tool_start",
                            "python_tool_delta",
                            "search_tool_start",
                            "search_tool_queries_delta",
                            "search_tool_documents_delta",
                        ):
                            tool_packets.append(obj)
                        if packet.get("error"):
                            errors.append("Native chat returned a stream error")
                answer = "".join(fragments)
                failures = errors + assess(turn, answer, previous)
                simulated_minutes += (
                    len(turn.message.split()) / 40
                    + len(answer.split("<interview-brief>")[0].split()) / 200
                    + 0.25
                )
                failures.extend(assess_tools(turn, tool_packets))
                saved = None
                if turn.prepare_brief:
                    saved = checkpoint(
                        api,
                        sid,
                        turn,
                        [item.message for item in cases[name][: index + 1]],
                    )
                    failures.extend(saved["failures"])
                    if args.handoff_dir and not saved["failures"]:
                        path = args.handoff_dir / f"{sid}-turn-{index + 1}.json"
                        write_private_json(path, saved["handoff"], exclusive=True)
                results.append(
                    {
                        "case": name,
                        "turn": index + 1,
                        "input": turn.message,
                        "answer": answer,
                        "failures": failures,
                        "first_content_packet_ms": first,
                        "elapsed_seconds": round(time.monotonic() - start, 2),
                        "session_elapsed_seconds": round(
                            time.monotonic() - scenario_start, 2
                        ),
                        "scripted_read_answer_minutes_proxy": round(
                            simulated_minutes, 2
                        ),
                        "model_checkpoint_requested": turn.model_ready
                        or turn.prepare_brief,
                        "causl_model_saved_and_reopened": None,  # Separate authenticated causl-kb UAT owns this proof.
                        "brief_saved_and_reopened": None
                        if saved is None
                        else not saved["failures"],
                        "preparation": saved,
                        "model_configuration_id": selected_model,
                        "expected_numbers": turn.expected_numbers,
                        "tool_packets": tool_packets,
                        "session_id": sid,
                    }
                )
                print(
                    json.dumps(
                        {
                            "case": name,
                            "turn": index + 1,
                            "failures": failures,
                            "first_content_packet_ms": first,
                        }
                    ),
                    flush=True,
                )
                previous = answer
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
            results.append(
                {
                    "case": name,
                    "session_id": sid,
                    "failures": [f"Evaluation interrupted: {type(error).__name__}"],
                    "http_status": getattr(error, "code", None),
                }
            )
            print(
                json.dumps({"case": name, "failures": results[-1]["failures"]}),
                flush=True,
            )
        finally:
            if not args.keep_sessions:
                results.extend(cleanup_session(api, sid, name))
            write_private_json(args.output, results)
    raise SystemExit(1 if any(result["failures"] for result in results) else 0)


if __name__ == "__main__":
    main()
