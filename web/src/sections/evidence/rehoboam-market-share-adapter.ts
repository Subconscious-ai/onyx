import {
  envelope,
  fail as failView,
  finite as finiteOf,
  isRecord,
  provenanceOf,
  text as textOf,
  warningsOf,
  type RehoboamProvenanceEntry,
} from './rehoboam-shared';

/** Rehoboam attaches this view to the `market_shares` chart of `get_market_share`. */
export const REHOBOAM_MARKET_SHARE_VIEW_ID = 'market-share/v1';

const VIEW = 'market share';
// Explicitly typed so TypeScript treats calls as assertions.
const fail: (message: string) => never = (message) => failView(VIEW, message);
const text = (value: unknown, field: string) => textOf(VIEW, value, field);
const finite = (value: unknown, field: string) => finiteOf(VIEW, value, field);

/** Shares are probabilities that must sum to 1; allow float rounding only. */
const SUM_TOLERANCE = 1e-6;

export type ScenarioProduct = Record<string, string>;

export interface ScenarioShare {
  /** Stable letter shown on the strip and the product card. */
  letter: string;
  levels: ScenarioProduct;
  /** Average predicted choice probability, 0 to 1. */
  share: number;
}

export interface RehoboamMarketShareView {
  runId: string;
  title: string;
  respondents: number | null;
  attributes: string[];
  products: ScenarioShare[];
  /** Share choosing none of the products, when the design includes an opt-out. */
  optOut: number | null;
  warnings: string[];
  provenance: RehoboamProvenanceEntry[];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validate a Rehoboam market-share view. Throws on unknown units,
 * probabilities outside 0 to 1, shares that do not sum to 1, products that
 * omit or add attributes, more than one opt-out and missing warnings.
 */
export function rehoboamMarketShareView(view: unknown): RehoboamMarketShareView {
  const { result, data, runId } = envelope(VIEW, view, REHOBOAM_MARKET_SHARE_VIEW_ID, 'get_market_share');
  if (data.units !== 'choice_probability') fail(`unknown units ${String(data.units)}`);
  const warnings = warningsOf(VIEW, data);
  if (!Array.isArray(data.product_market_shares) || data.product_market_shares.length === 0) {
    fail('product_market_shares is missing');
  }

  let optOut: number | null = null;
  let attributes: string[] | null = null;
  const products: ScenarioShare[] = [];
  let total = 0;
  data.product_market_shares.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) fail(`product_market_shares[${index}] is not an object`);
    const share = finite(entry.predicted_market_share, `product_market_shares[${index}].predicted_market_share`);
    if (share < 0 || share > 1) fail(`share ${index} lies outside 0 to 1`);
    total += share;
    if (entry.product === 'opt_out') {
      if (optOut !== null) fail('more than one opt-out');
      optOut = share;
      return;
    }
    if (!isRecord(entry.product)) fail(`product ${index} is not a configuration`);
    const levels: ScenarioProduct = {};
    for (const [attribute, level] of Object.entries(entry.product)) {
      levels[text(attribute, `product ${index} attribute`)] = text(level, `product ${index} ${attribute}`);
    }
    const keys = Object.keys(levels);
    if (attributes === null) attributes = keys;
    else if (keys.length !== attributes.length || !attributes.every((key) => key in levels)) {
      fail(`product ${index} does not specify the same attributes`);
    }
    products.push({ letter: LETTERS[products.length] ?? String(products.length + 1), levels, share });
  });
  if (products.length === 0) fail('no products');
  if (Math.abs(total - 1) > SUM_TOLERANCE) fail(`shares sum to ${total.toFixed(6)}, not 1`);

  const size = data['Segment Size'];
  return {
    runId,
    title: 'Scenario share of choice',
    respondents: typeof size === 'number' && Number.isFinite(size) ? size : null,
    attributes: attributes ?? [],
    products,
    optOut,
    warnings,
    provenance: provenanceOf(result),
  };
}
