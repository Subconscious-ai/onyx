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

## Approved capability extension

The September 10 follow-up authorizes native ElevenLabs voice, useful Onyx additions, and stronger analyst guidance.

1. Preserve the compact conversation and canonical design-system branding. Add a searchable Actions menu using native Onyx command controls and the Kokonut action-search pattern. Selected analysis actions populate the composer for review.
2. Give Beca the existing research and Rehoboam tool sets. Preserve native permissions, AWS models, and explicit instructions before experiment execution. Verify registrations and a read-only experiment request.
3. Reuse analyst-agent source-only answering, original citations, missing-evidence handling, and retrieval checks. Retrieve MBB references only when relevant. Preserve executive evidence versus proposed structure.
4. Configure ElevenLabs through native encrypted provider storage. Reuse native microphone, playback, and speech services. Support authenticated voice WebSockets across Vercel and AWS with an exact origin allowlist.
5. Verify focused regressions, native provider audio, authenticated preview layout/actions, and tool receipts. Record unresolved enterprise connectors and model-quality limitations explicitly.

Customer uploads, project files, internal search, citations, Python charts, and feedback use existing Onyx features. Drive and SharePoint remain native administrator connector setup, pending dataset selection and enterprise authorization. No second search index, agent runtime, or composer is planned.

## Capability extension proof and remaining limits

Native readback confirms Beca now has both MCP tool sets, with AWS model and sharing unchanged. The analyst rubric and turn reminder use source-bound answering, explicit classification boundaries and native Python file output instructions.

The five frontend suites pass 33 tests. Full TypeScript checking passes. Mobile browser QA preserves existing draft text, appends a design request, closes the action menu and sends nothing automatically. No horizontal overflow occurred.

Five existing gateway checks and two new voice authentication checks pass. The original voice test reproduced HTTP 403 before routing changed. Both stream endpoints now accept native tokens; wrong origins and token replay remain denied. ElevenLabs rejected both supplied key entries as key IDs. No voice provider is active, so audio quality and microphone QA remain pending a valid secret.

Live canaries reached both MCP servers and native internal search. GPT Researcher returned successful source receipts; the final answer included two original-source URLs without invented deadlines. MBB retrieval found an actual McKinsey B2B journey article. Citation output used the indexed GitHub copy, so original-publisher attribution still needs attention.

Python first timed out, then returned the expected synthetic total of 4,500. The final retry produced a downloadable PNG in 8.6 seconds. The initial causality answer incorrectly interpreted classification as a measured effect. Updated rubric, turn reminder and native tool description corrected the final canary to question framing. Those narrow passes do not close model-grounding issue #12 or structured-brief reliability issue #6.

No experiment was launched, no accepted ontology/model records were changed, and no enterprise data connector was provisioned. Synthetic QA sessions were soft-deleted. Draft publication remains separate from merge and production promotion.
