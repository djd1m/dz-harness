/**
 * Learned cost-optimal model routing (feature learned-cost-routing, ADR-001) — the `auto-cost` spec.
 *
 * A per-stage model router that learns which model actually SUCCEEDS at a stage (fewest retries = lowest true
 * cost). The SELECTOR is PURE over an injected store snapshot (mirrors the shipped rUv `MetaHarnessRouter`,
 * `open-claude-code/v2/src/optimize/router.mjs`: cheapest model clearing a 0.7 success bar, else a cheapest-
 * first chain for escalate-on-fail — the `cve-bench/.../model-chain.mjs` pattern). The store is a thin JSON
 * layer under `.dz/` (top-level ESM fs; a lazy require() is undefined at runtime — the R1 footgun).
 *
 * Storage is JSON, not SQLite: `better-sqlite3` is not a harness-core dep, `.dz/` already persists JSON state,
 * and the grounded reference is emphatically zero-dependency (ADR-073 "pure-TS path is dependency-free").
 *
 * SAFETY PROPERTIES (ADR-001, load-bearing, each pinned by a test):
 *   1. §3 — `selectAutoCost('qe', …, {family})` ranks ONLY the cross-family of the coder → a model that wrote
 *      code can NEVER self-QE (the named cross-model-QE invariant).
 *   2. §2 — a stage that PRODUCED an artifact but FAILED the downstream gate is recorded as a FAILURE at its
 *      key (`finalizeOutcome(..., false)`), down-ranking that model — success ≠ "returned something".
 *   3. §1 — the same store snapshot yields the same pick (deterministic); no `auto-cost` spec ⇒ nothing here
 *      is touched (byte-identical, opt-in).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type Family = 'claude' | 'openai';

export interface ModelRung {
  readonly id: string;
  readonly costRank: number; // coarse relative ordering (ESTIMATE from conservative public list prices), NOT a $/tok metric
  readonly family: Family;
}

/**
 * KNOWN model set, cheapest→dearest. `costRank` is a COARSE relative ordering (an estimate from conservative
 * public list prices — the router.mjs precedent, "not fabricated metrics"); only the ORDER is load-bearing.
 * gpt-5.6-ready: adding a rung is a data-only edit. Kept consistent with KNOWN_CODEX / CLAUDE_NAMES in
 * feature-adr-routing.ts.
 */
export const COST_LADDER: readonly ModelRung[] = Object.freeze([
  Object.freeze({ id: 'haiku', costRank: 1, family: 'claude' as Family }),
  Object.freeze({ id: 'fable', costRank: 1, family: 'claude' as Family }),
  Object.freeze({ id: 'gpt-5.5', costRank: 2, family: 'openai' as Family }),
  Object.freeze({ id: 'sonnet', costRank: 2, family: 'claude' as Family }),
  Object.freeze({ id: 'gpt-5.6', costRank: 3, family: 'openai' as Family }),
  Object.freeze({ id: 'gpt-5.6-sol', costRank: 3, family: 'openai' as Family }),
  Object.freeze({ id: 'opus', costRank: 4, family: 'claude' as Family }),
]);

export interface OutcomeStats {
  readonly attempts: number;
  readonly successes: number;
  readonly successRate: number; // successes/attempts, 0 when no attempts
}
export type StatsFor = (model: string) => OutcomeStats;

export interface AutoCostOpts {
  readonly ladder?: readonly ModelRung[]; // the probe-filtered live set (FR-7); default COST_LADDER
  readonly qualityBar?: number; // default 0.7
  readonly minSamples?: number; // default 3 — below this, no learned trust (cold-start)
  readonly family?: Family; // FR-6: restrict the ladder to this family (qe → cross-family of the coder)
}

export interface AutoCostPick {
  readonly model: string; // the model to dispatch NOW
  readonly chain: readonly string[]; // cheapest-first order for escalate-on-fail (FR-5)
  readonly evidence: string; // for modelsUsed (FR-8)
  readonly metBar: boolean; // true = a learned model cleared the bar; false = cold-start / none cleared
}

const DEFAULT_BAR = 0.7;
const DEFAULT_MIN_SAMPLES = 3;

/** Cheapest-first, deterministic order: by costRank, tie-broken by id (stable). */
function orderedLadder(ladder: readonly ModelRung[], family?: Family): ModelRung[] {
  return ladder
    .filter((r) => family === undefined || r.family === family)
    .slice()
    .sort((a, b) => a.costRank - b.costRank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * PURE selection (ADR §1). Strategy (b), bar 0.7: pick the CHEAPEST model that has ≥`minSamples` attempts AND
 * a learned success-rate ≥ bar at this key; if NONE has proven itself, return the cheapest rung (cold-start)
 * with the full cheapest-first `chain` so the caller escalates on real failure (never a pre-emptive jump to a
 * dear model). Deterministic given the snapshot. `family` restricts the ladder (qe cross-family guard).
 */
export function selectAutoCost(stage: string, tier: string, statsFor: StatsFor, opts: AutoCostOpts = {}): AutoCostPick {
  const bar = opts.qualityBar ?? DEFAULT_BAR;
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES;
  const rungs = orderedLadder(opts.ladder ?? COST_LADDER, opts.family);
  const chain = rungs.map((r) => r.id);
  if (rungs.length === 0) {
    return { model: '', chain: [], evidence: `auto-cost(${stage}/${tier}): no candidate models`, metBar: false };
  }
  // Pass 1 — a PROVEN-GOOD model (≥minSamples, rate ≥ bar): cheapest wins.
  for (const r of rungs) {
    const s = statsFor(r.id);
    if (s.attempts >= minSamples && s.successRate >= bar) {
      const pct = (s.successRate * 100).toFixed(0);
      return { model: r.id, chain, evidence: `${r.id} (auto-cost: ${pct}% / ${s.attempts} runs @ ${stage}/${tier})`, metBar: true };
    }
  }
  // Pass 2 — cross-run escalate-on-fail: SKIP a KNOWN-BAD rung (enough samples, rate < bar) so a repeatedly
  // failing cheapest model is not re-selected forever. Pick the cheapest rung that is untried-or-thin.
  const isKnownBad = (id: string): boolean => {
    const s = statsFor(id);
    return s.attempts >= minSamples && s.successRate < bar;
  };
  for (const r of rungs) {
    if (!isKnownBad(r.id)) {
      const s = statsFor(r.id);
      const note = s.attempts > 0 ? `${s.successes}/${s.attempts} so far` : 'untried';
      return { model: r.id, chain, evidence: `${r.id} (auto-cost: cold-start [${note}], chain ${chain.join('→')} @ ${stage}/${tier})`, metBar: false };
    }
  }
  // Pass 3 — every rung is known-bad: fall back to the LEAST-bad (highest rate, tie → cheapest via stable order).
  const leastBad = [...rungs].sort((a, b) => statsFor(b.id).successRate - statsFor(a.id).successRate)[0]!;
  const lb = statsFor(leastBad.id);
  return { model: leastBad.id, chain, evidence: `${leastBad.id} (auto-cost: all rungs under bar; least-bad ${(lb.successRate * 100).toFixed(0)}% @ ${stage}/${tier})`, metBar: false };
}

/** The next rung after a failed model in the chain (FR-5 escalate-on-fail); null at the top. */
export function nextInChain(chain: readonly string[], failedModel: string): string | null {
  const i = chain.indexOf(failedModel);
  if (i === -1 || i >= chain.length - 1) return null;
  return chain[i + 1] ?? null;
}

// ── JSON store (thin I/O; never throws → the caller degrades to the default model loudly) ────────────────

export interface OutcomeRow { attempts: number; successes: number; provisional?: number }
export interface OutcomeStore { readonly rows: Record<string, OutcomeRow> }

export const ROUTING_OUTCOMES_PATH = '.dz/routing-outcomes.json';
const keyOf = (stage: string, tier: string, model: string): string => `${stage}|${tier}|${model}`;

/** Load the outcome store; absent/corrupt/unreadable → empty (never throws). */
export function loadOutcomes(repoRoot: string): OutcomeStore {
  try {
    const p = join(repoRoot, ROUTING_OUTCOMES_PATH);
    if (!existsSync(p)) return { rows: {} };
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object') return { rows: {} };
    const rows = (parsed as { rows?: unknown }).rows;
    if (rows === null || typeof rows !== 'object') return { rows: {} };
    // sanitize: keep only well-formed numeric rows
    const clean: Record<string, OutcomeRow> = {};
    for (const [k, v] of Object.entries(rows as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const r = v as Record<string, unknown>;
        // Number.isFinite rejects Infinity/NaN (1e400 JSON-parses to Infinity, which is a number ≥ 0 and would
        // otherwise pass, then Infinity/Infinity → NaN poisons successRate). Floor to a non-negative integer.
        const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
        const a = num(r.attempts);
        const s = Math.min(num(r.successes), a);
        clean[k] = { attempts: a, successes: s, ...(typeof r.provisional === 'number' && Number.isFinite(r.provisional) && r.provisional >= 0 ? { provisional: Math.floor(r.provisional) } : {}) };
      }
    }
    return { rows: clean };
  } catch {
    return { rows: {} };
  }
}

/** Build the injected StatsFor for a (stage, tier) from a loaded snapshot. PURE. */
export function statsForKey(store: OutcomeStore, stage: string, tier: string): StatsFor {
  return (model: string): OutcomeStats => {
    const r = store.rows[keyOf(stage, tier, model)];
    if (!r || r.attempts <= 0) return { attempts: 0, successes: 0, successRate: 0 };
    return { attempts: r.attempts, successes: r.successes, successRate: r.successes / r.attempts };
  };
}

function writeStore(repoRoot: string, store: OutcomeStore): void {
  try {
    const p = join(repoRoot, ROUTING_OUTCOMES_PATH);
    mkdirSync(dirname(p), { recursive: true });
    // Atomic write: a temp file + rename can't leave a half-written/corrupt store if the process dies mid-write
    // (rename is atomic on the same filesystem). Cross-PROCESS concurrent writers can still lose an update —
    // that is an accepted degradation (the feature-adr workflow records sequentially; see architecture/degradations.md).
    const tmp = p + '.tmp-' + process.pid;
    writeFileSync(tmp, JSON.stringify({ rows: store.rows }, null, 2) + '\n');
    try {
      renameSync(tmp, p);
    } catch (e) {
      // rename failed (e.g. dest is a directory / cross-device) — do NOT orphan the temp file (QE #4).
      try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
      throw e;
    }
  } catch {
    /* non-blocking: learning is advisory */
  }
}

/**
 * Record a PROVISIONAL outcome (i): the stage produced a non-empty artifact / did not die. Bumps `provisional`
 * and, for a gate-less stage, this weak signal counts toward attempts+successes (weak-provisional decision).
 * `weakCredit=false` for gated stages — the real (ii) credit lands in finalizeOutcome.
 */
export function recordProvisional(repoRoot: string, stage: string, tier: string, model: string, weakCredit = false): void {
  const store = loadOutcomes(repoRoot);
  const k = keyOf(stage, tier, model);
  const r = store.rows[k] ?? { attempts: 0, successes: 0 };
  const next: OutcomeRow = { attempts: r.attempts + (weakCredit ? 1 : 0), successes: r.successes + (weakCredit ? 1 : 0), provisional: (r.provisional ?? 0) + 1 };
  writeStore(repoRoot, { rows: { ...store.rows, [k]: next } });
}

/**
 * Finalize the AUTHORITATIVE outcome (ii) from the downstream gate, attributed back to the (stage, model)
 * that produced the artifact. A produced-but-gate-FAILED run records a FAILURE (attempts+1, successes+0) —
 * success is NOT "returned something" (ADR §2, load-bearing).
 */
export function finalizeOutcome(repoRoot: string, stage: string, tier: string, model: string, success: boolean): void {
  const store = loadOutcomes(repoRoot);
  const k = keyOf(stage, tier, model);
  const r = store.rows[k] ?? { attempts: 0, successes: 0 };
  const next: OutcomeRow = { attempts: r.attempts + 1, successes: r.successes + (success ? 1 : 0), ...(r.provisional !== undefined ? { provisional: r.provisional } : {}) };
  writeStore(repoRoot, { rows: { ...store.rows, [k]: next } });
}

/** Human-readable learned table for `dz routing`. Deterministic (sorted). */
export function renderOutcomes(store: OutcomeStore, filterStage?: string): string {
  const keys = Object.keys(store.rows).sort();
  const shown = keys.filter((k) => filterStage === undefined || k.startsWith(filterStage + '|'));
  if (shown.length === 0) return filterStage ? `No learned routing outcomes for stage "${filterStage}".` : 'No learned routing outcomes yet (auto-cost has not run, or no gate has resolved).';
  const lines = ['Learned routing outcomes (what `auto-cost` currently believes):', ''];
  let lastStage = '';
  for (const k of shown) {
    const r = store.rows[k];
    if (!r) continue;
    const [stage = '', tier = '', model = ''] = k.split('|');
    if (stage !== lastStage) { lines.push(`## ${stage}`); lastStage = stage; }
    const rate = r.attempts > 0 ? ((r.successes / r.attempts) * 100).toFixed(0) + '%' : 'n/a';
    const prov = r.provisional ? `, ${r.provisional} provisional` : '';
    lines.push(`  ${tier.padEnd(3)} ${model.padEnd(14)} ${rate.padStart(4)} (${r.successes}/${r.attempts} gated${prov})`);
  }
  return lines.join('\n');
}
