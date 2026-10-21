# causl-kb workspace assistant

[causl-kb #685](https://github.com/Subconscious-ai/causl-kb/issues/685) owns the full customer journey.
The integration binds native conversations to an authorized organization and market.
The paired KB panel keeps the native chat mounted across page navigation and collapse.
This source change does not establish a hosted release or complete the full customer journey.

## Shared market memory in native interviews

[Onyx #70](https://github.com/Subconscious-ai/onyx/issues/70) connects configured native Beca
interviews to the same per-user Library OAuth and fresh KB context reader. The verified Library
response selects the initial organization. The native conversation retains that binding and
rechecks it on later turns. Existing unbound conversations retain their transcripts; start a new
interview to connect shared memory instead of guessing their historical organization.

Accepted facts live in causal-KB Postgres. The brief's **Saved market facts** view reads that
database and shows current values separately from approved source excerpts. The native
`<interview-brief>` payload remains a working draft, not accepted business memory. No extractor
claim, PDL result, or public research report silently becomes an accepted fact.

Interview mode retains native PDL/research preparation, configured research tools, attached
reference files, and turn guidance. It excludes personal MemoryTool writes. Supported fact
changes use the existing source-bound Library proposal and review/save path. Permissions and
admission rules are unchanged. Workspace mode keeps its stricter private-context exclusions.

The initial snapshot is bounded. Existing Library `market_search` retrieves accepted facts
outside that snapshot, including journey stages, transitions and product definitions. It applies
the text filter before sampling and retains source identities. Beca must search before asking
for an absent fact. A missed search is inconclusive; omitted results call for a narrower query.
The brief displays a bounded Postgres view, not a complete copy of organization memory.

Paired [causl-KB #714](https://github.com/Subconscious-ai/causl-kb/issues/714) tests one approved
chat fact through fresh authorized contexts and the model request. Its reader preserves approved
excerpts and prioritizes recently corrected records. Focused database and HTTP tests are separate
from authenticated hosted QA. This change does not prove automatic admission of every interview
field or the 60-second onboarding target. The owner authorized publication and merge on
October 18; required review and checks remain release gates. Current candidates are
[Onyx #71 — share accepted facts across interviews](https://github.com/Subconscious-ai/onyx/pull/71)
and [KB #715 — preserve shared facts and model inputs](https://github.com/Subconscious-ai/causl-kb/pull/715).
The shared-memory candidates retain the original interview and model implementations from PRs #48 and KB #675.

The latest first-send proof used Onyx `1e2a9d7` and KB `f18c36a`. Standard-member OAuth,
exactly one saved human message, a real saved reply, model save and independent reopen passed.
One prepared answer took 65.489 seconds after login. Calculation matched 550 baseline and
700 target contracts. A fresh empty chat retrieved the same accepted fact/source through
its actual Library tool in 2.074 seconds; model-context readback took 0.239 seconds.
Agent-dev still runs these tested pins. Source integration and CI do not update that runtime.
Fresh PDL/research, realistic executive response time and full six-case timing remain unproven.

October 18 agent-dev QA used Onyx `f10a31555b` and KB `a884ab3`. A standard member saved
three reviewed stages and two transitions from a retained synthetic interview. After newer
records displaced the original stage from the snapshot, a separate empty chat's actual native
Library tool retrieved it and its accepted source in 0.736 seconds. The model route's existing
market-scoped Postgres reader returned the same fact and evidence in 0.106 seconds. Authenticated
selection returned the saved model and exact stage in 0.272 seconds. Exact model reopen, no
copied transcript, anonymous denial and both browser views passed. This test reused the
previously calculated model; it made no new research or model-generation call. It does not
prove the fresh 60-second interview. QA: [Beca on agent-dev](https://agent-dev.taila3aadb.ts.net:3011/app?agentId=2).

## First-send workspace connection

Native sign-in does not create a per-user Library OAuth grant. Before a standalone
Beca send, the frontend checks the existing persona MCP connection status. If the
grant is missing, **Connect workspace** opens the existing OAuth flow. The original
draft and queued message stay in their native tab. A successful connection resumes
that submission once; cancellation leaves the text available for editing.

Library OAuth accepts a standard member who can view an agent with an enabled
Library tool. Server attachment uses its existing, separate permission check.
OAuth completion checks agent access again, so revoked access cannot accept tokens.

Fresh-user QA must use a standard member with no prior Library grant. A connected
account can prove memory readback but cannot prove first-send onboarding. Inspect
native stream packets: HTTP 200 can contain an `UNAUTHENTICATED` error and is not
proof of a saved message. Require the exact persisted human message, a real saved
assistant reply, and normal model save/reopen before handing off the QA link.
Observe popup pages with Playwright events. Wrapping native Window handles changes
`postMessage` source identity and invalidates the handoff test.

## Configuration

Keep both settings unset to leave ordinary Onyx authentication unchanged.
Set these existing database IDs only on a reviewed deployment:

- `CAUSL_KB_ASSISTANT_PERSONA_ID`: native persona accessible to the signed-in customer.
- `CAUSL_KB_MCP_SERVER_ID`: that persona's causl-kb Library MCP server.

The server must use OAuth with per-user authentication.
Its URL must end in `/api/mcp/library` and use HTTPS outside local development.
No administrator token or legacy capability can replace the user's authority.
The optional host authentication mode below uses the user's verified KB access token.

The paired KB endpoint is in [causl-kb PR #689](https://github.com/Subconscious-ai/causl-kb/pull/689).
Its organization OAuth dependency is [PR #674](https://github.com/Subconscious-ai/causl-kb/pull/674).
Configuration does not create a persona, change permissions or launch a paid analysis.

## Persistent interface and hosting

The paired KB layout uses `ENABLE_ONYX_ASSISTANT=true` and its existing
`BURN_ONYX_ORIGIN` setting. The flag defaults to false.
Native Onyx adds `/causl` and reuses its existing chat page, controller and transport.
Set `CAUSL_KB_EMBED_ORIGINS` to the exact KB origins allowed to frame this route.
Set frontend `CAUSL_KB_MCP_SERVER_ID` to the same Library server ID as the backend.
Invalid entries fail closed. Normal application, administration and login routes retain
their existing frame policy.

The default cookie mode requires both applications to share a browser site.
Native CookieTransport currently defaults to `SameSite=Lax`.
A KB page on `www.causl.io` cannot reuse that cookie in an iframe on a different site,
even when both applications use the same Auth0 tenant.
A proposed deployment pair is `www.causl.io` and `chat.causl.io`.
The second hostname is a proposal; this change does not register or deploy it.
Use HTTPS for both. Configure the existing Onyx frontend/backend `WEB_DOMAIN` and
Auth0 callback for the reviewed native hostname. Keep the same verified issuer.
A reverse proxy or approved sibling domain must preserve the native API and cookie paths.
Do not change global cookie policy to work around cross-site embedding.

### One KB login for embedded chat

The paired KB rollout flag `ENABLE_ONYX_HOST_AUTH=true` selects `/causl?hostAuth=1`.
The native chat composer, private history, context reader, and Library tools remain the application surface.
The generic upstream widget does not carry this workspace context and action contract.
Host mode uses the existing Onyx JWT verifier and native OIDC admission.
It does not need a native Onyx cookie or a separate Library OAuth popup.

Set these backend values on the reviewed single-workspace deployment:

- `CAUSL_KB_HOST_AUTH_ENABLED=true` opts into strict host token authentication.
- `JWT_PUBLIC_KEY_URL` names the existing Auth0 JWKS endpoint.
- `JWT_EXPECTED_ISSUER` equals the KB `DECISION_MODEL_AUTH0_ISSUER_BASE_URL`.
- `JWT_EXPECTED_AUDIENCE` equals the KB `DECISION_MODEL_AUTH0_AUDIENCE`.
- `CAUSL_KB_AUTH0_PROVIDER_NAME` defaults to the enabled native OIDC provider `auth0`.
- `CAUSL_KB_HOST_ORIGIN` names the exact HTTPS KB origin, without a path.

The configured Library server URL must use that exact origin and `/api/mcp/library`.
The existing frontend origin allowlist and Library server ID remain required.
Multi-tenant Onyx fails closed because this flow has no verified native workspace pin.
This limit does not change KB organization membership checks.

The iframe requests a credential with `{kind: "causl:auth-request", nonce, id}`.
The parent replies with `{kind: "causl:auth", nonce, id, token, expiresAt}` or `causl:auth-error`.
`expiresAt` uses Unix seconds. Both sides check the source window, exact origin, nonce, and request ID.
The KB POST `/api/assistant/session` refreshes the SDK session and verifies the token's subject and organization.
The Auth0 API access token needs `openid profile email` for first-user native admission through trusted userinfo.
No token enters a URL, browser storage, native session cookie, or stored native OAuth grant.
Every host API call rechecks the parent session. Requests omit native cookies and disable browser caching.
Protected file tags and downloads use authenticated fetch and temporary blob URLs.

Onyx binds the cryptographically verified issuer and subject to the exact native OAuth account.
A first user follows the enabled provider's invite, domain, and verified-email admission rules.
Trusted userinfo must return the same subject. Every existing-email collision fails closed.
No email match attaches an existing account. Existing native users retain their private chat history.
The generic email-based JWT fallback is disabled while host authentication is enabled.

Library forwarding uses only the request's bearer and the configured Library server and origin.
KB verifies issuer, subject, token organization, and current membership on each read or action.
Native context identity is scoped to the request and reset after completion.
Standalone native login and stored per-user Library OAuth retain their current behavior.
Disable both rollout flags to restore the existing cookie flow for embedded chat.

The handshake accepts only the configured parent/frame origins and a per-frame nonce.
Page selection is a hint; the backend verifies identity, membership and record ownership.
Organization, caller and market changes replace the frame. Collapse and ordinary page
navigation preserve it. Unchanged renders do not restart context requests.
In cookie mode, native sign-in and Library OAuth recovery open a separate window. The customer then
reopens the conversation. Preferences and administrator recovery also stay outside
the embedded conversation.
Draft text remains available when workspace preparation refuses a send.
While a reply runs, follow-up text stays a draft until the customer sends it.
Existing queued text remains available for manual recovery. Embedded chat never sends it automatically.
Ordinary native chat keeps its existing queue behavior.

## Identity and storage

Native Postgres and Redis sessions retain their existing validation.
A fresh verified OIDC sign-in records the provider issuer and subject for that native session.
Older sessions need a new organization sign-in before opening a workspace conversation.
KB verifies its own bearer token and current organization membership on each context read.
Onyx compares that identity with the native sign-in before using the facts.

The native key-value table stores session identity and conversation associations.
Keys hash native session tokens; stored identity values do not contain those tokens.
This table name does not establish application-level encryption; see issue #21.
Logout removes session metadata. Expired metadata cannot revive an invalid native session.
Expired metadata cleanup remains a retention follow-up.

Accepted business facts remain in causl-kb Postgres.
Native Onyx owns messages and streaming. Concurrent workspace opens reuse one owned conversation.
Page changes retain that conversation. Each turn reads the current authorized KB snapshot.
Organization and market changes cannot adopt a conversation from another scope.

## Agent context

Workspace turns exclude personal memory, Burn profiles, persona files and unrelated custom connections.
They use the configured Library connection with server-controlled identity headers.
The browser can supply page and selection hints. It cannot supply accepted context or tenant authority.
Missing values stay unknown. Executive statements and synthetic results retain their distinct meanings.
Changes require the existing KB review and save interfaces.

## Executive statement source

The native MCP constructor can attach a persisted executive statement to the bound
`prepare_library_change` tool. It reads the current turn's saved human message through
the native caller and chat association. Assistant messages, system messages, another
chat's messages, another caller's messages and deleted chats cannot supply that source.
Bound turns retain the original request text when query hooks return rewritten text.
Hook rejection still applies. The saved text must match the original current request.
Regeneration can reuse history for answers, but cannot turn an older potentially rewritten
message into statement evidence. Send a new human message to prepare that fact for review.
The model chooses a change and an exact excerpt of at most 1,200 characters. The runtime
supplies the source chat/message IDs and the conversation's fixed market. It replaces
model-supplied citations and market selection. Only the excerpt crosses to KB; the rest
of the message remains in native chat history.

This source check does not accept a fact or prove that the executive's statement is true.
The paired KB proposal tool, review, atomic save and teammate readback are implemented
in KB PR #689. They still need deployed registration and authenticated journey verification.
Unbound connections and other servers' tools retain their ordinary behavior.

The configured Library connection can also expose `inspect_model`. Native Onyx
removes its market selector from the model's schema and supplies the bound market
before network access. A missing selected market fails closed. KB loads the current
saved primary model and reuses the pinned Guesstimate calculator for outputs,
lineage/sensitivity, source and scenario inspection. These reads do not edit or
save the model, run paid inference or produce observed causal results.

This change does not add a second assistant runtime, widen private chat access or retire the model composer.
Model edit/history parity, saved report integration and hosted acceptance remain under #685.

## Verification boundary

Focused tests cover native authentication, context validation and tool scoping without paid model calls.
Disposable Postgres tests cover concurrent opens, reload, ownership and transaction rollback.
They also cover persisted statement retrieval and denial of foreign, nonhuman and deleted sources.
The HTTP test covers workspace-open and streaming context propagation between separate callers.
Native frontend tests cover stale context replies, frame policy, native transport and draft/queue recovery.
KB Chromium tests cover desktop/mobile layout, navigation, scope replacement and frame retention.
The KB browser test uses a placeholder native frame; it does not run a hosted Onyx conversation.
These checks do not prove Auth0 callbacks, browser cookie behavior or the deployed customer journey.
Merge, deployment and paid hosted checks require separate approval.

## Native image preparation

Use `docs/subconscious/hosting/Dockerfile.causl` with the inspected live image as
`BURN_BASE_IMAGE` and the reviewed commit as `CAUSL_SOURCE_REVISION`.
The existing prototype and Beca overlays omit workspace modules.
Build the candidate before changing a running service.
Compile checks do not prove imports, startup, authentication or the customer journey.
Validate API and background imports in the candidate before an approved replacement.
Keep the live Compose commands, secrets, volumes and unrelated services.
This branch adds no migration or dependency-lock change.

The October 12 source readback found deployed interview preparation from the
`codex/46-interviewer-comparison` source. Preserve its persona aliases, prepared
research context and native profile bootstrap for ordinary chats.
Workspace-bound chats exclude that personal context and bootstrap.
The source integration retains these existing behaviors; it does not release that
branch's separate frontend or evaluation work.

Read the Library server's actual authentication mode before configuration.
An API-token connection cannot supply the workspace's per-user OAuth identity.
Preserve existing connections while preparing a reviewed OAuth connection.
Configure the backend IDs before a fresh verified OIDC sign-in.
Old native sessions do not contain the required issuer and subject metadata.
