/**
 * `dz statusline` data source — the FAST, best-effort read behind the live
 * self-learning panel Claude Code renders in its status bar (modeled on
 * agentic-qe's "🎓 12 patterns" statusline, showing dz's OWN counts).
 *
 * Claude Code refreshes a `statusLine` command up to every ~300ms, so this MUST
 * be fast (<~50ms) and MUST NEVER throw or hang — a broken statusline garbles the
 * terminal bar. Every read is therefore:
 * - **readonly + short busy_timeout** — a live MCP writer holding the store lock
 *   must never make the panel wait; we back off immediately, not block.
 * - **best-effort** — any error (absent/corrupt `.dz`, missing native module,
 *   locked db) collapses to `0` / an omitted field, never an exception.
 *
 * @packageDocumentation
 */
import { type StoreHealthVerdict } from './store-guard.js';
/**
 * Live learning state for one in-flight `/feature-adr` run — the per-run visibility panel
 * that surfaces the Pattern memory loop (POOL learned, RECALLED for this run, STORED this run).
 * Written by the pipeline at Steps 0/8/9 via `writeFeatureAdrState`; read back on the render
 * path (readonly, best-effort) by `readFeatureAdrState`.
 */
export interface FeatureAdrState {
    /** Producer of this panel state. Missing/invalid legacy values are treated as `feature-adr`. */
    readonly kind?: 'feature-adr' | 'loop';
    /** The feature slug the pipeline is working on (kebab-case). */
    readonly slug: string;
    /** Human-readable step label (e.g. "Step 0", "Step 8 QE"). */
    readonly step: string;
    /** Total learned-pattern POOL (all patterns available to recall from) at write time. */
    readonly pool: number;
    /** How many patterns this run RECALLED / used to inform its work. */
    readonly recalled: number;
    /** How many NEW patterns this run STORED back into the pool. */
    readonly stored: number;
    /** How many candidate lessons reinforced an existing pattern instead of writing a duplicate. */
    readonly reinforced?: number;
    /** ISO timestamp of the write — drives the freshness window on the render path. */
    readonly ts: string;
    /** Identity of one pipeline invocation. The monotonic guard never crosses two distinct runs. */
    readonly runId?: string;
    /** Optional run mode (e.g. "reference", "full-qe", "full-qe-extended"). */
    readonly mode?: string;
    /** Complexity tier of the run (S/M/L/XL) — drives done/total on the phase line. Carried forward
     *  by the write path when a later record omits it. */
    readonly tier?: string;
    /** ISO timestamp of the CURRENT phase's start — reset by the write path when the step label
     *  changes, carried forward while it stays the same. Drives the phase line's elapsed minutes. */
    readonly phaseStartTs?: string;
}
/** A snapshot of dz's self-learning state for one project (all fields best-effort). */
export interface StatuslineData {
    /** Count of learned patterns in the project's unified memory store. */
    readonly patterns: number;
    /** Absent on parity; missing/unreadable mirror is explicitly unavailable. */
    readonly patternMirror?: {
        readonly state: 'different';
        readonly lexical: number;
        readonly vector: number;
    } | {
        readonly state: 'unavailable';
    };
    /** Exact lexical-tier availability split; omitted when the enhanced readonly count cannot be established. */
    readonly patternBreakdown?: {
        readonly source: 'lexical';
        readonly active: number;
        readonly quarantined: number;
        /** True once quarantine contains at least one third of the lexical pool. */
        readonly attention: boolean;
        /** Absolute lexical/vector quarantine-label delta, present only above the tolerated drift threshold. */
        readonly tierDelta?: number;
    };
    /** Count of learned patterns that the live recall hook has actually injected at least once. */
    readonly usedPatterns?: number;
    /** Number of sources registered in the durable cross-project knowledge brain. */
    readonly brainSources: number;
    /**
     * KU-объём КАЖДОГО источника, в том же порядке, что их перечисляет brain. Владелец 2026-09-09:
     * одно число источников не говорит, велик ли корпус и не пуст ли какой-то из них.
     * Пустой массив означает «перечислить не удалось», а не «источников нет» — их число рядом.
     */
    readonly brainKuCounts: readonly number[];
    /** Hours since the last `dz consolidate` run, if a watermark is present. */
    readonly consolidatedAgeH?: number;
    /** Live `/feature-adr` learning state — present ONLY when a fresh run is in flight. */
    readonly featureAdr?: FeatureAdrState;
    /** Persistent owner-facing store warning; healthy/no-mark/error paths omit it. */
    readonly storeHealth?: StatuslineStoreHealth;
}
/** Render-ready details for a non-healthy store verdict. */
export interface StatuslineStoreHealth {
    readonly verdict: Exclude<StoreHealthVerdict, 'ok' | 'no-mark'>;
    /** Explanation for a health verdict that cannot be inferred from counts alone. */
    readonly reason?: string;
    /** Previous maximum for the affected store tier. */
    readonly previousMax?: number;
    /** Snapshot directory used by cold-start recovery guidance. */
    readonly snapshotPath?: string;
    /** Basenames of store files whose readonly count failed. */
    readonly unreadableFiles?: readonly string[];
}
/** Directory of the per-slug live `/feature-adr` learning-state slots. */
export declare function featureAdrStateDir(projectRoot: string): string;
/**
 * Path of a live `/feature-adr` learning-state file. With a slug this is its namespaced slot;
 * without one this remains the legacy single-slot path for backward-compatible readers/callers.
 */
export declare function featureAdrStatePath(projectRoot: string, slug?: string): string;
/**
 * Read the live `/feature-adr` learning state for one project — the source of the per-run panel.
 *
 * RENDER-PATH DISCIPLINE (statusline pattern #1): this runs inside the ~300ms status-bar refresh, so
 * it is a plain **readonly** file read, **best-effort**, and NEVER throws — an absent, unreadable, or
 * corrupt state file collapses to `undefined`, not an exception.
 *
 * FRESHNESS: a run whose `ts` is older than {@link FEATURE_ADR_FRESH_MS} is treated as finished and
 * returns `undefined`, so a stale run can never keep a panel pinned in the status bar.
 *
 * @param projectRoot Absolute (or cwd-relative) project directory.
 * @param now Injectable clock (epoch ms) for the freshness check — defaults to `Date.now()`.
 */
export declare function readFeatureAdrState(projectRoot: string, now?: number): FeatureAdrState | undefined;
/** Fields the `/feature-adr` pipeline supplies when recording its live learning state. */
export interface WriteFeatureAdrStateInput {
    readonly kind?: 'feature-adr' | 'loop';
    readonly slug: string;
    readonly step: string;
    readonly recalled: number;
    readonly stored: number;
    readonly reinforced?: number;
    readonly mode?: string;
    /** Identity of one pipeline invocation. Empty strings are not identities. */
    readonly runId?: string;
    /** Complexity tier (S/M/L/XL). Invalid/absent → the previous slot's tier is carried forward. */
    readonly tier?: string;
    /**
     * TEST-ONLY seam (ADR-002 C2 RED half): run the slot transaction WITHOUT the
     * `fa-phase-slot` named lock, so `statusline-phase-lock.test.ts` can reproduce the lost update
     * the lock prevents. Never set by any shipped caller — `statusline-phase-lock.test.ts` asserts
     * `grep -c _unsafeSkipLock` on the CLI source is 0, so this cannot be reached from `dz`.
     */
    readonly _unsafeSkipLock?: boolean;
    /**
     * TEST-ONLY seam, the twin of `_unsafeSkipLock`: busy-hold this many ms INSIDE the transition,
     * between reading the previous slot and writing the new one. Without it the read-modify-write
     * window is sub-millisecond and the RED half would be reproducing a race by LUCK — a flaky test
     * is not a proof. With it the interleaving is deterministic in both halves: unlocked, two writers
     * provably observe the same previous slot; locked, they provably do not. Never set by any shipped
     * caller (same grep assertion as `_unsafeSkipLock`).
     */
    readonly _unsafeHoldMs?: number;
    /**
     * TEST-ONLY seam: fail after phase telemetry has been appended but before the slot is written.
     * This makes the partial-write receipt deterministic without fabricating a phase row from a
     * missing previous slot. Never set by a shipped caller.
     */
    readonly _unsafeFailSlotWrite?: boolean;
}
/**
 * The outcome of a slot write. `state` is the slot as written; `refused` is a SHORT machine-ish
 * reason when the operation did not complete. `refusedEffect` says whether no disk effect is known
 * (`none`, callback never began) or a partial effect is possible (`unknown`, callback began).
 * Exactly one of `state` and `refused` is present. The CLI prints `refused` on stderr.
 */
export interface WriteFeatureAdrStateResult {
    readonly state?: FeatureAdrState;
    readonly refused?: string;
    /** Known disk effect of a refusal: `none` before the transaction, `unknown` once it began. */
    readonly refusedEffect?: 'none' | 'unknown';
}
/**
 * Record the live `/feature-adr` learning state — called by the pipeline at Steps 0/8/9. Computes
 * `pool` as the total learned-pattern count (via the same readonly {@link countLearnedPatterns} the
 * panel uses) and writes the JSON with a fresh `ts`. Best-effort: returns the written state, or
 * `undefined` on any I/O error (this must never break the pipeline).
 *
 * @param now Injectable clock (epoch ms) for the write timestamp — defaults to `Date.now()`.
 */
export declare function writeFeatureAdrState(projectRoot: string, input: WriteFeatureAdrStateInput, now?: number): FeatureAdrState | undefined;
/**
 * The same write as {@link writeFeatureAdrState}, but it SAYS WHY it did not complete and what is
 * known about its disk effect. A refusal before the transition returns `refusedEffect:'none'`; once
 * the callback begins, a refusal returns `refusedEffect:'unknown'` because an append or slot write
 * may already have landed. The pipeline still never breaks — the caller decides, this never throws.
 */
export declare function writeFeatureAdrStateDetailed(projectRoot: string, input: WriteFeatureAdrStateInput, now?: number): WriteFeatureAdrStateResult;
/**
 * Gather dz's self-learning counts for one project. FAST + best-effort: every read
 * is guarded so a missing/corrupt `.dz`, absent native module, or locked store
 * yields `0` / an omitted field — this function NEVER throws.
 *
 * @param projectRoot Absolute (or cwd-relative) project directory.
 * @param now Injectable clock (epoch ms) for the consolidation age — defaults to `Date.now()`.
 */
export declare function statuslineData(projectRoot: string, now?: number): StatuslineData;
/**
 * Render the /feature-adr PHASE line (line format B, fa-phase-statusline ADR-001) — the second
 * status-bar line:
 *
 *   `📐 <slug> [<tier>] <done>/<total> ▶ <step label> · <N>м/—`
 *
 * States, in precedence order:
 * - `undefined` (no line): a loop slot, the terminal label `done`, or ≥90 min of slot silence;
 * - `⚠ <N>м без отчёта` from 30 min of slot silence (counted from the last report `ts`);
 * - a label starting `⛔` or `⏸` replaces the `▶ <label>` portion VERBATIM (failure/waiting states
 *   are reported by the pipeline through the label itself, never synthesised here);
 * - otherwise `▶ <label>` with elapsed minutes counted from the PHASE start (`phaseStartTs`).
 *
 * done/total is the label's step-number position in its tier's active-step list; an unknown tier,
 * an unparseable label, or a number outside the list renders `?/?` — the panel never guesses.
 * The estimate slot is fixed-width at the tail: v1 defers estimates entirely, so it is always `/—`
 * (a future median would be computed on the WRITE path and stored in the slot as a ready number —
 * this render path stays a pure function over the slot, no DB, no subprocess, no features/* sweep).
 *
 * @param state A fresh slot from {@link readFeatureAdrState} (the ONLY source of "in progress").
 * @param now Injectable clock (epoch ms) — defaults to `Date.now()`.
 */
export declare function renderFeatureAdrPhaseLine(state: FeatureAdrState, now?: number): string | undefined;
//# sourceMappingURL=statusline.d.ts.map