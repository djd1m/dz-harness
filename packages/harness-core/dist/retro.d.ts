/**
 * `dz retro` — what was done over a day, a week or a month.
 *
 * This module is PURE: no filesystem, no network, and — load-bearing — no clock. The window arrives
 * as a parameter, because a window you cannot pin in a test is a window whose arithmetic errors you
 * cannot catch. MEASURED in this project 2026-08-22: an agent's timestamp was off by a YEAR, the
 * query returned 15 530 "hits" for a "week", and nothing about the output looked wrong.
 *
 * Its second job is refusing. Half of an honest report is declining to answer what the data cannot
 * support, and those refusals live here as behaviour — types that cannot express a quarter, a
 * decision function that names the real span in days, and a three-state section verdict where
 * "the source said nothing" and "the source was not read" can never collapse into one zero.
 *
 * See features/dz-retro/03_adr/ for the decisions and the measurements behind them.
 */
/** The only horizons this project has the data for. A quarter or a year is NOT SPELLABLE (ADR-001). */
export type RetroHorizon = 'day' | 'week' | 'month';
/** Horizons a user may ASK for — recognised so they are refused loudly, never swallowed. */
export type RefusedHorizon = 'quarter' | 'half-year' | 'year';
export declare const REFUSED_HORIZONS: readonly RefusedHorizon[];
export interface RetroWindow {
    readonly horizon: RetroHorizon;
    /** Inclusive ISO date (YYYY-MM-DD) of the first day in the window. */
    readonly startIso: string;
    /** Inclusive ISO date of the last day — the anchor. */
    readonly endIso: string;
    readonly days: number;
}
/**
 * The window for a horizon, anchored on an EXPLICIT date. Never reads the clock.
 * `atIso` may be a full timestamp; only its date part is used.
 */
export declare function retroWindow(horizon: RetroHorizon, atIso: string): RetroWindow;
/** Is this instant inside the window? Compared in UTC, never as strings (ADR/AM-5). */
export declare function withinWindow(w: RetroWindow, isoInstant: string): boolean;
export interface HorizonDecision {
    readonly action: 'report' | 'refuse';
    readonly reason: string;
}
/**
 * May we report over the requested horizon at all?
 *
 * `spanDays` is the age of the LONGEST record we actually hold. Asking for a year over 174 days of
 * data is not a thin report — it is an invented one, so it is refused and the real span is named.
 */
export declare function decideHorizon(input: {
    requested: string;
    spanDays: number;
}): HorizonDecision;
export type SectionStatus = 'full' | 'partial' | 'unavailable';
export interface SectionVerdict {
    readonly status: SectionStatus;
    /** The date this source's records begin — computed from the source itself, never hardcoded. */
    readonly dataStart: string | null;
    readonly note: string;
}
/**
 * Does this source cover the whole window?
 *
 * `dataStart: null` means the source was NOT READ — a different fact from "read, and empty".
 * Collapsing the two is how a report says "nothing happened" about a week it could not see.
 */
export declare function sectionStatus(input: {
    dataStart: string | null;
    windowStart: string;
}): SectionVerdict;
export interface ForbiddenMetric {
    readonly name: string;
    /** The measurement that disqualifies it. A bare ban decays into a word list. */
    readonly reason: string;
}
/**
 * Measures of the INSTRUMENT, not of the work (ADR-003). Each will be proposed again precisely
 * because each is a one-liner to compute, so each carries the measurement that refutes it.
 */
export declare const FORBIDDEN_METRICS: readonly ForbiddenMetric[];
export interface Delivery {
    readonly slug: string;
    readonly createdIso: string;
    /** 'unique' carries a grade; 'ambiguous' and 'none' are facts about the report, not gaps. */
    readonly gradeStatus: 'unique' | 'ambiguous' | 'none' | 'no-report';
    readonly grade: string | null;
}
export interface Publish {
    readonly pkg: string;
    readonly version: string;
    readonly iso: string;
}
export interface GuardRun {
    readonly iso: string;
    readonly verdict: string;
    readonly rules: readonly string[];
}
export interface ReuseFacts {
    readonly dataStart: string | null;
    readonly eventsInWindow: number;
    readonly lessonsEverRecalled: number;
    readonly lessonsTotal: number;
}
export interface SourceFacts<T> {
    readonly dataStart: string | null;
    readonly items: readonly T[];
}
export interface RetroFacts {
    readonly window: RetroWindow;
    /** The longest record we hold, in days — what `decideHorizon` judges against. */
    readonly spanDays: number;
    /** `null` means NOT READ. An empty `items` means read-and-empty. The type keeps them apart. */
    readonly deliveries: SourceFacts<Delivery> | null;
    readonly publishes: SourceFacts<Publish> | null;
    readonly guard: SourceFacts<GuardRun> | null;
    readonly reuse: ReuseFacts | null;
    /** Feature dirs on disk that git has never seen — the report is blind to them, and says so. */
    readonly uncommittedSlugs: readonly string[];
}
export interface RetroSection {
    readonly id: 'deliveries' | 'publishes' | 'discipline' | 'reuse';
    readonly title: string;
    readonly verdict: SectionVerdict;
    readonly lines: readonly string[];
}
export interface RetroReport {
    readonly window: RetroWindow;
    readonly spanDays: number;
    readonly sections: readonly RetroSection[];
    readonly caveats: readonly string[];
}
export declare function buildRetro(facts: RetroFacts): RetroReport;
/** The human rendering. `--json` prints the SAME `RetroReport` — one structure, two spellings (FR-6). */
export declare function renderRetro(report: RetroReport): string[];
//# sourceMappingURL=retro.d.ts.map