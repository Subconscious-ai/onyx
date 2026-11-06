# onyx: architecture discovery, 2026-10-31

Reviewed revision: `fee9863d1705822b36ab6c88ffe6a9fc3e540932` on `main`.

Customer example: Executive sends current workspace context through native Onyx without losing permissions.

Scope: discovery only. No runtime change, selected refactor, new interface, or production proof.

Prior art: Merged #101 owns native composer/source/progress work; open #100 overlaps presentation. Open #79/#97/#99 concern test Sentry isolation; no competing fixes proposed.

Discovery used the last 25 commits, existing architecture guidance, source owners, test locations, and live pull-request history. No CONTEXT.md or docs/adr entries were tracked at the reviewed revision. Existing architecture documents remain authoritative.

## 1. Embedded workspace lifecycle

**Strength:** Worth exploring.

**Evidence:** [web/src/lib/causl/WorkspaceChat.tsx:65-190](https://github.com/Subconscious-ai/onyx/blob/fee9863d1705822b36ab6c88ffe6a9fc3e540932/web/src/lib/causl/WorkspaceChat.tsx#L65-L190); existing check: `web/src/lib/causl/WorkspaceChat.test.tsx`.

**Problem:** One effect coordinates bridge events, navigation, pending refresh promises, identity polling, and failure teardown. Changes to current context require tracing these interacting lifecycles.

**Direction:** Explore deepening the existing bridge/controller seam to own lifecycle transitions. Keep native chat rendering, URL navigation, and permission policy in their existing owners.

**Deletion test:** Deleting createCauslBridge would spread protocol validation into UI callers. Keep that module; move only proven lifecycle duplication behind its existing seam.

**Payoff:** Better locality for lifecycle rules; more leverage from the existing interface and its tests. This is a hypothesis, not measured improvement.

```text
Before: React effect → bridge + identity polling + pending refresh
After:  React presentation → existing workspace controller → lifecycle
```

**Acceptance and risk:** Retain origin/source/nonce checks, identity change behavior, refresh cancellation, and current-context requirements.

## 2. Workspace prompt assembly

**Strength:** Speculative.

**Evidence:** [backend/onyx/server/query_and_chat/causl/turn.py:102-172](https://github.com/Subconscious-ai/onyx/blob/fee9863d1705822b36ab6c88ffe6a9fc3e540932/backend/onyx/server/query_and_chat/causl/turn.py#L102-L172); existing check: `backend/tests/unit/onyx/server/test_causl_workspace.py`.

**Problem:** workspace_turn selects geography, saved-fact, model-phase, and interview instructions alongside context loading. Additional modes require tracing flag combinations.

**Direction:** Explore concentrating instruction assembly internally only when a new supported mode needs another combination. Keep read_workspace_context as the authorization owner.

**Deletion test:** Deleting the turn module would spread policy selection into chat callers. Preserve this owner and avoid a second prompt pipeline.

**Payoff:** Better locality for lifecycle rules; more leverage from the existing interface and its tests. This is a hypothesis, not measured improvement.

```text
Before: Workspace modes + flags → context load and prompt assembly
After:  Authorized context → existing turn module → mode-specific prompt
```

**Acceptance and risk:** Preserve authoritative saved facts, source-text distrust, current geography, and permission checks.

## Top recommendation

Explore candidate 1 when the next related customer change exposes the same friction. Candidate 2 records a conditional opportunity or an existing deep module to preserve. No refactor is approved by this discovery.

## Verification limits

Static discovery verified source locations, referenced test files, and the reviewed revision. Runtime tests and live customer flows were not run for this documentation-only survey. Production failure frequency and performance improvement were not measured. Markdown and HTML contain the same candidates; HTML uses no external scripts or assets.
