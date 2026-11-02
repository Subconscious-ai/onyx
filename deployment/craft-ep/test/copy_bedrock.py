"""Copy the dev Onyx stack's Bedrock provider into the Craft stack. Prints no secret.

Run on agent-dev with the running onyx-api's environment and venv:
    python copy_bedrock.py <craft admin cookie jar>
"""

import json
import sys
import urllib.error
import urllib.request

from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant
from onyx.db.llm import fetch_existing_llm_providers

HAIKU = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def plain(value):
    return value.get_value(apply_mask=False) if hasattr(value, "get_value") else value


SqlEngine.init_engine(pool_size=2, max_overflow=0)
with get_session_with_current_tenant() as db:
    source = [
        p
        for p in fetch_existing_llm_providers(db, flow_type_filter=[])
        if p.provider == "bedrock"
    ][0]
    config = {k: plain(v) for k, v in plain(source.custom_config or {}).items()}
token = str(config.get("AWS_BEARER_TOKEN_BEDROCK") or "")
print("source", source.name, "keys", sorted(config), "token length", len(token))
if not token:
    raise SystemExit("source provider has no bearer token")

# curl writes HttpOnly cookies as "#HttpOnly_" lines, which MozillaCookieJar skips.
cookies = []
for line in open(sys.argv[1]):
    if line.startswith("#HttpOnly_"):
        line = line[len("#HttpOnly_"):]
    elif line.startswith("#") or not line.strip():
        continue
    fields = line.rstrip("\n").split("\t")
    if len(fields) == 7:
        cookies.append(f"{fields[5]}={fields[6]}")
opener = urllib.request.build_opener()
opener.addheaders = [("Cookie", "; ".join(cookies))]
body = {
    "name": "AWS Bedrock",
    "provider": "bedrock",
    "is_public": True,
    "custom_config": config,
    "custom_config_changed": True,
    "model_configurations": [{"name": HAIKU, "is_visible": True}],
}
request = urllib.request.Request(
    "http://localhost:3390/api/admin/llm/provider?is_creation=true",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json"},
    method="PUT",
)
try:
    with opener.open(request, timeout=60) as response:
        out = json.loads(response.read())
        print(
            "created provider",
            out.get("id"),
            [m["name"] for m in out.get("model_configurations", [])],
        )
except urllib.error.HTTPError as error:
    print("HTTP", error.code, error.read().decode(errors="replace")[:300])
