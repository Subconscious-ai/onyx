# Executive interview acceptance proof

Historical reference; current execution belongs to [current operations](README.md), [acceptance procedure](end-to-end-acceptance.md), and [open work](https://github.com/Subconscious-ai/onyx/issues?q=is%3Aissue+is%3Aopen).

[Original plan, decisions and evidence at the retained revision](https://github.com/Subconscious-ai/onyx/blob/bc77893dc381ea776b5e3027b71507a682a16680/docs/subconscious/executive-proof-plan.md).
Consult it for historical context, not current status, credentials, deployment state or authorization.

## Interview-to-model branch evidence

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
Twenty-eight focused Python checks passed at that revision. Hosted candidate 1 passed all ten
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

### September 11 replay findings

Thirty-six focused Python checks now pass. Actual replay failures drove the
following narrow repairs: one bounded schema-repair attempt within the existing
time budget; mandatory source indices with server-copied original quotes;
explicit distinction between a stated sequence and a proven causal effect;
rejection of goal statements presented as observations; zero-question guidance;
and useful, source-free feedback for invalid source indices. The existing
preparation model remains Bedrock DeepSeek v3.2, now with reasoning enabled.
Conversation remains Bedrock GPT OSS 120B. No Anthropic model was selected.

Candidate 6 passed all ten turns and three saved-brief checkpoints. Candidate 7
on the same runtime failed source/unknown preservation, and candidate 8 with
reasoning enabled failed an invalid-source-index check. A single passing replay
is therefore not evidence of reliable extraction. All failed receipts remain
private, and final release proof remains pending. Current API candidate:
`executive-ece5efebf0`, layered over the five Beca fixes without changing persona,
tools, rootless execution or sharing.

The paired causl-kb correction `eee6ef33` fixes target-purpose detection for
CamelCase/snake_case model names. The real hosted save/reload retained POINT
target 0.95, two empty unknown inputs, four selected stages and three transitions.
The PostgreSQL-backed Library returned the three evidenced journey transitions.
The direct local DATABASE_URL is a different database and is not hosted proof.
The browser harness now additionally checks the native button handshake and
canonical Library source readback; those new checks are not yet a passing receipt.

### Private deployment artifacts

Vercel CLI does not use nested Git ignore rules for deployment uploads. An
initial CLI preview included private QA session artifacts. The unaliased preview
was deleted, two exact Clerk sessions revoked, and the exposed native Onyx cookie
denied after logout. An old recovery helper also printed an inline password;
the native password was rotated and the old password rejected. Beca coordinated
rotation of the two Vercel automation bypass keys without disabling protection.
Previously issued protection-cookie invalidation is not assumed.

The replacement frontend is built from an exact Git archive, not a working tree.
`.vercelignore` excludes QA, environment and browser artifacts. Credentials are
read privately at runtime, never embedded in generated helper source or logged.
Vercel protection redirects are not application success: validate status,
content type and authenticated identity separately. The clean frontend reopened
the saved native interview, exposed the corrected model destination and returned
404 for the private artifact path without browser errors.

### Final hosted path, September 11

The API image `executive-f509b393b7` preserves the existing saved brief during
incremental extraction. No second memory store exists. The image retains the
Beca runtime fixes and existing persona tools. Thirty-nine focused Python checks
pass. A later source commit changes formatting only; another corrects evaluator
handling of unknown derived rates.

Candidate 10 passed ten turns and three checkpoints. Candidate 11 retained the
briefs but exceeded the spoken-word budget once. Explicit attention guidance
addresses that failure. Candidate 12 passed ten turns and three checkpoints.
Candidate 13 retained an unknown renewal baseline in the OKR and computed the
rate from unknown counts. The original evaluator incorrectly required a duplicate
rate input. The corrected evaluator checks matching inputs and OKR baselines
together; a fabricated value in either location still fails. The original
failed receipt remains unchanged. Candidate 14 passed all ten turns and all
three native saved-brief checkpoints on the unchanged hosted API.

Paired causl-kb `c5d0a86` corrects an actual provider-input omission: the reviewed
model brief was attached after generation but never sent to generation. The
correction sends the reviewed equation before generation and keeps unproven
drivers description-only. Thirty focused checks, TypeScript and ESLint pass.
All four actual CI checks pass, including restricted-role PostgreSQL tests.

The candidate 12 native-button browser run passed against the corrected hosted
services: three stages, two transitions, five canonical Library source readbacks,
six model cells, exact revision-one readback and duplicate-save HTTP 409.
The 95% target remains POINT 0.95. Two unknown counts remain empty. Manual formula
inspection confirms approved renewals / eligible customers, required renewals
and the target gap. No weekly-use uplift or invented coefficient exists.
The grid remains a symbolic draft, not a numeric forecast.

Proof run: `701f983a-4d2b-472d-bd89-663968ccb309`.
Candidate 14 also passed the complete browser path in run
`74986acf-ca27-4f2a-b036-cc10aa0c84e3`: seven cells, five canonical source
readbacks, retained target and unknowns, exact save/reopen and duplicate refusal.
The first browser repeat timed out on network silence despite a usable handoff
button. The runner now waits for the real button instead; application code is
unchanged. Both original failed receipts and successful receipts remain private.
Frontend: `dpl_2GneUZToKgfxhfxkDiMh7Ao2a2gA`, source `f2ed7b14fe`.
causl-kb: `dpl_1skSc2ChUjFsL3jZxaFMBjaQntJJ`, source `c5d0a86`.
Both frontend archives exclude private working files. Native login, saved-chat
reload and exact compiled destination checks pass before alias assignment.
The live API owner/CAS check rejects foreign ownership and stale updates while
preserving the original transcript. No production rollout or DNS change occurred.

The public Onyx fork cannot use the organization AWS runner group because
`allows_public_repositories` is false. September 11 approval permits GitHub-hosted
CI for the Burn release check. The existing five-minute proof job now requests
Ubuntu 24.04; test commands, pinned validator, read-only permissions and disabled
checkout credential persistence remain unchanged. Shared AWS runner security
and unrelated upstream workflows remain unchanged. Verify the actual hosted
job before removing the runner-access blocker or making a publication claim.

## Active September 19: adversarial email-to-model UAT

This checkpoint supersedes the old fixed-turn humor and completion requirements above.
Use existing draft Onyx #31 and causl-kb #575, with worktrees `worktrees/onyx-interview-model`
and `worktrees/causl-interview-model`. Keep both PRs unmerged for user QA.

Outcome: six adaptive synthetic executives across energy, software renewals,
retail, consulting capacity, home services and manufacturing. Test incomplete
knowledge, corrections, incompatible units, infeasible objectives, hostile source
instructions and employer/client mismatch. The requested target is 60 seconds
from accepted email to a usable first model, with real provider evidence and
causl-kb readback. Measure rather than assume that target.

Reuse native login, profile/research handlers, Celery extraction, existing browser
handoff and model save/reload. Extend the existing evaluator; do not create a new
agent runtime. Distinguish real fresh discovery, cached discovery and PDL no-match.
An independent tester owns adaptive scenarios and does not mutate shared profiles.

Milestones:
1. Record six baseline transcripts, saved-brief receipts and independent arithmetic
   oracles. Preserve failures; don't retry until a lucky pass conceals instability.
2. Repair demonstrated shared defects through existing handlers/storage. Research
   and PDL are unaccepted evidence; never infer organization access from an email.
3. Verify affected cases, then one final unchanged-candidate sweep, browser handoff,
   actual calculated model cells and Postgres readback. Publish an honest outcome
   matrix including unproven or failed timing/storage boundaries.

Current discovery: Onyx persists discovery in its own Postgres. The existing KB
handoff only persists a reviewed model and selected supported journey statements;
it does not prove continuous KB ingestion. KB's inherited bootstrap already owns
burn_dossiers and research jobs and must be inspected before adding any bridge.
Separate Auth0/Clerk sessions remain, and issue #450 was closed as deferred, not
completed. A component-test pass or HTTP 200 cannot stand in for these boundaries.

Recovery: continue six-case harness and examine existing KB bootstrap. Preserve
private transcripts and credentials outside Git under the existing acceptance
artifact directory. No new production identity/permission changes are authorized
by a desire for a faster demo.


September 19 iteration receipts (private acceptance artifacts, `adversarial/`):
- Fresh native PDL provider probe: 0.93s; fresh GPT Researcher: 15.98s, eight
  original sources. Separate real-email handler proof, not a combined model clock.
- Fresh QA email login: 6.4s; email matched `/me`; automatic enrichment started
  at 8.7s, returned an honest no-match at 9.2s. Public company is then required.
- Initial six-case sweep: 6/6 saved, only 3/6 under 60s; three model defects.
- Candidate sweep: 6/6 saved in 30–48s, 5/6 complete structured coverage,
  4/6 passed independent semantics. Energy emitted an uncalculated 140 instead
  of 150 and lost a known rate; services omitted an explicitly stated journey.
  Retain these failures; candidate timing alone is not success.
- Native v2 fixes research locks to belong to jobs (a live company-change test
  had otherwise exhausted 60 seconds behind obsolete research). It clarifies
  latest-answer extraction and aggregate-rate evidence. Existing AWS model
  configuration is unchanged. Canonical turn reminder defers unsolicited benefit
  arithmetic to the model and requires a calculator for requested arithmetic.
- Focused proof: 64 dependency-light contract tests, 34 native-runtime worker/
  profile regressions, 20 UI/catalog tests and web types. The scoped research-lock
  regression failed before the fix. These are not provider or full-stack proof.

Recovery: native v2 is being activated; run the unchanged six-case sweep and
company-correction canary after health/gateway verification. KB PR575 retains the
matching source dossier atomically when a model is saved and repairs known-number
citations. It still does not continuously mirror research during the interview.
Keep both PRs draft. Do not claim the combined 60-second objective until native
login, real enrichment, interview, calculation and KB readback pass together.


Final-candidate changes and demonstrated results:
- v2 interviews: all six saved/reopened under 49 seconds. Energy preserves its
  5.5% aggregate baseline; services now retains the supplied journey. Conservative
  downgrading of mixed factual/scenario messages and dropped hypothetical inputs
  remain useful adversarial findings, not evidence of invented facts.
- A genuine agent-led services interview was also run. Including tester reasoning
  and tool round trips, its saved brief was observed at 123 seconds, not 60 seconds.
- Corrected-company GPT Researcher completed in 17.1 seconds with nine sources
  and a new research ID. Positive PDL remains a separately measured provider probe.
- Real model UAT: energy 550→700 contracts (+150); SaaS $2.1M→$2.4M retained ARR;
  home services $120K→$160K revenue. Each used real model calculations and saved,
  reopened native models. These are synthetic QA operating numbers, not customer
  business performance or experiment validation.
- v3 adds conditional research row updates under Postgres SELECT FOR UPDATE.
  Four deterministic stale-write interleavings failed before the fix; 16 research
  tests pass after. It also marks explicitly unavailable nonnumeric operating
  notes unknown and aligns interview handoff guidance with target/timeframe checks.
  Combined candidate: 55 native-runtime tests and 65 dependency-light contracts.
- Frontend `aec816041d` deployed on the canonical domain; authenticated mobile
  check sees the signed-in email and opens the intended paired model workspace.

Do not merge. Full acceptance still needs the final v3 receipts and honest source
storage boundaries. Source research is retained in causal-KB at explicit model
save, not continuously during interview; native Onyx owns working chat context.

September 19 frozen v3 acceptance and recovery:
- All six briefs saved and reopened: energy 34.490s, SaaS 34.993s, retail
  32.648s, services 40.667s, home services 48.389s, manufacturing 24.229s.
  Only five were ready. Manufacturing incorrectly treats explicitly untrusted
  supplier text as an unresolved conflict. These are interview-to-brief clocks,
  not a combined login/enrichment/model clock. The six-case driver is adaptive
  rule-based automation; independent agents reviewed the actual outputs.
- Fresh corrected-company research completed in 18.409s with eight sources.
  A real Postgres lock-contention canary proved that an old job cannot overwrite
  a committed replacement job. Test rows were removed and absence verified.
- KB receiver 6564a3d is deployed on the paired model-workspace preview. Actual
  calculated models passed energy, SaaS, home-services and manufacturing oracles;
  retail preserved hypothetical inputs as hypotheses. Model save/reopen and
  increasing tenant-scoped dossier row counts were independently observed.
- Positive research handoff retained nine source URLs and saved/reopened a model,
  but its aggregate baseline remained uncomputable. Services returned 502 before
  model save. Neither result passes the usable-model gate.
- Bounded alternate-extractor probes are retained, not retried to a lucky pass.
  AWS configuration 8 with LOW reasoning and source-only extraction still failed:
  retail schema invalid, energy omitted the observed rate from operating inputs,
  SaaS restored a superseded objective. Do not activate this configuration change.
- An additional draft-only grounding guard demotes invented journey actors and
  connected behaviors to assumptions. Red-to-green regressions plus 67 contracts
  and Ruff pass. It can conservatively demote paraphrases; it is not full semantic
  entailment validation. This guard has NOT been deployed or live-swept.
- Live native image remains onyx-burn2:adversarial-v3-20260919; extractor remains
  configuration 5. Latest frontend code change after aec816041d is formatting only.
  Quality CI now passes; inherited AnyIO dependency audit remains failing. Other
  heavyweight checks were still pending at this checkpoint. Neither PR is merged.

Resume with manufacturing conflict classification and the two model-generation
failures. Reuse retained failing handoffs and arithmetic oracles, then run one
unchanged-candidate six-case sweep. Prove a single combined email/login → fresh
providers + adaptive interview → calculable model → KB readback clock. Continuous
KB evidence ingestion remains unimplemented; do not describe save-time retention
as that capability. Private receipts live in the existing burn-acceptance artifact
store; keep credentials and full transcripts out of public GitHub comments.

Build-button follow-up, September 19:
- User-observed failure reproduced with the real button: it opened a manual import
  review and did not save a model. The incomplete-state label also promised a build
  while merely sending another chat message.
- Reuse the existing authenticated origin/nonce handoff with explicit build intent.
  The paired receiver creates/reuses a chat-bound workspace, proposes and evaluates
  through the native compiler, saves a private draft with no ontology promotions,
  and navigates only after durable save. Manual import stays available separately.
- Refresh company/research context after a saved brief so a profile-tool correction
  made during this conversation reaches the handoff without reloading the page.
- Six adversarial cases remain the final regression boundary; fixing the actual
  button-to-grid path and showing a single continuous browser journey takes priority.

September 19 actual Build acceptance, active follow-up:
- Native image `onyx-burn2:build-model-v5-20260919` completed one frozen
  six-case sweep. Saved and reopened briefs: energy 55.5s, SaaS 45.2s,
  retail 37.3s, services 52.8s, home services 34.6s, manufacturing 51.5s.
  These timings exclude login, fresh discovery and model compilation.
- Actual button tests saved, reopened and listed energy, SaaS and home-services
  models. Executed arithmetic matched 550→700, $2.1M→$2.4M and $120K→$160K.
  Repeated Build recovered the existing model without overwriting it.
- The same sweep exposed retail unit validation failure, and omitted numerical
  inputs in services and manufacturing. Compiler fixes and repeat proof remain
  required; a successful save alone is not a successful business model.
- Fresh browser testing exposed selected-agent loading falling back to agent 0.
  Commit `b0f7af465f` prevents that fallback and blocks submission before input
  clearing until the selected agent resolves. Focused regression and types pass.
- Test setup must preserve the profile correction revision counter. Clearing its
  current key while retaining revision history causes an artificial duplicate-key
  failure. The private synthetic QA fixture was repaired; do not change customer
  revision semantics to accommodate a broken test reset.
- All work remains in draft PRs #31 and causl-kb #575 for user QA.

Final compiler candidate `df07604` (causl-kb):
- Reuses the validated interview brief to bind source-backed numeric inputs.
  The model selects structure; application code carries the original value and
  exact source. Unknown IDs, conflicting values and changed target purpose fail.
- All 46 focused compiler tests, lint and full TypeScript checks passed. Live
  generation checks passed for retail, services and manufacturing. Saved browser
  verification on this candidate remains the delivery gate.
- Delayed-agent browser regression passed on Onyx `b0f7af465f`: no submit while
  unresolved, one submit after loading, persisted persona 5.

Live-stream and company setup corrections, September 19:
- `3ea5bfd7d6` fixes the original no-reload Build failure. Earlier live assistant
  replies can have empty `message` fields and text only in packets. Use existing
  `interviewMessageText` for handoff serialization, as the chat projection does.
  Reloading materializes stored text and can hide this defect. The distinguishing
  regression checks streamed text, excludes reasoning and retains the saved brief.
- Company setup must use `company_profile`; general `add_memory` does not start
  research. `e601d8eaab` clarifies initial setup and field meanings, and lets the
  tool read an omitted revision before the existing checked update. Explicit
  revisions, owner identity, incognito refusal and concurrent-edit rejection stay
  intact. Eight tool boundary tests and three real Bedrock selection/persistence
  canaries pass with general memory also available.
- Serving native image: `onyx-burn2:profile-routing-v6-20260919`. Its profile tool
  matches the committed source hash. API health and gateway reload passed after
  activation; this image does not change interview extraction or model providers.
- Receiver `5d880a6` preserves independently verified citations for a repeated
  fact. A KR and operating input can cite different real answers for the same
  value. Requiring one identical excerpt rejects valid evidence. Forty-nine
  focused tests, lint and types pass; the repeated-source manufacturing canary
  calculates $300K baseline, $360K target and $60K gap.

Final source and startup guards, September 19:
- `ff9d41ddde` corrects the packet serialization boundary: user messages must
  retain their exact original `message`; only assistant messages are reconstructed
  from streamed packets. User objects can carry paired assistant packets. The
  adversarial exact-transcript assertion caught this before acceptance. The failed
  manufacturing QA save is retained as a failed artifact, not counted as a pass.
- `ccd5079bdf` uses Onyx's existing one-cycle REQUIRED tool selection when an
  authenticated persistent Burn interview has no working company and the real
  company-profile tool is assigned. Explicit tool choices remain authoritative;
  incognito, other agents, and deep research are excluded. Later cycles restore
  the full tool set. No new orchestration service or permission path was added.
- Prompt-only routing and isolated tool canaries were insufficient: the full
  native conversation could narrate a profile update with zero tool calls. Live
  proof must inspect actual profile/research results, not the assistant's claim.
- Sender preview `ff9d41ddde` was verified Ready and assigned to the canonical
  Burn QA host. The receiver remains `5d880a6`. Final cold-provider journey and
  sixth saved-model verification are still pending; this is not a completion claim.

Fresh single-journey browser proof, September 19 16:06 UTC:
- Canonical frontend `ff9d41ddde`, native image
  `onyx-burn2:profile-routing-v7-20260919` (`ccd5079bdf`), paired receiver `5d880a6`.
- Fresh Auth0 login, email-triggered PDL lookup (legitimate no-match), native
  company-profile correction and GPT Researcher queue all occurred. Eight fresh
  public source URLs were ready at 40.4 seconds while the interview completed.
- Actual Build clicked at 43.5 seconds; Postgres model save completed at 55.8
  seconds; model grid opened at 56.182 seconds; reload succeeded at 57.7 seconds.
  Exact original executive messages survived the handoff. No page reload was used
  before Build. No accepted ontology rows were silently created.
- Independent expected outputs and real UI values agree: 1,000 visitors times
  5.5% gives 55 contracts; 7% gives 70; incremental monthly contracts is 15.
- The final list check initially failed because two QA models shared a display
  name. The harness now selects the exact market URL. A read-only follow-up proved
  that link and the calculated grid without regenerating or altering the model.
  The original failure receipt is retained alongside `completed-proof.json`.
- Timing covers an automated two-turn executive, warm services, cold provider
  caches and an existing authorized causl-kb Clerk session. It is a measured
  successful run, not a latency guarantee or proof of cross-app SSO. A positive
  PDL match was not invented; earlier cold-discovery evidence covers that path.
- Private receipts, captured source messages, model readback, screenshots and
  browser video remain outside Git under the acceptance artifact store's
  `single-journey-v8` directory.

Six-case adversarial closure on the paired candidate:

| Case | Independent saved-model / UI proof |
| --- | --- |
| Energy | 550 baseline contracts to 700 target contracts |
| SaaS | $2.1M baseline to $2.4M target; corrected 80% retained, superseded 75% excluded |
| Retail | Four unknown operating inputs stay unknown; unsaved scenario computes $5M from 200 stores × 50 weeks × 100 pints × $5 |
| Services | 40-project capacity and $40K margin imply $1.6M ceiling; $2M target remains a target |
| Home services | $120K baseline; unsaved 40% booking scenario computes $160K, 400 bookings and 320 completions; reload restores saved baseline |
| Manufacturing | $300K baseline to $360K target; injected 50% rejected, actual 25% and target 30% preserved |

Each has actual Build, source-equality, persistence and reload evidence. The final
manufacturing interview took 54.2 seconds; its separate Build/save/reopen flow
36.2 seconds. Do not add a false claim that all six full journeys took 60 seconds.
The earlier five model proofs remain valid; their mathematical compiler and
receiver content did not change. Manufacturing was repeated after the exact-text
sender correction. Failed earlier receipts remain available. All changes remain
in draft PRs for user QA; this closure does not imply merge or production release.

