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

/**
 * Rehoboam attaches this view to the `posterior_kde` chart of
 * `get_posterior_distribution`. Its summaries are over respondent-level
 * estimates, so the view speaks about respondents, not posterior draws.
 */
export const REHOBOAM_RESPONDENT_DISTRIBUTION_VIEW_ID = 'respondent-distribution/v1';

const VIEW = 'respondent distribution';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const finite = (value: unknown, field: string) => finiteOf(VIEW, value, field);

/** The only interval method this view knows how to describe. */
const INTERVAL_METHOD = '95% shortest empirical interval';

export interface DensityPoint {
  value: number;
  density: number;
}

export interface RespondentLevel {
  id: string;
  attribute: string;
  level: string;
  median: number;
  /** Shortest range holding 95% of respondents' estimates. */
  lower: number;
  upper: number;
  /** Share of respondents whose utility for this level is above zero. */
  favouring: number;
  respondents: number;
  density: DensityPoint[];
}

export interface RehoboamRespondentDistributionView {
  runId: string;
  title: string;
  encoding: string | null;
  respondents: number | null;
  levels: RespondentLevel[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

/**
 * Validate a Rehoboam respondent-distribution view. Throws on unknown units
 * or interval method, a median outside its range, shares outside 0 to 1,
 * duplicate levels and missing warnings.
 */
export function rehoboamRespondentDistributionView(view: unknown): RehoboamRespondentDistributionView {
  const { result, data, runId } = envelope(
    VIEW,
    view,
    REHOBOAM_RESPONDENT_DISTRIBUTION_VIEW_ID,
    'get_posterior_distribution',
  );
  if (data.units !== 'utility') fail(`unknown units ${String(data.units)}`);
  if (data.interval_method !== INTERVAL_METHOD) fail(`unknown interval method ${String(data.interval_method)}`);
  const warnings = warningsOf(VIEW, data);
  const summary = data.posterior_distribution_summary;
  if (!Array.isArray(summary) || summary.length === 0) fail('posterior_distribution_summary is missing');

  const densities = new Map<string, DensityPoint[]>();
  if (Array.isArray(data.distributions)) {
    data.distributions.forEach((entry: unknown, index: number) => {
      if (!isRecord(entry) || !Array.isArray(entry.grid)) fail(`distributions[${index}] is malformed`);
      const key = `${text(entry.attribute, 'attribute')}::${text(entry.level, 'level')}`;
      densities.set(
        key,
        entry.grid.flatMap((point: unknown, at: number) => {
          if (!isRecord(point)) fail(`distributions[${index}].grid[${at}] is malformed`);
          // A point mass (every respondent equal) has no density to draw.
          if (point.density === null) return [];
          return [{ value: finite(point.value, 'grid value'), density: finite(point.density, 'grid density') }];
        }),
      );
    });
  }

  const seen = new Set<string>();
  const levels = summary.map((entry: unknown, index: number) => {
    if (!isRecord(entry)) fail(`summary[${index}] is not an object`);
    const attribute = text(entry.feature_name, `summary[${index}].feature_name`);
    const level = text(entry.level_name, `summary[${index}].level_name`);
    const id = `${attribute}::${level}`;
    if (seen.has(id)) fail(`duplicate level ${id}`);
    seen.add(id);
    const median = finite(entry.median, `${id} median`);
    const lower = finite(entry.lower_bound, `${id} lower_bound`);
    const upper = finite(entry.upper_bound, `${id} upper_bound`);
    if (lower > median || median > upper) fail(`${id} median lies outside its range`);
    const favouring = finite(entry.positive_fraction, `${id} positive_fraction`);
    if (favouring < 0 || favouring > 1) fail(`${id} positive_fraction lies outside 0 to 1`);
    return {
      id,
      attribute,
      level,
      median,
      lower,
      upper,
      favouring,
      respondents: finite(entry.valid_count, `${id} valid_count`),
      density: densities.get(id) ?? [],
    };
  });

  const size = data['Segment Size'];
  return {
    runId,
    title: 'How respondents divide',
    encoding: typeof data['Feature encoding'] === 'string' ? data['Feature encoding'] : null,
    respondents: typeof size === 'number' && Number.isFinite(size) ? size : null,
    levels,
    warnings,
    provenance: provenanceOf(result),
  };
}
