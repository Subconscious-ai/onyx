import { REHOBOAM_EFFECT_VIEW_ID, rehoboamEffectView } from './rehoboam-effect-adapter';
import { REHOBOAM_IMPORTANCE_VIEW_ID, rehoboamImportanceView } from './rehoboam-importance-adapter';
import { REHOBOAM_MARKET_SHARE_VIEW_ID, rehoboamMarketShareView } from './rehoboam-market-share-adapter';
import {
  REHOBOAM_RESPONDENT_DISTRIBUTION_VIEW_ID,
  rehoboamRespondentDistributionView,
} from './rehoboam-respondent-distribution-adapter';
import {
  REHOBOAM_SEGMENT_COMPARISON_VIEW_ID,
  rehoboamSegmentComparisonView,
} from './rehoboam-segment-comparison-adapter';
import { REHOBOAM_STUDY_OVERVIEW_VIEW_ID, rehoboamStudyOverviewView } from './rehoboam-study-overview-adapter';
import { REHOBOAM_PREDICTIVE_VIEW_ID, rehoboamPredictiveView } from './rehoboam-predictive-adapter';
import {
  REHOBOAM_PAIRED_AGREEMENT_VIEW_ID,
  REHOBOAM_PAIRED_SPREAD_VIEW_ID,
  REHOBOAM_TESTED_LEVEL_DIFFERENCES_VIEW_ID,
  rehoboamPairedView,
} from './rehoboam-paired-adapter';
import {
  REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID,
  REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID,
  rehoboamConsequenceView,
} from './rehoboam-consequence-adapter';

/**
 * Every registered Rehoboam view ID and the adapter that validates it.
 * Producers and agents choose among these IDs; nothing else renders.
 */
export const REHOBOAM_VIEW_VALIDATORS: Record<string, (view: unknown) => unknown> = {
  [REHOBOAM_EFFECT_VIEW_ID]: rehoboamEffectView,
  [REHOBOAM_IMPORTANCE_VIEW_ID]: rehoboamImportanceView,
  [REHOBOAM_MARKET_SHARE_VIEW_ID]: rehoboamMarketShareView,
  [REHOBOAM_RESPONDENT_DISTRIBUTION_VIEW_ID]: rehoboamRespondentDistributionView,
  [REHOBOAM_SEGMENT_COMPARISON_VIEW_ID]: rehoboamSegmentComparisonView,
  [REHOBOAM_STUDY_OVERVIEW_VIEW_ID]: rehoboamStudyOverviewView,
  [REHOBOAM_PREDICTIVE_VIEW_ID]: (view) => rehoboamPredictiveView((view as { result?: unknown })?.result),
  [REHOBOAM_PAIRED_AGREEMENT_VIEW_ID]: rehoboamPairedView,
  [REHOBOAM_TESTED_LEVEL_DIFFERENCES_VIEW_ID]: rehoboamPairedView,
  [REHOBOAM_PAIRED_SPREAD_VIEW_ID]: rehoboamPairedView,
  [REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID]: rehoboamConsequenceView,
  [REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID]: rehoboamConsequenceView,
};

export function rehoboamViewId(view: unknown): string | undefined {
  const id = typeof view === 'object' && view !== null ? (view as { id?: unknown }).id : undefined;
  return typeof id === 'string' ? id : undefined;
}

/** Throws the adapter's reason when a view is unregistered or invalid. */
export function validateRehoboamView(view: unknown): void {
  const id = rehoboamViewId(view);
  const validate =
    id && Object.prototype.hasOwnProperty.call(REHOBOAM_VIEW_VALIDATORS, id)
      ? REHOBOAM_VIEW_VALIDATORS[id]
      : undefined;
  if (!validate) throw new Error(`Rehoboam view: unknown view ID ${String(id)}`);
  validate(view);
}

export function isRenderableRehoboamView(view: unknown): boolean {
  try {
    validateRehoboamView(view);
    return true;
  } catch {
    return false;
  }
}
