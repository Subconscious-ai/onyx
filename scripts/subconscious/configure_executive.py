"""Install the executive rubric through native Onyx APIs; preserve the source agent.

Credentials come from a private Mozilla cookie jar. No password, provider secret,
or MCP credential is copied into the persona or printed.
"""
import argparse
import http.cookiejar
import json
from pathlib import Path
import urllib.request


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://localhost:3011")
    parser.add_argument("--cookies", required=True)
    parser.add_argument("--source-agent", type=int, default=1)
    parser.add_argument("--model-configuration", required=True, type=int,
                        help="Existing AWS Bedrock model configuration ID")
    parser.add_argument("--update-agent", type=int)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    jar = http.cookiejar.MozillaCookieJar(args.cookies)
    jar.load(ignore_discard=True, ignore_expires=True)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def api(path: str, body: dict | None = None, method: str | None = None):
        request = urllib.request.Request(
            args.origin.rstrip("/") + "/api" + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"}, method=method,
        )
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    source = api(f"/persona/{args.source_agent}")
    if args.update_agent is not None:
        existing = api(f"/persona/{args.update_agent}")
        if existing["name"] != "Executive interview":
            raise ValueError("Refusing to replace an unrelated agent")
    rubric = Path(__file__).resolve().parents[2] / "docs/subconscious/executive-rubric.md"
    body = {
        "name": "Executive interview",
        "description": "A focused working session with Sarah, Frankie, Mei and Jerry. A business objective, a customer journey, and the next useful experiment.",
        "document_set_ids": [item["id"] for item in source.get("document_sets", [])],
        "tool_ids": [item["id"] for item in source["tools"] if item.get("enabled", True)],
        "default_model_configuration_id": args.model_configuration,
        "system_prompt": rubric.read_text(),
        "task_prompt": "",
        "datetime_aware": True,
        "replace_base_system_prompt": False,
        "starter_messages": [
            {"name": "Start with a decision", "message": "Start the executive interview. Begin with the business decision and the company context required for useful research."},
            {"name": "Map a customer journey", "message": "Help identify the customer behavior most worth changing. Start with the business objective and a recent customer example."},
        ],
    }
    if args.update_agent is None:
        body["is_public"] = False
    if not args.apply:
        print(json.dumps({"mode": "dry-run", "name": body["name"], "tools": len(body["tool_ids"]), "model_configuration": args.model_configuration}))
        return
    path = "/persona" if args.update_agent is None else f"/persona/{args.update_agent}"
    result = api(path, body, "POST" if args.update_agent is None else "PATCH")
    saved = api(f"/persona/{result['id']}")
    assert saved["system_prompt"] == body["system_prompt"]
    assert saved["default_model_configuration_id"] == args.model_configuration
    assert {item["id"] for item in saved["tools"]} == set(body["tool_ids"])
    print(json.dumps({"agent_id": saved["id"], "name": saved["name"], "tools": len(saved["tools"]), "verified": True}))


if __name__ == "__main__":
    main()
