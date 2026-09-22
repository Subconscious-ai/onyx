# Burn 2.0 on native Onyx

[Open Burn](https://burn.subconscious.ai/app). Vercel serves the frontend; AWS serves the native backend at `https://api.dev.subconscious.ai/burn2`. Login uses the canonical Burn hostname and existing Subconscious Auth0 account.

Onyx PRs #10, #20 and #23 are merged. The [prototype record](prototype-plan.md) preserves earlier paired model evidence and generation limits. Onyx source publication does not establish the merge or deployment of a causl-kb counterpart.

The customer-facing interview is Beca. The current interface still exposes an Actions menu and separate experiment personas. See [the capability review](beca-capabilities.md) for the existing integration.

## Product decision and next work

The September 17 decision is one assistant and one conversation. The assistant selects research, retrieval, calculation, model and experiment tools through native Onyx. Executives should not select workflow cards or specialist agents. Results remain reviewable artifacts in the conversation.

[Issue #24](https://github.com/Subconscious-ai/onyx/issues/24) records the completed source-level simplification and editable company context. The earlier action-card proposal is superseded. [Merged PR #26](https://github.com/Subconscious-ai/onyx/pull/26) removes the Actions menu and specialist navigation. It also adds a revision-checked profile editor, a native profile tool, and separate provider/correction records. These changes are not a production release. Hosted acceptance remains outstanding. Preserve native permissions and explicit approval for paid experiment execution.

Profile edits use authenticated `PATCH /chat/executive-profile`; native authentication supplies the caller and `WRITE_CHAT` permission. The request cannot select another owner. Enrichment writes only the provider record. Explicit corrections and each edit revision use the existing native key-value store. A company change drops unrelated company fields and excludes old research. Accepted shared company records still belong in causl-kb.

The `company_profile` tool uses that same correction function. Native construction supplies the caller; model arguments cannot select an owner. Incognito writes are refused. Research failure does not erase a successful correction. The tool needs its native database seed, explicit persona assignment, and the stored prompt update before use. The deployed database is behind this checkout's migration graph. Do not run all upstream migrations to seed one tool.

The September 18 candidate check used real Bedrock GPT OSS and synthetic Postgres profiles. Two conversations saved and reloaded exact corrections. One recovered from a missing-revision refusal. Test records were removed. This proves model/tool/storage behavior, not hosted authentication or the model handoff. Re-run `scripts/subconscious/check_profile_tool_bedrock.py` only in the native runtime; it makes paid Bedrock calls and cleans its synthetic keys. The tool boundary tests are in `backend/tests/unit/tools/test_company_profile_tool.py`.

The September 18 runtime probe found that the native encryption helper returns plaintext bytes unchanged. The storage class name does not establish encryption. Disk encryption was not checked. Issue #21 tracks this deployment boundary alongside caller-scoped access. Do not claim application-level encryption from the table name.

## Verified release boundary, September 18

Production deployment `dpl_6K4cZtUowRRPyWxFaLjRWrTyQxKr` is Ready from unchanged source `fc9c911eb9708d0ef6706f61f7a6981690fc88f1`. The issue #21 receipt records fresh canonical-domain Auth0 sign-in and recovery of the saved Coffee Delivery Frequency Decision conversation. The Auth0 client now permits Refresh Token alongside Authorization Code; actual token renewal still needs proof.

The existing pinned backend image now runs its native MCP service behind `/api/mcp/`. Use a native personal access token for the signed-in user, created in Settings → Accounts & Access. This endpoint uses native Onyx permissions; it is not a new Auth0 OAuth server. Local gateway checks proved health and rejection of missing/invalid tokens on both slash variants. Positive public initialize/list/tool-call and cross-user denial remain outstanding.

[Issue #21](https://github.com/Subconscious-ai/onyx/issues/21) remains open for refresh execution, cross-account isolation, positive MCP acceptance and monitoring evidence. A complete interview-to-model save/reopen run also remains outstanding. Existing-account success is not enterprise-isolation proof.


## Architecture

- Vercel serves the existing Next.js interface and forwards authenticated streaming requests.
- Native Onyx on AWS owns accounts, conversations, tool permissions, source search, and working briefs in Postgres 15. AWS Bedrock supplies conversation and background extraction models.
- GPT Researcher runs as a private MCP container with AWS and Exa. Native Onyx retrieves the existing MBB corpus; no corpus re-import or second analyst framework is required.
- PDL context comes from the authenticated account and remains an unconfirmed professional match. Enrichment never grants company access.
- Background extraction validates journey, OKR and model structure against saved executive messages. Unknown inputs remain unknown. Public references and hypotheses never silently become executive facts.
- causl-kb owns accepted market ontology and organization-scoped model persistence. The browser handoff binds the exact origin and nonce; Onyx holds no causl-kb administrator credential.
- The existing model compiler owns executable algebra. Interview equations are advisory; additional required quantities stay explicit unknowns. The paired model window returns bounded saved-model context and actual calculation receipts through native chat's `additional_context`, scoped to the current Beca conversation. Preview and saved scenario states never imply an experiment launch.

## Start here

- [Historical Beca prototype QA](prototype-plan.md): public research, background briefs, saved-model recovery and retained failures on the recorded artifacts.

- [Hosting, recovery and deployment lessons](durable-hosting.md): native Compose, rootless execution, encrypted Vercel Blob backups, restart and restore evidence.
- [Interview operation and QA](burn2-operations.md): source ownership, model handoff, configuration and acceptance checks.
- [Executive research and scope](executive-interviewer.md): retained MBB source-use findings and consulting guidance.
- [Earlier research evaluations](research-model-qa.md): historical failures, not a current release pass.

The active Burn agent is `5`, conversation model `8` (GPT OSS 120B), preparation model `5` (DeepSeek v3.2), all in the migrated native database. Resolve IDs again for another database. Ordinary conversation streaming remains separate from background preparation.

## Remaining product work

The historical [issue #6](https://github.com/Subconscious-ai/onyx/issues/6) and prototype record describe intermittent structured-brief failures. Closing a historical ticket does not establish reliable first-attempt generation. Current scope and status live in the open issues; access and release acceptance remain in #21.

Cross-application SSO remains causl-kb #450. Community Edition is not evidence of shared-instance enterprise isolation. Rehoboam execution, measured operating outcomes, and multi-host failover are outside the hosted release. Native Onyx and causl-kb still require separate authenticated sessions.

## End-to-end acceptance

[Run the real-browser acceptance suite](end-to-end-acceptance.md) for three executive businesses, model persistence, the Beca entry point and cross-company read/search checks. Missing sessions or fixtures block acceptance; they never count as passes. See [issue #27](https://github.com/Subconscious-ai/onyx/issues/27) for historical execution evidence; read open #21 for remaining release requirements.

## Development

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

The `burn.subconscious.ai` cutover is live. Use the canonical entry above; #21 retains the remaining acceptance evidence.
The registered review origin is `https://onyx-executive-git-codex-1-executive-interviewer-subconcious.vercel.app`; alias promotion remains manual.
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

## Organization library

Company agents use the [Hermes material library](https://github.com/Subconscious-ai/hermes/blob/main/library/LIBRARY.md) through native internal_search.
The existing executive rubric contains the retrieval and freshness instructions.
Read the current owner records linked from the library. Update materials at their owner;
use existing native connectors and search. The previous file-upload catalog is a
historical snapshot, not current source authority.

The GitHub connector accepts optional `file_paths`: exact repository-relative files
instead of all prose files. An empty list selects nothing. Selected text manifests
can use JSON, JSONL or CSV; size and directory safeguards still apply. Omit the option
to retain normal prose indexing. Keep PR and issue indexing disabled for a library-only
connector. Full indexing and native pruning use the same file selection.

Use the existing GitHub credential and daily native refresh for the Hermes library
page and its Ditto owner manifests. Keep the existing broad Ditto/MBB connectors.
Do not index the entire private Hermes repository. Configure source access explicitly;
file selection does not replace native permissions. There is no configured Google
Drive connector in the verified deployment; indexed Drive links are file references,
not PDF-content retrieval. Mounted archives also require separate authorized access.

Apply only the organization-research section to the saved company persona; preserve
its other instructions, tools and permissions. Verify an ordinary user's native
search returns the library, owner records and original-file references. Hide the
superseded uploaded catalog through native administration after that check; preserve
its files and historical evidence. Indexing is periodic, not instant. Check the owner
revision before experiments. Live activation evidence belongs in
[#32 — use the shared library](https://github.com/Subconscious-ai/onyx/issues/32).
