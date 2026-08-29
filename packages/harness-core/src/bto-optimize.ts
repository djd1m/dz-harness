/**
 * Hold-out validated skill optimization (feature bto-optimize-holdout, ADR-001).
 *
 * Strengthens the EXISTING `/bto-optimize` skill from within with dspy-MIPROv2 rigor (grounded in the shipped
 * `dspy.ts/src/optimize/miprov2.ts`: propose → minibatch-tune → validate on held-out → best). The current BTO
 * loop selects the highest score on the SAME eval it tuned on — which games the LLM judge panel (Goodhart).
 * This engine adds what it lacks: a deterministic tune/holdout split, a hard budget cap, a weakest-dimension
 * objective, and a **no-regress-on-HOLD-OUT** winner selector. All functions are PURE over injected judge
 * scores + text (no LLM, no clock, no random); candidate-prose generation and judging stay skill-side.
 *
 * SAFETY PROPERTIES (ADR-001, load-bearing, each pinned by a test):
 *   1. §2 — `selectWinner` accepts a candidate ONLY on the HOLD-OUT scores (weakest dim improves + no other
 *      dim / the aggregate regresses beyond `tolerance`). A candidate that wins on `tune` but regresses on
 *      `holdout` is REJECTED — this defeats judge-gaming. `tune` never decides acceptance.
 *   2. §? — `budgetPlan` NEVER returns a plan exceeding `maxJudgeRuns`: it shrinks candidates/rounds to fit
 *      and reports what it trimmed, so the loop can never run a surprise-cost number of judge passes.
 *   3. §3 — the engine NEVER writes a file (only renders a diff + returns a decision); `proseScopeOk` rejects
 *      a candidate that touches frontmatter or structural headings (augment-not-clobber).
 */

import { existsSync, readFileSync } from 'node:fs';

export type BtoDimension = 'METHODOLOGY' | 'DEPTH' | 'CORRECTNESS' | 'USABILITY' | 'ROBUSTNESS';
export const BTO_DIMENSIONS: readonly BtoDimension[] = Object.freeze(['METHODOLOGY', 'DEPTH', 'CORRECTNESS', 'USABILITY', 'ROBUSTNESS']);
export type DimScores = Record<BtoDimension, number>;

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── FR-1: deterministic tune/holdout split ──────────────────────────────────────────────────────────────

export interface ScenarioSplit {
  readonly tune: readonly string[];
  readonly holdout: readonly string[];
}

/**
 * Partition scenario ids into tune/holdout DETERMINISTICALLY (no clock/random): sort by id, then interleave —
 * every k-th id (k = round(1/holdoutRatio)) goes to holdout. Guarantees ≥1 on each side when ≥2 ids exist.
 * Same input → byte-identical split.
 */
export function splitScenarios(ids: readonly string[], holdoutRatio = 0.34): ScenarioSplit {
  const sorted = [...new Set(ids.map((s) => String(s)))].filter((s) => s !== '').sort(byStr);
  if (sorted.length === 0) return { tune: [], holdout: [] };
  if (sorted.length === 1) return { tune: sorted, holdout: [] };
  const ratio = holdoutRatio > 0 && holdoutRatio < 1 ? holdoutRatio : 0.34;
  const k = Math.max(2, Math.round(1 / ratio)); // every k-th → holdout
  const tune: string[] = [];
  const holdout: string[] = [];
  sorted.forEach((id, i) => ((i + 1) % k === 0 ? holdout : tune).push(id));
  // guarantee ≥1 each side
  if (holdout.length === 0) holdout.push(tune.pop()!);
  if (tune.length === 0) tune.push(holdout.pop()!);
  return { tune, holdout };
}

// ── FR-2: budget plan with a hard cap ───────────────────────────────────────────────────────────────────

export interface BudgetInput {
  readonly candidates: number;
  readonly rounds: number;
  readonly tuneCount: number;
  readonly holdoutCount: number;
}
export interface BudgetPlan {
  readonly candidates: number;
  readonly rounds: number;
  readonly tuneRuns: number;
  readonly holdoutRuns: number;
  readonly totalRuns: number;
  readonly cap: number;
  readonly withinCap: boolean;
  readonly trimmed?: string;
}

/** Documented default cap (configurable — NOT a magic constant): a single L2 judge pass per scenario per
 *  candidate is the unit; 24 keeps a 5-candidate × ~4-scenario tune + holdout validation comfortably bounded. */
export const DEFAULT_MAX_JUDGE_RUNS = 24;

/**
 * Judge-run accounting: tune scoring = candidates × rounds × tuneCount; holdout validation = 1 (top-1) ×
 * holdoutCount. If the total exceeds `maxJudgeRuns`, SHRINK — first `rounds` to 1, then `candidates` — until it
 * fits, and report what was trimmed. Never returns an over-cap plan (safety property 2).
 */
export function budgetPlan(input: BudgetInput, maxJudgeRuns: number = DEFAULT_MAX_JUDGE_RUNS): BudgetPlan {
  const cap = Number.isFinite(maxJudgeRuns) && maxJudgeRuns > 0 ? Math.floor(maxJudgeRuns) : DEFAULT_MAX_JUDGE_RUNS;
  const tuneCount = Math.max(0, Math.floor(input.tuneCount));
  const holdoutCount = Math.max(0, Math.floor(input.holdoutCount));
  let candidates = Math.max(1, Math.floor(input.candidates));
  let rounds = Math.max(1, Math.floor(input.rounds));
  const trims: string[] = [];
  const total = (c: number, r: number): number => c * r * tuneCount + holdoutCount;
  if (total(candidates, rounds) > cap && rounds > 1) { rounds = 1; trims.push('rounds→1'); }
  while (total(candidates, rounds) > cap && candidates > 1) { candidates -= 1; }
  if (candidates < Math.max(1, Math.floor(input.candidates))) trims.push('candidates→' + candidates);
  const tuneRuns = candidates * rounds * tuneCount;
  const holdoutRuns = holdoutCount; // validate the top-1 candidate on holdout
  const totalRuns = tuneRuns + holdoutRuns;
  const plan: BudgetPlan = {
    candidates, rounds, tuneRuns, holdoutRuns, totalRuns, cap, withinCap: totalRuns <= cap,
    ...(trims.length ? { trimmed: trims.join(', ') } : {}),
  };
  return plan;
}

// ── FR-3 / aggregate ────────────────────────────────────────────────────────────────────────────────────

const dimVal = (s: DimScores, d: BtoDimension): number => {
  const v = s[d];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** A judge score is a finite number in the rubric range [0, 10]. Anything else (missing, string, NaN,
 *  Infinity, negative, >10) is MALFORMED — it must never coerce silently to 0 and fabricate a winner (QE). */
const isValidScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;
/** Every one of the 5 BTO dimensions must be a valid score for a DimScores to be usable. */
export function validDimScores(s: unknown): s is DimScores {
  if (s === null || typeof s !== 'object') return false;
  const r = s as Record<string, unknown>;
  return BTO_DIMENSIONS.every((d) => isValidScore(r[d]));
}
export function aggregate(s: DimScores): number {
  return BTO_DIMENSIONS.reduce((sum, d) => sum + dimVal(s, d), 0) / BTO_DIMENSIONS.length;
}
/** The lowest-scoring dimension (the bottleneck to lift). Deterministic tie-break by BTO_DIMENSIONS order. */
export function weakestDimension(s: DimScores): BtoDimension {
  let best: BtoDimension = BTO_DIMENSIONS[0]!;
  for (const d of BTO_DIMENSIONS) if (dimVal(s, d) < dimVal(s, best)) best = d;
  return best;
}

// ── FR-4: no-regress-on-HOLD-OUT winner selection (load-bearing) ─────────────────────────────────────────

export interface Candidate {
  readonly id: string;
  readonly prose: string;
  readonly tune: DimScores;
  readonly holdout: DimScores;
}
export interface WinnerResult {
  readonly winner: string | null;
  readonly reason: string;
  readonly weakest: BtoDimension;
  readonly deltas?: Record<string, number>;
}

/**
 * Accept a candidate ONLY on the HOLD-OUT scores (ADR §2): the baseline's weakest dimension must improve by > 0
 * AND no other dimension AND the aggregate may regress by more than `tolerance` (default 0 = strict). Candidates
 * are considered in descending TUNE-aggregate order (the minibatch rank — dspy's search), but acceptance reads
 * only holdout, so a tune-winner that regresses on holdout is rejected. Deterministic; returns the first
 * candidate that passes, or null with a reason.
 */
export function selectWinner(baseline: { readonly holdout: DimScores }, candidates: readonly Candidate[], opts: { tolerance?: number } = {}): WinnerResult {
  // Reject malformed input BEFORE any comparison (QE): coercing missing/junk dims to 0 fabricates a winner.
  if (!baseline || !validDimScores(baseline.holdout)) {
    return { winner: null, reason: 'invalid baseline holdout scores (every dimension must be a number in [0,10])', weakest: BTO_DIMENSIONS[0]! };
  }
  // tolerance must itself be a finite non-negative number (Infinity would disable the no-regress guard).
  const tolerance = typeof opts.tolerance === 'number' && Number.isFinite(opts.tolerance) && opts.tolerance >= 0 ? opts.tolerance : 0;
  const weakest = weakestDimension(baseline.holdout);
  // only candidates with VALID holdout scores are eligible; a malformed candidate can never win.
  const eligible = candidates.filter((c) => validDimScores(c.holdout) && validDimScores(c.tune));
  const ranked = [...eligible].sort((a, b) => aggregate(b.tune) - aggregate(a.tune) || byStr(a.id, b.id));
  let lastReason = `no candidate improved the weakest dimension (${weakest}) on the holdout without regression`;
  for (const c of ranked) {
    const weakDelta = dimVal(c.holdout, weakest) - dimVal(baseline.holdout, weakest);
    if (weakDelta <= 0) { lastReason = `${c.id}: weakest ${weakest} did not improve on holdout (Δ=${weakDelta.toFixed(2)})`; continue; }
    // no-regress on every OTHER dimension + the aggregate
    let regressed: string | null = null;
    for (const d of BTO_DIMENSIONS) {
      if (d === weakest) continue;
      const delta = dimVal(c.holdout, d) - dimVal(baseline.holdout, d);
      if (delta < -tolerance) { regressed = `${d} (Δ=${delta.toFixed(2)})`; break; }
    }
    const aggDelta = aggregate(c.holdout) - aggregate(baseline.holdout);
    if (!regressed && aggDelta < -tolerance) regressed = `aggregate (Δ=${aggDelta.toFixed(2)})`;
    if (regressed) { lastReason = `${c.id}: lifted ${weakest} but regressed ${regressed} on holdout`; continue; }
    return {
      winner: c.id,
      reason: `accepted on holdout: ${weakest} +${weakDelta.toFixed(2)}, aggregate ${aggDelta >= 0 ? '+' : ''}${aggDelta.toFixed(2)}, no regression`,
      weakest,
      deltas: { [weakest]: weakDelta, aggregate: aggDelta },
    };
  }
  return { winner: null, reason: lastReason, weakest };
}

// ── FR-7: prose-scope guard + diff ──────────────────────────────────────────────────────────────────────

// Normalize CRLF/CR → LF first, else a `\r\n` file evades the `\n`-anchored frontmatter/heading regexes (QE bypass).
const normEol = (t: string): string => t.replace(/\r\n?/g, '\n');
const frontmatter = (t: string): string => {
  const m = /^---\n([\s\S]*?)\n---/.exec(normEol(t));
  return m ? m[1]! : '';
};
/** The document BODY (after the frontmatter block) — so the frontmatter's own closing `---` is never misread
 *  as a setext underline, and heading detection runs only on prose. */
const bodyAfterFrontmatter = (t: string): string => {
  const n = normEol(t);
  const m = /^---\n[\s\S]*?\n---\n?/.exec(n);
  return m ? n.slice(m[0].length) : n;
};

/**
 * ALL structural markers on the BODY, not just space-delimited ATX (QE: `##\tNEW`, bare `##`, and setext
 * `Title\n===` / `Title\n---` evaded the old regex). Fenced code blocks (``` / ~~~) are SKIPPED so a `===`/`---`
 * line INSIDE code is not misread as a heading (QE false-positive). Collect ATX (`#`..`######` + any/no ws)
 * AND setext underlines (a non-empty line immediately followed by `=+`/`-+`).
 */
const headings = (t: string): string[] => {
  const lines = bodyAfterFrontmatter(t).split('\n');
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const atx = /^(#{1,6})(?:\s.*)?$/.exec(line.replace(/\s+$/, ''));
    if (atx) { out.push('ATX:' + line.trim()); continue; }
    const next = lines[i + 1];
    if (line.trim() !== '' && !/^\s*(```|~~~)/.test(next ?? '') && next !== undefined && /^(=+|-+)\s*$/.test(next)) {
      out.push('SETEXT:' + line.trim() + '|' + next.trim());
    }
  }
  return out;
};

/** Only directive PROSE may change (Phase-1): frontmatter + the set of ALL markdown structural markers must be
 *  identical. A candidate that alters them (incl. CRLF, tab-ATX, empty-ATX, setext) is rejected (augment-not-clobber). */
export function proseScopeOk(original: string, candidate: string): { ok: boolean; reason: string } {
  if (frontmatter(original) !== frontmatter(candidate)) return { ok: false, reason: 'candidate changed the YAML frontmatter (out of scope: prose only)' };
  const ho = headings(original);
  const hc = headings(candidate);
  if (ho.length !== hc.length || ho.some((h, i) => h !== hc[i])) return { ok: false, reason: 'candidate changed the section headings/structure (out of scope: prose only)' };
  return { ok: true, reason: 'prose-only change' };
}

/** A minimal deterministic unified-ish line diff for the confirm gate (pure). */
export function renderProseDiff(original: string, candidate: string): string {
  const a = original.split('\n');
  const b = candidate.split('\n');
  const out: string[] = ['--- current', '+++ candidate'];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const l = a[i];
    const r = b[i];
    if (l === r) continue;
    if (l !== undefined) out.push('- ' + l);
    if (r !== undefined) out.push('+ ' + r);
  }
  return out.length > 2 ? out.join('\n') : '(no textual difference)';
}

// ── thin I/O (top-level ESM fs; never throws) ───────────────────────────────────────────────────────────

/** Read a scenario-id list: JSON array, or newline/comma-separated. Absent/unreadable → []. */
export function readScenarioIds(path: string): string[] {
  try {
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, 'utf8').trim();
    if (raw === '') return [];
    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? arr.map((x) => String(x)).filter((s) => s !== '') : [];
    }
    return raw.split(/[\n,]/).map((s) => s.trim()).filter((s) => s !== '');
  } catch {
    return [];
  }
}
