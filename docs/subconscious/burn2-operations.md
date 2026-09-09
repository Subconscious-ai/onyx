# Burn 2.0 preview

Burn 2.0 interviews an executive for customer behavior transitions and measurable OKRs. The output is a sourced model brief for a private Guesstimate draft. Ontology coverage supports the business model; ontology completion is not the interview objective.

## Ownership and persistence

- Native Onyx owns chat authentication, saved conversations, streaming, tools and AWS inference. Ordinary turns have no second extraction call.
- **Prepare saved model brief** reads the owned native Postgres conversation, extracts a version-two brief, validates source quotes and identifiers, and saves the brief suffix in the latest assistant row. Original executive messages and spoken answers are preserved. A concurrent edit invalidates the save. A newer executive answer makes the brief stale.
- **Review in Guesstimate** transfers a reviewed conversation through an origin/nonce-bound browser handoff, with a downloaded JSON fallback. Onyx does not hold a causl-kb administrator credential.
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
3. Select **OKRs & model → Prepare saved model brief**. Reload the conversation. Verify the source labels, goal, deadline, customer states, proposed transitions and material gaps.
4. Select **Review in Guesstimate**. Sign into causl-kb, choose the organization market and review the imported brief. The downloaded file supports an explicit import if browser handoff is unavailable.
5. Select only source-supported journey statements intended for accepted market memory. Prepare the model, review the native grid, and explicitly save. Reopen the model and verify persistence. Unknown inputs must remain unknown; unsupported coefficients and invalid units must never become a usable forecast.

## Evidence and release boundary

Local synthetic tests exercised three industries, short unknown/correction turns, the real AWS preparation action, saved conversation readback, native owner/CAS denial, PostgreSQL tenant isolation, and a real authenticated causl-kb save/reopen. Source grounding and formula checks have dedicated regression tests. The latest core conversation replay passed nine of nine turns; observed first-content latency was approximately 0.9–3.1 seconds, not an SLA.

Research/calculation stress tests found provider-dependent failures even when tool selection was requested: a GPT Researcher request was skipped in one GPT OSS replay; a Mistral comparison produced a Python execution error. Successful real GPT Researcher and Python receipts exist across multiple cases. The stress runs are not evidence of universal agent reliability. Explicit model preparation fails closed and leaves the saved conversation unchanged on validation/provider failure.

The preview is not a production readiness claim. The native backend still depends on the existing local host and tunnel. Production needs durable hosting, backups/restore proof, secure object-store credentials, organization access/SSO design and operational monitoring. Community Edition licensing does not establish shared-instance enterprise isolation. The native Guesstimate chat assistant remains unconnected in the pinned preview; causl-kb's existing model proposal service prepares the draft. Rehoboam execution and measured operating outcomes remain outside this preview.

No merge before executive QA. Draft PRs: Onyx #2 and causl-kb #508; causl-kb issue #507 owns the model handoff.
