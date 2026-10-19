'use client';

import type { ReactNode } from 'react';
import type { RehoboamProvenanceEntry } from './rehoboam-shared';
import { RehoboamAudit, RehoboamViewStyles } from './rehoboam-view-kit';
import { EvidenceCoreStyles } from './styles';

const FRAME_STYLES = `
.sce-finding { color: var(--color); container-type: inline-size; overflow-wrap: anywhere; }
.sce-finding__kicker, .sce-finding__tag { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 var(--sp-2); }
.sce-finding__tag { display: block; margin-bottom: 4px; }
.sce-finding__question { font-size: 16px; line-height: 1.45; margin: 0 0 var(--sp-4); max-width: 64ch; }
.sce-finding__lead { margin: 0 0 var(--sp-4); font-size: clamp(20px, 3.4cqi, 30px); font-weight: 500; line-height: 1.2; letter-spacing: -0.02em; max-width: 34ch; }
.sce-finding__gap, .sce-finding__next { border-top: 1px solid var(--hairline); padding-block: var(--sp-3); max-width: 72ch; font-size: 14px; line-height: 1.5; }
.sce-finding :is(.sce-finding__gap, .sce-finding__next) p { margin: 0 0 var(--sp-2); }
.sce-finding__gap dl { margin: 0; display: grid; grid-template-columns: minmax(0, max-content) 1fr; gap: 4px var(--sp-3); }
.sce-finding__gap dt { font-weight: 600; }
.sce-finding__gap dd { margin: 0; }
.sce-finding__next strong { display: block; font-size: 16px; }
.sce-finding__action { font: inherit; font-size: 14px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--color); border-radius: var(--radius-control); background: var(--color); color: var(--backgroundColor); cursor: pointer; }
.sce-finding__action:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
.sce-finding__evidence { border-top: 1px solid var(--hairline); padding-block: var(--sp-3); }
.sce-finding__warnings { margin: var(--sp-3) 0; padding-left: 1.2em; font-size: 13px; line-height: 1.45; max-width: 64ch; }
@container (max-width: 480px) { .sce-finding__gap dl { grid-template-columns: 1fr; } }
`;

export interface FindingObjective {
  /** False when the requested business outcome goes beyond what was measured. */
  supported: boolean;
  statement: string;
  missing: Array<{ name: string; description: string }>;
}

export interface FindingNext {
  label: string;
  rationale: string;
  /** Omit to show the comparison as evidence only, with no button. */
  onPrepare?: () => void;
}

export interface FindingFrameProps {
  /** Value of `data-evidence-view`. */
  name: string;
  runId: string;
  className?: string;
  kicker: string;
  /** The Study's own question, when one was recorded. */
  question: string | null;
  /** The producer's measured conclusion, shown verbatim. */
  finding: string;
  objective: FindingObjective;
  next: FindingNext;
  /** The evidence: marks, counts and coverage. */
  children: ReactNode;
  notes: string[];
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

const inputName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replaceAll('_', '');

function ObjectiveGap({ objective }: { objective: FindingObjective }) {
  return (
    <div className="sce-finding__gap" data-finding-objective={objective.supported ? 'supported' : 'needs-inputs'}>
      <p>{objective.statement}</p>
      {objective.missing.length ? (
        <>
          <span className="sce-finding__tag">Business inputs still needed</span>
          <dl>
            {objective.missing.map((input) => (
              <div data-missing-input={input.name} key={input.name} style={{ display: 'contents' }}>
                <dt>{inputName(input.name)}</dt>
                <dd>{input.description}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  );
}

function NextComparison({ next }: { next: FindingNext }) {
  return (
    <div className="sce-finding__next" data-finding-next>
      <span className="sce-finding__tag">Next comparison</span>
      <p><strong>{next.label}</strong></p>
      <p>{next.rationale}</p>
      {next.onPrepare ? (
        <>
          <button className="sce-finding__action" onClick={next.onPrepare} type="button">
            Open comparison draft
          </button>
          <p className="sce-view__note">Opens an editable draft. Nothing runs until you run it.</p>
        </>
      ) : null}
    </div>
  );
}

/**
 * The frame every finding view shares: the question asked, the measured
 * finding, how far the finding goes toward the objective, the next comparison,
 * then the evidence and its limits. The host owns what the action does.
 */
export function FindingFrame(props: FindingFrameProps) {
  return (
    <section
      className={['sce-finding', props.className].filter(Boolean).join('')}
      data-evidence-view={props.name}
      data-run-id={props.runId}
    >
      <RehoboamViewStyles />
      <EvidenceCoreStyles />
      <style>{FRAME_STYLES}</style>
      <p className="sce-finding__kicker">{props.kicker}</p>
      {props.question ? (
        <p className="sce-finding__question" data-finding-question>
          <span className="sce-finding__tag">Question asked</span>
          {props.question}
        </p>
      ) : null}
      <h2 className="sce-finding__lead">{props.finding}</h2>
      <ObjectiveGap objective={props.objective} />
      <NextComparison next={props.next} />
      <div className="sce-finding__evidence">{props.children}</div>
      {props.notes.map((note) => <p className="sce-view__note" key={note}>{note}</p>)}
      <RehoboamAudit provenance={props.provenance} warnings={props.warnings} />
    </section>
  );
}
