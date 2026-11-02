"""Drive an Onyx chat through its own API and keep the transcript as proof.

Each demo is one Expected Parrot example asked of Beca in plain words. The
harness logs in, opens a session on the study persona, sends each turn with
``stream=false``, and saves the assistant text, the tool calls it made, and
every image the tools returned. The saved folder is the evidence that the chat
reproduced the example.

Usage::

    python scripts/subconscious/ep_demo.py --base http://localhost:8088 \
        --persona 9 --demo quickstart --out ~/ep-demos

Sign in with a cookie jar (--cookies), ONYX_API_KEY, or ONYX_DEMO_EMAIL and
ONYX_DEMO_PASSWORD. Never print any of them.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

DEMOS: dict[str, list[str]] = {
    # docs/examples/quickstart.py
    "quickstart": [
        "I want one open question for customers: 'What would improve this service?'. "
        "Build it, run it on the free test model with the canned answer "
        "'Make the export button easier to find.', and show me the answer.",
    ],
    # docs/examples/questions.py + survey_logic.py
    "survey_logic": [
        "Build a survey: first ask yes/no whether they used the export feature; "
        "if No, stop. Then ask what problem they hit, and then what would resolve "
        "that problem, piping the problem into the last question. Show me the flow "
        "diagram and the prompts before running anything.",
        "Run it on the test model with canned answer 'Yes' and show the rows.",
    ],
    # docs/examples/agents.py + scenarios.py
    "agents_scenarios": [
        "Test two instruction messages, 'Export your report.' and 'Download your "
        "report as a CSV file.', with four profiles: new or experienced users who "
        "are individual contributors or team leads. Ask how clear each message is "
        "(Clear, Unclear, Unsure) and a 0 to 10 clarity score. Build survey, agents "
        "and scenarios, show the estimated cost, then run on the test model with "
        "canned answers 'Clear' for the clarity question and 8 for the score.",
        "Tally clarity by message condition and draw the distribution chart and "
        "the mean score by condition.",
    ],
    # docs/examples/importing_data.py + files.py
    "import_csv": [
        "Here is customer feedback as CSV:\nrecord_id,feedback\nf1,The setup was easy.\n"
        "f2,The export button is missing.\n\nAnd profiles:\nprofile_id,experience\n"
        "p1,new user\np2,frequent user\n\nLoad both, classify each feedback as "
        "Positive, Neutral or Negative for each profile on the test model with "
        "canned answer 'Positive', and show record_id, profile and sentiment.",
    ],
    # docs/examples/labeling.py + qualitative.py
    "labeling": [
        "Build and run a coding study on the test model now. Codebook: Billing "
        "(a charge or payment issue), Access (cannot enter a page), Feature "
        "request. Code these three requests, one scenario each: 'I was charged "
        "twice', 'I cannot reset my password', 'Please add a dark theme'. "
        "Question 1 is a checkbox of the three codes allowing zero to three "
        "selections; question 2 is free text that quotes the evidence and has "
        "targeted memory of question 1. Canned answer for the checkbox: "
        '["Billing"]. Then tally the codes.',
    ],
    # docs/examples/pretesting.py + prompt_sensitivity.py + prompts.py
    "pretest": [
        "Pretest two survey items as scenarios with a field 'item': 'Do you use "
        "this service regularly?' and 'On how many of the past 7 days did you "
        "use this service?'. One survey: a multiple-choice question that shows "
        "{{ scenario.item }} and asks the reviewer to pick the main issue "
        "(Ambiguous timeframe, Double-barreled, Leading, None identified), then "
        "a free-text question asking for a revised wording. Two reviewer agents "
        "that differ only by instruction: one classifies literally, one infers "
        "intent. Show me the exact prompts, then run on the test model with "
        "canned answer 'Ambiguous timeframe'.",
    ],
    # docs/examples/results.py + dataset.py + caching.py
    "results_cache": [
        "Build a survey with one multiple-choice question, how clear is "
        "{{ scenario.message }} (Clear, Unclear, Unsure), two scenarios with "
        "fields condition and message ('short': 'Export your report.', 'long': "
        "'Download your report as a CSV file.'), and two agents with role "
        "'individual contributor' and 'team lead'. Run on the test model with "
        "canned answer 'Clear'.",
        "Run it again exactly the same and tell me how many answers came from "
        "the cache. Then export condition, role and clarity as CSV, filtered to "
        "the short condition.",
    ],
    # notebooks nps_survey + yoga_studio_name_survey
    "nps": [
        "Draft five diverse customer personas for a landscaping company with "
        "different satisfaction levels. Build an NPS survey: a 0 to 10 recommend "
        "question, then one 1 to 5 satisfaction rating each for product quality, "
        "customer support and purchasing, as separate questions. Run on the test "
        "model with canned answer '4' and draw the mean ratings.",
    ],
    # notebooks analyze_evaluations + summarizing_transcripts
    "two_pass": [
        "Run a two-pass theme study on the test model now. The three course "
        "evaluations are scenarios with a field 'evaluation': 'Great pace, "
        "clear slides', 'Too fast but good examples', 'Slides were hard to "
        "read'. Pass 1: a list question asking for up to three themes in "
        '{{ scenario.evaluation }}, canned answer \'["Pace", "Slides"]\'. '
        "Pass 2: build a codebook from the distinct themes returned, then code "
        "every evaluation with a checkbox of those themes plus 'None of these', "
        "canned answer '[\"Pace\"]'. Show the theme counts.",
    ],
    # notebooks updating_agents + digital_twin
    "enrich_agents": [
        "Interview one agent, a college student named s1, about the career they "
        "want (test model, canned answer 'Teacher'). Then add that answer as a "
        "trait and show me the prompts for a follow-up survey that asks why they "
        "chose {{ agent.career }}.",
    ],
    # ep-skills conjoint-study + analyze-conjoint-results
    "conjoint": [
        "Design a choice-based conjoint for a phone plan with Price ($10, $20, "
        "$30), Data (5 GB, 20 GB) and Contract (None, 12 months): four tasks per "
        "version, three options per task, two versions. Run it for two segments, "
        "student and family, on the test model with canned answer 'Option A'.",
        "Analyze the conjoint: importance, part-worths and segments. Draw the "
        "importance chart, the part-worth chart and the price curve. Then give "
        "the choice shares for $10 with 20 GB and no contract versus $30 with 5 GB "
        "and a 12-month contract.",
    ],
}

FILE_URL = re.compile(r"/api/chat/file/([0-9a-f-]{16,})")


@dataclass
class Turn:
    prompt: str
    answer: str = ""
    tools: list[dict[str, Any]] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


class OnyxChat:
    def __init__(self, base: str, session: requests.Session | None = None) -> None:
        self.base = base.rstrip("/")
        self.http = session or requests.Session()

    def use_api_key(self, api_key: str) -> None:
        self.http.headers["Authorization"] = f"Bearer {api_key}"

    def use_cookies(self, path: str) -> None:
        import http.cookiejar

        jar = http.cookiejar.MozillaCookieJar(path)
        jar.load(ignore_discard=True, ignore_expires=True)
        for cookie in jar:
            self.http.cookies.set(cookie.name, cookie.value, domain=cookie.domain)

    def login(self, email: str, password: str) -> None:
        response = self.http.post(
            f"{self.base}/auth/login",
            data={"username": email, "password": password},
            timeout=30,
        )
        if response.status_code not in (200, 204):
            raise SystemExit(f"Login failed: HTTP {response.status_code}")

    def open_session(self, persona_id: int, description: str) -> str:
        response = self.http.post(
            f"{self.base}/chat/create-chat-session",
            json={"persona_id": persona_id, "description": description},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["chat_session_id"]

    def send(self, chat_session_id: str, message: str, timeout: int = 900) -> Turn:
        response = self.http.post(
            f"{self.base}/chat/send-chat-message",
            json={
                "chat_session_id": chat_session_id,
                "message": message,
                "stream": False,
                "origin": "api",
            },
            timeout=timeout,
        )
        response.raise_for_status()
        return parse_turn(message, response.json())

    def download(self, file_id: str) -> bytes:
        response = self.http.get(f"{self.base}/chat/file/{file_id}", timeout=60)
        response.raise_for_status()
        return response.content


def parse_turn(prompt: str, body: dict[str, Any]) -> Turn:
    """Pull the answer, tool calls and image ids out of a non-streaming reply.

    The reply is Onyx's ChatFullResponse: ``answer`` and ``tool_calls`` with
    ``tool_name``, ``tool_arguments`` and ``tool_result``. An image a tool
    returned shows up as a ``/api/chat/file/<id>`` link in its result.
    """
    turn = Turn(prompt=prompt, raw=body)
    turn.answer = body.get("answer") or ""
    for item in body.get("tool_calls") or []:
        if isinstance(item, dict) and "tool_name" in item:
            turn.tools.append(item)
    for file_id in FILE_URL.findall(json.dumps(body)):
        if file_id not in turn.images:
            turn.images.append(file_id)
    return turn


def run_demo(chat: OnyxChat, persona_id: int, name: str, out: Path) -> Path:
    folder = out / name
    folder.mkdir(parents=True, exist_ok=True)
    session_id = chat.open_session(persona_id, f"Expected Parrot demo: {name}")
    transcript: list[dict[str, Any]] = []
    for index, prompt in enumerate(DEMOS[name], start=1):
        turn = chat.send(session_id, prompt)
        saved: list[str] = []
        for file_id in turn.images:
            target = folder / f"turn{index}_{file_id[:8]}.png"
            target.write_bytes(chat.download(file_id))
            saved.append(target.name)
        transcript.append(
            {
                "turn": index,
                "prompt": prompt,
                "answer": turn.answer,
                "tools": [t.get("tool_name") for t in turn.tools],
                "images": saved,
            }
        )
        (folder / f"turn{index}.raw.json").write_text(json.dumps(turn.raw, indent=1))
    (folder / "transcript.json").write_text(
        json.dumps(
            {"demo": name, "chat_session_id": session_id, "turns": transcript}, indent=1
        )
    )
    return folder


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base", default="http://localhost:8088")
    parser.add_argument("--persona", type=int, required=True)
    parser.add_argument("--demo", choices=sorted(DEMOS), action="append", required=True)
    parser.add_argument("--out", type=Path, default=Path.home() / "ep-demos")
    parser.add_argument(
        "--cookies", help="Mozilla cookie jar from a signed-in browser session"
    )
    args = parser.parse_args(argv)
    chat = OnyxChat(args.base)
    email, password = (
        os.environ.get("ONYX_DEMO_EMAIL"),
        os.environ.get("ONYX_DEMO_PASSWORD"),
    )
    if args.cookies:
        chat.use_cookies(args.cookies)
    elif os.environ.get("ONYX_API_KEY"):
        chat.use_api_key(os.environ["ONYX_API_KEY"])
    elif email and password:
        chat.login(email, password)
    else:
        print(
            "Give --cookies, or set ONYX_API_KEY, or ONYX_DEMO_EMAIL and ONYX_DEMO_PASSWORD.",
            file=sys.stderr,
        )
        return 2
    for name in args.demo:
        folder = run_demo(chat, args.persona, name, args.out)
        summary = json.loads((folder / "transcript.json").read_text())
        for turn in summary["turns"]:
            print(
                f"{name} turn {turn['turn']}: tools={turn['tools']} images={len(turn['images'])}"
            )
        print(f"saved: {folder}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
