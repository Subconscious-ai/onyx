'use client';

import type { ComponentType } from 'react';
import { REHOBOAM_EFFECT_VIEW_ID } from './rehoboam-effect-adapter';
import { RehoboamEffectView } from './rehoboam-effect-view';
import { REHOBOAM_IMPORTANCE_VIEW_ID } from './rehoboam-importance-adapter';
import { REHOBOAM_MARKET_SHARE_VIEW_ID } from './rehoboam-market-share-adapter';
import { RehoboamMarketShareView, type ScenarioControls } from './rehoboam-market-share-view';
import { REHOBOAM_RESPONDENT_DISTRIBUTION_VIEW_ID } from './rehoboam-respondent-distribution-adapter';
import { RehoboamRespondentDistributionView } from './rehoboam-respondent-distribution-view';
import { REHOBOAM_SEGMENT_COMPARISON_VIEW_ID } from './rehoboam-segment-comparison-adapter';
import {
  RehoboamSegmentComparisonView,
  type ComparisonControls,
} from './rehoboam-segment-comparison-view';
import { REHOBOAM_STUDY_OVERVIEW_VIEW_ID } from './rehoboam-study-overview-adapter';
import { RehoboamStudyOverviewView } from './rehoboam-study-overview-view';
import { RehoboamImportanceView } from './rehoboam-importance-view';
import { REHOBOAM_PREDICTIVE_VIEW_ID } from './rehoboam-predictive-adapter';
import { RehoboamPredictiveView } from './rehoboam-predictive-view';
import {
  REHOBOAM_PAIRED_AGREEMENT_VIEW_ID,
  REHOBOAM_PAIRED_SPREAD_VIEW_ID,
  REHOBOAM_TESTED_LEVEL_DIFFERENCES_VIEW_ID,
} from './rehoboam-paired-adapter';
import type { ComparisonAction, OfferChangeAction, PairedFindings } from './rehoboam-paired-findings-types';
import { RehoboamPairedView } from './rehoboam-paired-view';
import { REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID, REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID } from './rehoboam-consequence-adapter';
import { RehoboamConsequenceView } from './rehoboam-consequence-view';
import { ViewError } from './rehoboam-view-kit';
import { rehoboamViewId } from './rehoboam-view-registry';

export { isRenderableRehoboamView, validateRehoboamView } from './rehoboam-view-registry';

export type { ScenarioControls } from './rehoboam-market-share-view';
export type { ComparisonControls } from './rehoboam-segment-comparison-view';
/** The comparison a finding view proposes. It prepares a draft; it never runs anything. */
export type ProposedComparison = ComparisonAction | OfferChangeAction;
export type { PairedFindings, ComparisonAction, OfferChangeAction } from './rehoboam-paired-findings-types';

type FindingFamilies = Pick<PairedFindings, 'paired_agreement' | 'tested_level_differences' | 'paired_spread' | 'importance_composition' | 'saved_offer_change' | 'selected_distribution'>;
type FindingCommon = Omit<PairedFindings, keyof FindingFamilies>;
type FindingViews = {
  'paired-agreement/v1': Pick<FindingFamilies, 'paired_agreement' | 'selected_distribution'>;
  'tested-level-differences/v1': Pick<FindingFamilies, 'tested_level_differences'>;
  'paired-spread/v1': Pick<FindingFamilies, 'paired_spread'>;
  'importance-composition/v1': Pick<FindingFamilies, 'importance_composition'>;
  'saved-offer-change/v1': Pick<FindingFamilies, 'saved_offer_change'>;
};

/** Each producer chart carries only its own family plus the common v4 decision context. */
export type PairedChartView = {
  [Id in keyof FindingViews]: {
    id: Id;
    result: {
      operation: 'get_paired_findings';
      run_id: string;
      provenance?: Record<string, unknown>;
      data: FindingCommon & FindingViews[Id];
    };
  }
}[keyof FindingViews];

interface ViewComponentProps {
  view: unknown;
  className?: string;
  scenario?: ScenarioControls;
  comparison?: ComparisonControls;
  onPrepareComparison?: (comparison: ProposedComparison) => void;
}

const COMPONENTS: Record<string, ComponentType<ViewComponentProps>> = {
  [REHOBOAM_EFFECT_VIEW_ID]: RehoboamEffectView,
  [REHOBOAM_IMPORTANCE_VIEW_ID]: RehoboamImportanceView,
  [REHOBOAM_MARKET_SHARE_VIEW_ID]: RehoboamMarketShareView,
  [REHOBOAM_RESPONDENT_DISTRIBUTION_VIEW_ID]: RehoboamRespondentDistributionView,
  [REHOBOAM_SEGMENT_COMPARISON_VIEW_ID]: RehoboamSegmentComparisonView,
  [REHOBOAM_STUDY_OVERVIEW_VIEW_ID]: RehoboamStudyOverviewView,
  [REHOBOAM_PREDICTIVE_VIEW_ID]: ({ view, className }) => (
    <div className={className}>
      <RehoboamPredictiveView result={(view as { result?: unknown })?.result} />
    </div>
  ),
  [REHOBOAM_PAIRED_AGREEMENT_VIEW_ID]: RehoboamPairedView,
  [REHOBOAM_TESTED_LEVEL_DIFFERENCES_VIEW_ID]: RehoboamPairedView,
  [REHOBOAM_PAIRED_SPREAD_VIEW_ID]: RehoboamPairedView,
  [REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID]: RehoboamConsequenceView,
  [REHOBOAM_SAVED_OFFER_CHANGE_VIEW_ID]: RehoboamConsequenceView,
};

export interface RehoboamEvidenceViewProps {
  view: unknown;
  className?: string;
  /** Makes scenario views editable; other views ignore it. */
  scenario?: ScenarioControls;
  /** Makes comparison views editable; other views ignore it. */
  comparison?: ComparisonControls;
  /**
   * Finding views call this with the producer's proposed comparison when the
   * reader asks for a draft. Without it they show the evidence and no button.
   */
  onPrepareComparison?: (comparison: ProposedComparison) => void;
}

/** Renders any registered Rehoboam view, or an explicit error. */
export function RehoboamEvidenceView(props: RehoboamEvidenceViewProps) {
  const { view, className } = props;
  const id = rehoboamViewId(view);
  const Component =
    id && Object.prototype.hasOwnProperty.call(COMPONENTS, id) ? COMPONENTS[id] : undefined;
  if (!Component) {
    return <ViewError className={className} message="Its type is not registered." />;
  }
  return <Component {...props} />;
}
