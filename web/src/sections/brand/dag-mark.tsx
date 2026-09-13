"use client";

// Source: Subconscious-ai/design-system b5ef525ee7b626b9346d1bf18c7242e666b07193 registry/components/dag-mark.tsx
import "./brand.css";

/* dag-mark.tsx — the canonical Subconscious brand mark.
   ============================================================
   A 60×42 SVG showing the do-calculus DAG: latent confounder C
   above, intervention T bottom-left, outcome O bottom-right,
   with the signal-red arrow T→O carrying the causal claim.

   On `[data-revealed]` ancestors, nodes arrive and arrows scratch
   in (DAG draw-in motion, DOCTRINE.md §4 canonical motions). The
   draw-in is pure CSS animation in `dag-mark.css`; this component
   is just the markup.

   Sizes:
   - 'xs' (24×14) — inline ornament, confounder dropped
   - 'default' (60×42) — corner/section watermark
   - 'lg' (120×84) — section divider
   ============================================================ */

import type { SVGAttributes } from "react";

export type DagMarkSize = "xs" | "default" | "lg";

interface DagMarkProps extends Omit<
  SVGAttributes<SVGSVGElement>,
  "children" | "viewBox"
> {
  size?: DagMarkSize;
}

export function DagMark({
  size = "default",
  className,
  ...rest
}: DagMarkProps) {
  const cls = [
    "dag-mark",
    size === "xs" && "dag-mark--xs",
    size === "lg" && "dag-mark--lg",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg className={cls} viewBox="0 0 60 42" aria-hidden="true" {...rest}>
      <line className="dm-a" data-arr="1" x1="29" y1="9" x2="13" y2="29" />
      <line className="dm-a" data-arr="2" x1="31" y1="9" x2="47" y2="29" />
      <line
        className="dm-a dm-causal"
        data-arr="3"
        x1="13"
        y1="32"
        x2="47"
        y2="32"
      />
      <circle className="dm-n dm-n-c" data-node="c" cx="30" cy="6" r="2.4" />
      <circle className="dm-n dm-n-t" data-node="t" cx="10" cy="32" r="2.4" />
      <circle className="dm-n dm-n-o" data-node="o" cx="50" cy="32" r="2.4" />
    </svg>
  );
}
