"""Current local model context stays separate from saved business evidence."""

import json
from typing import Any

import pytest

from onyx.server.query_and_chat.causl.model_page import (
    model_page_tool_result,
    model_page_tool_schema,
)
from onyx.server.query_and_chat.causl.models import CauslSelection


def snapshot(drafts: list[dict[str, str]] | None = None) -> str:
    return json.dumps(
        {
            "version": 1,
            "captureId": "turn-1",
            "document": {"local": "complete document"},
            "page": {
                "workspaceScope": "local:one",
                "documentRevision": "revision-1",
                "drafts": drafts or [],
            },
        }
    )


def test_drafts_are_request_scoped_and_absent_from_tool_history() -> None:
    page = snapshot([{"metricId": "metric-1", "text": "private editor draft"}])
    selection = CauslSelection(page="models", modelPage=page)
    assert "private editor draft" not in selection.model_dump_json()
    assert "modelPage" not in selection.query()
    inspected = model_page_tool_result("inspect_model", page, {})
    assert "private editor draft" not in json.dumps(inspected)
    assert inspected["currentModelPage"]["page"]["draftCount"] == 1


def test_local_proposal_preserves_capture_and_never_claims_application() -> None:
    edits = [{"kind": "delete-metric", "metricId": "metric-1"}]
    proposal = model_page_tool_result(
        "prepare_model_change",
        snapshot(),
        {"edits": edits, "rationale": "Review the intervention"},
    )
    assert proposal["kind"] == "models:proposal"
    assert proposal["captureId"] == "turn-1"
    assert proposal["baseRevision"] == "revision-1"
    assert proposal["workspaceScope"] == "local:one"
    assert proposal["edits"] == edits
    assert "No changes saved" in proposal["status"]


@pytest.mark.parametrize(
    "arguments",
    [
        {"edits": [], "rationale": "Empty"},
        {"edits": [{}] * 201, "rationale": "Too many"},
        {"edits": [{}], "rationale": "", "market": "foreign"},
        {"edits": [{}], "rationale": 42},
        {"edits": [{}], "rationale": "x" * 4001},
    ],
)
def test_unbounded_or_foreign_arguments_cannot_propose(
    arguments: dict[str, Any],
) -> None:
    with pytest.raises(ValueError):
        model_page_tool_result("prepare_model_change", snapshot(), arguments)


def test_draft_context_cannot_prepare_model_changes() -> None:
    with pytest.raises(ValueError, match="drafts"):
        model_page_tool_result(
            "prepare_model_change",
            snapshot([{"metricId": "m", "text": "draft"}]),
            {"edits": [{}], "rationale": "Edit"},
        )


def test_local_tool_schema_uses_canonical_semantic_edits_without_market_authority() -> (
    None
):
    schema = model_page_tool_schema("prepare_model_change")
    assert set(schema["properties"]) == {"edits", "rationale"}
    assert schema["additionalProperties"] is False
    assert "oneOf" in schema["properties"]["edits"]["items"]
