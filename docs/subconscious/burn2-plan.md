# Active: Burn 2.0 journey and OKR handoff

## Issues to address
Onyx issue 1 / draft PR 2, paired causl-kb issue 507. Primary outcome: customer behavior journey and measurable OKRs support a reliable, experimentable Guesstimate business model. No merge before executive QA. Preview delivery only.

## Important notes
Native Onyx supplies conversation persistence, AWS models, tools and streaming. Current brief is a display projection. causl-kb owns accepted ontology and private Guesstimate documents. Existing OKR rows require known numeric baselines; incomplete OKRs must remain drafts. Existing model proposal uses the native AWS required-tool path. The causl-kb Ask experiment is closed and uses shared admin credentials; do not revive.

## Implementation strategy
1. Add versioned journey/OKR model brief with evidence, explicit unknowns, transition links, and material gaps. Preserve version-one conversation readback. Tests first for corrections, unknowns, target/observation separation and readiness.
2. Improve native interview rubric around objectives, customer behavior and a useful stopping point. Retrieve public context only when material. No extra model call per ordinary turn.
3. Add reviewed handoff into authenticated causl-kb using explicit browser transfer or file import. Derive organization from the causl-kb session. Reuse existing proposal and private model storage. Preserve the complete model brief in the saved model context. Never overwrite an existing model implicitly.
4. Accept only individually reviewed supported journey statements through the canonical safe door. Keep unsupported structure and incomplete OKRs as drafts. No schema migration, second ontology, new calculator or new chat framework.
5. Exercise three synthetic cases, source and calculation guards, database isolation, browser handoff, reload and mobile. Publish paired draft PRs and exact previews. Report failed quality gates explicitly.

## Tests
Focused failing regressions at contract and authorization boundaries before runtime changes. Real PostgreSQL for tenant isolation. Native AWS conversations for consulting behavior; native Guesstimate for calculations. Browser tests use synthetic conversations only. Existing executive conversations remain untouched.

## Recovery
Implementation is present in Onyx branch codex/1-executive-interviewer and causl-kb branch codex/507-burn2-handoff. Native saved-brief preparation, reviewed import, tenant-safe model/evidence save, and native model preview are implemented. Ordinary chat remains on the native hot path. Model preparation uses one bounded repair attempt after a concrete compiler error; no extra interview turn is required.

The core AWS replay passed 9/9 turns. Onyx source/persistence regressions and real native owner/CAS checks pass. causl-kb full unit/Chromium suite passed 646 tests; real PostgreSQL RLS checks passed separately. Browser preparation returned 200 and the authenticated model save/reopen returned 200. General research/calculation stress tests still show provider-dependent failures; no universal reliability or production readiness claim is authorized.

Next: finish the exact-source compiler/browser checks, publish paired draft candidates and Vercel previews, then retain unmerged for executive QA. Existing executive conversations and unrelated peer edits remain untouched. Runtime deployment details and production boundaries live in burn2-operations.md.

## Active executive QA corrections

Outcome: automatic sourced working brief, a persistent bottom model action, quieter conversation, and verifiable preparation receipts.

Findings: preparation currently hides under a tab and reloads the page. Native chat stores one structured brief in the reported session. PDL is not connected. Jerry is only a static roster entry. Internal search is enabled without explicit document sets. The two applications use separate authentication authorities. causl-kb policy assigns the identity cutover to Auth0 issue 450; do not create a credential bridge or infer organization membership from email.

Milestones:
1. Test automatic extraction scheduling, saved-response projection and stale request handling. Refresh the brief after completed executive turns without blocking streaming, duplicate requests or page reloads. Show extracted journey and OKR counts, a persistent model action and truthful draft/accepted boundaries.
2. Remove the input focus rectangle while preserving keyboard focus at the composer boundary. Reduce boilerplate, hide repeated quotes behind disclosure, remove engine names from executive labels, and give the four specialist roles distinct objectives. Add one grounded fifth-turn Jerry contribution through the existing generation.
3. Reuse native encrypted Postgres storage for minimal account-scoped PDL context; enrich outside the chat hot path, cache outcomes, and expose actual status. Verify the existing MBB corpus and native retrieval path using analyst-agent conventions. Do not copy a second agent runtime.
4. Verify real AWS interviews, automatic readback, PDL receipt, retrieval receipts, desktop/mobile and paired preview handoff. Publish updated draft candidates; retain the enterprise SSO dependency explicitly rather than bypassing authentication.

Tests: focused source-grounding, single-flight/coalescing, authorization and profile minimization regressions; real browser checks for automatic preparation, visible progress and keyboard focus; real tool receipts for enrichment and retrieval. Existing customer transcript remains unchanged except source-validated brief metadata under the existing preparation contract.


QA correction recovery: automatic native-packet extraction and saved readback passed browser verification, with a visible bottom action and no editor rectangle. Focused UI regressions passed 25 tests; profile/role, routing and source validation passed 14 Python tests. Revised live dialogue stopped repeated unknown-baseline questions and produced fifth-answer humor; native internal_search returned a real source. Raw style deviations are documented, with tested display normalization. Final steps: exact-source preview deployment, hosted automatic readback, updated draft PR evidence. PDL uses only the signed-in account email and retains an unconfirmed provider match; live provider receipt is pending. Shared authentication remains the existing Auth0 #450 dependency. No merge.


Final hosted discovery: a stated numeric objective survived extraction, but keyResults and model.inputs were empty. The UI correctly refused readiness; cached partial metadata prevented recovery. A focused regression now detects missing contract fields. A sourced numeric objective requires key results and named inputs; unrelated numbers never force invented objectives. Incomplete cached briefs refresh automatically. Final browser proof must reopen the retained incomplete synthetic chat and verify recovery without another executive answer. PDL endpoint now returned ready twice with an identical cache timestamp after configuring an existing working credential. The earlier credential was exhausted (402). No global credential file changed.

The recovery case also exposed schema drift: Yup required strings were exported without minLength, so the backend accepted an empty horizon that the frontend rejected. The schema exporter now preserves required-string semantics. Invalid cached briefs regenerate from source rather than returning an unreadable payload. A distinguishing backend regression failed before the fix and passed afterward.

Final recovery proof: reopening the retained incomplete synthetic chat automatically prepared a valid saved brief (HTTP 200) and revealed Open business model without another answer. Focused UI tests passed 26 tests and TypeScript validation passed. PDL returned a cached ready receipt. Hosted exact-source automatic preparation and paired handoff remain the final publication checks.
