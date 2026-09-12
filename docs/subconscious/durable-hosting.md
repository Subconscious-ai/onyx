# Durable Burn hosting

Active issue: Subconscious-ai/onyx#4. Base: executive interviewer a93ef9a24b.

## Outcome

The existing Vercel application works without a desktop or Tailscale Funnel dependency. Native Onyx retains conversations, accounts, AWS models, the research corpus and automatic briefs.

## Deployment decision

Vercel hosts the existing frontend and API forwarding. The native Onyx stack runs on the existing AWS host behind HTTPS at api.dev.subconscious.ai/burn2. Vercel Container Images support HTTP services, but persistent databases, search storage and Celery workers need backing services. Keeping the native stack together avoids exposed database ports and a serverless rewrite.

Existing service routes remain unchanged. Native authentication and the existing restrictive gateway remain active. Databases bind only inside Docker. Code execution must not receive the production host Docker socket. Retain the current feature PRs as drafts; hosting authorization does not imply a feature merge.

## Milestones

1. Pin running images and private configuration. Prepare isolated services and restart policies on AWS. Provide bounded resource limits and an isolated execution daemon.
2. Copy a consistent native database/search/object-store snapshot. Preserve account encryption and original messages. Verify restored conversation counts and existing account login.
3. Publish the isolated HTTPS route and Vercel candidate. Verify streaming, PDL, source search, automatic brief persistence, and authenticated model handoff without desktop endpoints.
4. Verify a backup restore and service restart. Switch the existing QA alias only after proof. Keep the original data snapshot for rollback; avoid deleting original volumes.

## Hosting preparation (2026-09-11 UTC)

AWS API and research images built. CPU-only PyTorch 2.9.1 model image replaces the CUDA image that exceeded available extraction space. Native model code and embedding weights remain unchanged. Services use isolated `burn2_*` volumes. Python execution uses a separate rootless Docker daemon with resource limits.

A private Vercel Blob store (`burn2-durable-backups`, iad1) is connected to the Onyx project. The backup token and archive encryption key live outside Git, root-only on AWS and in the local private recovery directory. Renewed AWS SSO is no longer required for backups. Daily backups include Postgres, source objects, and private runtime configuration; the search index is rebuildable and included in the initial cold migration snapshot. Retention automation is deferred; no backup is automatically deleted.

Focused proof: the frontend Host-header regression failed before the fix and 10 proxy/SSR tests pass afterward. The Bedrock bearer-token regression failed against the original research launcher and all three research-launcher tests pass afterward. Migration, native authenticated readback, source search, PDL, Python and private backup restore now pass. Final cutover/restart evidence is recorded below.

## Operations and recovery

### Prototype research and background briefs

The September 12 API and background pin is `onyx-burn2:prototype18-3a6ac8a8d9`. Source Compose retains both verified images. Frontend recovery and persona prompts can advance independently; record all three publication boundaries.

Stored persona prompts survive API replacement. Update native persona 5 from `executive-turn-reminder.md` and persona 8 from `experiment-analytics-prompt.md`. Preserve model, tool assignments, document sets, ownership and shares; compare exact prompt readback. An old stored reminder caused unknown-question and scenario-narration failures despite current source files.

Issue #18 adds native primary-worker tasks, native encrypted Postgres research
receipts and read-only brief polling. Deploy `hosting/Dockerfile.prototype` over
the verified executive API image for both API and background services. Preserve
the native background Compose command and unrelated task registrations. The
deployed primary worker predates two upstream registrations in the repository;
the Docker overlay adds only Burn tasks and deliberately retains the native list.

Set `BURN2_ENABLED=true`, `BURN2_RESEARCH_PERSONA_ID=5` and
`BURN2_BACKGROUND_PREPARATION=true` on API and background. Copy the existing
`BURN2_BRIEF_MODEL_CONFIGURATION_ID` setting to background. The primary worker
requires the same native encrypted-store configuration and Bedrock provider
records as API. No new database tables or provider secrets are introduced.

PDL preparation schedules public-domain-only research through the assigned
native GPT Researcher MCP tool. Original URLs and bounded context are retained
under the authenticated account in Postgres. Public context expires after one
day; pending jobs become recoverable after five minutes on the next entry.
An unavailable provider remains an explicit unavailable receipt. Research never
becomes accepted market memory, private operating numbers or executive evidence.

The authoritative native chat writer queues brief preparation after saving a
completed answer, including after a browser disconnect. Preparation reuses the
existing per-chat lock, original-message validation and stale-write rejection.
The browser reads the saved brief; explicit retry uses the existing preparation
endpoint. A failed worker does not erase the transcript or masquerade as saved.
Provider time remains outside ordinary chat latency. Missing saved output becomes
a visible retry state after 90 seconds.

Public prompt context requires an exact conservative match between the current
validated draft company and the PDL company/domain. A professional employer must
not displace a different interviewed business. Keep the research query out of
prompt context, limit the injected excerpt, and preserve the full bounded receipt
and original URLs in Postgres. A live replay caught unrelated public-company
summaries despite valid saved briefs; spoken answers require independent review.

Before replacement, run the research/worker checks inside the candidate image
and verify both task names appear in native primary-worker registration. Preserve
private environment snapshots and previous image IDs for rollback. Replace only
API/background services; preserve volumes and the isolated execution daemon.
Verify authenticated login, a real queued research receipt, background brief
readback and existing saved source text after replacement. A frontend deployment
alone does not publish worker code.

For an `api.py`-only patch, `Dockerfile.brief-prompt` extends the verified native image with one linked source layer. Confirm the backend Git diff contains only that file; use the full prototype overlay for broader changes. The September 12 normal copy stalled for over three minutes under shared-host load; the linked layer completed in one second. Native import/worker checks still precede replacement. Cancel only the task-owned stalled build; preserve other builds, containers and volumes.

After an API container replacement, syntax-check and reload the native nginx
gateway once the API is healthy. Static upstream resolution can retain the old
container IP and return 502 even while native API health passes. Preserve the
gateway configuration and authentication boundary.

The host deployment lives at `/opt/burn/app`; `burn2.service` starts the native services after Docker and the isolated execution daemon. The external `burn2_db_volume`, `burn2_minio_data` and `burn2_opensearch-data` volumes survive Compose removal. Never remove the original desktop volumes during QA.

`burn-backup.timer` runs daily at 08:15 UTC, with a five-minute jitter. The backup pauses native API/background writers while capturing Postgres and source objects, resumes writers, then encrypts and uploads the archive. Failed jobs resume writers via `ExecStopPost`; inspect `journalctl -u burn-backup.service` for the upload receipt. Backups are private and separately encrypted. Archive decryption requires the recovery key retained outside the AWS disk.

Restore an archive using `backup.mjs get`, decrypt with OpenSSL AES-256-CBC/PBKDF2 (200,000 iterations), then restore `postgres.dump` with `pg_restore` into an empty Postgres 15 database. Restore `objects.tar` (the first backup used `objects.tgz`) into the matching MinIO volume and preserve `runtime/` encryption configuration. Rebuild OpenSearch from restored sources if the cold search snapshot is unavailable. Test restores against a disposable database before changing the serving database.

After cutover, keep the source desktop writers stopped. Reverting only the frontend alias would create divergent databases; rollback requires preserving new AWS writes and restoring the current cloud state first. The current design survives a desktop shutdown and container/service restarts. A single AWS host is not a multi-host availability guarantee.


## Verified migration and lessons, September 11

The cold migration preserved three accounts, 255 conversations and 1,171 messages before synthetic QA writes. Native search returned 36 documents for a profitability query. PDL returned a cached ready profile. A hosted synthetic answer streamed first content in 6.36 seconds and finished in 6.77 seconds. Native Python computed `1000 * 0.95 * 1200 = 1140000` through the isolated executor. Direct GPT Researcher completed an AWS/Exa request in 27.6 seconds with eight source URLs. Ordinary chat and background preparation are measured separately.

The private backup uploaded, downloaded, decrypted and restored into `burn_restore_check`. The second archive includes a manifest of account/chat/message counts; restored counts must match exactly. Source-object archives also pass archive readback. The revised capture resumes writers after 18 seconds; compression and upload happen afterward. The 08:15 UTC timer is enabled. The first compressed-object capture held writers longer and was replaced.

Deployment surprises:

1. Forwarding Vercel's frontend Host header misroutes HTTPS requests at a shared backend nginx. Strip only Host while preserving native session cookies. Ten focused proxy/SSR checks pass.
2. Native Compose profiles can silently omit MinIO and execution services. Reset inherited profiles in the hosting overlay and inspect the resolved service graph. Missing MinIO caused startup failure before the fix.
3. The CUDA model image exceeded available extraction space. Build the native model server with the same PyTorch version using the CPU wheel. Both native model services pass health checks. Preserve the cached embedding weights and index.
4. A rootless daemon needs the user's systemd/DBus controller, not merely a Unix socket. Enable linger and `user@1003.service` for the existing `burn-executor` account; bound `user-1003.slice` to 3 GiB and two CPUs. Another host must substitute the actual UID. Never mount the shared host Docker socket into the interpreter.
5. Keep the native SSRF guard. The MCP URL is the public authenticated `https://api.dev.subconscious.ai/burn2/research-mcp/mcp`, not the Docker hostname `research`. Only the private gateway forwards to the research container; no database ports are public.
6. Vercel env commands can exit after an unanswered branch prompt. Use `--yes`, read back configuration and verify the compiled handoff action. A ready deployment alone does not prove configuration or backend availability.
7. Preserve exact encryption configuration and native source/object volumes. Do not let desktop and cloud writers diverge. A frontend-only rollback after new cloud writes is unsafe.

Background brief generation produced an invalid-structure rejection and a provider timeout before a successful retry. The retained failures belong to Onyx #6; hosting evidence does not establish general interview quality. A deliberately synthetic scenario remained an assumption, as required.

The full restart check exposed native Redis-backed login sessions on disposable Redis. The hosting overlay now selects native `AUTH_BACKEND=postgres` for API and workers, using the existing `accesstoken` table. No schema migration or custom authentication code is added. A one-time login is required when switching strategies. Restart proof must use the same newly issued cookie before and after restarting API/cache.

Final restart proof: the same native Postgres-backed login cookie authenticated after a full `burn2.service` restart, and the saved model brief remained present. All five authenticated gateway checks pass afterward. Desktop Onyx containers are stopped and the old port-10000 Funnel is disabled. The resolved Compose graph includes every required service, external data volumes and only the isolated executor socket.

The native Onyx MCP call now returns a successful GPT Researcher receipt with five source URLs in 26.1 seconds. The earlier private-hostname refusal was a tool error, despite a successful outer chat HTTP response; inspect `custom_tool_delta.error` and the nested research receipt, not only HTTP 200.

## Beca voice routing, September 11

Vercel cannot forward the native live-audio WebSocket through the HTTP catch-all. The frontend uses the public AWS voice gateway plus a native single-use token. The gateway allows only the stable review origin and Beca branch origin, then normalizes Origin to the native WEB_DOMAIN. Tokens, provider secrets and cookies are never logged or sent to another origin. HTTP authentication and public-enrollment restrictions remain unchanged.

The first gateway reload inspected an old bind-mounted inode. Recreating only the gateway loaded the candidate and exposed nginx's default 64-byte map bucket limit for long Vercel hostnames. `map_hash_bucket_size 128` corrected startup; backend health, five original gateway checks and two voice authentication checks pass afterward. For future changes, syntax-check a candidate in a disposable nginx container with the actual mount before replacement. Verify the live container configuration after reload. No database or worker restart is needed for gateway configuration.

Native ElevenLabs provider validation rejected the supplied API key IDs. Provider creation rolled back and voice remains disabled. Configure a valid secret through native administration, select the existing Beca voice ID, then test speech and read-aloud. `test_voice_gateway.py` proves transport authentication only, not working speech.

### September 11 runtime repair

Mount the rootless daemon directory `/run/burn-executor` at `/var/run:ro` in the native code interpreter, and retain `RuntimeDirectoryPreserve=yes`. A socket-file bind holds a stale inode after a daemon restart. Mounting the directory at another path also fails: the native entrypoint checks `/var/run/docker.sock` before honoring Docker client configuration. Native execution passed before and after a daemon restart with the directory mount; no privileged container or host Docker socket is involved.

`hosting/Dockerfile.beca` is a five-module overlay on the current executive-proof image. Supply the verified current image explicitly with `--build-arg BURN_BASE_IMAGE=<verified-image>` and preserve concurrent Burn extraction changes. The build intentionally has no guessed base image. Vercel publication does not deploy backend code. Coordinate shared API restarts; do not replace the entire live compose file from a divergent worktree. The offline backend check runs as `python /tmp/test_beca_providers.py` inside the candidate image.

### Executor restart regression

A later rootless-daemon restart replaced `docker.sock`, leaving the interpreter's
file bind-mount attached to the old socket inode. Health reported a reachable
interpreter but an unreachable Docker daemon. The hosting overlay now mounts
the isolated daemon directory read-only at `/var/run`; the native interpreter
entrypoint requires `/var/run/docker.sock`. `RuntimeDirectoryPreserve=yes`
preserves the parent directory across daemon restarts. Do not substitute a host
Docker socket, privileged Docker-in-Docker, or a different socket path without
checking the native entrypoint.

Live regression proof: `CodeInterpreterClient().health(use_cache=False)` and a
synthetic Python calculation passed before and after restarting only
`burn-executor.service`. The directory inode remained unchanged, the socket
inode changed, and native execution returned `190` with exit code zero. Wait
for the new socket and healthy daemon after `systemctl restart`; service
activation alone does not prove Docker readiness.
