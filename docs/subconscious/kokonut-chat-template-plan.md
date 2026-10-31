# Three core AI templates

Status: implementation plan. No Design-system or downstream application changes ship from this document.

## Local Onyx proof

The native implementation runs at [local Onyx](https://agent-dev.taila3aadb.ts.net:3125/app?agentId=2).
An existing synthetic QA account sent a new message and received a saved reply with a real NASA citation.
The browser observed native streaming progress and opened the exact stored source URL.
Desktop and mobile checks passed for source previews, keyboard focus, both themes, and layout.
Native Stop returned the composer to editing and retained the user message.
Reduced-motion checks disabled the progress wave and spinner.
TypeScript, formatting, and 12 native composer regression tests passed.
Independent review found no remaining citation keyboard blocker.
These results prove local QA behavior, not staff access or production delivery.

## Customer result

Onyx, Colossus, Guesstimate, and the homepage use the same composer, citation, and progress presentation.
Each application keeps its existing identity, message transport, data, and execution controls.
The templates use canonical Subconscious colors and typography, with Kokonut shapes, spacing, and motion.

## Source and current ownership

These three components are public MIT Kokonut UI components. These components are not Kokonut Pro.

| Template | Upstream source | Current Onyx integration |
| --- | --- | --- |
| AI Input Search | [v4.0.0](https://kokonutui.com/r/ai-input-search.json), 2026-10-18 | `web/src/sections/customer/AIInputSearch.tsx`, surrounding the native editor in `AppInputBar.tsx` |
| AI Inline Citations | [v1.0.0](https://kokonutui.com/r/ai-citations.json), 2026-10-15 | `web/src/sections/customer/AIInlineCitation.tsx`, receiving resolved native documents in `MemoizedTextComponents.tsx` |
| AI State Loading | [v2.0.0](https://kokonutui.com/r/ai-loading.json), 2026-10-14 | `web/src/sections/customer/AILoadingState.tsx`, receiving native timeline header state |

The local adaptations remove example conversations, fake timing, and demo provider menus.
Native Onyx supplies files, tools, model selection, send, queue, stop, source identity, and source opening.
The citation adaptation uses the existing Radix positioning and dismissal primitives.
Each citation has a local preview; the upstream shared sliding preview is not implemented.
The progress adaptation replaces active timeline labels and preserves the existing detailed tool timeline.
The MIT notice is retained in `web/src/sections/customer/Kokonut.LICENSE`.

Retrieved source SHA-256 values:

```text
AI Input Search:     490aabe44149eb48ed17976af44dead7a858095f9f19b53ec99b69b4b523691b
AI Inline Citations: 7c076b71673a795dbfb7b530036961aaf155ef2e18d5d92c441a1536a036891f
AI State Loading:    92d5223b361e1a42c6f1d3050bba70ce864708fec98b4f2ede7ffe31cd8fd00f
```

## Shared contracts

Use the existing Design-system V2 shadcn registry. Do not add another component package.
Design-system already owns `registry/components/ai-input-search.tsx`, currently upstream v1.0.0.
Update that owner; do not add a second composer with a different name.
Keep the existing `placeholder`, `searchLabel`, `onSubmit`, and `className` interface available during migration.

| Core template | Shared contract | Application responsibility |
| --- | --- | --- |
| `ai-input-search` | Controlled frame with editor, attachments, tool controls, model controls, and send/stop slots; active tool label; focus callback | Draft, IME, paste, upload, permissions, queue, request transport, and cancellation |
| `ai-citations` | Stable source ID, display label, title, description, optional URL, and open callback; hover, touch, and keyboard preview | Resolve citation IDs, authorize documents, choose source URL or native document panel |
| `ai-loading` | Stable step IDs with labels and `pending`, `running`, `done`, or `error`; compact and expanded presentation | Derive progress from actual requests or tool events; provide retry and cancellation |

Shared source must not import Onyx `SourceInfo`, Opal, Assistant UI runtime state, or application stores.
Application adapters translate native records into these small contracts.
Keep business fixtures in each application.
The registry examples show both native editor composition and a simple controlled input.

## Delivery order

1. **Native Onyx proof is complete locally.** Retain the verified send, progress, saved reply, source, and Stop behavior.
   Repeat the same proof after canonical registry installation.
2. **Confirm the second consumer in Guesstimate.** Check the three contracts against the existing `ModelAgentPanel`.
   Promote only contracts required by both Onyx and Guesstimate, as required by Design-system `DECISIONS.md`.
3. **Extend the canonical registry.** Update `ai-input-search`; add `ai-citations` and `ai-loading`.
   Record source versions, dates, license, paint mappings, and intentional behavior differences.
   Add entries to `registry.json`, then run the existing generation pipeline.
   Never edit generated `r/*.json` or `kit/src/registry/_impl` copies directly.
4. **Publish the three rendered examples on design.subconscious.ai.** Each example must show the component and its behavior.
   Include an actual input, source preview, and controlled progress example, clearly marked as examples.
   Run `npm run test:registry-install` for the new and updated registry entries.
   Verify clean consumer installation, keyboard access, collision handling, reduced motion, and canonical paint.
5. **Move Onyx to the canonical registry output.** Replace the local presentation copies with installed registry components.
   Retain the native adapters and repeat the same customer flow on the resulting candidate.
6. **Adopt the registry in Guesstimate.** Replace presentation around the existing Assistant UI runtime.
   Prove an actual model question, tool progress, evidence opening, review, and explicit apply.
   Check that the model remains unchanged before explicit apply.
7. **Verify Colossus inheritance.** Colossus already embeds native Onyx through `ColossusOnyx.tsx`.
   Use the updated native UI inside that existing bridge; do not create another Colossus chat implementation.
   Prove a map-context question, a reply, a source action, and retained history.
8. **Adopt the homepage elements in the existing hero.** Add a real prompt handoff using the shared composer.
   Preserve the prompt through sign-in and deliver the prompt to native Onyx without automatic submission.
   Show citations only for verified published claims and loading only during actual navigation or requests.
   Preserve the existing primary CTA, server-rendered content, metadata, and structured data.

## Consumer owners

| Consumer | Existing owner | Required proof |
| --- | --- | --- |
| Onyx | `web/src/sections/input/AppInputBar.tsx`, `MemoizedTextComponents.tsx`, native message timeline | Send → real progress → saved reply → exact stored source; stop remains functional |
| Colossus | `colossus-v2/src/components/ColossusOnyx.tsx` | Existing bridge sends current map context to native Onyx; source and history still work |
| Guesstimate | `guesstimate-v3/src/components/spaces/ModelAgentPanel.tsx` | Existing Assistant UI conversation drives progress and evidence; review/apply behavior remains intact |
| New homepage | `johnny-5-rebuild/src/app/page.tsx`, `HomeSphereVariants` | Hero prompt survives the real Onyx handoff; no invented assistant reply or progress |

## Publication gates

Registry changes include generated output, license records, install checks, and an independent review.
Registry changes stop at a reviewable PR because shared kit changes affect every consumer.
Consumer migrations ship separately after registry review and use the same installed revision.
Production release requires the actual customer flow in each application.
Local screenshots, green TypeScript checks, and HTTP 200 responses do not prove that release.
