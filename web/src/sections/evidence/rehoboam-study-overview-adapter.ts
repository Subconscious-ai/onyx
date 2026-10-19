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

/** Rehoboam attaches this view to the `demographics_stacked` chart of `get_study_overview`. */
export const REHOBOAM_STUDY_OVERVIEW_VIEW_ID = 'study-overview/v1';

const VIEW = 'study overview';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const finite = (value: unknown, field: string) => finiteOf(VIEW, value, field);
// toFixed throws outside 0-100; a stat never needs more than 20 places.
const precision = (value: unknown, field: string) => {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 20) fail(`${field} must be a whole number from 0 to 20`);
  return value as number;
};

export interface OverviewStat {
  label: string;
  value: number | string;
  decimals: number;
}

export interface CompositionLevel {
  level: string;
  count: number;
  share: number;
}

export interface CompositionDimension {
  family: string;
  dimension: string;
  denominator: number;
  missing: number;
  levels: CompositionLevel[];
}

export interface RehoboamStudyOverviewView {
  runId: string;
  title: string;
  stats: OverviewStat[];
  dimensions: CompositionDimension[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

/**
 * Validate a Rehoboam study overview. Throws on unknown units, a share that
 * does not equal count / denominator, counts that exceed the denominator and
 * missing warnings.
 */
export function rehoboamStudyOverviewView(view: unknown): RehoboamStudyOverviewView {
  const { result, data, runId } = envelope(VIEW, view, REHOBOAM_STUDY_OVERVIEW_VIEW_ID, 'get_study_overview');
  if (data.units !== 'respondent_composition') fail(`unknown units ${String(data.units)}`);
  const warnings = warningsOf(VIEW, data);

  const stats = (Array.isArray(data.statcards) ? data.statcards : []).map((card: unknown, index: number) => {
    if (!isRecord(card)) fail(`statcards[${index}] is not an object`);
    // Rehoboam sends null for a stat the Study did not record (e.g. no opt-out).
    const value =
      card.value === null
        ? '—'
        : typeof card.value === 'string'
          ? card.value
          : finite(card.value, `statcards[${index}].value`);
    return {
      label: text(card.label, `statcards[${index}].label`),
      value,
      decimals: card.decimals === undefined ? 0 : precision(card.decimals, `statcards[${index}].decimals`),
    };
  });

  if (!Array.isArray(data.rows)) fail('rows are missing');
  const dimensions = new Map<string, CompositionDimension>();
  data.rows.forEach((row: unknown, index: number) => {
    if (!isRecord(row)) fail(`rows[${index}] is not an object`);
    const family = text(row.family, `rows[${index}].family`);
    const dimension = text(row.attribute, `rows[${index}].attribute`);
    const count = finite(row.count, `rows[${index}].count`);
    const share = finite(row.share, `rows[${index}].share`);
    const denominator = finite(row.denominator, `rows[${index}].denominator`);
    if (denominator <= 0) fail(`rows[${index}] has no denominator`);
    // Rehoboam segments.get_experiment_metadata rounds shares to four decimals.
    // Preserve those reported values; allow only its half-unit rounding error.
    if (Math.abs(share - count / denominator) > 0.00005 + 1e-12) fail(`rows[${index}] share is not count / denominator`);
    const key = `${family}::${dimension}`;
    const entry = dimensions.get(key) ?? {
      family,
      dimension,
      denominator,
      missing: finite(row.missing_count ?? 0, `rows[${index}].missing_count`),
      levels: [],
    };
    if (entry.denominator !== denominator) fail(`${dimension} mixes denominators`);
    entry.levels.push({ level: text(row.level, `rows[${index}].level`), count, share });
    dimensions.set(key, entry);
  });
  for (const entry of dimensions.values()) {
    const counted = entry.levels.reduce((sum, level) => sum + level.count, 0) + entry.missing;
    if (counted > entry.denominator) fail(`${entry.dimension} counts exceed its respondents`);
    entry.levels.sort((a, b) => b.count - a.count);
  }

  return {
    runId,
    title: 'Who answered',
    stats,
    dimensions: [...dimensions.values()],
    warnings,
    provenance: provenanceOf(result),
  };
}
