const EVIDENCE_CORE_CSS = String.raw`
.sce-frame,
.sce-figure,
.sce-refutations {
  box-sizing: border-box;
  color: var(--color);
  background: var(--backgroundColor);
  font-family: var(--font-body);
  min-width: 0;
}

.sce-frame *,
.sce-figure *,
.sce-refutations * {
  box-sizing: border-box;
}

.sce-frame {
  border-top: 3px solid var(--color);
  border-bottom: 1px solid var(--hairline);
  padding-block: var(--sp-5);
}

.sce-frame__header {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--sp-4) var(--sp-7);
  align-items: start;
}

.sce-frame__question,
.sce-frame__label,
.sce-frame__status,
.sce-figure__eyebrow,
.sce-refutations__kind,
.sce-refutations__state,
.sce-audit__label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: var(--tracking-caps, 0.14em);
  line-height: var(--lh-body, 1.45);
  text-transform: uppercase;
}

.sce-frame__question {
  margin: 0 0 var(--sp-3);
}

.sce-frame__title {
  max-width: 22ch;
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-light, 300);
  letter-spacing: var(--tracking-h1, -0.045em);
  line-height: var(--lh-tight, 1);
  text-wrap: balance;
}

.sce-frame__status-wrap {
  justify-self: end;
  max-width: 28rem;
  border-top: 1px solid var(--color);
  padding-top: var(--sp-2);
}

.sce-frame__status {
  display: block;
}

.sce-frame__status-wrap[data-tone='signal'] {
  border-top-color: var(--red);
  color: var(--red);
}

.sce-frame__status-rationale,
.sce-frame__impact,
.sce-audit p,
.sce-audit li,
.sce-figure__summary,
.sce-overlap__warning,
.sce-refutations__detail {
  font-size: var(--fs-body);
  line-height: var(--lh-body, 1.45);
}

.sce-frame__status-rationale {
  margin: var(--sp-2) 0 0;
}

.sce-frame__answer {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--sp-5) var(--sp-7);
  margin-top: var(--sp-7);
  padding-block: var(--sp-4);
  border-block: 1px solid var(--hairline);
}

.sce-frame__label {
  display: block;
  margin-bottom: var(--sp-2);
}

.sce-frame__estimate {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-h2);
  letter-spacing: var(--tracking-h2, -0.025em);
  font-variant-numeric: tabular-nums;
}

.sce-frame__interval,
.sce-frame__basis {
  display: block;
  margin-top: var(--sp-1);
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  line-height: var(--lh-body, 1.45);
}

.sce-frame__impact {
  max-width: 52ch;
  margin: 0;
}

.sce-frame__visualization {
  margin-top: var(--sp-7);
}

.sce-frame__audit {
  margin-top: var(--sp-6);
  border-top: 1px solid var(--hairline);
}

.sce-frame__audit summary {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  list-style: none;
  cursor: pointer;
  padding-block: var(--sp-3);
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  letter-spacing: var(--tracking-caps, 0.14em);
  text-transform: uppercase;
}

.sce-frame__audit summary::-webkit-details-marker {
  display: none;
}

.sce-frame__audit summary::after {
  content: '+';
  flex: 0 0 24px;
  font-size: 14px;
  line-height: 1;
  text-align: center;
}

.sce-frame__audit[open] summary::after {
  content: '−';
}

.sce-frame__audit summary:focus-visible {
  outline: 2px solid var(--color);
  outline-offset: 2px;
}

.sce-audit {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--sp-6);
  padding-block: var(--sp-4) var(--sp-6);
}

.sce-audit h3 {
  margin: 0 0 var(--sp-3);
  font-family: var(--font-display);
  font-size: var(--fs-body);
  font-weight: var(--fw-regular, 400);
}

.sce-audit p,
.sce-audit ul {
  margin: 0;
}

.sce-audit ul {
  display: grid;
  gap: var(--sp-3);
  padding: 0;
  list-style: none;
}

.sce-audit__item {
  border-top: 1px solid var(--hairline);
  padding-top: var(--sp-2);
}

.sce-audit__item[data-tone='signal'] .sce-audit__label {
  color: var(--red);
}

.sce-audit__detail {
  display: block;
  margin-top: var(--sp-1);
}

.sce-audit__sources a {
  color: inherit;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

.sce-figure,
.sce-refutations {
  margin: 0;
  container-type: inline-size;
}

.sce-figure__header,
.sce-refutations__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sp-3);
  align-items: end;
  margin-bottom: var(--sp-4);
  border-bottom: 1px solid var(--color);
  padding-bottom: var(--sp-2);
}

.sce-figure__title,
.sce-refutations__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-light, 300);
  letter-spacing: var(--tracking-h2, -0.025em);
  line-height: var(--lh-tight, 1);
}

.sce-figure__scroll {
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline) transparent;
}

.sce-figure svg {
  display: block;
  width: 100%;
  min-width: 40rem;
  height: auto;
  color: var(--color);
}

.sce-effect-mark:focus {
  outline: none;
}

.sce-effect-mark .sce-effect-focus {
  fill: transparent;
  stroke: transparent;
  stroke-width: 2;
}

.sce-effect-mark:focus .sce-effect-focus {
  stroke: var(--color);
}

.sce-figure__summary {
  max-width: 72ch;
  margin: var(--sp-3) 0;
}

.sce-data-table {
  width: 100%;
  min-width: 38rem;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-variant-numeric: tabular-nums;
  text-align: left;
}

.sce-data-table-wrap {
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline) transparent;
}

.sce-figure__scroll:focus-visible,
.sce-data-table-wrap:focus-visible {
  outline: var(--focus-ring, 2px solid var(--color));
  outline-offset: var(--focus-ring-offset, 2px);
}

.sce-data-table th,
.sce-data-table td {
  border-top: 1px solid var(--hairline);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) 0;
  vertical-align: top;
}

.sce-data-table th {
  font-weight: var(--fw-regular, 400);
}

.sce-data-table thead th {
  font-size: 10px;
  letter-spacing: var(--tracking-caps, 0.14em);
  text-transform: uppercase;
}

.sce-data-table td:not(:first-child),
.sce-data-table th:not(:first-child) {
  text-align: right;
}

.sce-overlap__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--sp-3);
  margin-top: var(--sp-3);
  border-top: 1px solid var(--hairline);
  padding-top: var(--sp-3);
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-variant-numeric: tabular-nums;
}

.sce-overlap__warning {
  margin: var(--sp-3) 0 0;
  border-top: 1px solid var(--red);
  padding-top: var(--sp-2);
  color: var(--red);
}

.sce-refutations__primary {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) minmax(14rem, 2fr) auto;
  gap: var(--sp-4);
  align-items: center;
  padding-block: var(--sp-4);
  border-bottom: 3px solid var(--color);
}

.sce-refutations__primary-value,
.sce-refutations__value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.sce-refutations__primary-value {
  font-size: var(--fs-h2);
}

.sce-refutations__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.sce-refutations__row {
  display: grid;
  grid-template-columns: minmax(10rem, 1.2fr) minmax(14rem, 2fr) minmax(10rem, auto);
  gap: var(--sp-4);
  align-items: center;
  border-bottom: 1px solid var(--hairline);
  padding-block: var(--sp-3);
}

.sce-refutations__row[data-changed='true'] {
  border-bottom-color: var(--red);
}

.sce-refutations__label {
  display: block;
  margin-top: var(--sp-1);
  font-size: var(--fs-body);
  line-height: var(--lh-body, 1.45);
}

.sce-refutations__plot svg {
  display: block;
  width: 100%;
  min-width: 12rem;
  height: auto;
}

.sce-refutations__states {
  display: grid;
  gap: var(--sp-1);
  justify-items: end;
}

.sce-refutations__state[data-changed='true'] {
  color: var(--red);
}

.sce-refutations__detail {
  grid-column: 1 / -1;
  margin: 0;
}

.sce-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@container (max-width: 34rem) {
  .sce-frame__status-wrap {
    justify-self: stretch;
  }

  .sce-figure__header,
  .sce-refutations__header,
  .sce-refutations__primary,
  .sce-refutations__row {
    grid-template-columns: 1fr;
  }

  .sce-refutations__states {
    justify-items: start;
  }

  .sce-refutations__plot {
    overflow-x: auto;
  }
}
`;

/** React 19 hoists and deduplicates this style resource by href. */
export function EvidenceCoreStyles() {
  return (
    <style href="subconscious-evidence-core" precedence="medium">
      {EVIDENCE_CORE_CSS}
    </style>
  );
}
