# Expected Parrot studies in Onyx Craft

Onyx Craft runs Expected Parrot's own tools: EDSL and its `ep` CLI (MIT) in the
Craft sandbox, Expected Parrot's study skills (`expectedparrot/ep-skills`,
pinned), and Craft's OpenCode agent on open-weight Bedrock models. A user asks a
market question in Craft; the agent plans the study, waits for approval, runs a
priced pilot, waits again, then runs the full study on simulated respondents and
shows the charts inline.

Running on agent-dev as Compose project `craft-fork`
(`~/craft-ep/build-wt/deployment/docker_compose`), web on
`http://agent-dev.taila3aadb.ts.net:3390`. Tracked on
[map #119](https://github.com/Subconscious-ai/onyx/issues/119).

## What is configuration and what is ours

| Piece | Source |
| --- | --- |
| Craft, sandbox, model gateway, skills import, Craft instructions setting | Onyx (this fork) |
| EDSL 1.0.9, `ep` CLI, study skills | Expected Parrot, installed or fetched at image build |
| `sandbox/Dockerfile` | ours: fork sandbox image plus EDSL, `openai[aiohttp]`, pinned skills, concurrency cap |
| `sandbox/ep-charts.ts` | ours: global OpenCode plugin, same mechanism as Onyx's `turn-budget.ts` |
| `craft-instructions.md` | ours: the Craft organization instructions (admin setting, under Onyx's 4,000-character limit) |
| `rebuild.sh` | ours: builds every image from this checkout, updates `.env`, restarts the stack, applies the admin settings |
| `web/src/app/craft/constants/exampleBuildPrompts.ts` | fork change: a "Market research" group of starter prompts, first on Craft's welcome page |

## Stack settings (`deployment/docker_compose/.env`)

Start from `env.template`, then set (no secrets listed here):

- `COMPOSE_PROJECT_NAME=craft-fork`, `HOST_PORT=3390`, `HOST_PORT_80=3391`, `WEB_DOMAIN=http://agent-dev.taila3aadb.ts.net:3390`, `AUTH_TYPE=basic`, `USER_AUTH_SECRET` generated (`openssl rand -hex 32`).
- `ENABLE_CRAFT=true`, `SANDBOX_BACKEND=docker`, `SANDBOX_CONTAINER_IMAGE=craft-ep/sandbox:<fork tag>-edsl1.0.9`.
- `ONYX_BACKEND_IMAGE` and `ONYX_WEB_SERVER_IMAGE` built from this fork (`backend/Dockerfile`, `web/Dockerfile`); `ONYX_MODEL_SERVER_IMAGE=onyxdotapp/onyx-model-server:v5.0.3`; `CODE_INTERPRETER_IMAGE_TAG=0.4.9`.
- `LICENSE_ENFORCEMENT_ENABLED=false` and `ENABLE_PAID_ENTERPRISE_EDITION_FEATURES=true`: Craft needs the Business tier; `backend/ee/LICENSE` permits development and testing without a subscription. Production needs an Onyx subscription.
- `OPENCODE_PROMPT_INACTIVITY_TIMEOUT_SECONDS=1800`: the 200 s default ends a turn while a full EDSL run is still quiet.
- `LLM_SOCKET_READ_TIMEOUT=600`: MiniMax M2.5 can go quiet for minutes while it writes a long tool call; the 60 s default (and 180 s) returned "The selected model did not respond in time."
- The fork's Compose file names `minio/minio:RELEASE.2025-07-23T15-54-02Z-cpuv1`, which Docker Hub no longer serves; tag Onyx's mirror (`onyxdotapp/minio` at that release) under that name.

`rebuild.sh` does the rest: it builds the backend, web, sandbox base and Expected Parrot sandbox images tagged `fork-<commit>`, creates the sandbox network and proxy volume, tags the MinIO mirror, writes the image tags and timeouts into `.env`, runs `docker compose up -d`, removes sandboxes on an older image (Craft re-creates them), and applies the default Craft model and `craft-instructions.md`. The steps by hand: before `docker compose up`, `docker network create onyx_craft_sandbox`, `docker volume create sandbox_proxy_ca`, and build the sandbox image from `sandbox/` on top of the fork's `backend/onyx/server/features/build/sandbox/image` (tagged `craft-ep/sandbox-base:<fork tag>`). Docker needs buildx for the fork images.

The fork needs [fix(llm): pass api_base through the patched LiteLLM bridge check (#132)](https://github.com/Subconscious-ai/onyx/pull/132); without it every streamed model call fails.

## After the stack is up (admin API)

1. Bedrock provider with the open-weight models (Anthropic models on Bedrock are blocked for this account): `minimax.minimax-m2.5`, `moonshotai.kimi-k2.5`, `zai.glm-5`, `deepseek.v3.2`, `qwen.qwen3-next-80b-a3b`, `openai.gpt-oss-120b-1:0`, `us.meta.llama4-maverick-17b-instruct-v1:0`, `mistral.mistral-large-3-675b-instruct`, `google.gemma-3-27b-it`. `test/copy_bedrock.py` copies the dev chat stack's Bedrock key without printing it.
2. `POST /api/admin/llm/default` and `/default-craft` with `minimax.minimax-m2.5` (`rebuild.sh` sets the Craft default). GLM-5 also passes but costs about twice as much: about $1.50 of agent tokens per full study against $0.70 to $1.00 for MiniMax (measured from `user_usage`). Kimi K2.5 and DeepSeek v3.2 replaced the study with web research; Qwen3-Next refused to run EDSL.
3. `PATCH /api/admin/settings` with `{"craft_instructions": <craft-instructions.md>}`.

Respondents run inside the sandbox through Onyx's own gateway: EDSL's `openai_compatible` service with base URL `$ONYX_SERVER_URL$ONYX_API_PREFIX/gateway/v1` and key `$ONYX_PAT`, model `1/<model id>`. No model key enters the sandbox.

## Why each piece of glue exists

- **Skills for every user without switching them on.** Onyx enables custom skills per user, and Craft's OpenCode rules let the agent read only the session folder, enabled skills and `/tmp`. The image fetches the pinned skills to `/opt/ep-skills`, and the sandbox entrypoint copies them into the fresh `/tmp/ep-skills` at start. (Craft starts sandboxes with `/workspace/entrypoint.sh`, not the image `ENTRYPOINT`.)
- **Rules the plugin enforces, not just the instructions.** Instructions alone held in about 15 of 18 runs. `ep-charts.ts` (1) refuses any shell command that starts an EDSL job (`.run(` inline or in the Python file it runs, or `ep run` / `ep run-manifest`) before the user's second message, and once it fires refuses every shell command for the rest of that turn (the third refused command ends the turn), so the first reply is a plan; it also adds the current turn's rule to each model call (turn 1 plan only, turn 2 pilot only with tokens and cost, later turns say the respondents are simulated); (2) refuses a write of `outputs/reply.md` that says market share, penetration, adoption, market size or reach; (3) appends to each tool result the exact inline Markdown for every new PNG and warns when a chart lands outside `outputs/graphs/`; (4) flags the banned terms in anything else the agent writes; (5) refuses a study script or question that names an attached file as plain text instead of through `FileStore` or `from_pdf`.
- **`EDSL_MAX_CONCURRENT_TASKS=8`.** EDSL's default of 50 exhausted the API's Redis connection pool ("Too many connections").

## What we learned (November 2026)

Results on agent-dev, with MiniMax M2.5 as the Craft agent:

| Commit | Run | Result |
| --- | --- | --- |
| `d4977e435` | `z1`, `z2`, `z3` core + market | 43/43, 38/43, 43/43 |
| `d4977e435` | `z-demos` | 19/25 cases |
| `d4977e435` | `z-tools` | 31/39 cases |
| `e60548559` | `y1`, `y2` core + market | 42/43, 42/43 |

- Acceptance was not fully reached: no three clean runs in a row on one commit. The 14 demo and tool cases that failed were not rerun on `e60548559`, so its fixes for them are unproven, and `y3` was stopped by choice.
- Still failing on `e60548559`: a full-run reply with no simulated caveat (`y1` concept_image), and a first chart 1,097 s after approval against the 900 s limit (`y2` conjoint_segments).
- Agent models: MiniMax follows a rule attached to the user message far better than the same rule in the system prompt, so the plugin attaches each turn's rule to the newest user message. Core + market runs were 34-41 of 43 before that change and 38-43 after it. Qwen3-Next as the agent refuses to run EDSL, and GLM-5 costs about twice as much per study.
- Rules worth holding in code, because the agent broke them in tests: `ep run` skipping the plan gate, and an ad image passed as a file path so respondents never saw it.
- Open gaps, not held in code: the agent can write its own EDSL script instead of the tool the user names (7 of 39 tool cases), and can answer a small coding task itself in plain text (no plugin hook refuses a text reply). A named-tool refusal was reviewed and removed: its match missed "Use Expected Parrot's X", opened on `X --help`, and false-matched plain words such as "use green", because `green`, `voting` and `golden` are tool names. A working version needs an exact-name match and a check that the tool's real command ran, proved on the tool cases.
- Test lessons: a check with `>=` passes oversized studies, so sample checks are exact. The inspector must read every Results format the agent writes (`.json.gz`, plain JSON under a `.gz` name, `.ep`). Use a new run tag each time: `tdd.py` overwrites the files of a tag used before.
- Stack: restarting Redis logs test users out; re-creating `api_server` needs an nginx restart. `rebuild.sh` handles the second, and `tdd.py` the first.
- Cost: a core + market run is about $2.50-$3 and the demo + tool sweep about $34. `select sum(cost_cents)/100 from user_usage` is the running total.

## Test

`test/tdd.py` drives Craft through its own API as the test users `ep-user2`..`ep-user8` (cookie jars in `~/craft-ep/`, copied with `test/craft_turn.sh`, `ep_demos.tsv`, `ep_tool_prompts.tsv` and `stimuli/`), then checks what ran: EDSL Results files in the session's sandbox, the commands the agent ran, the reply, and whether each inline chart loads.

```bash
python3 tdd.py <run> [--jobs 4] [--model ID] [--without-gate] [core | market | demos | tools | <case> ...]
```

- `core`: the plan gate on a small coding task and on a user who demands an immediate run (`gate_immediate_run`), a priced pricing study through pilot and full run with a market-share follow-up, and an unavailable respondent model.
- `market`: three scripted investigations: willingness to pay (Van Westendorp plus a price ladder), an ad concept test with an attached image, and a conjoint with two segments.
- `demos`: each Expected Parrot demo and EDSL docs example in `ep_demos.tsv`; `tools`: each application CLI in `ep_tool_prompts.tsv` (pass means the tool's own command ran and its result is in the reply).
- `first_chart_time` reports the seconds from approving the full run to the reply with the first inline chart.
- `--without-gate` sets `PLAN_GATE = false` in the plugin in the test user's sandbox (the gate and the per-turn rules) and restarts `opencode serve`, then restores it: `gate_immediate_run` goes red without it and green with it. Attachments are not sent in this mode.
- Known gaps, from review: the gate does not see an EDSL job started from a script run some other way (`bash run.sh`, `python - < x.py`), and a reply written to `reply.md` through the shell skips the banned-term check.

`welcome_screenshot.py` renders Craft's welcome page with the Market research starter prompts open. `flow.sh`, `audit_flow.sh`, `run_demos.sh` and `craft_screenshot.py` are the earlier hand tools; `craft_screenshot.py` renders a session in headless Chromium.
