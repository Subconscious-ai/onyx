import type { EvidenceInterval } from './types';

export type EvidenceValueFormatter = (value: number) => string;

export const defaultValueFormatter: EvidenceValueFormatter = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);

export function intervalName(interval: EvidenceInterval): string {
  if (interval.kind === 'producer-summary') return 'range';
  const level = interval.level === undefined ? '' : `${Math.round(interval.level * 100)}% `;
  return `${level}${interval.kind} interval`;
}

export function formatInterval(
  interval: EvidenceInterval | undefined,
  formatValue: EvidenceValueFormatter,
): string {
  if (!interval || interval.lower === null || interval.upper === null) return '';
  // A negative bound after an en dash reads as a double minus ("-4.1–-0.2"), so use "to".
  const joiner = interval.lower < 0 || interval.upper < 0 ? 'to' : '–';
  return `${formatValue(interval.lower)}${joiner}${formatValue(interval.upper)}`;
}

export function finiteValues(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value),
  );
}

export function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [-1, 1];
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) {
    const pad = Math.abs(low) * 0.2 || 1;
    return [low - pad, high + pad];
  }
  const pad = (high - low) * 0.08;
  return [low - pad, high + pad];
}
