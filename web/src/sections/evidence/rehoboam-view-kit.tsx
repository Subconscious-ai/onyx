'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RehoboamProvenanceEntry } from './rehoboam-shared';

// Shared by every Rehoboam evidence view. Kept out of the shared evidence
// styles so pages that do not use these views do not pay for them.
const VIEW_STYLES = `
[data-evidence-view] { position: relative; }
.sce-view__controls { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; margin-block: var(--sp-3) var(--sp-4); }
.sce-view__chip { font: inherit; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em; padding: 4px 10px; border: 1px solid var(--hairline); border-radius: 999px; background: transparent; color: var(--color); cursor: pointer; transition: background-color 160ms ease, color 160ms ease; }
.sce-view__chip[aria-pressed="true"] { background: var(--color); color: var(--backgroundColor); border-color: var(--color); }
.sce-view__chip:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
.sce-view__spacer { flex: 1; }
.sce-view__tip { position: absolute; z-index: 2; pointer-events: none; min-width: min(200px, 100%); max-width: min(300px, 100%); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--hairline); border-radius: 6px; background: var(--backgroundColor); color: var(--color); box-shadow: 0 6px 24px rgb(0 0 0 / 0.18); font-size: 13px; line-height: 1.4; transform: translate(-50%, calc(-100% - 10px)); }
.sce-view__tip strong { display: block; font-weight: 600; }
.sce-view__tip span { display: block; font-family: var(--font-mono); font-size: 11px; opacity: 0.8; }
.sce-view__tip em { display: block; font-style: normal; color: var(--red); font-size: 12px; margin-top: 4px; }
.sce-view__note { font-size: 13px; line-height: 1.45; color: color-mix(in srgb, var(--color) 82%, var(--backgroundColor)); margin-block: var(--sp-3); max-width: 64ch; }
.sce-data-details summary { cursor: pointer; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; padding-block: var(--sp-2); }
.sce-data-table caption { caption-side: top; text-align: left; font-family: var(--font-mono); font-size: 11px; padding-block: var(--sp-2); }
[data-evidence-view] .sce-effect-mark, [data-evidence-view] .sce-reveal { animation: sce-view-reveal 480ms cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: calc(var(--sce-i, 0) * 35ms); transform-box: fill-box; transform-origin: left center; }
[data-evidence-view] .sce-effect-mark { transform-origin: center; }
[data-evidence-view] [data-row-active="false"] { opacity: 0.35; transition: opacity 160ms ease; }
[data-evidence-view] [data-row-active="true"] { opacity: 1; transition: opacity 160ms ease; }
/* Small red text: mix toward the ink so it keeps AA contrast in light and dark. */
.sce-view__tip em,
[data-evidence-view] .sce-overlap__warning,
[data-evidence-view] .sce-ms__delta[data-sign="down"],
[data-evidence-view] .sce-ms__status[data-tone="error"],
[data-evidence-view] .sce-cmp__status[data-tone="error"] { color: color-mix(in srgb, var(--red) 72%, var(--color)); }
@keyframes sce-view-reveal { from { opacity: 0; transform: scaleX(0.2); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { [data-evidence-view] .sce-effect-mark, [data-evidence-view] .sce-reveal { animation: none; } }
`;

export function RehoboamViewStyles() {
  return <style>{VIEW_STYLES}</style>;
}

export function ViewChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button aria-pressed={pressed} className="sce-view__chip" onClick={onClick} type="button">
      {children}
    </button>
  );
}

export interface ViewTooltipProps {
  left: number;
  top: number;
  children: ReactNode;
}

export function ViewTooltip({ left, top, children }: ViewTooltipProps) {
  return (
    <div className="sce-view__tip" role="status" style={{ left, top }}>
      {children}
    </div>
  );
}

/** Half the tooltip's maximum width, so it never leaves the view. */
const TIP_HALF_WIDTH = 150;

/** Tooltip anchor relative to the view container, from the hovered element. */
export function anchorWithin(container: Element | null, anchor: Element | null) {
  if (!container || !anchor) return null;
  const box = container.getBoundingClientRect();
  const mark = anchor.getBoundingClientRect();
  const half = Math.min(TIP_HALF_WIDTH, box.width / 2);
  const center = mark.left + mark.width / 2 - box.left;
  return { left: Math.min(Math.max(center, half), box.width - half), top: mark.top - box.top };
}

/** Where the numbers came from, collapsed under the chart. */
export function RehoboamAudit({
  provenance,
  warnings = [],
}: {
  provenance: RehoboamProvenanceEntry[];
  warnings?: string[];
}) {
  if (!provenance.length && !warnings.length) return null;
  return (
    // Long artifact names and hashes must wrap on phones.
    <details className="sce-data-details" style={{ overflowWrap: 'anywhere' }}>
      <summary>Source</summary>
      {provenance.map((entry) => (
        <span className="sce-audit__detail" key={entry.label}>
          {entry.label}: {entry.value}
        </span>
      ))}
      {warnings.length ? (
        <ul className="sce-finding__warnings">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </details>
  );
}

export function ViewError({ className, message }: { className?: string; message: string }) {
  return (
    <div className={className} data-evidence-view="error" role="alert">
      <RehoboamViewStyles />
      <p className="sce-overlap__warning">This view cannot be shown. {message}</p>
    </div>
  );
}

/** Eases a number toward its target; jumps immediately under reduced motion. */
export function useTweened(target: number, duration = 520) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
