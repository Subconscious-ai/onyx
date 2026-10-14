'use client';

import { useMemo } from 'react';
import { FindingFrame } from './rehoboam-finding-frame';
import {
  MarkStyles,
  QuantileAxis,
  QuantileTrack,
  ShareBar,
  ShareKey,
  count,
  signed,
  zeroDomain,
} from './rehoboam-marks';
import {
  REHOBOAM_PAIRED_AGREEMENT_VIEW_ID,
  rehoboamPairedView,
  type PairedPresentation,
  type PairedRow,
} from './rehoboam-paired-adapter';
import type { Audience, ComparisonAction, OfferChangeAction, Coverage, Summary } from './rehoboam-paired-findings-types';
import { ViewError } from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

export interface RehoboamPairedViewProps {
  /** The `view` object Rehoboam attaches to a paired-findings chart. */
  view: unknown;
  className?: string;
  /** Receives the producer's proposed comparison; the host prepares the draft. Omit for evidence only. */
  onPrepareComparison?: (comparison: ComparisonAction | OfferChangeAction) => void;
}

const KICKERS: Record<PairedPresentation['id'], string> = {
  'paired-agreement/v1': 'Do respondents agree?',
  'tested-level-differences/v1': 'Differences between tested levels',
  'paired-spread/v1': 'What the average conceals',
};

const AXIS_LABEL = 'Utility difference: positive favours the level after “→” or before “versus”';
const EXCLUSIONS: Record<string, string> = {
  duplicate_id: 'duplicate ID',
  missing_cell: 'missing value',
  non_finite: 'non-finite value',
};

const respondents = (n: number) => `${count(n)} ${n === 1 ? 'respondent' : 'respondents'}`;

const counts = (summary: Pick<Summary, 'negative_count' | 'tie_count' | 'positive_count'>) => ({
  lower: summary.negative_count,
  tied: summary.tie_count,
  higher: summary.positive_count,
});

function sides(row: { from: string; to: string }, summary: Pick<Summary, 'negative_count' | 'tie_count' | 'positive_count'>) {
  return `${count(summary.negative_count)} favor ${row.from} · ${count(summary.tie_count)} tied · ${count(summary.positive_count)} favor ${row.to}`;
}

function spreadDetail(row: PairedRow): string {
  const { summary } = row;
  const mass = summary.point_mass;
  return [
    'Utility difference (logit)',
    `Median ${signed(summary.median)}`,
    `mean ${signed(summary.mean)}`,
    `middle 80% of respondents ${signed(summary.p10)} to ${signed(summary.p90)}`,
    ...(row.spreadWidth === undefined ? [] : [`spread width ${row.spreadWidth.toLocaleString('en-US', { maximumSignificantDigits: 3 })}`]),
    ...(mass ? [`${mass.count} of ${summary.n} at exactly ${signed(mass.value)}`] : []),
    sides(row, summary),
  ].join('·');
}

function AgreementRows({ rows }: { rows: PairedRow[] }) {
  return (
    <>
      <ShareKey />
      {rows.map((row, index) => (
        <div className="sce-mark__row" data-mark-key={row.key} data-selected={row.selected} key={row.key}>
          <span className="sce-mark__label">{row.label}</span>
          <ShareBar counts={counts(row.summary)} index={index} label={`${row.label}: ${sides(row, row.summary)}.`} />
          <p className="sce-mark__detail">{sides(row, row.summary)} · {respondents(row.summary.n)}</p>
        </div>
      ))}
    </>
  );
}

function SelectedDistribution({ value }: { value: PairedPresentation }) {
  const selected = value.rows.find((row) => row.selected);
  if (!selected || !value.distribution.length) return null;
  const values = value.distribution.map((point) => point.value);
  const domain = zeroDomain(values);
  const tails = `Respondents range from ${signed(values.reduce((a, b) => Math.min(a, b)))} to ${signed(values.reduce((a, b) => Math.max(a, b)))}`;
  return (
    <div className="sce-mark__row" data-selected-distribution>
      <span className="sce-mark__label">Every respondent’s difference for {selected.label}</span>
      <QuantileTrack
        domain={domain}
        label={`${selected.label}: ${spreadDetail(selected)}. ${tails}.`}
        marks={selected.summary}
        points={value.distribution}
      />
      <QuantileAxis domain={domain} label={AXIS_LABEL} />
      <p className="sce-mark__detail">{spreadDetail(selected)} · {tails}. Each line below the band is one exact value; its height is the respondents at that value.</p>
    </div>
  );
}

function AudienceSplit({ audience, pair }: { audience: Audience; pair: { from: string; to: string } }) {
  return (
    <div data-audience={audience.characteristic}>
      <span className="sce-finding__tag">By {audience.characteristic}</span>
      {audience.groups.map((group, index) => (
        <div className="sce-mark__row" data-mark-key={group.group_id} key={group.group_id}>
          <span className="sce-mark__label">{group.label}</span>
          <ShareBar counts={counts(group)} index={index} label={`${group.label}: ${sides(pair, group)}.`} />
          <p className="sce-mark__detail">{sides(pair, group)} · mean {signed(group.mean)} · {respondents(group.n)}</p>
        </div>
      ))}
      {audience.excluded_missing_label ? (
        <p className="sce-mark__detail">No {audience.characteristic} label: {respondents(audience.excluded_missing_label)}.</p>
      ) : null}
    </div>
  );
}

function QuantileRows({ rows }: { rows: PairedRow[] }) {
  const domain = zeroDomain(
    rows.flatMap(({ summary }) => [summary.p10, summary.p90, summary.mean, summary.point_mass?.value ?? 0]),
  );
  return (
    <>
      {rows.map((row, index) => (
        <div className="sce-mark__row" data-mark-key={row.key} data-selected={row.selected} key={row.key}>
          <span className="sce-mark__label">{row.label}</span>
          <QuantileTrack domain={domain} index={index} label={`${row.label}: ${spreadDetail(row)}.`} marks={row.summary} />
          <p className="sce-mark__detail">{spreadDetail(row)}</p>
        </div>
      ))}
      <QuantileAxis domain={domain} label={AXIS_LABEL} />
      <p className="sce-view__note">
        Band: middle 80% of respondents. Dark line: median. Ring: mean. Solid line: respondents at one exact value.
        Dashed line: no difference. The band shows how respondents differ; it is not uncertainty about the mean.
      </p>
    </>
  );
}

function OrderingNote({ rows }: { rows: PairedRow[] }) {
  const ordered = rows.some((row) => row.ordered);
  const named = rows.some((row) => !row.ordered);
  return (
    <p className="sce-view__note" data-ordering-note>
      {ordered ? 'Arrows mark adjacent steps in the verified numeric order of levels.' : ''}
      {named ? 'Named pairs are separate comparisons; no order between them is implied.' : ''}
    </p>
  );
}

function coverageText(coverage: Coverage): string {
  const excluded = coverage.exclusions.map((item) => `${item.count} ${EXCLUSIONS[item.reason] ?? item.reason}`);
  if (coverage.rows_without_id) excluded.push(`${coverage.rows_without_id} without an ID`);
  return `${coverage.eligible_respondents} of ${coverage.source_respondents} exported respondents compared`
    + (excluded.length ? `; excluded: ${excluded.join(',')}.` : '.');
}

function Evidence({ value }: { value: PairedPresentation }) {
  const agreement = value.id === REHOBOAM_PAIRED_AGREEMENT_VIEW_ID;
  return (
    <>
      <MarkStyles />
      {value.unavailable.map((reason) => (
        <p className="sce-view__note" data-unavailable={reason.code} key={reason.code}>
          This comparison is not available. It needs: {reason.prerequisite} {reason.next_step}
        </p>
      ))}
      {value.rows.length ? (agreement ? <AgreementRows rows={value.rows} /> : <QuantileRows rows={value.rows} />) : null}
      {value.rows.length ? <OrderingNote rows={value.rows} /> : null}
      <p className="sce-view__note" data-shortlist>
        {value.shown} of {value.total} tested comparisons shown.{value.bounded ? ` ${value.selectionRule}` : ''}
      </p>
      {agreement ? <SelectedDistribution value={value} /> : null}
      {agreement
        ? value.audiences
            .filter((audience) => audience.status === 'ok')
            .map((audience) => (
              <AudienceSplit audience={audience} key={audience.characteristic} pair={{ from: value.next.action.from_level, to: value.next.action.to_level }} />
            ))
        : null}
      <p className="sce-view__note" data-coverage>{coverageText(value.coverage)}</p>
    </>
  );
}

/**
 * Executive view of a Rehoboam `get_paired_findings` chart: the question, the
 * producer's finding and next comparison first, then who agrees, how tested
 * levels differ, or what the average conceals. An invalid view renders an
 * explicit error instead of a partial chart.
 */
export function RehoboamPairedView({ view, className, onPrepareComparison }: RehoboamPairedViewProps) {
  const adapted = useMemo(() => {
    try {
      return { ok: true as const, value: rehoboamPairedView(view) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    }
  }, [view]);
  if (!adapted.ok) {
    return (
      <>
        <EvidenceCoreStyles />
        <ViewError className={className} message={adapted.message} />
      </>
    );
  }
  const { value } = adapted;
  return (
    <FindingFrame
      className={className}
      finding={value.finding}
      kicker={KICKERS[value.id]}
      name={value.id.replace('/v1', '')}
      next={{
        label: value.next.label,
        rationale: value.next.rationale,
        onPrepare: onPrepareComparison ? () => onPrepareComparison(value.next.action) : undefined,
      }}
      notes={value.notes}
      objective={value.objective}
      provenance={value.provenance}
      question={value.question}
      runId={value.runId}
      warnings={value.warnings}
    >
      <Evidence value={value} />
    </FindingFrame>
  );
}
