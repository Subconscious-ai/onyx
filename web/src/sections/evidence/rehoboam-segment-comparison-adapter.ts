import {
  envelope,
  fail as failView,
  finite as finiteOf,
  finiteOrNull as finiteOrNullOf,
  isRecord,
  provenanceOf,
  text as textOf,
  warningsOf,
  type RehoboamProvenanceEntry,
} from './rehoboam-shared';

/** Rehoboam attaches this view to the `segment_comparison` chart of `compare_segments`. */
export const REHOBOAM_SEGMENT_COMPARISON_VIEW_ID = 'segment-comparison/v1';

const VIEW = 'segment comparison';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const finite = (value: unknown, field: string) => finiteOf(VIEW, value, field);
const finiteOrNull = (value: unknown, field: string) => finiteOrNullOf(VIEW, value, field);

export type ComparisonMeasure = 'importance' | 'posterior';

/** One segment filter: OR across entries, AND across keys, OR across values. */
export type SegmentFilter = Array<Record<string, string[]>>;

const UNITS: Record<ComparisonMeasure, string> = { importance: 'percent', posterior: 'utility' };

export interface ComparisonGroup {
  label: string;
  filter: SegmentFilter;
  respondents: number;
}

export interface ComparisonValue {
  estimate: number;
  /** Middle 95% of the group's respondents, when the producer reports it. */
  lower: number | null;
  upper: number | null;
  respondents: number;
}

export interface ComparisonPair {
  id: string;
  attribute: string;
  level: string;
  a: ComparisonValue;
  b: ComparisonValue;
  /** Group B minus group A, in the measure's units. */
  gap: number;
}

export interface RehoboamSegmentComparisonView {
  runId: string;
  title: string;
  measure: ComparisonMeasure;
  units: string;
  groups: [ComparisonGroup, ComparisonGroup];
  pairs: ComparisonPair[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

/** "gender: Female" or "age: 18-29, 30-41 and gender: Male". */
export function describeFilter(filter: SegmentFilter): string {
  const parts = filter.map((clause) =>
    Object.entries(clause)
      .map(([key, values]) => `${key.replace(/_/g, '')}: ${values.join(',')}`)
      .join('and'),
  );
  return parts.filter(Boolean).join('or') || 'Everyone';
}

/**
 * Validate a Rehoboam segment comparison. Throws on unknown measures or
 * units, anything other than exactly two groups, a row that is missing from
 * one group, reversed ranges and missing warnings.
 */
export function rehoboamSegmentComparisonView(view: unknown): RehoboamSegmentComparisonView {
  const { result, data, runId } = envelope(VIEW, view, REHOBOAM_SEGMENT_COMPARISON_VIEW_ID, 'compare_segments');
  const measure = data.measure;
  if (measure !== 'importance' && measure !== 'posterior') fail(`unsupported measure ${String(measure)}`);
  if (data.units !== UNITS[measure]) fail(`unexpected units ${String(data.units)} for ${measure}`);
  const warnings = warningsOf(VIEW, data);

  if (!Array.isArray(data.groups) || data.groups.length !== 2) fail('exactly two groups are required');
  const [groupA, groupB] = data.groups.map((group: unknown, index: number) => {
    if (!isRecord(group)) fail(`groups[${index}] is not an object`);
    if (group.status !== 'ok') fail(`groups[${index}] is ${String(group.status)}`);
    if (!Array.isArray(group.filter)) fail(`groups[${index}].filter is missing`);
    const filter = group.filter as SegmentFilter;
    return {
      key: text(group.label, `groups[${index}].label`),
      label: describeFilter(filter),
      filter,
      respondents: finite(group.n, `groups[${index}].n`),
    };
  });
  if (!groupA || !groupB) fail('exactly two groups are required');

  if (!Array.isArray(data.rows) || data.rows.length === 0) fail('rows are missing');
  const byId = new Map<string, { attribute: string; level: string; values: Record<string, ComparisonValue> }>();
  data.rows.forEach((row: unknown, index: number) => {
    if (!isRecord(row)) fail(`rows[${index}] is not an object`);
    const attribute = text(row.attribute, `rows[${index}].attribute`);
    const level = typeof row.level === 'string' ? row.level : '';
    const group = text(row.group, `rows[${index}].group`);
    if (group !== groupA.key && group !== groupB.key) fail(`rows[${index}] names unknown group ${group}`);
    const lower = finiteOrNull(row.lower ?? null, `rows[${index}].lower`);
    const upper = finiteOrNull(row.upper ?? null, `rows[${index}].upper`);
    if (lower !== null && upper !== null && lower > upper) fail(`rows[${index}] range is reversed`);
    const id = level ? `${attribute}::${level}` : attribute;
    const entry = byId.get(id) ?? { attribute, level, values: {} };
    if (entry.values[group]) fail(`duplicate row ${id} for ${group}`);
    entry.values[group] = {
      estimate: finite(row.estimate, `rows[${index}].estimate`),
      lower,
      upper,
      respondents: finite(row.n, `rows[${index}].n`),
    };
    byId.set(id, entry);
  });

  const pairs = [...byId.entries()].map(([id, entry]) => {
    const a = entry.values[groupA.key];
    const b = entry.values[groupB.key];
    if (!a || !b) fail(`${id} is missing from one group`);
    return { id, attribute: entry.attribute, level: entry.level, a, b, gap: b.estimate - a.estimate };
  });

  return {
    runId,
    title: 'Compare two groups',
    measure,
    units: UNITS[measure],
    groups: [
      { label: groupA.label, filter: groupA.filter, respondents: groupA.respondents },
      { label: groupB.label, filter: groupB.filter, respondents: groupB.respondents },
    ],
    pairs,
    warnings,
    provenance: provenanceOf(result),
  };
}
