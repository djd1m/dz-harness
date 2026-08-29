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
import { replayableInstances, type ReplayInstance } from './compounding.js';
export { replayableInstances, type ReplayInstance };
/** 95% two-sided normal quantile. Named so a future 90%/99% run is a parameter, not a fork. */
export declare const WILSON_Z = 1.96;
/** Per-arm minimum. Shared with the darwin FDR discipline already pinned in compounding.ts. */
export declare const MIN_INSTANCES = 5;
/**
 * Floor of DECISIVE pairs for the no-lift branch. Necessary, NOT sufficient: reaching it only makes
 * the non-superiority test eligible — the test itself must still pass (see {@link NO_LIFT_MARGIN}).
 *
 * The first draft FALSIFIED on `warmWins <= coldWins` at this n, which made 6/12 vs 6/12 read as
 * "refuted". That is indefensible: a tie at n=12 is UNDER-POWERED, not evidence of no effect
 * (Codex QE HIGH-3).
 */
export declare const FALSIFY_NO_LIFT_MIN_N: number;
/**
 * Pre-registered NON-SUPERIORITY margin, on the LIFT scale (see {@link liftInterval}). "No lift" is
 * claimed only when the UPPER bound of the lift interval sits below this — i.e. the data EXCLUDE
 * any lift worth having, rather than merely failing to show one.
 *
 * Consequence, stated plainly: at this margin the branch needs ~1200 decisive pairs. That is the
 * honest price of an equivalence-style claim, and it is exactly why a 6/6 tie at n=12 is
 * INCONCLUSIVE rather than FALSIFIED.
 */
export declare const NO_LIFT_MARGIN = 0.05;
/** A margin outside this range is REFUSED, never clamped: `--margin 99` must not buy FALSIFIED. */
export declare const MARGIN_MIN_EXCLUSIVE = 0;
export declare const MARGIN_MAX = 0.5;
/** True for a margin that may be pre-registered — finite and in `(0, 0.5]`. */
export declare function isValidMargin(value: unknown): value is number;
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
export declare function wilsonInterval(k: number, n: number, z?: number): WilsonInterval | null;
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
export declare function liftInterval(pWarm: WilsonInterval | null): LiftInterval | null;
export declare const WORK_ORDER_KIND = "dz-epoch-replay-work-order";
/**
 * v3: the integrity `digest` (v2) plus the PRE-REGISTERED `margin` and `corpusFingerprint`, and an
 * unambiguous JSON digest input. An older order cannot be verified under these rules, so it is
 * refused rather than half-trusted.
 */
export declare const WORK_ORDER_VERSION = 3;
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
    readonly cold: {
        readonly instruction: string;
        readonly lessons: readonly string[];
    };
    /** Epoch-1 arm: the SAME prompt plus exactly what the apply leg injected. */
    readonly warm: {
        readonly instruction: string;
        readonly lessons: readonly string[];
    };
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
export declare const DEFAULT_WORD_MIN = 80;
export declare const DEFAULT_WORD_MAX = 150;
/** sha256 over the ordered instance identity — lets a reviewer see two orders share a corpus. */
export declare function corpusFingerprint(instances: readonly {
    id: string;
    query: string;
}[]): string;
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
export declare function workOrderDigest(order: {
    seed: number;
    version: number;
    margin: number;
    corpusFingerprint: string;
    items: readonly {
        id: string;
        warmIsA: boolean;
    }[];
}): string;
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
export declare const DIGEST_HONEST_SCOPE: string;
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
export declare function verifyWorkOrder(value: unknown): WorkOrderVerification;
/**
 * Emit the generation work order. Deterministic in (instances, seed): the same corpus and seed
 * produce the same blind assignment, which is what makes "pre-registered" checkable after the fact.
 */
export declare function buildWorkOrder(instances: readonly ReplayInstance[], options?: WorkOrderOptions): WorkOrder;
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
    readonly skipped: readonly {
        readonly id: string;
        readonly reason: string;
    }[];
}
/**
 * Render blind A/B judge prompts from a FILLED work order. An item missing either plan is skipped
 * with a reason: half a pair is not a comparison, and substituting an empty string would hand the
 * judge a rigged contest.
 */
export declare function buildJudgePrompts(order: WorkOrder): JudgePromptsResult;
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
    readonly skipped: readonly {
        readonly id: string;
        readonly reason: string;
    }[];
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
export declare function unblindJudgments(order: WorkOrder, judgments: readonly Judgment[]): UnblindResult;
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
export declare function scoreEpochReplay(outcomes: readonly EpochOutcome[], options?: ScoreOptions): EpochReplayResult;
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
export declare const DEFAULT_MOCK_N = 12;
export declare const DEFAULT_MOCK_SEED = 20260729;
/**
 * Synthetic judge outcomes from ONE seeded stream (`mulberry32` — the repo's only PRNG). Same
 * (n, effect, tieRate, seed) → byte-identical outcomes, so a `--mock` demo is a reproducer.
 */
export declare function generateMockOutcomes(options?: MockOptions): EpochOutcome[];
export declare function renderEpochReplayResult(r: EpochReplayResult): string;
export declare function renderWorkOrderSummary(order: WorkOrder, outPath: string): string;
export declare function renderJudgePromptsSummary(result: JudgePromptsResult, outPath: string): string;
//# sourceMappingURL=epoch-replay.d.ts.map