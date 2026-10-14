import type {
  ImportanceComposition,
  SavedOfferChange,
  Unavailable,
} from './rehoboam-paired-findings-types';
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
  provenanceOf,
  probability,
  questionOf,
  recordsOf,
  text as textOf,
  warningsOf,
  type ObjectiveSummary,
  type ProposedNext,
  type RehoboamProvenanceEntry,
} from './rehoboam-shared';

export const REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID = 'importance-composition/v1';
export const REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID = 'saved-offer-change/v1';
type ConsequenceId = typeof REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID | typeof REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID;
const VIEW = 'consequence finding';
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);

export interface ConsequencePresentation {
  id: ConsequenceId;
  runId: string;
  question: string | null;
  finding: string;
  objective: ObjectiveSummary;
  next: ProposedNext;
  family: ImportanceComposition | SavedOfferChange;
  notes: string[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

const count = (value: unknown, field: string) => countOf(VIEW, value, field);
const records = (value: unknown, field: string) => recordsOf(VIEW, value, field);

function gainPoints(value: unknown, field: string): number {
  const gain = finite(VIEW, value, field);
  if (gain < -100 || gain > 100) fail(`${field} must be between -100 and 100`);
  return gain;
}

// The producer reads only these exported tables; any other source is a different calculation.
const IMPORTANCE_SOURCE = {
  importance_table: 'Ind_Est_2.HB_Data.HB_Importance',
  utilities_table: 'Ind_Est_2.HB_Data.HB_Beta',
  match_key: 'exported respondent ID within this run',
};
const OFFER_SOURCE = {
  offers_table: 'Ind_Est_2.HB_Data.generated_products',
  utilities_table: 'Ind_Est_2.HB_Data.HB_Beta',
  opt_out_field: 'Ind_Est_2.HB_Data.Opt_Out',
};

function sourceOf(value: unknown, expected: Record<string, string>, field: string): void {
  if (!isRecord(value) || Object.entries(expected).some(([key, table]) => value[key] !== table)) fail(`${field} names an unsupported source`);
}

/** Importance is a share of 100 points, so no part can be negative or exceed the whole. */
function importancePoints(value: unknown, field: string): number {
  const amount = finite(VIEW, value, field);
  if (amount < 0 || amount > 100) fail(`${field} must be between 0 and 100`);
  return amount;
}

/** A null finding is allowed only while the family is unavailable. */
function findingOrNull(value: unknown, field: string): void {
  if (value !== null) text(value, field);
}

function reasons(value: unknown): Unavailable[] {
  return records(value, 'unavailable').map((reason) => {
    text(reason.code, 'unavailable.code');
    text(reason.prerequisite, 'unavailable.prerequisite');
    text(reason.next_step, 'unavailable.next_step');
    return reason as unknown as Unavailable;
  });
}

function importanceShortlist(attribute: Record<string, unknown>): Record<string, unknown>[] {
  const contributions = records(attribute.contributions, 'contributions');
  const shown = count(attribute.shown_contribution_count, 'shown_contribution_count');
  const total = count(attribute.total_contribution_count, 'total_contribution_count');
  if (shown !== contributions.length || total < shown || shown > 8) fail('importance shortlist is inconsistent');
  return contributions;
}

function importanceContribution(contribution: Record<string, unknown>): void {
  text(contribution.comparison_id, 'comparison_id');
  text(contribution.from_level, 'from_level');
  text(contribution.to_level, 'to_level');
  importancePoints(contribution.importance_points, 'importance_points');
  count(contribution.respondent_count, 'respondent_count');
}

function importanceReconciles(attribute: Record<string, unknown>, contributions: Record<string, unknown>[]): void {
  const totalPoints = finite(VIEW, attribute.contribution_total_points, 'contribution_total_points');
  if (Math.abs(totalPoints - (attribute.native_importance_points as number)) > 0.005) fail('importance total differs from native');
  contributions.forEach(importanceContribution);
  const parts = contributions.reduce((sum, item) => sum + (item.importance_points as number), 0)
    + (attribute.other_contribution_points as number) + (attribute.below_resolution_points as number);
  if (Math.abs(parts - totalPoints) > 0.005) fail('importance contributions do not reconcile');
}

/** Native importance is shown in every state; level parts must reconcile only when the family is available. */
function importanceAttribute(attribute: Record<string, unknown>, available: boolean): void {
  text(attribute.attribute, 'attribute');
  importancePoints(attribute.native_importance_points, 'native_importance_points');
  importancePoints(attribute.other_contribution_points, 'other_contribution_points');
  importancePoints(attribute.below_resolution_points, 'below_resolution_points');
  count(attribute.zero_importance_respondents, 'zero_importance_respondents');
  const contributions = importanceShortlist(attribute);
  if (attribute.continuous === true) {
    if (attribute.contribution_total_points !== null || contributions.length) fail('continuous importance cannot have level contributions');
    return;
  }
  if (attribute.continuous !== false) fail('importance attribute kind is missing');
  if (available) importanceReconciles(attribute, contributions);
  else if (attribute.contribution_total_points !== null || contributions.length) fail('unavailable importance cannot have level contributions');
}

/** Coverage and reconciliation are displayed in every state, so both are checked before the status. */
function importanceCohort(value: Record<string, unknown>): { matched: number; reconciled: boolean } {
  const coverage = value.coverage;
  if (!isRecord(coverage)) fail('importance coverage is missing');
  const matched = count(coverage.matched_respondents, 'matched_respondents');
  count(coverage.cohort_respondents, 'cohort_respondents');
  count(coverage.unmatched_importance_respondents, 'unmatched_importance_respondents');
  count(coverage.excluded_respondents, 'excluded_respondents');
  const reconciliation = value.reconciliation;
  if (!isRecord(reconciliation) || !['reconciled', 'failed', 'not_checked'].includes(String(reconciliation.status))) {
    fail('importance reconciliation is missing');
  }
  count(reconciliation.checked_respondents, 'checked_respondents');
  const failed = count(reconciliation.failed_respondents, 'failed_respondents');
  if (reconciliation.max_abs_drift_points !== null) {
    const drift = finite(VIEW, reconciliation.max_abs_drift_points, 'max_abs_drift_points');
    if (drift < 0) fail('max_abs_drift_points must not be negative');
  }
  return { matched, reconciled: reconciliation.status === 'reconciled' && failed === 0 };
}

/** At most one contribution is selected, and it is the selected comparison whenever that comparison is drawn. */
function importanceSelection(attributes: Record<string, unknown>[], selectedId: string): void {
  const contributions = attributes.flatMap((attribute) => records(attribute.contributions, 'contributions'));
  const selected = contributions.filter((item) => item.selected === true);
  if (selected.length > 1 || (selected.length === 1 && selected[0].comparison_id !== selectedId)) fail('importance mark selection differs');
  const visible = contributions.some((item) => item.comparison_id === selectedId);
  if (visible && selected.length !== 1) fail('importance selected mark is missing');
}

function importance(value: unknown, selectedId: string): ImportanceComposition {
  if (!isRecord(value) || value.units !== 'importance_points') fail('importance composition is missing');
  text(value.method, 'importance_composition.method');
  text(value.scale, 'importance_composition.scale');
  text(value.selection_rule, 'importance_composition.selection_rule');
  sourceOf(value.source, IMPORTANCE_SOURCE, 'importance_composition.source');
  const cohort = importanceCohort(value);
  const attributes = records(value.attributes, 'attributes');
  const unavailable = reasons(value.unavailable);
  if (value.status === 'unavailable' && unavailable.length) {
    findingOrNull(value.finding, 'importance_composition.finding');
    attributes.forEach((attribute) => importanceAttribute(attribute, false));
    return value as unknown as ImportanceComposition;
  }
  if (value.status !== 'ok' || unavailable.length) fail('importance composition status is inconsistent');
  if (!cohort.reconciled) fail('importance reconciliation did not pass');
  if (!cohort.matched) fail('no matched importance respondents');
  if (!attributes.length || value.selected_comparison_id !== selectedId) fail('importance selection is inconsistent');
  attributes.forEach((attribute) => importanceAttribute(attribute, true));
  importanceSelection(attributes, selectedId);
  text(value.finding, 'importance_composition.finding');
  return value as unknown as ImportanceComposition;
}

function offerIdentity(focus: Record<string, unknown> | null, competitors: Record<string, unknown>[], optOut: Record<string, unknown>): void {
  for (const profile of focus ? [focus, ...competitors] : competitors) {
    text(profile.offer_id, 'offer_id');
    text(profile.name, 'offer_name');
    probability(VIEW, profile.baseline_share, 'baseline_share');
    records(profile.levels, 'offer_levels');
  }
  const included = optOut.included;
  if (typeof included !== 'boolean') fail('opt-out inclusion is missing');
  if (included) probability(VIEW, optOut.baseline_share, 'opt_out.baseline_share');
  else if (optOut.baseline_share !== null) fail('excluded opt-out has a share');
}

function offerChangeFields(changes: Record<string, unknown>[]): void {
  for (const change of changes) {
    text(change.comparison_id, 'change.comparison_id');
    text(change.attribute, 'change.attribute');
    text(change.from_level, 'change.from_level');
    text(change.to_level, 'change.to_level');
    gainPoints(change.gain_points, 'gain_points');
    probability(VIEW, change.share, 'share');
  }
  if (new Set(changes.map((change) => change.comparison_id)).size !== changes.length) fail('offer change IDs repeat');
}

function offerChanges(changes: Record<string, unknown>[], value: Record<string, unknown>, selectedId: string, unavailable: Unavailable[]): void {
  const selected = changes.filter((change) => change.selected === true);
  if (value.selected_comparison_id === null) {
    if (selected.length || !unavailable.some((reason) => reason.code === 'no_improving_candidate')) fail('unselected offer change needs its reason');
  } else if (value.selected_comparison_id !== selectedId || selected.length !== 1 || selected[0].comparison_id !== selectedId) {
    fail('saved-offer mark differs from selected comparison');
  }
  if (selected.length && (selected[0].gain_points as number) <= 0) fail('selected offer change does not improve modeled choice');
}

type OfferProfile = { offer_id: string; name: string; levels: unknown };

function sameProfile(left: OfferProfile, right: Record<string, unknown>): boolean {
  return left.offer_id === right.offer_id && left.name === right.name && JSON.stringify(left.levels) === JSON.stringify(right.levels);
}

/** The draft changes exactly the proposed attribute from its saved level to the candidate level. */
function draftReplacesLevel(action: Extract<ProposedNext['action'], { kind: 'prepare_simulator_draft' }>, focus: Record<string, unknown>): boolean {
  const originalLevels = records(focus.levels, 'focus_offer.levels');
  const draftLevels = action.draft_offer.levels;
  return draftLevels.length === originalLevels.length &&
    originalLevels.every((level, index) => draftLevels[index].attribute === level.attribute &&
      draftLevels[index].level === (level.attribute === action.attribute ? action.to_level : level.level)) &&
    originalLevels.some((level) => level.attribute === action.attribute && level.level === action.from_level);
}

function offerAction(action: ProposedNext['action'], focus: Record<string, unknown>, competitors: Record<string, unknown>[], included: boolean): void {
  if (action.kind !== 'prepare_simulator_draft') return;
  const sameCompetitors = action.competitors.length === competitors.length &&
    action.competitors.every((item, index) => sameProfile(item, competitors[index]));
  const sameFocus = sameProfile(action.focus_offer, focus) &&
    action.draft_offer.offer_id === focus.offer_id && action.draft_offer.name === focus.name;
  if (!sameFocus || !sameCompetitors || action.opt_out_included !== included || !draftReplacesLevel(action, focus)) {
    fail('draft action differs from saved offers or opt-out');
  }
}

/** Each audience split belongs to one listed change, which names the section. */
function offerAudiences(value: unknown, changes: Record<string, unknown>[]): void {
  for (const audience of records(value, 'audiences')) {
    text(audience.characteristic, 'audience.characteristic');
    count(audience.excluded_missing_label, 'audience.excluded_missing_label');
    if (!changes.some((change) => change.comparison_id === audience.comparison_id)) fail('audience split names no listed change');
    for (const group of records(audience.groups, 'audience.groups')) {
      text(group.group_id, 'group_id');
      text(group.label, 'group.label');
      count(group.n, 'group.n');
      probability(VIEW, group.baseline_share, 'group.baseline_share');
      probability(VIEW, group.share, 'group.share');
      gainPoints(group.gain_points, 'group.gain_points');
    }
  }
}

/** The shown changes are the counted shortlist, at most eight of the tested changes. */
function offerShortlist(value: Record<string, unknown>): Record<string, unknown>[] {
  const changes = records(value.changes, 'changes');
  const shown = count(value.shown_count, 'shown_count');
  const total = count(value.total_count, 'total_count');
  count(value.respondent_count, 'respondent_count');
  if (shown !== changes.length || total < shown || shown > 8) fail('saved-offer shortlist is inconsistent');
  offerChangeFields(changes);
  return changes;
}

function offer(value: unknown, selectedId: string, action: ProposedNext['action']): SavedOfferChange {
  if (!isRecord(value) || value.units !== 'modeled_choice_share' || value.gain_units !== 'percentage_points' || value.weighting !== 'equal_exported_respondent') {
    fail('saved-offer change has unsupported units or weighting');
  }
  text(value.method, 'saved_offer_change.method');
  text(value.selection_rule, 'saved_offer_change.selection_rule');
  sourceOf(value.source, OFFER_SOURCE, 'saved_offer_change.source');
  const optOut = value.opt_out;
  if (!isRecord(optOut)) fail('saved offers or opt-out are missing');
  const competitors = records(value.competitors, 'competitors');
  const changes = offerShortlist(value);
  offerAudiences(value.audiences, changes);
  const focus = value.focus_offer;
  const unavailable = reasons(value.unavailable);
  if (value.status === 'unavailable' && unavailable.length) {
    // An unavailable change may still list the saved offers it could read.
    if (focus !== null && !isRecord(focus)) fail('saved offers or opt-out are missing');
    offerIdentity(focus, competitors, optOut);
    findingOrNull(value.finding, 'saved_offer_change.finding');
    return value as unknown as SavedOfferChange;
  }
  if (value.status !== 'ok') fail('saved-offer change status is inconsistent');
  if (!isRecord(focus)) fail('saved offers or opt-out are missing');
  offerIdentity(focus, competitors, optOut);
  offerChanges(changes, value, selectedId, unavailable);
  if (value.selected_comparison_id !== null && action.kind !== 'prepare_simulator_draft') fail('selected offer change needs a simulator draft');
  offerAction(action, focus, competitors, optOut.included as boolean);
  text(value.finding, 'saved_offer_change.finding');
  return value as unknown as SavedOfferChange;
}

export function rehoboamConsequenceView(input: unknown): ConsequencePresentation {
  const id = isRecord(input) ? input.id : undefined;
  if (id !== REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID && id !== REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID) fail(`unknown view ID ${String(id)}`);
  const { result, data, runId } = envelope(VIEW, input, id, 'get_paired_findings');
  assertMeaning(data);
  const next = nextOf(data.selected_comparison);
  const family = id === REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID
    ? importance(data.importance_composition, next.action.comparison_id)
    : offer(data.saved_offer_change, next.action.comparison_id, next.action);
  return {
    // The family's own finding leads; the Study headline stands in only while the family is unavailable.
    id, runId, question: questionOf(data), finding: family.finding ?? text(data.finding, 'finding'),
    objective: objectiveOf(data.objective), next, family,
    notes: [family.method, ...findingNotesOf(data, id === REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID ? (family as SavedOfferChange).audiences : data.audiences)],
    warnings: warningsOf(VIEW, data), provenance: provenanceOf(result),
  };
}
