# Beca: capability review and smallest useful rollout

Verified September 11, 2026 against native Onyx configuration and repository source.

## One conversation

Beca is the customer-facing Burn name. The native persona remains `Burn 2.0` (ID 5 in the migrated database). Existing backend profile and brief guards depend on the native name. The interface changes the display name without changing stored identity, history, permissions, or tool routing. The prompt introduces Beca; specialist objectives remain internal lenses, not four autonomous conversations.

The conversation owns the available screen. Brief opens the journey, OKRs, evidence, preparation status, retry, and model handoff. The composer stays mounted during review. Customer chat omits model controls; administrator provider and agent configuration remain available. The Subconscious wordmark and causal mark come from the design-system registry source. Provider icons and upstream attribution links retain the correct identities.

## Actual tool access

| Native agent | Internal MBB search, web search, Python | GPT Researcher MCP | Rehoboam MCP |
| --- | --- | --- | --- |
| Market researcher, ID 1 | Enabled | Absent | Enabled |
| Executive interview, ID 2 | Enabled | Absent | Enabled |
| Burn 2.0 / Beca, ID 5 | Enabled | Enabled | Absent |

The existing Rehoboam MCP registration exposes the complete lifecycle:

- Design: `check_causality`, `generate_attributes_levels`, `generate_dependent_variable`, `create_experiment_draft`, `revise_experiment_draft`, `get_experiment_draft`.
- Run and inspect: `start_experiment`, `get_experiment_status`, `get_experiment_details`.
- Analyze: `ask_experiment`, `get_analytics_metadata`, `get_feature_importance`, `get_posterior_distribution`, `get_willingness_to_pay`, `get_market_share`, `get_factors_affecting_latent_trait`, `get_clusters_or_segments`.

Registration proves availability, not a successful new experiment. No experiment was executed during the review.

Recommended next step: attach selected existing Rehoboam tools to Beca through native agent configuration. Begin with drafting, status and analysis. Keep launch behind an explicit approved experiment and execution instruction. Preserve experiment IDs and result receipts across calls. No second orchestrator, duplicated MCP, or replacement chat is needed. Complete a read-only existing-experiment canary before enabling execution.

## MBB source path

The current native connector list contains Bain, BCG, McKinsey and external casebook file corpora, plus the mbb-casebook GitHub connector. The file corpora are workspace-public, meaning searchable within the authenticated Onyx workspace. Document-set lists are empty on the three agents, so no narrower document-set restriction is configured; native access checks still apply.

[mbb-casebook](https://github.com/Subconscious-ai/mbb-casebook) contains public firm articles, cases, reports and external recruiting casebooks. Markdown front matter preserves title, firm, category and original URL. [analyst-agent](https://github.com/Subconscious-ai/analyst-agent) supplies the existing Onyx connector setup, retrieval evaluation and citation patterns. The analyst-agent runtime does not run inside each interviewer.

Onyx indexes content for search. `internal_search` retrieves relevant passages when a question or useful analogy needs evidence. The complete library is not inserted into every turn, and no separate dossier is assigned to Sarah, Frankie, Mei or Jerry. The current rubric requires actual retrieval for explicit MBB requests and citations to original sources. Recruiting cases and public frameworks remain references, never evidence about the executive's company. Historical index counts do not prove current citation quality; the retained source-use canary remains relevant.

## Comparison with Hermes

Assuming [Nous Research Hermes Agent](https://hermes-agent.nousresearch.com/docs/): Hermes emphasizes persistent memory, reusable skills, shell/browser operations, messaging channels, scheduled work and delegation. Onyx supplies the existing document connectors, searchable corpus, citations, conversation history and tool administration. Beca adds the executive journey/OKR workflow and the causl-kb acceptance boundary.

No comparative quality benchmark was run. For the current executive product, replacing Onyx would discard working integration. Hermes is a possible background operator if scheduled multi-step operations become a concrete requirement. Reviewed reusable interview procedures can improve Beca without adding Hermes as another runtime.

## Highest-value native additions

1. Customer evidence through existing file uploads, projects and document sets; add Google Drive or SharePoint connectors after source authorization.
2. Rehoboam design and analysis tools on the same Beca persona.
3. Existing Python analysis for uploaded CSVs and experiment results, with source-linked charts and calculation receipts.
4. Native feedback and saved conversations for interview evaluation and repeated-question review.
5. Native voice providers for optional dictation and read-aloud.

[Onyx connector documentation](https://docs.onyx.app/overview/core_features/connectors) describes native ingestion and connector choices. Enterprise permission synchronization remains connector- and edition-dependent; the current single workspace is not proof of multi-enterprise isolation. No Fivetran pipeline, separate Data Formulator chat or notebook platform is needed for the initial evidence-and-experiment flow.

## Kokonut choices

- The design-system `action-search-bar` is useful later for a compact command menu: find evidence, open brief, review experiments. Reuse native Onyx search where possible.
- [AI Voice](https://kokonutui.com/docs/ai/ai-voice) provides a compact microphone/listening presentation. Use the native recorder behavior; a waveform alone is not speech integration.
- [AI Input Search](https://kokonutui.com/docs/ai/ai-input-search) is already available through the design-system registry. The current Onyx composer already supports attachments, streaming, queues and voice. Replacing the composer would add regression risk for little benefit.

No Pro component is required for the requested simplification. Avoid animated status carousels, extra cards, prominent model pickers and large agent rosters. Existing controls and progressive disclosure produce the larger gain.

## ElevenLabs

The native implementation already exists in `backend/onyx/voice/providers/elevenlabs.py`, the provider factory and `/admin/voice`. The live provider list is empty.

The smallest rollout is to configure an authorized ElevenLabs API key and a stock voice through native administration, test credentials, activate TTS, and verify read-aloud. Continue using AWS Bedrock for reasoning. ElevenLabs supplies audio only; no ElevenLabs conversational-agent replacement is required.

The microphone uses a short-lived native WebSocket token and currently constructs a same-origin `/api/voice/transcribe/stream` URL. The deployed Next catch-all forwards HTTP requests and does not implement upgrade forwarding. Full live dictation needs an authenticated WebSocket route, preferably directly to the already-hosted AWS native voice service, plus an iPhone microphone/reconnect test. Existing native recording, streaming transcription and playback should be reused. No voice provider was activated or paid plan purchased during this change.
