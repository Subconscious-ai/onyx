'use client';

import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { Line } from '@visx/shape';
import { Text } from '@visx/text';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useChartTheme } from '@/lib/subconscious-charts';
import {
  defaultValueFormatter,
  finiteValues,
  formatInterval,
  intervalName,
  paddedDomain,
  type EvidenceValueFormatter,
} from './format';
import { EvidenceCoreStyles } from './styles';
import type { DecisionThreshold, EffectIntervalDatum } from './types';

const WIDTH = 840;
const LABEL_WIDTH = 226;
const PLOT_RIGHT = 724;
const VALUE_X = 832;
const TOP = 24;
const GROUP_HEIGHT = 28;
const ROW_HEIGHT = 42;
const BOTTOM = 52;

interface PositionedDatum {
  datum: EffectIntervalDatum;
  y: number;
}

interface PositionedGroup {
  label: string;
  y: number;
}

export interface EffectIntervalPlotProps {
  data: EffectIntervalDatum[];
  title: string;
  axisLabel?: string;
  description?: string;
  decisionThreshold?: DecisionThreshold;
  domain?: [number, number];
  showZeroLine?: boolean;
  formatValue?: EvidenceValueFormatter;
  className?: string;
  /** Highlights one datum and dims the rest; pair with onActiveChange. */
  activeId?: string | null;
  /** Called on hover and keyboard focus with the mark element, and null on leave. */
  onActiveChange?: (id: string | null, anchor: Element | null) => void;
  /** First column header of the data table. */
  rowHeader?: string;
  /**
   * Collapse the data table behind a disclosure and, when every row shares
   * one interval kind, state that kind once instead of on every row.
   */
  compactTable?: boolean;
  /** Stack row labels above marks in narrow containers instead of hiding values offscreen. */
  responsive?: boolean;
  /** Hide a coverage count when it could be mistaken for a validation score. */
  showCoverage?: boolean;
  /** Hide unqualified point labels when multiple kinds of point share each row. */
  showEstimateLabels?: boolean;
}

function markLabel(
  datum: EffectIntervalDatum,
  formatValue: EvidenceValueFormatter,
): string {
  if (datum.estimate === null) return `${datum.label}: estimate unavailable`;
  const interval = formatInterval(datum.interval, formatValue);
  return [
    `${datum.label}: ${formatValue(datum.estimate)}`,
    interval && datum.interval ? `${intervalName(datum.interval)} ${interval}` : '',
    datum.referencePoint ? `${datum.referencePoint.label} ${formatValue(datum.referencePoint.value)}` : '',
  ].filter(Boolean).join(',');
}

interface PlotGeometry {
  stacked: boolean;
  width: number;
  labelWidth: number;
  plotRight: number;
  valueX: number;
  top: number;
  rowHeight: number;
  tickCount: number;
}

const WIDE: PlotGeometry = {
  stacked: false, width: WIDTH, labelWidth: LABEL_WIDTH, plotRight: PLOT_RIGHT, valueX: VALUE_X, top: TOP, rowHeight: ROW_HEIGHT, tickCount: 6,
};
const STACKED: PlotGeometry = {
  stacked: true, width: 360, labelWidth: 18, plotRight: 336, valueX: 348, top: 40, rowHeight: 72, tickCount: 4,
};

type Scale = (value: number) => number;
type ChartTheme = ReturnType<typeof useChartTheme>;

/** True while a responsive figure is narrower than the stacked breakpoint. */
function useNarrow(responsive: boolean) {
  const figureRef = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!responsive || !figureRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setNarrow(entry.contentRect.width < 540); });
    observer.observe(figureRef.current);
    return () => observer.disconnect();
  }, [responsive]);
  return { figureRef, stacked: responsive && narrow };
}

function positionRows(data: EffectIntervalDatum[], top: number, rowHeight: number) {
  const positioned: PositionedDatum[] = [];
  const groups: PositionedGroup[] = [];
  let cursor = top;
  let currentGroup: string | undefined;

  data.forEach((datum) => {
    const group = datum.group ?? '';
    if (group !== currentGroup) {
      currentGroup = group;
      if (group) {
        groups.push({ label: group, y: cursor + 10 });
        cursor += GROUP_HEIGHT;
      }
    }
    positioned.push({ datum, y: cursor + rowHeight / 2 });
    cursor += rowHeight;
  });
  return { positioned, groups, height: cursor + BOTTOM };
}

function plottedValues(data: EffectIntervalDatum[], showZeroLine: boolean, threshold: number | undefined) {
  return finiteValues([
    ...(showZeroLine ? [0] : []),
    threshold,
    ...data.flatMap((datum) => [
      datum.estimate,
      datum.interval?.lower,
      datum.interval?.upper,
      datum.referencePoint?.value,
    ]),
  ]);
}

interface TableProps {
  data: EffectIntervalDatum[];
  title: string;
  rowHeader: string;
  compactTable: boolean;
  formatValue: EvidenceValueFormatter;
}

function referenceCell(datum: EffectIntervalDatum, formatValue: EvidenceValueFormatter) {
  return datum.referencePoint
    ? `${datum.referencePoint.label}: ${formatValue(datum.referencePoint.value)}`
    : 'Unavailable';
}

function EffectTableRow({ datum, hasReference, uniformKind, formatValue }: {
  datum: EffectIntervalDatum;
  hasReference: boolean;
  uniformKind: string | null;
  formatValue: EvidenceValueFormatter;
}) {
  return (
    <tr>
      <th scope="row">{datum.group ? `${datum.group} · ` : ''}{datum.label}</th>
      <td aria-label={datum.estimate === null ? 'Estimate unavailable' : undefined}>
        {datum.estimate === null ? '' : formatValue(datum.estimate)}
      </td>
      {hasReference ? <td>{referenceCell(datum, formatValue)}</td> : null}
      <td aria-label={datum.interval ? undefined : 'Interval unavailable'}>
        {formatInterval(datum.interval, formatValue)}
      </td>
      {uniformKind ? null : <td>{datum.interval ? intervalName(datum.interval) : ''}</td>}
    </tr>
  );
}

function EffectDataTable({ data, title, rowHeader, compactTable, formatValue }: TableProps) {
  const hasReference = data.some((datum) => datum.referencePoint !== undefined);
  // Kind and level both name an interval, so a 90% and a 95% interval never share one caption.
  const kinds = new Set(data.map((datum) => (datum.interval ? intervalName(datum.interval) : '')));
  const uniformKind = compactTable && kinds.size === 1 && data[0]?.interval
    ? intervalName(data[0].interval)
    : null;
  const table = (
    <div aria-label={`${title} data table; scroll horizontally`} className="sce-data-table-wrap" role="region" tabIndex={0}>
      <table className="sce-data-table" aria-label={`${title} data`}>
        {uniformKind ? <caption>Intervals: {uniformKind}</caption> : null}
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            <th scope="col">Estimate</th>
            {hasReference ? <th scope="col">Reference value</th> : null}
            <th scope="col">Interval</th>
            {uniformKind ? null : <th scope="col">Interval type</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <EffectTableRow datum={datum} formatValue={formatValue} hasReference={hasReference} key={datum.id} uniformKind={uniformKind} />
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!compactTable) return table;
  return (
    <details className="sce-data-details">
      <summary>Show data table</summary>
      {table}
    </details>
  );
}

interface FrameProps {
  x: Scale;
  ticks: number[];
  geometry: PlotGeometry;
  height: number;
  theme: ChartTheme;
  formatValue: EvidenceValueFormatter;
}

function PlotTicks({ x, ticks, geometry, height, theme, formatValue }: FrameProps) {
  return (
    <>
      {ticks.map((tick) => (
        <Group key={tick}>
          <Line
            from={{ x: x(tick), y: geometry.top }}
            to={{ x: x(tick), y: height - BOTTOM + 4 }}
            stroke={tick === 0 ? theme.axis : theme.grid}
            strokeWidth={tick === 0 ? 1.25 : 1}
          />
          <Text
            x={x(tick)}
            y={height - 26}
            fill={theme.ink}
            fontFamily="var(--font-mono)"
            fontSize={10}
            textAnchor="middle"
          >
            {formatValue(tick)}
          </Text>
        </Group>
      ))}
    </>
  );
}

function ThresholdMark({ x, geometry, height, theme, threshold }: Pick<FrameProps, 'x' | 'geometry' | 'height' | 'theme'> & { threshold: DecisionThreshold }) {
  const position = x(threshold.value);
  const pastMiddle = position > (geometry.labelWidth + geometry.plotRight) / 2;
  return (
    <Group data-decision-threshold="true">
      <Line
        from={{ x: position, y: geometry.top }}
        to={{ x: position, y: height - BOTTOM + 4 }}
        stroke={theme.red}
        strokeDasharray="5 4"
        strokeWidth={1.5}
      />
      <Text
        x={position + (pastMiddle ? -5 : 5)}
        y={12}
        fill={theme.red}
        fontFamily="var(--font-mono)"
        fontSize={9}
        textAnchor={pastMiddle ? 'end' : 'start'}
      >
        {threshold.label}
      </Text>
    </Group>
  );
}

function GroupHeadings({ groups, geometry, theme }: { groups: PositionedGroup[]; geometry: PlotGeometry; theme: ChartTheme }) {
  return (
    <>
      {groups.map((group) => (
        <Group data-effect-group={group.label} key={`${group.label}:${group.y}`}>
          <Text
            x={0}
            y={group.y}
            fill={theme.ink}
            fontFamily="var(--font-mono)"
            fontSize={9}
            letterSpacing="0.14em"
          >
            {group.label.toUpperCase()}
          </Text>
          <Line
            from={{ x: geometry.labelWidth, y: group.y - 4 }}
            to={{ x: geometry.plotRight, y: group.y - 4 }}
            stroke={theme.grid}
          />
        </Group>
      ))}
    </>
  );
}

function IntervalWhiskers({ x, y, lower, upper, stroke }: { x: Scale; y: number; lower: number; upper: number; stroke: string }) {
  return (
    <>
      <Line from={{ x: x(lower), y }} to={{ x: x(upper), y }} stroke={stroke} strokeWidth={2} />
      <Line from={{ x: x(lower), y: y - 5 }} to={{ x: x(lower), y: y + 5 }} stroke={stroke} />
      <Line from={{ x: x(upper), y: y - 5 }} to={{ x: x(upper), y: y + 5 }} stroke={stroke} />
    </>
  );
}

/** Both bounds, or null when either is missing. */
function readyInterval(datum: EffectIntervalDatum): { lower: number; upper: number } | null {
  const lower = datum.interval?.lower;
  const upper = datum.interval?.upper;
  if (lower === null || lower === undefined || upper === null || upper === undefined) return null;
  return { lower, upper };
}

interface MarkProps {
  datum: EffectIntervalDatum;
  estimate: number;
  index: number;
  x: Scale;
  y: number;
  theme: ChartTheme;
  formatValue: EvidenceValueFormatter;
  onActiveChange: ((id: string | null, anchor: Element | null) => void) | undefined;
}

function EffectMark({ datum, estimate, index, x, y, theme, formatValue, onActiveChange }: MarkProps) {
  const interval = readyInterval(datum);
  const positions = finiteValues([estimate, datum.interval?.lower, datum.interval?.upper, datum.referencePoint?.value])
    .map((value) => x(value));
  const markLeft = Math.min(...positions);
  const markRight = Math.max(...positions);
  return (
    <Group
      aria-label={markLabel(datum, formatValue)}
      className="sce-effect-mark"
      data-effect-mark={datum.id}
      role="graphics-symbol"
      style={{ '--sce-i': index } as CSSProperties}
      tabIndex={0}
      onBlur={onActiveChange && (() => onActiveChange(null, null))}
      onFocus={onActiveChange && ((event) => onActiveChange(datum.id, event.currentTarget))}
      onMouseEnter={onActiveChange && ((event) => onActiveChange(datum.id, event.currentTarget))}
      onMouseLeave={onActiveChange && (() => onActiveChange(null, null))}
    >
      <rect
        className="sce-effect-focus"
        height={30}
        width={Math.max(22, markRight - markLeft + 14)}
        x={datum.referencePoint || interval ? markLeft - 7 : x(estimate) - 11}
        y={y - 15}
      />
      {interval ? <IntervalWhiskers lower={interval.lower} stroke={theme.ink} upper={interval.upper} x={x} y={y} /> : null}
      <circle cx={x(estimate)} cy={y} fill={theme.ink} r={4.5} />
      {datum.referencePoint ? (
        <circle data-reference-point={datum.id} cx={x(datum.referencePoint.value)} cy={y} fill="none" stroke={theme.red} strokeWidth={2} r={8} />
      ) : null}
    </Group>
  );
}

interface RowProps extends Omit<MarkProps, 'estimate'> {
  geometry: PlotGeometry;
  dimmed: boolean;
  showEstimateLabels: boolean;
}

function EffectRow({ datum, geometry, dimmed, showEstimateLabels, ...mark }: RowProps) {
  const { y, theme, formatValue } = mark;
  return (
    <Group opacity={dimmed ? 0.35 : 1}>
      <Text
        x={0}
        y={geometry.stacked ? y - 25 : y}
        width={geometry.stacked ? geometry.width - 100 : LABEL_WIDTH - 16}
        verticalAnchor="middle"
        fill={theme.ink}
        fontFamily="var(--font-display)"
        fontSize={13}
      >
        {datum.label}
      </Text>
      {datum.estimate !== null ? <EffectMark {...mark} datum={datum} estimate={datum.estimate} /> : null}
      {showEstimateLabels ? <Text
        x={geometry.valueX}
        y={geometry.stacked ? y - 21 : y + 4}
        fill={theme.ink}
        fontFamily="var(--font-mono)"
        fontSize={10}
        textAnchor="end"
      >
        {datum.estimate === null ? '' : formatValue(datum.estimate)}
      </Text> : null}
    </Group>
  );
}

function thresholdSentence(threshold: DecisionThreshold | undefined, formatValue: EvidenceValueFormatter): string {
  return threshold ? ` Decision threshold: ${threshold.label} at ${formatValue(threshold.value)}.` : '';
}

type ResolvedProps = Required<Pick<EffectIntervalPlotProps,
  'data' | 'title' | 'axisLabel' | 'showZeroLine' | 'formatValue' | 'activeId' | 'rowHeader' | 'compactTable' | 'responsive' | 'showCoverage' | 'showEstimateLabels'>>
  & Pick<EffectIntervalPlotProps, 'description' | 'decisionThreshold' | 'domain' | 'className' | 'onActiveChange'>;

function EffectFigure(props: ResolvedProps) {
  const { data, title, decisionThreshold, formatValue, showZeroLine } = props;
  const headingId = useId();
  const theme = useChartTheme();
  const { figureRef, stacked } = useNarrow(props.responsive);
  const geometry = stacked ? STACKED : WIDE;
  const layout = useMemo(() => ({
    ...positionRows(data, geometry.top, geometry.rowHeight),
    domain: props.domain ?? paddedDomain(plottedValues(data, showZeroLine, decisionThreshold?.value)),
  }), [data, decisionThreshold?.value, props.domain, showZeroLine, geometry]);

  const x = scaleLinear<number>({
    domain: layout.domain,
    range: [geometry.labelWidth, geometry.plotRight],
    nice: true,
  });
  const frame: FrameProps = { x, ticks: x.ticks(geometry.tickCount), geometry, height: layout.height, theme, formatValue };
  const estimatedCount = data.filter((datum) => datum.estimate !== null).length;
  const zeroInDomain = showZeroLine && layout.domain[0] <= 0 && layout.domain[1] >= 0;

  return (
    <figure ref={figureRef} className={['sce-figure', props.className].filter(Boolean).join('')} aria-labelledby={headingId}>
      <EvidenceCoreStyles />
      <figcaption className="sce-figure__header">
        <h3 className="sce-figure__title" id={headingId}>{title}</h3>
        {props.showCoverage ? <span className="sce-figure__eyebrow">{estimatedCount}/{data.length} estimated</span> : null}
      </figcaption>

      <div aria-label={`${title} plot; scroll horizontally`} className="sce-figure__scroll" role="region" tabIndex={0}>
        <svg
          aria-label={`${title}. ${props.description ?? `${estimatedCount} of ${data.length} estimates available.`}`}
          role="img"
          viewBox={`0 0 ${geometry.width} ${layout.height}`}
          style={stacked ? { minWidth: 0 } : undefined}
        >
          <Group>
            <PlotTicks {...frame} />

            {zeroInDomain ? (
              <Line
                data-zero-line="true"
                from={{ x: x(0), y: geometry.top }}
                to={{ x: x(0), y: layout.height - BOTTOM + 4 }}
                stroke={theme.axis}
                strokeWidth={1.5}
              />
            ) : null}

            {decisionThreshold ? <ThresholdMark {...frame} threshold={decisionThreshold} /> : null}

            <GroupHeadings geometry={geometry} groups={layout.groups} theme={theme} />

            {layout.positioned.map(({ datum, y }, index) => (
              <EffectRow
                datum={datum}
                dimmed={Boolean(props.activeId) && props.activeId !== datum.id}
                formatValue={formatValue}
                geometry={geometry}
                index={index}
                key={datum.id}
                onActiveChange={props.onActiveChange}
                showEstimateLabels={props.showEstimateLabels}
                theme={theme}
                x={x}
                y={y}
              />
            ))}

            <Text
              x={(geometry.labelWidth + geometry.plotRight) / 2}
              y={layout.height - 5}
              fill={theme.ink}
              fontFamily="var(--font-mono)"
              fontSize={10}
              textAnchor="middle"
            >
              {props.axisLabel}
            </Text>
          </Group>
        </svg>
      </div>

      <p className="sce-figure__summary">
        {props.description ?? `${estimatedCount} of ${data.length} estimates are available.`}
        {thresholdSentence(decisionThreshold, formatValue)}
      </p>

      <EffectDataTable compactTable={props.compactTable} data={data} formatValue={formatValue} rowHeader={props.rowHeader} title={title} />
    </figure>
  );
}

export function EffectIntervalPlot({
  axisLabel = 'Effect',
  showZeroLine = true,
  formatValue = defaultValueFormatter,
  activeId = null,
  rowHeader = 'Segment',
  compactTable = false,
  responsive = false,
  showCoverage = true,
  showEstimateLabels = true,
  ...rest
}: EffectIntervalPlotProps) {
  return (
    <EffectFigure
      {...rest}
      activeId={activeId}
      axisLabel={axisLabel}
      compactTable={compactTable}
      formatValue={formatValue}
      responsive={responsive}
      rowHeader={rowHeader}
      showCoverage={showCoverage}
      showEstimateLabels={showEstimateLabels}
      showZeroLine={showZeroLine}
    />
  );
}
