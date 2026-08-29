/**
 * Scout memory store — persists scan history between runs.
 *
 * Uses @dzhechkov/memory JsonFileBackend for zero-dependency persistence.
 * Stores RepoProfiles as MemoryRecords, tracks seen/new status, and
 * supports Reflexion feedback for user decisions.
 *
 * @packageDocumentation
 */
import type { RepoProfile, IntelligenceReport } from './types.js';
/** Retention/cap config for the scan history. Missing/corrupt → these defaults. */
export interface ScoutMemoryConfig {
    /** Drop non-decision entries older than this many days. Default 90. */
    readonly retentionDays: number;
    /** Hard ceiling on tracked entries (userDecision entries are always kept). Default 500. */
    readonly maxEntries: number;
}
/** Stored scan record. */
export interface ScanRecord {
    readonly fullName: string;
    readonly firstSeen: string;
    readonly lastSeen: string;
    readonly relevanceScore: number;
    readonly recommendation: string;
    readonly source: string;
    readonly userDecision?: string | undefined;
}
/** Diff between two scans. */
export interface ScanDiff {
    readonly newRepos: readonly RepoProfile[];
    readonly goneRepos: readonly string[];
    readonly changedScore: readonly {
        fullName: string;
        oldScore: number;
        newScore: number;
    }[];
    readonly totalPrevious: number;
    readonly totalCurrent: number;
}
/** Scout memory store — file-backed, zero dependencies. */
export declare class ScoutMemory {
    private readonly storeDir;
    private history;
    private readonly config;
    /** Number of entries pruned during the most recent save(). */
    private prunedLast;
    constructor(storeDir?: string | undefined);
    /** Load config from disk (best-effort). Missing/corrupt/partial → defaults, never throws. */
    private loadConfig;
    /** Load history from disk. */
    private load;
    /**
     * Prune stale/overflow entries in place. Non-destructive of meaningful data:
     * entries carrying a `userDecision` (human feedback) are ALWAYS preserved,
     * regardless of age or the maxEntries ceiling. Deterministic ordering.
     * @returns number of entries pruned.
     */
    private prune;
    /** Save history to disk (applies retention/cap first). @returns entries pruned. */
    save(): number;
    /** Entries pruned during the most recent save() (retention/cap). */
    get lastPruned(): number;
    /** Check if a repo has been seen before. */
    isSeen(fullName: string): boolean;
    /** Get the stored record for a repo. */
    getRecord(fullName: string): ScanRecord | undefined;
    /** Total tracked repos. */
    get size(): number;
    /** Update history with new scan results. Returns count of new repos. */
    ingest(repos: readonly RepoProfile[], source?: string): number;
    /** Record a user decision for a repo (integrate/monitor/skip). */
    recordDecision(fullName: string, decision: string): void;
    /** Compute diff between current scan and stored history. */
    diff(currentRepos: readonly RepoProfile[]): ScanDiff;
    /** Save last report for offline access. */
    saveReport(report: IntelligenceReport): void;
    /** Load last saved report. Returns null if none. */
    loadReport(): IntelligenceReport | null;
    /** Generate diff markdown. */
    diffMarkdown(d: ScanDiff): string;
}
//# sourceMappingURL=memory-store.d.ts.map