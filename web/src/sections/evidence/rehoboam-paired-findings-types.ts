export interface PairedFindings {
  audience_coverage: AudienceCoverage;
  audiences: Array<Audience>;
  coverage: Coverage;
  finding: string | null;
  importance_composition: ImportanceComposition;
  interval: Interval;
  method: string;
  no_choice_task_frequency: NoChoiceTaskFrequency;
  objective: Objective;
  paired_agreement: ComparisonFamily;
  paired_spread: SpreadFamily;
  question: Question;
  saved_offer_change: SavedOfferChange;
  selected_comparison: SelectedComparison | null;
  selected_distribution: Array<DistributionPoint>;
  source: Source;
  status: "ok" | "unavailable";
  supporting_references: Array<SupportingReference>;
  tested_level_differences: ComparisonFamily;
  unavailable: Array<Unavailable>;
  units: "utility_difference";
  version: "paired-findings/v4";
  warnings: Array<string>;
  weighting: "equal_exported_respondent";
}

export interface AttributeImportance {
  attribute: string;
  below_resolution_points: number;
  continuous: boolean;
  contribution_total_points: number | null;
  contributions: Array<Contribution>;
  native_importance_points: number;
  other_contribution_points: number;
  shown_contribution_count: number;
  total_contribution_count: number;
  zero_importance_respondents: number;
}

export interface Audience {
  characteristic: string;
  excluded_missing_label: number;
  groups: Array<AudienceGroup>;
  kind: "demographics" | "attitude" | "personality";
  status: "ok" | "too_many_groups" | "no_valid_labels";
}

export interface AudienceCoverage {
  declared_count: number;
  limit: 20;
  omitted_count: number;
  selection_rule: string;
  shown_count: number;
}

export interface AudienceGroup {
  group_id: string;
  label: string;
  mean: number;
  n: number;
  negative_count: number;
  positive_count: number;
  tie_count: number;
}

export interface Comparison {
  attribute: string;
  comparison_id: string;
  from_level: string;
  ordering: "numeric_step" | "nominal_pair" | "offer_replacement";
  summary: Summary;
  to_level: string;
}

export interface ComparisonAction {
  attribute: string;
  comparison_id: string;
  draft_only: true;
  executes: false;
  from_level: string;
  kind: "prepare_comparison_draft";
  to_level: string;
}

export interface ComparisonFamily {
  rows: Array<Comparison>;
  selected_comparison_id: string | null;
  selection_rule: string;
  shortlist_limit: 8;
  shown_count: number;
  status: "ok" | "unavailable";
  total_count: number;
  unavailable: Array<Unavailable>;
}

export interface Contribution {
  attribute: string;
  comparison_id: string;
  from_level: string;
  importance_points: number;
  respondent_count: number;
  selected: boolean;
  to_level: string;
}

export interface Coverage {
  eligible_respondents: number;
  excluded_respondents: number;
  exclusions: Array<Exclusion>;
  rows_without_id: number;
  source_respondents: number;
}

export interface DistributionPoint {
  count: number;
  value: number;
}

export interface Exclusion {
  count: number;
  reason: "duplicate_id" | "missing_cell" | "non_finite";
}

export interface ImportanceComposition {
  attributes: Array<AttributeImportance>;
  coverage: ImportanceCoverage;
  finding: string | null;
  method: string;
  reconciliation: Reconciliation;
  scale: string;
  selected_comparison_id: string | null;
  selection_rule: string;
  shortlist_limit: 8;
  source: ImportanceSource;
  status: "ok" | "unavailable";
  unavailable: Array<Unavailable>;
  units: "importance_points";
}

export interface ImportanceCoverage {
  cohort_respondents: number;
  excluded_respondents: number;
  exclusions: Array<ImportanceExclusion>;
  matched_respondents: number;
  unmatched_importance_respondents: number;
}

export interface ImportanceExclusion {
  count: number;
  reason: "missing_importance" | "invalid_importance";
}

export interface ImportanceSource {
  importance_table: "Ind_Est_2.HB_Data.HB_Importance";
  match_key: "exported respondent ID within this run";
  utilities_table: "Ind_Est_2.HB_Data.HB_Beta";
}

export interface Interval {
  inferential_interval: null;
  kind: "respondent_quantiles";
  lower_quantile: 0.1;
  statement: string;
  upper_quantile: 0.9;
}

export interface MissingInput {
  description: string;
  name: "market_size" | "unit_price" | "unit_cost";
}

export interface NoChoiceTaskFrequency {
  denominator: "tasks";
  label: "Recorded no-choice task frequency";
  no_choice_task_percent: number | null;
  source: "Ind_Est_2.HB_Data.none_sel";
  statement: string;
  status: "ok" | "unavailable";
  task_count: number | null;
  unavailable: Array<Unavailable>;
  units: "percent_of_tasks";
}

export interface Objective {
  measured_outcome: "modeled_choice";
  missing_business_inputs: Array<MissingInput>;
  requested: "modeled_choice" | "revenue" | "profit";
  source: "caller" | "default";
  statement: string;
  supported: boolean;
}

export interface OfferAudience {
  characteristic: string;
  comparison_id: string;
  excluded_missing_label: number;
  groups: Array<OfferGroup>;
  kind: "demographics" | "attitude" | "personality";
  status: "ok" | "too_many_groups" | "no_valid_labels";
}

export interface OfferChange {
  attribute: string;
  comparison_id: string;
  from_level: string;
  gain_points: number;
  selected: boolean;
  share: number;
  to_level: string;
}

export interface OfferChangeAction {
  attribute: string;
  comparison_id: string;
  competitors: Array<OfferProfile>;
  draft_offer: OfferProfile;
  draft_only: true;
  executes: false;
  focus_offer: OfferProfile;
  from_level: string;
  kind: "prepare_simulator_draft";
  opt_out_included: boolean;
  to_level: string;
}

export interface OfferGroup {
  baseline_share: number;
  gain_points: number;
  group_id: string;
  label: string;
  n: number;
  share: number;
}

export interface OfferLevel {
  attribute: string;
  level: string;
}

export interface OfferOptOut {
  baseline_share: number | null;
  included: boolean;
}

export interface OfferProfile {
  levels: Array<OfferLevel>;
  name: string;
  offer_id: string;
}

export interface OfferSource {
  offers_table: "Ind_Est_2.HB_Data.generated_products";
  opt_out_field: "Ind_Est_2.HB_Data.Opt_Out";
  simulator: string;
  utilities_table: "Ind_Est_2.HB_Data.HB_Beta";
}

export interface PointMass {
  count: number;
  share: number;
  value: number;
}

export interface Question {
  source: "run_config.why_prompt" | "run_config.experimentor_why_question_prompt" | "analytics_output.question" | "unavailable";
  text: string | null;
}

export interface Reconciliation {
  checked_respondents: number;
  failed_respondents: number;
  failures: Array<ReconciliationFailure>;
  importance_rounding: 0.00005;
  max_abs_drift_points: number | null;
  rule: string;
  status: "reconciled" | "failed" | "not_checked";
  utility_rounding: 0.00005;
}

export interface ReconciliationFailure {
  attribute: string | null;
  cause: "importance_not_normalized" | "range_mismatch";
  respondent_count: number;
}

export interface SavedOffer {
  baseline_share: number;
  levels: Array<OfferLevel>;
  name: string;
  offer_id: string;
}

export interface SavedOfferChange {
  audiences: Array<OfferAudience>;
  changes: Array<OfferChange>;
  competitors: Array<SavedOffer>;
  finding: string | null;
  focus_offer: SavedOffer | null;
  focus_rule: string;
  gain_units: "percentage_points";
  method: string;
  opt_out: OfferOptOut;
  respondent_count: number;
  selected_comparison_id: string | null;
  selection_rule: string;
  shortlist_limit: 8;
  shown_count: number;
  source: OfferSource;
  status: "ok" | "unavailable";
  total_count: number;
  unavailable: Array<Unavailable>;
  units: "modeled_choice_share";
  weighting: "equal_exported_respondent";
}

export interface SelectedComparison {
  action: ComparisonAction | OfferChangeAction;
  attribute: string;
  caption: string;
  comparison_id: string;
  family: "paired_contrast" | "saved_offer_change";
  from_level: string;
  rationale: string;
  rule: string;
  to_level: string;
}

export interface Source {
  artifact: string | null;
  artifact_sha256: string | null;
  match_key: "exported respondent ID within this run";
  run_id: string;
  table: "Ind_Est_2.HB_Data.HB_Beta";
}

export interface SpreadComparison {
  attribute: string;
  comparison_id: string;
  from_level: string;
  ordering: "numeric_step" | "nominal_pair" | "offer_replacement";
  spread_width: number;
  summary: Summary;
  to_level: string;
}

export interface SpreadFamily {
  rows: Array<SpreadComparison>;
  selected_comparison_id: string | null;
  selection_rule: string;
  shortlist_limit: 8;
  shown_count: number;
  status: "ok" | "unavailable";
  total_count: number;
  unavailable: Array<Unavailable>;
}

export interface Summary {
  mean: number;
  median: number;
  n: number;
  negative_count: number;
  negative_share: number;
  p10: number;
  p90: number;
  point_mass: PointMass | null;
  positive_count: number;
  positive_share: number;
  tie_count: number;
  tie_share: number;
}

export interface SupportingReference {
  capability: "get_preference_heterogeneity";
  computed_here: false;
  denominator: "respondents";
  label: string;
  statement: string;
}

export interface Unavailable {
  code: "no_respondent_utilities" | "no_eligible_respondents" | "no_tested_comparison" | "no_opposing_preferences" | "no_native_importance" | "no_matched_importance" | "continuous_attribute" | "attribute_mismatch" | "importance_not_normalized" | "range_mismatch" | "continuous_price" | "invalid_respondent_identity" | "incomplete_respondent_utilities" | "no_saved_offers" | "incomplete_offers" | "incomplete_offer_mapping" | "invalid_offer_identity" | "unavailable_opt_out" | "no_improving_candidate" | "unknown_focus_offer" | "no_opt_out_in_design" | "no_task_frequency";
  next_step: string;
  prerequisite: string;
}
