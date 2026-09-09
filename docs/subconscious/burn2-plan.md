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
