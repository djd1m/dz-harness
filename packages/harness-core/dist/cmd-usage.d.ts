/**
 * Command-invocation accounting for `dz deadwood`.
 *
 * The write leg is a single best-effort append. The report leg is pure: callers
 * inject log text, inventory, an allowlist, and a clock. A usage report is
 * advisory only and never mutates the harness surface it describes.
 *
 * @packageDocumentation
 */
export declare const CMD_USAGE_LOG_RELATIVE = ".dz/cmd-usage.jsonl";
export declare const CMD_USAGE_LOG_MAX_BYTES = 1048576;
export declare const CMD_USAGE_COMPACT_TARGET_BYTES: number;
export declare const CMD_USAGE_SCHEMA = 1;
export declare const CMD_USAGE_V1_EPOCH_MS: number;
export declare const DEADWOOD_FUTURE_TOLERANCE_MS = 86400000;
export declare const DEADWOOD_MIN_OBSERVED_DAYS = 28;
export declare const DEADWOOD_MIN_RECORDS = 100;
export type DeadwoodSurfaceKind = 'command' | 'skill' | 'rule';
export interface CmdUsageInvocationRecord {
    readonly kind: 'cmd';
    readonly cmd: string;
    readonly ts: string;
    readonly v: 1;
}
export interface CmdUsageAggregateRecord {
    readonly kind: 'agg';
    readonly cmd: string;
    readonly runs: number;
    readonly firstAt: string;
    readonly lastAt: string;
    readonly v: 1;
}
export type CmdUsageRecord = CmdUsageInvocationRecord | CmdUsageAggregateRecord;
export interface ParsedCmdUsage {
    readonly records: readonly CmdUsageRecord[];
    readonly skipped: number;
    readonly outOfRange: number;
}
export interface CmdUsageStat {
    readonly cmd: string;
    readonly runs: number;
    readonly runsInWindow: number;
    readonly firstAt: string;
    readonly lastAt: string;
}
export interface DeadwoodAllowlistEntry {
    readonly surface: string;
    readonly kind: DeadwoodSurfaceKind;
    readonly reason: string;
}
export interface DeadwoodInventoryItem {
    readonly surface: string;
    readonly kind: DeadwoodSurfaceKind;
    /** Alternate typed command tokens folded into this canonical command candidate. */
    readonly aliases?: readonly string[];
}
export type DeadwoodVerdict = 'insufficient-data' | 'ready';
export interface DeadwoodUsedSurface {
    readonly state: 'used';
    readonly surface: string;
    readonly kind: Exclude<DeadwoodSurfaceKind, 'skill'>;
    readonly runs: number;
    readonly runsInWindow: number;
    readonly firstAt: string;
    readonly lastAt: string;
}
export interface DeadwoodCandidate {
    readonly state: 'zero-usage';
    readonly surface: string;
    readonly kind: Exclude<DeadwoodSurfaceKind, 'skill'>;
    readonly runs: number;
    readonly runsInWindow: 0;
    readonly firstAt: string | null;
    readonly lastAt: string | null;
}
export interface DeadwoodExemptSurface {
    readonly state: 'excluded-safety';
    readonly surface: string;
    readonly kind: Exclude<DeadwoodSurfaceKind, 'skill'>;
    readonly reason: string;
    readonly runs: number;
    readonly runsInWindow: 0;
    readonly firstAt: string | null;
    readonly lastAt: string | null;
}
export interface DeadwoodUnjudgedSurface {
    readonly state: 'insufficient-data' | 'no-instrumentation';
    readonly surface: string;
    readonly kind: DeadwoodSurfaceKind;
    readonly reason: string;
}
export interface DeadwoodReport {
    readonly verdict: DeadwoodVerdict;
    readonly windowWeeks: number;
    readonly observedDays: number;
    readonly recordCount: number;
    readonly ruleObservedDays: number;
    readonly ruleAuditCount: number;
    readonly candidates: readonly DeadwoodCandidate[];
    readonly exempt: readonly DeadwoodExemptSurface[];
    readonly used: readonly DeadwoodUsedSurface[];
    readonly insufficient: readonly DeadwoodUnjudgedSurface[];
    readonly noInstrumentation: readonly DeadwoodUnjudgedSurface[];
    readonly staleAllowlist: readonly DeadwoodAllowlistEntry[];
    readonly skippedLines: number;
    readonly outOfRange: number;
}
export interface DeadwoodInput {
    readonly cmdUsageText: string;
    readonly guardAuditText?: string;
    readonly inventory: readonly DeadwoodInventoryItem[];
    readonly allowlistText: string;
    readonly weeks: number;
    readonly now: Date;
}
/** Walk up to the nearest `.dz` directory without ever making telemetry throw. */
export declare function resolveCmdUsageRoot(startDir: string): string;
/** One append per parsed command, with no argv/cwd/env payload. Never throws. */
export declare function recordCommandInvocation(root: string, cmd: string, now?: Date): void;
/** ADR-compatible name retained for callers/tests written before the plan renamed the seam. */
export declare const appendCommandUsage: typeof recordCommandInvocation;
/** Parse independently per line; torn or schema-invalid rows are counted and skipped. */
export declare function parseCmdUsageLines(text: string, now: Date): ParsedCmdUsage;
/** Measured corpus span (first accepted event to last), or null when no event can be read. */
export declare function measureCmdUsageDepthDays(text: string, now: Date): number | null;
/** A verdict needs both a meaningful sample and history spanning the requested window. */
export declare function decideDeadwoodWindow(depthDays: number, count: number, weeks: number): {
    ok: boolean;
    reason: string;
};
/** Fold raw and compacted rows into the same per-command accounting shape. */
export declare function foldCmdUsage(records: readonly CmdUsageRecord[], weeks: number, now: Date): Map<string, CmdUsageStat>;
/** Parse the committed safety allowlist; a reason-less exemption is refused, never skipped. */
export declare function loadDeadwoodAllowlist(json: string): DeadwoodAllowlistEntry[];
/** Build the single structure consumed by both the human and JSON renderers. */
export declare function buildDeadwoodReport(input: DeadwoodInput): DeadwoodReport;
/** Render one report object as either human text or stable JSON. */
export declare function renderDeadwoodReport(report: DeadwoodReport, format: 'text' | 'json'): string;
/**
 * Lazily compact the invocation log on the cold read path.
 *
 * The named lock protects competing compactors. Emitters deliberately stay
 * lock-free; this advisory log accepts a possible racing row rather than making
 * every command wait on a lock. Every error is swallowed so compaction can never
 * turn `dz deadwood` into a gate.
 */
export declare function compactCmdUsageIfNeeded(root: string): void;
//# sourceMappingURL=cmd-usage.d.ts.map