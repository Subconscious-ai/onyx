# Research-to-model QA — 2026-09-08

**Acceptance: failed. Draft PR only. No merge before executive QA.**

The real research connection works. The research-enabled interviewer still fails the usable-model standard. Correct arithmetic alone does not establish a usable model. The existing executive agent retains the previous Nova Pro configuration. Candidate prompts and research tools remain on a separate private QA agent.

## Evidence

Two complete replays exercised three synthetic markets through native Onyx, AWS Bedrock, GPT Researcher, Exa and native Python. Each replay contained nine turns. No research response or Python output was mocked. Earlier model canaries informed candidate selection but do not establish an accuracy score.

| Check | Mistral Large 3 on AWS | Nova Pro on AWS |
|---|---:|---:|
| Research requests with successful source receipts | 3 / 3 | 2 / 3 |
| Requested numeric scenarios with correct executed Python outputs | 3 / 3 | 2 / 3 |
| Turns passing targeted automated checks | 4 / 9 | 1 / 9 |
| Entire cases passing manual usable-model review | 0 / 3 | 0 / 3 |
| Human executive minutes to a usable model | Not measured; no accepted model | Not measured; no accepted model |

The Mistral research receipts contained 5, 5 and 8 original source URLs. Initial research turns completed in 23.7–27.9 seconds. Requested calculation turns completed in 4.8–6.2 seconds. A later renewal response took 32.2 seconds. Nova Pro encountered one research timeout after approximately 124 seconds. Research latency remains unsuitable for repeated interview pauses.

## Model review

| Market | Correct scenario arithmetic | Failures that prevent acceptance |
|---|---|---|
| Ice cream through grocery stores | 200 stores × 50 weeks × 100 pints × $5 = $5 million. The $10 million target requires 200 pints/store/week. | Mistral inserted unsupported SKU, velocity and price benchmarks into the draft. Known unknowns became repeated price questions. Nova repeated the same follow-up and skipped required Python execution. |
| Scheduling software renewals | 1,000 accounts × $3,000 × 70% = $2.1 million. Target renewal = 80%. Five percentage points add $150,000. | Mistral repeated the adoption-versus-compliance question and introduced unsupported churn distributions. A citation about water and renewable energy did not support software renewal claims. Malformed brief markers prevented extraction. Nova gave a research-dependent response after an unreadable timeout receipt. |
| Implementation consultancy | 12,000 delivery hours / 300 hours = 40 projects; $4 million revenue; $1.6 million contribution. Target requires 50 projects and 15,000 hours. | Mistral introduced unsupported project benchmarks. An early symbolic capacity equation multiplied hours twice. A later 80% comparison changed the capacity denominator without explaining the treatment of already supplied delivery hours. Nova repeated public-context prose instead of explaining the calculated model. |

The 80% comparison was explicitly requested. The failure concerns model consistency and denominator clarity, not unauthorized use of a comparison scenario. Actual utilization remained unknown in the Mistral response.

The cases produced different structures: retail velocity, cohort renewals and service capacity. No fixed funnel was necessary. Model flexibility passed the narrow structural check; evidence handling and decision usefulness failed.

## Evaluation boundaries

Repeated-question checks detect exact repetition and selected topic repetition. Manual review also checks known unknowns and immaterial questions. The evaluator excludes URL query strings and unknown table cells from question counts. A fraction of 0.8 and a displayed percentage of 80% represent the same renewal result; the numeric fixture now uses fraction units.

Unsupported inputs require source and transcript review. A successful research receipt proves tool execution, not factual accuracy. Regex checks cannot validate entailment or causal relationships. Native reasoning packets are excluded from replay records, but some providers put reasoning tags into message content. Raw reports remain private.

The runner records machine elapsed time and a labeled scripted reading/answering proxy. The proxy is not measured executive time. Human QA must measure active executive time and elapsed waiting separately. A fabricated model or an immaterial interview cannot pass by completing quickly.

## Repairs and proof

- Exact quotes from explicit scenarios or public cases no longer receive executive-evidence labels in the brief. Two new attribution regressions failed before the guard. Fifteen brief tests pass. The guard is conservative and cannot establish semantic entailment.
- The adapter reuses pinned upstream GPT Researcher MCP. AWS supplies synthesis and embeddings; Exa supplies search. No new collector, queue, database or chat interface was built.
- Research deadlines cancel work and now return an explicit unavailable receipt. The regression exercises serialization through an in-memory MCP client. Email-shaped queries cannot reach the collector. Both focused tests pass.
- Five running-gateway checks pass, including independent research bearer authentication. Native Onyx cookies never reach the researcher.
- Three evaluator checks pass. A formatting regression failed before question counting was corrected.
- Browser inspection exposed intermittent Google DNS failures during saved-chat reload. A single Cloudflare DNS fallback now occurs before any application request. The fallback regression failed before repair. The application never resubmits an executive turn as a retry.
- Candidate browser inspection confirmed the service-capacity conversation loaded. The initial reload failed on the old deployment. Final deployment and reload proof are recorded in draft PR #2 after publication.

The separate QA agent uses native chat. The executive side panel currently recognizes only the exact `Executive interview` agent name. Candidate replay success would still require an executive-workspace browser check before promotion.

## Remaining work before acceptance

The candidate must consistently preserve unknown inputs, use only supported public claims, execute requested calculations and stop unnecessary questioning. Prompt changes alone have not established that behavior across the tested AWS models. The current candidate must not replace the existing executive agent based on arithmetic success.

Research currently runs on demand. Automatic parallel preparation, email-triggered PDL, accepted causl-kb writes and saved Guesstimate V3 models remain unimplemented. No executive-model write entered the accepted ontology during QA.

Keep the PR draft and unmerged. Executive QA is required before any merge. No production proof is claimed.
