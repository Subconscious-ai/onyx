# Expected Parrot studies in Onyx Craft

Onyx Craft runs Expected Parrot's own tools: EDSL and its `ep` CLI (MIT) in the
Craft sandbox, Expected Parrot's study skills (`expectedparrot/ep-skills`,
pinned), and Craft's OpenCode agent on open-weight Bedrock models. A user asks a
market question in Craft; the agent plans the study, waits for approval, runs a
priced pilot, waits again, then runs the full study on simulated respondents and
shows the charts inline.

Running on agent-dev as Compose project `craft-fork`
(`~/craft-ep/fork/deployment/docker_compose`), web on
`http://agent-dev.taila3aadb.ts.net:3390`. Tracked on
[map #119](https://github.com/Subconscious-ai/onyx/issues/119).

## What is configuration and what is ours

| Piece | Source |
| --- | --- |
| Craft, sandbox, model gateway, skills import, Craft instructions setting | Onyx (this fork) |
| EDSL 1.0.9, `ep` CLI, study skills | Expected Parrot, installed or fetched at image build |
| `sandbox/Dockerfile` | ours: fork sandbox image plus EDSL, `openai[aiohttp]`, pinned skills, concurrency cap |
| `sandbox/ep-charts.ts` | ours: global OpenCode plugin, same mechanism as Onyx's `turn-budget.ts` |
| `craft-instructions.md` | ours: the Craft organization instructions (admin setting) |

## Stack settings (`deployment/docker_compose/.env`)

Start from `env.template`, then set (no secrets listed here):

- `COMPOSE_PROJECT_NAME=craft-fork`, `HOST_PORT=3390`, `HOST_PORT_80=3391`, `WEB_DOMAIN=http://agent-dev.taila3aadb.ts.net:3390`, `AUTH_TYPE=basic`, `USER_AUTH_SECRET` generated (`openssl rand -hex 32`).
- `ENABLE_CRAFT=true`, `SANDBOX_BACKEND=docker`, `SANDBOX_CONTAINER_IMAGE=craft-ep/sandbox:<fork tag>-edsl1.0.9`.
- `ONYX_BACKEND_IMAGE` and `ONYX_WEB_SERVER_IMAGE` built from this fork (`backend/Dockerfile`, `web/Dockerfile`); `ONYX_MODEL_SERVER_IMAGE=onyxdotapp/onyx-model-server:v5.0.3`; `CODE_INTERPRETER_IMAGE_TAG=0.4.9`.
- `LICENSE_ENFORCEMENT_ENABLED=false` and `ENABLE_PAID_ENTERPRISE_EDITION_FEATURES=true`: Craft needs the Business tier; `backend/ee/LICENSE` permits development and testing without a subscription. Production needs an Onyx subscription.
- `OPENCODE_PROMPT_INACTIVITY_TIMEOUT_SECONDS=1800`: the 200 s default ends a turn while a full EDSL run is still quiet.
- The fork's Compose file names `minio/minio:RELEASE.2025-07-23T15-54-02Z-cpuv1`, which Docker Hub no longer serves; tag Onyx's mirror (`onyxdotapp/minio` at that release) under that name.

Before `docker compose up`: `docker network create onyx_craft_sandbox`, `docker volume create sandbox_proxy_ca`, and build the sandbox image from `sandbox/` on top of the fork's `backend/onyx/server/features/build/sandbox/image` (tagged `craft-ep/sandbox-base:<fork tag>`). Docker needs buildx for the fork images.

The fork needs [fix(llm): pass api_base through the patched LiteLLM bridge check (#132)](https://github.com/Subconscious-ai/onyx/pull/132); without it every streamed model call fails.

## After the stack is up (admin API)

1. Bedrock provider with the open-weight models (Anthropic models on Bedrock are blocked for this account): `moonshotai.kimi-k2.5`, `zai.glm-5`, `deepseek.v3.2`, `qwen.qwen3-next-80b-a3b`, `openai.gpt-oss-120b-1:0`, `us.meta.llama4-maverick-17b-instruct-v1:0`, `mistral.mistral-large-3-675b-instruct`, `google.gemma-3-27b-it`. `test/copy_bedrock.py` copies the dev chat stack's Bedrock key without printing it.
2. `POST /api/admin/llm/default` and `/default-craft` with `zai.glm-5`. In a side-by-side run GLM-5 followed the skills and gates; Kimi K2.5 and DeepSeek v3.2 replaced the study with web research.
3. `PATCH /api/admin/settings` with `{"craft_instructions": <craft-instructions.md>}`.

Respondents run inside the sandbox through Onyx's own gateway: EDSL's `openai_compatible` service with base URL `$ONYX_SERVER_URL$ONYX_API_PREFIX/gateway/v1` and key `$ONYX_PAT`, model `1/<model id>`. No model key enters the sandbox.

## Why each piece of glue exists

- **Skills for every user without switching them on.** Onyx enables custom skills per user, and Craft's OpenCode rules let the agent read only the session folder, enabled skills and `/tmp`. The image fetches the pinned skills to `/opt/ep-skills`, and the sandbox entrypoint copies them into the fresh `/tmp/ep-skills` at start. (Craft starts sandboxes with `/workspace/entrypoint.sh`, not the image `ENTRYPOINT`.)
- **Charts inline and no "market share".** Instructions alone held in about 15 of 18 runs. `ep-charts.ts` appends to each tool result the exact inline Markdown for every new PNG, warns when a chart lands outside `outputs/graphs/`, and flags market share, penetration, adoption, market size or reach in what the agent just wrote.
- **`EDSL_MAX_CONCURRENT_TASKS=8`.** EDSL's default of 50 exhausted the API's Redis connection pool ("Too many connections").

## Test

`test/` drives Craft through its own API as test users: `flow.sh <tag> <question> <cookie jar>` runs ask, "Approved. Run the pilot.", then approval of the full run; `run_demos.sh` runs the prompts in `ep_demos.tsv`; `audit_flow.sh` reports errors, inline images and whether each loads, banned terms and cost; `craft_screenshot.py` renders a session in headless Chromium.
