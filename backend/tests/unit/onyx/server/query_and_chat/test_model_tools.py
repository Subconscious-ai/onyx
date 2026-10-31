"""Financial grid tools: native proposals, view requests and canonical reads."""

import json
from unittest.mock import patch

import httpx
import pytest

from onyx.server.query_and_chat.causl.model_page import (
    model_page_history_name,
    model_page_tool_result,
    model_page_tool_schema,
    model_page_tools,
)


def page(drafts: bool = False) -> str:
    return json.dumps(
        {
            "version": 1,
            "captureId": "turn-1",
            "document": {"model": {"name": "Test financial model"}},
            "page": {
                "workspaceScope": "local:test",
                "documentRevision": "revision-1",
                "drafts": [{"text": "private"}] if drafts else [],
            },
        }
    )


WRITES = [
    ("apply_model_source", {"source": "sales = 100\nprofit = sales * 20 - 500"}),
    (
        "apply_model_edits",
        {
            "edits": [
                {
                    "kind": "create-metric",
                    "readableId": "tax",
                    "name": "Tax",
                    "notes": "",
                    "location": {"row": 5, "column": 0},
                    "distribution": "POINT",
                    "expression": "100",
                }
            ]
        },
    ),
    ("apply_model_edits", {"edits": [{"kind": "delete-metric", "metricId": "tax"}]}),
    (
        "apply_model_edits",
        {
            "edits": [
                {
                    "kind": "set-assumption",
                    "metricId": "tax",
                    "distribution": "UNIFORM",
                    "expression": "80 to 120",
                }
            ]
        },
    ),
    (
        "apply_model_edits",
        {
            "edits": [
                {
                    "kind": "set-formula",
                    "metricId": "profit",
                    "expression": "sales * 20 - 700",
                }
            ]
        },
    ),
    (
        "create_scenarios",
        {
            "scenarios": [
                {
                    "name": "Higher cost",
                    "metricId": "cost",
                    "distribution": "POINT",
                    "expression": "700",
                }
            ]
        },
    ),
    (
        "set_active_scenario",
        {
            "name": "Higher cost",
            "metricId": "cost",
            "distribution": "POINT",
            "expression": "700",
        },
    ),
    ("delete_scenario", {"scenarioId": "saved-1"}),
    ("activate_scenario", {"scenarioId": "saved-1"}),
    ("clear_scenario", {}),
]


@pytest.mark.parametrize("name,arguments", WRITES)
def test_all_financial_changes_are_captured_proposals_not_saves(
    name: str, arguments: dict
) -> None:
    arguments = {**arguments, "rationale": "Review financial change"}
    with patch("onyx.server.query_and_chat.causl.model_page._calculate") as calculate:
        result = model_page_tool_result(name, page(), arguments)
    calculate.assert_not_called()
    assert result["kind"] == "models:proposal"
    assert result["tool"] == name
    assert result["arguments"] == {
        key: value for key, value in arguments.items() if key != "rationale"
    }
    assert (result["captureId"], result["baseRevision"], result["workspaceScope"]) == (
        "turn-1",
        "revision-1",
        "local:test",
    )
    assert "No changes saved" in result["status"]
    with pytest.raises(ValueError, match="drafts"):
        model_page_tool_result(name, page(True), arguments)
    for reserved in ("document", "revision", "action", "market"):
        with pytest.raises(ValueError, match="schema"):
            model_page_tool_result(name, page(), {**arguments, reserved: "foreign"})


@pytest.mark.parametrize(
    "name,arguments",
    [
        ("set_sensitivity", {"metricId": "profit", "enabled": True}),
        ("set_sensitivity", {"metricId": "profit", "enabled": False}),
        ("build_model_chart", {"metricId": "profit"}),
    ],
)
def test_analysis_tools_only_request_a_guarded_current_view(
    name: str, arguments: dict
) -> None:
    result = model_page_tool_result(name, page(), arguments)
    assert result["kind"] == "models:view"
    assert result["arguments"] == {
        "view": model_page_tools()[name]["action"],
        **arguments,
    }
    assert result["captureId"] == "turn-1"
    assert "document" not in result


@pytest.mark.parametrize(
    "name,arguments,action",
    [
        ("inspect_metric", {"metricId": "profit"}, "inspect-metric"),
        ("inspect_scenario", {}, "inspect-scenario"),
        ("read_model_source", {}, "inspect-source"),
        (
            "run_model_scratchpad",
            {"source": "check = revenue - cost - profit"},
            "run-scratchpad",
        ),
    ],
)
def test_reads_call_the_existing_models_calculator(
    name: str, arguments: dict, action: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(
        "MODEL_AGENT_TOOL_URL", "http://models.test/api/model-agent/tool"
    )
    monkeypatch.setenv("MODEL_AGENT_TOOL_TOKEN", "test-only")

    def serve(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://models.test/api/model-agent/tool"
        assert request.headers["authorization"] == "Bearer test-only"
        body = json.loads(request.content)
        assert body == {
            **arguments,
            "action": action,
            "document": json.loads(page())["document"],
        }
        return httpx.Response(
            200, json={"action": action, "result": "Calculated in Models"}
        )

    client = httpx.Client(transport=httpx.MockTransport(serve))
    with patch(
        "onyx.server.query_and_chat.causl.model_page.httpx.Client", return_value=client
    ):
        result = model_page_tool_result(name, page(), arguments)
    assert result == {"action": action, "result": "Calculated in Models"}


def test_unconfigured_calculator_fails_without_substituting_an_llm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MODEL_AGENT_TOOL_URL", raising=False)
    with pytest.raises(ValueError, match="unavailable"):
        model_page_tool_result("inspect_metric", page(), {"metricId": "profit"})


def test_saved_scenarios_use_the_models_schema() -> None:
    schema = model_page_tool_schema("create_scenarios")
    assert "scenarios" in schema["properties"]
    assert "rationale" in schema["properties"]
    assert "document" not in schema["properties"]


@pytest.mark.parametrize(
    "default,name,expected",
    [
        ("inspect_model", "apply_model_source", "apply_model_source"),
        (
            "mcp_Library_inspect_model",
            "mcp_Library_create_scenarios",
            "mcp_Library_create_scenarios",
        ),
        ("internal_search", "apply_model_source", "internal_search"),
        ("inspect_model", "run_python", "inspect_model"),
    ],
)
def test_history_recovery_stays_inside_the_authorized_models_slot(
    default: str, name: str, expected: str
) -> None:
    response = json.dumps(
        {"response_type": "json", "tool_name": name, "tool_result": {}}
    )
    assert model_page_history_name(default, response) == expected
    assert model_page_history_name(default, "bad json") == default
