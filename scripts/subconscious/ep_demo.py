"""Drive an Onyx chat through its own API and keep the transcript as proof.

Each demo is one Expected Parrot example asked of Beca in plain words. The
harness logs in, opens a session on the study persona, sends each turn with
``stream=false``, and saves the assistant text, the tool calls it made, and
every image the tools returned. The saved folder is the evidence that the chat
reproduced the example.

Usage::

    python scripts/subconscious/ep_demo.py --base http://localhost:8088 \
        --persona 9 --demo quickstart --out ~/ep-demos

Credentials come from ONYX_DEMO_EMAIL and ONYX_DEMO_PASSWORD. Never print them.
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
        "canned answer 'Clear'.",
        "Tally clarity by message condition and draw the distribution chart and "
        "the mean score by condition.",
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
    args = parser.parse_args(argv)
    email, password = (
        os.environ.get("ONYX_DEMO_EMAIL"),
        os.environ.get("ONYX_DEMO_PASSWORD"),
    )
    if not email or not password:
        print("Set ONYX_DEMO_EMAIL and ONYX_DEMO_PASSWORD.", file=sys.stderr)
        return 2
    chat = OnyxChat(args.base)
    chat.login(email, password)
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
