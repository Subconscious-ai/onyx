# causl-kb workspace assistant

[causl-kb #685](https://github.com/Subconscious-ai/causl-kb/issues/685) owns the full customer journey.
The integration binds native conversations to an authorized organization and market.
The paired KB panel keeps the native chat mounted across page navigation and collapse.
This source change does not establish a hosted release or complete the full customer journey.

## Configuration

Keep both settings unset to leave ordinary Onyx authentication unchanged.
Set these existing database IDs only on a reviewed deployment:

- `CAUSL_KB_ASSISTANT_PERSONA_ID`: native persona accessible to the signed-in customer.
- `CAUSL_KB_MCP_SERVER_ID`: that persona's causl-kb Library MCP server.

The server must use OAuth with per-user authentication.
Its URL must end in `/api/mcp/library` and use HTTPS outside local development.
No administrator token, legacy capability or browser-supplied token can replace the user's OAuth grant.

The paired KB endpoint is in [causl-kb PR #689](https://github.com/Subconscious-ai/causl-kb/pull/689).
Its organization OAuth dependency is [PR #674](https://github.com/Subconscious-ai/causl-kb/pull/674).
Configuration does not create a persona, change permissions or launch a paid analysis.

## Persistent interface and hosting

The paired KB layout uses `ENABLE_ONYX_ASSISTANT=true` and its existing
`BURN_ONYX_ORIGIN` setting. The flag defaults to false.
Native Onyx adds `/causl` and reuses its existing chat page, controller and transport.
Set `CAUSL_KB_EMBED_ORIGINS` to the exact KB origins allowed to frame this route.
Invalid entries fail closed. Normal application, administration and login routes retain
their existing frame policy.

The two applications must share a browser site for the existing native session cookie.
Native CookieTransport currently defaults to `SameSite=Lax`.
A KB page on `www.causl.io` cannot reuse that cookie in an iframe on a different site,
even when both applications use the same Auth0 tenant.
A proposed deployment pair is `www.causl.io` and `chat.causl.io`.
The second hostname is a proposal; this change does not register or deploy it.
Use HTTPS for both. Configure the existing Onyx frontend/backend `WEB_DOMAIN` and
Auth0 callback for the reviewed native hostname. Keep the same verified issuer.
A reverse proxy or approved sibling domain must preserve the native API and cookie paths.
Do not change global cookie policy to work around cross-site embedding.

The handshake accepts only the configured parent/frame origins and a per-frame nonce.
Page selection is a hint; the backend verifies identity, membership and record ownership.
Organization, caller and market changes replace the frame. Collapse and ordinary page
navigation preserve it. Unchanged renders do not restart context requests.
Native sign-in and Library OAuth recovery open a separate window. The customer then
reopens the conversation. Preferences and administrator recovery also stay outside
the embedded conversation.
Draft and queued text remain available when workspace preparation refuses a send.
Queued acceptance uses the native controller acknowledgment after its input reset.

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
The paired KB proposal tool, review, atomic save and teammate readback are still required.
Until that KB tool is registered, this seam alone does not enable the fact-review journey.
Unbound connections and other servers' tools retain their ordinary behavior.

This change does not add a second assistant runtime, widen private chat access or retire the model composer.
Model action parity, reviewed facts, saved report integration and hosted acceptance remain under #685.

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
