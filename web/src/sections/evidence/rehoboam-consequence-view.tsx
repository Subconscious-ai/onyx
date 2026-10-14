'use client';

import { FindingFrame } from './rehoboam-finding-frame';
import { MarkStyles, count, signed } from './rehoboam-marks';
import {
  REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID,
  rehoboamConsequenceView,
  type ConsequencePresentation,
} from './rehoboam-consequence-adapter';
import type { AttributeImportance, ImportanceComposition, OfferChangeAction, SavedOfferChange, ComparisonAction } from './rehoboam-paired-findings-types';
import { ViewError } from './rehoboam-view-kit';

const STYLES = `
.sce-consequence__row { margin: var(--sp-3) 0; min-width: 0; overflow-wrap: anywhere; }
.sce-consequence__row[data-selected="true"] > :first-child { font-weight: 600; }
.sce-consequence__bar { height: 12px; background: var(--hairline); overflow: hidden; }
.sce-consequence__bar i { display: block; height: 100%; background: color-mix(in srgb, var(--color) 42%, var(--backgroundColor)); }
.sce-consequence__row[data-selected="true"] .sce-consequence__bar i { background: var(--color); }
.sce-consequence__offers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: var(--sp-3); }
.sce-consequence__offer { border: 1px solid var(--hairline); padding: var(--sp-3); min-width: 0; overflow-wrap: anywhere; }
.sce-consequence__offer h3 { margin: 0 0 var(--sp-2); font-size: 15px; }
`;

const points = (value: number) => `${value} importance points`;
const share = (value: number) => `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;

function ImportanceAttribute({ attribute }: { attribute: AttributeImportance }) {
  return (
    <section className="sce-consequence__row" data-importance-attribute={attribute.attribute}>
      <h3>{attribute.attribute}: {points(attribute.native_importance_points)}</h3>
      {attribute.continuous ? (
        <p className="sce-view__note">Continuous attribute: no tested level contribution. Native importance remains {points(attribute.native_importance_points)}.</p>
      ) : attribute.contribution_total_points === null ? (
        <p className="sce-view__note">No reconciled level contribution is available. Native importance remains {points(attribute.native_importance_points)}.</p>
      ) : (
        <>
          <p className="sce-mark__detail">Reconciled total: {points(attribute.contribution_total_points)}. {count(attribute.zero_importance_respondents)} matched respondents had zero importance.</p>
          {attribute.contributions.map((part) => (
            <div className="sce-consequence__row" data-mark-key={part.comparison_id} data-selected={part.selected} key={part.comparison_id}>
              <span className="sce-mark__label">{part.from_level} to {part.to_level}</span>
              <div aria-label={`${part.from_level} to ${part.to_level}: ${points(part.importance_points)}`} className="sce-consequence__bar" role="img">
                <i style={{ width: `${Math.max(0, Math.min(100, part.importance_points))}%` }} />
              </div>
              <p className="sce-mark__detail">{points(part.importance_points)} · {count(part.respondent_count)} matched respondents</p>
            </div>
          ))}
          {attribute.other_contribution_points ? <p className="sce-mark__detail">Other level ranges: {points(attribute.other_contribution_points)}.</p> : null}
          {attribute.below_resolution_points ? <p className="sce-mark__detail">Below display resolution: {points(attribute.below_resolution_points)}.</p> : null}
          <p className="sce-view__note">{count(attribute.shown_contribution_count)} of {count(attribute.total_contribution_count)} contributions shown.</p>
        </>
      )}
    </section>
  );
}

function ImportanceEvidence({ family }: { family: ImportanceComposition }) {
  return (
    <>
      <p className="sce-view__note">{family.scale}</p>
      {family.attributes.map((attribute) => <ImportanceAttribute attribute={attribute} key={attribute.attribute} />)}
      <p className="sce-view__note">{family.selection_rule}</p>
      <p className="sce-view__note" data-importance-coverage>
        {count(family.coverage.matched_respondents)} matched of {count(family.coverage.cohort_respondents)} importance respondents; {count(family.coverage.unmatched_importance_respondents)} unmatched, {count(family.coverage.excluded_respondents)} excluded.
      </p>
      <p className="sce-view__note" data-reconciliation>
        {family.reconciliation.status}: {count(family.reconciliation.checked_respondents)} checked
        {family.reconciliation.max_abs_drift_points === null ? '.' : `; maximum drift ${points(family.reconciliation.max_abs_drift_points)}.`}
      </p>
      <p className="sce-view__note" data-importance-source>
        Source: {family.source.importance_table} with {family.source.utilities_table}, matched by {family.source.match_key}. get_feature_importance uses another source and may cover a different cohort.
      </p>
    </>
  );
}

function OfferCard({ name, id, levels, baseline, role }: { name: string; id: string; levels: Array<{ attribute: string; level: string }>; baseline?: number; role: string }) {
  return <div className="sce-consequence__offer" data-offer-id={id} data-offer-role={role}>
    <span className="sce-finding__tag">{role === 'focus' ? 'Baseline focus' : role === 'candidate' ? 'Candidate draft' : 'Competitor held fixed'}</span>
    <h3>{name}</h3>
    <p className="sce-mark__detail">Offer ID: {id}{baseline === undefined ? '' : ` · baseline modeled choice ${share(baseline)}`}</p>
    {levels.map((item) => <p className="sce-mark__detail" key={item.attribute}>{item.attribute}: {item.level}</p>)}
  </div>;
}

function OfferEvidence({ family, action }: { family: SavedOfferChange; action: ComparisonAction | OfferChangeAction }) {
  const focus = family.focus_offer;
  return <>
    <div className="sce-consequence__offers">
      {focus ? <OfferCard name={focus.name} id={focus.offer_id} levels={focus.levels} baseline={focus.baseline_share} role="focus" /> : null}
      {action.kind === 'prepare_simulator_draft' ? <OfferCard name={action.draft_offer.name} id={action.draft_offer.offer_id} levels={action.draft_offer.levels} role="candidate" /> : null}
      {family.competitors.map((competitor) => <OfferCard name={competitor.name} id={competitor.offer_id} levels={competitor.levels} baseline={competitor.baseline_share} role="competitor" key={competitor.offer_id} />)}
      {family.opt_out.included && family.opt_out.baseline_share !== null ? <div className="sce-consequence__offer" data-offer-role="opt-out"><h3>Actual opt-out</h3><p className="sce-mark__detail">Baseline modeled choice {share(family.opt_out.baseline_share)}</p></div> : null}
    </div>
    {family.changes.map((change) => <div className="sce-consequence__row" data-mark-key={change.comparison_id} data-selected={change.selected} key={change.comparison_id}>
      <span className="sce-mark__label">{change.attribute}: {change.from_level} to {change.to_level}</span>
      <p className="sce-mark__detail">{focus ? `Modeled choice ${share(focus.baseline_share)} to ${share(change.share)} · ` : ''}gain {signed(change.gain_points)}pt</p>
    </div>)}
    <p className="sce-view__note" data-shortlist>{count(family.shown_count)} of {count(family.total_count)} tested one-at-a-time changes shown. {family.selection_rule}</p>
    {family.audiences.filter((audience) => audience.status === 'ok').map((audience) => {
      // The adapter guarantees every split names a listed change.
      const change = family.changes.find((item) => item.comparison_id === audience.comparison_id)!;
      return <section data-audience={audience.characteristic} data-comparison-id={audience.comparison_id} key={`${audience.comparison_id}:${audience.characteristic}`}>
      <h3>{change.attribute}: {change.from_level} to {change.to_level}, by {audience.characteristic}</h3>
      {audience.groups.map((group) => <div className="sce-consequence__row" data-mark-key={group.group_id} key={group.group_id}>
        <span className="sce-mark__label">{group.label}: {signed(group.gain_points)}pt · {count(group.n)} respondents</span>
        <p className="sce-mark__detail">Modeled choice {share(group.baseline_share)} to {share(group.share)}</p>
      </div>)}
      <p className="sce-view__note">{count(audience.excluded_missing_label)} respondents without this group label.</p>
    </section>;
    })}
    <p className="sce-view__note" data-offer-source>Source: {family.source.offers_table}; {family.source.utilities_table}; opt-out from {family.source.opt_out_field}. {count(family.respondent_count)} exported respondents, each weighted once.</p>
  </>;
}

function Evidence({ value }: { value: ConsequencePresentation }) {
  return <>
    <MarkStyles />
    <style>{STYLES}</style>
    {value.family.unavailable.map((reason, index) => <p className="sce-view__note" data-unavailable={reason.code} key={`${reason.code}-${index}`}>
      This comparison needs: {reason.prerequisite} {reason.next_step}
    </p>)}
    {value.id === REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID
      ? <ImportanceEvidence family={value.family as ImportanceComposition} />
      : <OfferEvidence family={value.family as SavedOfferChange} action={value.next.action} />}
  </>;
}

export interface RehoboamConsequenceViewProps {
  view: unknown;
  className?: string;
  onPrepareComparison?: (comparison: ComparisonAction | OfferChangeAction) => void;
}

export function RehoboamConsequenceView({ view, className, onPrepareComparison }: RehoboamConsequenceViewProps) {
  let value: ConsequencePresentation;
  try { value = rehoboamConsequenceView(view); }
  catch (error) { return <ViewError className={className} message={error instanceof Error ? error.message : String(error)} />; }
  return <FindingFrame
    name={value.id.split('/')[0] ?? value.id} runId={value.runId} className={className}
    kicker={value.id === REHOBOAM_IMPORTANCE_COMPOSITION_VIEW_ID ? 'What composes importance' : 'Tested saved-offer changes'}
    question={value.question} finding={value.finding} objective={value.objective}
    next={{ label: value.next.label,
      rationale: value.next.rationale,
      onPrepare: onPrepareComparison ? () => onPrepareComparison(value.next.action) : undefined }}
    notes={value.notes} warnings={value.warnings} provenance={value.provenance}
  ><Evidence value={value} /></FindingFrame>;
}
