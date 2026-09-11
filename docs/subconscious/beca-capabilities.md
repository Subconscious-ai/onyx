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
| Beca, ID 5 | Enabled | Enabled | Enabled |

A server registration and a persona tool assignment are separate native settings. Beca now has 23 assigned tools: three native tools, three GPT Researcher tools and 17 existing Rehoboam tools. No MCP server was duplicated. Persona permissions, document sets and AWS model configuration 8 were preserved.

GPT Researcher gathers public evidence. Rehoboam exposes experiment drafting, launch, status and analysis. The same Beca conversation can call both services. Customer targets and transcripts remain excluded from external research queries.

Rehoboam includes `check_causality`, attribute/level and outcome generation, draft create/revise/read, `start_experiment`, status/details, experiment questions, analytics metadata, feature importance, posterior distributions, willingness to pay, market share, latent-trait factors and segments. No experiment was launched during QA. Result-analysis endpoints still require a valid authorized experiment ID and an end-to-end results canary.

Experiment execution requires an explicit instruction for the identified draft. The Actions menu never submits or launches automatically. The interview prompt enforces the conversational boundary; a separate deterministic launch-approval mechanism is not implemented by this change.

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
