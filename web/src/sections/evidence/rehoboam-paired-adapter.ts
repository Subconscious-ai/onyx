import type {
  Audience,
  Coverage,
  DistributionPoint,
  PairedFindings,
  SpreadComparison,
  Summary,
  Unavailable,
} from './rehoboam-paired-findings-types';
import type { ObjectiveSummary, ProposedNext } from './rehoboam-shared';
import {
  assertMeaning,
  countOf,
  envelope,
  fail as failView,
  finite,
  findingNotesOf,
  isRecord,
  nextOf,
  objectiveOf,
  pairLabel,
  provenanceOf,
  questionOf,
  recordsOf,
  text as textOf,
  warningsOf,
  type RehoboamProvenanceEntry,
} from './rehoboam-shared';

const VIEW = 'paired findings';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const count = (value: unknown, field: string) => countOf(VIEW, value, field);
const records = (value: unknown, field: string) => recordsOf(VIEW, value, field);

/**
 * Rehoboam attaches these views to the three charts of `get_paired_findings`.
 * Each view carries the shared finding and its own family of comparisons.
 */
export const REHOBOAM_PAIRED_AGREEMENT_VIEW_ID = 'paired-agreement/v1';
export const REHOBOAM_TESTED_LEVEL_DIFFERENCES_VIEW_ID = 'tested-level-differences/v1';
export const REHOBOAM_PAIRED_SPREAD_VIEW_ID = 'paired-spread/v1';

const FAMILIES = {
  [REHOBOAM_PAIRED_AGREEMENT_VIEW_ID]: 'paired_agreement',
  [REHOBOAM_TESTED_LEVEL_DIFFERENCES_VIEW_ID]: 'tested_level_differences',
  [REHOBOAM_PAIRED_SPREAD_VIEW_ID]: 'paired_spread',
} as const;

export type RehoboamPairedViewId = keyof typeof FAMILIES;
type FamilyKey = (typeof FAMILIES)[RehoboamPairedViewId];

/** A view keeps its own family; only the agreement view repeats the distribution. */
export type RehoboamPairedViewData = Omit<PairedFindings, FamilyKey | 'selected_distribution'> &
  Partial<Pick<PairedFindings, FamilyKey | 'selected_distribution'>>;

export interface PairedRow {
  /** The producer's comparison ID: the stable key of this mark. */
  key: string;
  label: string;
  from: string;
  to: string;
  /** True only when the producer verified a numeric level order. */
  ordered: boolean;
  selected: boolean;
  summary: Summary;
  spreadWidth?: number;
}

export interface PairedPresentation {
  id: RehoboamPairedViewId;
  runId: string;
  question: string | null;
  finding: string;
  objective: ObjectiveSummary;
  next: ProposedNext;
  rows: PairedRow[];
  shown: number;
  total: number;
  /** True when the producer shows fewer comparisons than it tested. */
  bounded: boolean;
  selectionRule: string;
  unavailable: Unavailable[];
  distribution: DistributionPoint[];
  audiences: Audience[];
  coverage: Coverage;
  notes: string[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

function summaryOf(value: unknown, field: string): Summary {
  if (!isRecord(value)) fail(`${field} is missing`);
  const n = count(value.n, `${field}.n`);
  const sides = ['positive_count', 'negative_count', 'tie_count'].map((key) => count(value[key], `${field}.${key}`));
  if (n < 1 || sides.reduce((sum, side) => sum + side, 0) !== n) fail(`${field} counts do not add up to n`);
  for (const key of ['mean', 'median', 'p10', 'p90', 'positive_share', 'negative_share', 'tie_share']) {
    finite(VIEW, value[key], `${field}.${key}`);
  }
  if ((value.p10 as number) > (value.median as number) || (value.median as number) > (value.p90 as number)) {
    fail(`${field} quantiles are out of order`);
  }
  const mass = value.point_mass;
  if (mass !== null) {
    if (!isRecord(mass)) fail(`${field}.point_mass is invalid`);
    finite(VIEW, mass.value, `${field}.point_mass.value`);
    if (count(mass.count, `${field}.point_mass.count`) > n) fail(`${field}.point_mass exceeds n`);
  }
  return value as unknown as Summary;
}

function rowOf(item: Record<string, unknown>, index: number, selectedId: string): PairedRow {
  const field = `rows[${index}]`;
  if (item.ordering !== 'numeric_step' && item.ordering !== 'nominal_pair' && item.ordering !== 'offer_replacement') fail(`${field}.ordering is unsupported`);
  const ordered = item.ordering === 'numeric_step';
  const from = text(item.from_level, `${field}.from_level`);
  const to = text(item.to_level, `${field}.to_level`);
  const key = text(item.comparison_id, `${field}.comparison_id`);
  const width = (item as Partial<SpreadComparison>).spread_width;
  return {
    key,
    label: pairLabel(text(item.attribute, `${field}.attribute`), from, to, ordered),
    from,
    to,
    ordered,
    selected: key === selectedId,
    summary: summaryOf(item.summary, `${field}.summary`),
    ...(width === undefined ? {} : { spreadWidth: finite(VIEW, width, `${field}.spread_width`) }),
  };
}

function familyOf(value: unknown, selectedId: string) {
  if (!isRecord(value)) fail('the comparisons for this view are missing');
  const rows = records(value.rows, 'rows').map((row, index) => rowOf(row, index, selectedId));
  const shown = count(value.shown_count, 'shown_count');
  const total = count(value.total_count, 'total_count');
  if (rows.length > 8 || shown !== rows.length || total < shown) fail('row counts are inconsistent');
  if (new Set(rows.map((row) => row.key)).size !== rows.length) fail('comparison IDs repeat');
  const unavailable = records(value.unavailable, 'unavailable') as unknown as Unavailable[];
  if (value.status === 'unavailable' ? rows.length > 0 || unavailable.length === 0 : value.status !== 'ok') {
    fail('family status is inconsistent');
  }
  for (const reason of unavailable) {
    text(reason.code, 'unavailable.code');
    text(reason.prerequisite, 'unavailable.prerequisite');
    text(reason.next_step, 'unavailable.next_step');
  }
  return { rows, shown, total, bounded: shown < total, selectionRule: text(value.selection_rule, 'selection_rule'), unavailable };
}

function audiencesOf(value: unknown): Audience[] {
  const audiences = records(value, 'audiences');
  for (const audience of audiences) {
    count(audience.excluded_missing_label, 'audience.excluded_missing_label');
    for (const group of records(audience.groups, 'audience.groups')) {
      finite(VIEW, group.mean, 'audience.group.mean');
      const n = count(group.n, 'audience.group.n');
      const sides = ['negative_count', 'positive_count', 'tie_count']
        .map((key) => count(group[key], `audience.group.${key}`));
      if (sides.reduce((sum, side) => sum + side, 0) !== n) fail('audience side counts differ from n');
    }
  }
  return audiences as unknown as Audience[];
}

function coverageOf(value: unknown): Coverage {
  if (!isRecord(value)) fail('coverage is missing');
  for (const key of ['source_respondents', 'eligible_respondents', 'excluded_respondents', 'rows_without_id']) {
    count(value[key], `coverage.${key}`);
  }
  for (const exclusion of records(value.exclusions, 'coverage.exclusions')) {
    text(exclusion.reason, 'coverage.exclusions.reason');
    count(exclusion.count, 'coverage.exclusions.count');
  }
  return value as unknown as Coverage;
}

/** The exact respondent values of the selected comparison, tails included. */
function distributionOf(value: unknown, rows: PairedRow[]): DistributionPoint[] {
  const points = records(value, 'selected_distribution').map((point, index) => ({
    value: finite(VIEW, point.value, `selected_distribution[${index}].value`),
    count: count(point.count, `selected_distribution[${index}].count`),
  }));
  const selected = rows.find((row) => row.selected);
  const respondents = points.reduce((sum, point) => sum + point.count, 0);
  if (selected && respondents !== selected.summary.n) fail('selected_distribution does not cover every respondent');
  return points;
}

export function isRehoboamPairedViewId(id: unknown): id is RehoboamPairedViewId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(FAMILIES, id);
}

export function rehoboamPairedView(input: unknown): PairedPresentation {
  const id = isRecord(input) ? input.id : undefined;
  if (!isRehoboamPairedViewId(id)) fail(`unknown view ID ${String(id)}`);
  const { result, data, runId } = envelope(VIEW, input, id, 'get_paired_findings');
  assertMeaning(data);
  const next = nextOf(data.selected_comparison);
  const family = familyOf(data[FAMILIES[id]], next.action.comparison_id);
  return {
    id,
    runId,
    question: questionOf(data),
    finding: text(data.finding, 'finding'),
    objective: objectiveOf(data.objective),
    next,
    ...family,
    distribution: id === REHOBOAM_PAIRED_AGREEMENT_VIEW_ID ? distributionOf(data.selected_distribution, family.rows) : [],
    audiences: audiencesOf(data.audiences),
    coverage: coverageOf(data.coverage),
    notes: [text((data.interval as Record<string, unknown>).statement, 'interval.statement'), text(data.method, 'method'), ...findingNotesOf(data, data.audiences)],
    warnings: warningsOf(VIEW, data),
    provenance: provenanceOf(result),
  };
}
