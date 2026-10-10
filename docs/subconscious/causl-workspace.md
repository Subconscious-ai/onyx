# causl-kb workspace assistant

[causl-kb #685](https://github.com/Subconscious-ai/causl-kb/issues/685) owns the full customer journey.
This backend change binds native conversations to an authorized organization and market.
It does not establish a hosted release or complete the persistent interface.

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

This change does not add a second assistant runtime, widen private chat access or retire the model composer.
Model actions, saved reports, the persistent interface and hosted acceptance remain under #685.

## Verification boundary

Focused tests cover native authentication, context validation and tool scoping without paid model calls.
Disposable Postgres tests cover concurrent opens, reload, ownership and transaction rollback.
The HTTP test covers workspace-open and streaming context propagation between separate callers.
These checks do not prove Auth0 callbacks, browser cookie behavior or the deployed customer journey.
Merge, deployment and paid hosted checks require separate approval.
