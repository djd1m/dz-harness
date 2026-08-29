/**
 * Writer-quiescence probe for Step 8 — feature qe-writer-quiescence (backlog 700b46a4).
 *
 * MEASURED (crossrt-1, 2026-08-18): Step-8 graded a MOVING tree — a background worker wrote at
 * 19:25, 19:32 and 19:46, AFTER the verdict, its last write clobbering a file the same round had
 * just written. The reviewer hand-waited six consecutive 30-second zero-write windows and
 * re-measured everything. This module is that wait, as a machine: the same idea the publish gate
 * already enforces («не публикуй, пока рой жив»), applied to grading.
 *
 * A BELT, not the root: mutual exclusion of writers (worktree isolation) is item 9520e506. The
 * probe therefore NEVER blocks a run — a moving tree downgrades the verdict's standing loudly
 * instead of stopping the pipeline.
 *
 * PURE: the shell script is GENERATED here and executed by a workflow agent (the workflow sandbox
 * has no child_process — the agent is the shell, same as the landing barrier); the answer is
 * PARSED here, parse-never-synthesize: an empty or malformed probe is 'inconclusive', never
 * 'quiet'.
 */
export interface WriterQuiescenceDecision {
    readonly verdict: 'quiet' | 'moving' | 'inconclusive';
    /** Per-window changed counts actually parsed, in order. */
    readonly windows: readonly number[];
    readonly note: string;
}
export declare const WQ_WINDOW_SECONDS = 20;
export declare const WQ_MAX_WINDOWS = 9;
export declare const WQ_REQUIRED_QUIET = 3;
/**
 * The probe script a workflow agent runs verbatim. Polls the declared targets PLUS the feature
 * dir (FR-4: the feature's own artifacts are exactly the surface crossrt-1 saw clobbered) in
 * fixed windows; prints one `WQ-WINDOW <n> changed=<count>` line per window and exits early after
 * `requiredQuiet` consecutive zeros. `find -newermt '-<w+5> seconds'` widens the lookback slightly
 * past the sleep so a write on the window boundary cannot fall between two polls.
 */
export declare function quiescenceProbeScript(paths: readonly string[], opts?: {
    windowSeconds?: number;
    maxWindows?: number;
    requiredQuiet?: number;
}): string;
/** Parse the probe transcript into a verdict. Empty/malformed ⇒ inconclusive, never quiet. */
export declare function decideWriterQuiescence(probeText: unknown, requiredQuiet?: number): WriterQuiescenceDecision;
//# sourceMappingURL=writer-quiescence.d.ts.map