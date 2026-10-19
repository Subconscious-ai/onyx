'use client';

import { scaleLinear } from '@visx/scale';
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useChartTheme } from '@/lib/subconscious-charts';
import { rehoboamImportanceView, type ImportanceRow } from './rehoboam-importance-adapter';
import {
  RehoboamAudit,
  RehoboamViewStyles,
  ViewChip,
  ViewError,
  ViewTooltip,
  anchorWithin,
} from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

export interface RehoboamImportanceViewProps {
  /** The `view` object Rehoboam attaches to the importance chart. */
  view: unknown;
  className?: string;
}

type SortOrder = 'importance' | 'disagreement';

const WIDTH = 840;
const PLOT_LEFT = 236;
const PLOT_RIGHT = 752;
const VALUE_X = 832;
const ROW_HEIGHT = 64;
const TOP = 12;
const AXIS = 36;
const RIDGE = 26;

const percent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

// Segment shades step from full ink toward the background, darkest first.
// Mid-tones are skipped: no text colour passes AA on them in both themes.
const SHADES = [100, 72, 34, 22, 14, 10];
const shade = (rank: number) =>
  `color-mix(in srgb, var(--color) ${SHADES[Math.min(rank - 1, SHADES.length - 1)]}%, var(--backgroundColor))`;

const STRIP_STYLES = `
.sce-imp__strip { display: flex; width: 100%; height: 44px; border-radius: 6px; overflow: hidden; margin-block: var(--sp-2) var(--sp-4); }
.sce-imp__segment { all: unset; box-sizing: border-box; display: flex; align-items: center; padding-inline: 10px; min-width: 0; font-family: var(--font-mono); font-size: 11px; white-space: nowrap; overflow: hidden; cursor: default; transition: opacity 160ms ease, flex-basis 420ms cubic-bezier(0.2, 0.7, 0.2, 1); border-right: 1px solid var(--backgroundColor); }
.sce-imp__segment:last-child { border-right: 0; }
.sce-imp__segment:focus-visible { outline: var(--focus-ring); outline-offset: -3px; }
.sce-imp__segment[data-row-active="false"] { opacity: 0.35; }
.sce-imp__row { cursor: default; outline: none; }
.sce-imp__row:focus-visible .sce-imp__hit { stroke: var(--color); stroke-width: 1.5; }
@media (prefers-reduced-motion: reduce) { .sce-imp__segment { transition: none; } }
`;

function ridgePath(row: ImportanceRow, x: (value: number) => number, baseline: number): string | null {
  if (row.spread.length < 2) return null;
  const peak = Math.max(...row.spread.map((point) => point.density));
  if (peak <= 0) return null;
  const y = (density: number) => baseline - (density / peak) * RIDGE;
  const top = row.spread.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.value).toFixed(1)},${y(point.density).toFixed(1)}`);
  const first = row.spread[0];
  const last = row.spread[row.spread.length - 1];
  if (!first || !last) return null;
  return `M${x(first.value).toFixed(1)},${baseline} ${top.join('').replace(/^M/, 'L')} L${x(last.value).toFixed(1)},${baseline} Z`;
}

type Focus = (attribute: string | null, anchor: Element | null) => void;
type RowState = (attribute: string) => 'true' | 'false' | undefined;

function ImportanceStrip({ rows, focus, rowState }: { rows: ImportanceRow[]; focus: Focus; rowState: RowState }) {
  return (
    <div aria-label="Share of the decision by attribute" className="sce-imp__strip" role="group">
      {rows.map((row) => (
        <button
          aria-label={`${row.attribute}: ${percent(row.mean)} of the decision on average, rank ${row.rank}`}
          className="sce-imp__segment"
          data-row-active={rowState(row.attribute)}
          key={row.attribute}
          onBlur={() => focus(null, null)}
          onFocus={(event) => focus(row.attribute, event.currentTarget)}
          onMouseEnter={(event) => focus(row.attribute, event.currentTarget)}
          onMouseLeave={() => focus(null, null)}
          style={{
            flex: `0 0 ${row.mean}%`,
            background: shade(row.rank),
            color: row.rank <= 2 ? 'var(--backgroundColor)' : 'var(--color)',
          }}
          type="button"
        >
          {row.mean >= 12 ? `${row.attribute} ${percent(row.mean, 0)}` : ''}
        </button>
      ))}
    </div>
  );
}

interface ImportanceMarkProps {
  row: ImportanceRow;
  index: number;
  x: (value: number) => number;
  showSpread: boolean;
  theme: ReturnType<typeof useChartTheme>;
  focus: Focus;
  rowState: RowState;
}

function ImportanceMark({ row, index, x, showSpread, theme, focus, rowState }: ImportanceMarkProps) {
  const top = TOP + index * ROW_HEIGHT;
  const baseline = top + ROW_HEIGHT - 20;
  const ridge = showSpread ? ridgePath(row, x, baseline) : null;
  return (
    <g
      aria-label={`${row.attribute}: average ${percent(row.mean)}, respondents range ${percent(row.minimum)} to ${percent(row.maximum)}, standard deviation ${row.standardDeviation.toFixed(1)} points`}
      className="sce-imp__row"
      data-importance-row={row.attribute}
      data-row-active={rowState(row.attribute)}
      onBlur={() => focus(null, null)}
      onFocus={(event) => focus(row.attribute, event.currentTarget)}
      onMouseEnter={(event) => focus(row.attribute, event.currentTarget)}
      onMouseLeave={() => focus(null, null)}
      role="graphics-symbol"
      tabIndex={0}
    >
      <rect className="sce-imp__hit" fill="transparent" height={ROW_HEIGHT - 6} rx={4} width={WIDTH} x={0} y={top + 2} />
      <text fill={theme.axis} fontFamily="var(--font-mono)" fontSize={10} x={0} y={baseline - 18}>
        {String(row.rank).padStart(2, '0')}
      </text>
      <text fill={theme.ink} fontFamily="var(--font-display)" fontSize={15} x={28} y={baseline - 17}>
        {row.attribute}
      </text>
      {ridge ? <path d={ridge} fill={theme.muted} opacity={0.45} /> : null}
      {showSpread ? (
        <g stroke={theme.axis}>
          <line x1={x(row.minimum)} x2={x(row.maximum)} y1={baseline + 7} y2={baseline + 7} />
          <line x1={x(row.minimum)} x2={x(row.minimum)} y1={baseline + 3} y2={baseline + 11} />
          <line x1={x(row.maximum)} x2={x(row.maximum)} y1={baseline + 3} y2={baseline + 11} />
        </g>
      ) : null}
      <rect
        className="sce-reveal"
        fill={row.rank === 1 ? theme.red : theme.ink}
        height={8}
        rx={2}
        style={{ '--sce-i': index } as CSSProperties}
        width={Math.max(0, x(row.mean) - PLOT_LEFT)}
        x={PLOT_LEFT}
        y={baseline - 4}
      />
      <text fill={theme.ink} fontFamily="var(--font-mono)" fontSize={13} textAnchor="end" x={VALUE_X} y={baseline + 4}>
        {percent(row.mean)}
      </text>
    </g>
  );
}

function ImportanceTable({ rows, title }: { rows: ImportanceRow[]; title: string }) {
  return (
    <details className="sce-data-details">
      <summary>Show data table</summary>
      <div className="sce-data-table-wrap">
        <table className="sce-data-table" aria-label={`${title} data`}>
          <thead>
            <tr>
              <th scope="col">Attribute</th>
              <th scope="col">Average share</th>
              <th scope="col">Std. dev.</th>
              <th scope="col">Range</th>
              <th scope="col">Respondents</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.attribute}>
                <th scope="row">{row.attribute}</th>
                <td>{percent(row.mean)}</td>
                <td>{row.standardDeviation.toFixed(1)}</td>
                <td>{percent(row.minimum)} to {percent(row.maximum)}</td>
                <td>{row.respondents}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Executive importance view for a Rehoboam `get_feature_importance` result:
 * how each respondent's decision divides across attributes. Viewers can
 * hover or focus an attribute in the strip or the ranking, show or hide the
 * respondent spread, and sort by how much respondents disagree.
 */
export function RehoboamImportanceView({ view, className }: RehoboamImportanceViewProps) {
  const adapted = useMemo(() => {
    try {
      return { ok: true as const, value: rehoboamImportanceView(view) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [view]);
  const theme = useChartTheme();
  const headingId = useId();
  const [order, setOrder] = useState<SortOrder>('importance');
  const [showSpread, setShowSpread] = useState(true);
  const [active, setActive] = useState<{ attribute: string; left: number; top: number } | null>(null);
  const container = useRef<HTMLElement>(null);

  const rows = useMemo(() => {
    if (!adapted.ok) return [];
    return [...adapted.value.rows].sort((a, b) =>
      order === 'importance' ? a.rank - b.rank : b.standardDeviation - a.standardDeviation,
    );
  }, [adapted, order]);

  if (!adapted.ok) {
    return (
      <>
        <EvidenceCoreStyles />
        <ViewError className={className} message={adapted.message} />
      </>
    );
  }

  const { value } = adapted;
  const byRank = [...value.rows].sort((a, b) => a.rank - b.rank);
  const ceiling = Math.max(...value.rows.map((row) => row.maximum));
  const x = scaleLinear<number>({ domain: [0, ceiling], range: [PLOT_LEFT, PLOT_RIGHT], nice: true });
  const ticks = x.ticks(5);
  const height = TOP + rows.length * ROW_HEIGHT + AXIS;
  const focus = (attribute: string | null, anchor: Element | null) => {
    const at = attribute ? anchorWithin(container.current, anchor) : null;
    setActive(attribute && at ? { attribute, ...at } : null);
  };
  const rowState: RowState = (attribute) =>
    active === null ? undefined : active.attribute === attribute ? 'true' : 'false';
  const tip = active ? value.rows.find((row) => row.attribute === active.attribute) : undefined;

  return (
    <section className={className} data-evidence-view="importance-ranking" data-run-id={value.runId} ref={container}>
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <style>{STRIP_STYLES}</style>

      <figure className="sce-figure" aria-labelledby={headingId}>
        <figcaption className="sce-figure__header">
          <h3 className="sce-figure__title" id={headingId}>{value.title}</h3>
          <span className="sce-figure__eyebrow">{value.respondents} respondents</span>
        </figcaption>

        <ImportanceStrip focus={focus} rowState={rowState} rows={byRank} />

        <div aria-label="Importance controls" className="sce-view__controls" role="toolbar">
          <ViewChip onClick={() => setOrder('importance')} pressed={order === 'importance'}>
            Rank by importance
          </ViewChip>
          <ViewChip onClick={() => setOrder('disagreement')} pressed={order === 'disagreement'}>
            Rank by disagreement
          </ViewChip>
          <span className="sce-view__spacer" />
          <ViewChip onClick={() => setShowSpread(!showSpread)} pressed={showSpread}>
            Respondent spread
          </ViewChip>
        </div>

        <div className="sce-figure__scroll">
          <svg
            aria-label={`${value.title}. ${byRank.map((row) => `${row.attribute} ${percent(row.mean)}`).join(',')}.`}
            role="img"
            viewBox={`0 0 ${WIDTH} ${height}`}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line stroke={theme.grid} x1={x(tick)} x2={x(tick)} y1={TOP} y2={height - AXIS + 4} />
                <text fill={theme.axis} fontFamily="var(--font-mono)" fontSize={10} textAnchor="middle" x={x(tick)} y={height - 14}>
                  {tick}%
                </text>
              </g>
            ))}

            {rows.map((row, index) => (
              <ImportanceMark
                focus={focus}
                index={index}
                key={row.attribute}
                row={row}
                rowState={rowState}
                showSpread={showSpread}
                theme={theme}
                x={x}
              />
            ))}
          </svg>
        </div>

        <p className="sce-view__note">
          Each respondent&apos;s attribute importances add up to 100%. Bars show the average share
          {showSpread ? '; the shaded shape shows how respondents vary, drawn only within observed minimum and maximum' : ''}.
          Importance says how much an attribute moves choices, not which level wins.
        </p>

        <ImportanceTable rows={byRank} title={value.title} />
      </figure>

      {active && tip ? (
        <ViewTooltip left={active.left} top={active.top}>
          <strong>{tip.attribute}</strong>
          <span>Rank {tip.rank} of {value.rows.length} · average {percent(tip.mean)} of the decision</span>
          <span>Respondents range {percent(tip.minimum)} to {percent(tip.maximum)} · SD {tip.standardDeviation.toFixed(1)} pts</span>
          {tip.standardDeviation >= tip.mean / 2 ? <em>Respondents disagree strongly on this attribute.</em> : null}
        </ViewTooltip>
      ) : null}

      <RehoboamAudit provenance={value.provenance} />
    </section>
  );
}
