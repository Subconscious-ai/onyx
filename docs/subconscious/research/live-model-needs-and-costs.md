# What each candidate live model needs on agent-dev, and what a pilot costs

Research for [Subconscious-ai/onyx#121](https://github.com/Subconscious-ai/onyx/issues/121).
Written 2026-11-01. No package was installed and no paid model was called; the
cost figures come from EDSL's own estimator run against the `test` service and
from vendor price pages.

## Sources read

| Source | Revision |
| --- | --- |
| Wrapper `scripts/subconscious/serve_ep.py` | this branch, `_model_for` (lines 1417-1426), `estimate_cost` (757-781), `run_survey` (783-856) |
| Wrapper `scripts/subconscious/ep-requirements.txt` | `edsl[viz]==1.0.9`, no provider SDK |
| EDSL | 1.0.9, installed at `/home/ubuntu/ep-venv/lib/python3.12/site-packages/edsl` on agent-dev (`edsl.__version__ == "1.0.9"`) |
| botocore | `develop` at commit `5f03f4dca0fc5f968d5b01462081f45d1d4f1c0f` (2026-10-30); latest release 1.43.123 on PyPI |
| Running wrapper | pid 2354620, `/home/ubuntu/ep-venv/bin/python /home/ubuntu/ep-wt/scripts/subconscious/serve_ep.py --workspace /home/ubuntu/ep-workspace`; its environment holds only `EP_MCP_TOKEN` (names checked, values not read) |

Installed SDKs in `~/ep-venv` on agent-dev, checked with `python -c "import X"`:
`boto3`, `botocore`, `openai`, `google.genai` and `anthropic` are all absent
(`ModuleNotFoundError`); `httpx 0.28.1` is present.

## 1. Bedrock: Claude Haiku 4.5 via `AWS_BEARER_TOKEN_BEDROCK`

### What EDSL's bedrock service does

File: `edsl/inference_services/services/aws_bedrock.py` (EDSL 1.0.9).

- Line 3: `import boto3` at module import time. The registry imports the
  module lazily (`inference_service_registry.py` lines 201-236) and converts
  the `ImportError` into `InferenceServiceDependencyError: Failed to import
  service 'bedrock': No module named 'boto3'. Install provider SDKs with: pip
  install edsl[inference]`. Reproduced on agent-dev with
  `Model("us.anthropic.claude-haiku-4-5-20251001-v1:0", service_name="bedrock")`.
- Line 122: `_PROFILE_PREFIXES = ("us.", "global.", "eu.", "apac.", "arn:")`.
- Lines 247-272, `_resolve_inference_profile`: an id that starts with one of
  those prefixes is returned unchanged (line 270-271). So
  `us.anthropic.claude-haiku-4-5-20251001-v1:0` is sent to Bedrock as is. A
  bare id is mapped through `list_inference_profiles` (lines 129-168), which
  is a `bedrock` control-plane call.
- Line 314: region comes from `AWS_REGION`, default `us-east-1`.
- Line 323: `boto3.client("bedrock-runtime", region_name=region)`. EDSL passes
  no credentials; boto3's own resolution chain applies.
- Line 221: the call is the Converse API (`client.converse`). Lines 192-201:
  for Claude ids the `inferenceConfig` is `{maxTokens, temperature}` only
  (no `topP`). Lines 293-297: defaults `temperature 0.5`, `max_tokens 512`,
  `top_p 0.9`.
- Line 312: `_ = self.api_token` runs before every call "to check if env
  variables are set".

### Which env names EDSL reads for bedrock

- `edsl/base/enums.py` line 122: `BEDROCK: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]`.
- `edsl/key_management/key_lookup_builder.py` line 36:
  `service_to_api_keyname["bedrock"] = "AWS_SECRET_ACCESS_KEY"`; line 37:
  `service_to_api_id = {"bedrock": "AWS_ACCESS_KEY_ID"}`; line 49:
  `api_id_to_service = {"AWS_ACCESS_KEY_ID": "bedrock"}`.
- Lines 280-281 and 301-314: the builder scans every `os.environ` entry and
  keeps only names in `api_keyname_to_service` or `api_id_to_service`
  (`_entry_type`, lines 316-335). `AWS_BEARER_TOKEN_BEDROCK` is not in either
  map, so EDSL ignores it.
- Lines 240-243, `get_language_model_input`: if `key_data` has no `bedrock`
  entry it raises `MissingAPIKeyError("No key found for service 'bedrock'")`.
  `edsl/language_models/language_model.py` lines 465-482 (`api_token`) turns a
  missing entry into `LanguageModelValueError("No key found for service
  'bedrock'")`.

Consequence: with only `AWS_BEARER_TOKEN_BEDROCK` set, `Model(...)` constructs
(after boto3 is installed) but the first interview fails at
`aws_bedrock.py:312`. EDSL requires `AWS_SECRET_ACCESS_KEY` to be present with
a non-empty value. `AWS_ACCESS_KEY_ID` is optional for EDSL (it is only the
"id" entry). EDSL never hands either value to boto3.

### Does boto3 honour `AWS_BEARER_TOKEN_BEDROCK`, and from which version

- AWS doc, [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html),
  section "Use an API key": set `AWS_BEARER_TOKEN_BEDROCK`, then
  `boto3.client("bedrock-runtime", region_name="us-east-1").converse(...)`
  with no other credentials. Short-term keys last up to 12 hours; long-term
  keys "work only in the Region you generated it in" and are gated by the IAM
  action `bedrock:CallWithBearerToken`.
- botocore changelog `.changes/1.39.0.json`
  ([raw](https://raw.githubusercontent.com/boto/botocore/develop/.changes/1.39.0.json)),
  entry 21: feature, `bedrock`: "Add support for retrieving a Bearer token from
  environment variables to enable bearer authentication with Bedrock
  services." botocore 1.39.0 was uploaded to PyPI on 2025-06-30. boto3 1.39.0
  pairs with it.
- botocore 1.39.12 (CHANGELOG.rst): bugfix, `bedrock`: "Bearer auth is now
  only applied if the service model also includes the
  `smithy.api#httpBearerAuth` trait." Pin `boto3>=1.39.12`.
- How it works (botocore `develop` at the commit above):
  - `botocore/utils.py` lines 3630-3642: `get_token_from_environment(signing_name)`
    reads `AWS_BEARER_TOKEN_<SIGNING_NAME>`; for signing name `bedrock` that is
    `AWS_BEARER_TOKEN_BEDROCK`.
  - `botocore/handlers.py` lines 1381-1441, `_set_auth_scheme_preference_signer`,
    and lines 1443-1462, `_should_prefer_bearer_auth`: bearer is chosen when
    the signing name is in `get_bearer_auth_supported_services()` (line
    1465-1476, returns `{'bedrock'}`), the service model lists
    `smithy.api#httpBearerAuth`, the env token exists, and no
    `signature_version` or `auth_scheme_preference` was set in code. Lines
    1423-1433: "Prefer 'bearer' signature version if a bearer token is
    available ... This can override earlier resolution". So the token wins
    over `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` even when both are set.
  - `botocore/auth.py` lines 1131-1143 (`BearerAuth`, header
    `Authorization: Bearer <token>`), line 1205 (`'bearer': BearerAuth`), line
    1226 (`'smithy.api#httpBearerAuth': 'bearer'`).
  - Service models: `botocore/data/bedrock-runtime/2023-09-30/service-2.json`
    metadata `auth: ['aws.auth#sigv4', 'smithy.api#httpBearerAuth']`,
    `signingName: bedrock`; the `bedrock` control plane
    (`data/bedrock/2023-04-20/service-2.json`) has the same two schemes, so
    EDSL's `list_inference_profiles` calls also work with the key.
- EDSL's own floor is `boto3>=1.34.161,<2` (`edsl-1.0.9.dist-info/METADATA`
  line 36, extra `inference`), which predates bearer support. Pin boto3
  explicitly.

### What `Model("us.anthropic.claude-haiku-4-5-20251001-v1:0", service_name="bedrock")` needs

1. `boto3>=1.39.12` in `~/ep-venv` (brings `botocore`). Not installed today.
2. Env for the wrapper process: `AWS_BEARER_TOKEN_BEDROCK` (Doppler project
   `beca` does not list it today; it lists `AWS_ACCESS_KEY_ID` and
   `AWS_SECRET_ACCESS_KEY`), `AWS_REGION=us-east-1` (optional, it is the
   default), and `AWS_SECRET_ACCESS_KEY` with any non-empty value so EDSL's
   key lookup passes. Two workable layouts:
   - Bearer: `AWS_BEARER_TOKEN_BEDROCK` plus a placeholder
     `AWS_SECRET_ACCESS_KEY`; botocore uses the bearer token (handlers.py
     1423-1433) and never reads the placeholder.
   - SigV4: the real `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from
     Doppler, no bearer token; this is the path EDSL designed for.
3. The model id passes through unchanged (`_PROFILE_PREFIXES`). AWS's model
   card ([Claude Haiku 4.5 on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html))
   confirms `us.anthropic.claude-haiku-4-5-20251001-v1:0` is the US geo
   inference id, served from us-east-1, and that "the `bedrock-runtime`
   endpoint requires a geo or global inference profile ID. The bare model ID
   isn't supported for on-demand throughput."
4. The wrapper must pass `service="bedrock"`: `_model_for` (serve_ep.py
   1425-1426) adds `service_name` only when given, and the local model
   archive (`edsl/inference_services/default_models.py`, generated
   2025-08-12) does not list any Haiku 4.5 id, so service inference by name
   is not reliable.

## 2. OpenAI and Google services

### openai

- Env name: `OPENAI_API_KEY` (`edsl/base/enums.py` line 115;
  `open_ai_service.py` line 87 `_env_key_name_ = "OPENAI_API_KEY"`). The same
  key is also registered for `openai_v2` (`key_lookup_builder.py` 398-421).
- SDK: `openai[aiohttp]>=2.44.0,<3.0.0` (METADATA line 49), imported lazily
  (`open_ai_service.py` lines 24-28), so `Model("gpt-4o-mini",
  service_name="openai")` constructs today but any call fails until the SDK is
  installed. API used: `client.chat.completions.create` (line 367).
- Default model: `EDSL_DEFAULT_MODEL` defaults to `gpt-4o`
  (`edsl/config/config_class.py` lines 69-72) and `Model()` with no name
  hard-wires `service_name="openai"` (`edsl/language_models/model.py` lines
  136-141). The wrapper's own default is `test` (serve_ep.py line 39), so
  EDSL's default only matters if a caller passes `model=""`.
- Model ids EDSL knows offline (`default_models.py`, `openai` list): includes
  `gpt-4o`, `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-5`,
  `gpt-5-mini`, `gpt-5-nano`, `o3`, `o4-mini`.

### google

- Env name: `GOOGLE_API_KEY` only (`edsl/base/enums.py` line 117;
  `google_service.py` line 73 reads `os.environ.get("GOOGLE_API_KEY")`; the
  client is built with `genai.Client(api_key=self.api_token)` at line 169).
  `GEMINI_API_KEY` is never read by EDSL, so the Doppler value must be
  exported under the name `GOOGLE_API_KEY` for the wrapper process.
- SDK: `google-genai>=1.30.0,<2.0.0` (METADATA line 40), imported lazily
  (`google_service.py` lines 13-33). API used:
  `client.aio.models.generate_content` (line 275).
- Default model: `create_model(model_name="gemini-pro")` (line 85), a legacy
  name; pass `gemini-2.5-flash` explicitly. Offline list (`default_models.py`,
  `google`): includes `gemini-2.5-flash`, `gemini-2.5-flash-lite`,
  `gemini-2.5-pro`.
- Parameters (lines 102-108): `maxOutputTokens 2048`, `thinking_budget None`.
  Gemini 2.5 Flash thinks by default, and Google bills thinking tokens at the
  output rate ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
  says output price includes thinking tokens). EDSL's estimator does not
  count them (see section 3), so the Gemini estimate is a floor.

## 3. Can `estimate_cost` price Bedrock, OpenAI and Gemini

Yes, from Expected Parrot's price list, and the remote-inference flags do not
affect it.

- `jobs/jobs.py` line 571-576: `Jobs.estimate_job_cost` delegates to
  `JobsPrompts.estimate_job_cost`.
- `jobs/jobs_pricing_estimation.py` lines 142-149: `price_lookup` calls
  `Coop().fetch_prices()`; lines 21-22 and 51-59: `CHARS_PER_TOKEN = 4`,
  `OUTPUT_TOKENS_PER_INPUT_TOKEN = 0.75`, input tokens = (user + system
  prompt chars) // 4, output tokens = ceil(0.75 * input).
- `coop/price_fetcher.py` lines 104-160: memory cache, then disk cache
  `~/.cache/edsl/price_cache.json` with a 24 h TTL
  (`EDSL_PRICE_CACHE_TTL_SECONDS`), then `GET
  {EXPECTED_PARROT_URL}/api/v0/prices` with `Authorization: Bearer None` when
  `EXPECTED_PARROT_API_KEY` is unset (lines 125-131). A network failure
  returns `{}` (lines 158-159).
- `language_models/price_manager.py` lines 31-45: a model missing from the
  table falls back to the service's highest price, then to $1.00 per million
  tokens for both input and output. So a wrong or missing model id does not
  raise; it silently prices at the fallback.
- `disable_remote_inference` and `disable_remote_cache` are `Jobs.run`
  arguments (serve_ep.py 822-824); the price fetch is a separate anonymous GET.
  Evidence: the wrapper process has no `EXPECTED_PARROT_API_KEY`, and agent-dev
  holds `~/.cache/edsl/price_cache.json` created 2026-11-01T17:13 with 869
  entries.

Entries present in that cache (USD per million tokens, input / output):

| key | input | output |
| --- | --- | --- |
| `bedrock\|us.anthropic.claude-haiku-4-5-20251001-v1:0` | 1.10 | 5.50 |
| `bedrock\|global.anthropic.claude-haiku-4-5-20251001-v1:0` | 1.00 | 5.00 |
| `openai\|gpt-4o-mini` | 0.15 | 0.60 |
| `openai\|gpt-4o` | 2.50 | 10.00 |
| `google\|gemini-2.5-flash` | 0.30 | 2.50 |
| `google\|gemini-2.5-flash-lite` | 0.10 | 0.40 |

`Model.available()` (`model.py` lines 340-400) lists model names per service
from sources `coop_working, coop, local, default_models`; it does not carry
prices. For `bedrock` the `local` source calls `list_inference_profiles` via
boto3 (`aws_bedrock.py` 53-114) and so needs boto3 and credentials.

## 4. Pilot cost on each candidate

### Published prices used (checked 2026-11-01)

- Claude Haiku 4.5: $1 / MTok input, $5 / MTok output
  ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
  model table). Same page, "Regional and multi-region endpoint pricing":
  "Regional and multi-region endpoints include a 10 percent premium over
  global endpoints", applying to Haiku 4.5 on Bedrock. The `us.` geo profile is
  a regional endpoint, so $1.10 / $5.50; `global.` is $1.00 / $5.00. This
  matches EDSL's table above. The AWS pricing page renders its Anthropic table
  client-side and could not be read as text; AWS's model card says the model
  is billed through AWS Marketplace at the Bedrock pricing page.
- gpt-4o-mini: $0.15 / $0.60; gpt-4o: $2.50 / $10.00
  ([OpenAI pricing](https://developers.openai.com/api/docs/pricing), standard tier).
- gemini-2.5-flash: $0.30 / $2.50 paid tier; gemini-2.5-flash-lite $0.10 /
  $0.40 ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)).
  A free tier exists for both.

### Token counts from EDSL's estimator (run on agent-dev, no model called)

Built with the wrapper's own libraries (`edsl`, `ep_conjoint`) and priced with
`job.estimate_job_cost()`:

- Pilot: 4 agents (one-line personas) x 2 scenarios x 1 multiple-choice
  question = 8 interviews, 8 prompts. Estimated 1,868 input tokens and 1,404
  output tokens in total (about 234 input and 176 output per prompt).
- Conjoint: `ep_conjoint.generate_design` with 3 attributes, 4 tasks per
  version, 3 profiles per task, 2 versions; 20 respondents. The wrapper's
  `run_survey` crosses respondents with version scenarios (serve_ep.py
  720-725), so 20 respondents x 2 versions = 40 interviews x 4 questions =
  160 prompts. Estimated 30,040 input and 22,560 output tokens. A design that
  shows each respondent one version only is 20 interviews, 80 prompts, half
  of every figure below.

EDSL's output assumption (0.75 x input) is generous for multiple-choice
answers, so the real bill is likely lower, except for Gemini 2.5 Flash where
uncounted thinking tokens push the other way.

### Arithmetic (cost = tokens x price / 1,000,000)

Pilot, 1,868 in / 1,404 out:

| Candidate | Input | Output | Total |
| --- | --- | --- | --- |
| Haiku 4.5, `us.` profile ($1.10 / $5.50) | 1,868 x 1.10 = $0.00205 | 1,404 x 5.50 = $0.00772 | **$0.0098** |
| Haiku 4.5, `global.` profile ($1.00 / $5.00) | $0.00187 | $0.00702 | $0.0089 |
| gpt-4o-mini ($0.15 / $0.60) | 1,868 x 0.15 = $0.00028 | 1,404 x 0.60 = $0.00084 | **$0.0011** (EDSL: $0.0011226) |
| gpt-4o, EDSL default ($2.50 / $10) | $0.00467 | $0.01404 | $0.0187 |
| gemini-2.5-flash ($0.30 / $2.50) | 1,868 x 0.30 = $0.00056 | 1,404 x 2.50 = $0.00351 | **$0.0041** (EDSL: $0.0040704) |

Conjoint, 40 interviews, 30,040 in / 22,560 out:

| Candidate | Input | Output | Total |
| --- | --- | --- | --- |
| Haiku 4.5, `us.` profile | 30,040 x 1.10 = $0.0330 | 22,560 x 5.50 = $0.1241 | **$0.157** |
| Haiku 4.5, `global.` profile | $0.0300 | $0.1128 | $0.143 |
| gpt-4o-mini | 30,040 x 0.15 = $0.0045 | 22,560 x 0.60 = $0.0135 | **$0.018** (EDSL: $0.018042) |
| gpt-4o | $0.0751 | $0.2256 | $0.301 |
| gemini-2.5-flash | 30,040 x 0.30 = $0.0090 | 22,560 x 2.50 = $0.0564 | **$0.065** (EDSL: $0.065412) |

Every candidate runs the pilot for about a cent and the conjoint for well
under a dollar. Price is not the deciding factor between them; credentials
and SDK installation are.

## 5. What has to change on agent-dev (not done in this ticket)

1. `~/ep-venv`: install `boto3>=1.39.12`, `openai[aiohttp]>=2.44,<3` and
   `google-genai>=1.30,<2` (or `edsl[inference]==1.0.9`, which also pulls
   anthropic, azure-ai-inference, groq, mistralai and a boto3 floor that is
   too low). Record the pins in `scripts/subconscious/ep-requirements.txt`.
2. Wrapper process environment, by candidate:
   - Bedrock: `AWS_BEARER_TOKEN_BEDROCK` (new secret; generate a long-term
     key in us-east-1), a non-empty `AWS_SECRET_ACCESS_KEY` so EDSL's key
     lookup passes, `AWS_REGION=us-east-1`. Or the Doppler
     `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair without a bearer token.
   - OpenAI: `OPENAI_API_KEY` (in Doppler `beca`).
   - Gemini: Doppler's `GEMINI_API_KEY` exported as `GOOGLE_API_KEY`.
3. Callers pass `service="bedrock" | "openai" | "google"` with the model id to
   `estimate_cost` and `run_survey`; the wrapper already forwards it
   (`_model_for`).
4. Run `estimate_cost` before `run_survey` and compare the model id against
   the EDSL price table, because an unknown id prices at the $1/$1 fallback
   instead of failing.
