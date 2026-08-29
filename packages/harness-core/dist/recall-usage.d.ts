/**
 * Pure recall-usage accounting for the dz APPLY leg.
 *
 * The live hook writes one JSONL event when a learned pattern is actually injected into a prompt.
 * This module parses that append-only log, folds it into per-pattern usage stats, and compacts it
 * into aggregate JSONL rows when it crosses a bounded size. It deliberately knows nothing about the
 * filesystem; callers own reads/writes so the hook and statusline can keep their never-block rules.
 *
 * Compaction RE-CHAINS everything it writes and records what it measured in its input, so that a
 * rewrite which counts an event twice fails `verifyEventChain` instead of producing a well-formed
 * lie — the 2 → 4 → 6 defect below is the reason (see `event-chain.ts`, ADR-002).
 *
 * @packageDocumentation
 */
import { type EventChainDefect } from './event-chain.js';
export declare const RECALL_USAGE_LOG_RELATIVE = ".dz/recall-usage.jsonl";
export declare const RECALL_USAGE_LOG_MAX_BYTES = 1048576;
export declare const RECALL_USAGE_COMPACT_TARGET_BYTES: number;
/** Newest query-bearing read rows survive compaction verbatim — they are the replay corpus. */
export declare const RECALL_USAGE_REPLAY_KEEP = 500;
export interface RecallUsageReadRecord {
    readonly dzId: string;
    readonly score: number;
    readonly ts: string;
    /**
     * The PROMPT the lesson was injected into (truncated). Without it the log can say a lesson was
     * used but never say FOR WHAT — which made cold-vs-warm replay unbuildable from 39 recorded
     * events (MEASURED, compounding data inventory 2026-07-28). `.dz/` is git-ignored, so a truncated
     * query stays on this machine.
     */
    readonly query?: string;
    /** The session/run the injection happened in — lets replay group events into runs. */
    readonly runId?: string;
    /** One id per PROMPT (the hook writes one row per injected hit — up to 3 per prompt). */
    readonly eventId?: string;
    /** True when the stored query is a PREFIX of the real prompt — not replayable. */
    readonly queryTruncated?: boolean;
    /**
     * WHICH HOST injected the lesson (ADR-003 §1, H-B additive). Absent ⇒ `claude-code`, so every row
     * written before the Codex leg keeps its meaning without a migration.
     */
    readonly runtime?: Runtime;
}
/** The hosts that run the apply leg. Additive by design: an old reader ignores the field. */
export type Runtime = 'claude-code' | 'codex';
export declare const RUNTIMES: readonly Runtime[];
/** A row without `runtime` predates the Codex leg and is Claude Code's by construction. */
export declare function runtimeOf(record: RecallUsageReadRecord): Runtime;
/** Query text is capped so a pasted wall of text cannot bloat the log. */
export declare const RECALL_USAGE_QUERY_MAX_CHARS = 200;
export interface RecallUsageAggregateRecord {
    readonly kind: 'aggregate';
    readonly dzId: string;
    readonly reads: number;
    readonly firstReadAt: string;
    readonly lastReadAt: string;
    readonly maxScore: number;
    readonly totalScore: number;
    readonly compactedAt: string;
    /**
     * The SET UNION of the runtimes whose reads were folded into this record (sorted, deduped).
     *
     * AM-27, and the whole reason it exists: `compactVerifiedRecallUsageLog` keeps verbatim only the
     * newest {@link RECALL_USAGE_REPLAY_KEEP} read rows that carry a `query`. Everything else — a
     * *fresh* row without `query` included — is folded into this record, whose merge key is `dzId`
     * alone. The allowlist on the READ record therefore never touches the path where provenance is
     * actually lost. The union does.
     *
     * Residual accepted loss, registered in `architecture/degradations.md`: this says WHICH runtimes
     * used a lesson, not HOW OFTEN each did. Widening the merge key to `(dzId, runtime)` would split
     * the stats rows `buildRecallUsageReport` looks up by `dzId` alone — a cross-feature blast radius
     * this leg has no mandate for.
     */
    readonly runtimes?: readonly Runtime[];
}
export type RecallUsageRecord = RecallUsageReadRecord | RecallUsageAggregateRecord;
export interface ParsedRecallUsageLog {
    readonly records: readonly RecallUsageRecord[];
    readonly validLines: number;
    readonly invalidLines: number;
}
export interface RecallUsageStat {
    readonly dzId: string;
    readonly reads: number;
    readonly firstReadAt: string;
    readonly lastReadAt: string;
    readonly maxScore: number;
    readonly avgScore: number;
    /** Set union of contributing runtimes (AM-27). Empty ⇒ nothing carried provenance. */
    readonly runtimes: readonly Runtime[];
}
export interface RecallPatternUsageRef {
    readonly dzId: string;
    readonly pattern: string;
    readonly domain?: string;
    readonly reward?: number;
}
export interface RecallUsagePatternRow extends RecallPatternUsageRef {
    readonly reads: number;
    readonly firstReadAt?: string;
    readonly lastReadAt?: string;
    readonly maxScore?: number;
    readonly avgScore?: number;
}
export interface RecallUsageReport {
    readonly totalPatterns: number;
    readonly usedPatterns: number;
    readonly neverReadPatterns: number;
    readonly totalReads: number;
    readonly unknownReadPatterns: number;
    readonly invalidLines: number;
    readonly top: readonly RecallUsagePatternRow[];
    readonly neverRead: readonly RecallUsagePatternRow[];
    readonly unknown: readonly RecallUsageStat[];
    readonly all: readonly RecallUsagePatternRow[];
}
export interface RecallUsageRecordInput {
    readonly dzId?: unknown;
    readonly score?: unknown;
    readonly ts?: unknown;
    readonly query?: unknown;
    readonly runId?: unknown;
    readonly eventId?: unknown;
    readonly queryTruncated?: unknown;
    readonly runtime?: unknown;
}
/**
 * The normalized RECORD, before serialization — the writer needs the object so it can hang the
 * event-chain fields off it (`seq`/`prevHash`, ADR-001) instead of string-splicing a finished line.
 */
export declare function buildRecallUsageRecord(input: RecallUsageRecordInput): RecallUsageReadRecord | undefined;
export declare function formatRecallUsageRecord(input: RecallUsageRecordInput): string | undefined;
export declare function parseRecallUsageLog(text: string): ParsedRecallUsageLog;
export declare function aggregateRecallUsage(records: readonly RecallUsageRecord[]): readonly RecallUsageStat[];
export declare function buildRecallUsageReport(patterns: readonly RecallPatternUsageRef[], parsed: ParsedRecallUsageLog): RecallUsageReport;
export declare function shouldCompactRecallUsageLogSize(sizeBytes: number, maxBytes?: number): boolean;
export interface CompactRecallUsageOptions {
    readonly maxBytes?: number;
    readonly targetBytes?: number;
    readonly compactedAt?: string;
    /**
     * Compact even when the input's chain is already defective. OFF by default and never set by any
     * automatic caller — see {@link compactRecallUsageLogChecked} for why.
     */
    readonly force?: boolean;
}
export type CompactRecallUsageStatus = 'compacted' | 'refused-dirty' | 'too-large';
export interface CompactRecallUsageResult {
    readonly status: CompactRecallUsageStatus;
    /** Empty unless `status === 'compacted'`. */
    readonly text: string;
    /** The input defects that caused a refusal. */
    readonly defects: readonly EventChainDefect[];
}
/**
 * Compaction with its verdict attached.
 *
 * AM-2 (Codex QE HIGH-2) — A REWRITER MUST NOT LAUNDER. Compaction parses the input, drops what it
 * cannot read and re-chains from genesis, so a file carrying a `BrokenLink` or a `DoubleCounted`
 * came out the other side verifying `ok: true`. The strongest evidence check in the system was
 * being erased by the routine that runs automatically at a size threshold — corruption converted
 * into a clean chain, with no record that it ever existed.
 *
 * So: the input is VERIFIED FIRST, and a defective chained region REFUSES. The pre-chain prefix is
 * legal and never blocks anything (FR-5); only real defects do.
 *
 * ACCEPTED CONSEQUENCE, stated because it is the cost: a log that stays defective stops being
 * compacted and grows past its cap. That is the right way round — the size cap is a convenience,
 * the evidence is the product — and it is not silent: `dz doctor` and `dz compounding` both report
 * the chain defect, and the caller logs the refusal.
 */
export declare function compactRecallUsageLogChecked(text: string, opts?: CompactRecallUsageOptions): CompactRecallUsageResult;
/**
 * Back-compatible wrapper: the compacted text, or `''` when the rewrite is REFUSED (a defective
 * input) or cannot fit. Callers that need to tell those apart use
 * {@link compactRecallUsageLogChecked}.
 */
export declare function compactRecallUsageLog(text: string, opts?: CompactRecallUsageOptions): string;
export interface AppendRecallUsageHit {
    readonly dzId: unknown;
    readonly score: unknown;
}
export interface AppendRecallUsageInput {
    /** Project ROOT (the helper walks up to it; a cwd-relative writer splits the log — AM-5). */
    readonly projectRoot: string;
    readonly hits: readonly AppendRecallUsageHit[];
    /** The host that injected. Omitted ⇒ `claude-code`, matching every pre-Codex row. */
    readonly runtime?: Runtime;
    readonly query?: string | undefined;
    readonly runId?: string | undefined;
    /** One id per PROMPT. Generated when absent so a multi-hit prompt still counts as one event. */
    readonly eventId?: string | undefined;
    readonly now?: string;
    /** Test seam. Production leaves it unset and the path is derived from `projectRoot`. */
    readonly logPath?: string;
}
/**
 * Append one prompt's injected hits as CHAINED rows.
 *
 * @returns the number of rows appended; **0** on any failure (unwritable directory, unreadable
 *          tail, empty input). Never throws.
 */
export declare function appendRecallUsage(input: AppendRecallUsageInput): number;
/**
 * Recall events recorded for one run key — DISTINCT prompts, not rows.
 *
 * Why this exists: the /feature-adr live panel asserted `--recalled 3` as a LITERAL at three call
 * sites, because the fallback writer that lights the panel had nowhere to get a real number. Now
 * that `dz recall` records its own reads, the number is derivable — this is the derivation.
 *
 * Counted by `eventId`, not by row: one prompt that surfaced four lessons writes four rows sharing
 * one eventId, and "recalled 4" would overstate what the operator did by a factor of hits-per-query.
 * Rows predating eventIds (the log's schema grew) count one each — their rows WERE one-per-event.
 *
 * Returns null when the log cannot be read — the caller must record "unknown", never zero: an
 * unreadable log and a run that recalled nothing are different facts (the dz sync 0/0 class).
 */
export declare function countRecallEventsForRun(projectRoot: string, runId: string): number | null;
//# sourceMappingURL=recall-usage.d.ts.map