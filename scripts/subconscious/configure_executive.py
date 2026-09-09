"""Install the executive rubric through native Onyx APIs; preserve the source agent.

Credentials come from a private Mozilla cookie jar. No password, provider secret,
or MCP credential is copied into the persona or printed.
"""

import argparse
import http.cookiejar
import json
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.error import HTTPError


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://localhost:3011")
    parser.add_argument("--cookies", required=True)
    parser.add_argument("--source-agent", type=int, default=1)
    parser.add_argument("--name", default="Executive interview")
    parser.add_argument(
        "--model-configuration",
        required=True,
        type=int,
        help="Existing AWS Bedrock model configuration ID",
    )
    parser.add_argument("--update-agent", type=int)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--replace-tools",
        action="store_true",
        help="Use only explicitly supplied tool IDs",
    )
    parser.add_argument(
        "--tool-id",
        type=int,
        action="append",
        default=[],
        help="Existing additional native tool ID",
    )
    args = parser.parse_args()
    if urllib.parse.urlsplit(args.origin).scheme not in ("http", "https"):
        parser.error("Origin must use HTTP or HTTPS")
    jar = http.cookiejar.MozillaCookieJar(args.cookies)
    jar.load(ignore_discard=True, ignore_expires=True)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def api(path: str, body: dict | None = None, method: str | None = None):
        request = urllib.request.Request(  # noqa: S310 - CLI origin scheme validated above
            args.origin.rstrip("/") + "/api" + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method=method,
        )
        try:
            with opener.open(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            detail = json.loads(error.read()).get("detail", "Native API request failed")
            raise RuntimeError(f"Native API HTTP {error.code}: {detail}") from None

    source = api(f"/persona/{args.source_agent}")
    providers = api("/llm/provider")["providers"]
    bedrock_ids = {
        model["id"]
        for provider in providers
        if provider["provider"] == "bedrock"
        for model in provider["model_configurations"]
    }
    if args.model_configuration not in bedrock_ids:
        raise ValueError("Executive interviews require an existing AWS Bedrock model")
    if args.update_agent is not None:
        existing = api(f"/persona/{args.update_agent}")
        if existing["name"] != args.name:
            raise ValueError("Refusing to replace an unrelated agent")
    rubric = (
        Path(__file__).resolve().parents[2] / "docs/subconscious/executive-rubric.md"
    )
    reminder = rubric.with_name("executive-turn-reminder.md")
    body = {
        "name": args.name,
        "description": "A focused working session with Sarah, Frankie, Mei and Jerry. A business objective, a customer journey, and the next useful experiment.",
        "document_set_ids": [item["id"] for item in source.get("document_sets", [])],
        "tool_ids": [
            item["id"] for item in source["tools"] if item.get("enabled", True)
        ]
        + [
            tool_id
            for tool_id in args.tool_id
            if tool_id not in {item["id"] for item in source["tools"]}
        ],
        "default_model_configuration_id": args.model_configuration,
        "system_prompt": rubric.read_text(),
        "task_prompt": reminder.read_text(),
        "datetime_aware": True,
        # Native Onyx otherwise inserts the rubric as a user message each turn.
        "replace_base_system_prompt": True,
        "starter_messages": [
            {
                "name": "Start with a decision",
                "message": "Start the executive interview. Begin with the business decision and the company context required for useful research.",
            },
            {
                "name": "Map a customer journey",
                "message": "Help identify the customer behavior most worth changing. Start with the business objective and selling context. Propose a journey once enough context is available.",
            },
        ],
    }
    if args.replace_tools:
        body["tool_ids"] = sorted(set(args.tool_id))
    if args.update_agent is None:
        body["is_public"] = False
    if not args.apply:
        print(
            json.dumps(
                {
                    "mode": "dry-run",
                    "name": body["name"],
                    "tools": len(body["tool_ids"]),
                    "model_configuration": args.model_configuration,
                }
            )
        )
        return
    path = "/persona" if args.update_agent is None else f"/persona/{args.update_agent}"
    result = api(path, body, "POST" if args.update_agent is None else "PATCH")
    saved = api(f"/persona/{result['id']}")
    assert saved["system_prompt"] == body["system_prompt"]
    assert saved["task_prompt"] == body["task_prompt"]
    assert saved["replace_base_system_prompt"] is True
    assert saved["default_model_configuration_id"] == args.model_configuration
    assert {item["id"] for item in saved["tools"]} == set(body["tool_ids"])
    print(
        json.dumps(
            {
                "agent_id": saved["id"],
                "name": saved["name"],
                "tools": len(saved["tools"]),
                "verified": True,
            }
        )
    )


if __name__ == "__main__":
    main()
