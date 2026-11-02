"""Register the Expected Parrot wrapper in Onyx and create the study persona.

Like ``configure_executive.py``, this acts as a signed-in administrator: pass a
Mozilla cookie jar exported from the admin's browser session, or an Onyx API
key in ``ONYX_API_KEY``. It never holds a password.

Steps: create or reuse the MCP server record, discover its tools live, save the
selected tools, then create (or update) a persona with those tools and the
prompt in ``docs/subconscious/ep-research-prompt.md`` on an existing Bedrock
model configuration. Prints the persona id for ``ep_demo.py``.

    python scripts/subconscious/register_ep.py --origin http://localhost:3011 \
        --cookies cookies.txt --server-url http://100.100.23.12:3194/mcp \
        --token-env EP_MCP_TOKEN --apply
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.error import HTTPError

SERVER_NAME = "expected_parrot_studies"
PERSONA_NAME = "EP Research Agent"
STARTERS = [
    {
        "name": "Design a quick survey",
        "message": "I want to ask customers one open question: what would improve this service? Build it and run it on the free test model first.",
    },
    {
        "name": "Test two messages",
        "message": "Help me test two versions of an instruction message with a few customer profiles, then compare how clear each one is.",
    },
    {
        "name": "Run a conjoint",
        "message": "Design a choice-based conjoint for a product with price and two other attributes, run it on the test model, and show the importance chart.",
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--origin", default="http://localhost:3011")
    parser.add_argument(
        "--cookies", help="Mozilla cookie jar from an admin browser session"
    )
    parser.add_argument(
        "--server-url",
        required=True,
        help="The wrapper's MCP URL, e.g. http://host:3194/mcp",
    )
    parser.add_argument(
        "--token-env",
        default="EP_MCP_TOKEN",
        help="Env var holding the wrapper's bearer token",
    )
    parser.add_argument("--server-name", default=SERVER_NAME)
    parser.add_argument("--persona-name", default=PERSONA_NAME)
    parser.add_argument(
        "--model-configuration",
        type=int,
        help="Model configuration id; default: the first Anthropic model on Bedrock, else the first Bedrock model",
    )
    parser.add_argument(
        "--apply", action="store_true", help="Write; without it, print the plan only"
    )
    args = parser.parse_args()

    scheme = urllib.parse.urlparse(args.origin).scheme
    if scheme not in ("http", "https"):
        parser.error("Origin must use HTTP or HTTPS")
    token = os.environ.get(args.token_env, "")
    if len(token) < 32:
        parser.error(f"{args.token_env} must hold the wrapper's token (32+ characters)")

    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get("ONYX_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        opener = urllib.request.build_opener()
    elif args.cookies:
        jar = http.cookiejar.MozillaCookieJar(args.cookies)
        jar.load(ignore_discard=True, ignore_expires=True)
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    else:
        parser.error("Give --cookies or set ONYX_API_KEY")

    def api(path: str, body: dict | None = None, method: str | None = None) -> dict:
        request = urllib.request.Request(  # noqa: S310 - origin scheme validated above
            args.origin.rstrip("/") + "/api" + path,
            data=None if body is None else json.dumps(body).encode(),
            headers=headers,
            method=method,
        )
        try:
            with opener.open(request, timeout=60) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except HTTPError as error:
            detail = error.read().decode(errors="replace")[:300]
            raise RuntimeError(
                f"Native API HTTP {error.code} on {path}: {detail}"
            ) from None

    me = api("/me")
    try:
        api("/admin/mcp/servers")  # the admin check this fork's /me does not expose
    except RuntimeError as error:
        raise SystemExit(
            f"Signed in as {me.get('email')}, but not as an admin: {error}"
        ) from None

    providers = api("/llm/provider")
    providers = (
        providers.get("providers", providers)
        if isinstance(providers, dict)
        else providers
    )
    bedrock = [
        model["id"]
        for provider in providers
        if provider.get("provider") == "bedrock"
        for model in provider.get("model_configurations", [])
    ]
    anthropic = [
        model["id"]
        for provider in providers
        if provider.get("provider") == "bedrock"
        for model in provider.get("model_configurations", [])
        if "anthropic" in str(model.get("name", "")).lower()
    ]
    model_configuration = args.model_configuration or (
        anthropic[0] if anthropic else bedrock[0] if bedrock else None
    )
    if model_configuration is None:
        raise SystemExit(
            "No Bedrock model configuration found; pass --model-configuration."
        )

    existing = [
        s
        for s in api("/admin/mcp/servers").get("mcp_servers", [])
        if s.get("name") == args.server_name
    ]
    prompt = (
        Path(__file__).resolve().parents[2] / "docs/subconscious/ep-research-prompt.md"
    )
    plan = {
        "mode": "apply" if args.apply else "dry-run",
        "admin": me.get("email"),
        "server": args.server_name,
        "server_url": args.server_url,
        "existing_server_id": existing[0]["id"] if existing else None,
        "persona": args.persona_name,
        "model_configuration": model_configuration,
        "prompt": str(prompt),
    }
    if not args.apply:
        print(json.dumps(plan, indent=1))
        return

    if existing:
        server_id = existing[0]["id"]
    else:
        created = api(
            "/admin/mcp/servers/create",
            {
                "name": args.server_name,
                "description": "Expected Parrot (EDSL) studies: design, run and analyze surveys and experiments.",
                "server_url": args.server_url,
                "auth_type": "API_TOKEN",
                "auth_performer": "ADMIN",
                "api_token": token,
                "api_token_changed": True,
                "transport": "STREAMABLE_HTTP",
            },
        )
        server_id = created["server_id"]

    live = api(f"/admin/mcp/server/{server_id}/tools")["tools"]
    names = sorted(t["name"] for t in live)
    updated = api(
        "/admin/mcp/servers/update",
        {"server_id": server_id, "selected_tools": names},
    )
    db_tools = api(f"/admin/mcp/server/{server_id}/db-tools")
    db_tools = (
        db_tools.get("tools", db_tools) if isinstance(db_tools, dict) else db_tools
    )
    tool_ids = sorted(t["id"] for t in db_tools)

    personas = api("/persona")
    personas = personas if isinstance(personas, list) else personas.get("personas", [])
    mine = [p for p in personas if p.get("name") == args.persona_name]
    body = {
        "name": args.persona_name,
        "description": "Designs, runs and analyzes surveys and experiments with Expected Parrot. Results from simulated respondents are labelled as such.",
        "document_set_ids": [],
        "tool_ids": tool_ids,
        "default_model_configuration_id": model_configuration,
        "system_prompt": prompt.read_text(),
        "task_prompt": "",
        "datetime_aware": True,
        "replace_base_system_prompt": False,
        "starter_messages": STARTERS,
        # Public: a private persona is invisible to every account but its owner,
        # and the dev stack disables the default assistant, so the chat page
        # shows "No Agent Available".
        "is_public": True,
    }
    if mine:
        result = api(f"/persona/{mine[0]['id']}", body, "PATCH")
    else:
        result = api("/persona", body, "POST")
    saved = api(f"/persona/{result['id']}")
    assert {t["id"] for t in saved["tools"]} == set(tool_ids), (
        "persona tools differ from the server's tools"
    )
    print(
        json.dumps(
            {
                "server_id": server_id,
                "tools_discovered": len(names),
                "tools_saved": updated.get("updated_tools"),
                "tool_ids": tool_ids,
                "persona_id": saved["id"],
                "model_configuration": model_configuration,
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
