## Problem
Mobile Burn chat loses most screen space to specialist tabs, profile status, model selectors, and a permanent draft footer. Customers need a single Beca conversation with Subconscious branding.

## Scope
- Make conversation history dominate mobile and desktop. Keep the native Onyx composer, uploads, streaming, citations, and history.
- Put the business brief and preparation status behind a compact accessible control. Preserve automatic preparation, errors, retry, and model handoff.
- Name the customer-facing interview agent Beca. Preserve specialist reasoning objectives in the prompt.
- Remove customer-facing model selectors; preserve administrator model configuration.
- Reuse the canonical Subconscious wordmark on the Burn shell.
- Document actual MBB retrieval, available MCP tools, native voice support, and minimal integration recommendations.

## Proof
A focused interaction test protects brief access, retry, and return to chat. Mobile browser checks measure conversation space, composer reachability, overflow, and keyboard-safe layout. Existing brief tests protect extraction boundaries. Publish a draft PR with an authenticated Vercel preview. No experiment execution or new paid service setup in this change.

## Validation and limits

Focused brief interaction and extraction suite: 28 tests passed. Mobile Chromium at 390×844 gives history 75% of the viewport; desktop 1440×900 gives 77%. A 390×420 reduced viewport keeps the composer reachable. Brief toggling preserves unsent text; no horizontal overflow or page errors occurred. Physical iPhone keyboard behavior remains a device QA check.

A synthetic live answer introduced an unsupported deadline and an installation step. Model grounding remains an existing reliability limitation, independent of this layout change. No experiment execution was performed. Rehoboam tools and ElevenLabs remain configuration recommendations.

Development setup: run the pinned Bun frozen install in the worktree. Shared package prepare scripts generate token CSS and contract types. Reusing only another checkout's node_modules misses shared dist outputs and causes misleading component type errors.
