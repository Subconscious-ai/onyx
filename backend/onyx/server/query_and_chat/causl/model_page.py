"""Models owns tool schemas, financial validation, calculation and application.

The generated v2 contract comes from guesstimate-v3 nativeTools.ts and contracts.ts.
The semantic digest prevents drift. Browser review remains mandatory for writes.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import httpx
from jsonschema import Draft202012Validator

_CONTRACT_PATH = Path(__file__).with_name("model_tool_contract.json")
_CONTRACT_SHA256 = "93eb6c55393b2b14adc2243545fe2676d6d171cc0732d47517ae120a7861d801"


def model_page_tools() -> dict[str, Any]:
    contract = json.loads(_CONTRACT_PATH.read_text())
    semantic_bytes = json.dumps(
        contract, sort_keys=True, separators=(",", ":")
    ).encode()
    if hashlib.sha256(semantic_bytes).hexdigest() != _CONTRACT_SHA256:
        raise ValueError("Models tool contract differs from the pinned owner revision.")
    return contract["tools"]


def model_page_tool_schema(name: str) -> dict[str, Any]:
    return model_page_tools()[name]["schema"]


def model_page_history_name(default: str, response: str | None) -> str:
    """Recover aliases from the native CustomToolCallSummary persistence format."""
    if default != "inspect_model" and not default.endswith("_inspect_model"):
        return default
    try:
        data = json.loads(response or "null")
    except (ValueError, TypeError):
        return default
    if not isinstance(data, dict) or data.get("response_type") != "json":
        return default
    name = data.get("tool_name")
    prefix = default.removesuffix("inspect_model")
    if isinstance(name, str) and name in {
        prefix + canonical for canonical in model_page_tools()
    }:
        return name
    return default


def _calculate(
    action: str, document: dict[str, Any], arguments: dict[str, Any]
) -> dict[str, Any]:
    # The endpoint is deployment configuration. Never accept a URL from page data.
    url = os.environ.get("MODEL_AGENT_TOOL_URL")
    token = os.environ.get("MODEL_AGENT_TOOL_TOKEN")
    if not url or not token:
        raise ValueError(
            "Models calculation service is unavailable. No model changes saved."
        )
    with httpx.Client(timeout=45, trust_env=False, follow_redirects=False) as client:
        with client.stream(
            "POST",
            url,
            headers={"Authorization": f"Bearer {token}"},
            json={**arguments, "action": action, "document": document},
        ) as response:
            if response.status_code != 200:
                raise ValueError(
                    "Models rejected the calculation. Check cell IDs and Squiggle source."
                )
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > 512_000:
                    raise ValueError("Models calculation exceeds the response limit.")
    result = json.loads(body)
    if not isinstance(result, dict) or result.get("action") != action:
        raise ValueError("Models returned an invalid calculation result.")
    return result


def model_page_tool_result(
    name: str, page: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    snapshot = json.loads(page)
    if not isinstance(snapshot, dict) or snapshot.get("version") != 1:
        raise ValueError("Current Models context is unavailable.")
    entry = model_page_tools()[name]
    context = snapshot.get("page", {})
    document = snapshot.get("document")
    if name == "inspect_model":
        if not Draft202012Validator(entry["schema"]).is_valid(arguments):
            raise ValueError("Arguments do not match the bounded Models tool schema.")
        # Draft text belongs only in this turn's prompt, never durable tool history.
        page_context = {**context}
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
    if not document:
        raise ValueError(
            "No complete model available. Open a model before proposing changes."
        )
    if context.get("drafts"):
        raise ValueError(
            "Commit or discard editor drafts before requesting model tools."
        )
    if not Draft202012Validator(entry["schema"]).is_valid(arguments):
        raise ValueError("Arguments do not match the bounded Models tool schema.")
    if entry["action"] in {"sensitivity", "chart"}:
        return {
            "kind": "models:view",
            "version": 1,
            "captureId": snapshot["captureId"],
            "workspaceScope": context["workspaceScope"],
            "baseRevision": context["documentRevision"],
            "arguments": {"view": entry["action"], **arguments},
            "status": "View requested. The Models browser verifies the current capture.",
        }
    if entry["readOnly"]:
        return _calculate(entry["action"], document, arguments)
    result = {
        "kind": "models:proposal",
        "version": 1,
        "captureId": snapshot["captureId"],
        "workspaceScope": context["workspaceScope"],
        "baseRevision": context["documentRevision"],
        "tool": name,
        "arguments": {
            key: value for key, value in arguments.items() if key != "rationale"
        },
        "rationale": arguments["rationale"],
        "status": "Awaiting validation and explicit Apply in Models. No changes saved.",
    }
    if name == "prepare_model_change":
        result["edits"] = arguments["edits"]
    return result
