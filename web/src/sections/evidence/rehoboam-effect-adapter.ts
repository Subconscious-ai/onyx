import {
  envelope,
  fail as failView,
  finiteOrNull,
  provenanceOf,
  text as textOf,
  warningsOf,
  type RehoboamProvenanceEntry,
} from './rehoboam-shared';
import type { EffectIntervalDatum, IntervalKind } from './types';

const VIEW = 'effect';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const bound = (value: unknown, field: string) => finiteOrNull(VIEW, value, field);

/**
 * Rehoboam attaches this view to the `amce_lollipop` chart of the `get_amce`
 * analytics operation. The Vega-Lite spec beside it remains the analyst view
 * and the PNG fallback; this adapter is the executive presentation.
 */
export const REHOBOAM_EFFECT_VIEW_ID = 'effect-interval/v1';

export interface RehoboamAmceRow {
  attribute: string;
  level: string;
  estimate: number | null;
  lower: number | null;
  upper: number | null;
  base_level: boolean;
  units: string;
}

export interface RehoboamAmceResult {
  run_id: string;
  operation: 'get_amce';
  data: {
    status: 'ok' | 'unavailable';
    units: string;
    interval_method: string;
    rows: RehoboamAmceRow[];
    warnings: string[];
  };
  provenance: Record<string, unknown>;
}

export interface RehoboamEvidenceView {
  id: string;
  result: unknown;
}

export interface RehoboamEffectView {
  runId: string;
  title: string;
  axisLabel: string;
  description: string;
  data: EffectIntervalDatum[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

/** Each producer interval method maps to exactly one displayed kind. */
const INTERVAL_KINDS: Record<string, IntervalKind> = {
  'producer-summary': 'producer-summary',
};

/** Each producer unit maps to exactly one axis label. */
const UNIT_LABELS: Record<string, string> = {
  utility: 'Standardized utility (not probability)',
};

/**
 * Validate a Rehoboam evidence view and map it to `EffectIntervalPlot` props.
 * Throws instead of guessing: unknown view IDs, units or interval methods,
 * reversed bounds, non-finite numbers and missing warnings never render.
 * A null estimate stays null so the plot reports it as unavailable.
 */
export function rehoboamEffectView(view: unknown): RehoboamEffectView {
  const { result, data, runId } = envelope(VIEW, view, REHOBOAM_EFFECT_VIEW_ID, 'get_amce');

  const units = text(data.units, 'units');
  const axisLabel = UNIT_LABELS[units] ?? fail(`unknown units ${units}`);
  const method = text(data.interval_method, 'interval_method');
  const kind = INTERVAL_KINDS[method] ?? fail(`unknown interval method ${method}`);

  const warnings = warningsOf(VIEW, data);

  if (!Array.isArray(data.rows) || data.rows.length === 0) fail('rows are missing');
  const seen = new Set<string>();
  const rows: EffectIntervalDatum[] = data.rows.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) fail(`row ${index} is not an object`);
    const attribute = text(row.attribute, `rows[${index}].attribute`);
    const level = text(row.level, `rows[${index}].level`);
    if (row.units !== units) fail(`rows[${index}] units differ from the result units`);
    const estimate = bound(row.estimate, `rows[${index}].estimate`);
    const lower = bound(row.lower, `rows[${index}].lower`);
    const upper = bound(row.upper, `rows[${index}].upper`);
    if (lower !== null && upper !== null && lower > upper) {
      fail(`rows[${index}] bounds are reversed`);
    }
    const id = `${attribute}::${level}`;
    if (seen.has(id)) fail(`duplicate row ${id}`);
    seen.add(id);
    return {
      id,
      label: level,
      group: attribute,
      estimate,
      interval: lower === null && upper === null ? undefined : { lower, upper, kind },
      detail: row.base_level === true ? 'Reference level' : undefined,
    };
  });

  const provenance = provenanceOf(result);

  return {
    runId,
    title: 'Effect of each level',
    axisLabel,
    description: `${axisLabel} of each attribute level.`,
    data: rows,
    warnings,
    provenance,
  };
}
