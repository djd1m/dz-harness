export type CadenceWindow = 'day' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year';
export declare const CADENCE_WINDOW_DAYS: Record<CadenceWindow, number>;
export interface CadenceWindowDecision {
    readonly ok: boolean;
    readonly reason: string;
    /** The largest window today's record CAN honestly carry, or null when even `day` cannot. */
    readonly largestAllowed: CadenceWindow | null;
}
/**
 * ADR-001: a window is accepted only when the record is at least TWO windows deep — two full units
 * are the minimum for the word «cadence»; one point has no rhythm.
 */
export declare function decideCadenceWindow(window: CadenceWindow, dataDepthDays: number): CadenceWindowDecision;
/** ISO week key (YYYY-Www) for a ms timestamp. */
export declare function isoWeekOf(ms: number): string;
export interface CadenceEvent {
    readonly ts: number;
    readonly kind: string;
    readonly detail?: string;
}
/** Bucket events into ISO weeks inside [windowStart, now]. */
export declare function weeklyBuckets(events: readonly CadenceEvent[], windowStartMs: number, nowMs: number): Map<string, CadenceEvent[]>;
export interface GuardDecayRow {
    readonly rule: string;
    readonly before: number;
    readonly inWindow: number;
}
declare const ROUND_OUTCOMES: readonly ["shipped", "refuted", "blocked", "abandoned", "done", "timeout", "session-limit", "model-refused", "failed", "empty"];
type RoundSummaryOutcome = typeof ROUND_OUTCOMES[number];
export interface RoundsSummary {
    readonly total: number;
    readonly byStage: Readonly<Record<'round' | 'round-exec', number>>;
    readonly byOutcome: Readonly<Record<RoundSummaryOutcome, number>>;
    readonly unfinished: readonly {
        readonly slug: string;
        readonly round: number;
        readonly stage: 'round' | 'round-exec';
        readonly outcome: string;
        readonly reason: string | null;
        readonly date: string;
    }[];
    readonly minutes: number;
    readonly tokens: number;
    readonly tokensUnknown: number;
    readonly malformed: number;
}
/** Pure round-ledger projection over a closed time window. Unknown outcomes stay visible. */
export declare function summarizeRounds(rows: readonly unknown[], window: {
    readonly windowStartMs: number;
    readonly nowMs: number;
}): RoundsSummary;
/**
 * Repeat decay over the FIXED set: only rules with at least one event BEFORE the window start
 * qualify (their existence predates the window); newborn rules are EXCLUDED by construction and
 * returned separately so the exclusion is visible.
 */
export declare function guardRepeatDecay(events: readonly {
    ts: number;
    rule: string;
}[], windowStartMs: number): {
    decay: GuardDecayRow[];
    excludedNewborn: string[];
};
export interface CadenceReport {
    readonly window: CadenceWindow;
    readonly decision: CadenceWindowDecision;
    readonly depthDays: number;
    readonly shipments: {
        graded: Record<string, number>;
        ungraded: number;
        gradedTotal: number;
        byGrade: Record<string, number>;
    };
    readonly npmPublishes: {
        weekly: Record<string, number>;
        degraded: string | null;
    };
    readonly guard: {
        decay: GuardDecayRow[];
        excludedNewborn: string[];
        degraded: string | null;
    };
    readonly recalls: {
        weekly: Record<string, number>;
        degraded: string | null;
    };
    readonly rounds: RoundsSummary & {
        readonly commitsInWindow: number | null;
        readonly degraded: string | null;
    };
}
/** Build the full report. `now` injectable — the refusal decision must be testable. */
export declare function buildCadenceReport(root: string, window: CadenceWindow, now?: number, commitsInWindow?: number | null): CadenceReport;
export {};
//# sourceMappingURL=cadence.d.ts.map