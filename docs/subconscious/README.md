# Burn 2.0 on native Onyx

[Open Burn](https://burn.subconscious.ai/app?agentId=5). Vercel serves the frontend; AWS serves the native backend at `https://api.dev.subconscious.ai/burn2`. Start login on this canonical address. Branch previews redirect to the registered login origin and do not prove their own authenticated customer path.

## Current interview-to-model UAT, September 19 UTC

The canonical Burn address serves the interview-to-model candidate from draft
[PR #31 — carry interview and research into the model](https://github.com/Subconscious-ai/onyx/pull/31).
The model receiver is the paired
[PR #575 — populate and retain the business model](https://github.com/Subconscious-ai/causl-kb/pull/575)
at `https://causl-interview-model-subconcious.vercel.app/dashboard/burn-import`.
Its allowed Beca origin is `https://burn.subconscious.ai`. Keep both settings paired.
The ready model action is visible directly in the conversation. Review and save
remain explicit. These feature branches remain drafts; the AWS backend was not changed.

Fresh native Auth0 login, a new interview, automatic saved brief, the actual model
button/window handshake, AWS proposal, Postgres save/readback, grid reload, and
five canonical journey-source readbacks passed. No handoff file was uploaded in
that browser run. The synthetic account has no PDL match; real PDL/research success
is covered separately by the cold-discovery runs below. causl-kb still has a
separate Clerk login. Its synthetic QA sign-in used the supported Clerk ticket
flow after ordinary fresh-device login requested an email code. This does not
establish one-login SSO or a 60-second login-to-saved-model guarantee.

Onyx PRs #10, #20 and #23 are merged. The [prototype record](prototype-plan.md) preserves earlier paired model evidence and generation limits. Onyx source publication does not establish the merge or deployment of a causl-kb counterpart.

The customer-facing interview is Beca. The current interface still exposes an Actions menu and separate experiment personas. See [the capability review](beca-capabilities.md) for the existing integration.

## Product decision and next work

The September 17 decision is one assistant and one conversation. The assistant selects research, retrieval, calculation, model and experiment tools through native Onyx. Executives should not select workflow cards or specialist agents. Results remain reviewable artifacts in the conversation.

[Issue #24](https://github.com/Subconscious-ai/onyx/issues/24) is the active plan for this simplification and editable company context. The earlier action-card proposal is superseded. [Draft PR #26](https://github.com/Subconscious-ai/onyx/pull/26) removes the Actions menu and specialist navigation. It also adds a revision-checked profile editor, a native profile tool, and separate provider/correction records. These changes are not a production release. Hosted acceptance remains outstanding. Preserve native permissions and explicit approval for paid experiment execution.

Profile edits use authenticated `PATCH /chat/executive-profile`; native authentication supplies the caller and `WRITE_CHAT` permission. The request cannot select another owner. Enrichment writes only the provider record. Explicit corrections and each edit revision use the existing native key-value store. A company change drops unrelated company fields and excludes old research. Accepted shared company records still belong in causl-kb.

The `company_profile` tool uses that same correction function. Native construction supplies the caller; model arguments cannot select an owner. Incognito writes are refused. Research failure does not erase a successful correction. The tool needs its native database seed, explicit persona assignment, and the stored prompt update before use. The deployed database is behind this checkout's migration graph. Do not run all upstream migrations to seed one tool.

The September 18 candidate check used real Bedrock GPT OSS and synthetic Postgres profiles. Two conversations saved and reloaded exact corrections. One recovered from a missing-revision refusal. Test records were removed. This proves model/tool/storage behavior, not hosted authentication or the model handoff. Re-run `scripts/subconscious/check_profile_tool_bedrock.py` only in the native runtime; it makes paid Bedrock calls and cleans its synthetic keys. The tool boundary tests are in `backend/tests/unit/tools/test_company_profile_tool.py`.

The September 18 runtime probe found that the native encryption helper returns plaintext bytes unchanged. The storage class name does not establish encryption. Disk encryption was not checked. Issue #21 tracks this deployment boundary alongside caller-scoped access. Do not claim application-level encryption from the table name.

## Historical release boundary, September 17

Production deployment `dpl_FdNmDXw9UPnsPiSRqhiSRRC3Lgcy` is Ready from main `fc9c911eb9708d0ef6706f61f7a6981690fc88f1`. The issue #21 receipt records fresh Auth0 sign-in, recovery of the original account, and a saved interview surviving reload. Login continues on the registered review origin.

[Issue #21](https://github.com/Subconscious-ai/onyx/issues/21) tracks access and hosting acceptance. The current paired model evidence is above. Existing-account success is not enterprise-isolation proof.

## Architecture

- Vercel serves the existing Next.js interface and forwards authenticated streaming requests.
- Native Onyx on AWS owns accounts, conversations, tool permissions, source search, and working briefs in Postgres 15. AWS Bedrock supplies conversation and background extraction models.
- GPT Researcher runs as a private MCP container with AWS and Exa. Native Onyx retrieves the existing MBB corpus; no corpus re-import or second analyst framework is required.
- PDL context comes from the authenticated account and remains an unconfirmed professional match. Enrichment never grants company access.
- Background extraction validates journey, OKR and model structure against saved executive messages. Unknown inputs remain unknown. Public references and hypotheses never silently become executive facts.
- causl-kb owns accepted market ontology and organization-scoped model persistence. The browser handoff binds the exact origin and nonce; Onyx holds no causl-kb administrator credential.
- The interview-to-model candidate sends the dossier and public research in optional `businessContext`, separate from executive messages. It excludes worker identifiers and bounds report size. Incomplete research carries status only. Deploy the matching causl-kb receiver first; older receivers reject this field. Pair the receiver's `BURN_ONYX_ORIGIN` with Beca and Beca's `NEXT_PUBLIC_BURN_MODEL_WORKSPACE` with the review page. Model previews require their existing AWS configuration too.
- The existing model compiler owns executable algebra. Interview equations are advisory; additional required quantities stay explicit unknowns. The paired model window returns bounded saved-model context and actual calculation receipts through native chat's `additional_context`, scoped to the current Beca conversation. Preview and saved scenario states never imply an experiment launch.

## Start here

- [Historical Beca prototype QA](prototype-plan.md): public research, background briefs, saved-model recovery and retained failures on the recorded artifacts.

- [Hosting, recovery and deployment lessons](durable-hosting.md): native Compose, rootless execution, encrypted Vercel Blob backups, restart and restore evidence.
- [Interview operation and QA](burn2-operations.md): source ownership, model handoff, configuration and acceptance checks.
- [Executive research and scope](executive-interviewer.md): retained MBB source-use findings and consulting guidance.
- [Earlier research evaluations](research-model-qa.md): historical failures, not a current release pass.

The active Burn agent is `5`, conversation model `8` (GPT OSS 120B), preparation model `5` (DeepSeek v3.2), all in the migrated native database. Resolve IDs again for another database. Ordinary conversation streaming remains separate from background preparation.

## Remaining product work

The historical [issue #6](https://github.com/Subconscious-ai/onyx/issues/6) and prototype record describe intermittent structured-brief failures. Closing a historical ticket does not establish reliable first-attempt generation. The active product plan is #24; access and release acceptance remain in #21.

Cross-application SSO remains causl-kb #450. Community Edition is not evidence of shared-instance enterprise isolation. Rehoboam execution, measured operating outcomes, and multi-host failover are outside the hosted release. Native Onyx and causl-kb still require separate authenticated sessions.

## End-to-end acceptance

[Run the real-browser acceptance suite](end-to-end-acceptance.md) for three executive businesses, model persistence, the Beca entry point and cross-company read/search checks. Missing sessions or fixtures block acceptance; they never count as passes. See [issue #27](https://github.com/Subconscious-ai/onyx/issues/27) for current execution evidence.

## Development

### Fresh discovery acceptance

Use `scripts/subconscious/check_fresh_discovery.py` inside the running native API
environment with `--user-id UUID --output-dir PRIVATE_DIRECTORY
--reset-retained-context`. This is an opt-in live provider test: it backs up and
clears only that account's retained profile/research keys, then calls the existing
PDL preparation handler, Celery research job and research read handler. It leaves
the new results available to the application. Never use it to interrupt an active
interview or research job. Backups and full dossiers remain private, outside Git.

The gate requires empty starting caches, a new PDL timestamp, a new research ID
and timestamp, ready results, at least two source URLs and substantive report
content within 60 seconds. Run its rejection checks locally with
`PYTHONPATH=scripts/subconscious python3 -m unittest scripts/subconscious/test_fresh_discovery.py`.

Three consecutive live runs on September 19, 2026 UTC took **22.997, 21.176 and
13.810 seconds**, with **8, 7 and 7 sources** respectively. The last run uses the
checked-in probe and the existing browser's two-second polling interval. Both
source records were newly fetched, not retained from an earlier interview. The
fresh results also passed the actual `modelBusinessContext` producer and
causl-kb `parseOnyxHandoff` receiver with the synthetic interview's three journey
states and two transitions. The live browser model acceptance then passed AWS
generation, exact Postgres model readback, replay rejection, grid reopening,
all seven public URLs, and five canonical journey-source readbacks. It used the
actual producer function and a reviewed file import, not a fresh native chat
button click. See [#430 — deliver interview context to the first model](https://github.com/Subconscious-ai/causl-kb/issues/430),
[#575 — preserve that evidence in the model](https://github.com/Subconscious-ai/causl-kb/pull/575)
and [#31 — carry dossier and research from Beca](https://github.com/Subconscious-ai/onyx/pull/31).

This measures warm-service, cold-data discovery from the native preparation
handler until the research read handler returns complete context. It excludes
login, server boot, browser transport and model generation. Three successful runs
prove the exercised path; they are not a provider latency SLA. The existing
runtime met the target without new queues, orchestration or provider tuning.

The Subconscious fork is `Subconscious-ai/onyx`. The existing local `origin` remote points upstream; publish Burn changes through `subconscious`. Never push Burn-specific changes to `onyx-dot-app/onyx`.

Reuse `scripts/subconscious/test_*.py`, the executive Jest tests and `eval_interview.py` for focused proof. Use synthetic sessions for writes and preserve customer transcripts. Credentials, corpus files, browser state, database dumps and encryption keys stay outside Git.

## Automatic frontend releases

The existing `onyx-executive` Vercel project connects to `Subconscious-ai/onyx`, with `web` as the root directory.
`web/vercel.json` enables native Git builds for `codex/**` previews. Production and other branches remain disabled.
The rules apply after the configuration reaches each branch. No extra GitHub deployment token or release workflow is required.

Push reviewed frontend changes to a Burn branch. Vercel builds the commit and updates the branch preview after success.
Use the branch URL from the Vercel deployment record. A failed build leaves the last successful branch preview available.
Production backend routing and `WEB_DOMAIN` were configured and deployed on September 17. The checked-in configuration still disables automatic `main` builds. The production deployment was a separate redeploy; a merge alone does not publish the next version.
Verify the serving source and environment after publication. Full model-handoff acceptance remains separate from frontend build success.

The `burn.subconscious.ai` cutover remains tracked in #21. Use the verified Vercel entry above until domain rollout is complete.
The current registered customer origin is `https://burn.subconscious.ai`; alias promotion remains manual. Older branch aliases in historical receipts are not the current UAT entry point.
Native Git builds update branch aliases, not the manually assigned shared review alias.

Vercel releases only the frontend and API forwarding. AWS backend images, data, backups and service restarts remain separate.
Use [the hosting procedure](durable-hosting.md) for backend changes. Never restart desktop writers after the AWS migration.
Preserve the exact handoff origins, authenticated access and private configuration during release.

## Lessons for the next change

- Inspect native tool assignments and prompts before adding routing code. Prompts live in Postgres; frontend releases do not update prompts.
- Start OAuth on the registered callback origin. Host-only state and PKCE cookies cannot follow a different hostname.
- An existing member can pass invite-only admission without an invitation. Identify the actual Auth0 identity before changing admission.
- Native API health, a rendered login page and a Vercel Ready state prove different boundaries. Test the customer path separately.
- PR #23 browser CI never started: three image jobs lacked runners for 24 hours. Preserve that limitation; skipped tests are not passes.
- Native Onyx owns conversations and draft context. causl-kb owns accepted ontology and models. Preserve sources and executive corrections.
- Old plans below are historical evidence. Start new work from fork main and the active issue, not a retired worktree.
