'use client';

import { useMemo, useRef, useState } from 'react';
import { EffectIntervalPlot } from './effect-interval-plot';
import { defaultValueFormatter, formatInterval, intervalName } from './format';
import { rehoboamEffectView } from './rehoboam-effect-adapter';
import {
  RehoboamAudit,
  RehoboamViewStyles,
  ViewChip,
  ViewError,
  ViewTooltip,
  anchorWithin,
} from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';
import type { EffectIntervalDatum } from './types';

export interface RehoboamEffectViewProps {
  /** The `view` object Rehoboam attaches to an analytics chart. */
  view: unknown;
  className?: string;
}

type SortOrder = 'design' | 'effect';

interface Tooltip {
  datum: EffectIntervalDatum;
  left: number;
  top: number;
}

function crossesZero(datum: EffectIntervalDatum): boolean {
  const lower = datum.interval?.lower;
  const upper = datum.interval?.upper;
  return lower != null && upper != null && lower < 0 && upper > 0;
}

function EffectTip({ tooltip }: { tooltip: Tooltip }) {
  const tip = tooltip.datum;
  return (
    <ViewTooltip left={tooltip.left} top={tooltip.top}>
      <strong>{tip.label}</strong>
      <span>{tip.group}</span>
      <span>
        Estimate {tip.estimate === null ? 'unavailable' : defaultValueFormatter(tip.estimate)}
        {tip.interval ? ` · ${intervalName(tip.interval)} ${formatInterval(tip.interval, defaultValueFormatter)}` : ''}
      </span>
      {crossesZero(tip) ? <em>Range includes zero, so the direction is uncertain.</em> : null}
      {tip.detail ? <span>{tip.detail}</span> : null}
    </ViewTooltip>
  );
}

/**
 * Executive effect-size view for a Rehoboam `get_amce` result. Viewers can
 * filter by attribute, sort by effect, and hover or focus any level for its
 * exact estimate and range. Provenance sits in a collapsed Source note. An
 * invalid view renders an explicit error instead of a partial chart.
 */
export function RehoboamEffectView({ view, className }: RehoboamEffectViewProps) {
  const adapted = useMemo(() => {
    try {
      return { ok: true as const, value: rehoboamEffectView(view) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [view]);
  const [chosen, setAttribute] = useState<string | null>(null);
  // A choice the current Study lacks shows every attribute, so a new Study never draws an empty chart.
  const attribute = adapted.ok && adapted.value.data.some((datum) => datum.group === chosen) ? chosen : null;
  const [order, setOrder] = useState<SortOrder>('design');
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const container = useRef<HTMLElement>(null);

  const rows = useMemo(() => {
    if (!adapted.ok) return [];
    const visible = adapted.value.data.filter((datum) => attribute === null || datum.group === attribute);
    if (order === 'design') return visible;
    // Sort within each attribute so group headings stay intact.
    const groups = [...new Set(visible.map((datum) => datum.group ?? ''))];
    return groups.flatMap((group) =>
      visible
        .filter((datum) => (datum.group ?? '') === group)
        .sort((a, b) => (b.estimate ?? -Infinity) - (a.estimate ?? -Infinity)),
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
  const attributes = [...new Set(value.data.map((datum) => datum.group).filter(Boolean))] as string[];
  const byId = new Map(value.data.map((datum) => [datum.id, datum]));

  const onActiveChange = (id: string | null, anchor: Element | null) => {
    const datum = id ? byId.get(id) : undefined;
    const at = anchorWithin(container.current, anchor);
    setTooltip(datum && at ? { datum, ...at } : null);
  };

  return (
    <section
      className={className}
      data-evidence-view="effect-interval"
      data-run-id={value.runId}
      ref={container}
    >
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <div aria-label="Filter and sort effects" className="sce-view__controls" role="toolbar">
        <ViewChip onClick={() => setAttribute(null)} pressed={attribute === null}>
          All attributes
        </ViewChip>
        {attributes.map((name) => (
          <ViewChip
            key={name}
            onClick={() => setAttribute(attribute === name ? null : name)}
            pressed={attribute === name}
          >
            {name}
          </ViewChip>
        ))}
        <span className="sce-view__spacer" />
        <ViewChip onClick={() => setOrder(order === 'effect' ? 'design' : 'effect')} pressed={order === 'effect'}>
          Sort by effect
        </ViewChip>
      </div>

      <EffectIntervalPlot
        activeId={tooltip?.datum.id ?? null}
        axisLabel={value.axisLabel}
        compactTable
        data={rows}
        description={value.description}
        onActiveChange={onActiveChange}
        rowHeader="Level"
        title={value.title}
      />

      {tooltip ? <EffectTip tooltip={tooltip} /> : null}

      <RehoboamAudit provenance={value.provenance} />
    </section>
  );
}
