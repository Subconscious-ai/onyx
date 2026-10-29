"use client";

/* KokonutUI Command Button v2.0.0 (MIT), adopted 2026-10-29.
 * Upstream: https://github.com/kokonut-labs/kokonutui/blob/0f2922790424a68ea00153295a3a8836f916ab87/components/kokonutui/command-button.tsx
 * Token bridge: https://github.com/Subconscious-ai/design-system/blob/70d8addfeea83cf3e7f4b32f5a9b9a34298c1b39/registry/components/command-button.tsx
 * Retains physical keycaps and press travel. Opal owns buttons, icons and text.
 * Enter uses native focused activation. Global shortcut listeners are omitted.
 * Copyright and permission notice: CommandButton.LICENSE.
 */

import type { MouseEventHandler } from "react";
import { Button, Text, Tooltip } from "@opal/components";
import type { IconFunctionComponent, RichStr } from "@opal/types";
import { toPlainString } from "@opal/components/text/InlineMarkdown";
import "@/sections/customer/command-button.css";

interface CommandButtonProps {
  label: string | RichStr;
  icon: IconFunctionComponent;
  folded: boolean;
  href?: string;
  selected?: boolean;
  onClick: MouseEventHandler<HTMLElement>;
}

export default function CommandButton({
  label,
  icon,
  folded,
  href,
  selected = false,
  onClick,
}: CommandButtonProps) {
  // Retain SidebarTab's client navigation without resetting the page scroll.
  const navigation = href ? { href, scroll: false } : {};

  return (
    <div
      className="customer-command-button"
      data-folded={folded || undefined}
      data-selected={selected || undefined}
    >
      <Tooltip tooltip={label} suppressed={!folded} side="right">
        <Button
          {...navigation}
          icon={icon}
          width="full"
          size="lg"
          prominence="secondary"
          onClick={onClick}
          aria-label={toPlainString(label)}
          aria-current={selected ? "page" : undefined}
          aria-keyshortcuts="Enter"
        >
          {folded ? undefined : label}
        </Button>
      </Tooltip>
      {!folded && (
        <span className="customer-command-button__shortcut" aria-hidden="true">
          <span className="customer-command-button__key-base">
            <kbd className="customer-command-button__keycap">
              <Text font="secondary-body" color="inherit">
                {"↵"}
              </Text>
            </kbd>
          </span>
        </span>
      )}
    </div>
  );
}
