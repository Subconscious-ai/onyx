# Executive interview acceptance proof

Active: Onyx #13, paired causl-kb #544. Baselines: Onyx `abce3f30af`, causl-kb `c51c546`.

## Outcome and boundaries

Prove a short synthetic interview preserves corrections and unknowns, produces a saved reviewable brief, and crosses the existing causl-kb review/safe-door boundary into canonical journey evidence and a private model. Jerry contributes one business-grounded roast on executive answer four. No new ontology, chat state store, provider, domain change or production migration.

## Work and evidence

1. Extend the existing Python interview evaluator and deterministic regressions. Replace fifth-answer timing with fourth-answer timing; keep opt-out and distress safeguards. Require actual native transcript/brief readback, not HTTP success alone.
2. Extend causl-kb's real PostgreSQL suite and route tests. Verify reviewed source lineage, exact model round trip, unknown values, corrections, atomic rollback, stale-save refusal and tenant isolation.
3. Run focused checks and one authorized synthetic hosted run when existing credentials permit. Keep synthetic transcripts private; publish only counts, bounded failure names and revision identifiers. Distinguish local tests, live provider proof and deployment.

## Discoveries

- `acceptReviewedJourney` already calls the shared `upsertNode` / `addEdge` safe door inside the model-save tenant transaction. Drafts remain drafts until explicit organization review.
- Server guidance and reminders currently schedule Jerry on answer five: a demonstrated mismatch.
- The existing evaluator never verifies model preparation/readback and leaves `usable_model_pass` unset. Existing issue #6 tracks intermittent extraction failure; #12 tracks unsupported conversational claims.
- Primary causl-kb checkout and other worktrees contain unrelated active work; use isolated branches.

## Recovery

Worktrees: `/home/avi21/subconscious-ai/worktrees/onyx-executive-proof` and `/home/avi21/subconscious-ai/causl-kb/.worktrees/issue-544-onyx-proof`.
Implemented: fourth-answer server/reminder change, evaluator readback/checkpoint/export support, source/correction/unknown and opt-out scenarios, and scoped AWS CI. The fourth-answer test failed on the old implementation and passed after the change. Twenty-seven focused Python checks pass; Ruff passes.

Paired causl-kb tests passed against real disposable PostgreSQL: 18 checks, with 66 tenant tables forced-RLS protected. Fifteen handoff/route checks and the actual review-component Chromium check pass. The component test simulates the calculator result; the hosted browser runner uses the real native calculator and real HTTP endpoints.

Correction: authorized QA sessions already exist in the private local recovery
directory outside the repository. Native Onyx login and causl-kb organization
login both passed; lack of credentials was not the blocker.

The AWS candidate `executive-5787c6f343` and fourth-answer native reminder are
deployed. Model, system prompt, tools, document sets and sharing remain intact.
Twenty-eight focused Python checks pass. Hosted candidate 1 passed all ten
conversational checks, including correction retention, no-question requests,
fourth-answer Jerry and humor opt-out. Two intermediate preparation calls
failed (invalid transition endpoint; missing structured tool response). The
final saved draft preserved unknown inputs and the corrected target but lacked
a fully source-supported journey transition. No successful complete
interview-to-model run exists yet.

The isolated Python executor's stale-socket failure is fixed and passed an
actual daemon restart plus execution check; see `durable-hosting.md`. Shared
AWS deployment writes are coordinated with the concurrent Beca task. Next:
compare the existing non-Anthropic Bedrock preparation models, repair only the
demonstrated extraction failure, and run both hosted runners successfully.
The public fork cannot currently access the private-only organization AWS
runner group; do not widen runner access silently. DNS stays parked under #11.
No merge or production-readiness claim before the complete hosted path passes.
