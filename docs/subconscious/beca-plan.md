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

## September 11 acceptance repairs

Job: make the three requested workflows discoverable and make visual requests and saved-experiment reads usable.

1. Remove upstream product announcements and customer-facing branding. Preserve operational notifications, source identifiers, and licenses.
2. Render Mermaid through the maintained library with strict sanitization and a recoverable source view. Reuse native image generation with AWS credentials; distinguish illustrations from diagrams.
3. Expose Executive interview, Experiment design, and Experiment analytics through native personas and compact navigation. Preserve existing conversations and drafts.
4. Trace authenticated Rehoboam discovery. Reuse the existing authorized run list and smolagents interpreter. Never accept a model-supplied owner or equate unavailable results with no experiments.
5. Verify focused regressions, actual image output, diagram rendering, persona navigation, and authorized saved-run discovery. Publish the exact candidate to the existing draft preview. Keep merge pending executive QA.

Initial inspection found an older seventeen-tool Rehoboam production catalog. Fresh upstream inspection located the already implemented thirty-tool dev catalog, including `find_experiments` and `ask_analyst`. Native MCP server 3 now targets the existing dev endpoint; no Rehoboam code or duplicate server was needed. The temporary discovery issue was closed as superseded.

The native agent catalog now contains private Experiment design and Experiment analytics personas, beside existing Burn 2.0/Beca. Navigation resolves authorized catalog entries rather than fixed IDs. A real analytics chat returned three saved studies in 6.9 seconds with cache limitations. Initial diagram canaries overused analytics tools; an explicit latest-request reminder corrected the final canary to Mermaid in 1.8 seconds without tools. Actual browser rendering passed in light and dark themes at 390×844 without horizontal overflow.

Focused UI checks pass 33 tests, TypeScript passes, and five backend checks cover native AWS image routing, notification ownership/filtering, and MCP chart persistence. The image adapter reaches AWS but Nova Canvas invocation is denied; the local AWS login has expired. Picture generation remains unconfigured until narrow model permission and a real output canary pass.

Backend packaging extends the current executive-proof runtime rather than replacing concurrent interview fixes. The rootless Python service now binds the stable runtime directory at /var/run and preserves that directory across restarts. The native entrypoint requires /var/run/docker.sock even when DOCKER_HOST points elsewhere; a socket-file bind retains a stale inode after daemon restart. The executive-proof task verified native execution before and after a real restart. No new executor image is required.

Publication and final hosted proof are recorded in PR #10. Merge remains pending executive QA. No paid experiment was launched and no accepted model or ontology records were modified during Beca QA.

### Hosted repair proof

Candidate `76a416ea93` passes GitHub Jest (1,274 tests), quality, dependency audit and Vercel checks. The web tree is identical to the browser-verified `f80240d4c8` tree; follow-up commits align existing environment documentation and the root widget Next.js pin with the executive-proof fixes. No audit suppressions were added.

AWS runs the five-module overlay `onyx-burn2:beca-20260911`, image `sha256:7efe1dbd1c04f1e0b7e12d86179770f8ffb8efe4b120d3a4164efb1b8f14df78`, based on `executive-32b6026edc`. The interview api/profile/validation file hashes match the base exactly. Persona 5 and the proven rootless socket mount were preserved. External health and hosted notification list/count reads return HTTP 200; upstream promotions are absent.

The existing Rehoboam `ask_analyst` returned a source-bound attribute-importance chart in 64.4 seconds. Native storage served a 58,169-byte PNG; the hosted mobile browser decoded the 631×300 image at a 350-pixel display width without overflow. A canary validator initially matched a partial streamed URL; final verification used the complete returned file ID and real browser retrieval.

The three requested workflows are pinned for the review account. Older personas and conversations remain available. The Beca branch model destination now points to the verified causl-kb preview `https://causl-lw0z6f3rh-subconcious.vercel.app/dashboard/burn-import`, which fixes the separate CamelCase target-admission bug. Full executive-to-model replay remains owned by the paired executive-proof PR; the Beca visual repair does not claim completion of that broader release.

Picture generation remains blocked on AWS Nova Canvas authorization and expired administrator AWS login. Keep PR #10 draft and unmerged pending executive QA. Exact final deployment and cleanup receipts are recorded in the PR.
