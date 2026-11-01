"""Serve Expected Parrot (EDSL) to an Onyx assistant as an MCP server.

One small FastMCP server wraps the open-source EDSL library and Expected
Parrot's public chart assets so Beca can design, run and analyze a study from
the chat. Every tool returns the same envelope the ``ep`` command line uses:
``{"status": "ok", "data": {...}, "warnings": [...]}`` or
``{"status": "error", "error": {"code", "message", "suggestion"}}``. Charts come
back as MCP image content, which Onyx saves into the conversation.

Objects (surveys, agents, scenarios, results) are kept as JSON files under one
workspace directory and addressed by name, so a study survives the server and a
later turn can reuse what an earlier turn built.

Run::

    EP_MCP_TOKEN=<32+ chars> python scripts/subconscious/serve_ep.py \
        --workspace ~/ep-workspace --host 127.0.0.1 --port 3194
"""

from __future__ import annotations

import argparse
import functools
import io
import json
import os
import re
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.auth.providers.jwt import StaticTokenVerifier
from fastmcp.utilities.types import Image

NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
KINDS = ("surveys", "agents", "scenarios", "results")
DEFAULT_MODEL = "test"
MAX_ROWS = 200
TEXT_CHARS = 400


class ToolError(Exception):
    def __init__(self, code: str, message: str, suggestion: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.suggestion = suggestion


def ok(data: Any, warnings: list[str] | None = None) -> dict:
    return {"status": "ok", "data": data, "warnings": warnings or []}


def err(code: str, message: str, suggestion: str = "") -> dict:
    return {
        "status": "error",
        "error": {"code": code, "message": message, "suggestion": suggestion},
    }


HINTS = {
    "JobsCompatibilityError": (
        "A question must use a scenario field as '{{ scenario.<field> }}' in its "
        "text, or run without scenarios. Agent traits belong in build_agents, not "
        "scenarios."
    ),
    "SurveyRuleReferenceInRuleToUnknownQuestionError": (
        "Rule expressions name a question directly: \"used_export == 'No'\"."
    ),
}


def envelope(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Turn exceptions into the error envelope so the model gets a next step."""

    @functools.wraps(fn)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        try:
            return fn(*args, **kwargs)
        except ToolError as error:
            return err(error.code, str(error), error.suggestion)
        except Exception as error:  # noqa: BLE001 - every failure must be an envelope
            first_line = (
                str(error).strip().splitlines()[0] if str(error).strip() else ""
            )
            return err(
                "RUNTIME_ERROR",
                f"{type(error).__name__}: {first_line[:300]}",
                HINTS.get(
                    type(error).__name__,
                    "Check the tool's inputs against its description; list_question_types and list_objects show what exists.",
                ),
            )

    return wrapped


class Workspace:
    def __init__(self, root: Path) -> None:
        self.root = root
        for kind in KINDS:
            (root / kind).mkdir(parents=True, exist_ok=True)
        (root / "plots").mkdir(exist_ok=True)

    def path(self, kind: str, name: str) -> Path:
        if kind not in KINDS:
            raise ToolError("USAGE_ERROR", f"Unknown object kind: {kind}")
        if not NAME.fullmatch(name or ""):
            raise ToolError(
                "VALIDATION_ERROR",
                f"Invalid name {name!r}.",
                "Use letters, digits, '_' or '-', starting with a letter, at most 64 characters.",
            )
        return self.root / kind / f"{name}.json"

    def save(self, kind: str, name: str, obj: Any) -> str:
        target = self.path(kind, name)
        target.write_text(json.dumps(obj.to_dict(), ensure_ascii=False))
        return name

    def load(self, kind: str, name: str) -> Any:
        target = self.path(kind, name)
        if not target.is_file():
            existing = ", ".join(self.names(kind)) or "none yet"
            raise ToolError(
                "NOT_FOUND",
                f"No {kind[:-1]} named {name!r}. Saved {kind}: {existing}.",
                "Use one of the saved names, or build it first.",
            )
        return _loader(kind).from_dict(json.loads(target.read_text()))

    def names(self, kind: str) -> list[str]:
        if kind not in KINDS:
            raise ToolError("USAGE_ERROR", f"Unknown object kind: {kind}")
        return sorted(p.stem for p in (self.root / kind).glob("*.json"))


def _loader(kind: str) -> Any:
    from edsl import AgentList, Results, ScenarioList, Survey

    return {
        "surveys": Survey,
        "agents": AgentList,
        "scenarios": ScenarioList,
        "results": Results,
    }[kind]


def _plot_style() -> Any:
    """Expected Parrot's shipped matplotlib style (edsl/cli_commands/study_resources)."""
    import matplotlib

    matplotlib.use("Agg")
    import edsl

    resources = Path(edsl.__file__).parent / "cli_commands" / "study_resources"
    if str(resources) not in sys.path:
        sys.path.insert(0, str(resources))
    import plot_style  # noqa: PLC0415 - optional, lives inside the edsl package

    return plot_style


def _png(fig: Any) -> Image:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=150, bbox_inches="tight", pad_inches=0.15)
    import matplotlib.pyplot as plt

    plt.close(fig)
    return Image(data=buffer.getvalue(), format="png")


def _bounded(value: Any, chars: int = TEXT_CHARS) -> Any:
    if isinstance(value, str) and len(value) > chars:
        return value[:chars] + "…"
    return value


def _rows(dataset: Any, limit: int) -> list[dict]:
    rows = dataset.to_dicts(remove_prefix=False)
    return [{k: _bounded(v) for k, v in row.items()} for row in rows[:limit]]


def _column(results: Any, column: str) -> str:
    """Accept 'clarity' or 'answer.clarity'; refuse a column that is not there."""
    if column in results.columns:
        return column
    bare = column.split(".", 1)[-1]
    matches = [c for c in results.columns if c.split(".", 1)[-1] == bare]
    if len(matches) == 1:
        return matches[0]
    raise ToolError(
        "NOT_FOUND",
        f"No column {column!r}.",
        f"Columns: {', '.join(results.columns[:40])}",
    )


def build_server(workspace: Workspace) -> FastMCP:
    server = FastMCP(
        "Expected Parrot studies",
        instructions=(
            "Design, run and analyze surveys and experiments with Expected Parrot's "
            "EDSL. Build a survey, optionally agents (who answers) and scenarios "
            "(what varies), show the flow and prompts for review, then run. The "
            "'test' model is free and returns canned answers: use it to check a "
            "design before spending. Results are simulated evidence unless they "
            "came from humans. Every tool returns {status, data, warnings} or "
            "{status: 'error', error: {code, message, suggestion}}."
        ),
    )
    _register_catalog(server, workspace)
    _register_survey_builder(server, workspace)
    _register_builders(server, workspace)
    _register_imports(server, workspace)
    _register_runs(server, workspace)
    _register_results(server, workspace)
    _register_plots(server, workspace)
    _register_conjoint(server, workspace)
    _register_conjoint_plots(server, workspace)
    return server


def _register_catalog(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
    @envelope
    def list_question_types() -> dict:
        """Question types EDSL supports, with the fields each one takes."""
        from edsl import Question

        rows = Question.available().to_dicts(remove_prefix=True)
        return ok({"question_types": rows})

    @server.tool()
    @envelope
    def list_objects(kind: str) -> dict:
        """Names of saved objects of one kind: surveys, agents, scenarios or results."""
        return ok({"kind": kind, "names": workspace.names(kind)})


QUESTION_TYPE_ALIASES = {
    "open": "free_text",
    "open_ended": "free_text",
    "open_text": "free_text",
    "text": "free_text",
    "freetext": "free_text",
    "string": "free_text",
    "single_choice": "multiple_choice",
    "single_select": "multiple_choice",
    "choice": "multiple_choice",
    "select": "multiple_choice",
    "radio": "multiple_choice",
    "mc": "multiple_choice",
    "multi_select": "checkbox",
    "multiselect": "checkbox",
    "multiple_select": "checkbox",
    "checkboxes": "checkbox",
    "scale": "linear_scale",
    "rating": "linear_scale",
    "linear": "linear_scale",
    "slider": "linear_scale",
    "likert": "likert_five",
    "numeric": "numerical",
    "number": "numerical",
    "integer": "numerical",
    "float": "numerical",
    "boolean": "yes_no",
    "bool": "yes_no",
    "yesno": "yes_no",
    "ranking": "rank",
}
PER_QUESTION_RULES = ("skip_rules", "stop_rules")


def _question_class(question_type: str) -> Any:
    from edsl.questions.question_registry import get_question_class

    return get_question_class(question_type)


def _normalize_question(spec: dict, warnings: list[str]) -> tuple[dict, dict]:
    """Map common guesses onto EDSL's constructor; return (spec, hoisted rules).

    Type aliases such as 'single_choice' or 'open' become the EDSL name, a
    linear_scale given {"min": 0, "max": 10, "labels": {...}} becomes
    question_options and option_labels, a yes_no drops its options, and keys
    the class does not accept are dropped with a warning instead of failing
    the whole survey. Per-question skip_rules/stop_rules are hoisted.
    """
    import inspect

    spec = dict(spec)
    raw_type = str(spec.get("question_type", "")).strip().lower().replace("-", "_")
    question_type = QUESTION_TYPE_ALIASES.get(raw_type, raw_type)
    if question_type != raw_type:
        warnings.append(
            f"{spec.get('question_name')}: {raw_type!r} read as {question_type!r}."
        )
    spec["question_type"] = question_type
    if isinstance(spec.get("question_text"), str):
        spec["question_text"] = _pipe_syntax(spec["question_text"])
    rules = {key: spec.pop(key) for key in PER_QUESTION_RULES if key in spec}
    options = spec.get("question_options")
    if question_type == "linear_scale" and isinstance(options, dict):
        low, high = int(options.get("min", 1)), int(options.get("max", 5))
        spec["question_options"] = list(range(low, high + 1))
        labels = options.get("labels") or options.get("option_labels")
        if isinstance(labels, dict):
            spec["option_labels"] = {int(k): str(v) for k, v in labels.items()}
    if question_type == "linear_scale" and isinstance(spec.get("option_labels"), dict):
        spec["option_labels"] = {
            int(k): str(v) for k, v in spec["option_labels"].items()
        }
    if question_type == "yes_no" and options is not None:
        if [str(o).lower() for o in options] != ["yes", "no"]:
            warnings.append(
                f"{spec.get('question_name')}: yes_no takes no options; "
                "use multiple_choice for other answer sets."
            )
        spec.pop("question_options", None)
    try:
        accepted = set(
            inspect.signature(_question_class(question_type).__init__).parameters
        )
    except Exception:  # unknown type: let EDSL raise its own error  # noqa: BLE001
        return spec, rules
    accepted.add("question_type")
    for key in [k for k in spec if k not in accepted]:
        warnings.append(
            f"{spec.get('question_name')}: dropped unsupported field {key!r}."
        )
        spec.pop(key)
    return spec, rules


ANSWER_PREFIX = re.compile(r"\{\{\s*answer\.(\w+)\s*\}\}")
RULE_TEMPLATE = re.compile(r"\{\{\s*(?:answer\.)?(\w+)(?:\.answer)?\s*\}\}")


def _pipe_syntax(text: str) -> str:
    """'{{ answer.q }}' is a common guess; EDSL pipes with '{{ q.answer }}'."""
    return ANSWER_PREFIX.sub(r"{{ \1.answer }}", text)


def _rule_syntax(expression: str) -> str:
    """Rules name the question directly: '{{ q.answer }} == 1' becomes 'q == 1'."""
    return RULE_TEMPLATE.sub(r"\1", expression)


def _identifier(key: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z_]+", "_", str(key).strip()).strip("_")
    if not cleaned:
        cleaned = "trait"
    if cleaned[0].isdigit():
        cleaned = "t_" + cleaned
    return cleaned


def _register_survey_builder(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
    @envelope
    def build_survey(
        name: str,
        questions: list[dict],
        stop_rules: list[dict] | None = None,
        skip_rules: list[dict] | None = None,
        targeted_memory: list[dict] | None = None,
        full_memory: bool = False,
        loop_over: list[dict] | None = None,
    ) -> dict:
        """Create and save a survey.

        Each question is a dict with question_type, question_name,
        question_text and the type's own fields such as question_options.
        Common types: free_text, multiple_choice, checkbox, yes_no,
        numerical, linear_scale, likert_five, rank, list, dict, dropdown,
        top_k, matrix; list_question_types has the full set with examples. Use '{{ scenario.field }}' in text to fill from
        scenarios and '{{ name.answer }}' to pipe an earlier answer.
        stop_rules and skip_rules are [{"question": name, "expression": "..."}].
        targeted_memory is [{"focal": name, "prior": name}] so the focal
        question sees the prior answer. full_memory shows every earlier answer.
        loop_over is a list of dicts: every question is copied once per dict
        with '{{ scenario.key }}' filled in now, including in question_name,
        so one survey asks the same thing about each item (wide results).
        Without loop_over, use build_scenarios to vary items across interviews
        (long results, one row per item).
        """
        from edsl import Question, Survey

        if not questions:
            raise ToolError("VALIDATION_ERROR", "A survey needs at least one question.")
        built = []
        warnings: list[str] = []
        stop_rules = list(stop_rules or [])
        skip_rules = list(skip_rules or [])
        for spec in questions:
            if not isinstance(spec, dict) or "question_type" not in spec:
                raise ToolError(
                    "VALIDATION_ERROR",
                    "Each question needs a question_type.",
                    "Call list_question_types for the types and their fields.",
                )
            spec, hoisted = _normalize_question(spec, warnings)
            for rule in hoisted.get("skip_rules") or []:
                skip_rules.append({"question": spec["question_name"], **rule})
            for rule in hoisted.get("stop_rules") or []:
                stop_rules.append({"question": spec["question_name"], **rule})
            question = Question(**spec)
            if loop_over:
                from edsl import Scenario, ScenarioList

                built.extend(
                    question.loop(ScenarioList([Scenario(item) for item in loop_over]))
                )
            else:
                built.append(question)
        survey = Survey(built)
        for rule in stop_rules:
            survey = survey.add_stop_rule(
                rule["question"], _rule_syntax(rule["expression"])
            )
        for rule in skip_rules:
            survey = survey.add_skip_rule(
                rule["question"], _rule_syntax(rule["expression"])
            )
        for memory in targeted_memory or []:
            survey = survey.add_targeted_memory(memory["focal"], memory["prior"])
        if full_memory:
            survey = survey.set_full_memory_mode()
        workspace.save("surveys", name, survey)
        return ok(
            {
                "survey": name,
                "questions": [
                    {"name": q.question_name, "type": q.question_type}
                    for q in survey.questions
                ],
            },
            warnings,
        )


def _register_builders(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
    @envelope
    def build_agents(
        name: str,
        agents: list[dict],
        instruction: str | None = None,
        codebook: dict[str, str] | None = None,
    ) -> dict:
        """Create and save the respondents: a list of trait dicts, one per agent.

        An optional 'name' key becomes the agent's name and an optional
        'instruction' key tells that one agent how to answer; instruction here
        applies to every agent without its own (for example 'You are filling
        in an online survey'). Traits may be empty when only the instruction
        differs.
        codebook explains trait keys to the model, e.g. {"hh_inc": "household income"}.
        """
        from edsl import Agent, AgentList

        if not agents:
            raise ToolError("VALIDATION_ERROR", "Give at least one agent.")
        built = []
        warnings: list[str] = []
        renamed: dict[str, str] = {}
        for traits in agents:
            if not isinstance(traits, dict):
                raise ToolError("VALIDATION_ERROR", "Each agent is a dict of traits.")
            traits = dict(traits)
            agent_name = traits.pop("name", None)
            own_instruction = traits.pop("instruction", None)
            for key in list(traits):
                clean = _identifier(key)
                if clean != key:
                    renamed[key] = clean
                    traits[clean] = traits.pop(key)
            kwargs: dict[str, Any] = {"traits": traits}
            if agent_name is not None:
                kwargs["name"] = str(agent_name)
            if own_instruction or instruction:
                kwargs["instruction"] = str(own_instruction or instruction)
            if codebook:
                kwargs["codebook"] = {_identifier(k): v for k, v in codebook.items()}
            built.append(Agent(**kwargs))
        if renamed:
            warnings.append(
                "Trait keys must be identifiers; renamed "
                + ", ".join(f"{k!r} to {v!r}" for k, v in renamed.items())
                + "."
            )
        workspace.save("agents", name, AgentList(built))
        return ok(
            {
                "agents": name,
                "count": len(built),
                "traits": sorted({key for agent in built for key in agent.traits}),
            },
            warnings,
        )

    @server.tool()
    @envelope
    def build_scenarios(name: str, scenarios: list[dict]) -> dict:
        """Create and save what varies across interviews: one dict per scenario.

        Keys are the '{{ scenario.key }}' fields the survey text uses. Extra keys
        such as an id travel through to the results as columns.
        """
        from edsl import Scenario, ScenarioList

        if not scenarios or not all(isinstance(s, dict) for s in scenarios):
            raise ToolError("VALIDATION_ERROR", "Give a non-empty list of dicts.")
        workspace.save(
            "scenarios", name, ScenarioList([Scenario(s) for s in scenarios])
        )
        return ok(
            {
                "scenarios": name,
                "count": len(scenarios),
                "keys": sorted({key for s in scenarios for key in s}),
            }
        )

    @server.tool()
    @envelope
    def show_flow(survey: str) -> dict:
        """The survey's question order, skip and stop logic, as a Mermaid diagram."""
        from edsl.surveys.extras.survey_flow_visualization import (
            SurveyFlowVisualization,
        )

        rendered = SurveyFlowVisualization(workspace.load("surveys", survey)).show_flow(
            renderer="mermaid"
        )
        text = getattr(rendered, "text", None) or str(rendered)
        return ok({"survey": survey, "mermaid": text})


def _register_imports(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
    @envelope
    def build_scenarios_from_csv(name: str, csv_text: str) -> dict:
        """Create scenarios from CSV text: one row per scenario, headers as keys.

        Paste the file's contents. An id column travels through to the results.
        """
        from edsl import ScenarioList

        path = _temp_csv(csv_text)
        try:
            scenarios = ScenarioList.from_source("csv", str(path))
        finally:
            path.unlink(missing_ok=True)
        workspace.save("scenarios", name, scenarios)
        keys = sorted({key for scenario in scenarios for key in scenario.keys()})
        return ok({"scenarios": name, "count": len(scenarios), "keys": keys})

    @server.tool()
    @envelope
    def build_agents_from_csv(
        name: str,
        csv_text: str,
        name_field: str | None = None,
        instruction: str | None = None,
    ) -> dict:
        """Create agents from CSV text: one row per agent, headers as trait names.

        name_field names the column that becomes each agent's name. instruction
        tells every agent how to answer.
        """
        from edsl import AgentList

        path = _temp_csv(csv_text)
        kwargs: dict[str, Any] = {}
        if name_field:
            kwargs["name_field"] = name_field
        try:
            agents = AgentList.from_source("csv", str(path), **kwargs)
        finally:
            path.unlink(missing_ok=True)
        if instruction:
            agents = AgentList(
                [
                    agent.add_instruction(instruction)
                    if hasattr(agent, "add_instruction")
                    else _with_instruction(agent, instruction)
                    for agent in agents
                ]
            )
        workspace.save("agents", name, agents)
        traits = sorted({key for agent in agents for key in agent.traits})
        return ok({"agents": name, "count": len(agents), "traits": traits})


def _register_runs(server: FastMCP, workspace: Workspace) -> None:
    def _job(
        survey: str,
        agents: str | None,
        scenarios: str | None,
        model: str,
        canned_response: str | dict[str, Any] | None,
        service: str | None,
        warnings: list[str] | None = None,
    ) -> Any:
        job = workspace.load("surveys", survey)
        if not scenarios and any(
            "{{ scenario." in q.question_text.replace("{{scenario.", "{{ scenario.")
            for q in job.questions
        ):
            if workspace.path("scenarios", f"{survey}_versions").is_file():
                scenarios = f"{survey}_versions"
                if warnings is not None:
                    warnings.append(f"Ran on the design's own scenarios {scenarios!r}.")
            elif warnings is not None:
                warnings.append(
                    f"Survey {survey!r} fills '{{{{ scenario.* }}}}' fields but no "
                    "scenarios were given, so those fields stayed blank. Saved "
                    f"scenarios: {', '.join(workspace.names('scenarios')) or 'none yet'}."
                )
        if scenarios:
            job = job.by(workspace.load("scenarios", scenarios))
        if agents:
            job = job.by(workspace.load("agents", agents))
        return job.by(_model_for(model, canned_response, service))

    @server.tool()
    @envelope
    def show_prompts(
        survey: str,
        agents: str | None = None,
        scenarios: str | None = None,
        model: str = DEFAULT_MODEL,
        limit: int = 10,
    ) -> dict:
        """The exact prompts each interview would send, with no model call.

        Review these before running: they show what every respondent sees.
        """
        job = _job(survey, agents, scenarios, model, None, None)
        prompts = job.prompts()
        rows = _rows(
            prompts.select(
                "user_prompt",
                "system_prompt",
                "question_name",
                "agent_index",
                "scenario_index",
                "estimated_cost",
            ),
            max(1, min(limit, MAX_ROWS)),
        )
        return ok({"interviews": len(job.interviews()), "prompts": rows})

    @server.tool()
    @envelope
    def estimate_cost(
        survey: str,
        agents: str | None = None,
        scenarios: str | None = None,
        model: str = DEFAULT_MODEL,
        service: str | None = None,
    ) -> dict:
        """Estimated cost in USD before running, by model and question."""
        job = _job(survey, agents, scenarios, model, None, service)
        estimate = job.estimate_job_cost()
        return ok(
            {
                "interviews": len(job.interviews()),
                "estimated_total_cost_usd": estimate.get("estimated_total_cost_usd"),
                "estimated_total_input_tokens": estimate.get(
                    "estimated_total_input_tokens"
                ),
                "estimated_total_output_tokens": estimate.get(
                    "estimated_total_output_tokens"
                ),
                "detailed_costs": estimate.get("detailed_costs", [])[:20],
            }
        )

    @server.tool()
    @envelope
    def run_survey(
        survey: str,
        name: str,
        agents: str | None = None,
        scenarios: str | None = None,
        model: str = DEFAULT_MODEL,
        service: str | None = None,
        canned_response: str | dict[str, Any] | None = None,
    ) -> dict:
        """Run the survey and save the results under `name`.

        model 'test' is free and answers with canned_response: one string
        for every question, or a dict keyed by question_name so each question
        gets a valid answer (for example {"clarity": "Clear", "score": 7});
        use it to check a design. Any other model name spends money:
        call estimate_cost first and say so. Simulated respondents are not
        people; label their answers as simulated evidence. Answers are cached
        in the workspace, so repeating an identical run spends nothing new.
        """
        from edsl import Cache

        notes: list[str] = []
        job = _job(survey, agents, scenarios, model, canned_response, service, notes)
        # The test model's answers depend on canned_response, which EDSL's cache
        # key does not see, so each canned answer gets its own cache file.
        suffix = (
            f"-test-{_digest(json.dumps(canned_response or '', sort_keys=True))}"
            if model == DEFAULT_MODEL
            else ""
        )
        cache_path = workspace.root / f"cache{suffix}.jsonl"
        # One lock per cache file: runs that share a file take turns so neither
        # drops the other's entries; runs on other files proceed in parallel.
        with _cache_lock(cache_path):
            cache = (
                Cache.from_jsonl(str(cache_path)) if cache_path.is_file() else Cache()
            )
            before = len(cache)
            results = job.run(
                disable_remote_inference=True,
                disable_remote_cache=True,
                progress_bar=False,
                cache=cache,
                stop_on_exception=False,
            )
            cache.write_jsonl(str(cache_path))
            new_entries = len(cache) - before
        # EDSL also caches rejected replies, so after a rejection hits can read low.
        hits = max(0, _answered(results) - new_entries)
        workspace.save("results", name, results)
        failed, kinds = _failed_interviews(results)
        warnings = (
            [
                f"{failed} of {len(results)} interviews raised an error"
                + (f" ({kinds})" if kinds else "")
                + ": a rejected reply, a model error or a timeout. Those answers are empty."
            ]
            if failed
            else []
        ) + notes
        return ok(
            {
                "results": name,
                "interviews": len(results),
                "incomplete_interviews": failed,
                "model": model,
                "simulated": True,
                "cache": {"hits": hits, "new": new_entries},
                "review": _review(results, 5),
            },
            warnings,
        )

    def _review(results: Any, max_rows: int) -> dict:
        from edsl.cli_commands.results import _review as review

        return review(
            results,
            max_rows=max_rows,
            max_columns=24,
            max_values=8,
            text_chars=TEXT_CHARS,
        )


def _register_results(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
    @envelope
    def results_review(name: str, group_by: list[str] | None = None) -> dict:
        """Bounded summary of saved results: distributions, numeric means, samples.

        group_by names agent or scenario columns to get means per group.
        """
        from edsl.cli_commands.results import _review as review

        results = workspace.load("results", name)
        groups = [_column(results, g) for g in (group_by or [])]
        return ok(
            review(
                results,
                max_rows=5,
                max_columns=24,
                max_values=10,
                text_chars=TEXT_CHARS,
                group_by=groups,
            )
        )

    @server.tool()
    @envelope
    def results_select(
        name: str,
        columns: list[str],
        filter_expression: str | None = None,
        limit: int = 50,
    ) -> dict:
        """Rows of chosen columns from saved results, optionally filtered.

        Columns accept short names ('clarity') or full ('answer.clarity').
        filter_expression is EDSL syntax, e.g. "clarity == 'Clear' and age > 30".
        """
        results = workspace.load("results", name)
        if filter_expression:
            results = results.filter(filter_expression)
        full = [_column(results, c) for c in columns]
        dataset = results.select(*full)
        return ok(
            {
                "results": name,
                "row_count": len(results),
                "rows": _rows(dataset, max(1, min(limit, MAX_ROWS))),
            }
        )

    @server.tool()
    @envelope
    def results_values(
        name: str, column: str, flatten: bool = False, limit: int = 500
    ) -> dict:
        """All values of one column, plus the distinct ones.

        flatten spreads list answers (checkbox, list questions) into single
        values, which is how a codebook is induced from open answers.
        """
        results = workspace.load("results", name)
        full = _column(results, column)
        values = results.select(full).to_list(flatten=flatten)
        values = [_bounded(v) for v in values][: max(1, limit)]
        unique: list[Any] = []
        for value in values:
            if value not in unique:
                unique.append(value)
        return ok({"results": name, "column": full, "values": values, "unique": unique})

    @server.tool()
    @envelope
    def results_to_scenarios(name: str, scenarios: str, columns: list[str]) -> dict:
        """Save chosen result columns as a new scenario list for the next study.

        This is the second pass of a two-pass design: answers from pass one
        become the items pass two asks about.
        """
        results = workspace.load("results", name)
        full = [_column(results, c) for c in columns]
        scenario_list = results.select(*full).to_scenario_list(remove_prefix=True)
        workspace.save("scenarios", scenarios, scenario_list)
        keys = sorted({key for scenario in scenario_list for key in scenario.keys()})
        return ok({"scenarios": scenarios, "count": len(scenario_list), "keys": keys})

    @server.tool()
    @envelope
    def results_to_agents(name: str, agents: str, answers: list[str]) -> dict:
        """Save the respondents with chosen answers added as new traits.

        A first interview enriches the audience for the next survey.
        """
        from edsl import AgentList

        results = workspace.load("results", name)
        full = [_column(results, a) for a in answers]
        enriched = AgentList.from_results(
            results, question_names=[c.split(".", 1)[-1] for c in full]
        )
        workspace.save("agents", agents, enriched)
        traits = sorted({key for agent in enriched for key in agent.traits})
        return ok({"agents": agents, "count": len(enriched), "traits": traits})

    @server.tool()
    @envelope
    def results_export(
        name: str,
        columns: list[str] | None = None,
        filter_expression: str | None = None,
        limit: int = 1000,
    ) -> dict:
        """Saved results as CSV text, for the user to download or analyze elsewhere."""
        results = workspace.load("results", name)
        if filter_expression:
            results = results.filter(filter_expression)
        full = (
            [_column(results, c) for c in columns]
            if columns
            else [
                c
                for c in results.columns
                if c.startswith(("answer.", "agent.", "scenario."))
            ]
        )
        frame = results.select(*full).to_pandas(remove_prefix=False).head(max(1, limit))
        return ok(
            {
                "results": name,
                "format": "csv",
                "rows": len(frame),
                "csv": frame.to_csv(index=False),
            }
        )

    @server.tool()
    @envelope
    def results_tally(name: str, column: str, by: str | None = None) -> dict:
        """Counts of each value in one column, optionally crossed with another."""
        results = workspace.load("results", name)
        columns = [_column(results, column)] + ([_column(results, by)] if by else [])
        return ok({"results": name, "counts": results.tally(*columns).to_dicts()})


def _register_plots(server: FastMCP, workspace: Workspace) -> None:
    @server.tool(output_schema=None)
    @envelope
    def plot_distribution(name: str, column: str, title: str | None = None) -> list:
        """Bar chart of how often each answer was given, as an image.

        For a scale question the bars follow the scale order.
        """
        import matplotlib.pyplot as plt

        style = _plot_style()
        results = workspace.load("results", name)
        full = _column(results, column)
        counts = results.tally(full).to_dicts()
        if not counts:
            raise ToolError("NOT_FOUND", f"No answers in {column!r}.")
        key = [k for k in counts[0] if k != "count"][0]
        labels = [str(row[key]) for row in counts]
        values = [row["count"] for row in counts]
        if all(_is_number(label) for label in labels):
            order = sorted(range(len(labels)), key=lambda i: float(labels[i]))
            labels = [labels[i] for i in order]
            values = [values[i] for i in order]
        fig, ax = plt.subplots(figsize=(max(6, len(labels) * 1.1), 4.5))
        bars = ax.bar(style.wrap_labels(labels, 14), values, color=style.CATEGORICAL[0])
        ax.bar_label(bars, padding=3)
        ax.set_ylabel("Respondents")
        style.set_chart_title(
            ax, title or full.split(".", 1)[-1].replace("_", " ").title()
        )
        style.fix_xtick_labels(ax)
        fig.tight_layout()
        image = _png(fig)
        return [
            image,
            json.dumps(
                ok(
                    {
                        "results": name,
                        "column": full,
                        "counts": counts,
                        "simulated": True,
                    }
                )
            ),
        ]

    @server.tool(output_schema=None)
    @envelope
    def plot_means(
        name: str, group_by: str | None = None, title: str | None = None
    ) -> list:
        """Bar chart of mean numeric answers, overall or per group, as an image."""
        import matplotlib.pyplot as plt

        style = _plot_style()
        results = workspace.load("results", name)
        groups = [_column(results, group_by)] if group_by else []
        review = _review_with(results, groups)
        numeric = review["numeric_summaries"]
        if not numeric:
            raise ToolError(
                "NOT_FOUND",
                "No numeric answers to average.",
                "Use plot_distribution for categorical answers.",
            )
        if groups and review["segment_summaries"]:
            segment = review["segment_summaries"][0]
            column = numeric[0]["column"]
            rows = [g for g in segment["groups"] if column in g["means"]]
            labels = [g["value"] for g in rows]
            values = [g["means"][column] for g in rows]
            label = f"Mean {column.split('.', 1)[-1].replace('_', ' ')} by {group_by}"
        else:
            labels = [n["column"].split(".", 1)[-1].replace("_", " ") for n in numeric]
            values = [n["mean"] for n in numeric]
            label = "Mean numeric responses"
        fig, ax = plt.subplots(figsize=(max(6, len(labels) * 1.2), 4.5))
        bars = ax.bar(
            style.wrap_labels([str(label) for label in labels], 14),
            values,
            color=style.CATEGORICAL[2],
        )
        ax.bar_label(bars, fmt="%.2f", padding=3)
        ax.set_ylabel("Mean response")
        style.set_chart_title(ax, title or label)
        style.fix_xtick_labels(ax)
        fig.tight_layout()
        return [
            _png(fig),
            json.dumps(
                ok(
                    {
                        "results": name,
                        "labels": labels,
                        "means": values,
                        "simulated": True,
                    }
                )
            ),
        ]

    def _review_with(results: Any, groups: list[str]) -> dict:
        from edsl.cli_commands.results import _review as review

        return review(
            results,
            max_rows=1,
            max_columns=24,
            max_values=12,
            text_chars=TEXT_CHARS,
            group_by=groups,
        )


def _conjoint_analysis(
    workspace: Workspace, results: str, design: str
) -> tuple[dict, dict]:
    import ep_conjoint

    path = (
        workspace.root / "conjoint" / f"{workspace.path('surveys', design).stem}.json"
    )
    if not path.is_file():
        raise ToolError(
            "NOT_FOUND",
            f"No conjoint design named {design!r}.",
            "Create one with conjoint_design.",
        )
    spec = json.loads(path.read_text())
    rows = workspace.load("results", results).to_dicts(remove_prefix=False)
    try:
        return spec, ep_conjoint.analyze(rows, spec)
    except ValueError as error:
        raise ToolError(
            "NOT_FOUND",
            str(error),
            "Run the conjoint survey on its version scenarios first.",
        ) from error


def _register_conjoint_plots(server: FastMCP, workspace: Workspace) -> None:
    def _analysis(results: str, design: str) -> tuple[dict, dict]:
        return _conjoint_analysis(workspace, results, design)

    @server.tool(output_schema=None)
    @envelope
    def plot_conjoint(results: str, design: str, chart: str = "importance") -> list:
        """One conjoint chart as an image: importance, utilities, position, segments or price."""
        import matplotlib.pyplot as plt

        style = _plot_style()
        spec, analysis = _analysis(results, design)
        blue, red = style.CATEGORICAL[0], style.CATEGORICAL[4]
        ranked = sorted(
            analysis["importance"], key=analysis["importance"].get, reverse=True
        )
        if chart == "importance":
            fig, ax = plt.subplots(figsize=(9, max(4, len(ranked) * 0.8)))
            bars = ax.barh(
                ranked, [analysis["importance"][a] for a in ranked], color=blue
            )
            ax.bar_label(bars, fmt="%.1f%%", padding=3)
            ax.invert_yaxis()
            ax.set_xlabel("Importance (%)")
            style.set_chart_title(ax, "Attribute importance", "simulated respondents")
        elif chart == "utilities":
            fig, axes = plt.subplots(1, len(ranked), figsize=(4 * len(ranked), 4.5))
            for ax, attribute in zip(
                [axes] if len(ranked) == 1 else axes, ranked, strict=True
            ):
                values = analysis["utilities"][attribute]
                levels = sorted(values, key=values.get, reverse=True)
                ax.barh(
                    levels,
                    [values[level] for level in levels],
                    color=[blue if values[level] >= 0 else red for level in levels],
                )
                ax.axvline(0, color="gray", linewidth=0.5)
                ax.invert_yaxis()
                ax.set_title(attribute)
            fig.suptitle("Part-worth utilities (simulated)")
        elif chart == "position":
            counts = analysis["position_counts"]
            labels = sorted(counts)
            fig, ax = plt.subplots(figsize=(7, 4.5))
            bars = ax.bar(labels, [counts[level] for level in labels], color=blue)
            ax.bar_label(bars, padding=3)
            ax.axhline(
                sum(counts.values()) / max(1, len(labels)),
                color=red,
                linestyle="--",
                label="expected if unbiased",
            )
            ax.legend()
            style.set_chart_title(ax, "Position bias check")
        elif chart == "segments":
            segments = analysis["segments"]
            if not segments:
                raise ToolError("NOT_FOUND", "No agent traits to segment by.")
            trait = next(iter(segments))
            groups = sorted(segments[trait])
            matrix = [
                [segments[trait][g]["importance"].get(a, 0.0) for a in ranked]
                for g in groups
            ]
            fig, ax = plt.subplots(
                figsize=(max(7, len(ranked) * 1.5), max(4, len(groups) * 0.7))
            )
            image = ax.imshow(matrix, cmap="YlOrRd", aspect="auto")
            ax.set_xticks(range(len(ranked)), ranked, rotation=30, ha="right")
            ax.set_yticks(range(len(groups)), groups)
            for i, row in enumerate(matrix):
                for j, value in enumerate(row):
                    ax.text(j, i, f"{value:.0f}%", ha="center", va="center", fontsize=9)
            fig.colorbar(image, label="Importance (%)")
            style.set_chart_title(ax, f"Importance by {trait}")
        elif chart == "price":
            price = next((a for a in spec["attributes"] if "price" in a.lower()), None)
            if price is None:
                raise ToolError("NOT_FOUND", "No attribute named like 'price'.")
            values = analysis["utilities"][price]
            levels = sorted(values, key=_numeric_prefix)
            fig, ax = plt.subplots(figsize=(7, 4.5))
            ax.plot(
                levels,
                [values[level] for level in levels],
                marker="o",
                color=blue,
                linewidth=2,
            )
            ax.axhline(0, color="gray", linewidth=0.5)
            ax.set_ylabel("Part-worth utility")
            style.set_chart_title(ax, "Price sensitivity", "simulated respondents")
        else:
            raise ToolError(
                "USAGE_ERROR",
                f"Unknown chart {chart!r}.",
                "Use importance, utilities, position, segments or price.",
            )
        fig.tight_layout()
        return [
            _png(fig),
            json.dumps(ok({"results": results, "chart": chart, "simulated": True})),
        ]


def _register_conjoint(server: FastMCP, workspace: Workspace) -> None:
    import ep_conjoint

    designs = workspace.root / "conjoint"
    designs.mkdir(exist_ok=True)

    def _analysis(results: str, design: str) -> tuple[dict, dict]:
        return _conjoint_analysis(workspace, results, design)

    @server.tool()
    @envelope
    def conjoint_design(
        name: str,
        attributes: dict[str, list[str]],
        intro: str = "Consider the options below.",
        tasks_per_version: int = 8,
        profiles_per_task: int = 3,
        n_versions: int = 4,
        include_none: bool = False,
        seed: int = 42,
    ) -> dict:
        """Design a choice-based conjoint and save its survey and version scenarios.

        attributes maps each attribute to its levels, e.g. {"Price": ["$10", "$20"]}.
        Each respondent sees tasks_per_version choice tasks of profiles_per_task
        options; n_versions different versions spread the levels. Run the survey
        `name` on scenarios `name_versions` (and an audience), then call
        conjoint_analyze. Levels should be exact values with units.
        """
        from edsl import Question, Scenario, ScenarioList, Survey

        workspace.path(
            "scenarios", f"{name}_versions"
        )  # validates the derived name too
        try:
            spec = ep_conjoint.generate_design(
                attributes,
                tasks_per_version,
                profiles_per_task,
                n_versions,
                include_none,
                seed=seed,
            )
        except ValueError as error:
            raise ToolError("VALIDATION_ERROR", str(error)) from error
        survey = Survey(
            [Question(**q) for q in ep_conjoint.question_specs(spec, intro)]
        )
        workspace.save("surveys", name, survey)
        versions = ScenarioList(
            [Scenario(row) for row in ep_conjoint.scenario_rows(spec)]
        )
        workspace.save("scenarios", f"{name}_versions", versions)
        (designs / f"{name}.json").write_text(json.dumps(spec))
        first = spec["versions"][0]["choice_sets"][0]
        return ok(
            {
                "survey": name,
                "scenarios": f"{name}_versions",
                "tasks_per_version": spec["n_tasks"],
                "profiles_per_task": spec["profiles_per_task"],
                "n_versions": spec["n_versions"],
                "total_profiles": spec["total_profiles"],
                "balance_scores": [v["balance_score"] for v in spec["versions"]],
                "example_task": [ep_conjoint.describe(p) for p in first],
            }
        )

    @server.tool()
    @envelope
    def conjoint_analyze(results: str, design: str) -> dict:
        """Part-worth utilities, attribute importance and segment utilities.

        Counting-based estimates from simulated choices: a drafting aid, not a
        validated market estimate. Importance sums to 100.
        """
        _, analysis = _analysis(results, design)
        return ok({"results": results, "design": design, "simulated": True, **analysis})

    @server.tool()
    @envelope
    def conjoint_market_share(
        results: str, design: str, profiles: list[dict[str, str]]
    ) -> dict:
        """Logit choice shares for complete competing profiles, from the fitted part-worths."""
        spec, analysis = _analysis(results, design)
        unknown = [
            f"{attribute}={level}"
            for profile in profiles
            for attribute, level in profile.items()
            if level not in spec["attributes"].get(attribute, [])
        ]
        missing = sorted(
            {
                attribute
                for profile in profiles
                for attribute in spec["attributes"]
                if attribute not in profile
            }
        )
        if unknown or missing:
            raise ToolError(
                "VALIDATION_ERROR",
                f"Profiles must use the design's attributes and levels exactly. Unknown: {unknown or 'none'}; missing: {missing or 'none'}.",
                f"Attributes and levels: {json.dumps(spec['attributes'])}",
            )
        return ok(
            {
                "results": results,
                "simulated": True,
                "profiles": ep_conjoint.market_shares(analysis["utilities"], profiles),
            }
        )


def _numeric_prefix(text: str) -> float:
    match = re.search(r"[\d.]+", text)
    return float(match.group()) if match else 0.0


def _temp_csv(csv_text: str) -> Path:
    import tempfile

    if not csv_text.strip():
        raise ToolError("VALIDATION_ERROR", "The CSV text is empty.")
    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".csv", delete=False, encoding="utf-8"
    )
    with handle:
        handle.write(csv_text)
    return Path(handle.name)


def _with_instruction(agent: Any, instruction: str) -> Any:
    from edsl import Agent

    return Agent(name=agent.name, traits=dict(agent.traits), instruction=instruction)


_CACHE_LOCKS: dict[str, Any] = {}
_CACHE_LOCKS_GUARD = __import__("threading").Lock()


def _cache_lock(path: Path) -> Any:
    import threading

    with _CACHE_LOCKS_GUARD:
        return _CACHE_LOCKS.setdefault(str(path), threading.Lock())


def _model_for(
    model: str, canned_response: str | dict[str, Any] | None, service: str | None
) -> Any:
    from edsl import Model

    if model == DEFAULT_MODEL:
        kwargs = {"canned_response": canned_response} if canned_response else {}
        return Model(DEFAULT_MODEL, **kwargs)
    kwargs = {"service_name": service} if service else {}
    return Model(model, **kwargs)


def _digest(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode()).hexdigest()[:10]


def _answered(results: Any) -> int:
    """Answers that exist: a rejected reply or a rule-skipped question is empty."""
    return sum(
        1
        for row in results
        for value in (row.get("answer") or {}).values()
        if value is not None
    )


def _failed_interviews(results: Any) -> tuple[int, str]:
    """(interviews with an unfixed error, what went wrong) from EDSL's task history.

    A question skipped by a stop or skip rule is empty by design and does not
    count. Neither does an error EDSL fixed by retrying. A rejected reply, a
    model error or a timeout that stayed unfixed does.
    """
    history = getattr(results, "task_history", None)
    if history is None or not getattr(history, "has_exceptions", False):
        return 0, ""
    recorded = list(getattr(history, "exceptions", []) or [])
    unfixed = [
        collection
        for collection in recorded
        if not hasattr(collection, "num_unfixed") or collection.num_unfixed() > 0
    ]
    causes: list[str] = []
    for collection in unfixed:
        for cause in _exception_causes(collection):
            if cause not in causes:
                causes.append(cause)
    if recorded:
        failed = len(unfixed)  # every recorded error was fixed: nothing failed
    else:
        failed = sum(
            any(value is None for value in (row.get("answer") or {}).values())
            for row in results
        )
    return failed, "; ".join(causes[:3])


def _exception_causes(collection: Any) -> list[str]:
    """What went wrong in one interview, in the error's own words, one line each.

    EDSL types every entry as a plain Exception here, so the type name does
    not separate a rejected reply from a model error; the message does.
    """
    causes = []
    entries = getattr(collection, "unfixed_exceptions", None)
    data = entries() if callable(entries) else (getattr(collection, "data", None) or {})
    for question_entries in data.values() if isinstance(data, dict) else data:
        for entry in question_entries:
            exception = getattr(entry, "exception", entry)
            text = str(exception).strip().splitlines()
            first = text[0][:120] if text else type(exception).__name__
            causes.append(first)
    return causes


def _is_number(text: str) -> bool:
    try:
        float(text)
        return True
    except ValueError:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--workspace", type=Path, default=Path.home() / "ep-workspace")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=3194, type=int)
    args = parser.parse_args()
    token = os.environ.get("EP_MCP_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("EP_MCP_TOKEN of at least 32 characters is required.")
    server = build_server(Workspace(args.workspace))
    server.auth = StaticTokenVerifier(
        tokens={token: {"client_id": "onyx-beca", "scopes": ["studies"]}}
    )
    server.run(
        transport="streamable-http", host=args.host, port=args.port, show_banner=False
    )


if __name__ == "__main__":
    main()
