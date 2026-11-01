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
Current vendor registry requests returned HTTP 403 during implementation.
The established `beca` credential route had no `KOKO_PRO_TOKEN` in the inspected configurations.
These components remain pending source access. Native implementations remain active.

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
