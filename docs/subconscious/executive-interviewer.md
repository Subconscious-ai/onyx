## Outcome
Replace the Burn application surface with a native Onyx executive interview. An executive starts with researched market context, supplies private objectives and customer behavior, and leaves with a coherent journey and evidence-linked intervention brief.

## Reuse and boundaries
- Preserve native Onyx conversation, streaming, citations, uploads, history, Exa, Python analysis, AWS Bedrock, and existing Subconscious MCP.
- Reuse Burn roles: Sarah (moderation and journey), Frankie (business model), Mei (market and grounded challenge), Jerry (occasional humor based only on volunteered remarks). One active voice and one generation per ordinary turn.
- Keep accepted market records in causl-kb and calculation/model execution in Guesstimate V3. Interview projections remain drafts until accepted through the existing authority boundary.
- Reuse PDL and background researcher preparation. Unknown operating numbers remain unknown. Public research cannot establish private objectives.

## Implementation plan
1. Add regression fixtures for selective questions, explicit objectives, behavioral transitions, grounded conflicts, and evidence status before runtime changes.
2. Add an executive workspace around native Onyx chat: restrained Subconscious typography, specialist roster, evolving brief, journey, and source provenance. Preserve standard Onyx behavior outside the executive agent.
3. Configure the executive agent rubric from primary consulting guidance and Burn roles; use AWS and existing tools. Persist the conversation and reconstruct the draft brief on reload without another model call.
4. Connect preparation and the existing scoped market/model boundary where deployed services permit. Expose unavailable or pending integration states explicitly; never present demo data as accepted customer records.
5. Validate desktop/mobile interaction, a real AWS interview and reload, then publish the exact commit as a draft PR and Vercel preview. A remotely reachable authenticated Onyx backend is required for remote chat UAT.

## Acceptance
- Native Onyx handles chat; no replacement chat framework or new swarm runtime.
- A concise opening focuses on the decision and missing private context. Already known facts never become questionnaire homework.
- Every journey stage represents customer behavior or state; proposed interventions identify the affected transition and objective.
- Conflicts require attributable evidence; public claims, executive statements, assumptions and unknowns remain distinct.
- Reload preserves the interview; failed or incomplete updates cannot silently replace a valid brief.
- Research and model preparation do not block ordinary chat turns.
- Vercel preview renders a useful, responsive experience with truthful integration readiness.

## Research
- McKinsey: https://www.mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/how-to-master-the-seven-step-problem-solving-process
- Bain: https://www.bain.com/insights/management-tools-customer-journey-analysis/
- BCG: https://www.bcg.com/publications/2020/customer-journey-programs-hard-get-right
- Internal reference: Subconscious-ai/analyst-agent and Subconscious-ai/mbb-casebook; recruiting cases are evaluation fixtures, not verified client engagements.

## Deployment dependency
The existing Onyx backend is local at port 3011. A Vercel frontend requires an authenticated reachable backend. Existing AWS infrastructure sessions currently require renewal. No production migration, merge, or unauthenticated exposure is authorized by this issue.
