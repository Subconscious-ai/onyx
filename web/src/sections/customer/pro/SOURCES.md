# Kokonut Pro source

The owner supplied the source archive and confirmed written permission for this public Onyx fork in issue #117.
This record describes owner-supplied permission. This task did not inspect the permission document independently.

Source: https://drive.google.com/file/d/16o0Ot0g9Hq9M2C6QE0_lofvPnqvE1oL8/view

Archive SHA-256: `72791ecc03507cae5936f436ceb4ffa0ec3ba669a8e8fbde2f9a8d47d0414d7b`.
The inspected archive has 663 entries. The archive stays outside the repository.

## Adopted components

- `ActionSearchBar.tsx` adapts `kokonut-ui-pro/components/kokonutui-pro/action-search-bar.tsx` from that archive.
  The adapter retains clipped scope tabs, command rows, keycaps, and keyboard selection.
  Native Onyx search supplies authorized conversations and projects.
  Vendor fixtures, unsupported commands, nested demo actions, and simulated receipts are removed.
  Native message-body search remains authoritative. The adapter does not filter results by title again.
- `ProductButton.tsx` and `product-button.css` reuse the shared Pro Button02 adaptation.
  Source: `Subconscious-ai/design-system`, commit `c9145eb236bc6d26126758b5acb8cf19479b9743`,
  `preview-mount/src/components/kokonutui-pro/product-button.tsx` and `product-button.css`.
  The Onyx adapter preserves native button refs, link navigation, canonical tokens, and 44px controls.

## Retained native behavior

The archive lacks Response Feedback, Chat History, Reasoning, Knowledge Sources, and Streaming Text.
Initial unauthenticated registry requests returned HTTP 403.
On 2026-11-02, the established Doppler `beca/dev` route supplied `KOKO_PRO_TOKEN`.
Authenticated registry requests returned HTTP 200 for all five components.
The token and unmodified downloads remain outside Git.

Registry: `https://kokonutui.pro/api/r/{name}`, authenticated with `X-API-Key`.
Registry response SHA-256 values:

| Component         | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| response-feedback | `0b4c1ffdbc4e4c0ca7174c42af1dc8b067706afb87ea7463629552f064704571` |
| chat-history      | `a21c0c8c6ae0943bdfdd7777bb4f5bd345b34a4546f3dd46655f2b85e7facddf` |
| reasoning         | `714057005c391100d6bc713a4a877cb1a233440d3a4444cc7fd22ad29bd534bf` |
| knowledge-sources | `9c3c65fb51032f26a725f83737d937f92ab796a7534413ba00c15003db28ec97` |
| streaming-text    | `338835279f1155970562501490e4d284cd0fcec7990c9f17a57ceac374109ae6` |

`ResponseFeedback.tsx` retains the inline reason field, moving thumb, spring layout, and focus return.
Native `useFeedbackController` owns persistence and rollback. Failed writes retain the editable reason.
Native copy preserves HTML and TSV. Native model selection, retry, and voice remain available.
Incognito responses still suppress persisted feedback.

`ChatHistory.tsx` retains date groups and animated rows around native `ChatButton` instances.
Native sessions, IDs, titles, pagination, drag operations, rename, and deletion safeguards remain authoritative.
Simulated title generation and local demo sessions are removed.

`Reasoning.tsx` retains the fading live window and completed disclosure around native reasoning Markdown.
Native packets and completion timing remain authoritative. Historical timing is not fabricated.

`KnowledgeSourceRow.tsx` retains the document tile, source row hierarchy, and entry transition in source previews.
Native authorized source records, metadata, descriptions, and source navigation remain authoritative.
Unsupported chunk counts, synthetic retrieval rankings, indexing simulation, and OCR controls are omitted.

Streaming Text remains native after inspection. The supplied parser supports only bold, inline code, and paragraph breaks.
The native renderer also supports tables, fenced code, citations, and packet-driven cancellation.
Simulated word bursts, replay, and local pause would diverge from the actual stream.
The optional word blur is omitted to preserve native Markdown and reduced-motion behavior.

The supplied Feedback Dialog collects a recommendation score from 0 to 10.
Native answer feedback uses positive and negative ratings with persisted comments and rollback.
The supplied dialog does not match that data or interaction.

The supplied Action Toolbar performs bulk archive, snooze, label, and delete operations.
Native response actions operate on one answer and have different persistence rules.
The supplied bulk toolbar does not match the native response workflow.

The supplied Copy Button displays a single value with secret-field controls.
Native answer copying preserves rich HTML and table output. Native answer copying remains active.

Workspace Switcher requires workspace switching that this customer surface does not support.
The adapter does not create new workspace authority or simulated workspaces.

The supplied specialized inputs do not preserve the native composer contract.
Native attachments, drafts, Send, Stop, model controls, Markdown, citations, and streaming remain active.
