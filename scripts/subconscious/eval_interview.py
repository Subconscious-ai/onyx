"""Replay synthetic executive conversations through native Onyx and AWS.

Checks protect specific failures, not general consulting quality. Review the
saved answers as well. Only sessions created by this runner are soft-deleted.
"""

import argparse
import http.cookiejar
import json
import re
import time
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


def question(text: str) -> str:
    parts = re.findall(r"([^.!?\n]+\?)", text)
    return parts[-1].lower() if parts else ""


def assess(turn: Turn, text: str, previous: str) -> list[str]:
    failures = []
    spoken = text.split("<interview-brief>", 1)[0]
    asked = question(spoken)
    if not spoken.strip() or len(spoken.split()) > 100:
        failures.append("Missing or overlong spoken turn")
    if spoken.count("?") > 1:
        failures.append("Multiple questions create interview homework")
    if not turn.questions_allowed and "?" in spoken:
        failures.append(
            "Repeated uncertainty needs a useful synthesis before more questions"
        )
    if turn.spoken_requires and not re.search(turn.spoken_requires, spoken, re.I):
        failures.append("Supplied answer missing from conversational repair")
    if "DSML" in spoken or "function_calls" in spoken or "<thinking>" in spoken:
        failures.append("Internal tool syntax leaked into the conversation")
    if text.count("<interview-brief>") != 1:
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
    if "<interview-brief>" not in text:
        failures.append("Working brief missing")
    else:
        try:
            brief, _ = json.JSONDecoder().raw_decode(
                text.split("<interview-brief>", 1)[1].lstrip()
            )
            if brief.get("version") != 1 or not brief.get("objective", {}).get("text"):
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
    parser.add_argument("--case", choices=list(CASES), action="append")
    args = parser.parse_args()
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
            timeout=120,
        )

    results: list[dict[str, Any]] = []
    if args.model_configuration is not None:
        with api("/llm/provider") as response:
            providers = json.load(response)["providers"]
        bedrock_ids = {
            model["id"]
            for provider in providers
            if provider["provider"] == "bedrock"
            for model in provider["model_configurations"]
        }
        if args.model_configuration not in bedrock_ids:
            raise ValueError(
                "Model comparison requires an existing AWS Bedrock configuration"
            )
    for name in args.case or CASES:
        with api(
            "/chat/create-chat-session",
            {"persona_id": args.agent, "description": "Executive regression: " + name},
        ) as response:
            sid = json.load(response)["chat_session_id"]
        previous = ""
        try:
            for index, turn in enumerate(CASES[name]):
                start = time.monotonic()
                first = None
                fragments: list[str] = []
                errors: list[str] = []
                request_body = {
                    "message": turn.message,
                    "chat_session_id": sid,
                    "parent_message_id": -1,
                    "allowed_tool_ids": [],
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
                        if packet.get("error"):
                            errors.append(str(packet["error"]))
                answer = "".join(fragments)
                failures = errors + assess(turn, answer, previous)
                results.append(
                    {
                        "case": name,
                        "turn": index + 1,
                        "input": turn.message,
                        "answer": answer,
                        "failures": failures,
                        "first_output_ms": first,
                    }
                )
                print(
                    json.dumps(
                        {
                            "case": name,
                            "turn": index + 1,
                            "failures": failures,
                            "first_output_ms": first,
                        }
                    ),
                    flush=True,
                )
                previous = answer
        finally:
            with api(
                "/chat/delete-chat-session/" + sid + "?hard_delete=false",
                method="DELETE",
            ):
                pass
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(results, indent=2))
            args.output.chmod(0o600)
    raise SystemExit(1 if any(result["failures"] for result in results) else 0)


if __name__ == "__main__":
    main()
