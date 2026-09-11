# Beca capabilities and integration boundaries

## Current delivery

Beca uses the existing Onyx conversation, native files, source search, citations, Python execution and tool administration. The native persona remains named `Burn 2.0` because profile and brief guards use that identity. The interface displays Beca. AWS Bedrock remains the reasoning provider.

The compact Actions menu prepares a request for review in the native composer. Existing text and attachments remain present. Actions cover customer evidence, public market research, model review, experiment design, experiment analysis and dataset analysis. Brief opens the journey, OKRs, evidence and model handoff. No permanent roster, provider selector or draft footer competes with chat.

Brand components come from the canonical design-system Wordmark and DagMark sources. The Kokonut `action-search-bar` informed the searchable action pattern. Native Onyx CommandMenu supplies focus, keyboard navigation and selection. No Pro package, second composer or new animation framework is installed. Native audio controls already provide recording and playback presentation.

## Tool assignments

Verified on the migrated native database. Resolve IDs again on another database.

| Agent | Internal search, web, Python | GPT Researcher | Rehoboam |
| --- | --- | --- | --- |
| Market researcher, ID 1 | Enabled | Absent | Enabled |
| Executive interview, ID 2 | Enabled | Absent | Enabled |
| Beca, ID 5 | Enabled | Enabled | Full current catalog |
| Experiment design, ID 7 | Enabled | Absent | Discovery, design, draft review, confirmed launch and status |
| Experiment analytics, ID 8 | Enabled | Absent | Discovery and smolagents analytics; no launch tool |

A server registration and a persona tool assignment are separate native settings. Server 3 now connects to `https://api.dev.subconscious.ai/mcp/`, exposing thirty existing Rehoboam tools. The older production endpoint still exposed seventeen tools during September 11 verification. Admin discovery refreshes stored tool snapshots; a user discovery call alone does not update stored assignments. Refresh, attach the intended tool subset, and restore the classification-only `check_causality` description below.

The sidebar resolves the three workflow links from the authenticated catalog. IDs 7 and 8 are private native personas; permissions and existing conversations remain preserved. The experiment prompts live in [experiment-design-prompt.md](experiment-design-prompt.md) and [experiment-analytics-prompt.md](experiment-analytics-prompt.md). Configure those prompts using the native persona editor, conversation model 8, and native system-prompt extension mode. The task reminder must say: “Respond to the latest customer message. Use tools only when external facts or calculations are needed. Render requested diagrams from supplied structure without retrieving experiments. Keep facts, assumptions and tool errors distinct.” A vague tool-only reminder caused irrelevant study retrieval for a diagram request.

Server 3 currently authenticates through a shared administrator token for the existing review account. Owned-study discovery was verified for that account; the deployment is not enterprise-isolated. Do not publish the private experiment personas or claim cross-organization separation without per-user credentials or a reviewed tenant boundary.

GPT Researcher gathers public evidence. Rehoboam exposes experiment drafting, launch, status and analysis. The same Beca conversation can call both services. Customer targets and transcripts remain excluded from external research queries.

Rehoboam includes `check_causality`, attribute/level and outcome generation, draft create/revise/read, `start_experiment`, status/details, experiment questions, analytics metadata, feature importance, posterior distributions, willingness to pay, market share, latent-trait factors and segments. No experiment was launched during QA. `find_experiments` now supplies authorized IDs from owner-only cached summaries; `ask_analyst` calls the existing smolagents interpreter. Native MCP raster blocks are persisted through the existing file store and returned as actual chat links. Discovery coverage and artifact availability remain separate checks.

Experiment execution requires an explicit instruction for the identified draft. The Actions menu never submits or launches automatically. The interview prompt enforces the conversational boundary; Rehoboam now owns a durable specification-hash and idempotency approval boundary through MCP elicitation. Native client elicitation support and a paid launch are not exercised by this change.

The native description for `check_causality` now explicitly identifies question suitability. `is_causal=false` requests question reframing; classification is not an estimated effect or evidence of no conversion lift. Generated attribute levels remain proposals. Preserve this description when refreshing the MCP registration, or fix the upstream description before refresh.

## Analyst and MBB integration

`analyst-agent` is a reference implementation, not a connector or an installed Burn skill. The reusable pieces are source-bound answers from `agent/answer.py`, native Onyx retrieval from `agent/onyx.py`, and source-retrieval evaluation from `eval/probe_retrieval.py`. No nested analyst runtime or legacy provider configuration was imported.

The Beca rubric applies those patterns during the interview: use an executive quote or retrieved passage for a factual claim, identify missing evidence, compare conflicting sources, and ask only questions that can change the model or decision. Proposed journeys remain proposals. Public article dates never establish executive deadlines. Explicit research requests receive findings rather than unsolicited OKRs.

`mbb-casebook` supplies indexed public firm articles, cases, reports and recruiting casebooks. Native file corpora cover Bain, BCG, McKinsey and external casebooks. A GitHub connector also indexes mbb-casebook. Corpus access is workspace-public within authenticated Onyx, not public internet access. Empty persona document-set lists impose no additional subset filter; native document permissions still apply.

Internal search retrieves relevant passages as needed. The complete case library is not loaded into every turn. MBB references inform a useful question or model proposal; cases never become facts about an executive business. Citation QA must distinguish the retrieved GitHub copy from the original publisher URL stored in front matter.

## Customer evidence and useful native additions

| Capability | Existing path | Remaining requirement |
| --- | --- | --- |
| Customer files | Native composer attachments and project files | Use an authorized customer dataset; preserve source attribution |
| Internal research | Native search and document sets | Select the relevant permitted collection |
| Google Drive / SharePoint | Native administrator connectors | Dataset selection, connector credentials and permission-sync review |
| Analysis and charts | Native Python sandbox | Check actual stdout, returned files and units; no invented operating values |
| Feedback | Native response feedback and saved conversations | Review repeated questions, unsupported inputs, calculation failures and executive time |
| Voice | Native microphone, ElevenLabs provider and playback | Valid ElevenLabs API secret and audio QA |

Prioritize evidence and experiment results in the same conversation before additional frameworks. No Fivetran pipeline, separate notebook application or Data Formulator chat is needed for the current scope. Accepted market memory and organization models remain owned by causl-kb. Current Onyx Community Edition deployment is not proof of shared-instance enterprise isolation. Cross-application SSO remains causl-kb #450.

## ElevenLabs transport and credential state

Onyx already implements ElevenLabs transcription and synthesis. No ElevenLabs conversational-agent runtime is added. The supplied disabled environment file contains a Beca voice ID, but both API key entries were rejected with `api_key_id_used_as_api_key`. No provider was saved or activated; a valid API secret is required. Never copy credentials into frontend variables, prompts or Git.

`NEXT_PUBLIC_VOICE_WEBSOCKET_URL=wss://api.dev.subconscious.ai/burn2` is configured for the Beca Vercel branch. The native HTTP endpoint issues a single-use token with a 60-second lifetime. Browser audio connects directly to AWS. Only the two explicitly listed review origins can reach native voice token validation. Origin aliases normalize to native WEB_DOMAIN after allowlisting. Arbitrary deployment origins remain denied.

Both transcription and synthesis upgrade paths pass authentication and token-replay checks. Provider audio, microphone capture and physical iPhone behavior remain unverified until a valid secret is configured. Native HTTP read-aloud still uses the existing authenticated frontend proxy.

## Relationship to Hermes

Onyx owns document ingestion, search, citations, conversations and tool permissions in the current product. Hermes offers an alternative operator runtime and reusable skills. No comparative benchmark supports a quality claim. Replacing Onyx would add migration work without resolving the current evidence and experiment boundaries. Reuse bounded procedures before adding another runtime.

## Visuals and upstream branding

Fenced Mermaid now renders through a lazy, pinned Mermaid library with strict security, SVG sanitization, streaming debounce, theme-aware rendering and recoverable source disclosure. A diagram request uses supplied structure; a picture request must use the configured image provider. Beca must never treat the assistant name as the customer product.

The native image provider registry now supports Amazon Nova Canvas through installed LiteLLM and the AWS credential chain. Setup is available under administrator Image Generation. No OpenAI secret is needed. Activation is blocked by missing `bedrock:InvokeModel` permission for `arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-canvas-v1:0`; an expired local AWS login prevented the narrow policy update. Reference-image editing is explicitly unsupported. No picture-generation success is claimed before actual PNG output passes.

Upstream promotional notifications are filtered from both counts and lists. Operational, connector and administrator-authored notifications remain available. Product copy, fallback icons, loading indicators and the old permissions-migration banners use the Subconscious surface. Source publisher identities, legal notices, technical identifiers and official documentation links remain accurate.

### Latest hosted verification

Saved-study discovery returned three authorized study summaries in 6.9 seconds. A supplied-structure Mermaid request returned in 1.8 seconds without tool calls and rendered in both themes. The smolagents analyst returned a real PNG from existing study results in 64.4 seconds; native chat-file retrieval and mobile image decoding passed. Analyst work is slower than ordinary conversation and saved-study search. No experiment was launched.

The model handoff destination for the Beca review branch is the verified causl-kb preview `https://causl-2sfwv61jz-subconcious.vercel.app/dashboard/burn-import`. Preserve exact origin checks. Full interview/model reliability evidence remains in the paired executive-proof work.
