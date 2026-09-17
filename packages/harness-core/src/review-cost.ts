/**
 * review-cost-ledger T1/FR-1/A1 (ADR-001 п.1): a pure parser for the qe-bridge reviewer's own cost
 * receipt — the last non-empty line of the Claude CLI's raw stdout, which (for every observed
 * signoff) is a JSON object carrying `total_cost_usd`, `usage.*`, `duration_ms`, `num_turns`.
 *
 * Deliberately narrow and honest: absence of a price is never silently read as a price of zero.
 * `status:'absent'` (no non-empty line at all) and `status:'unparseable'` (a line that IS present
 * but does not parse into a usable cost) are each their own outcome — never collapsed into `ok`, and
 * never guessed. This module owns no filesystem access (NFR-2): the caller (the cli) reads the
 * stdout sidecar file and hands its TEXT in here.
 */

/** The four cost-bearing token components, plus their sum. `tokensPartial` is present (`true`) only
 *  when at least one component was missing/unusable in the source JSON and was substituted with 0 —
 *  never silently blended with a genuine zero. */
export interface QeBridgeCostTokens {
  readonly input: number;
  readonly output: number;
  readonly cacheCreation: number;
  readonly cacheRead: number;
  readonly total: number;
  readonly tokensPartial?: true;
}

/**
 * `ok` — a usable price was found. `absent` — no non-empty line to read at all (an empty/whitespace
 * stdout, or a caller who never had one to offer); `reason` is OPTIONAL here because the parser
 * itself never has anything more specific to say about a literal absence, but a CALLER (the cli's
 * `readQeBridgeCostSidecar`, T3) may attach its own known reason to a synthesized `absent` (e.g. "no
 * qe-bridge signoff for this round") without inventing a THIRD status for that case. `unparseable` —
 * a non-empty last line existed but did not yield a valid cost (not JSON, not an object, no numeric
 * `total_cost_usd`, or a negative/NaN one) — `reason` is mandatory here, naming what failed.
 */
export type QeBridgeCost =
  | {
      readonly status: 'ok';
      readonly costUsd: number;
      readonly tokens: QeBridgeCostTokens;
      readonly durationMs: number | null;
      readonly numTurns: number | null;
    }
  | { readonly status: 'absent'; readonly reason?: string }
  | { readonly status: 'unparseable'; readonly reason: string };

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** fix-round-1 #6 (Codex r1 HIGH #6): a token COMPONENT is a count, never a measurement — it is only
 *  ever trustworthy as a nonnegative SAFE integer. `1e308` is `typeof 'number'` and finite, but adding
 *  four of those silently produces `Infinity` (which then serializes to `null` on the ledger row while
 *  the in-memory type still claims `number`); a fractional or >2^53 value is likewise not a real token
 *  count. Distinct from "component ABSENT" (undefined — stays the existing partial-with-zero path). */
function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * `text` is the full raw stdout of a qe-bridge reviewer invocation (Claude CLI, `--output-format
 * json`-shaped result line). The COST line is always the LAST non-empty line — Claude CLI streams
 * intermediate events first and finishes with one `type:"result"` object carrying the run's totals.
 */
export function parseQeBridgeStdoutCost(text: string): QeBridgeCost {
  const lines = text.split('\n');
  let lastLine = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i]!.trim();
    if (candidate !== '') { lastLine = candidate; break; }
  }
  if (lastLine === '') return { status: 'absent' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(lastLine);
  } catch (error) {
    return { status: 'unparseable', reason: `last non-empty line is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'unparseable', reason: 'last non-empty line did not parse to a JSON object' };
  }
  const rec = parsed as Record<string, unknown>;
  const totalCostUsd = rec['total_cost_usd'];
  if (!finiteNonNegative(totalCostUsd)) {
    return {
      status: 'unparseable',
      reason: typeof totalCostUsd === 'number'
        ? `total_cost_usd is not a finite non-negative number: ${totalCostUsd}`
        : `total_cost_usd field is missing or not a number (got ${JSON.stringify(totalCostUsd)})`,
    };
  }

  const usageRaw = rec['usage'];
  const usage = typeof usageRaw === 'object' && usageRaw !== null && !Array.isArray(usageRaw)
    ? (usageRaw as Record<string, unknown>)
    : {};
  let tokensPartial = false;
  // fix-round-1 #6: a MISSING component (undefined) is the pre-existing partial-with-zero case
  // (never touched by this fix); a PRESENT-but-invalid component (adversarial: 1e308, a fraction,
  // 2^53+1, negative, NaN) is a different failure — the whole result turns `unparseable` rather than
  // silently zeroing a value that was actually there. `invalidComponent` names which key failed.
  let invalidComponent: string | null = null;
  const component = (key: string): number => {
    const value = usage[key];
    if (value === undefined) { tokensPartial = true; return 0; }
    if (safeNonNegativeInteger(value)) return value;
    invalidComponent = key;
    return 0;
  };
  const input = component('input_tokens');
  const output = component('output_tokens');
  const cacheCreation = component('cache_creation_input_tokens');
  const cacheRead = component('cache_read_input_tokens');
  if (invalidComponent !== null) {
    return { status: 'unparseable', reason: `usage.${invalidComponent} is not a nonnegative safe integer: ${JSON.stringify(usage[invalidComponent])}` };
  }
  const total = input + output + cacheCreation + cacheRead;
  if (!Number.isSafeInteger(total)) {
    return { status: 'unparseable', reason: `token total ${total} exceeds Number.MAX_SAFE_INTEGER — not a trustworthy count` };
  }

  return {
    status: 'ok',
    costUsd: totalCostUsd,
    tokens: {
      input,
      output,
      cacheCreation,
      cacheRead,
      total,
      ...(tokensPartial ? { tokensPartial: true as const } : {}),
    },
    durationMs: finiteNumberOrNull(rec['duration_ms']),
    numTurns: finiteNumberOrNull(rec['num_turns']),
  };
}
