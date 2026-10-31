"""The Expected Parrot wrapper, driven as an MCP client would drive it.

Every test uses EDSL's keyless ``test`` model, so the suite spends nothing and
needs no network. The first test is the quickstart example from Expected
Parrot's own docs, done through tools instead of Python.
"""

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
from fastmcp import Client
from serve_ep import Workspace, build_server


@pytest.fixture
def client(tmp_path: Path) -> Client:
    return Client(build_server(Workspace(tmp_path / "ws")))


def call(client: Client, tool: str, **arguments: Any) -> Any:
    async def go() -> Any:
        async with client:
            result = await client.call_tool(tool, arguments)
        texts = [
            getattr(c, "text", "")
            for c in result.content
            if getattr(c, "type", "") == "text"
        ]
        images = [c for c in result.content if getattr(c, "type", "") == "image"]
        data = json.loads(texts[-1]) if texts else None
        return data, images

    return asyncio.run(go())


def data(client: Client, tool: str, **arguments: Any) -> dict:
    body, _ = call(client, tool, **arguments)
    assert body["status"] == "ok", body
    return body["data"]


def error(client: Client, tool: str, **arguments: Any) -> dict:
    body, _ = call(client, tool, **arguments)
    assert body["status"] == "error", body
    return body["error"]


MESSAGE_SURVEY = [
    {
        "question_type": "multiple_choice",
        "question_name": "clarity",
        "question_text": "How clear is this instruction: {{ scenario.message }}?",
        "question_options": ["Clear", "Unclear", "Unsure"],
    },
    {
        "question_type": "free_text",
        "question_name": "reason",
        "question_text": "Explain your assessment of the message.",
    },
    {
        "question_type": "numerical",
        "question_name": "score",
        "question_text": "Rate the clarity from 0 to 10: {{ scenario.message }}",
        "min_value": 0,
        "max_value": 10,
    },
]


def test_quickstart_through_tools(client: Client) -> None:
    """docs/examples/quickstart.py: one free-text question on the test model."""
    data(
        client,
        "build_survey",
        name="quick",
        questions=[
            {
                "question_type": "free_text",
                "question_name": "feedback",
                "question_text": "What would improve this service?",
            }
        ],
    )
    run = data(
        client,
        "run_survey",
        survey="quick",
        name="quick_results",
        canned_response="Make the export button easier to find.",
    )
    assert run["interviews"] == 1
    assert run["simulated"] is True
    rows = data(client, "results_select", name="quick_results", columns=["feedback"])
    assert rows["rows"] == [
        {"answer.feedback": "Make the export button easier to find."}
    ]


def test_question_types_are_listed_with_their_fields(client: Client) -> None:
    types = data(client, "list_question_types")["question_types"]
    names = {t["question_type"] for t in types}
    assert {
        "multiple_choice",
        "free_text",
        "numerical",
        "linear_scale",
        "checkbox",
    } <= names


def test_a_survey_with_memory_stop_rule_and_piping_runs_and_shows_its_flow(
    client: Client,
) -> None:
    """docs/examples/questions.py and survey_logic.py together."""
    built = data(
        client,
        "build_survey",
        name="logic",
        questions=[
            {
                "question_type": "yes_no",
                "question_name": "used",
                "question_text": "Used export?",
            },
            {
                "question_type": "free_text",
                "question_name": "problem",
                "question_text": "What problem?",
            },
            {
                "question_type": "free_text",
                "question_name": "followup",
                "question_text": "What would resolve: {{ problem.answer }}?",
            },
        ],
        stop_rules=[{"question": "used", "expression": "{{ used.answer }} == 'No'"}],
        targeted_memory=[{"focal": "followup", "prior": "problem"}],
    )
    assert [q["name"] for q in built["questions"]] == ["used", "problem", "followup"]

    flow = data(client, "show_flow", survey="logic")["mermaid"]
    assert flow.startswith("graph TB")
    assert "used" in flow and "End of Survey" in flow

    run = data(
        client,
        "run_survey",
        survey="logic",
        name="logic_results",
        canned_response="Yes",
    )
    assert run["interviews"] == 1
    prompts = data(client, "show_prompts", survey="logic")["prompts"]
    assert any("What problem?" in p["user_prompt"] for p in prompts)


def test_scenarios_and_agents_cross_and_the_results_can_be_sliced(
    client: Client,
) -> None:
    """docs/examples/agents.py: four profiles times two messages gives eight interviews."""
    data(client, "build_survey", name="msgs", questions=MESSAGE_SURVEY)
    data(
        client,
        "build_agents",
        name="profiles",
        agents=[
            {"experience": e, "role": r}
            for e in ("new user", "experienced user")
            for r in ("individual contributor", "team lead")
        ],
        instruction="Answer using only the supplied profile and message.",
    )
    data(
        client,
        "build_scenarios",
        name="messages",
        scenarios=[
            {"condition": "short", "message": "Export your report."},
            {"condition": "explicit", "message": "Download your report as a CSV file."},
        ],
    )
    prompts = data(
        client,
        "show_prompts",
        survey="msgs",
        agents="profiles",
        scenarios="messages",
        limit=3,
    )
    assert prompts["interviews"] == 8
    assert len(prompts["prompts"]) == 3

    estimate = data(
        client, "estimate_cost", survey="msgs", agents="profiles", scenarios="messages"
    )
    assert estimate["interviews"] == 8
    assert estimate["estimated_total_cost_usd"] >= 0

    run = data(
        client,
        "run_survey",
        survey="msgs",
        name="msgs_results",
        agents="profiles",
        scenarios="messages",
        canned_response="Clear",
    )
    assert run["interviews"] == 8

    tally = data(
        client, "results_tally", name="msgs_results", column="clarity", by="condition"
    )
    assert sum(row["count"] for row in tally["counts"]) == 8

    filtered = data(
        client,
        "results_select",
        name="msgs_results",
        columns=["condition", "role", "clarity"],
        filter_expression="condition == 'short'",
    )
    assert filtered["row_count"] == 4
    assert all(row["scenario.condition"] == "short" for row in filtered["rows"])

    review = data(client, "results_review", name="msgs_results", group_by=["condition"])
    assert review["result_count"] == 8
    assert review["segment_summaries"][0]["group_by"] == "scenario.condition"


SCORE_SURVEY = [
    {
        "question_type": "numerical",
        "question_name": "score",
        "question_text": "Rate the clarity from 0 to 10: {{ scenario.message }}",
        "min_value": 0,
        "max_value": 10,
    }
]


def test_charts_come_back_as_images_with_their_numbers(client: Client) -> None:
    data(client, "build_survey", name="msgs", questions=MESSAGE_SURVEY[:1])
    data(client, "build_survey", name="scores", questions=SCORE_SURVEY)
    data(
        client,
        "build_scenarios",
        name="messages",
        scenarios=[
            {"condition": "a", "message": "x"},
            {"condition": "b", "message": "y"},
        ],
    )
    data(
        client,
        "run_survey",
        survey="msgs",
        name="r",
        scenarios="messages",
        canned_response="Clear",
    )
    data(
        client,
        "run_survey",
        survey="scores",
        name="s",
        scenarios="messages",
        canned_response="7",
    )

    body, images = call(client, "plot_distribution", name="r", column="clarity")
    assert body["status"] == "ok" and body["data"]["counts"]
    assert len(images) == 1 and images[0].mimeType == "image/png"

    body, images = call(client, "plot_means", name="s", group_by="condition")
    assert body["status"] == "ok"
    assert len(images) == 1
    assert body["data"]["labels"] == ["a", "b"]
    assert body["data"]["means"] == [7.0, 7.0]


def test_an_answer_the_question_rejects_is_reported_not_hidden(client: Client) -> None:
    data(client, "build_survey", name="scores", questions=SCORE_SURVEY)
    body, _ = call(
        client, "run_survey", survey="scores", name="bad", canned_response="Clear"
    )

    assert body["status"] == "ok"
    assert body["data"]["incomplete_interviews"] == 1
    assert "rejected" in body["warnings"][0]
    assert error(client, "plot_means", name="bad")["code"] == "NOT_FOUND"


def test_mistakes_come_back_as_envelopes_with_a_next_step(client: Client) -> None:
    missing = error(client, "run_survey", survey="nope", name="x")
    assert missing["code"] == "NOT_FOUND" and "list_objects" in missing["suggestion"]

    bad = error(client, "build_survey", name="bad", questions=[{"question_name": "q"}])
    assert bad["code"] == "VALIDATION_ERROR"

    name = error(client, "build_survey", name="../etc", questions=MESSAGE_SURVEY)
    assert name["code"] == "VALIDATION_ERROR"

    data(client, "build_survey", name="msgs", questions=MESSAGE_SURVEY)
    data(
        client,
        "run_survey",
        survey="msgs",
        name="r",
        scenarios=None,
        canned_response="Clear",
    )
    column = error(client, "results_select", name="r", columns=["nothing"])
    assert column["code"] == "NOT_FOUND" and "answer.clarity" in column["suggestion"]


def test_objects_persist_across_servers_on_the_same_workspace(tmp_path: Path) -> None:
    root = tmp_path / "ws"
    first = Client(build_server(Workspace(root)))
    data(first, "build_survey", name="kept", questions=MESSAGE_SURVEY)

    second = Client(build_server(Workspace(root)))
    assert data(second, "list_objects", kind="surveys")["names"] == ["kept"]
    assert data(second, "show_prompts", survey="kept")["interviews"] == 1


FEEDBACK_CSV = (
    "record_id,feedback\nf1,The setup was easy.\nf2,The export button is missing.\n"
)
PROFILES_CSV = "profile_id,experience\np1,new user\np2,frequent user\n"


def test_csv_rows_become_scenarios_and_agents(client: Client) -> None:
    """docs/examples/importing_data.py and files.py."""
    rows = data(
        client, "build_scenarios_from_csv", name="feedback", csv_text=FEEDBACK_CSV
    )
    assert rows["count"] == 2 and rows["keys"] == ["feedback", "record_id"]

    agents = data(
        client,
        "build_agents_from_csv",
        name="profiles",
        csv_text=PROFILES_CSV,
        name_field="profile_id",
    )
    assert agents["count"] == 2 and agents["traits"] == ["experience"]

    data(
        client,
        "build_survey",
        name="sentiment",
        questions=[
            {
                "question_type": "multiple_choice",
                "question_name": "sentiment",
                "question_text": "Classify this feedback: {{ scenario.feedback }}",
                "question_options": ["Positive", "Neutral", "Negative"],
            }
        ],
    )
    run = data(
        client,
        "run_survey",
        survey="sentiment",
        name="s",
        scenarios="feedback",
        agents="profiles",
        canned_response="Positive",
    )
    assert run["interviews"] == 4
    rows = data(
        client,
        "results_select",
        name="s",
        columns=["record_id", "agent_name", "sentiment"],
    )
    assert {r["scenario.record_id"] for r in rows["rows"]} == {"f1", "f2"}
    assert {r["agent.agent_name"] for r in rows["rows"]} == {"p1", "p2"}


def test_a_codebook_labeling_survey_with_evidence(client: Client) -> None:
    """docs/examples/labeling.py and qualitative.py: checkbox with bounds, memory."""
    built = data(
        client,
        "build_survey",
        name="codebook",
        questions=[
            {
                "question_type": "checkbox",
                "question_name": "themes",
                "question_text": "Apply the codebook to: {{ scenario.text }}. Discovery: finding a control; Format: choosing a file format.",
                "question_options": ["Discovery", "Format"],
                "min_selections": 0,
                "max_selections": 2,
            },
            {
                "question_type": "free_text",
                "question_name": "evidence",
                "question_text": "Quote evidence for each selected theme: {{ scenario.text }}",
            },
        ],
        targeted_memory=[{"focal": "evidence", "prior": "themes"}],
    )
    assert [q["type"] for q in built["questions"]] == ["checkbox", "free_text"]
    data(
        client,
        "build_scenarios",
        name="excerpts",
        scenarios=[{"excerpt_id": "e1", "text": "I found the export button."}],
    )
    run = data(
        client,
        "run_survey",
        survey="codebook",
        name="coded",
        scenarios="excerpts",
        canned_response='["Discovery"]',
    )
    assert run["incomplete_interviews"] == 0
    tally = data(client, "results_tally", name="coded", column="themes")
    assert tally["counts"][0]["count"] == 1


def test_agents_can_differ_by_instruction_alone(client: Client) -> None:
    """docs/examples/prompt_sensitivity.py: same traits, different instructions."""
    agents = data(
        client,
        "build_agents",
        name="readers",
        agents=[
            {
                "instruction_id": "literal",
                "instruction": "Classify only explicit statements.",
            },
            {
                "instruction_id": "inference",
                "instruction": "Classify the likely intent.",
            },
        ],
    )
    assert agents["traits"] == ["instruction_id"]
    data(client, "build_survey", name="cls", questions=MESSAGE_SURVEY[:1])
    prompts = data(client, "show_prompts", survey="cls", agents="readers", limit=2)[
        "prompts"
    ]
    systems = [p["system_prompt"] for p in prompts]
    assert any("only explicit statements" in text for text in systems)
    assert any("likely intent" in text for text in systems)


def test_results_export_returns_csv_text(client: Client) -> None:
    data(client, "build_survey", name="msgs", questions=MESSAGE_SURVEY[:1])
    data(client, "run_survey", survey="msgs", name="r", canned_response="Clear")
    exported = data(client, "results_export", name="r", columns=["clarity"])
    assert exported["format"] == "csv"
    assert exported["csv"].splitlines()[0] == "answer.clarity"
    assert exported["csv"].splitlines()[1] == "Clear"


def test_a_second_identical_run_reuses_the_cache(client: Client) -> None:
    """docs/examples/caching.py: the same job again costs nothing new."""
    data(client, "build_survey", name="msgs", questions=MESSAGE_SURVEY[:1])
    first = data(
        client, "run_survey", survey="msgs", name="r1", canned_response="Clear"
    )
    second = data(
        client, "run_survey", survey="msgs", name="r2", canned_response="Clear"
    )
    assert first["cache"]["hits"] == 0 and first["cache"]["new"] == 1
    assert second["cache"]["hits"] == 1 and second["cache"]["new"] == 0


def test_one_runs_answers_become_the_next_runs_scenarios(client: Client) -> None:
    """notebooks analyze_evaluations and summarizing_transcripts: two-pass coding."""
    data(
        client,
        "build_survey",
        name="themes",
        questions=[
            {
                "question_type": "list",
                "question_name": "themes",
                "question_text": "List up to 3 themes in: {{ scenario.evaluation }}",
                "max_list_items": 3,
            }
        ],
    )
    data(
        client,
        "build_scenarios",
        name="evals",
        scenarios=[
            {"evaluation": "Great pace."},
            {"evaluation": "Too fast, good slides."},
        ],
    )
    data(
        client,
        "run_survey",
        survey="themes",
        name="pass1",
        scenarios="evals",
        canned_response='["Pace", "Slides"]',
    )

    values = data(client, "results_values", name="pass1", column="themes", flatten=True)
    assert values["values"] == ["Pace", "Slides", "Pace", "Slides"]
    assert values["unique"] == ["Pace", "Slides"]

    carried = data(
        client,
        "results_to_scenarios",
        name="pass1",
        scenarios="pass2_input",
        columns=["evaluation", "themes"],
    )
    assert carried["count"] == 2 and set(carried["keys"]) == {"evaluation", "themes"}

    data(
        client,
        "build_survey",
        name="code",
        questions=[
            {
                "question_type": "checkbox",
                "question_name": "coded",
                "question_text": "Which apply to: {{ scenario.evaluation }}",
                "question_options": values["unique"] + ["None of these"],
            }
        ],
    )
    run = data(
        client,
        "run_survey",
        survey="code",
        name="pass2",
        scenarios="pass2_input",
        canned_response='["Pace"]',
    )
    assert run["interviews"] == 2 and run["incomplete_interviews"] == 0


def test_answers_become_traits_of_a_new_audience(client: Client) -> None:
    """notebook updating_agents: a first interview enriches the agents."""
    data(
        client,
        "build_agents",
        name="students",
        agents=[{"persona": "college student", "name": "s1"}],
    )
    data(
        client,
        "build_survey",
        name="career",
        questions=[
            {
                "question_type": "free_text",
                "question_name": "career",
                "question_text": "What career do you want?",
            }
        ],
    )
    data(
        client,
        "run_survey",
        survey="career",
        name="interview",
        agents="students",
        canned_response="Teacher",
    )

    enriched = data(
        client,
        "results_to_agents",
        name="interview",
        agents="students2",
        answers=["career"],
    )
    assert enriched["count"] == 1
    assert set(enriched["traits"]) == {"persona", "career"}
    data(
        client,
        "build_survey",
        name="why",
        questions=[
            {
                "question_type": "free_text",
                "question_name": "why",
                "question_text": "Why {{ agent.career }}?",
            }
        ],
    )
    prompts = data(client, "show_prompts", survey="why", agents="students2")["prompts"]
    assert any(
        "Teacher" in p["system_prompt"] or "Teacher" in p["user_prompt"]
        for p in prompts
    )


def test_a_question_loops_over_items_into_one_wide_survey(client: Client) -> None:
    """notebook nps_survey: one rating per experience, as separate questions."""
    built = data(
        client,
        "build_survey",
        name="nps",
        questions=[
            {
                "question_type": "linear_scale",
                "question_name": "satisfied_{{ scenario.experience }}",
                "question_text": "How satisfied with {{ scenario.experience }}?",
                "question_options": [1, 2, 3, 4, 5],
            }
        ],
        loop_over=[{"experience": "quality"}, {"experience": "support"}],
    )
    assert [q["name"] for q in built["questions"]] == [
        "satisfied_quality",
        "satisfied_support",
    ]
    run = data(client, "run_survey", survey="nps", name="nps_r", canned_response="4")
    assert run["interviews"] == 1
    row = data(
        client,
        "results_select",
        name="nps_r",
        columns=["satisfied_quality", "satisfied_support"],
    )["rows"][0]
    assert row == {"answer.satisfied_quality": 4, "answer.satisfied_support": 4}


def test_a_conjoint_is_designed_run_analyzed_and_charted(client: Client) -> None:
    """ep-skills conjoint-study and analyze-conjoint-results, end to end."""
    design = data(
        client,
        "conjoint_design",
        name="phone",
        intro="You are choosing a phone plan.",
        attributes={
            "Price": ["$10", "$20", "$30"],
            "Data": ["5 GB", "20 GB"],
            "Contract": ["None", "12 months"],
        },
        tasks_per_version=4,
        profiles_per_task=3,
        n_versions=2,
        seed=7,
    )
    assert design["survey"] == "phone" and design["scenarios"] == "phone_versions"
    assert design["total_profiles"] == 12 and len(design["example_task"]) == 3
    data(
        client,
        "build_agents",
        name="segs",
        agents=[{"segment": "student"}, {"segment": "family"}],
    )
    run = data(
        client,
        "run_survey",
        survey="phone",
        name="phone_r",
        scenarios="phone_versions",
        agents="segs",
        canned_response="Option A",
    )
    assert run["interviews"] == 4 and run["incomplete_interviews"] == 0

    analysis = data(client, "conjoint_analyze", results="phone_r", design="phone")
    assert analysis["n_observations"] == 16
    assert set(analysis["importance"]) == {"Price", "Data", "Contract"}
    assert abs(sum(analysis["importance"].values()) - 100) < 1e-6
    assert set(analysis["segments"]["segment"]) == {"student", "family"}
    assert analysis["position_counts"] == {"Option A": 16}

    for chart in ("importance", "utilities", "position", "segments", "price"):
        body, images = call(
            client, "plot_conjoint", results="phone_r", design="phone", chart=chart
        )
        assert body["status"] == "ok", (chart, body)
        assert len(images) == 1, chart

    shares = data(
        client,
        "conjoint_market_share",
        results="phone_r",
        design="phone",
        profiles=[
            {"Price": "$10", "Data": "20 GB", "Contract": "None"},
            {"Price": "$30", "Data": "5 GB", "Contract": "12 months"},
        ],
    )
    assert abs(sum(p["share"] for p in shares["profiles"]) - 1) < 1e-6


def test_a_stop_rule_skip_is_not_a_failure_and_counts_cache_right(
    client: Client,
) -> None:
    data(
        client,
        "build_survey",
        name="gate",
        questions=[
            {
                "question_type": "yes_no",
                "question_name": "used",
                "question_text": "Used it?",
            },
            {
                "question_type": "free_text",
                "question_name": "problem",
                "question_text": "What problem?",
            },
        ],
        stop_rules=[{"question": "used", "expression": "{{ used.answer }} == 'No'"}],
    )
    body, _ = call(client, "run_survey", survey="gate", name="g", canned_response="No")

    assert body["status"] == "ok" and body["warnings"] == []
    assert body["data"]["incomplete_interviews"] == 0
    assert body["data"]["cache"] == {"hits": 0, "new": 1}


def test_a_new_canned_answer_is_not_served_from_the_old_runs_cache(
    client: Client,
) -> None:
    data(client, "build_survey", name="one", questions=MESSAGE_SURVEY[:1])
    data(client, "run_survey", survey="one", name="x", canned_response="Clear")
    second = data(
        client, "run_survey", survey="one", name="y", canned_response="Unclear"
    )

    assert second["cache"] == {"hits": 0, "new": 1}
    rows = data(client, "results_select", name="y", columns=["clarity"])["rows"]
    assert rows == [{"answer.clarity": "Unclear"}]


def test_market_share_refuses_a_profile_outside_the_design(client: Client) -> None:
    data(
        client,
        "conjoint_design",
        name="plan",
        attributes={"Price": ["$10", "$20"], "Data": ["5 GB", "20 GB"]},
        tasks_per_version=2,
        profiles_per_task=2,
        n_versions=1,
        seed=1,
    )
    data(
        client,
        "run_survey",
        survey="plan",
        name="plan_r",
        scenarios="plan_versions",
        canned_response="Option A",
    )

    problem = error(
        client,
        "conjoint_market_share",
        results="plan_r",
        design="plan",
        profiles=[{"price": "$10"}, {"Price": "$99", "Data": "5 GB"}],
    )
    assert problem["code"] == "VALIDATION_ERROR"
    assert "Price=$99" in problem["message"] and "Data" in problem["message"]

    taken = error(
        client,
        "conjoint_design",
        name="plan",
        attributes={"Price": ["$10", "$20"], "Data": ["5 GB", "20 GB"]},
    )
    assert taken["code"] == "CONFLICT"


def test_a_runtime_error_is_one_bounded_line_with_a_next_step(client: Client) -> None:
    data(client, "build_survey", name="one", questions=MESSAGE_SURVEY[:1])
    problem = error(
        client, "run_survey", survey="one", name="r", model="no-such-model-xyz"
    )

    assert problem["code"] == "RUNTIME_ERROR"
    assert "\n" not in problem["message"] and len(problem["message"]) <= 340
    assert problem["suggestion"]
