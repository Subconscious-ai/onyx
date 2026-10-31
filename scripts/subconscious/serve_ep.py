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


def envelope(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Turn exceptions into the error envelope so the model gets a next step."""

    @functools.wraps(fn)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        try:
            return fn(*args, **kwargs)
        except ToolError as error:
            return err(error.code, str(error), error.suggestion)
        except Exception as error:  # noqa: BLE001 - every failure must be an envelope
            return err("RUNTIME_ERROR", f"{type(error).__name__}: {error}")

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
            raise ToolError(
                "NOT_FOUND",
                f"No {kind[:-1]} named {name!r}.",
                f"Build it first, or list what exists with list_objects(kind='{kind}').",
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
    matches = [c for c in results.columns if c.split(".", 1)[-1] == column]
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
    _register_builders(server, workspace)
    _register_runs(server, workspace)
    _register_results(server, workspace)
    _register_plots(server, workspace)
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


def _register_builders(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
    @envelope
    def build_survey(
        name: str,
        questions: list[dict],
        stop_rules: list[dict] | None = None,
        skip_rules: list[dict] | None = None,
        targeted_memory: list[dict] | None = None,
        full_memory: bool = False,
    ) -> dict:
        """Create and save a survey.

        Each question is a dict with question_type (see list_question_types),
        question_name, question_text and the type's own fields such as
        question_options. Use '{{ scenario.field }}' in text to fill from
        scenarios and '{{ name.answer }}' to pipe an earlier answer.
        stop_rules and skip_rules are [{"question": name, "expression": "..."}].
        targeted_memory is [{"focal": name, "prior": name}] so the focal
        question sees the prior answer. full_memory shows every earlier answer.
        """
        from edsl import Question, Survey

        if not questions:
            raise ToolError("VALIDATION_ERROR", "A survey needs at least one question.")
        built = []
        for spec in questions:
            if not isinstance(spec, dict) or "question_type" not in spec:
                raise ToolError(
                    "VALIDATION_ERROR",
                    "Each question needs a question_type.",
                    "Call list_question_types for the types and their fields.",
                )
            built.append(Question(**spec))
        survey = Survey(built)
        for rule in stop_rules or []:
            survey = survey.add_stop_rule(rule["question"], rule["expression"])
        for rule in skip_rules or []:
            survey = survey.add_skip_rule(rule["question"], rule["expression"])
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
            }
        )

    @server.tool()
    @envelope
    def build_agents(
        name: str,
        agents: list[dict],
        instruction: str | None = None,
        codebook: dict[str, str] | None = None,
    ) -> dict:
        """Create and save the respondents: a list of trait dicts, one per agent.

        An optional 'name' key becomes the agent's name. instruction tells every
        agent how to answer (for example 'You are filling in an online survey').
        codebook explains trait keys to the model, e.g. {"hh_inc": "household income"}.
        """
        from edsl import Agent, AgentList

        if not agents:
            raise ToolError("VALIDATION_ERROR", "Give at least one agent.")
        built = []
        for traits in agents:
            if not isinstance(traits, dict):
                raise ToolError("VALIDATION_ERROR", "Each agent is a dict of traits.")
            traits = dict(traits)
            agent_name = traits.pop("name", None)
            kwargs: dict[str, Any] = {"traits": traits}
            if agent_name is not None:
                kwargs["name"] = str(agent_name)
            if instruction:
                kwargs["instruction"] = instruction
            if codebook:
                kwargs["codebook"] = codebook
            built.append(Agent(**kwargs))
        workspace.save("agents", name, AgentList(built))
        return ok(
            {
                "agents": name,
                "count": len(built),
                "traits": sorted(
                    {key for traits in agents for key in traits if key != "name"}
                ),
            }
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


def _register_runs(server: FastMCP, workspace: Workspace) -> None:
    def _job(
        survey: str,
        agents: str | None,
        scenarios: str | None,
        model: str,
        canned_response: str | None,
        service: str | None,
    ) -> Any:
        from edsl import Model

        job = workspace.load("surveys", survey)
        if scenarios:
            job = job.by(workspace.load("scenarios", scenarios))
        if agents:
            job = job.by(workspace.load("agents", agents))
        if model == DEFAULT_MODEL:
            kwargs = {"canned_response": canned_response} if canned_response else {}
            job = job.by(Model(DEFAULT_MODEL, **kwargs))
        else:
            kwargs = {"service_name": service} if service else {}
            job = job.by(Model(model, **kwargs))
        return job

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
        canned_response: str | None = None,
    ) -> dict:
        """Run the survey and save the results under `name`.

        model 'test' is free and answers with canned_response (or a fixed
        string); use it to check a design. Any other model name spends money:
        call estimate_cost first and say so. Simulated respondents are not
        people; label their answers as simulated evidence.
        """
        from edsl import Cache

        job = _job(survey, agents, scenarios, model, canned_response, service)
        results = job.run(
            disable_remote_inference=True,
            disable_remote_cache=True,
            progress_bar=False,
            cache=Cache(),
            stop_on_exception=False,
        )
        workspace.save("results", name, results)
        incomplete = _incomplete(results)
        warnings = (
            [
                f"{incomplete} of {len(results)} interviews have at least one missing answer: "
                "the model's reply failed that question's validation."
            ]
            if incomplete
            else []
        )
        return ok(
            {
                "results": name,
                "interviews": len(results),
                "incomplete_interviews": incomplete,
                "model": model,
                "simulated": True,
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
    def results_tally(name: str, column: str, by: str | None = None) -> dict:
        """Counts of each value in one column, optionally crossed with another."""
        results = workspace.load("results", name)
        columns = [_column(results, column)] + ([_column(results, by)] if by else [])
        return ok({"results": name, "counts": results.tally(*columns).to_dicts()})


def _register_plots(server: FastMCP, workspace: Workspace) -> None:
    @server.tool()
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

    @server.tool()
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


def _incomplete(results: Any) -> int:
    """Interviews where at least one question has no validated answer."""
    answer_columns = [c for c in results.columns if c.startswith("answer.")]
    if not answer_columns:
        return 0
    rows = results.select(*answer_columns).to_dicts(remove_prefix=False)
    return sum(any(row.get(c) is None for c in answer_columns) for row in rows)


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
