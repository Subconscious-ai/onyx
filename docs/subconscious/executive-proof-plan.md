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

Hosted replay remains unverified. No authorized native Onyx cookie jar or organization-authenticated causl-kb browser state was found in the scoped QA artifacts; an available Vercel protection cookie is not an application login. No running AWS backend or native persona was changed. Next: obtain existing authorized QA sessions, release the matching backend/reminder candidate while preserving concurrent Beca configuration, then execute the two linked hosted runners. DNS stays parked under #11. No merge or production-readiness claim before the complete hosted path passes.
