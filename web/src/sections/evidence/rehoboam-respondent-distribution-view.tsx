'use client';

import { scaleLinear } from '@visx/scale';
import { Text } from '@visx/text';
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useChartTheme } from '@/lib/subconscious-charts';
import {
  rehoboamRespondentDistributionView,
  type RespondentLevel,
} from './rehoboam-respondent-distribution-adapter';
import {
  RehoboamAudit,
  RehoboamViewStyles,
  ViewChip,
  ViewError,
  ViewTooltip,
  anchorWithin,
} from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

export interface RehoboamRespondentDistributionViewProps {
  view: unknown;
  className?: string;
}

type SortOrder = 'design' | 'consensus';

const WIDTH = 840;
const LABEL_WIDTH = 210;
const PLOT_LEFT = 222;
const PLOT_RIGHT = 700;
const SHARE_X = 716;
const ROW = 52;
const GROUP = 40;
const TOP = 26;
const BOTTOM = 42;
const RIDGE = 30;

const fmt = (value: number) => (Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)).replace('-', '−');
// One decimal: with n respondents, shares move in steps of 100/n percent.
const pct = (value: number) => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
/** A level is split when 40% to 60% of respondents value it above average. */
const isSplit = (favouring: number) => favouring >= 0.4 - 1e-9 && favouring <= 0.6 + 1e-9;

function ridge(level: RespondentLevel, x: (value: number) => number, baseline: number) {
  if (level.density.length < 2) return null;
  const peak = Math.max(...level.density.map((point) => point.density));
  if (peak <= 0) return null;
  const points = level.density.map(
    (point) => `${x(point.value).toFixed(1)},${(baseline - (point.density / peak) * RIDGE).toFixed(1)}`,
  );
  const first = level.density[0];
  const last = level.density[level.density.length - 1];
  if (!first || !last) return null;
  return `M${x(first.value).toFixed(1)},${baseline} L${points.join('L')} L${x(last.value).toFixed(1)},${baseline} Z`;
}

type Focus = (id: string | null, anchor: Element | null) => void;
type ChartTheme = ReturnType<typeof useChartTheme>;
type LayoutItem =
  | { kind: 'group'; label: string; y: number }
  | { kind: 'row'; level: RespondentLevel; y: number; index: number };

function layoutLevels(rows: RespondentLevel[]) {
  const layout: LayoutItem[] = [];
  let cursor = TOP;
  let group: string | null = null;
  rows.forEach((level, index) => {
    if (level.attribute !== group) {
      group = level.attribute;
      layout.push({ kind: 'group', label: group, y: cursor + 22 });
      cursor += GROUP;
    }
    layout.push({ kind: 'row', level, y: cursor + ROW - 12, index });
    cursor += ROW;
  });
  return { layout, height: cursor + BOTTOM };
}

interface LevelMarkProps {
  level: RespondentLevel;
  y: number;
  index: number;
  x: (value: number) => number;
  baseline: string;
  clipId: string;
  showBand: boolean;
  activeId: string | null;
  theme: ChartTheme;
  focus: Focus;
}

function LevelMark({ level, y, index, x, baseline, clipId, showBand, activeId, theme, focus }: LevelMarkProps) {
  const path = ridge(level, x, y);
  const state = activeId === null ? undefined : activeId === level.id ? 'true' : 'false';
  return (
    <g
      aria-label={`${level.level}: median ${fmt(level.median)}, middle 95% of respondents ${fmt(level.lower)} to ${fmt(level.upper)}, ${pct(level.favouring)} above ${baseline}`}
      data-level-row={level.id}
      data-row-active={state}
      onBlur={() => focus(null, null)}
      onFocus={(event) => focus(level.id, event.currentTarget)}
      onMouseEnter={(event) => focus(level.id, event.currentTarget)}
      onMouseLeave={() => focus(null, null)}
      role="graphics-symbol"
      style={{ outline: 'none' }}
      tabIndex={0}
    >
      <rect fill="transparent" height={ROW - 4} width={WIDTH} x={0} y={y - ROW + 14} />
      <Text
        fill={theme.ink}
        fontFamily="var(--font-display)"
        fontSize={13}
        verticalAnchor="middle"
        width={LABEL_WIDTH - 12}
        x={0}
        y={y - 8}
      >
        {level.level}
      </Text>
      {path ? (
        <g className="sce-reveal" style={{ '--sce-i': index } as CSSProperties}>
          <path clipPath={`url(#${clipId}-below)`} d={path} fill={theme.red} opacity={0.28} />
          <path clipPath={`url(#${clipId}-above)`} d={path} fill={theme.ink} opacity={0.55} />
        </g>
      ) : null}
      {showBand ? (
        <g stroke={theme.axis}>
          <line x1={x(level.lower)} x2={x(level.upper)} y1={y + 6} y2={y + 6} />
          <line x1={x(level.lower)} x2={x(level.lower)} y1={y + 2} y2={y + 10} />
          <line x1={x(level.upper)} x2={x(level.upper)} y1={y + 2} y2={y + 10} />
        </g>
      ) : null}
      <line stroke={theme.ink} strokeWidth={2} x1={x(level.median)} x2={x(level.median)} y1={y - RIDGE + 4} y2={y + 2} />
      <rect fill={theme.red} height={4} opacity={0.35} rx={2} width={100} x={SHARE_X} y={y - 2} />
      <rect fill={theme.ink} height={4} rx={2} width={100 * level.favouring} x={SHARE_X + 100 * (1 - level.favouring)} y={y - 2} />
      <text fill={theme.ink} fontFamily="var(--font-display)" fontSize={20} textAnchor="end" x={WIDTH} y={y - 10}>
        {pct(level.favouring)}
      </text>
    </g>
  );
}

interface LevelsPlotProps extends Pick<LevelMarkProps, 'baseline' | 'clipId' | 'showBand' | 'activeId' | 'theme' | 'focus'> {
  title: string;
  /** Every level of the result; fixes the scale so filtering does not rescale. */
  levels: RespondentLevel[];
  /** The levels to draw, already filtered and sorted. */
  rows: RespondentLevel[];
}

function LevelsPlot({ title, levels, rows, ...mark }: LevelsPlotProps) {
  const { baseline, clipId, theme } = mark;
  const extent = levels.flatMap((level) => [
    level.lower,
    level.upper,
    ...level.density.map((point) => point.value),
  ]);
  const x = scaleLinear<number>({
    domain: [Math.min(0, ...extent), Math.max(0, ...extent)],
    range: [PLOT_LEFT, PLOT_RIGHT],
    nice: true,
  });
  const ticks = x.ticks(6);
  const { layout, height } = layoutLevels(rows);
  const zero = x(0);
  return (
    <div className="sce-figure__scroll">
      <svg
        aria-label={`${title}. ${rows
          .map((level) => `${level.level}: ${pct(level.favouring)} of respondents above ${baseline}`)
          .join(';')}.`}
        role="img"
        viewBox={`0 0 ${WIDTH} ${height}`}
      >
        <defs>
          <clipPath id={`${clipId}-above`}>
            <rect height={height} width={PLOT_RIGHT - zero + 20} x={zero} y={0} />
          </clipPath>
          <clipPath id={`${clipId}-below`}>
            <rect height={height} width={zero - PLOT_LEFT + 20} x={PLOT_LEFT - 20} y={0} />
          </clipPath>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line stroke={theme.grid} x1={x(tick)} x2={x(tick)} y1={TOP - 6} y2={height - BOTTOM + 6} />
            <text fill={theme.axis} fontFamily="var(--font-mono)" fontSize={10} textAnchor="middle" x={x(tick)} y={height - BOTTOM + 22}>
              {fmt(tick)}
            </text>
          </g>
        ))}
        <line stroke={theme.axis} strokeWidth={1.5} x1={zero} x2={zero} y1={TOP - 12} y2={height - BOTTOM + 6} />
        <text fill={theme.axis} fontFamily="var(--font-mono)" fontSize={9} textAnchor="middle" x={zero} y={TOP - 16}>
          {baseline.replace('the', '').toUpperCase()}
        </text>
        <text fill={theme.axis} fontFamily="var(--font-mono)" fontSize={9} textAnchor="end" x={WIDTH} y={TOP - 16}>
          FAVOUR
        </text>

        {layout.map((item) =>
          item.kind === 'group' ? (
            <text fill={theme.ink} fontFamily="var(--font-mono)" fontSize={9} key={`g-${item.label}`} letterSpacing="0.14em" x={0} y={item.y}>
              {item.label.toUpperCase()}
            </text>
          ) : (
            <LevelMark {...mark} index={item.index} key={item.level.id} level={item.level} x={x} y={item.y} />
          ),
        )}
        <text fill={theme.ink} fontFamily="var(--font-mono)" fontSize={10} textAnchor="middle" x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={height - 4}>
          Respondent utility (standardized; not probability)
        </text>
      </svg>
    </div>
  );
}

function LevelsTable({ levels, title }: { levels: RespondentLevel[]; title: string }) {
  return (
    <details className="sce-data-details">
      <summary>Show data table</summary>
      <div className="sce-data-table-wrap">
        <table className="sce-data-table" aria-label={`${title} data`}>
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Median</th>
              <th scope="col">Middle 95% of respondents</th>
              <th scope="col">Above average</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr key={level.id}>
                <th scope="row">{level.attribute} · {level.level}</th>
                <td>{fmt(level.median)}</td>
                <td>{fmt(level.lower)} to {fmt(level.upper)}</td>
                <td>{pct(level.favouring)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function LevelTip({ tip, baseline, left, top }: { tip: RespondentLevel; baseline: string; left: number; top: number }) {
  return (
    <ViewTooltip left={left} top={top}>
      <strong>{tip.level}</strong>
      <span>{tip.attribute}</span>
      <span>
        {Math.round(tip.favouring * tip.respondents)} of {tip.respondents} respondents ({pct(tip.favouring)}) value it above {baseline}
      </span>
      <span>Median {fmt(tip.median)} · middle 95% {fmt(tip.lower)} to {fmt(tip.upper)}</span>
      {isSplit(tip.favouring) ? <em>Respondents are split on this level (40% to 60% above average).</em> : null}
    </ViewTooltip>
  );
}

/**
 * Executive view of a Rehoboam `get_posterior_distribution` result: how the
 * study's respondents divide on each level. With effect coding, zero is the
 * attribute average; the share right of zero is the share of respondents who
 * value the level above that average. Viewers filter by attribute, sort by
 * consensus, show the middle 95% of respondents and inspect any level.
 */
export function RehoboamRespondentDistributionView({ view, className }: RehoboamRespondentDistributionViewProps) {
  const adapted = useMemo(() => {
    try {
      return { ok: true as const, value: rehoboamRespondentDistributionView(view) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [view]);
  const theme = useChartTheme();
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const headingId = useId();
  const [chosen, setAttribute] = useState<string | null>(null);
  // A choice the current Study lacks shows every attribute, so a new Study never draws an empty chart.
  const attribute = adapted.ok && adapted.value.levels.some((level) => level.attribute === chosen) ? chosen : null;
  const [order, setOrder] = useState<SortOrder>('design');
  const [showBand, setShowBand] = useState(true);
  const [active, setActive] = useState<{ id: string; left: number; top: number } | null>(null);
  const container = useRef<HTMLElement>(null);

  const rows = useMemo(() => {
    if (!adapted.ok) return [];
    const visible = adapted.value.levels.filter((level) => attribute === null || level.attribute === attribute);
    if (order === 'design') return visible;
    const groups = [...new Set(visible.map((level) => level.attribute))];
    return groups.flatMap((group) =>
      visible
        .filter((level) => level.attribute === group)
        .sort((a, b) => Math.abs(b.favouring - 0.5) - Math.abs(a.favouring - 0.5)),
    );
  }, [adapted, attribute, order]);

  if (!adapted.ok) {
    return (
      <>
        <EvidenceCoreStyles />
        <ViewError className={className} message={adapted.message} />
      </>
    );
  }

  const { value } = adapted;
  // Dummy coding measures every level against the attribute's reference level.
  const baseline = value.encoding === 'Dummy coding is used' ? 'the reference level' : 'the attribute average';
  const attributes = [...new Set(value.levels.map((level) => level.attribute))];
  const focus = (id: string | null, anchor: Element | null) => {
    const at = id ? anchorWithin(container.current, anchor) : null;
    setActive(id && at ? { id, ...at } : null);
  };
  const tip = active ? value.levels.find((level) => level.id === active.id) : undefined;

  return (
    <section className={className} data-evidence-view="respondent-distribution" data-run-id={value.runId} ref={container}>
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <figure className="sce-figure" aria-labelledby={headingId}>
        <figcaption className="sce-figure__header">
          <h3 className="sce-figure__title" id={headingId}>{value.title}</h3>
          <span className="sce-figure__eyebrow">
            {[value.respondents === null ? null : `${value.respondents} respondents`, value.encoding]
              .filter(Boolean)
              .join('·')}
          </span>
        </figcaption>

        <div aria-label="Filter and sort levels" className="sce-view__controls" role="toolbar">
          <ViewChip onClick={() => setAttribute(null)} pressed={attribute === null}>All attributes</ViewChip>
          {attributes.map((name) => (
            <ViewChip key={name} onClick={() => setAttribute(attribute === name ? null : name)} pressed={attribute === name}>
              {name}
            </ViewChip>
          ))}
          <span className="sce-view__spacer" />
          <ViewChip onClick={() => setOrder(order === 'consensus' ? 'design' : 'consensus')} pressed={order === 'consensus'}>
            Sort by consensus
          </ViewChip>
          <ViewChip onClick={() => setShowBand(!showBand)} pressed={showBand}>Middle 95%</ViewChip>
        </div>

        <LevelsPlot
          activeId={active?.id ?? null}
          baseline={baseline}
          clipId={clipId}
          focus={focus}
          levels={value.levels}
          rows={rows}
          showBand={showBand}
          theme={theme}
          title={value.title}
        />

        <p className="sce-view__note">
          Each shape shows how the {value.respondents ?? ''} respondents&apos; own utilities for a level are spread.
          Zero is {baseline}: right of zero means a respondent values the level above it, and the percentage is
          the share of respondents who do.
          {showBand ? 'The bracket spans the middle 95% of respondents.' : ''} These describe differences between
          respondents, not uncertainty about a population estimate.
        </p>

        <LevelsTable levels={value.levels} title={value.title} />
      </figure>

      {active && tip ? <LevelTip baseline={baseline} left={active.left} tip={tip} top={active.top} /> : null}

      <RehoboamAudit provenance={value.provenance} />
    </section>
  );
}
