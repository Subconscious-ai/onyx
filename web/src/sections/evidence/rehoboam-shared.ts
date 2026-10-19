import type { ComparisonAction, MissingInput, OfferChangeAction } from './rehoboam-paired-findings-types';

export interface RehoboamProvenanceEntry {
  label: string;
  value: string;
}

export function fail(view: string, message: string): never {
  throw new Error(`Rehoboam ${view} view: ${message}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(view: string, value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(view, `${field} is missing`);
  return value;
}

export function finite(view: string, value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(view, `${field} must be a finite number`);
  return value;
}

export function finiteOrNull(view: string, value: unknown, field: string): number | null {
  return value === null ? null : finite(view, value, field);
}

export function probability(view: string, value: unknown, field: string): number {
  const share = finite(view, value, field);
  if (share < 0 || share > 1) fail(view, `${field} must be between 0 and 1`);
  return share;
}

/** Producer warnings are mandatory: a view without them never renders. */
export function warningsOf(view: string, data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.warnings) || data.warnings.length === 0) fail(view, 'producer warnings are missing');
  return data.warnings.map((warning, index) => text(view, warning, `warnings[${index}]`));
}

const PROVENANCE_LABELS: Array<[string, string]> = [
  ['analytics_artifact', 'Analytics artifact'],
  ['analytics_sha256', 'Artifact SHA-256'],
  ['posterior_artifact', 'Posterior artifact'],
  ['posterior_sha256', 'Posterior SHA-256'],
  ['mappings_artifact', 'Mappings artifact'],
  ['calculation_version', 'Calculation'],
  ['source', 'Source'],
];

export function provenanceOf(result: Record<string, unknown>): RehoboamProvenanceEntry[] {
  const source = isRecord(result.provenance) ? result.provenance : {};
  return PROVENANCE_LABELS.flatMap(([key, label]) => {
    const value = source[key];
    return typeof value === 'string' || typeof value === 'number'
      ? [{ label, value: String(value) }]
      : [];
  });
}

/** Common envelope checks: registered ID, expected operation, run and data. */
export function envelope(view: string, input: unknown, id: string, operation: string) {
  if (!isRecord(input)) fail(view, 'view is not an object');
  if (input.id !== id) fail(view, `unknown view ID ${String(input.id)}`);
  const result = input.result;
  if (!isRecord(result)) fail(view, 'result is missing');
  if (result.operation !== operation) fail(view, `unsupported operation ${String(result.operation)}`);
  const runId = text(view, result.run_id, 'run_id');
  const data = result.data;
  if (!isRecord(data)) fail(view, 'result data is missing');
  if (data.status !== 'ok') {
    const reasons = Array.isArray(data.unavailable) ? data.unavailable.filter(isRecord) : [];
    const remedies = reasons.map((reason) => `${text(view, reason.prerequisite, 'unavailable.prerequisite')} ${text(view, reason.next_step, 'unavailable.next_step')}`);
    fail(view, `the producer reports no result for this Study${remedies.length ? `: ${remedies.join('')}` : ''}`);
  }
  return { result, data, runId };
}

export function countOf(view: string, value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(view, `${field} must be a count`);
  return value as number;
}

export function recordsOf(view: string, value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) fail(view, `${field} is missing`);
  return value;
}

/** The Study question the producer echoes back, when it supplies one. */
export function questionOf(data: Record<string, unknown>): string | null {
  return isRecord(data.question) && typeof data.question.text === 'string' ? data.question.text : null;
}

export interface ProposedNext {
  label: string;
  rationale: string;
  action: ComparisonAction | OfferChangeAction;
}

export interface ObjectiveSummary {
  source: 'caller' | 'default';
  supported: boolean;
  statement: string;
  missing: MissingInput[];
}

// The paired-findings helpers below fail under one view name for all five families.
const PAIRED = 'paired findings';
const pairedFail: (message: string) => never = (message) => fail(PAIRED, message);
const pairedText = (value: unknown, field: string) => text(PAIRED, value, field);
const pairedRecords = (value: unknown, field: string) => recordsOf(PAIRED, value, field);

export function pairLabel(attribute: string, from: string, to: string, ordered: boolean): string {
  return ordered ? `${attribute}: ${from} → ${to}` : `${attribute}: ${to} versus ${from}`;
}


/** Only respondent quantiles are drawn; nothing here is an interval for the mean. */
export function assertMeaning(data: Record<string, unknown>): void {
  const interval = isRecord(data.interval) ? data.interval : {};
  const expected: Array<[unknown, unknown]> = [
    [data.version, 'paired-findings/v4'],
    [data.units, 'utility_difference'],
    [data.weighting, 'equal_exported_respondent'],
    [interval.kind, 'respondent_quantiles'],
    [interval.inferential_interval, null],
    [interval.lower_quantile, 0.1],
    [interval.upper_quantile, 0.9],
  ];
  if (expected.some(([actual, required]) => actual !== required)) pairedFail('unsupported version, units or interval');
}

/** A supplied offer must carry its scenario id, name and every tested level a host would draft. */
function offerProfileOf(value: unknown, field: string): void {
  if (!isRecord(value)) pairedFail(`${field} is missing`);
  pairedText(value.offer_id, `${field}.offer_id`);
  pairedText(value.name, `${field}.name`);
  const levels = pairedRecords(value.levels, `${field}.levels`);
  if (levels.length === 0) pairedFail(`${field}.levels is empty`);
  levels.forEach((level, index) => {
    pairedText(level.attribute, `${field}.levels[${index}].attribute`);
    pairedText(level.level, `${field}.levels[${index}].level`);
  });
}

/** The proposed comparison must be the selected one, and must only prepare a draft. */
export function nextOf(value: unknown): ProposedNext {
  if (!isRecord(value) || !isRecord(value.action)) pairedFail('the next comparison is missing');
  const action = value.action;
  const same = (['comparison_id', 'attribute', 'from_level', 'to_level'] as const).every(
    (key) => pairedText(value[key], `selected_comparison.${key}`) === action[key],
  );
  if (!same || !['prepare_comparison_draft', 'prepare_simulator_draft'].includes(String(action.kind)) || action.draft_only !== true || action.executes !== false) {
    pairedFail('the next comparison action does not match selected');
  }
  if (action.kind === 'prepare_simulator_draft') {
    if (typeof action.opt_out_included !== 'boolean') pairedFail('the simulator draft is missing its saved-offer context');
    offerProfileOf(action.focus_offer, 'action.focus_offer');
    offerProfileOf(action.draft_offer, 'action.draft_offer');
    if (!Array.isArray(action.competitors) || action.competitors.length === 0) pairedFail('the simulator draft has no competitors');
    action.competitors.forEach((offer, index) => offerProfileOf(offer, `action.competitors[${index}]`));
  }
  return {
    label: pairLabel(value.attribute as string, value.from_level as string, value.to_level as string, false),
    rationale: pairedText(value.rationale, 'selected_comparison.rationale'),
    action: action as unknown as ComparisonAction | OfferChangeAction,
  };
}

export function objectiveOf(value: unknown): ObjectiveSummary {
  if (!isRecord(value) || typeof value.supported !== 'boolean') pairedFail('the objective is missing');
  if (value.source !== 'caller' && value.source !== 'default') pairedFail('the objective source is missing');
  const missing = pairedRecords(value.missing_business_inputs, 'missing_business_inputs').map((input, index) => ({
    name: pairedText(input.name, `missing_business_inputs[${index}].name`),
    description: pairedText(input.description, `missing_business_inputs[${index}].description`),
  })) as MissingInput[];
  return { source: value.source, supported: value.supported, statement: pairedText(value.statement, 'objective.statement'), missing };
}

/** Coverage explains omitted splits; omitted groups never look like a measured zero. */
function audienceNotes(data: Record<string, unknown>, audiences: unknown): string[] {
  const coverage = data.audience_coverage;
  if (!isRecord(coverage)) pairedFail('audience coverage is missing');
  const declared = countOf(PAIRED, coverage.declared_count, 'audience_coverage.declared_count');
  const shown = countOf(PAIRED, coverage.shown_count, 'audience_coverage.shown_count');
  const omitted = countOf(PAIRED, coverage.omitted_count, 'audience_coverage.omitted_count');
  // The producer splits the first 20 declared traits, or none without a selected comparison or recorded demographics.
  if (coverage.limit !== 20 || shown > Math.min(declared, 20) || omitted !== Math.max(0, declared - 20)) {
    pairedFail('audience coverage counts differ');
  }
  const notes = [`${shown.toLocaleString('en-US')} of ${declared.toLocaleString('en-US')} declared audience traits shown; ${omitted.toLocaleString('en-US')} declared audience traits omitted.`,
    pairedText(coverage.selection_rule, 'audience_coverage.selection_rule')];
  for (const audience of pairedRecords(audiences, 'audiences')) {
    const name = pairedText(audience.characteristic, 'audience.characteristic');
    countOf(PAIRED, audience.excluded_missing_label, 'audience.excluded_missing_label');
    const groups = pairedRecords(audience.groups, 'audience.groups');
    for (const group of groups) {
      pairedText(group.group_id, 'audience.group_id');
      pairedText(group.label, 'audience.group.label');
      countOf(PAIRED, group.n, 'audience.group.n');
    }
    if (audience.status === 'too_many_groups') notes.push(`${name}: no split shown because the trait has too many groups.`);
    else if (audience.status === 'no_valid_labels') notes.push(`${name}: no split shown because no valid group labels were recorded.`);
    else if (audience.status !== 'ok') pairedFail('audience status is unsupported');
  }
  return notes;
}

function taskFrequencyNotes(value: unknown): string[] {
  if (!isRecord(value) || value.denominator !== 'tasks' || value.units !== 'percent_of_tasks') pairedFail('task frequency has unsupported units or denominator');
  const notes = [pairedText(value.statement, 'no_choice_task_frequency.statement')];
  if (value.status === 'ok') {
    const tasks = countOf(PAIRED, value.task_count, 'no_choice_task_frequency.task_count');
    const percent = finite(PAIRED, value.no_choice_task_percent, 'no_choice_task_frequency.no_choice_task_percent');
    if (!tasks || percent < 0 || percent > 100) pairedFail('task frequency is outside its range');
    notes.unshift(`Recorded no-choice task frequency: ${percent}% of ${tasks.toLocaleString('en-US')} recorded tasks.`);
  } else if (value.status === 'unavailable') {
    for (const reason of pairedRecords(value.unavailable, 'no_choice_task_frequency.unavailable')) {
      notes.push(`${pairedText(reason.prerequisite, 'prerequisite')} ${pairedText(reason.next_step, 'next_step')}`);
    }
  } else pairedFail('task frequency status is unsupported');
  return notes;
}

/** Preserve producer context without calculating or mixing task and respondent measures. */
export function findingNotesOf(data: Record<string, unknown>, audiences: unknown): string[] {
  const references = pairedRecords(data.supporting_references, 'supporting_references').map((reference) => {
    if (reference.capability !== 'get_preference_heterogeneity' || reference.computed_here !== false || reference.denominator !== 'respondents') {
      pairedFail('supporting reference is not a separate respondent measure');
    }
    return pairedText(reference.statement, 'supporting_references.statement');
  });
  return [...audienceNotes(data, audiences), ...taskFrequencyNotes(data.no_choice_task_frequency), ...references];
}

