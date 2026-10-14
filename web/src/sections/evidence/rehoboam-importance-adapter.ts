import {
  envelope,
  fail as failView,
  finite as finiteOf,
  isRecord,
  provenanceOf,
  text as textOf,
  warningsOf,
  type RehoboamProvenanceEntry,
} from './rehoboam-shared';

/** Rehoboam attaches this view to the `importance_ranking` chart of `get_feature_importance`. */
export const REHOBOAM_IMPORTANCE_VIEW_ID = 'importance-ranking/v1';

const VIEW = 'importance';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const finite = (value: unknown, field: string) => finiteOf(VIEW, value, field);

export interface ImportancePoint {
  value: number;
  density: number;
}

export interface ImportanceRow {
  attribute: string;
  /** Mean share of each respondent's decision, in percent. */
  mean: number;
  standardDeviation: number;
  minimum: number;
  maximum: number;
  respondents: number;
  /** 1 is the largest mean importance. */
  rank: number;
  /** Respondent density, clipped to the observed minimum and maximum. */
  spread: ImportancePoint[];
}

export interface RehoboamImportanceView {
  runId: string;
  title: string;
  respondents: number;
  rows: ImportanceRow[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

/** Rows are respondent shares that sum to 100%; allow rounding only. */
const SUM_TOLERANCE = 0.5;

/**
 * Validate a Rehoboam importance view and shape it for the ranking view.
 * Throws on unknown units, non-finite numbers, inconsistent ranges, shares
 * that do not sum to 100%, duplicate attributes and missing warnings.
 */
export function rehoboamImportanceView(view: unknown): RehoboamImportanceView {
  const { result, data, runId } = envelope(VIEW, view, REHOBOAM_IMPORTANCE_VIEW_ID, 'get_feature_importance');
  if (data.units !== 'percent') fail(`unknown units ${String(data.units)}`);
  const warnings = warningsOf(VIEW, data);
  if (!Array.isArray(data.feature_importance) || data.feature_importance.length === 0) {
    fail('feature_importance is missing');
  }

  const distributions = new Map<string, ImportancePoint[]>();
  if (Array.isArray(data.distributions)) {
    data.distributions.forEach((entry, index) => {
      if (!isRecord(entry) || !Array.isArray(entry.grid)) fail(`distributions[${index}] is malformed`);
      const attribute = text(entry.attribute, `distributions[${index}].attribute`);
      distributions.set(
        attribute,
        entry.grid.flatMap((point, at) => {
          if (!isRecord(point)) fail(`distributions[${index}].grid[${at}] is malformed`);
          // A point mass (every respondent equal) has no density to draw.
          if (point.density === null) return [];
          return [{
            value: finite(point.value, `distributions[${index}].grid[${at}].value`),
            density: finite(point.density, `distributions[${index}].grid[${at}].density`),
          }];
        }),
      );
    });
  }

  const seen = new Set<string>();
  const rows = data.feature_importance.map((entry, index) => {
    if (!isRecord(entry)) fail(`feature_importance[${index}] is not an object`);
    const attribute = text(entry.feature_name, `feature_importance[${index}].feature_name`);
    if (seen.has(attribute)) fail(`duplicate attribute ${attribute}`);
    seen.add(attribute);
    const mean = finite(entry.average_importance, `${attribute} average_importance`);
    const minimum = finite(entry.minimum, `${attribute} minimum`);
    const maximum = finite(entry.maximum, `${attribute} maximum`);
    const standardDeviation = finite(entry.standard_deviation, `${attribute} standard_deviation`);
    const respondents = finite(entry.respondent_count, `${attribute} respondent_count`);
    // Summation order can put an equal-valued mean one float step outside its range.
    if (minimum - 1e-9 > mean || mean > maximum + 1e-9) fail(`${attribute} mean lies outside its range`);
    if (minimum < 0 || maximum > 100) fail(`${attribute} importance lies outside 0-100%`);
    const spread = (distributions.get(attribute) ?? []).filter(
      (point) => point.value >= minimum && point.value <= maximum,
    );
    return { attribute, mean, standardDeviation, minimum, maximum, respondents, rank: 0, spread };
  });

  const total = rows.reduce((sum, row) => sum + row.mean, 0);
  if (Math.abs(total - 100) > SUM_TOLERANCE) fail(`mean importances sum to ${total.toFixed(2)}%, not 100%`);

  [...rows].sort((a, b) => b.mean - a.mean).forEach((row, index) => { row.rank = index + 1; });
  const respondents = Math.max(...rows.map((row) => row.respondents));

  return {
    runId,
    title: 'What matters most',
    respondents,
    rows,
    warnings,
    provenance: provenanceOf(result),
  };
}
