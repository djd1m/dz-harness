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
    /** Optional run mode (e.g. "reference", "full-qe", "full-qe-extended"). */
    readonly mode?: string;
}
/** A snapshot of dz's self-learning state for one project (all fields best-effort). */
export interface StatuslineData {
    /** Count of learned patterns in the project's unified memory store. */
    readonly patterns: number;
    /** Count of learned patterns that the live recall hook has actually injected at least once. */
    readonly usedPatterns?: number;
    /** Number of sources registered in the durable cross-project knowledge brain. */
    readonly brainSources: number;
    /** Hours since the last `dz consolidate` run, if a watermark is present. */
    readonly consolidatedAgeH?: number;
    /** Live `/feature-adr` learning state — present ONLY when a fresh run is in flight. */
    readonly featureAdr?: FeatureAdrState;
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
 * Gather dz's self-learning counts for one project. FAST + best-effort: every read
 * is guarded so a missing/corrupt `.dz`, absent native module, or locked store
 * yields `0` / an omitted field — this function NEVER throws.
 *
 * @param projectRoot Absolute (or cwd-relative) project directory.
 * @param now Injectable clock (epoch ms) for the consolidation age — defaults to `Date.now()`.
 */
export declare function statuslineData(projectRoot: string, now?: number): StatuslineData;
//# sourceMappingURL=statusline.d.ts.map