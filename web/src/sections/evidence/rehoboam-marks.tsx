'use client';

import type { CSSProperties } from 'react';

// Marks shared by the finding views: who sits on which side of zero, and where
// respondents fall on a shared axis. Positions are percentages, so the marks
// reflow at any width without measuring the page.
const MARK_STYLES = `
.sce-mark__row { margin-block: var(--sp-3); overflow-wrap: anywhere; }
.sce-mark__row[data-selected="true"] .sce-mark__label { font-weight: 600; }
.sce-mark__label { display: block; font-size: 14px; line-height: 1.35; margin-bottom: 6px; }
.sce-mark__detail { font-family: var(--font-mono); font-size: 11px; line-height: 1.6; margin: 6px 0 0; }
.sce-mark__share { display: flex; height: 18px; width: 100%; background: var(--hairline); }
.sce-mark__share span { min-width: 0; }
.sce-mark__share [data-side="lower"], .sce-mark__key [data-side="lower"] { background: color-mix(in srgb, var(--color) 42%, var(--backgroundColor)); }
.sce-mark__share [data-side="tied"], .sce-mark__key [data-side="tied"] { background: color-mix(in srgb, var(--color) 14%, var(--backgroundColor)); }
.sce-mark__share [data-side="higher"], .sce-mark__key [data-side="higher"] { background: var(--color); }
.sce-mark__key { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); font-size: 12px; margin-block: var(--sp-3); }
.sce-mark__key i { display: inline-block; width: 9px; height: 9px; margin-right: 6px; }
.sce-mark__track { position: relative; height: 34px; border-bottom: 1px solid var(--hairline); }
.sce-mark__track i { position: absolute; display: block; }
.sce-mark__zero { top: 0; bottom: 0; border-left: 1px dashed color-mix(in srgb, var(--color) 45%, transparent); }
.sce-mark__band { top: 12px; height: 10px; min-width: 2px; background: color-mix(in srgb, var(--color) 18%, transparent); }
.sce-mark__mass { top: 2px; bottom: 0; width: 3px; margin-left: -1.5px; background: var(--color); }
.sce-mark__median { top: 5px; height: 24px; width: 2px; margin-left: -1px; background: var(--color); }
.sce-mark__mean { top: 12px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; border: 2px solid var(--color); background: var(--backgroundColor); }
.sce-mark__rug { display: block; width: 100%; height: 26px; margin-top: 2px; }
.sce-mark__rug line { stroke: var(--color); stroke-opacity: 0.55; stroke-width: 1; }
.sce-mark__axis { display: flex; justify-content: space-between; gap: var(--sp-3); font-family: var(--font-mono); font-size: 11px; padding-top: 6px; }
.sce-mark__axis span { white-space: nowrap; }
.sce-mark__axis span:nth-child(2) { text-align: center; white-space: normal; }
`;

export function MarkStyles() {
  return <style>{MARK_STYLES}</style>;
}

/** A signed value at three significant digits. */
/** Whole-number counts with thousands separators. */
export function count(value: number): string {
  return value.toLocaleString('en-US');
}

export function signed(value: number): string {
  return value.toLocaleString('en-US', { maximumSignificantDigits: 3, signDisplay: 'exceptZero' });
}

/** An axis that always contains zero, padded so the end marks stay visible. */
export function zeroDomain(values: number[]): [number, number] {
  const low = values.reduce((least, value) => Math.min(least, value), 0);
  const high = values.reduce((most, value) => Math.max(most, value), 0);
  const pad = (high - low) * 0.08 || 1;
  return [low - pad, high + pad];
}

function percentAt(domain: [number, number], value: number): number {
  return ((value - domain[0]) / (domain[1] - domain[0])) * 100;
}

export interface ShareCounts {
  lower: number;
  tied: number;
  higher: number;
}

/** One bar split by respondent count: lower, tied, higher. Widths are counts, not estimates. */
export function ShareBar({ counts, label, index = 0 }: { counts: ShareCounts; label: string; index?: number }) {
  return (
    <div aria-label={label} className="sce-mark__share" role="img">
      {(['lower', 'tied', 'higher'] as const).map((side) => (
        <span
          className="sce-reveal"
          data-side={side}
          key={side}
          style={{ flex: `${counts[side]} 0 0`, '--sce-i': index } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function ShareKey() {
  return (
    <div aria-hidden="true" className="sce-mark__key">
      <span><i data-side="lower" />Lower</span>
      <span><i data-side="tied" />Tied</span>
      <span><i data-side="higher" />Higher</span>
    </div>
  );
}

export interface QuantileMarks {
  p10: number;
  p90: number;
  median: number;
  mean: number;
  /** A value several respondents share exactly; drawn as a line, never smoothed. */
  point_mass: { value: number } | null;
}

export interface QuantileTrackProps {
  domain: [number, number];
  marks: QuantileMarks;
  label: string;
  /** Exact respondent values; each line's height is the respondents at that value. */
  points?: Array<{ value: number; count: number }>;
  index?: number;
}

function Rug({ domain, points }: { domain: [number, number]; points: Array<{ value: number; count: number }> }) {
  const tallest = points.reduce((most, point) => Math.max(most, point.count), 1);
  return (
    <svg aria-hidden="true" className="sce-mark__rug" preserveAspectRatio="none" viewBox="0 100 10">
      {points.map((point, index) => {
        const x = percentAt(domain, point.value);
        return <line key={`${point.value}-${index}`} vectorEffect="non-scaling-stroke" x1={x} x2={x} y1={10 - (point.count / tallest) * 10} y2={10} />;
      })}
    </svg>
  );
}

/**
 * Where respondents fall on a shared axis: the 10th-90th percentile band, the
 * median, the mean and any point mass. The band is respondent spread; it is
 * never drawn or labelled as uncertainty about the mean.
 */
export function QuantileTrack({ domain, marks, label, points, index = 0 }: QuantileTrackProps) {
  const left = (value: number) => ({ left: `${percentAt(domain, value)}%` });
  const width = `${percentAt(domain, marks.p90) - percentAt(domain, marks.p10)}%`;
  return (
    <div aria-label={label} role="img">
      <div className="sce-mark__track">
        <i className="sce-mark__zero" style={left(0)} />
        <i className="sce-mark__band sce-reveal" style={{ ...left(marks.p10), width, '--sce-i': index } as CSSProperties} />
        {marks.point_mass ? <i className="sce-mark__mass" data-point-mass style={left(marks.point_mass.value)} /> : null}
        <i className="sce-mark__median" style={left(marks.median)} />
        <i className="sce-mark__mean" style={left(marks.mean)} />
      </div>
      {points?.length ? <Rug domain={domain} points={points} /> : null}
    </div>
  );
}

export function QuantileAxis({ domain, label }: { domain: [number, number]; label: string }) {
  return (
    <div className="sce-mark__axis">
      <span>{signed(domain[0])}</span>
      <span>{label}</span>
      <span>{signed(domain[1])}</span>
    </div>
  );
}
