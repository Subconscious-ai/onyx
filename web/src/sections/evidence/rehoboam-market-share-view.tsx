'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  rehoboamMarketShareView,
  type RehoboamMarketShareView,
  type ScenarioProduct,
  type ScenarioShare,
} from './rehoboam-market-share-adapter';
import { RehoboamAudit, RehoboamViewStyles, ViewError, useTweened } from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

/**
 * Host hooks that make the scenario editable. The view never fetches: the
 * host runs the analysis (with its own auth and tenancy) and returns the new
 * Rehoboam view. Without them the view is read-only.
 */
export interface ScenarioControls {
  /** Every level of every attribute, from the Study's analytics metadata. */
  levels: Record<string, string[]>;
  /** Run get_market_share for these products and resolve with the new view. */
  request: (products: ScenarioProduct[]) => Promise<unknown>;
  /** Run get_level_curve: one product's share at every level of one attribute. */
  curve: (products: ScenarioProduct[], productIndex: number, attribute: string) => Promise<LevelCurve>;
  /** Maximum products in one scenario. Defaults to 5. */
  maxProducts?: number;
}

/** A product's share at each level of one attribute, with Rehoboam's decision statement. */
export interface LevelCurve {
  points: Array<{ level: string; share: number }>;
  statement: string;
}

export interface RehoboamMarketShareViewProps {
  view: unknown;
  scenario?: ScenarioControls;
  className?: string;
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
// Mid-tones are skipped: no text colour passes AA on them in both themes.
const SHADES = [100, 72, 34, 22, 14];
const shade = (index: number) =>
  `color-mix(in srgb, var(--color) ${SHADES[index % SHADES.length]}%, var(--backgroundColor))`;
const onShade = (index: number) => (index < 2 ? 'var(--backgroundColor)' : 'var(--color)');

const STYLES = `
.sce-ms__strip { position: relative; display: flex; height: 56px; border-radius: 8px; overflow: hidden; margin-block: var(--sp-3) var(--sp-5); transition: opacity 200ms ease; }
.sce-ms__strip[data-pending="true"] { opacity: 0.45; }
.sce-ms__seg { display: flex; align-items: center; gap: 8px; padding-inline: 12px; min-width: 0; overflow: hidden; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; transition: flex-basis 520ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 160ms ease; border-right: 1px solid var(--backgroundColor); }
.sce-ms__seg:last-child { border-right: 0; }
.sce-ms__seg[data-dim="true"], .sce-ms__card[data-dim="true"] { opacity: 0.4; }
.sce-ms__none { background: repeating-linear-gradient(135deg, var(--hairline) 0 6px, transparent 6px 12px); color: var(--color); }
.sce-ms__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: var(--sp-3); }
.sce-ms__card { border: 1px solid var(--hairline); border-radius: 8px; padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); transition: opacity 160ms ease, border-color 160ms ease; background: var(--backgroundColor); }
.sce-ms__card:hover, .sce-ms__card:focus-within { border-color: var(--color); }
.sce-ms__head { display: flex; align-items: center; gap: var(--sp-2); }
.sce-ms__badge { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; font-family: var(--font-mono); font-size: 11px; flex: none; }
.sce-ms__share { font-family: var(--font-display); font-size: 34px; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.sce-ms__delta { font-family: var(--font-mono); font-size: 11px; }
.sce-ms__delta[data-sign="down"] { color: var(--red); }
.sce-ms__field { display: flex; flex-direction: column; gap: 2px; }
.sce-ms__field span { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; }
.sce-ms__field select, .sce-ms__field output { font: inherit; font-size: 13px; color: var(--color); background: transparent; border: 1px solid var(--hairline); border-radius: 6px; padding: 6px 8px; min-width: 0; }
.sce-ms__field select:focus-visible { outline: var(--focus-ring); outline-offset: 1px; }
.sce-ms__ghost { font: inherit; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em; background: transparent; color: var(--color); border: 1px dashed var(--hairline); border-radius: 8px; padding: var(--sp-3); cursor: pointer; min-height: 120px; }
.sce-ms__ghost:hover, .sce-ms__ghost:focus-visible { border-color: var(--color); outline: none; }
.sce-ms__remove { margin-left: auto; font: inherit; font-family: var(--font-mono); font-size: 11px; background: none; border: 0; color: var(--color); opacity: 0.6; cursor: pointer; }
.sce-ms__remove:hover, .sce-ms__remove:focus-visible { opacity: 1; }
.sce-ms__status { font-family: var(--font-mono); font-size: 11px; min-height: 16px; }
.sce-ms__status[data-tone="error"] { color: var(--red); }
.sce-ms__sweep { margin-top: var(--sp-4); border: 1px solid var(--hairline); border-radius: 8px; padding: var(--sp-3) var(--sp-4); }
.sce-ms__sweep-head { display: flex; align-items: baseline; gap: var(--sp-3); }
.sce-ms__sweep-statement { font-size: 15px; line-height: 1.45; margin: var(--sp-2) 0 var(--sp-3); max-width: 70ch; }
.sce-ms__sweep-head strong { font-family: var(--font-display); font-weight: 400; font-size: 18px; }
.sce-ms__sweep-row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 200px) 1fr 64px; align-items: center; gap: var(--sp-3); width: 100%; padding: 6px 4px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.sce-ms__sweep-row:hover, .sce-ms__sweep-row:focus-visible { background: color-mix(in srgb, var(--color) 6%, transparent); }
.sce-ms__sweep-row[aria-current="true"] { cursor: default; font-weight: 600; }
.sce-ms__sweep-track { height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--color) 8%, transparent); overflow: hidden; }
.sce-ms__sweep-bar { height: 100%; border-radius: 5px; background: color-mix(in srgb, var(--color) 45%, var(--backgroundColor)); transition: width 520ms cubic-bezier(0.2, 0.7, 0.2, 1); }
.sce-ms__sweep-row[aria-current="true"] .sce-ms__sweep-bar { background: var(--color); }
.sce-ms__sweep-value { font-family: var(--font-mono); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .sce-ms__seg, .sce-ms__sweep-bar { transition: none; } }
`;

function Share({ share }: { share: number }) {
  return <span className="sce-ms__share">{pct(useTweened(share))}</span>;
}

function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined || Number.isNaN(before)) return <span className="sce-ms__delta">&nbsp;</span>;
  const points = (now - before) * 100;
  if (Math.abs(points) < 0.05) return <span className="sce-ms__delta">no change</span>;
  return (
    <span className="sce-ms__delta" data-sign={points > 0 ? 'up' : 'down'}>
      {points > 0 ? '+' : '−'}{Math.abs(points).toFixed(1)} pts vs last scenario
    </span>
  );
}

function adapt(view: unknown) {
  try {
    return { ok: true as const, value: rehoboamMarketShareView(view) };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
  }
}

type Adapted = ReturnType<typeof adapt>;
type Hover = (key: string | null) => void;
type Dim = (key: string) => 'true' | undefined;

interface SweepState {
  index: number;
  letter: string;
  attribute: string;
  current: string;
  rows: Array<{ level: string; share: number | null; failed: boolean }>;
  statement: string | null;
  error: string | null;
}

/** Every level a product may take for an attribute: the host's list, or the levels on show. */
function levelOptions(scenario: ScenarioControls | undefined, current: RehoboamMarketShareView, attribute: string) {
  return scenario?.levels[attribute] ?? [...new Set(current.products.map((product) => product.levels[attribute]))];
}

/** A new product that differs from the last one: the next level of every attribute. */
function nextProduct(products: ScenarioProduct[], attributes: string[], levelsFor: (attribute: string) => string[]) {
  const seed = products[products.length - 1] ?? {};
  const next: ScenarioProduct = {};
  for (const attribute of attributes) {
    const options = levelsFor(attribute);
    const index = options.indexOf(seed[attribute]);
    next[attribute] = options[(index + 1) % options.length] ?? options[0];
  }
  return next;
}

// One get_level_curve analysis: every level of one attribute for one
// product, every other product unchanged; nothing is interpolated.
function useSweep(scenario: ScenarioControls | undefined) {
  const ticket = useRef(0);
  const [sweep, setSweep] = useState<SweepState | null>(null);
  const start = (current: RehoboamMarketShareView, index: number, attribute: string) => {
    if (!scenario || !attribute) return;
    const products = current.products.map((product) => product.levels);
    const mine = ++ticket.current;
    setSweep({
      index,
      letter: current.products[index]?.letter ?? '',
      attribute,
      current: products[index][attribute],
      rows: levelOptions(scenario, current, attribute).map((level) => ({ level, share: null, failed: false })),
      statement: null,
      error: null,
    });
    scenario.curve(products, index, attribute).then(
      (curve) => {
        if (mine !== ticket.current) return;
        const rows = curve.points.map((point) => ({ ...point, failed: false }));
        setSweep((state) => (state ? { ...state, rows, statement: curve.statement } : state));
      },
      (reason) => {
        if (mine !== ticket.current) return;
        const error = reason instanceof Error ? reason.message : 'This curve is unavailable.';
        setSweep((state) =>
          state ? { ...state, error, rows: state.rows.map((row) => ({ ...row, failed: true })) } : state,
        );
      },
    );
  };
  /** Drops the panel and ignores a curve still in flight. */
  const cancel = () => {
    ticket.current++;
    setSweep(null);
  };
  return { sweep, start, cancel, close: () => setSweep(null) };
}

/** The scenario on show, the one being requested, and each slot's previous share. */
function useScenarioRun(initial: Adapted, scenario: ScenarioControls | undefined, dropSweep: () => void) {
  const [current, setCurrent] = useState<RehoboamMarketShareView | null>(initial.ok ? initial.value : null);
  // Each product card is a slot: editing keeps it, removing drops it, adding
  // creates one. Change markers compare a slot with its previous share.
  const [slots, setSlots] = useState<number[]>(() => (initial.ok ? initial.value.products.map((_, i) => i) : []));
  const [previousBySlot, setPreviousBySlot] = useState<Map<number, number>>(new Map());
  const nextSlot = useRef(initial.ok ? initial.value.products.length : 0);
  const [draftSlots, setDraftSlots] = useState<number[] | null>(null);
  const [previousOptOut, setPreviousOptOut] = useState<number | null>(null);
  const [draft, setDraft] = useState<ScenarioProduct[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    // A new Study voids every request and curve still in flight for the previous one.
    request.current++;
    dropSweep();
    setPending(false);
    setError(null);
    setPreviousOptOut(null);
    setPreviousBySlot(new Map());
    setDraft(null);
    setDraftSlots(null);
    setCurrent(initial.ok ? initial.value : null);
    setSlots(initial.ok ? initial.value.products.map((_, i) => i) : []);
    nextSlot.current = initial.ok ? initial.value.products.length : 0;
  }, [initial]);

  const run = (next: ScenarioProduct[], nextSlots: number[]) => {
    if (!scenario || !current) return;
    dropSweep();
    setDraft(next);
    setDraftSlots(nextSlots);
    setPending(true);
    setError(null);
    const ticket = ++request.current;
    scenario
      .request(next)
      .then((result) => {
        if (ticket !== request.current) return;
        const adapted = adapt(result);
        if (!adapted.ok) throw new Error(adapted.message);
        setPreviousBySlot(new Map(slots.map((slot, index) => [slot, current.products[index]?.share ?? NaN])));
        setPreviousOptOut(current.optOut);
        setCurrent(adapted.value);
        setSlots(nextSlots);
        setDraft(null);
        setDraftSlots(null);
      })
      .catch((reason: unknown) => {
        if (ticket !== request.current) return;
        setError(
          `Could not recalculate this scenario. The shares shown are for the previous scenario. ${
            reason instanceof Error ? reason.message : ''
          }`.trim(),
        );
      })
      .finally(() => {
        if (ticket === request.current) setPending(false);
      });
  };
  return { current, slots, previousBySlot, previousOptOut, draft, draftSlots, pending, error, run, nextSlot };
}

interface StripProps {
  current: RehoboamMarketShareView;
  pending: boolean;
  stale: boolean;
  dim: Dim;
  onHover: Hover;
}

function ShareStrip({ current, pending, stale, dim, onHover }: StripProps) {
  return (
    <div
      aria-label={`Share of choice: ${current.products
        .map((product) => `product ${product.letter} ${pct(product.share)}`)
        .join(',')}${current.optOut === null ? '' : `, none of these ${pct(current.optOut)}`}`}
      aria-busy={pending}
      className="sce-ms__strip"
      data-pending={stale}
      role="img"
    >
      {current.products.map((product, index) => (
        <div
          className="sce-ms__seg"
          data-dim={dim(product.letter)}
          data-share-segment={product.letter}
          key={product.letter}
          onMouseEnter={() => onHover(product.letter)}
          onMouseLeave={() => onHover(null)}
          style={{ flex: `0 0 ${product.share * 100}%`, background: shade(index), color: onShade(index) }}
        >
          {product.share >= 0.08 ? `${product.letter} ${pct(product.share)}` : ''}
        </div>
      ))}
      {current.optOut !== null ? (
        <div
          className="sce-ms__seg sce-ms__none"
          data-dim={dim('none')}
          onMouseEnter={() => onHover('none')}
          onMouseLeave={() => onHover(null)}
          style={{ flex: `0 0 ${current.optOut * 100}%` }}
        >
          {current.optOut >= 0.08 ? `None ${pct(current.optOut)}` : ''}
        </div>
      ) : null}
    </div>
  );
}

/** What every product card shares: the scenario's attributes and the host's edit hooks. */
interface CardControls {
  attributes: string[];
  editable: boolean;
  removable: boolean;
  /** A what-if sweep needs a calculated scenario, not a draft. */
  sweepable: boolean;
  pending: boolean;
  stale: boolean;
  levelsFor: (attribute: string) => string[];
  change: (index: number, attribute: string, level: string) => void;
  remove: (index: number) => void;
  startSweep: (index: number, attribute: string) => void;
  sweepAttribute: (index: number) => string;
}

interface ProductCardProps {
  controls: CardControls;
  index: number;
  letter: string;
  levels: ScenarioProduct;
  /** Missing while the scenario is a draft that Rehoboam has not calculated. */
  result: ScenarioShare | undefined;
  before: number | undefined;
  dim: Dim;
  onHover: Hover;
}

function CardShare({ result, before, pending, stale }: Pick<ProductCardProps, 'result' | 'before'> & { pending: boolean; stale: boolean }) {
  if (result && !stale) {
    return (
      <>
        <Share share={result.share} />
        <Delta before={before} now={result.share} />
      </>
    );
  }
  return (
    <>
      <span className="sce-ms__share" style={{ opacity: 0.35 }}>
        {result ? pct(result.share) : '—'}
      </span>
      <span className="sce-ms__delta">{pending ? 'recalculating' : 'not calculated'}</span>
    </>
  );
}

function ProductCard({ controls, index, letter, levels, result, before, dim, onHover }: ProductCardProps) {
  const { attributes, editable, pending } = controls;
  return (
    <div
      className="sce-ms__card"
      data-dim={dim(letter)}
      data-scenario-product={letter}
      onMouseEnter={() => onHover(letter)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="sce-ms__head">
        <span className="sce-ms__badge" style={{ background: shade(index), color: onShade(index) }}>
          {letter}
        </span>
        <span className="sce-audit__label">Product {letter}</span>
        {controls.removable ? (
          <button
            aria-label={`Remove product ${letter}`}
            className="sce-ms__remove"
            disabled={pending}
            onClick={() => controls.remove(index)}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </div>
      <CardShare before={before} pending={pending} result={result} stale={controls.stale} />
      {attributes.map((attribute) => (
        <label className="sce-ms__field" key={attribute}>
          <span>{attribute}</span>
          {editable ? (
            <select
              disabled={pending}
              onChange={(event) => controls.change(index, attribute, event.target.value)}
              value={levels[attribute]}
            >
              {controls.levelsFor(attribute).map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          ) : (
            <output>{levels[attribute]}</output>
          )}
        </label>
      ))}
      {controls.sweepable ? (
        <label className="sce-ms__field">
          <span>What if</span>
          <select
            aria-label={`What if product ${letter} changes one attribute`}
            disabled={pending}
            onChange={(event) => controls.startSweep(index, event.target.value)}
            value={controls.sweepAttribute(index)}
          >
            <option value="">Sweep one attribute…</option>
            {attributes.map((attribute) => (
              <option key={attribute} value={attribute}>{attribute}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function OptOutCard({ optOut, before, stale, dim, onHover }: { optOut: number; before: number | null; stale: boolean; dim: Dim; onHover: Hover }) {
  return (
    <div className="sce-ms__card" data-dim={dim('none')} onMouseEnter={() => onHover('none')} onMouseLeave={() => onHover(null)}>
      <div className="sce-ms__head">
        <span className="sce-ms__badge sce-ms__none">–</span>
        <span className="sce-audit__label">None of these</span>
      </div>
      {stale ? (
        <span className="sce-ms__share" style={{ opacity: 0.35 }}>{pct(optOut)}</span>
      ) : (
        <Share share={optOut} />
      )}
      {!stale && before !== null ? (
        <Delta before={before} now={optOut} />
      ) : null}
      <span className="sce-ms__delta">Respondents who would choose none of the products.</span>
    </div>
  );
}

function sweepValue(row: SweepState['rows'][number]) {
  if (row.failed) return 'failed';
  return row.share === null ? '…' : pct(row.share);
}

function SweepPanel({ sweep, pending, onClose, onPick }: { sweep: SweepState; pending: boolean; onClose: () => void; onPick: (level: string) => void }) {
  const top = Math.max(0.0001, ...sweep.rows.map((row) => row.share ?? 0));
  return (
    <div className="sce-ms__sweep" data-scenario-sweep={`${sweep.letter}:${sweep.attribute}`}>
      <div className="sce-ms__sweep-head">
        <strong>What if product {sweep.letter} changes {sweep.attribute}?</strong>
        <button className="sce-ms__remove" onClick={onClose} type="button">Close</button>
      </div>
      {sweep.statement ? <p className="sce-ms__sweep-statement">{sweep.statement}</p> : null}
      {sweep.error ? <p className="sce-ms__status" data-tone="error" role="alert">{sweep.error}</p> : null}
      {sweep.rows.map((row) => {
        const isCurrent = row.level === sweep.current;
        return (
          <button
            aria-current={isCurrent ? 'true' : undefined}
            className="sce-ms__sweep-row"
            data-sweep-level={row.level}
            disabled={row.share === null || pending}
            key={row.level}
            onClick={() => (isCurrent ? undefined : onPick(row.level))}
            type="button"
          >
            <span>{row.level}{isCurrent ? '· current' : ''}</span>
            <span className="sce-ms__sweep-track">
              <span className="sce-ms__sweep-bar" style={{ display: 'block', width: `${((row.share ?? 0) / top) * 100}%` }} />
            </span>
            <span className="sce-ms__sweep-value">{sweepValue(row)}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ScenarioGridProps {
  current: RehoboamMarketShareView;
  /** The products on the cards: the draft being requested, or the calculated scenario. */
  products: ScenarioProduct[];
  activeSlots: number[];
  state: Pick<ReturnType<typeof useScenarioRun>, 'slots' | 'previousBySlot' | 'previousOptOut' | 'draft'>;
  controls: CardControls;
  /** Maximum products in one scenario. Defaults to 5. */
  maxProducts: number | undefined;
  dim: Dim;
  onHover: Hover;
  onAdd: () => void;
}

function ScenarioGrid({ current, products, activeSlots, state, controls, maxProducts, dim, onHover, onAdd }: ScenarioGridProps) {
  return (
    <div className="sce-ms__grid">
      {products.map((levels, index) => {
        const letter = current.products[index]?.letter ?? String.fromCharCode(65 + index);
        return (
          <ProductCard
            before={state.previousBySlot.get(state.slots[index])}
            controls={controls}
            dim={dim}
            index={index}
            key={activeSlots[index] ?? `${letter}-${index}`}
            letter={letter}
            levels={levels}
            onHover={onHover}
            result={state.draft ? undefined : current.products[index]}
          />
        );
      })}
      {current.optOut !== null ? (
        <OptOutCard before={state.previousOptOut} dim={dim} onHover={onHover} optOut={current.optOut} stale={controls.stale} />
      ) : null}
      {controls.editable && products.length < (maxProducts ?? 5) ? (
        <button className="sce-ms__ghost" disabled={controls.pending} onClick={onAdd} type="button">
          + Add product
        </button>
      ) : null}
    </div>
  );
}

function statusText(pending: boolean, error: string | null, editable: boolean) {
  if (pending) return 'Recalculating with Rehoboam…';
  return error ?? (editable ? 'Change any level to run a new scenario.' : '');
}

/**
 * Executive scenario view for a Rehoboam `get_market_share` result. With
 * scenario controls, viewers change any product's levels, add or remove
 * products, and see the recalculated share of choice with the change from
 * the previous scenario. Every recalculation is a new Rehoboam analysis.
 */
export function RehoboamMarketShareView({ view, scenario, className }: RehoboamMarketShareViewProps) {
  const initial = useMemo(() => adapt(view), [view]);
  const headingId = useId();
  const sweeps = useSweep(scenario);
  const state = useScenarioRun(initial, scenario, sweeps.cancel);
  const [hovered, setHovered] = useState<string | null>(null);
  const { current, slots, draft, pending, error, run } = state;

  if (!initial.ok || !current) {
    return (
      <>
        <EvidenceCoreStyles />
        <ViewError className={className} message={initial.ok ? 'No scenario.' : initial.message} />
      </>
    );
  }

  const products = draft ?? current.products.map((product) => product.levels);
  const editable = Boolean(scenario);
  const levelsFor = (attribute: string) => levelOptions(scenario, current, attribute);
  const activeSlots = state.draftSlots ?? slots;
  const change = (index: number, attribute: string, level: string) =>
    run(products.map((product, at) => (at === index ? { ...product, [attribute]: level } : product)), activeSlots);
  const remove = (index: number) =>
    run(products.filter((_, at) => at !== index), activeSlots.filter((_, at) => at !== index));
  const add = () =>
    run([...products, nextProduct(products, current.attributes, levelsFor)], [...activeSlots, state.nextSlot.current++]);

  const stale = pending || error !== null;
  const dim: Dim = (key) => (hovered !== null && hovered !== key ? 'true' : undefined);
  const { sweep } = sweeps;
  const controls: CardControls = {
    attributes: current.attributes,
    editable,
    removable: editable && products.length > 1,
    sweepable: editable && !draft,
    pending,
    stale,
    levelsFor,
    change,
    remove,
    startSweep: (index, attribute) => sweeps.start(current, index, attribute),
    sweepAttribute: (index) => (sweep?.index === index ? sweep.attribute : ''),
  };

  return (
    <section className={className} data-evidence-view="market-share" data-run-id={current.runId}>
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <style>{STYLES}</style>
      <figure className="sce-figure" aria-labelledby={headingId}>
        <figcaption className="sce-figure__header">
          <h3 className="sce-figure__title" id={headingId}>{current.title}</h3>
          <span className="sce-figure__eyebrow">
            {current.respondents === null ? '' : `${current.respondents} respondents`}
          </span>
        </figcaption>

        <ShareStrip current={current} dim={dim} onHover={setHovered} pending={pending} stale={stale} />

        <p aria-live="polite" className="sce-ms__status" data-tone={error ? 'error' : undefined} role="status">
          {statusText(pending, error, editable)}
        </p>

        <ScenarioGrid
          activeSlots={activeSlots}
          controls={controls}
          current={current}
          dim={dim}
          maxProducts={scenario?.maxProducts}
          onAdd={add}
          onHover={setHovered}
          products={products}
          state={state}
        />

        {sweep ? (
          <SweepPanel
            onClose={sweeps.close}
            onPick={(level) => change(sweep.index, sweep.attribute, level)}
            pending={pending}
            sweep={sweep}
          />
        ) : null}

        <p className="sce-view__note">
          Share of choice is each respondent&apos;s predicted probability of choosing each option,
          averaged across {current.respondents ?? 'all'} respondents. These are preference shares for a
          hypothetical line-up, not observed market shares, and no uncertainty interval is computed.
        </p>
      </figure>
      <RehoboamAudit provenance={current.provenance} />
    </section>
  );
}
