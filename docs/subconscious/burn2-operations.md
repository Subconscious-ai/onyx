# Burn 2.0 operations

Burn 2.0 interviews an executive for customer behavior transitions and measurable OKRs. The output is a sourced model brief for a private Guesstimate draft. Ontology coverage supports the business model; ontology completion is not the interview objective.

## Ownership and persistence

- Native Onyx owns chat authentication, saved conversations, streaming, tools and AWS inference. Ordinary turns have no second extraction call.
- Automatic background preparation after a completed answer reads the owned native Postgres conversation, extracts a version-two brief, validates source quotes and identifiers, and saves the brief suffix in the latest assistant row. Original executive messages and spoken answers are preserved. A concurrent edit invalidates the save. A newer executive answer makes the brief stale.
- **Open business model** transfers a reviewed conversation through an origin/nonce-bound browser handoff, with a downloaded JSON fallback. Onyx does not hold a causl-kb administrator credential.
- causl-kb derives organization authority from the authenticated session. The private model and individually selected supported journey states/transitions commit through the existing tenant transaction and ontology safe door. Draft relationships and incomplete OKRs do not become accepted facts.
- Native Guesstimate supplies editing, unit checks and calculation. Unknown values remain empty. An executable symbolic structure is not a validated forecast or a measured causal effect.

## Reproduce the backend overlay

The Dockerfile pins upstream Onyx v4.7.0 by digest. The overlay adds a feature-gated preparation endpoint and reuses native forced-tool selection for explicit research/Python requests. No new database or migration is required.

```bash
bash scripts/subconscious/build_burn2_backend.sh onyx-burn2:preview
BURN2_BRIEF_MODEL_CONFIGURATION_ID=<existing-bedrock-model-id> docker compose \
  -p onyx -f <native-compose-file> -f docs/subconscious/burn2-compose.yml \
  up -d --no-deps api_server
```

Model IDs belong to the target Onyx database. The preview uses GPT OSS 120B on Bedrock for conversation and DeepSeek v3.2 on Bedrock for explicit preparation. The preview model IDs are 8 and 5 respectively; model IDs must be resolved afresh for another instance. No Anthropic-direct, Databricks or OpenAI-direct billing is configured by this change.

Install the rubric with `scripts/subconscious/configure_executive.py`, selecting the existing AWS provider/model and existing native tool IDs. `--replace-tools` limits the persona to the supplied tools. Existing personas remain available. Credentials stay in a private cookie jar.

Set the Onyx frontend build variable `NEXT_PUBLIC_BURN_MODEL_WORKSPACE` to the paired causl-kb preview's `/dashboard/burn-import` URL. Configure the causl-kb server's `BURN_ONYX_ORIGIN` with the exact Onyx origin. No wildcard origins. Authentication remains required in both applications.

## QA path

1. Open `/app/executive` and select Burn 2.0. State a product, business objective, target, deadline and known customer decisions. Mark unavailable operating values unknown.
2. Correct a target or state an unknown answer. Verify that the interview incorporates the correction without repeating the same question or inventing a baseline.
3. Select **OKRs & model**. Reload the conversation. Verify the source labels, goal, deadline, customer states, proposed transitions and material gaps.
4. Select **Open business model**. Sign into causl-kb, choose the organization market and review the imported brief. The downloaded file supports an explicit import if browser handoff is unavailable.
5. Select only source-supported journey statements intended for accepted market memory. Prepare the model, review the native grid, and explicitly save. Reopen the model and verify persistence. Unknown inputs must remain unknown; unsupported coefficients and invalid units must never become a usable forecast.

## Evidence and release boundary

Local synthetic tests exercised three industries, short unknown/correction turns, the real AWS preparation action, saved conversation readback, native owner/CAS denial, PostgreSQL tenant isolation, and a real authenticated causl-kb save/reopen. Source grounding and formula checks have dedicated regression tests. The latest core conversation replay passed nine of nine turns; observed first-content latency was approximately 0.9–3.1 seconds, not an SLA.

Research/calculation stress tests found provider-dependent failures even when tool selection was requested: a GPT Researcher request was skipped in one GPT OSS replay; a Mistral comparison produced a Python execution error. Successful real GPT Researcher and Python receipts exist across multiple cases. The stress runs are not evidence of universal agent reliability. Explicit model preparation fails closed and leaves the saved conversation unchanged on validation/provider failure.

The preview is not a production readiness claim. The native backend now runs on AWS behind the stable Vercel application. Encrypted private Vercel Blob backups have restore proof; object-store credentials were rotated for the cloud stack. See [durable hosting](durable-hosting.md). Organization access/SSO and wider operational monitoring remain separate work. Community Edition licensing does not establish shared-instance enterprise isolation. The native Guesstimate chat assistant remains unconnected in the pinned preview; causl-kb's existing model proposal service prepares the draft. Rehoboam execution and measured operating outcomes remain outside this preview.

Merge authorized during the September 11 closeout. causl-kb #508 is merged and #507 is closed. Onyx #2 contains the interviewer; #5 contains durable hosting. Intermittent model-brief preparation remains tracked in Onyx #6.


## Executive QA corrections, September 10

The working brief now updates after completed answers while the interview remains open. Live packet text and saved messages use the same reader. A new answer supersedes an in-flight extraction; a distributed lock prevents duplicate preparation. Saved metadata returns directly to the UI, without a page reload. The bottom action remains visible. Failed preparation retains the previous draft and exposes one retry action. Background generation is bounded and resumes from saved conversation state when the interview reopens; no unattended infinite research loop exists.

The roster reuses market-burn portraits. Sarah owns customer decisions, Frankie owns objectives and economic drivers, Mei owns alternatives and contradictions, and Jerry owns a short fifth-answer roast. The native system placeholder is excluded from turn counts. Explicit unknown answers remain in bounded active context. The live revised replay preserved unknown baselines, included fifth-answer humor, and retrieved an MBB source. Raw model prose still emitted em dashes; the display filter normalizes prose while preserving code and saved evidence. Humor remains generative, so broad style reliability is not guaranteed.

PDL professional context uses the authenticated account email, one daily provider lookup, and user-bound native encrypted Postgres storage. Only name, professional role, company, industry and website are retained. Source matches remain fallible context. Email verification does not authorize company access through this lookup. The profile remains an unconfirmed provider match, never proof of identity or organization membership. Contact lists, birth dates and sensitive profile fields are excluded.

The existing indexed mbb-casebook corpus is reachable through native internal_search. A live query returned original McKinsey and BCG sources. analyst-agent contributes the existing Onyx retrieval/setup pattern, not another running agent. Search permissions remain native. Explicit internal-case requests use the enabled native search tool. The GitHub corpus connector reports completed-with-errors; the four existing file corpus connectors report success.

Single sign-on remains blocked on the existing Auth0 organization cutover in causl-kb #450. Onyx and causl-kb authentication remain separate. No email-derived organization mapping, shared administrator bridge, or fabricated email verification was added. Market acceptance still requires an authenticated organization review. Journey/OKR drafts are saved in native Onyx Postgres; accepted market records remain causl-kb-owned.
