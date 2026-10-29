"""Models owns complete validation, calculation, review and application.

Pinned source: Subconscious-ai/guesstimate-v3 at
4fa768eb2d21f859f4493d3db80211c10490f861, src/lib/model-page/edit-contract.json.
The semantic SHA-256 guard rejects local drift from that owner revision.
"""

import hashlib
import json
from pathlib import Path
from typing import Any

_CONTRACT_PATH = Path(__file__).with_name("model_edit_contract.json")
_CONTRACT_SHA256 = "f723ed0c7b199f67b673ab2a230b5d63ad84ca46f11c66c376243b0f926d7982"


def model_page_tool_schema(name: str) -> dict[str, Any]:
    if name == "inspect_model":
        return {"type": "object", "properties": {}, "additionalProperties": False}
    contract = json.loads(_CONTRACT_PATH.read_text())
    semantic_bytes = json.dumps(
        contract, sort_keys=True, separators=(",", ":")
    ).encode()
    if hashlib.sha256(semantic_bytes).hexdigest() != _CONTRACT_SHA256:
        raise ValueError("Models edit contract differs from the pinned owner revision.")
    return {
        "type": "object",
        "properties": {
            "edits": {
                "type": "array",
                "minItems": 1,
                "maxItems": contract["maxEdits"],
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
        if not isinstance(drafts, list):
            raise ValueError("Current Models drafts must be a list.")
        page_context["draftCount"] = len(drafts)
        return {
            "currentModelPage": {**snapshot, "page": page_context},
            "source": "browser page data, not accepted business memory",
            "omissions": [
                "Editor draft text is request-only and omitted from tool history."
            ],
        }
    context = snapshot.get("page", {})
    if not snapshot.get("document"):
        raise ValueError(
            "No complete model available. Open a model before proposing changes."
        )
    if context.get("drafts"):
        raise ValueError(
            "Commit or discard editor drafts before requesting model changes."
        )
    if (
        set(arguments) != {"edits", "rationale"}
        or not isinstance(arguments["edits"], list)
        or not 1
        <= len(arguments["edits"])
        <= model_page_tool_schema(name)["properties"]["edits"]["maxItems"]
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
