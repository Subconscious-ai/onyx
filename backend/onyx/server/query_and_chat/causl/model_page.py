"""Models v1 edit contract. Models owns complete validation, calculation, review and application."""

import json
from pathlib import Path
from typing import Any


def model_page_tool_schema(name: str) -> dict[str, Any]:
    if name == "inspect_model":
        return {"type": "object", "properties": {}, "additionalProperties": False}
    contract = json.loads(
        Path(__file__).with_name("model_edit_contract.json").read_text()
    )
    return {
        "type": "object",
        "properties": {
            "edits": {
                "type": "array",
                "minItems": 1,
                "maxItems": 200,
                "items": contract["schema"],
            },
            "rationale": {"type": "string", "minLength": 1, "maxLength": 4000},
        },
        "required": ["edits", "rationale"],
        "additionalProperties": False,
    }


def model_page_tool_result(
    name: str, page: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    snapshot = json.loads(page)
    if not isinstance(snapshot, dict) or snapshot.get("version") != 1:
        raise ValueError("Current Models context is unavailable.")
    if name == "inspect_model":
        # Native tool results are durable. Draft text belongs only in the current prompt.
        page_context = {**snapshot.get("page", {})}
        drafts = page_context.pop("drafts", [])
        page_context["draftCount"] = len(drafts)
        return {
            "currentModelPage": {**snapshot, "page": page_context},
            "source": "browser page data, not accepted business memory",
            "omissions": [
                "Editor draft text is request-only and omitted from tool history."
            ],
        }
    context = snapshot.get("page", {})
    if not snapshot.get("document") or context.get("drafts"):
        raise ValueError(
            "Commit or discard editor drafts before requesting model changes."
        )
    if (
        set(arguments) != {"edits", "rationale"}
        or not isinstance(arguments["edits"], list)
        or not 1 <= len(arguments["edits"]) <= 200
        or not isinstance(arguments["rationale"], str)
        or not 1 <= len(arguments["rationale"]) <= 4000
    ):
        raise ValueError("A bounded typed edit proposal is required.")
    # This emits a proposal only. The browser runs the canonical complete-model service.
    return {
        "kind": "models:proposal",
        "version": 1,
        "captureId": snapshot["captureId"],
        "workspaceScope": context["workspaceScope"],
        "baseRevision": context["documentRevision"],
        "edits": arguments["edits"],
        "rationale": arguments["rationale"],
        "status": "Awaiting validation and explicit Apply in Models. No changes saved.",
    }
