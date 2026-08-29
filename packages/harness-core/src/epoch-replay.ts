/**
 * `dz epoch-replay` — the executable cold-vs-warm EPOCH RUNNER (feature epoch-replay, scout idea #4).
 *
 * `dz compounding` answers READINESS ("N unique prompt events recorded — a replay can now be RUN").
 * This module answers the RESULT: Epoch-0 (cold, no injected lessons) vs Epoch-1 (warm, the SAME
 * instances plus exactly the lessons the apply leg injected), scored into a three-valued verdict
 * whose positive branch requires two DISJOINT Wilson confidence intervals.
 *
 * ── The honesty boundary (ADR-002) ─────────────────────────────────────────────────────────────
 * This runner ORCHESTRATES and SCORES. It NEVER calls a model. Real mode is a three-stage protocol
 * over files:
 *   1. `buildWorkOrder`   — emits the instances + per-arm generation instructions + the
 *                           PRE-REGISTERED blind A/B assignment (seeded, decided before any plan
 *                           text exists) + an integrity `digest` over that pre-registered core.
 *   2. `buildJudgePrompts`— renders the blind judge prompts from the filled plans. The judge-facing
 *                           payload is `{id, prompt}` and NOTHING else.
 *   3. `verifyWorkOrder` + `unblindJudgments` + `scoreEpochReplay` — check the order really is the
 *                           pre-registered one (digest + seed-derived assignment), un-blind against
 *                           it (never against a field the judge wrote), and compute the verdict.
 * Every stage is pure and deterministic, so the protocol is testable with zero LLM dependency.
 *
 * ── What "blind" has to mean ───────────────────────────────────────────────────────────────────
 * The first version shipped `warmIsA` INSIDE the judge artifact: the judge could read the answer
 * key, so the blinding was theatre (Codex QE CRITICAL-1). `warmIsA` now exists only in the work
 * order, which `--score` consumes and the judge never sees — and the artifact is byte-identical
 * whichever way the assignment fell.
 *
 * ── The conformance firewall ───────────────────────────────────────────────────────────────────
 * The warm arm's only delta is the lessons the apply leg ALREADY injects for that prompt. Gold
 * answers, judge verdicts, and outcome labels never enter the warm context — feedback flows from
 * SOLVE OUTCOMES ONLY. `buildWorkOrder` therefore reads instances, not results, and there is no
 * code path from an `EpochOutcome` back into a work order.
 *
 * ── `--mock` ───────────────────────────────────────────────────────────────────────────────────
 * A seeded synthetic outcome generator (reusing `mulberry32` — no second RNG in this repo) with a
 * configurable TRUE effect, so the verdict math is exercised at $0 before any real data exists.
 *
 * Everything here is PURE: callers read/write files; this module only computes.
 */

// One-way dependency: epoch-replay → compounding. `mulberry32` (the repo's only PRNG), the darwin
// min-n and the single `replayableInstances` definition all live there; importing them keeps this
// module free of a second RNG and of a second definition of "a replayable pair".
import { createHash } from 'node:crypto';

import {
  mulberry32,
  MIN_SAMPLES_PER_ARM,
  replayableInstances,
  type ReplayInstance,
} from './compounding.js';

export { replayableInstances, type ReplayInstance };

// ── Wilson score interval (ADR-003) ────────────────────────────────────────────────────────────

/** 95% two-sided normal quantile. Named so a future 90%/99% run is a parameter, not a fork. */
export const WILSON_Z = 1.96;

/** Per-arm minimum. Shared with the darwin FDR discipline already pinned in compounding.ts. */
export const MIN_INSTANCES = MIN_SAMPLES_PER_ARM;

/**
 * Floor of DECISIVE pairs for the no-lift branch. Necessary, NOT sufficient: reaching it only makes
 * the non-superiority test eligible — the test itself must still pass (see {@link NO_LIFT_MARGIN}).
 *
 * The first draft FALSIFIED on `warmWins <= coldWins` at this n, which made 6/12 vs 6/12 read as
 * "refuted". That is indefensible: a tie at n=12 is UNDER-POWERED, not evidence of no effect
 * (Codex QE HIGH-3).
 */
export const FALSIFY_NO_LIFT_MIN_N = 2 * MIN_SAMPLES_PER_ARM;

/**
 * Pre-registered NON-SUPERIORITY margin, on the LIFT scale (see {@link liftInterval}). "No lift" is
 * claimed only when the UPPER bound of the lift interval sits below this — i.e. the data EXCLUDE
 * any lift worth having, rather than merely failing to show one.
 *
 * Consequence, stated plainly: at this margin the branch needs ~1200 decisive pairs. That is the
 * honest price of an equivalence-style claim, and it is exactly why a 6/6 tie at n=12 is
 * INCONCLUSIVE rather than FALSIFIED.
 */
export const NO_LIFT_MARGIN = 0.05;

/** A margin outside this range is REFUSED, never clamped: `--margin 99` must not buy FALSIFIED. */
export const MARGIN_MIN_EXCLUSIVE = 0;
export const MARGIN_MAX = 0.5;

/** True for a margin that may be pre-registered — finite and in `(0, 0.5]`. */
export function isValidMargin(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > MARGIN_MIN_EXCLUSIVE && value <= MARGIN_MAX;
}

export interface WilsonInterval {
  readonly k: number;
  readonly n: number;
  /** Point estimate k/n. */
  readonly p: number;
  readonly lower: number;
  readonly upper: number;
  readonly z: number;
}

/**
 * Wilson score interval for a binomial proportion. Returns `null` — never a fabricated interval —
 * for any input that is not a real (k, n) pair: n <= 0, non-integers, k out of [0, n], non-finite
 * numbers, or a non-finite/non-positive z. A `null` interval can only ever produce INCONCLUSIVE.
 */
export function wilsonInterval(k: number, n: number, z: number = WILSON_Z): WilsonInterval | null {
  if (!Number.isFinite(k) || !Number.isFinite(n) || !Number.isFinite(z)) return null;
  if (!Number.isInteger(k) || !Number.isInteger(n)) return null;
  if (n <= 0 || k < 0 || k > n) return null;
  if (z <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  if (!Number.isFinite(centre) || !Number.isFinite(half)) return null;
  return {
    k,
    n,
    p,
    lower: Math.max(0, Math.min(1, centre - half)),
    upper: Math.max(0, Math.min(1, centre + half)),
    z,
  };
}

/** An interval on the LIFT scale: warm's advantage over cold among DECISIVE pairs, in `[-1, +1]`. */
export interface LiftInterval {
  /** Point estimate `2·p̂ − 1`: `0` = a coin flip, `+1` = warm wins every decisive pair. */
  readonly d: number;
  readonly lower: number;
  readonly upper: number;
}

/**
 * Map the Wilson interval for `p̂ = P(warm wins | decisive)` onto the LIFT scale, `2p − 1`.
 *
 * WHY THE SCALE MATTERS (and why it is not cosmetic): `margin` is stated as "a lift worth having",
 * which is what a reader reasons about, and it kept exactly the meaning it had under the previous
 * (wrong) two-proportion model. On the raw `p̂` scale the equivalent threshold is `0.5 + margin/2`,
 * NOT `0.5 + margin` — reading the margin on the `p̂` scale would silently DOUBLE the strictness of
 * the non-superiority branch, i.e. make FALSIFIED easier. That is the anti-conservative direction,
 * which is precisely the class of error the paired rewrite exists to remove.
 *
 * Worked check (the case that drove the rewrite): 500 warm / 500 cold over 1000 decisive pairs gives
 * `p̂` CI `[0.4691, 0.5309]` → lift CI `[-0.0619, +0.0619]`. Upper `0.0619` exceeds the default
 * margin `0.05`, so it reads INCONCLUSIVE. The discarded two-proportion Newcombe interval put the
 * upper bound at `0.0437` and called the same data FALSIFIED.
 */
export function liftInterval(pWarm: WilsonInterval | null): LiftInterval | null {
  if (pWarm === null) return null;
  const d = 2 * pWarm.p - 1;
  const lower = 2 * pWarm.lower - 1;
  const upper = 2 * pWarm.upper - 1;
  if (!Number.isFinite(d) || !Number.isFinite(lower) || !Number.isFinite(upper)) return null;
  return { d, lower, upper };
}

// ── Stage 1: the work order (ADR-002) ──────────────────────────────────────────────────────────

export const WORK_ORDER_KIND = 'dz-epoch-replay-work-order';
/**
 * v3: the integrity `digest` (v2) plus the PRE-REGISTERED `margin` and `corpusFingerprint`, and an
 * unambiguous JSON digest input. An older order cannot be verified under these rules, so it is
 * refused rather than half-trusted.
 */
export const WORK_ORDER_VERSION = 3;

export interface WorkOrderItem {
  readonly id: string;
  readonly query: string;
  readonly class: string | null;
  /**
   * PRE-REGISTERED blind assignment: does the WARM plan appear as "PLAN A"? Decided by the seeded
   * PRNG before any plan text exists, and it is the ONLY authority for un-blinding.
   */
  readonly warmIsA: boolean;
  /** Epoch-0 arm: the prompt with NO injected lessons. */
  readonly cold: { readonly instruction: string; readonly lessons: readonly string[] };
  /** Epoch-1 arm: the SAME prompt plus exactly what the apply leg injected. */
  readonly warm: { readonly instruction: string; readonly lessons: readonly string[] };
  /** Filled by the generating agent — absent in a freshly emitted order. */
  readonly coldPlan?: string;
  readonly warmPlan?: string;
}

export interface WorkOrder {
  readonly kind: typeof WORK_ORDER_KIND;
  readonly version: typeof WORK_ORDER_VERSION;
  readonly seed: number;
  readonly generatedAt: string;
  readonly wordMin: number;
  readonly wordMax: number;
  /** Human-readable pre-registration notes, written BEFORE the run. */
  readonly protocol: readonly string[];
  readonly items: readonly WorkOrderItem[];
  /**
   * The PRE-REGISTERED non-superiority margin, on the lift scale. It lives HERE, not on `--score`:
   * a margin chosen after the counts are known is not a pre-registration, and `--margin 99` at
   * scoring time would simply buy FALSIFIED (Codex QE HIGH-B).
   */
  readonly margin: number;
  /** sha256 over the ordered `[id, query]` corpus — lets a reviewer recognise the same corpus. */
  readonly corpusFingerprint: string;
  /** When this order was emitted. Recorded so a reviewer can ask for the original file. */
  readonly emittedAt: string;
  /**
   * Integrity digest over the PRE-REGISTERED core (version, seed, margin, corpus fingerprint and
   * every `[id, warmIsA]`). `--judge`/`--score` recompute it and refuse on mismatch: without this,
   * a forged order — the right `kind`, a fabricated assignment — bought a SUPPORTED verdict for an
   * experiment that never happened (Codex QE HIGH-2).
   *
   * NOT a cryptographic commitment — see {@link workOrderDigest} for the honest scope.
   */
  readonly digest: string;
}

export interface WorkOrderOptions {
  readonly seed?: number;
  readonly nowTs?: string;
  readonly wordMin?: number;
  readonly wordMax?: number;
  /** Cap the number of instances (0/absent = all). */
  readonly limit?: number;
  /**
   * The PRE-REGISTERED non-superiority margin (lift scale), stored in the order and digest-covered.
   * Must be in `(0, 0.5]`; anything else is REFUSED by {@link buildWorkOrder}, never clamped.
   */
  readonly margin?: number;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export const DEFAULT_WORD_MIN = 80;
export const DEFAULT_WORD_MAX = 150;

/**
 * The digest input is the PRE-REGISTERED core and nothing else: version, seed, margin, the corpus
 * fingerprint, and every `[id, warmIsA]` pair in order. Deliberately EXCLUDED are the fields the
 * protocol requires a human to fill after emit — `coldPlan`, `warmPlan` and `class` — so filling
 * them keeps the order verifiable. (Limitation stated in ADR-002: `class` is NOT covered.)
 *
 * Serialization is `JSON.stringify` over an array of TUPLES, not a delimiter-joined string. The
 * first version used `${id}:${flag}` joined by `,`, so an id containing `:` or `,` could make two
 * DIFFERENT orders hash identically — e.g. `[['a:1,b', false]]` and `[['a', true], ['b', false]]`
 * both flattened to `a:1,b:0` (Codex QE MED-D). JSON escaping removes the ambiguity.
 */
function workOrderDigestInput(core: {
  version: number;
  seed: number;
  margin: number;
  corpusFingerprint: string;
  items: readonly { id: string; warmIsA: boolean }[];
}): string {
  return JSON.stringify({
    v: core.version,
    seed: core.seed,
    margin: core.margin,
    corpus: core.corpusFingerprint,
    items: core.items.map((i) => [i.id, i.warmIsA] as [string, boolean]),
  });
}

/** sha256 over the ordered instance identity — lets a reviewer see two orders share a corpus. */
export function corpusFingerprint(instances: readonly { id: string; query: string }[]): string {
  return createHash('sha256')
    .update(JSON.stringify(instances.map((i) => [i.id, i.query] as [string, string])))
    .digest('hex');
}

/**
 * sha256 over {@link workOrderDigestInput}. Pure computation — no IO, no key material.
 *
 * HONEST SCOPE — read this before describing what it proves. This is an integrity check against
 * ACCIDENTAL corruption and mismatch; it is NOT a cryptographic commitment. The digest is
 * self-contained, so a determined operator can re-forge it (at n=12 a seed search finds a matching
 * assignment in a few thousand tries). The threat model is US making mistakes — a hand-edited file,
 * a stale order paired with fresh judgments — exactly the corruption-detection scoping the
 * hash-chain backlog idea already carries. The honest-use contract is procedural: emit once, then
 * judge, and keep the emitted file.
 */
export function workOrderDigest(order: {
  seed: number;
  version: number;
  margin: number;
  corpusFingerprint: string;
  items: readonly { id: string; warmIsA: boolean }[];
}): string {
  return createHash('sha256')
    .update(
      workOrderDigestInput({
        version: order.version,
        seed: order.seed,
        margin: order.margin,
        corpusFingerprint: order.corpusFingerprint,
        items: order.items,
      }),
    )
    .digest('hex');
}

export interface WorkOrderVerification {
  readonly ok: boolean;
  /** Every problem found, not just the first — a forged order usually trips several. */
  readonly problems: readonly string[];
}

/**
 * The one sentence that states what the digest is and is not. Held in a constant so the CLI error
 * text, the module documentation and the honest-scope regression test all read the SAME words —
 * this promise must not quietly regrow into "commitment" language (Codex QE HIGH-C).
 */
export const DIGEST_HONEST_SCOPE =
  'integrity check against accidental corruption/mismatch — not a cryptographic commitment; ' +
  'a determined operator can re-forge it, and the honest-use contract is emit-once-then-judge';

/**
 * Integrity-check a work order before ANY verdict may depend on it (Codex QE HIGH-2).
 *
 * Checking `kind` and `Array.isArray(items)` was vacuous: a hand-written file with the right two
 * fields and an invented `warmIsA` un-blinded into whatever verdict its author wanted. Four checks
 * now have to agree:
 *   1. the `digest` recomputes over (version, seed, margin, corpus fingerprint, `[id, warmIsA]`…);
 *   2. every `warmIsA` is REDERIVABLE from the stated `seed` — the same `mulberry32` stream that
 *      emitted it;
 *   3. the pre-registered `margin` is in range;
 *   4. structural sanity — unique non-empty ids, boolean assignments, integer seed.
 *
 * WHAT THIS IS NOT: see {@link DIGEST_HONEST_SCOPE}. Re-deriving from the seed raises the bar from
 * "edit one field" to "search for a seed", which at n=12 is a few thousand tries — a deterrent
 * against slips, not a defence against intent. Nothing here is a cryptographic commitment, and no
 * amount of hashing inside the file itself could make it one.
 */
export function verifyWorkOrder(value: unknown): WorkOrderVerification {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null) return { ok: false, problems: ['not an object'] };
  const o = value as Record<string, unknown>;
  if (o.kind !== WORK_ORDER_KIND) problems.push(`kind is not ${WORK_ORDER_KIND}`);
  if (o.version !== WORK_ORDER_VERSION) problems.push(`version is not ${WORK_ORDER_VERSION} (older orders cannot be verified under these rules)`);
  if (!Number.isInteger(o.seed) || (o.seed as number) < 0) problems.push('seed is not a non-negative integer');
  if (!isValidMargin(o.margin)) {
    problems.push(`pre-registered margin ${JSON.stringify(o.margin)} is not a number in (0, ${MARGIN_MAX}]`);
  }
  if (typeof o.corpusFingerprint !== 'string' || o.corpusFingerprint === '') problems.push('missing corpusFingerprint');
  if (!Array.isArray(o.items)) {
    problems.push('items is not an array');
    return { ok: false, problems };
  }
  const items = o.items as unknown[];
  const seen = new Set<string>();
  const core: { id: string; warmIsA: boolean }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = (typeof items[i] === 'object' && items[i] !== null ? items[i] : {}) as Record<string, unknown>;
    const id = typeof it.id === 'string' ? it.id : '';
    if (id.trim() === '') problems.push(`item ${i}: missing id`);
    else if (seen.has(id)) problems.push(`item ${i}: duplicate id ${JSON.stringify(id)}`);
    seen.add(id);
    if (typeof it.warmIsA !== 'boolean') problems.push(`item ${i}: warmIsA is not a boolean`);
    core.push({ id, warmIsA: it.warmIsA === true });
  }
  if (problems.length > 0) return { ok: false, problems };

  const expected = workOrderDigest({
    seed: o.seed as number,
    version: o.version as number,
    margin: o.margin as number,
    corpusFingerprint: o.corpusFingerprint as string,
    items: core,
  });
  if (typeof o.digest !== 'string' || o.digest !== expected) {
    problems.push(
      `digest mismatch — the pre-registered core (seed / margin / corpus / ids / assignments) was altered after emit. ` +
        `NOTE: ${DIGEST_HONEST_SCOPE}`,
    );
  }
  // Re-derive the assignment from the stated seed: the same one call per item, in item order.
  const rand = mulberry32(o.seed as number);
  for (let i = 0; i < core.length; i++) {
    const derived = rand() < 0.5;
    if (derived !== core[i]!.warmIsA) {
      problems.push(`item ${i} (${core[i]!.id}): warmIsA does not derive from seed ${o.seed as number} — the assignment was not pre-registered`);
      break; // one is enough; listing all would just be noise
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Emit the generation work order. Deterministic in (instances, seed): the same corpus and seed
 * produce the same blind assignment, which is what makes "pre-registered" checkable after the fact.
 */
export function buildWorkOrder(
  instances: readonly ReplayInstance[],
  options: WorkOrderOptions = {},
): WorkOrder {
  // A margin is a PRE-REGISTRATION, so a bad one is an error, not something to quietly round into
  // range: `margin: 99` clamped to 0.5 would silently pre-register a bar nothing can fail.
  if (options.margin !== undefined && !isValidMargin(options.margin)) {
    throw new RangeError(`margin ${JSON.stringify(options.margin)} must be a number in (${MARGIN_MIN_EXCLUSIVE}, ${MARGIN_MAX}]`);
  }
  const margin = options.margin ?? NO_LIFT_MARGIN;
  const seed = clampInt(options.seed, 20260729, 0, 2 ** 31 - 1);
  const wordMin = clampInt(options.wordMin, DEFAULT_WORD_MIN, 10, 5000);
  const wordMax = Math.max(wordMin, clampInt(options.wordMax, DEFAULT_WORD_MAX, 10, 5000));
  const limit = clampInt(options.limit, 0, 0, 100000);
  const picked = limit > 0 ? instances.slice(0, limit) : instances.slice();
  const rand = mulberry32(seed);
  const items: WorkOrderItem[] = picked.map((inst) => {
    const warmIsA = rand() < 0.5;
    const shared =
      `Answer the user prompt below as a first-response PLAN of ${wordMin}-${wordMax} words. ` +
      'Plain prose, no headings, no lists. Say what you would DO first and why.';
    return {
      id: inst.id,
      query: inst.query,
      class: inst.class,
      warmIsA,
      cold: { instruction: shared, lessons: [] },
      warm: {
        instruction: `${shared} The following learned lessons were surfaced for this prompt; use them if relevant.`,
        lessons: inst.lessons.slice(),
      },
    };
  });
  const emittedAt = typeof options.nowTs === 'string' ? options.nowTs : new Date().toISOString();
  const fingerprint = corpusFingerprint(picked.map((i) => ({ id: i.id, query: i.query })));
  return {
    kind: WORK_ORDER_KIND,
    version: WORK_ORDER_VERSION,
    seed,
    generatedAt: emittedAt,
    emittedAt,
    margin,
    corpusFingerprint: fingerprint,
    wordMin,
    wordMax,
    protocol: [
      'PRE-REGISTERED before any plan text exists. Do not edit `warmIsA`, `seed`, `margin`, or `id`.',
      'COLD arm = the prompt alone. WARM arm = the same prompt plus exactly the lessons the apply leg injected.',
      'CONFORMANCE FIREWALL: never place a gold answer, a judge verdict, or an outcome label in either arm.',
      `Fill coldPlan/warmPlan for each item (${wordMin}-${wordMax} words, symmetric length).`,
      'Assign `class` NOW if you intend to slice — a class chosen after outcomes are known is not a pre-registration.',
      'Then: `dz epoch-replay --judge <this file>` → judge each prompt with an EXTERNAL model → `dz epoch-replay --score <judgments> --work-order <this file>`.',
      `The non-superiority margin (${margin}) is PRE-REGISTERED HERE. --score reads it from this file and rejects a --margin flag.`,
      'PRIVACY: this file contains raw local prompt texts. Keep it out of version control.',
      `INTEGRITY: \`digest\` covers version + seed + margin + corpus + every [id, warmIsA]. Editing any of them makes --judge/--score refuse. It is an ${DIGEST_HONEST_SCOPE}.`,
    ],
    items,
    digest: workOrderDigest({ seed, version: WORK_ORDER_VERSION, margin, corpusFingerprint: fingerprint, items }),
  };
}

// ── Stage 2: blind judge prompts ───────────────────────────────────────────────────────────────

/**
 * ONE judge-facing item. These two fields are the WHOLE artifact, by design.
 *
 * The first version also carried `warmIsA` and `class`, which handed the judge the answer key: the
 * blinding was theatre (Codex QE CRITICAL-1). `warmIsA` now lives ONLY in the pre-registered work
 * order, which `--score` consumes and the judge never sees. `class` went too — nothing the judge
 * does not need may travel with the prompt.
 */
export interface JudgePrompt {
  readonly id: string;
  readonly prompt: string;
}

export interface JudgePromptsResult {
  /** The judge-facing payload — `{id, prompt}` only. Nothing else may be written to the judge. */
  readonly prompts: readonly JudgePrompt[];
  /**
   * Items that could NOT be judged, with the reason — never silently dropped. OPERATOR-facing:
   * the reasons name arms ("warmPlan missing"), so this must not be written into the judge file.
   */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * Render blind A/B judge prompts from a FILLED work order. An item missing either plan is skipped
 * with a reason: half a pair is not a comparison, and substituting an empty string would hand the
 * judge a rigged contest.
 */
export function buildJudgePrompts(order: WorkOrder): JudgePromptsResult {
  const prompts: JudgePrompt[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const item of order.items ?? []) {
    const cold = typeof item.coldPlan === 'string' ? item.coldPlan.trim() : '';
    const warm = typeof item.warmPlan === 'string' ? item.warmPlan.trim() : '';
    if (cold === '' || warm === '') {
      skipped.push({
        id: item.id,
        reason: cold === '' && warm === '' ? 'both plans missing' : cold === '' ? 'coldPlan missing' : 'warmPlan missing',
      });
      continue;
    }
    const a = item.warmIsA ? warm : cold;
    const b = item.warmIsA ? cold : warm;
    prompts.push({
      id: item.id,
      prompt: [
        'You are a blind judge. An assistant received this user prompt:',
        `PROMPT: ${item.query}`,
        '',
        'Two candidate first-response plans. Judge which better serves the user: concreteness,',
        'correct first actions, avoiding known failure modes. Ignore verbosity and style.',
        '',
        `PLAN A: ${a}`,
        '',
        `PLAN B: ${b}`,
        '',
        'Reply with EXACTLY 3 lines:',
        'WINNER: A|B|TIE',
        'DECISIVE: <the single concrete element that made the winner better, one line>',
        'CONFIDENCE: high|medium|low',
      ].join('\n'),
    });
  }
  return { prompts, skipped };
}

// ── Stage 3: un-blind + score ──────────────────────────────────────────────────────────────────

export type Arm = 'cold' | 'warm';

export interface EpochOutcome {
  readonly id: string;
  readonly class: string | null;
  /** Which epoch solved the instance better. `tie` counts in the denominator, for neither arm. */
  readonly winner: Arm | 'tie';
}

export interface Judgment {
  readonly id: string;
  /** The judge's blind answer: `A`, `B` or `TIE` (case-insensitive). */
  readonly winner: string;
}

export interface UnblindResult {
  /** False ⇒ the input is CORRUPT and no verdict may be computed from it. */
  readonly ok: boolean;
  /** Populated exactly when `ok` is false. */
  readonly error: string | null;
  readonly outcomes: readonly EpochOutcome[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * Map blind judgments back to arms using the work order's PRE-REGISTERED `warmIsA`. The judgments
 * file deliberately carries no arm labels: if un-blinding read a label the judge (or a later hand
 * edit) supplied, the blinding would be decorative.
 *
 * Unknown ids and unparseable winners are SKIPPED with a reason, never guessed. DUPLICATE ids are
 * different: they are a CORRUPT input, not a skippable row, so the whole call is REFUSED. Skipping
 * the second copy silently accepted a file in which one judgment had been pasted five times — which
 * scored as n=5 and reached SUPPORTED off a single opinion (Codex QE MED-4).
 */
export function unblindJudgments(order: WorkOrder, judgments: readonly Judgment[]): UnblindResult {
  const byId = new Map<string, WorkOrderItem>();
  for (const item of order.items ?? []) byId.set(item.id, item);
  const outcomes: EpochOutcome[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const seen = new Set<string>();

  // Refuse BEFORE interpreting anything: a duplicated id makes the whole file untrustworthy.
  const dupes = new Set<string>();
  const walked = new Set<string>();
  for (const j of judgments ?? []) {
    const id = typeof j?.id === 'string' ? j.id : '';
    if (id === '') continue;
    if (walked.has(id)) dupes.add(id);
    walked.add(id);
  }
  if (dupes.size > 0) {
    return {
      ok: false,
      error: `corrupt judgments: duplicate id(s) ${[...dupes].sort().map((d) => JSON.stringify(d)).join(', ')} — one instance may be judged exactly once`,
      outcomes: [],
      skipped: [],
    };
  }

  for (const j of judgments ?? []) {
    const id = typeof j?.id === 'string' ? j.id : '';
    if (id === '') {
      skipped.push({ id: String(j?.id ?? ''), reason: 'missing id' });
      continue;
    }
    const item = byId.get(id);
    if (!item) {
      skipped.push({ id, reason: 'id not in the work order (cannot un-blind)' });
      continue;
    }
    const raw = typeof j.winner === 'string' ? j.winner.trim().toUpperCase() : '';
    let winner: Arm | 'tie';
    if (raw === 'TIE') winner = 'tie';
    else if (raw === 'A') winner = item.warmIsA ? 'warm' : 'cold';
    else if (raw === 'B') winner = item.warmIsA ? 'cold' : 'warm';
    else {
      skipped.push({ id, reason: `unparseable winner ${JSON.stringify(j.winner)} (expected A|B|TIE)` });
      continue;
    }
    seen.add(id);
    outcomes.push({ id, class: item.class ?? null, winner });
  }
  return { ok: true, error: null, outcomes, skipped };
}

export type EpochVerdict = 'SUPPORTED' | 'FALSIFIED' | 'INCONCLUSIVE';

export interface ArmResult {
  readonly arm: Arm;
  readonly wins: number;
  /** DECISIVE pairs — the binomial denominator. Ties are excluded from the test (but reported). */
  readonly n: number;
  readonly ci: WilsonInterval | null;
}

export interface EpochReplayResult {
  readonly verdict: EpochVerdict;
  /** Always populated — a bare label is not a finding. */
  readonly reason: string;
  /**
   * Non-null ⇒ the INPUT was refused and the verdict is a placeholder INCONCLUSIVE, not a
   * measurement. Callers must surface this and exit non-zero.
   */
  readonly refusal: string | null;
  readonly slice: string;
  /** Every scored instance in the slice, ties included. Context, not the denominator. */
  readonly n: number;
  readonly ties: number;
  /** DECISIVE pairs, `D = warm.wins + cold.wins` — the denominator the test actually uses. */
  readonly decisive: number;
  readonly cold: ArmResult;
  readonly warm: ArmResult;
  /**
   * The test statistic on the LIFT scale (`2p̂ − 1`, where `p̂ = P(warm wins | decisive)`).
   * `margin` is stated on this scale.
   */
  readonly lift: LiftInterval | null;
  readonly z: number;
  /** Minimum DECISIVE pairs before any verdict exists. */
  readonly minN: number;
  readonly falsifyNoLiftMinN: number;
  readonly noLiftMargin: number;
}

export interface ScoreOptions {
  /** `all` (default) or a pre-registered class label. */
  readonly slice?: string;
  /** Must be finite and > 0 if given. Anything else is REFUSED — never clamped (Codex QE MED-5). */
  readonly z?: number;
  /**
   * Non-superiority margin on the LIFT scale, in `(0, 0.5]`. In real mode this comes from the WORK
   * ORDER (pre-registered); out-of-range is REFUSED, never clamped (Codex QE HIGH-B).
   */
  readonly margin?: number;
}

/**
 * The three-valued verdict (ADR-003, as amended).
 *
 * THE MODEL — a SINGLE binomial over DECISIVE pairs. Each instance yields ONE judgment about ONE
 * prompt, so the arms are PAIRED, not two independent samples. Let `W` = warm wins, `C` = cold
 * wins, `D = W + C` (ties are excluded from the test and reported separately). The statistic is
 * `p̂ = W/D` with a Wilson interval, mapped to the lift scale by {@link liftInterval}:
 *
 *   SUPPORTED     lift lower bound > 0        (equivalently: Wilson lower on p̂ > 0.5)
 *   FALSIFIED     harm — lift upper bound < 0 (Wilson upper on p̂ < 0.5); OR non-superiority —
 *                 lift upper bound < `margin` with `D >= FALSIFY_NO_LIFT_MIN_N`
 *   INCONCLUSIVE  everything else, including `D < MIN_INSTANCES`. A first-class honest outcome.
 *
 * This is exactly the statistic the manual 2026-07-29 experiment used, and it is the correction the
 * re-QE demanded: the previous two-proportion (Newcombe) framing treated the paired judgments as
 * independent samples and was ANTI-CONSERVATIVE — 500/500 over 1000 decisive pairs produced an
 * upper bound of 0.0437 and a FALSIFIED verdict where the paired form gives 0.0619 and INCONCLUSIVE
 * (Codex QE HIGH-A).
 *
 * REFUSALS (verdict is a placeholder, `refusal` is set): duplicate instance ids, an invalid `z`, or
 * an out-of-range `margin`.
 */
export function scoreEpochReplay(
  outcomes: readonly EpochOutcome[],
  options: ScoreOptions = {},
): EpochReplayResult {
  const slice = typeof options.slice === 'string' && options.slice.trim() !== '' ? options.slice.trim() : 'all';

  // HIGH-B: a margin is a PRE-REGISTRATION. Out of range is an error, not something to round into
  // range — clamping `--margin 99` down to a legal value would buy FALSIFIED for free.
  const marginGiven = options.margin !== undefined;
  const marginValid = !marginGiven || isValidMargin(options.margin);
  const margin = marginGiven && marginValid ? (options.margin as number) : NO_LIFT_MARGIN;

  // MED-5: `z` used to be CLAMPED into [0.0001, 10]. A caller passing 0 therefore got a near-zero
  // -width interval, which is trivially disjoint from anything — SUPPORTED fabricated out of a bad
  // argument. An invalid z is refused, consistent with `wilsonInterval`'s null discipline.
  const zGiven = options.z !== undefined;
  const zValid = !zGiven || (typeof options.z === 'number' && Number.isFinite(options.z) && options.z > 0 && options.z <= 10);
  const z = zGiven && zValid ? (options.z as number) : WILSON_Z;

  const pool = (outcomes ?? []).filter((o) => {
    if (!o || typeof o.id !== 'string') return false;
    if (o.winner !== 'cold' && o.winner !== 'warm' && o.winner !== 'tie') return false;
    return slice === 'all' ? true : (o.class ?? null) === slice;
  });

  // MED-4: five copies of one judgement are not five observations. Refuse — a duplicated instance
  // id means the input is corrupt, and D must never be inflated by a paste.
  const dupes = new Set<string>();
  const walkedIds = new Set<string>();
  for (const o of pool) {
    if (walkedIds.has(o.id)) dupes.add(o.id);
    walkedIds.add(o.id);
  }

  const n = pool.length;
  const warmWins = pool.filter((o) => o.winner === 'warm').length;
  const coldWins = pool.filter((o) => o.winner === 'cold').length;
  const ties = pool.filter((o) => o.winner === 'tie').length;

  // HIGH-A: ONE binomial over DECISIVE pairs. Ties carry no directional information, so they are
  // excluded from the denominator (and reported); `p̂ = W/D` is the paired statistic.
  const decisive = warmWins + coldWins;
  const pWarm = wilsonInterval(warmWins, decisive, z);
  const lift = liftInterval(pWarm);
  // Cold's interval is the exact complement of warm's — reported for readability, never a second test.
  const coldCi = wilsonInterval(coldWins, decisive, z);
  const warm: ArmResult = { arm: 'warm', wins: warmWins, n: decisive, ci: pWarm };
  const cold: ArmResult = { arm: 'cold', wins: coldWins, n: decisive, ci: coldCi };
  const base = {
    slice,
    n,
    ties,
    decisive,
    cold,
    warm,
    lift,
    z,
    minN: MIN_INSTANCES,
    falsifyNoLiftMinN: FALSIFY_NO_LIFT_MIN_N,
    noLiftMargin: margin,
  };

  // ── refusals: a corrupt input yields NO measurement ──
  if (!zValid) {
    return {
      ...base,
      z: WILSON_Z,
      verdict: 'INCONCLUSIVE',
      refusal: `invalid z ${JSON.stringify(options.z)} — must be a finite number in (0, 10]; refused rather than clamped, because a tiny z manufactures a significant interval`,
      reason: 'REFUSED: invalid confidence parameter — no verdict was computed',
    };
  }
  if (!marginValid) {
    return {
      ...base,
      noLiftMargin: NO_LIFT_MARGIN,
      verdict: 'INCONCLUSIVE',
      refusal: `invalid margin ${JSON.stringify(options.margin)} — must be a number in (${MARGIN_MIN_EXCLUSIVE}, ${MARGIN_MAX}]; refused rather than clamped, because an oversized margin buys FALSIFIED`,
      reason: 'REFUSED: invalid non-superiority margin — no verdict was computed',
    };
  }
  if (dupes.size > 0) {
    return {
      ...base,
      verdict: 'INCONCLUSIVE',
      refusal: `corrupt outcomes: duplicate instance id(s) ${[...dupes].sort().map((d) => JSON.stringify(d)).join(', ')} — one instance counts exactly once`,
      reason: 'REFUSED: duplicate instance ids would inflate the denominator — no verdict was computed',
    };
  }

  if (decisive < MIN_INSTANCES) {
    return {
      ...base,
      verdict: 'INCONCLUSIVE',
      refusal: null,
      reason:
        `insufficient data: ${decisive} DECISIVE pair(s) in slice "${slice}"` +
        `${ties > 0 ? ` (${ties} tie(s) carry no direction and are excluded)` : ''}, ` +
        `${MIN_INSTANCES} needed (darwin FDR discipline — n=3 gave a 33% false-discovery rate)`,
    };
  }
  if (pWarm === null || lift === null) {
    return {
      ...base,
      verdict: 'INCONCLUSIVE',
      refusal: null,
      reason: `no valid confidence interval could be computed for slice "${slice}" (degenerate counts)`,
    };
  }

  const shape =
    `warm ${warmWins}/${decisive} decisive (p=${pWarm.p.toFixed(3)}, CI [${pWarm.lower.toFixed(3)}, ${pWarm.upper.toFixed(3)}]); ` +
    `lift [${lift.lower.toFixed(3)}, ${lift.upper.toFixed(3)}]`;

  // Belt-and-braces: `lift.lower > 0` already implies warm won more, but asserting it makes a
  // SUPPORTED unreachable through a single edited comparison.
  if (lift.lower > 0 && warmWins > coldWins) {
    return {
      ...base,
      verdict: 'SUPPORTED',
      refusal: null,
      reason: `${shape} — the lift interval lies ENTIRELY above zero (warm wins more than half of decisive pairs)`,
    };
  }
  if (lift.upper < 0 && coldWins > warmWins) {
    return {
      ...base,
      verdict: 'FALSIFIED',
      refusal: null,
      reason: `harm: ${shape} — the lift interval lies ENTIRELY below zero (cold wins more than half of decisive pairs)`,
    };
  }
  // NON-SUPERIORITY, not "warm didn't win". The data must EXCLUDE a lift as large as the margin;
  // an equal split at small D excludes nothing (Codex QE HIGH-3).
  if (decisive >= FALSIFY_NO_LIFT_MIN_N && lift.upper < margin) {
    return {
      ...base,
      verdict: 'FALSIFIED',
      refusal: null,
      reason: `no lift: ${shape} — the lift UPPER bound is below the pre-registered margin ${margin} over ${decisive} decisive pair(s), so a lift worth having is excluded`,
    };
  }
  return {
    ...base,
    verdict: 'INCONCLUSIVE',
    refusal: null,
    reason: `${shape} — neither excludes zero nor excludes a ${margin} lift; under-powered, keep the corpus growing`,
  };
}

// ── `--mock`: seeded synthetic outcomes ────────────────────────────────────────────────────────

export interface MockOptions {
  readonly n?: number;
  /**
   * TRUE effect in [-1, 1]. P(warm wins | not a tie) = clamp(0.5 + effect / 2), so 0 is a fair
   * coin, +1 is "warm always wins", -1 is "cold always wins".
   */
  readonly effect?: number;
  readonly tieRate?: number;
  readonly seed?: number;
  /** Class label stamped on every synthetic outcome (so `--slice` is exercisable). */
  readonly class?: string | null;
}

export const DEFAULT_MOCK_N = 12;
export const DEFAULT_MOCK_SEED = 20260729;

/**
 * Synthetic judge outcomes from ONE seeded stream (`mulberry32` — the repo's only PRNG). Same
 * (n, effect, tieRate, seed) → byte-identical outcomes, so a `--mock` demo is a reproducer.
 */
export function generateMockOutcomes(options: MockOptions = {}): EpochOutcome[] {
  const n = clampInt(options.n, DEFAULT_MOCK_N, 0, 100000);
  const effect = clampNumber(options.effect, 0, -1, 1);
  const tieRate = clampNumber(options.tieRate, 0, 0, 1);
  const seed = clampInt(options.seed, DEFAULT_MOCK_SEED, 0, 2 ** 31 - 1);
  const pWarm = Math.max(0, Math.min(1, 0.5 + effect / 2));
  const rand = mulberry32(seed);
  const out: EpochOutcome[] = [];
  for (let i = 0; i < n; i++) {
    const tieRoll = rand();
    const armRoll = rand();
    const winner: Arm | 'tie' = tieRoll < tieRate ? 'tie' : armRoll < pWarm ? 'warm' : 'cold';
    out.push({ id: `mock-${i}`, class: options.class ?? null, winner });
  }
  return out;
}

// ── Rendering ──────────────────────────────────────────────────────────────────────────────────

function fmtCi(ci: WilsonInterval | null): string {
  return ci === null ? 'n/a' : `[${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}]`;
}

export function renderEpochReplayResult(r: EpochReplayResult): string {
  const out: string[] = [];
  out.push('dz epoch-replay — cold (epoch 0) vs warm (epoch 1), Wilson-CI three-valued verdict');
  out.push('');
  if (r.refusal !== null) {
    out.push('  REFUSED — the input is corrupt, so NO measurement was made:');
    out.push(`    ${r.refusal}`);
    return out.join('\n');
  }
  out.push(
    `  SLICE: ${r.slice} · ${r.n} scored instance(s) · ${r.decisive} DECISIVE pair(s)` +
      `${r.ties > 0 ? ` · ${r.ties} tie(s) excluded from the test` : ''}`,
  );
  const ciLabel = r.z === WILSON_Z ? 'CI95' : `CI(z=${r.z})`;
  out.push(`  COLD (epoch 0, no injected lessons): ${r.cold.wins}/${r.cold.n} decisive  ${ciLabel} ${fmtCi(r.cold.ci)}`);
  out.push(`  WARM (epoch 1, apply-leg lessons):   ${r.warm.wins}/${r.warm.n} decisive  ${ciLabel} ${fmtCi(r.warm.ci)}`);
  out.push(
    `  LIFT (paired, 2p−1 over decisive pairs): ${r.lift === null ? 'n/a' : `${r.lift.d >= 0 ? '+' : ''}${r.lift.d.toFixed(3)}  [${r.lift.lower.toFixed(3)}, ${r.lift.upper.toFixed(3)}]`}`,
  );
  out.push('');
  out.push(`  VERDICT: ${r.verdict}`);
  out.push(`    ${r.reason}`);
  out.push('');
  out.push(`  rule: ONE binomial over DECISIVE pairs (ties carry no direction and are excluded).`);
  out.push(`        SUPPORTED only when the lift interval lies ENTIRELY above zero.`);
  out.push(
    `        FALSIFIED only on HARM (entirely below zero) or on a passed NON-SUPERIORITY test — the lift UPPER bound below the pre-registered margin ${r.noLiftMargin} at D >= ${r.falsifyNoLiftMinN}.`,
  );
  out.push(
    `        Everything else is INCONCLUSIVE (min ${r.minN} decisive pairs). A tie is UNDER-POWERED, never "refuted".`,
  );
  return out.join('\n');
}

export function renderWorkOrderSummary(order: WorkOrder, outPath: string): string {
  const withClass = order.items.filter((i) => typeof i.class === 'string' && i.class !== '').length;
  const out: string[] = [];
  out.push(`dz epoch-replay --emit → ${outPath}`);
  out.push('');
  out.push(`  ${order.items.length} instance(s) · seed ${order.seed} · blind A/B assignment PRE-REGISTERED`);
  out.push(`  integrity digest: ${order.digest.slice(0, 16)}… (covers version + seed + every id:warmIsA)`);
  out.push(`  slice labels assigned: ${withClass}/${order.items.length}`);
  out.push(`  plan length target: ${order.wordMin}-${order.wordMax} words per arm`);
  out.push('');
  out.push('  NEXT (this runner never calls a model):');
  out.push('   1. Fill coldPlan/warmPlan for every item with an agent, arms generated symmetrically.');
  out.push(`   2. dz epoch-replay --judge ${outPath}   → blind judge prompts`);
  out.push('   3. Have an EXTERNAL (cross-model) judge answer each prompt; collect {id, winner} rows.');
  out.push(`   4. dz epoch-replay --score <judgments.json> --work-order ${outPath}`);
  out.push('');
  out.push('  PRIVACY: the work order embeds raw local prompt texts — keep it out of version control.');
  return out.join('\n');
}

export function renderJudgePromptsSummary(result: JudgePromptsResult, outPath: string): string {
  const out: string[] = [];
  out.push(`dz epoch-replay --judge → ${outPath}`);
  out.push('');
  out.push(`  ${result.prompts.length} blind judge prompt(s) rendered — the file carries {id, prompt} and NOTHING else`);
  if (result.skipped.length > 0) {
    out.push(`  ${result.skipped.length} item(s) SKIPPED (half a pair is not a comparison):`);
    for (const s of result.skipped) out.push(`    · ${s.id}: ${s.reason}`);
    out.push('    (this list stays HERE — its reasons name arms, so it is never written to the judge file)');
  }
  out.push('');
  out.push('  Give each prompt to an EXTERNAL judge model (cross-model: not the generator).');
  out.push('  Collect the answers as [{ "id": "<id>", "winner": "A|B|TIE" }, ...] — no arm labels:');
  out.push('  un-blinding uses the work order\'s pre-registered assignment, not anything the judge wrote.');
  return out.join('\n');
}
