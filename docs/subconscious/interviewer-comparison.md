# Executive interviewer comparison, October 1, 2026

Tracking: [#46 — choose an interviewer that earns useful private guidance quickly](https://github.com/Subconscious-ai/onyx/issues/46).

## Decision boundary

No platform has passed authenticated entry to a saved, reopened market model in 60 seconds.
This work tests moderation through real platform APIs. It does not certify the complete product pipeline.
ElevenLabs remains blocked by an invalid credential. Do not select a three-platform winner from two platforms.

Keep native Onyx as the product host. Do not add a second production framework from these results alone.
Retain the private comparison so ElevenLabs can complete the same test when its credential works.

## Agreed outcome

The interview adds one material private priority, constraint, correction, or contradiction to the first model.
Background PDL, GPT Researcher, and accepted ontology provide public context. The initial ontology may be empty.
Each market gets its own business model. Missing quantities remain explicit unknowns.

The full acceptance clock starts at authenticated entry and stops at a saved, reopened model.
It includes executive reading and response time. Interview, enrichment, research, and model-generation clocks remain separate.
The approved ceiling is $20 per customer across all vendors and rounds, and $240 across twelve customers.
Credits count as metered usage. The comparison requires six development customers and six unseen review customers.

## Existing capabilities used

- Native Onyx creates, streams, and reopens private conversations. No replacement chat, memory, or authentication service was built.
- Parlant 3.3.2 uses its official SDK, conditional guidelines, native retriever, and session events.
- Both moderators use AWS Bedrock `openai.gpt-oss-120b-1:0`. The simulated executive and diagnostic evaluator use that model too.
  These findings apply to this model/configuration; they do not rank every model available on each platform.
- Parlant uses LiteLLM 1.103.2 and Titan V2 embeddings. Boto3 is 1.43.106; HTTPX is 0.28.1.
- The final Parlant configuration uses its native `NullPerceivedPerformancePolicy` to remove cosmetic preambles.
- The existing six-case adversarial UAT dataset and its arithmetic expectations remain the development foundation.
- The harness adds only platform adapters, sealed-answer testing, timing, and a persistent budget ledger.

The private Native POC was configured through an existing administrator's native persona functions.
It was shared only with the existing authorized QA principal. User roles and live Beca settings were unchanged.
Generic private personas do not invoke Burn's name-specific background brief worker. Their transcript retention is distinct from model persistence.

## MBB guidance used

Reviewed the original [Bain customer-journey guidance](https://www.bain.com/insights/management-tools-customer-journey-analysis/),
[BCG journey-program guidance](https://www.bcg.com/publications/2020/customer-journey-programs-hard-get-right),
and the Wharton hospital-software case in the owned casebook.
Customer decisions must connect to business economics. A journey diagram alone does not establish a useful model.
Use a researched journey as a provisional reference and earn a private correction about buying, approval, or delivery.
Two comparable, attributed claims are required before presenting a contradiction. Cases never supply company facts.

Source revisions: `mbb-casebook` at `7bf300097add0bc05663bb6bac9b92bc16ee74a3`;
`analyst-agent` at `54720dd8aa99e1cfd0c2aeecf10ef464472d1895`.
These references informed the instructions. The moderation fixtures did not test live corpus retrieval.

## Development rounds

Each available platform produced six customer transcripts in each of three rounds.
Early setup failures and calibration runs are preserved privately and excluded from the table.
These are descriptive timings; the baseline protocol defects below prevent a causal claim about improvement.

| Platform | Round | Measured moderator median | Modeled human median | Combined median | Combined under 60s |
| --- | --- | ---: | ---: | ---: | ---: |
| Native Onyx | 1 | 8.2s | 104.5s | 112.7s | 0/6 |
| Native Onyx | 2 | 6.3s | 90.8s | 96.7s | 0/6 |
| Native Onyx | 3 | 4.8s | 71.2s | 76.3s | 0/6 |
| Parlant | 1 | 31.5s | 73.6s | 109.6s | 0/6 |
| Parlant | 2 | 34.7s | 74.6s | 109.3s | 0/6 |
| Parlant | 3 | 31.0s | 71.1s | 105.3s | 0/6 |
| ElevenLabs | All | Not run | Not run | Not run | Credential blocked |

Round 1 reused the existing rubric. Round 2 shortened questions and allowed symbolic inputs.
Round 3 isolated engagement scope, limited turns, and required one private insight before ending discovery.
Native rounds 1 and 2 added instructions to an existing QA conversation with the original persona prompt.
Round 3 used a private persona whose stored prompt matched the frozen instructions.
The final instruction SHA256 is `ff3759bf65bb598ea0d6dcd32b8fcc52e6de23e07ca30db5f8474196060d401c`.

## Independent unseen review

An independent agent prepared six unseen customers before final configuration freeze, then executed and audited both platforms.
Its counts come from actual questions, earned disclosures, and model statements. Automatic diagnostic scores did not determine acceptance.

| Outcome | Native Onyx | Parlant | ElevenLabs |
| --- | ---: | ---: | --- |
| Unseen customers completed | 6 | 6 | Not run |
| Customer answers | 18 | 16 | Not run |
| Useful private insight earned | 1/6 | 3/6 | Unknown |
| Correct model consequence stated | 0/6 | 2/6 | Unknown |
| Session read back | 6/6 | 6/6 | Unknown |
| Customers with repeated unknown questions | 6/6 | 3/6 | Unknown |
| Moderator processing median | 4.484s | 31.148s | Unknown |
| Modeled human median, 60-wpm typing | 62.250s | 54.875s | Unknown |
| Combined diagnostic median, 60-wpm typing | 66.734s | 87.273s | Unknown |
| Combined diagnostic median, 45-wpm typing | 81.734s | 101.106s | Unknown |
| Diagnostic conversations under 60s | 0/6 | 0/6 | Unknown |
| Complete login-to-saved-model pipeline | Unverified | Unverified | Unverified |

Native earned one appropriate-care branching insight, then continued asking about the old paid-follow-up hypothesis.
It also treated synthetic scope identifiers as company names in two cases.
The adapter labeled those IDs as `customer`, which contributes ambiguity. This is not a real tenant-binding test.
Parlant earned three private insights and stated two relevant model constraints. It remained inconsistent in four cases.
Parlant said “Model updated” in three cases without a model operation. Neither platform explicitly claimed a saved model.

For example, a pilot executive wanted production approval, with no credible numerical target.
Parlant asked about private approval constraints and learned that the security approver refused production read permissions.
It stated that authorization constraint for the model. Native instead repeated questions about the identity of the pilot customer.
The spoken Parlant consequence is useful; it is not a persisted model change.

One tester false-negative for a legitimate branching question required a single Native case rerun.
The original receipt was excluded from outcome counts and preserved. Both attempts remain charged to the same customer.
Two unearned secret releases were prevented by the independent human policy.
Moderator instructions were not changed during final review.

The canned unknown reply contains 15 words. An independent, no-call sensitivity substitutes exactly “I don’t know.”
All other answers, questions, measured moderator times, and timing assumptions remain unchanged.
Native's diagnostic median becomes **44.998 seconds**, with **5/6** conversations under 60 seconds.
Parlant's becomes **75.490 seconds**, with **0/6** under 60 seconds.
These are post-hoc timing substitutions, not observed executive tests or saved-model receipts.
The quality counts remain 1/6 versus 3/6 earned insights and 0/6 versus 2/6 stated model consequences.
No final questions were classified as public-fact homework. The fallback's research wording also appeared for unavailable private information.
Do not infer public homework merely from that fallback message.

Parlant is the stronger moderation POC in this bounded test. Native is faster and remains the existing product host.
Neither justifies a production framework selection. Complete ElevenLabs and the actual saved-model boundary before choosing.

## Live preparation probe

A separate existing-path probe performed a fresh PDL lookup and dispatched GPT Researcher in parallel.
PDL returned no professional match for the synthetic account. Existing explicit company corrections supplied the research domain.
The report reached native Onyx after **32.389 seconds**, with **nine source URLs**.
The running research container uses GPT Researcher **0.14.8** and Exa **1.16.2**.

That clock began at an authenticated profile request, not fresh login. It excludes interview and model generation.
It proves provider preparation on the exercised path. It does not prove positive PDL enrichment, accepted ontology writes,
or a saved model. Native research storage and causl-kb accepted memory are different boundaries.

## Protocol limits and retained failures

- Public evidence arrives through synthetic fixtures after the first answer. It is not a wall-clock live discovery simulation.
- The accepted ontology starts empty. Fixtures are labeled synthetic and never admitted as accepted market facts.
- Human time is modeled at 240 words/minute reading, 60 words/minute typing, plus two seconds reflection per answer.
  It is not observed executive behavior. The tester's inference time is reported separately from moderator latency.
- Most development cases allow three answers. Exact sealed answers can be longer than real short executive replies.
  Test timing is not a production latency distribution, and text timing does not predict voice timing.
  The canned unknown reply is longer than an executive saying “I don’t know.” Timing alone must not determine quality.
- Old UAT cases volunteered their goal in an opening message. Some early baseline runs omitted that knowledge when automatic opening was added.
- An early Parlant adapter treated a preamble's ready status as completion. Corrected runs wait for the native completed stage.
- Native round 3 initially called a Burn-only brief route for a generic persona and received HTTP errors after valid interviews.
  All six transcripts were independently reopened. The driver now measures chat retention without calling that route.
- The simulated executive sometimes classified generic prompts too generously and released a private insight without earning it.
  Independent review rejects those successes. Automatic evaluator scores are diagnostic, not acceptance evidence.
- The Parlant POC uses transient native sessions. Reading those events before shutdown does not establish durable recovery.
- No comparison run verified a causl-kb model write or reopened calculation. No arithmetic or Monte Carlo validity pass is claimed.

## Cost controls

Every moderated request, executive/evaluator call, and Parlant embedding call reserves budget before dispatch.
The ledger persists across restarts and all vendors share each customer's limit. Failed attempts retain their reservations.
The live preparation probe also reserves budget against its existing development customer.
Native requests reserve $1 each. Parlant completion reservations cover its SDK's 5,000-token output limit at conservative rates.

Final review reservations total **$131.677**, including **$33.187** for unseen customers and the tester correction.
The largest customer reservation is **$18.546**. All twelve customers remain within their $20 reservation ceiling.
Reservations are conservative ceilings, not provider invoices. Actual metered totals have not been reconciled with account billing.
Do not reset the ledger, create a new customer label for retries, or describe reservations as measured spend.
The ElevenLabs credential returns `api_key_id_used_as_api_key`. A key ID is not an API secret.
No ElevenLabs conversation or paid execution was attempted after that rejection.

## Reproduce or resume

Use the existing authorized QA account and a private output directory. Keep credentials and transcripts outside Git.
Configure a private native persona through native administration, using the selected round's exact instructions.
Do not change production Beca or grant QA new permissions. Resolve persona IDs in the target deployment.

The checked-in configurations omit deployment-specific persona IDs. Pass the private persona ID explicitly:

```bash
python scripts/subconscious/interviewer_comparison.py \
  --platform onyx \
  --config scripts/subconscious/interviewer-comparison/round-3.json \
  --supplement scripts/subconscious/interviewer-comparison/development-supplement.json \
  --native-persona PRIVATE_PERSONA_ID \
  --cookies PRIVATE_COOKIE_JAR \
  --aws-profile AUTHORIZED_AWS_PROFILE \
  --output PRIVATE_EXISTING_BUDGET_DIRECTORY
```

Use `--platform parlant` for the SDK path. It binds loopback ports 8896 and 8897.
The private runner needs Parlant, LiteLLM, Boto3, and HTTPX at the versions above.
Do not synchronize the entire production dependency set to run this comparison.

Run focused checks without provider charges:

```bash
PYTHONPATH=scripts/subconscious python3 -m unittest test_interviewer_comparison test_adversarial_uat
ruff check scripts/subconscious/interviewer_comparison.py scripts/subconscious/test_interviewer_comparison.py
```

A resumed ElevenLabs comparison needs a genuine secret with Agents permissions and its own official platform adapter.
It must reuse the frozen cases and the same ledger. This draft does not contain a simulated ElevenLabs adapter.
Full product acceptance must then exercise actual research admission, model compilation, save, and reopen through the existing customer path.
