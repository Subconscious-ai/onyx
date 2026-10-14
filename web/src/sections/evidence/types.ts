export type IntervalKind = 'confidence' | 'credible' | 'quantile' | 'producer-summary';

export interface EvidenceInterval {
  lower: number | null;
  upper: number | null;
  kind: IntervalKind;
  /** A proportion between 0 and 1, for example 0.95. */
  level?: number;
}

export interface EvidenceEstimate {
  /** Null means unavailable. Consumers must not coerce it to zero. */
  value: number | null;
  interval?: EvidenceInterval;
  unit?: string;
  label?: string;
}

export interface DecisionDefinition {
  question: string;
  recommendation: string;
  threshold?: number;
  thresholdLabel?: string;
}

export interface EstimandDefinition {
  name: string;
  treatment: string;
  comparison: string;
  outcome: string;
  population: string;
  horizon?: string;
  unit?: string;
}

export interface BusinessImpact {
  summary: string;
  estimate?: EvidenceEstimate;
  basis?: string;
}

export interface IdentificationStrategy {
  strategy: string;
  design?: string;
  adjustmentSet?: string[];
}

export type AssumptionStatus = 'supported' | 'untested' | 'violated';

export interface EvidenceAssumption {
  id: string;
  label: string;
  status: AssumptionStatus;
  detail?: string;
}

export type DiagnosticStatus = 'passed' | 'warning' | 'failed' | 'not-run';

export interface EvidenceDiagnostic {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail?: string;
}

export type RefutationKind =
  | 'placebo'
  | 'random-common-cause'
  | 'data-subset'
  | 'bootstrap'
  | 'alternate-model'
  | 'hidden-confounder';

export interface RefutationCheck {
  id: string;
  kind: RefutationKind;
  label: string;
  estimate: number | null;
  interval?: EvidenceInterval;
  signChanged: boolean;
  decisionChanged: boolean;
  detail?: string;
}

export interface EvidenceSource {
  label: string;
  id?: string;
  href?: string;
}

export interface EvidenceProvenance {
  method: string;
  sources: EvidenceSource[];
  model?: string;
  dataAsOf?: string;
  generatedAt?: string;
  analyst?: string;
}

export type EvidenceStatusState =
  | 'decision-ready'
  | 'provisional'
  | 'insufficient'
  | 'invalidated';

export interface EvidenceStatus {
  state: EvidenceStatusState;
  rationale: string;
  label?: string;
}

/**
 * The portable contract behind an executive causal answer. It keeps the
 * decision, causal quantity, identification claim, stress tests, and receipt
 * together so a visualization cannot outrun its evidence.
 */
export interface DecisionEvidence {
  id: string;
  decision: DecisionDefinition;
  estimand: EstimandDefinition;
  estimate: EvidenceEstimate;
  businessImpact: BusinessImpact;
  identification: IdentificationStrategy;
  assumptions: EvidenceAssumption[];
  diagnostics: EvidenceDiagnostic[];
  refutations: RefutationCheck[];
  provenance: EvidenceProvenance;
  evidenceStatus: EvidenceStatus;
}

export interface EffectIntervalDatum {
  id: string;
  label: string;
  group?: string;
  estimate: number | null;
  interval?: EvidenceInterval;
  detail?: string;
  /** An independently observed value, drawn as a ring beside the estimate. */
  referencePoint?: { value: number; label: string };
}

export interface DecisionThreshold {
  value: number;
  label: string;
}

export interface PropensityDensityPoint {
  propensity: number;
  density: number;
}

export interface EffectiveSampleSize {
  treatment: number;
  control: number;
}

export interface PrimaryRefutationEstimate {
  label: string;
  estimate: number | null;
  interval?: EvidenceInterval;
  detail?: string;
}
