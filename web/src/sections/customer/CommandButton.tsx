"use client";

/* Customer navigation uses the shared Kokonut UI Pro button family. */
import type { Route } from "next";
import type { MouseEventHandler } from "react";
import { Tooltip } from "@opal/components";
import type { IconFunctionComponent, RichStr } from "@opal/types";
import { toPlainString } from "@opal/components/text/InlineMarkdown";
import {
  ProductButton,
  ProductLink,
} from "@/sections/customer/pro/ProductButton";

interface CommandButtonProps {
  label: string | RichStr;
  icon: IconFunctionComponent;
  folded: boolean;
  href?: Route;
  selected?: boolean;
  onClick: MouseEventHandler<HTMLElement>;
}

export default function CommandButton({
  label,
  icon: Icon,
  folded,
  href,
  selected = false,
  onClick,
}: CommandButtonProps) {
  const text = toPlainString(label);
  const props = {
    variant: selected ? ("primary" as const) : ("secondary" as const),
    size: folded ? ("icon" as const) : ("default" as const),
    className: folded ? "" : "w-full !justify-start",
    onClick,
    "aria-label": text,
    "aria-current": selected ? ("page" as const) : undefined,
    children: (
      <>
        <Icon className="size-4" />
        {!folded && <span className="truncate">{text}</span>}
      </>
    ),
  };
  return (
    <Tooltip tooltip={label} suppressed={!folded} side="right">
      {href ? (
        <ProductLink {...props} href={href} scroll={false} />
      ) : (
        <ProductButton {...props} />
      )}
    </Tooltip>
  );
}
