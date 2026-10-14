'use client';

import { useId, useMemo, useRef, useState } from 'react';
import {
  rehoboamStudyOverviewView,
  type CompositionDimension,
  type OverviewStat,
} from './rehoboam-study-overview-adapter';
import {
  RehoboamAudit,
  RehoboamViewStyles,
  ViewChip,
  ViewError,
  ViewTooltip,
  anchorWithin,
  useTweened,
} from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

export interface RehoboamStudyOverviewViewProps {
  view: unknown;
  className?: string;
}

const PREVIEW = 6;
// Mid-tones are skipped: no text colour passes AA on them in both themes.
const SHADES = [100, 72, 34, 22, 14, 10];
const shade = (index: number) =>
  `color-mix(in srgb, var(--color) ${SHADES[Math.min(index, SHADES.length - 1)]}%, var(--backgroundColor))`;
const onShade = (index: number) => (index < 2 ? 'var(--backgroundColor)' : 'var(--color)');
const humanize = (name: string) => {
  const text = name.replace(/_/g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** Plain-language meaning for stat cards whose numbers need context. */
const STAT_NOTES: Record<string, string> = {
  'McFadden pseudo R²': 'Model fit to these responses (0 1).',
  'Stored opt-out (%)': 'Tasks where none of the options was chosen.',
};

const STYLES = `
.sce-ov__stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: var(--sp-4) var(--sp-3); align-items: start; margin-block: var(--sp-3) var(--sp-5); }
.sce-ov__stat { border-top: 1px solid var(--hairline); padding-top: var(--sp-2); }
.sce-ov__stat strong { display: block; font-family: var(--font-display); font-weight: 400; font-size: 30px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sce-ov__stat small { display: block; font-size: 12px; line-height: 1.35; color: color-mix(in srgb, var(--color) 82%, var(--backgroundColor)); margin-top: 4px; }
.sce-ov__rows { display: flex; flex-direction: column; gap: var(--sp-2); }
.sce-ov__row { display: grid; grid-template-columns: minmax(0, 180px) 1fr; gap: var(--sp-3); align-items: center; }
.sce-ov__name { all: unset; cursor: pointer; font-size: 13px; }
.sce-ov__name:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
.sce-ov__name::before { content: '▸ '; font-family: var(--font-mono); font-size: 10px; }
.sce-ov__name[aria-expanded="true"]::before { content: '▾ '; }
.sce-ov__bar { display: flex; height: 26px; border-radius: 5px; overflow: hidden; }
.sce-ov__seg { display: flex; align-items: center; padding-inline: 6px; min-width: 0; overflow: hidden; white-space: nowrap; font-family: var(--font-mono); font-size: 10px; border-right: 1px solid var(--backgroundColor); transition: opacity 160ms ease; outline: none; }
.sce-ov__seg:focus-visible { box-shadow: inset 0 0 0 2px var(--color); }
.sce-ov__seg[data-dim="true"] { opacity: 0.4; }
.sce-ov__missing { background: repeating-linear-gradient(135deg, var(--hairline) 0 5px, transparent 5px 10px); }
.sce-ov__detail { grid-column: 2; display: grid; grid-template-columns: minmax(0, 200px) 1fr 70px; gap: 4px var(--sp-3); font-size: 12px; align-items: center; padding-block: var(--sp-2); }
.sce-ov__track { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--color) 10%, transparent); overflow: hidden; }
.sce-ov__track span { display: block; height: 100%; background: var(--color); border-radius: 3px; }
.sce-ov__count { font-family: var(--font-mono); text-align: right; font-variant-numeric: tabular-nums; }
`;

function Stat({ stat }: { stat: OverviewStat }) {
  const numeric = typeof stat.value === 'number';
  const eased = useTweened(numeric ? (stat.value as number) : 0);
  return (
    <div className="sce-ov__stat" data-overview-stat={stat.label}>
      <span className="sce-audit__label">{stat.label}</span>
      <strong>{numeric ? eased.toFixed(stat.decimals) : stat.value}</strong>
      {STAT_NOTES[stat.label] ? <small>{STAT_NOTES[stat.label]}</small> : null}
    </div>
  );
}

interface DimensionRowProps {
  dimension: CompositionDimension;
  expanded: boolean;
  /** The focused segment's key when it belongs to this characteristic. */
  activeKey: string | null;
  onToggle: () => void;
  onFocusLevel: (level: string | null, anchor: Element | null) => void;
}

function DimensionDetail({ dimension }: { dimension: CompositionDimension }) {
  return (
    <div className="sce-ov__detail">
      {dimension.levels.map((level) => (
        <div key={level.level} style={{ display: 'contents' }}>
          <span>{level.level}</span>
          <span className="sce-ov__track"><span style={{ width: `${level.share * 100}%` }} /></span>
          <span className="sce-ov__count">{level.count} · {pct(level.share)}</span>
        </div>
      ))}
      {dimension.missing > 0 ? (
        <>
          <span>Missing</span>
          <span />
          <span className="sce-ov__count">{dimension.missing}</span>
        </>
      ) : null}
    </div>
  );
}

function DimensionRow({ dimension, expanded, activeKey, onToggle, onFocusLevel }: DimensionRowProps) {
  const key = dimension.dimension;
  return (
    <div className="sce-ov__row" data-overview-dimension={key}>
      <button
        aria-expanded={expanded}
        className="sce-ov__name"
        onClick={onToggle}
        type="button"
      >
        {humanize(key)}
      </button>
      <div
        aria-label={`${humanize(key)}: ${dimension.levels.map((level) => `${level.level} ${pct(level.share)}`).join(',')}`}
        className="sce-ov__bar"
        role="group"
      >
        {dimension.levels.map((level, index) => (
          <div
            aria-label={`${level.level}: ${level.count} of ${dimension.denominator} respondents (${pct(level.share)})`}
            className="sce-ov__seg"
            data-dim={activeKey !== null && activeKey !== `${key}::${level.level}` ? 'true' : undefined}
            key={level.level}
            onBlur={() => onFocusLevel(null, null)}
            onFocus={(event) => onFocusLevel(level.level, event.currentTarget)}
            onMouseEnter={(event) => onFocusLevel(level.level, event.currentTarget)}
            onMouseLeave={() => onFocusLevel(null, null)}
            role="img"
            style={{ flex: `0 0 ${level.share * 100}%`, background: shade(index), color: onShade(index) }}
            tabIndex={0}
          >
            {level.share >= 0.15 ? `${level.level} ${pct(level.share)}` : ''}
          </div>
        ))}
        {dimension.missing > 0 ? (
          <div
            className="sce-ov__seg sce-ov__missing"
            style={{ flex: `0 0 ${(dimension.missing / dimension.denominator) * 100}%` }}
            title={`${dimension.missing} missing`}
          />
        ) : null}
      </div>
      {expanded ? <DimensionDetail dimension={dimension} /> : null}
    </div>
  );
}

/**
 * Executive "Who answered" view of a Rehoboam `get_study_overview` result:
 * the study's key numbers, stated honestly, and the respondent composition
 * for every characteristic. Hover or focus a segment for its count; open a
 * characteristic for every level; show all characteristics or the first six.
 */
export function RehoboamStudyOverviewView({ view, className }: RehoboamStudyOverviewViewProps) {
  const adapted = useMemo(() => {
    try {
      return { ok: true as const, value: rehoboamStudyOverviewView(view) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [view]);
  const headingId = useId();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<{ key: string; dimension: CompositionDimension; level: string; left: number; top: number } | null>(null);
  const container = useRef<HTMLElement>(null);

  if (!adapted.ok) {
    return (
      <>
        <EvidenceCoreStyles />
        <ViewError className={className} message={adapted.message} />
      </>
    );
  }

  const { value } = adapted;
  const dimensions = showAll ? value.dimensions : value.dimensions.slice(0, PREVIEW);
  const focus = (dimension: CompositionDimension, level: string | null, anchor: Element | null) => {
    const at = level ? anchorWithin(container.current, anchor) : null;
    setActive(level && at ? { key: `${dimension.dimension}::${level}`, dimension, level, ...at } : null);
  };
  const tip = active ? active.dimension.levels.find((level) => level.level === active.level) : undefined;

  return (
    <section className={className} data-evidence-view="study-overview" data-run-id={value.runId} ref={container}>
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <style>{STYLES}</style>
      <figure className="sce-figure" aria-labelledby={headingId}>
        <figcaption className="sce-figure__header">
          <h3 className="sce-figure__title" id={headingId}>{value.title}</h3>
          <span className="sce-figure__eyebrow">{value.dimensions.length} respondent characteristics</span>
        </figcaption>

        <div className="sce-ov__stats">
          {value.stats.map((stat) => (
            <Stat key={stat.label} stat={stat} />
          ))}
        </div>

        <div aria-label="Composition controls" className="sce-view__controls" role="toolbar">
          <span className="sce-audit__label">Respondent composition</span>
          <span className="sce-view__spacer" />
          {value.dimensions.length > PREVIEW ? (
            <ViewChip onClick={() => setShowAll(!showAll)} pressed={showAll}>
              {showAll ? `Showing all ${value.dimensions.length}` : `Show all ${value.dimensions.length}`}
            </ViewChip>
          ) : null}
        </div>

        <div className="sce-ov__rows">
          {dimensions.map((dimension) => (
            <DimensionRow
              activeKey={active && active.dimension.dimension === dimension.dimension ? active.key : null}
              dimension={dimension}
              expanded={open === dimension.dimension}
              key={dimension.dimension}
              onFocusLevel={(level, anchor) => focus(dimension, level, anchor)}
              onToggle={() => setOpen(open === dimension.dimension ? null : dimension.dimension)}
            />
          ))}
        </div>
      </figure>

      {active && tip ? (
        <ViewTooltip left={active.left} top={active.top}>
          <strong>{tip.level}</strong>
          <span>{humanize(active.dimension.dimension)}</span>
          <span>{tip.count} of {active.dimension.denominator} respondents · {pct(tip.share)}</span>
        </ViewTooltip>
      ) : null}

      <RehoboamAudit provenance={value.provenance} />
    </section>
  );
}
