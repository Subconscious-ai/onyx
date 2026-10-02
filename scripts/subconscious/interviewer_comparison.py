"""Compare real moderators with sealed synthetic executives.

This diagnostic reuses the existing UAT cases. Scripted research arrivals test
moderation, not live PDL, safe-door admission, or saved business-model behavior.
Those require separate real-pipeline receipts. All transcripts stay outside Git.
"""

from __future__ import annotations

import argparse
import asyncio
import fcntl
import http.cookiejar
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from eval_interview import questions, write_private_json


class BudgetExceeded(RuntimeError):
    pass


class Budget:
    """Conservative reservations survive retries and cover every vendor call."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

    def reserve(self, customer: str, component: str, dollars: float) -> None:
        if dollars < 0:
            raise ValueError("Negative cost reservation")
        self.path.touch(mode=0o600, exist_ok=True)
        with self.path.open("r+") as file:
            os.chmod(self.path, 0o600)
            fcntl.flock(file, fcntl.LOCK_EX)
            file.seek(0)
            raw = file.read()
            data = json.loads(raw) if raw else []
            file.seek(0)
            if data and not isinstance(data, list):
                raise ValueError("Invalid budget ledger")
            if (
                sum(x["upper_dollars"] for x in data if x["customer"] == customer)
                + dollars
                > 20
            ):
                raise BudgetExceeded("Customer reservation would exceed $20")
            if sum(x["upper_dollars"] for x in data) + dollars > 240:
                raise BudgetExceeded("Comparison reservation would exceed $240")
            data.append(
                {
                    "customer": customer,
                    "component": component,
                    "upper_dollars": dollars,
                    "at": time.time(),
                }
            )
            file.seek(0)
            json.dump(data, file)
            file.truncate()

    def total(self, customer: str | None = None) -> float:
        if not self.path.exists():
            return 0
        return sum(
            x["upper_dollars"]
            for x in json.loads(self.path.read_text())
            if customer is None or x["customer"] == customer
        )


def human_seconds(question: str, answer: str | None) -> float:
    # Explicit modeled reading at 240 wpm, typing at 60 wpm, and 2s reflection.
    # Not a measurement of real human behavior or actual waiting in this runner.
    reading = len(question.split()) / 4
    return reading if answer is None else reading + len(answer.split()) + 2


def reveal(case: dict, ids: list[str], seen: set[str]) -> tuple[str, list[str]]:
    if not ids:
        return "Thanks.", []
    facts = {f["id"]: f["answer"] for f in case["facts"]}
    if any(i not in facts for i in ids):
        return "I don't know. Keep that unknown and move forward.", []
    repeated = [i for i in ids if i in seen]
    fresh = [facts[i] for i in ids if i not in seen]
    if not fresh:
        return "I already answered that. Please move forward.", repeated
    seen.update(ids)
    return " ".join(fresh), repeated


def aws_environment(profile: str) -> None:
    credentials = json.loads(
        subprocess.run(
            [
                "aws",
                "configure",
                "export-credentials",
                "--profile",
                profile,
                "--format",
                "process",
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        ).stdout
    )
    # In-memory environment only. Never persist exported AWS credentials.
    for target, source in [
        ("AWS_ACCESS_KEY_ID", "AccessKeyId"),
        ("AWS_SECRET_ACCESS_KEY", "SecretAccessKey"),
        ("AWS_SESSION_TOKEN", "SessionToken"),
    ]:
        os.environ[target] = credentials[source]
    os.environ["AWS_REGION_NAME"] = os.environ["AWS_REGION"] = "us-east-1"


class Executive:
    """An LLM interprets intent; only sealed, exact facts can be released."""

    def __init__(self, budget: Budget):
        import boto3

        self.client = boto3.client("bedrock-runtime", region_name="us-east-1")
        self.budget = budget

    def json_call(self, customer: str, instruction: str, data: dict) -> dict:
        text = json.dumps(data)
        upper = (len(text.encode()) + len(instruction.encode())) / 1_000_000 + 0.015
        self.budget.reserve(customer, "executive-or-evaluator", upper)
        response = self.client.converse(
            modelId="openai.gpt-oss-120b-1:0",
            system=[{"text": instruction}],
            messages=[{"role": "user", "content": [{"text": text}]}],
            inferenceConfig={"maxTokens": 2500, "temperature": 0},
        )
        content = "".join(
            p.get("text", "") for p in response["output"]["message"]["content"]
        )
        # Ignore optional fenced JSON, but never repair a fabricated test answer.
        left, right = content.find("{"), content.rfind("}")
        return json.loads(content[left : right + 1])

    async def answer(
        self, customer: str, case: dict, spoken: str, seen: set[str]
    ) -> dict:
        result = await asyncio.to_thread(
            self.json_call,
            customer,
            "You are an impatient executive adversarial tester. Classify the latest interviewer move. "
            "Release only facts it specifically asks for, including a relevant imperative request. "
            "A passive recap gets no new facts. Never volunteer a secret insight to rescue weak moderation. "
            "Public company questions should be flagged, not answered. A private scope/priorities question is legitimate. "
            "Return JSON {fact_ids:[], public_question:false, unknown_question:false, rationale:string}. "
            "For an unavailable cause, rate, or number, set unknown_question=true. "
            "Do not consider a secret fact asked just because it is useful. Return at most ONE fact id, "
            "for the primary question intent. Incidental mentions of a supplied target are not requests to repeat it. "
            "A customer-steps question asks for journey. A target/timeframe question asks for goal. "
            "The insight fact is released only for a specific private blocker, constraint, conflict, or actual customer "
            "decision friction question; do not release it for generic 'tell me your journey' requests.",
            {
                "interviewer": spoken,
                "private_facts": case["facts"],
                "already_answered": sorted(seen),
                "available_public_evidence": case.get("public_evidence", []),
            },
        )
        if result.get("public_question") or result.get("unknown_question"):
            reply = "I don't know. Please use the research for public facts and keep missing numbers unknown."
            repeated: list[str] = []
        else:
            reply, repeated = reveal(case, result.get("fact_ids", []), seen)
        return {**result, "reply": reply, "repeated": repeated}


class NativeOnyx:
    def __init__(self, cookies: Path, budget: Budget, origin: str):
        import httpx

        jar = http.cookiejar.MozillaCookieJar(str(cookies))
        jar.load(ignore_discard=True)
        self.client = httpx.AsyncClient(
            base_url=origin + "/api", cookies=jar, timeout=90
        )
        self.budget = budget
        self.persona_id: int | None = None
        self.chat_id: str | None = None

    async def api(self, method: str, path: str, body: dict | None = None):
        response = await self.client.request(method, path, json=body)
        response.raise_for_status()
        return response.json()

    async def configure(self, config: dict) -> None:
        # Configure a private POC through native administration before running.
        # Do not silently target the production interviewer.
        self.persona_id = config.get("native_persona_id")
        if not self.persona_id:
            raise ValueError("An existing private native POC persona is required")
        self.instructions = config["instructions"]
        stored = await self.api("GET", "/persona/" + str(self.persona_id))
        if (
            config.get("native_persona_id")
            and stored["system_prompt"] != self.instructions
        ):
            raise ValueError("Stored native POC does not match frozen instructions")
        if "task_prompt" in config and stored["task_prompt"] != config["task_prompt"]:
            raise ValueError(
                "Stored native turn instructions do not match the candidate"
            )
        self.tool_ids = [tool["id"] for tool in stored["tools"]]
        self.model_configuration_id = stored["default_model_configuration_id"]
        self.burn_brief_enabled = stored["name"] in {
            "Executive interview",
            "Burn 2.0",
            "Burn 2.0 Nova QA",
        }

    async def begin(self, customer: str, case: dict) -> str:
        self.chat_id = (
            await self.api(
                "POST",
                "/chat/create-chat-session",
                {
                    "persona_id": self.persona_id,
                    "description": "POC customer " + customer,
                },
            )
        )["chat_session_id"]
        return await self.turn(
            customer,
            "Application entry: start the interview now. No executive answer yet.",
            {
                "current_engagement": {
                    "id": customer,
                    "synthetic": True,
                    "market_hint": case.get("market", customer.split("_")[0]),
                },
                "accepted_ontology": [],
                "research_status": "pending",
            },
        )

    async def turn(self, customer: str, message: str, context: dict) -> str:
        # Includes native background preparation. Conservative reservation;
        # this is not an AWS invoice or an actual token-usage measurement.
        self.budget.reserve(customer, "native-onyx-and-preparation-reservation", 1)
        parts = []
        async with self.client.stream(
            "POST",
            "/chat/send-chat-message",
            json={
                "message": message,
                "chat_session_id": self.chat_id,
                "parent_message_id": -1,
                "origin": "webapp",
                "llm_override": {"model_configuration_id": self.model_configuration_id},
                "allowed_tool_ids": self.tool_ids,
                "additional_context": json.dumps(
                    {
                        **context,
                        "scope": "Isolated synthetic engagement. Its ID is a test label, not a company name. Exclude unrelated saved memories. Fixture evidence is not live provider research.",
                    }
                ),
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                packet = json.loads(line)
                if packet.get("error"):
                    write_private_json(
                        self.budget.path.parent
                        / "onyx"
                        / "stream-errors"
                        / (str(self.chat_id) + ".json"),
                        packet,
                    )
                    raise RuntimeError(
                        "Native stream failed: "
                        + str(packet.get("error_code", "unknown"))
                    )
                obj = packet.get("obj", {})
                if obj.get("type") in {"message_start", "message_delta"}:
                    parts.append(obj.get("content", ""))
        return "".join(parts)

    async def retained(self) -> dict:
        session = await self.api("GET", "/chat/get-chat-session/" + str(self.chat_id))
        started = time.monotonic()
        saved = False
        brief = None
        if self.burn_brief_enabled:
            while time.monotonic() - started < 75:
                result = await self.api(
                    "GET", "/chat/executive-brief?chat_id=" + str(self.chat_id)
                )
                if result.get("saved"):
                    brief = json.loads(
                        result["message"]
                        .split("<interview-brief>", 1)[1]
                        .split("</interview-brief>", 1)[0]
                    )
                    saved = True
                    break
                await asyncio.sleep(1)
        return {
            "chat_id": self.chat_id,
            "message_count": len(session.get("messages", [])),
            "retained_native_chat": bool(session.get("messages")),
            "native_brief_saved": saved,
            "brief": brief,
            "brief_wait_after_interview_seconds": round(time.monotonic() - started, 3),
            "saved_business_model": False,
        }

    async def close(self) -> None:
        await self.client.aclose()


class Parlant:
    def __init__(self, budget: Budget):
        self.budget = budget
        self.customer = "platform-setup"
        self.context: dict = {}
        self.server: Any = None

    async def configure(self, config: dict) -> None:
        import httpx
        import litellm

        private_home = self.budget.path.parent / "parlant-cache"
        private_home.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.environ["PARLANT_HOME"] = str(private_home)
        import parlant.sdk as p

        if self.server is None:
            original = litellm.acompletion
            original_embed = litellm.aembedding

            async def metered_completion(*args, **kwargs):
                size = len(json.dumps(kwargs.get("messages", [])).encode())
                self.budget.reserve(
                    self.customer, "parlant-inference", size / 1_000_000 + 0.025
                )
                # Bound retries and transport latency without changing provider logic.
                kwargs["timeout"] = 45
                kwargs["num_retries"] = 0
                return await original(*args, **kwargs)

            async def metered_embedding(*args, **kwargs):
                self.budget.reserve(self.customer, "parlant-embedding", 0.005)
                return await original_embed(*args, **kwargs)

            litellm.acompletion = metered_completion
            litellm.aembedding = metered_embedding
            os.environ["LITELLM_PROVIDER_MODEL_NAME"] = (
                "bedrock/openai.gpt-oss-120b-1:0"
            )
            os.environ["LITELLM_EMBEDDING_MODEL_NAME"] = (
                "bedrock/amazon.titan-embed-text-v2:0"
            )
            os.environ["LITELLM_EMBEDDING_DIMENSIONS"] = "1024"
            self.server = p.Server(
                host="127.0.0.1",
                port=8896,
                tool_service_port=8897,
                nlp_service=p.NLPServices.litellm,
                log_level=p.LogLevel.WARNING,
            )
            await self.server.__aenter__()
            self.client = httpx.AsyncClient(
                base_url="http://127.0.0.1:8896", timeout=90
            )
        self.agent = await self.server.create_agent(
            name="Beca POC " + config["revision"],
            description=config["instructions"],
            max_engine_iterations=1,
            perceived_performance_policy=(
                p.NullPerceivedPerformancePolicy()
                if config.get("disable_preamble")
                else None
            ),
        )

        async def context(_):
            return p.RetrieverResult(data=self.context)

        await self.agent.attach_retriever(context, id="research-arrivals")
        for condition, action in config.get("guidelines", []):
            await self.agent.create_guideline(condition=condition, action=action)
        # The SDK intentionally starts serving when its configuration context
        # exits. Wait for the native ready event before issuing REST requests.
        self.serve_task = asyncio.create_task(self.server.__aexit__(None, None, None))
        await asyncio.wait_for(self.server.ready.wait(), timeout=60)

    async def api(self, method: str, path: str, body: dict | None = None):
        response = await self.client.request(method, path, json=body)
        response.raise_for_status()
        return response.json()

    async def begin(self, customer: str, case: dict) -> str:
        self.customer = customer
        self.context = {
            "current_engagement": {
                "id": customer,
                "synthetic": True,
                "market_hint": case.get("market", customer.split("_")[0]),
            },
            "customer": customer,
            "accepted_ontology": [],
            "research_status": "pending",
        }
        result = await self.api(
            "POST", "/sessions", {"agent_id": self.agent.id, "title": "POC " + customer}
        )
        self.session_id = result["id"]
        self.offset = 0
        return await self.turn(
            customer,
            "Application entry: begin the interview. No executive answer yet.",
            self.context,
        )

    async def turn(self, customer: str, message: str, context: dict) -> str:
        self.customer, self.context = customer, context
        submitted = await self.api(
            "POST",
            f"/sessions/{self.session_id}/events",
            {"kind": "message", "source": "customer", "message": message},
        )
        self.offset = submitted["offset"] + 1
        parts = []
        # Native status events identify completion; a preamble is not the answer.
        async with asyncio.timeout(65):
            while True:
                events = await self.api(
                    "GET",
                    f"/sessions/{self.session_id}/events?kinds=message,status&min_offset={self.offset}&wait_for_data=30",
                )
                self.offset = max(e["offset"] for e in events) + 1
                for event in events:
                    if event["source"] == "ai_agent" and event["kind"] == "message":
                        parts.append(event["data"].get("message", ""))
                    if (
                        event["kind"] == "status"
                        and event["data"].get("status") == "error"
                    ):
                        raise RuntimeError("Parlant native generation failed")
                    if generation_completed(event):
                        return "\n".join(parts)

    async def retained(self) -> dict:
        events = await self.api(
            "GET", f"/sessions/{self.session_id}/events?wait_for_data=0"
        )
        return {
            "session_id": self.session_id,
            "message_count": len(events),
            "retained_native_session": bool(events),
            "saved_business_model": False,
        }

    async def close(self) -> None:
        if self.server:
            await self.client.aclose()
            self.serve_task.cancel()
            await asyncio.gather(self.serve_task, return_exceptions=True)


def generation_completed(event: dict) -> bool:
    """A Parlant preamble may announce ready before generation finishes."""
    return (
        event["kind"] == "status"
        and event["data"].get("status") == "ready"
        and event["data"].get("data", {}).get("stage") == "completed"
    )


async def evaluate(args) -> None:
    import copy

    os.umask(0o077)
    aws_environment(args.aws_profile)
    budget = Budget(args.output / "budget.json")
    executive = Executive(budget)
    config = json.loads(args.config.read_text())
    if args.native_persona is not None:
        config["native_persona_id"] = args.native_persona
    cases = copy.deepcopy(json.loads(args.cases.read_text()))
    # Older cases volunteered their goal in the human's opening. The new
    # interview starts automatically, so that opening must become a sealed
    # answer rather than silently disappear from the executive's knowledge.
    for case in cases.values():
        if not any(f["id"] == "goal" for f in case["facts"]):
            case["facts"].insert(0, {"id": "goal", "answer": case["opening"]})
    # Extras supplement the existing cases; never alter their independent oracles.
    if args.supplement:
        extras = json.loads(args.supplement.read_text())
        for name, extra in extras.items():
            cases[name]["facts"].append(extra["private_insight"])
            cases[name]["public_evidence"] = extra["public_evidence"]
    moderator = (
        NativeOnyx(args.cookies, budget, args.origin)
        if args.platform == "onyx"
        else Parlant(budget)
    )
    if args.platform == "parlant":
        moderator.customer = args.case[0] if args.case else next(iter(cases))
    try:
        await moderator.configure(config)
        write_private_json(
            args.output / args.platform / config["revision"] / "configuration.json",
            config,
        )
        for name, case in cases.items():
            if args.case and name not in args.case:
                continue
            directory = args.output / args.platform / config["revision"]
            directory.mkdir(parents=True, exist_ok=True)
            receipt: dict = {
                "customer": name,
                "platform": args.platform,
                "revision": config["revision"],
                "model": "Native configured AWS model"
                if args.platform == "onyx"
                else "AWS Bedrock GPT OSS 120B",
                "model_configuration_id": moderator.model_configuration_id
                if args.platform == "onyx"
                else None,
                "turns": [],
                "failures": [],
                "research": "scripted fixture arrivals; not live discovery",
                "full_pipeline_pass": False,
            }
            seen: set[str] = set()
            started = time.monotonic()
            modeled_human = 0.0
            try:
                before = time.monotonic()
                answer = await moderator.begin(name, case)
                receipt["opening"] = answer
                receipt["opening_system_seconds"] = time.monotonic() - before
                adversary_sent = False
                for turn in range(args.max_answers):
                    if (
                        case.get("adversary")
                        and not adversary_sent
                        and turn >= case.get("adversary_after", 99) - 1
                    ):
                        chosen = {
                            "reply": case["adversary"],
                            "repeated": [],
                            "fact_ids": [],
                            "rationale": "Existing case's adversarial correction or pressure",
                        }
                        adversary_sent = True
                    else:
                        chosen = await executive.answer(name, case, answer, seen)
                    modeled_human += human_seconds(answer, chosen["reply"])
                    if chosen.get("public_question"):
                        receipt["failures"].append("Public-fact homework")
                    if chosen["repeated"]:
                        receipt["failures"].append("Repeated answered fact")
                    # Fixture arrives only after the initial question. It remains
                    # attributed public context, separate from private answers.
                    context = {
                        "current_engagement": {
                            "id": name,
                            "synthetic": True,
                            "market_hint": case.get("market", name.split("_")[0]),
                        },
                        "accepted_ontology": [],
                        "research_status": "fixture_ready",
                        "evidence": case.get("public_evidence", []),
                        "provenance": "synthetic evaluation fixture, not live research",
                    }
                    before = time.monotonic()
                    next_answer = await moderator.turn(name, chosen["reply"], context)
                    receipt["turns"].append(
                        {
                            "interviewer": answer,
                            "human": chosen,
                            "response": next_answer,
                            "system_seconds": time.monotonic() - before,
                        }
                    )
                    answer = next_answer
                    write_private_json(directory / (name + ".json"), receipt)
                    print(
                        json.dumps(
                            {
                                "platform": args.platform,
                                "revision": config["revision"],
                                "case": name,
                                "turn": turn + 1,
                                "facts": sorted(seen),
                                "elapsed": round(time.monotonic() - started, 1),
                            }
                        ),
                        flush=True,
                    )
                    if (
                        "insight" in seen
                        and "goal" in seen
                        and not questions(answer)
                        and (not case.get("adversary") or adversary_sent)
                    ):
                        break
                receipt["final_reading_seconds"] = human_seconds(answer, None)
                modeled_human += receipt["final_reading_seconds"]
                receipt["retention"] = await moderator.retained()
                receipt["revealed_fact_ids"] = sorted(seen)
                receipt["diagnostic_review"] = await asyncio.to_thread(
                    executive.json_call,
                    name,
                    "You are a skeptical executive consulting reviewer. Do not reward fluent summaries. "
                    "Evaluate only the actual transcript and supplied evidence. Hidden facts were not known until answered. "
                    "Identify supported private guidance changing a model, public fact homework, repeated unknowns, "
                    "fabricated facts or contradictions, material unresolved corrections, and passive acknowledgements. "
                    "Executive answers are attributed testimony. Do not mark human statements as unsupported assistant "
                    "claims just because they lack independent web verification. Judge assistant inventions only. "
                    "Return JSON {useful_private_insight:bool, insight_quote:string, model_change:string, "
                    "unsupported_claims:[], repeated_unknown_questions:[], public_questions:[], "
                    "quality_1_to_7:int, explanation:string}. Do not claim a model was saved from a spoken promise.",
                    {
                        "public_evidence": case.get("public_evidence", []),
                        "opening": receipt["opening"],
                        "turns": receipt["turns"],
                    },
                )
            except Exception as error:
                receipt["failures"].append(type(error).__name__)
                receipt["exception_summary"] = (
                    str(error)[:200]
                    if isinstance(error, BudgetExceeded)
                    else type(error).__name__
                )
            receipt["system_and_tester_seconds"] = round(time.monotonic() - started, 3)
            receipt["modeled_human_seconds"] = round(modeled_human, 3)
            moderator_seconds = receipt.get("opening_system_seconds", 0) + sum(
                t["system_seconds"] for t in receipt["turns"]
            )
            receipt["moderator_seconds"] = round(moderator_seconds, 3)
            receipt["diagnostic_total_seconds"] = round(
                moderator_seconds + modeled_human, 3
            )
            receipt["budget_reservations_dollars"] = round(budget.total(name), 4)
            receipt["saved_business_model_verified"] = False
            write_private_json(directory / (name + ".json"), receipt)
    finally:
        await moderator.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=["onyx", "parlant"], required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument(
        "--cases",
        type=Path,
        default=Path(__file__).with_name("adversarial_uat_cases.json"),
    )
    parser.add_argument("--supplement", type=Path)
    parser.add_argument("--case", action="append")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cookies", type=Path)
    parser.add_argument("--native-persona", type=int)
    parser.add_argument("--origin", default="https://burn.subconscious.ai")
    parser.add_argument("--aws-profile", default="avi-admin")
    parser.add_argument("--max-answers", type=int, default=3)
    arguments = parser.parse_args()
    asyncio.run(evaluate(arguments))
