'use client';

import { scaleLinear } from '@visx/scale';
import { Text } from '@visx/text';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useChartTheme } from '@/lib/subconscious-charts';
import {
  rehoboamSegmentComparisonView,
  type ComparisonGroup,
  type ComparisonMeasure,
  type ComparisonPair,
  type RehoboamSegmentComparisonView,
  type SegmentFilter,
} from './rehoboam-segment-comparison-adapter';
import {
  RehoboamAudit,
  RehoboamViewStyles,
  ViewChip,
  ViewError,
  ViewTooltip,
  anchorWithin,
} from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

/**
 * Host hooks that make the comparison editable. The view never fetches; the
 * host runs compare_segments with its own auth. Without them it is read-only.
 */
export interface ComparisonControls {
  /** Segment dimensions and their levels with respondent counts. */
  segments: Record<string, Array<{ level: string; respondents: number }>>;
  /** Rehoboam requires at least this many respondents per group. */
  minRespondents?: number;
  request: (groups: [SegmentFilter, SegmentFilter], measure: ComparisonMeasure) => Promise<unknown>;
}

export interface RehoboamSegmentComparisonViewProps {
  view: unknown;
  comparison?: ComparisonControls;
  className?: string;
}

const WIDTH = 840;
const LABEL_WIDTH = 220;
const PLOT_LEFT = 236;
const PLOT_RIGHT = 720;
const GAP_X = 836;
const ROW = 40;
const GROUP = 34;
const TOP = 16;
const BOTTOM = 40;

const STYLES = `
.sce-cmp__groups { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-3); margin-block: var(--sp-3); }
.sce-cmp__group { display: flex; align-items: center; gap: 6px; }
.sce-cmp__dot { width: 12px; height: 12px; border-radius: 999px; flex: none; }
.sce-cmp__group select { font: inherit; font-size: 13px; color: var(--color); background: transparent; border: 1px solid var(--hairline); border-radius: 6px; padding: 6px 8px; max-width: 220px; }
.sce-cmp__group select:focus-visible { outline: var(--focus-ring); outline-offset: 1px; }
.sce-cmp__vs { font-family: var(--font-mono); font-size: 11px; }
.sce-cmp__status { font-family: var(--font-mono); font-size: 11px; min-height: 16px; }
.sce-cmp__status[data-tone="error"] { color: var(--red); }
.sce-cmp__plot[data-pending="true"] { opacity: 0.45; transition: opacity 200ms ease; }
`;

function adapt(view: unknown) {
  try {
    return { ok: true as const, value: rehoboamSegmentComparisonView(view) };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
  }
}

/** A single-dimension, single-level filter, which is what the pickers edit. */
function simple(filter: SegmentFilter): { dimension: string; level: string } | null {
  if (filter.length !== 1) return null;
  const entries = Object.entries(filter[0]);
  if (entries.length !== 1 || entries[0][1].length !== 1) return null;
  return { dimension: entries[0][0], level: entries[0][1][0] };
}

const label = (dimension: string) => dimension.replace(/_/g, '');

type Focus = (id: string | null, anchor: Element | null) => void;
type ChartTheme = ReturnType<typeof useChartTheme>;
type Picker = { dimension: string; level: string } | null;
type Filters = [SegmentFilter, SegmentFilter];
type PickGroup = (index: 0 | 1, dimension: string, level?: string) => void;

/** Number and gap formatting for the measure: utilities or percentage shares. */
function formatters(measure: ComparisonMeasure) {
  const utility = measure === 'posterior';
  const unit = utility ? '' : '%';
  const fmt = (value: number) => `${value.toFixed(utility ? 2 : 1)}${unit}`.replace('-', '−');
  const gapText = (gap: number) => `${gap > 0 ? '+' : gap < 0 ? '−' : '±'}${Math.abs(gap).toFixed(utility ? 2 : 1)}${utility ? '' : 'pts'}`;
  return { utility, fmt, gapText };
}
type Formatters = ReturnType<typeof formatters>;

function visiblePairs(current: RehoboamSegmentComparisonView | null, attribute: string | null, sortByGap: boolean) {
  if (!current) return [];
  const visible = current.pairs.filter((pair) => attribute === null || pair.attribute === attribute);
  if (!sortByGap) return visible;
  if (current.measure === 'importance') return [...visible].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const groups = [...new Set(visible.map((pair) => pair.attribute))];
  return groups.flatMap((group) =>
    visible.filter((pair) => pair.attribute === group).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)),
  );
}

/** Runs a host comparison; a newer request supersedes an older one still in flight. */
function useComparisonRun(
  comparison: ComparisonControls | undefined,
  onStart: () => void,
  onResult: (value: RehoboamSegmentComparisonView) => void,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);
  const run = (filters: Filters, measure: ComparisonMeasure) => {
    if (!comparison) return;
    const mine = ++ticket.current;
    setPending(true);
    setError(null);
    onStart();
    comparison
      .request(filters, measure)
      .then((result) => {
        if (mine !== ticket.current) return;
        const adapted = adapt(result);
        if (!adapted.ok) throw new Error(adapted.message);
        onResult(adapted.value);
      })
      .catch((reason: unknown) => {
        if (mine !== ticket.current) return;
        setError(
          `Could not run this comparison. The chart shows the previous one. ${
            reason instanceof Error ? reason.message : ''
          }`.trim(),
        );
      })
      .finally(() => {
        if (mine === ticket.current) setPending(false);
      });
  };
  /** Ignores any comparison still in flight, as when the Study changes. */
  const reset = () => {
    ticket.current++;
    setPending(false);
    setError(null);
  };
  return { pending, error, run, reset };
}

/** The level to compare when a dimension is chosen: the first large enough group the other side is not using. */
function defaultLevel(comparison: ComparisonControls | undefined, dimension: string, other: Picker, minimum: number) {
  const options = comparison?.segments[dimension] ?? [];
  return options.find(
    (option) =>
      option.respondents >= minimum && !(other?.dimension === dimension && other.level === option.level),
  )?.level;
}

interface GroupSelectsProps {
  index: 0 | 1;
  picked: { dimension: string; level: string };
  comparison: ComparisonControls;
  minimum: number;
  pending: boolean;
  pick: PickGroup;
}

function GroupSelects({ index, picked, comparison, minimum, pending, pick }: GroupSelectsProps) {
  const name = index === 0 ? 'A' : 'B';
  return (
    <>
      <select
        aria-label={`Group ${name} dimension`}
        disabled={pending}
        onChange={(event) => pick(index, event.target.value)}
        value={picked.dimension}
      >
        {Object.entries(comparison.segments).map(([dimension, options]) => {
          const usable = options.some((option) => option.respondents >= minimum);
          return (
            <option disabled={!usable} key={dimension} value={dimension}>
              {label(dimension)}{usable ? '' : '· groups too small'}
            </option>
          );
        })}
      </select>
      <select
        aria-label={`Group ${name} level`}
        disabled={pending}
        onChange={(event) => pick(index, picked.dimension, event.target.value)}
        value={picked.level}
      >
        {(comparison.segments[picked.dimension] ?? []).map((option) => (
          <option disabled={option.respondents < minimum} key={option.level} value={option.level}>
            {option.level} ({option.respondents}){option.respondents < minimum ? '· too few' : ''}
          </option>
        ))}
      </select>
    </>
  );
}

interface GroupPickersProps extends Omit<GroupSelectsProps, 'index' | 'picked' | 'comparison'> {
  groups: ComparisonGroup[];
  pickers: Picker[];
  comparison?: ComparisonControls;
  colors: [string, string];
}

function GroupPickers({ groups, pickers, comparison, colors, ...selects }: GroupPickersProps) {
  const editable = Boolean(comparison) && pickers.every(Boolean);
  return (
    <div className="sce-cmp__groups">
      {groups.map((group, index) => {
        const picked = pickers[index];
        return (
          <span className="sce-cmp__group" data-comparison-group={index === 0 ? 'A' : 'B'} key={index}>
            <span className="sce-cmp__dot" style={{ background: colors[index] }} />
            {editable && picked && comparison ? (
              <GroupSelects {...selects} comparison={comparison} index={index as 0 | 1} picked={picked} />
            ) : (
              <span>{group.label}</span>
            )}
            {index === 0 ? <span className="sce-cmp__vs">vs</span> : null}
          </span>
        );
      })}
    </div>
  );
}

type LayoutItem =
  | { kind: 'group'; label: string; y: number }
  | { kind: 'row'; pair: ComparisonPair; y: number; index: number };

function layoutPairs(pairs: ComparisonPair[], grouped: boolean) {
  const layout: LayoutItem[] = [];
  let cursor = TOP;
  let section: string | null = null;
  pairs.forEach((pair, index) => {
    if (grouped && pair.attribute !== section) {
      section = pair.attribute;
      layout.push({ kind: 'group', label: section, y: cursor + 20 });
      cursor += GROUP;
    }
    layout.push({ kind: 'row', pair, y: cursor + ROW / 2, index });
    cursor += ROW;
  });
  return { layout, height: cursor + BOTTOM };
}

interface PairMarkProps {
  pair: ComparisonPair;
  y: number;
  index: number;
  x: (value: number) => number;
  groups: ComparisonGroup[];
  format: Formatters;
  activeId: string | null;
  theme: ChartTheme;
  focus: Focus;
}

function PairMark({ pair, y, index, x, groups, format, activeId, theme, focus }: PairMarkProps) {
  const { fmt, gapText } = format;
  const state = activeId === null ? undefined : activeId === pair.id ? 'true' : 'false';
  const [left, right] = [x(pair.a.estimate), x(pair.b.estimate)].sort((m, n) => m - n);
  return (
    <g
      aria-label={`${pair.level || pair.attribute}: ${groups[0].label} ${fmt(pair.a.estimate)}, ${groups[1].label} ${fmt(pair.b.estimate)}, gap ${gapText(pair.gap)}`}
      data-comparison-row={pair.id}
      data-row-active={state}
      onBlur={() => focus(null, null)}
      onFocus={(event) => focus(pair.id, event.currentTarget)}
      onMouseEnter={(event) => focus(pair.id, event.currentTarget)}
      onMouseLeave={() => focus(null, null)}
      role="graphics-symbol"
      style={{ outline: 'none' }}
      tabIndex={0}
    >
      <rect fill="transparent" height={ROW - 4} width={WIDTH} x={0} y={y - ROW / 2 + 2} />
      <Text fill={theme.ink} fontFamily="var(--font-display)" fontSize={13} verticalAnchor="middle" width={LABEL_WIDTH - 12} x={0} y={y}>
        {pair.level || pair.attribute}
      </Text>
      <g className="sce-reveal" style={{ '--sce-i': index } as CSSProperties}>
        <line stroke={theme.muted} strokeWidth={3} x1={left} x2={right} y1={y} y2={y} />
        <circle cx={x(pair.a.estimate)} cy={y} fill={theme.ink} r={6} />
        <circle cx={x(pair.b.estimate)} cy={y} fill={theme.red} r={6} />
      </g>
      <text fill={theme.ink} fontFamily="var(--font-mono)" fontSize={12} textAnchor="end" x={GAP_X} y={y + 4}>
        {gapText(pair.gap)}
      </text>
    </g>
  );
}

interface ComparisonPlotProps extends Pick<PairMarkProps, 'groups' | 'format' | 'activeId' | 'theme' | 'focus'> {
  title: string;
  pairs: ComparisonPair[];
  /** Dims the plot while a request runs or after one failed. */
  stale: boolean;
}

function ComparisonPlot({ title, pairs, stale, ...mark }: ComparisonPlotProps) {
  const { groups, theme } = mark;
  const { utility, fmt } = mark.format;
  const values = pairs.flatMap((pair) => [pair.a.estimate, pair.b.estimate]);
  const x = scaleLinear<number>({
    domain: utility ? [Math.min(0, ...values), Math.max(0, ...values)] : [0, Math.max(...values)],
    range: [PLOT_LEFT, PLOT_RIGHT],
    nice: true,
  });
  const { layout, height } = layoutPairs(pairs, utility);
  return (
    <div className="sce-figure__scroll sce-cmp__plot" data-pending={stale}>
      <svg
        aria-label={`${title}: ${groups[0].label} against ${groups[1].label}. ${pairs
          .map((pair) => `${pair.level || pair.attribute}: ${fmt(pair.a.estimate)} against ${fmt(pair.b.estimate)}`)
          .join(';')}.`}
        role="img"
        viewBox={`0 0 ${WIDTH} ${height}`}
      >
        {x.ticks(6).map((tick) => (
          <g key={tick}>
            <line stroke={tick === 0 && utility ? theme.axis : theme.grid} strokeWidth={tick === 0 && utility ? 1.5 : 1} x1={x(tick)} x2={x(tick)} y1={TOP} y2={height - BOTTOM + 4} />
            <text fill={theme.axis} fontFamily="var(--font-mono)" fontSize={10} textAnchor="middle" x={x(tick)} y={height - BOTTOM + 20}>
              {fmt(tick)}
            </text>
          </g>
        ))}
        {layout.map((item) =>
          item.kind === 'group' ? (
            <text fill={theme.ink} fontFamily="var(--font-mono)" fontSize={9} key={`g-${item.label}`} letterSpacing="0.14em" x={0} y={item.y}>
              {item.label.toUpperCase()}
            </text>
          ) : (
            <PairMark {...mark} index={item.index} key={item.pair.id} pair={item.pair} x={x} y={item.y} />
          ),
        )}
        <text fill={theme.ink} fontFamily="var(--font-mono)" fontSize={10} textAnchor="middle" x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={height - 4}>
          {utility ? 'Median respondent utility (standardized; not probability)' : 'Average share of the decision'}
        </text>
      </svg>
    </div>
  );
}

function groupLine(group: ComparisonGroup, value: ComparisonPair['a'], fmt: Formatters['fmt']) {
  const range = value.lower !== null && value.upper !== null ? ` · middle 95% ${fmt(value.lower)} to ${fmt(value.upper)}` : '';
  return `${group.label}: ${fmt(value.estimate)} (n=${value.respondents})${range}`;
}

function PairTip({ tip, groups, format, left, top }: { tip: ComparisonPair; groups: ComparisonGroup[]; format: Formatters; left: number; top: number }) {
  return (
    <ViewTooltip left={left} top={top}>
      <strong>{tip.level || tip.attribute}</strong>
      {tip.level ? <span>{tip.attribute}</span> : null}
      <span>{groupLine(groups[0], tip.a, format.fmt)}</span>
      <span>{groupLine(groups[1], tip.b, format.fmt)}</span>
      <span>Gap {format.gapText(tip.gap)}</span>
    </ViewTooltip>
  );
}

function RunStatus({ pending, error }: { pending: boolean; error: string | null }) {
  return (
    <p aria-live="polite" className="sce-cmp__status" data-tone={error ? 'error' : undefined} role="status">
      {pending ? 'Comparing with Rehoboam…' : error ?? ''}
    </p>
  );
}

interface ToolbarProps {
  measure: ComparisonMeasure;
  attributes: string[];
  attribute: string | null;
  sortByGap: boolean;
  onMeasure: (measure: ComparisonMeasure) => void;
  onAttribute: (attribute: string | null) => void;
  onSortByGap: (sortByGap: boolean) => void;
}

function ComparisonToolbar({ measure, attributes, attribute, sortByGap, onMeasure, onAttribute, onSortByGap }: ToolbarProps) {
  return (
    <div aria-label="Comparison controls" className="sce-view__controls" role="toolbar">
      <ViewChip onClick={() => (measure === 'importance' ? undefined : onMeasure('importance'))} pressed={measure === 'importance'}>
        What matters
      </ViewChip>
      <ViewChip onClick={() => (measure === 'posterior' ? undefined : onMeasure('posterior'))} pressed={measure === 'posterior'}>
        Level utility
      </ViewChip>
      {measure === 'posterior'
        ? attributes.map((name) => (
            <ViewChip key={name} onClick={() => onAttribute(attribute === name ? null : name)} pressed={attribute === name}>
              {name}
            </ViewChip>
          ))
        : null}
      <span className="sce-view__spacer" />
      <ViewChip onClick={() => onSortByGap(!sortByGap)} pressed={sortByGap}>Largest gap first</ViewChip>
    </div>
  );
}

/**
 * Executive comparison of two respondent groups from a Rehoboam
 * `compare_segments` result: what matters to each (importance) or how each
 * values every level (utility). Viewers choose the groups and the measure,
 * sort by the largest gap and inspect any row. These are descriptive
 * differences between respondent groups.
 */
export function RehoboamSegmentComparisonView({ view, comparison, className }: RehoboamSegmentComparisonViewProps) {
  const initial = useMemo(() => adapt(view), [view]);
  const theme = useChartTheme();
  const headingId = useId();
  const [current, setCurrent] = useState<RehoboamSegmentComparisonView | null>(initial.ok ? initial.value : null);
  const [sortByGap, setSortByGap] = useState(false);
  const [attribute, setAttribute] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; left: number; top: number } | null>(null);
  const container = useRef<HTMLElement>(null);
  const { pending, error, run, reset } = useComparisonRun(
    comparison,
    () => setActive(null),
    (value) => {
      setCurrent(value);
      setAttribute(null);
    },
  );

  useEffect(() => {
    // A comparison requested for the previous Study must not land on this one.
    reset();
    setCurrent(initial.ok ? initial.value : null);
    setAttribute(null);
    setActive(null);
  }, [initial]);

  const pairs = useMemo(() => visiblePairs(current, attribute, sortByGap), [current, attribute, sortByGap]);

  if (!initial.ok || !current) {
    return (
      <>
        <EvidenceCoreStyles />
        <ViewError className={className} message={initial.ok ? 'No comparison.' : initial.message} />
      </>
    );
  }

  const minimum = comparison?.minRespondents ?? 25;
  const pickers = current.groups.map((group) => simple(group.filter));
  const filters = current.groups.map((group) => group.filter) as Filters;
  const pick: PickGroup = (index, dimension, level) => {
    const choice = level ?? defaultLevel(comparison, dimension, pickers[1 - index], minimum);
    if (!choice) return;
    const next = [...filters] as Filters;
    next[index] = [{ [dimension]: [choice] }];
    run(next, current.measure);
  };

  const format = formatters(current.measure);
  const focus: Focus = (id, anchor) => {
    const at = id ? anchorWithin(container.current, anchor) : null;
    setActive(id && at ? { id, ...at } : null);
  };
  const tip = active ? current.pairs.find((pair) => pair.id === active.id) : undefined;

  return (
    <section className={className} data-evidence-view="segment-comparison" data-run-id={current.runId} ref={container}>
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <style>{STYLES}</style>
      <figure className="sce-figure" aria-labelledby={headingId}>
        <figcaption className="sce-figure__header">
          <h3 className="sce-figure__title" id={headingId}>{current.title}</h3>
          <span className="sce-figure__eyebrow">
            {current.groups.map((group) => `${group.label} (${group.respondents})`).join('vs')}
          </span>
        </figcaption>

        <GroupPickers
          colors={[theme.ink, theme.red]}
          comparison={comparison}
          groups={current.groups}
          minimum={minimum}
          pending={pending}
          pick={pick}
          pickers={pickers}
        />

        <ComparisonToolbar
          attribute={attribute}
          attributes={[...new Set(current.pairs.map((pair) => pair.attribute))]}
          measure={current.measure}
          onAttribute={setAttribute}
          onMeasure={(measure) => run(filters, measure)}
          onSortByGap={setSortByGap}
          sortByGap={sortByGap}
        />

        <RunStatus error={error} pending={pending} />

        <ComparisonPlot
          activeId={active?.id ?? null}
          focus={focus}
          format={format}
          groups={current.groups}
          pairs={pairs}
          stale={pending || error !== null}
          theme={theme}
          title={current.title}
        />

        <p className="sce-view__note">
          {format.utility
            ? 'Dots are each group’s median respondent utility for the level.'
            : 'Dots are each group’s average share of the decision for attribute.'}
          The gap is group B minus group A. These describe differences between two groups of respondents; they are not
          causal effects of belonging to a group, and no uncertainty is computed for the gap. Each group needs at least{''}
          {minimum} respondents.
        </p>
      </figure>

      {active && tip ? <PairTip format={format} groups={current.groups} left={active.left} tip={tip} top={active.top} /> : null}

      <RehoboamAudit provenance={current.provenance} />
    </section>
  );
}
