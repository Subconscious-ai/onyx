# Burn 2.0 on native Onyx

[Open Burn](https://onyx-executive-git-codex-1-executive-interviewer-subconcious.vercel.app/app?agentId=5). The stable Vercel address serves the native executive interview. The backend runs on AWS at `https://api.dev.subconscious.ai/burn2`; desktop services are no longer the serving backend.

## Architecture

- Vercel serves the existing Next.js interface and forwards authenticated streaming requests.
- Native Onyx on AWS owns accounts, conversations, tool permissions, source search, and working briefs in Postgres 15. AWS Bedrock supplies conversation and background extraction models.
- GPT Researcher runs as a private MCP container with AWS and Exa. Native Onyx retrieves the existing MBB corpus; no corpus re-import or second analyst framework is required.
- PDL context comes from the authenticated account and remains an unconfirmed professional match. Enrichment never grants company access.
- Background extraction validates journey, OKR and model structure against saved executive messages. Unknown inputs remain unknown. Public references and hypotheses never silently become executive facts.
- causl-kb owns accepted market ontology and organization-scoped model persistence. The browser handoff binds the exact origin and nonce; Onyx holds no causl-kb administrator credential.

## Start here

- [Hosting, recovery and deployment lessons](durable-hosting.md): native Compose, rootless execution, encrypted Vercel Blob backups, restart and restore evidence.
- [Interview operation and QA](burn2-operations.md): source ownership, model handoff, configuration and acceptance checks.
- [Executive research and scope](executive-interviewer.md): retained MBB source-use findings and consulting guidance.
- [Earlier research evaluations](research-model-qa.md): historical failures, not a current release pass.

The active Burn agent is `5`, conversation model `8` (GPT OSS 120B), preparation model `5` (DeepSeek v3.2), all in the migrated native database. Resolve IDs again for another database. Ordinary conversation streaming remains separate from background preparation.

## Remaining product work

[Issue #6](https://github.com/Subconscious-ai/onyx/issues/6) records intermittent structured-brief validation failures and provider timeouts. A retry produced a persisted reviewable brief during hosting QA; a successful retry does not establish reliable first-attempt generation.

Cross-application SSO remains causl-kb #450. Community Edition is not evidence of shared-instance enterprise isolation. Rehoboam execution, measured operating outcomes, and multi-host failover are outside the hosted release. Native Onyx and causl-kb still require separate authenticated sessions.

## Development

The Subconscious fork is `Subconscious-ai/onyx`. The existing local `origin` remote points upstream; publish Burn changes through `subconscious`. Never push Burn-specific changes to `onyx-dot-app/onyx`.

Reuse `scripts/subconscious/test_*.py`, the executive Jest tests and `eval_interview.py` for focused proof. Use synthetic sessions for writes and preserve customer transcripts. Credentials, corpus files, browser state, database dumps and encryption keys stay outside Git.

## Automatic frontend releases

The existing `onyx-executive` Vercel project connects to `Subconscious-ai/onyx`, with `web` as the root directory.
`web/vercel.json` enables native Git builds for `codex/**` previews. Production and other branches remain disabled.
The rules apply after the configuration reaches each branch. No extra GitHub deployment token or release workflow is required.

Push reviewed frontend changes to a Burn branch. Vercel builds the commit and updates the branch preview after success.
Use the branch URL from the Vercel deployment record. A failed build leaves the last successful branch preview available.
Before enabling `main`, configure production backend and model-handoff settings, then complete executive acceptance checks.
The current project has preview connection settings only; enabling production releases now would publish an unconfigured application.
Automatic builds do not authorize feature merges or establish executive readiness.

The existing `burn.subconscious.ai` domain serves causl-kb. Domain replacement requires explicit approval.
The shared review alias is `https://onyx-executive-git-codex-1-executive-interviewer-subconcious.vercel.app/app?agentId=5`; alias promotion remains manual.
Native Git builds update branch aliases, not the manually assigned shared review alias.

Vercel releases only the frontend and API forwarding. AWS backend images, data, backups and service restarts remain separate.
Use [the hosting procedure](durable-hosting.md) for backend changes. Never restart desktop writers after the AWS migration.
Preserve the exact handoff origins, authenticated access and private configuration during release.
