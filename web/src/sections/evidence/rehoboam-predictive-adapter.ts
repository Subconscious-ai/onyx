export const REHOBOAM_PREDICTIVE_VIEW_ID = 'saved-predictive/v1';

function fail(message: string): never { throw new Error(`Saved predictive view: ${message}`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('missing result fields');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) fail('missing label');
  return value;
}
function number(value: unknown, low = 0, high = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) fail('invalid numeric value');
  return value;
}
function count(value: unknown, low = 1): number {
  const result = number(value, low, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(result)) fail('invalid count');
  return result;
}
function hash(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/.test(result)) fail('missing SHA-256 revision');
  return result;
}

/** The only reading of a saved predictive check this view knows how to present. */
function assertMeaning(data: Record<string, unknown>, evaluation: Record<string, unknown>): void {
  const expected: Array<[unknown, unknown]> = [
    [data.status, 'ok'],
    [data.calculation_version, 'saved-choice-predictive-v1'],
    [data.unit, 'choice_rate'],
    [data.interval_kind, 'replicated_choice_rate_quantile'],
    [data.interval_level, .95],
    [data.conditioning, 'saved_respondents'],
    [data.refitted, false],
    [evaluation.split, 'held_out_tasks'],
  ];
  if (expected.some(([actual, required]) => actual !== required)) fail('unsupported predictive meaning');
}

function rangeOf(bounds: unknown): { lower: number; upper: number } {
  if (!Array.isArray(bounds) || bounds.length !== 2) fail('missing predictive range');
  const lower = number(bounds[0]), upper = number(bounds[1]);
  if (lower > upper) fail('reversed predictive range');
  return { lower, upper };
}

function rowOf(item: unknown, tasks: number) {
  const row = object(item);
  const position = count(row.alternative);
  const observed = number(row.observed_rate);
  const observedCount = count(row.observed_count, 0);
  const estimate = number(row.replicated_rate_mean);
  const { lower, upper } = rangeOf(row.replicated_rate_interval95);
  if (Math.abs(observedCount / tasks - observed) > 1e-10) fail('observed count mismatch');
  const delta = number(row.observed_minus_replicated, -1, 1);
  if (Math.abs(observed - estimate - delta) > 1e-10
    || row.observed_in_interval !== (observed >= lower && observed <= upper)) fail('inconsistent producer comparison');
  return { id: String(position), label: `Choice position ${position}`, observed, observedCount, estimate,
    interval: { lower, upper, level: .95, kind: 'quantile' as const },
    inside: row.observed_in_interval as boolean, delta };
}

function rowsOf(rates: unknown, tasks: number) {
  if (!Array.isArray(rates) || rates.length < 2 || rates.length > 20) fail('missing choice positions');
  const rows = rates.map((item) => rowOf(item, tasks));
  if (new Set(rows.map(row => row.id)).size !== rows.length
    || rows.reduce((sum, row) => sum + row.observedCount, 0) !== tasks
    || Math.abs(rows.reduce((sum, row) => sum + row.estimate, 0) - 1) > 1e-8) fail('incomplete choice totals or identities');
  return rows;
}

export function rehoboamPredictiveView(input: unknown) {
  const result = object(input);
  if (result.operation !== 'get_community_bayesian_check') fail('unsupported operation');
  const data = object(result.data);
  const evaluation = object(data.evaluation);
  assertMeaning(data, evaluation);
  const tasks = count(data.tasks);
  if (count(evaluation.held_out_tasks) !== tasks) fail('evaluation denominator mismatch');
  const rows = rowsOf(data.alternative_rates, tasks);
  if (!Array.isArray(data.warnings) || !data.warnings.length) fail('missing producer limitations');
  const status = text(data.diagnostic_status);
  if (!['NOT_VALIDATED', 'POPULATION_CHECKS_PASS'].includes(status)) fail('unsupported diagnostic status');
  return {
    rows, tasks, status,
    runId: text(result.run_id), sourceSha: hash(object(result.provenance).source_manifest_sha256),
    contractSha: hash(evaluation.contract_sha256), predictiveSha: hash(data.replicated_choice_sha256),
    trainingTasks: count(evaluation.training_tasks), chains: count(data.chains), drawsPerChain: count(data.predictive_draws_per_chain),
    scope: text(data.diagnostic_scope), identity: text(data.alternative_identity),
    warnings: data.warnings.map(text), accuracy: number(data.accuracy), logLoss: number(data.log_loss, 0, Number.MAX_VALUE),
  };
}

export type PredictivePresentation = ReturnType<typeof rehoboamPredictiveView>;
