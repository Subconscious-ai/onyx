"use client";

// Source: Subconscious-ai/design-system b5ef525ee7b626b9346d1bf18c7242e666b07193 registry/components/wordmark.tsx
import "./brand.css";

/* wordmark.tsx — the canonical Subconscious brand lockup.
   ============================================================
   The lowercase "subconscious.ai" wordmark + (optional) inline
   DAG mark. Canonical pattern is to include the mark — every
   page-level masthead in the system uses the lockup. Omit only
   for standalone wordmark uses inside denser surfaces.

   Depends on the dag-mark registry item (install it first or
   together via registryDependencies).
   ============================================================ */

import type { ReactNode } from "react";
import { DagMark } from "./dag-mark";

interface WordmarkProps {
  /** Show the DAG mark inline before the wordmark. Default true (canonical lockup). */
  showDagMark?: boolean;
  /** Wraps in an anchor when provided. */
  href?: string;
  /** Additional ARIA label, used when showDagMark wraps in an anchor. */
  ariaLabel?: string;
  className?: string;
  /** Override the wordmark text. Default "subconscious.ai". */
  children?: ReactNode;
}

function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Wordmark({
  showDagMark = true,
  href,
  ariaLabel,
  className,
  children,
}: WordmarkProps) {
  const inner = (
    <>
      {showDagMark ? <DagMark /> : null}
      <span>
        {children ?? (
          <>
            <b>subconscious</b>.ai
          </>
        )}
      </span>
    </>
  );

  const cls = cn("wordmark", className);

  if (href) {
    return (
      <a className={cls} href={href} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  }
  return <span className={cls}>{inner}</span>;
}
