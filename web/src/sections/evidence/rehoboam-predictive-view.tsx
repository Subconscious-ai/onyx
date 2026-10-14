'use client';

import { useMemo, useState } from 'react';
import { EffectIntervalPlot } from './effect-interval-plot';
import { rehoboamPredictiveView, type PredictivePresentation } from './rehoboam-predictive-adapter';
import { ViewError } from './rehoboam-view-kit';

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
// `|| 0` turns a rounded -0 into 0, so a tiny change never reads "-0.0 pp".
const points = (value: number) => {
  const rounded = Number((value * 100).toFixed(1)) || 0;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} pp`;
};

export function RehoboamPredictiveView({ result }: { result: unknown }) {
  const parsed = useMemo(() => {
    try { return { value: rehoboamPredictiveView(result) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [result]);
  if (!parsed.value) return <ViewError message={parsed.error ?? ''} />;
  const value = parsed.value;
  return <PredictiveStory key={`${value.runId}:${value.sourceSha}:${value.predictiveSha}`} value={value} />;
}

function PredictiveStory({ value }: { value: PredictivePresentation }) {
  const [selectedId, setSelectedId] = useState(value.rows[0].id);
  const selected = value.rows.find(row => row.id === selectedId)!;
  // Ranges from a saved fit that failed convergence are not shown.
  const ranges = value.status === 'POPULATION_CHECKS_PASS';
  const outside = value.rows.filter(row => !row.inside).length;
  const gap = Math.max(...value.rows.map(row => Math.abs(row.delta)));
  const reading = !ranges
    ? `Observed choice rates differ from the replicated means by up to ${(gap * 100).toFixed(1)} points`
    : outside
      ? `${outside} of ${value.rows.length} observed choice rates fall outside their predictive ranges`
      : `All ${value.rows.length} observed choice rates fall inside their predictive ranges`;
  return <section className="sce-predictive" data-evidence-view="saved-predictive" data-run-id={value.runId}>
    <style>{`
      .sce-predictive { color:var(--color); font-family:var(--font-display); container-type:inline-size; }
      .sce-predictive * { box-sizing:border-box; }
      .sce-predictive__kicker { font:11px/1.5 var(--font-mono); letter-spacing:.12em; text-transform:uppercase; margin:0 0 16px; }
      .sce-predictive h2 { font-size:clamp(28px,4.4cqi,48px); font-weight:400; line-height:1.07; letter-spacing:-.04em; margin:0; max-width:22ch; }
      .sce-predictive__reading { margin:20px 0; border-left:3px solid var(--red); padding-left:16px; max-width:75ch; font-size:clamp(18px,2.4cqi,22px); line-height:1.4; }
      .sce-predictive__legend { display:flex; flex-wrap:wrap; gap:12px 24px; font:12px/1.6 var(--font-mono); margin-bottom:12px; }
      .sce-predictive__ring { color:color-mix(in srgb,var(--red) 72%,var(--color)); }
      .sce-predictive__inspect { display:grid; grid-template-columns:minmax(180px,1fr) 2fr; gap:24px; border-block:1px solid color-mix(in srgb,var(--color) 24%,transparent); padding:24px 0; margin-top:24px; }
      .sce-predictive label { font:11px/1.6 var(--font-mono); }
      .sce-predictive select { display:block; width:100%; min-height:44px; margin-top:8px; border:0; border-bottom:1px solid var(--color); color:var(--color); background:var(--backgroundColor); font:16px var(--font-display); border-radius:0; }
      .sce-predictive :is(select,summary):focus-visible { outline:2px solid var(--color); outline-offset:4px; }
      .sce-predictive__detail { font-size:15px; line-height:1.6; }
      .sce-predictive__detail p { margin:0 0 8px; }
      .sce-predictive__detail strong { font:24px/1.4 var(--font-mono); }
      .sce-predictive__receipt { margin-top:24px; font-size:13px; line-height:1.6; overflow-wrap:anywhere; }
      .sce-predictive summary { cursor:pointer; min-height:44px; font:12px/1.6 var(--font-mono); }
      .sce-predictive code { font-size:11px; }
      @container (max-width:540px) { .sce-predictive__inspect { grid-template-columns:1fr; } }
    `}</style>
    <header>
      <p className="sce-predictive__kicker">Predictive check</p>
      <h2>How do observed and simulated choice rates compare?</h2>
    </header>
    <p className="sce-predictive__reading">{reading} across {value.tasks.toLocaleString('en-US')} held-out tasks.</p>
    <div className="sce-predictive__legend" aria-label="Chart encoding">
      <span className="sce-predictive__ring">○ Observed choice rate</span><span>● Mean replicated rate</span>{ranges ? <span>↔ Middle 95% of replicated rates</span> : null}
    </div>
    <EffectIntervalPlot title="Observed and replicated choices" rowHeader="Choice position" axisLabel="Share of held-out choices" domain={[0, 1]} showZeroLine={false} formatValue={percent} compactTable responsive showCoverage={false} showEstimateLabels={false}
      description="Each row is a position in the option list, not product."
      data={value.rows.map(row => ({ id: row.id, label: row.label, estimate: row.estimate, interval: ranges ? row.interval : undefined, referencePoint: { value: row.observed, label: 'Observed' } }))} />
    <div className="sce-predictive__inspect">
      <label>INSPECT A CHOICE POSITION<select aria-label="Predictive choice position" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
        {value.rows.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <div className="sce-predictive__detail" aria-live="polite" aria-atomic="true">
        <p><strong>{points(selected.delta)}</strong> observed minus mean replicated</p>
        <p>{selected.observedCount} of {value.tasks} observed choices ({percent(selected.observed)}). {ranges ? `Replicated range ${percent(selected.interval.lower)}–${percent(selected.interval.upper)}.` : `Replicated mean ${percent(selected.estimate)}.`}</p>
        <p>{ranges ? `${selected.inside ? 'Inside' : 'Outside'} the replicated range.` : 'Range unavailable'}</p>
      </div>
    </div>
    <details className="sce-predictive__receipt"><summary>Source</summary>
      <p>{value.trainingTasks} training tasks; {value.tasks} held-out tasks. {value.chains} chains × {value.drawsPerChain} retained draws per chain. No refit.</p>
      <p>Prediction accuracy {percent(value.accuracy)} · Log loss {value.logLoss.toFixed(4)}. {value.scope}.</p>
      <p>Study <code>{value.runId}</code></p><p>Source SHA-256 <code>{value.sourceSha}</code></p>
      <p>Split contract SHA-256 <code>{value.contractSha}</code></p><p>Replicated choices SHA-256 <code>{value.predictiveSha}</code></p>
    </details>
  </section>;
}
