import { useEffect, useState } from 'react';

/**
 * Resolve a CSS color expression (typically `var(--token)`) to a concrete
 * `rgb()` string by probing a throwaway element. Returns the input
 * unchanged during SSR.
 */
export function resolveColor(expr: string): string {
  if (typeof document === 'undefined') return expr;
  const probe = document.createElement('span');
  probe.style.color = expr;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || expr;
}

/** The canonical chart palette, resolved from the live theme. */
export interface ChartTheme {
  /** var(--color) — primary series, "did" data */
  ink: string;
  /** var(--backgroundColor) */
  bg: string;
  /** var(--hair) — gridlines, never heavier */
  grid: string;
  /** var(--grey-500) — axis ticks/labels (mono) */
  axis: string;
  /** var(--grey-300) — comparison / "said" data */
  muted: string;
  /** var(--red) — the gap, deltas, contradictions */
  red: string;
  /** var(--chart-1..5) — categorical hues */
  series: string[];
}

function buildChartTheme(): ChartTheme {
  return {
    ink: resolveColor('var(--color)'),
    bg: resolveColor('var(--backgroundColor)'),
    grid: resolveColor('var(--hair)'),
    axis: resolveColor('var(--grey-500)'),
    muted: resolveColor('var(--grey-300)'),
    red: resolveColor('var(--red)'),
    series: [1, 2, 3, 4, 5].map((n) => resolveColor(`var(--chart-${n})`)),
  };
}

/**
 * The canonical chart palette, re-resolved whenever the theme or mode
 * changes (watches `data-theme` / `data-mode` on `<html>`).
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => buildChartTheme());
  useEffect(() => {
    setTheme(buildChartTheme());
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTheme(buildChartTheme()));
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
    // Hosts that theme through the OS setting switch without touching <html>.
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onScheme = () => setTheme(buildChartTheme());
    scheme?.addEventListener?.('change', onScheme);
    return () => {
      obs.disconnect();
      scheme?.removeEventListener?.('change', onScheme);
    };
  }, []);
  return theme;
}

/**
 * Canonical mono font stack for chart axes. A literal stack, not
 * `var(--font-mono)`: recharts writes `fontFamily` into SVG attributes
 * where `var()` may not resolve. Mirrors the full `--font-mono` cascade
 * from CONTRACT.md — including `IBM Plex Mono`, the SIL-OFL public font
 * an unlicensed consumer falls to before the system mono.
 */
export const CHART_MONO =
  "'SohneMono', 'IBM Plex Mono', ui-monospace, 'SF Menlo, monospace";

/** Canonical mono tick style for chart axes. */
export const MONO_TICK = {
  fontFamily: CHART_MONO,
  fontSize: 10,
  letterSpacing: '0.04em',
} as const;
