/**
 * Hash-chained, sequence-numbered learning-event logs (feature `event-chain`, ADR-001/ADR-002).
 *
 * `.dz/recall-usage.jsonl` and `.dz/guard-audit.jsonl` are the ENTIRE evidence base for every
 * `dz compounding` verdict and for `dz guard promote`. Before this module a record had no identity
 * and no link to its neighbour, so a defect in the code that REWRITES those files was invisible to
 * everything except a human noticing a wrong number — which is exactly how the 2 → 4 → 6
 * double-count in `compactRecallUsageLog` was found (fixed 2026-07-28, see `recall-usage.ts`).
 *
 * WHAT THIS IS. A corruption check for OUR OWN bugs: a buggy compaction, a torn write, two writers
 * racing. Each appended record carries `seq` (monotonic within its segment) and `prevHash` (FNV-1a
 * over the previous record's line, exactly as it sits on disk), and {@link verifyEventChain}
 * classifies what it finds.
 *
 * WHAT THIS IS NOT — read {@link EVENT_CHAIN_SCOPE} before describing it to anyone. FNV-1a is not
 * cryptography and the threat model has no adversary: anyone who can edit the log can recompute the
 * chain in one line of code. That is deliberate and sufficient, because the failures we actually
 * ship are our own. ruview's ADR-010 names a `TamperedEntry` class; this module does not, because a
 * defect class called "Tampered" IS the over-claim.
 *
 * FNV-1a collisions are CONSTRUCTIBLE — a 32-bit hash has none of the collision resistance a
 * cryptographic one does, and a reviewer demonstrated a pair (Codex QE LOW-8). That is a documented
 * property, not a surprise: the chain detects ACCIDENT classes (a compaction bug, a torn write, a
 * race), not chosen-input attacks, which is exactly the corruption-not-tamper scope above. Swapping
 * in sha256 would buy nothing this threat model needs and would invite the over-claim back.
 *
 * Everything here is PURE — no filesystem, no clock. Writers own their IO (the house pattern from
 * `recall-usage.ts`), which is what keeps the never-block discipline of the apply leg intact.
 *
 * @packageDocumentation
 */
/** The one sentence that states what the chain is and is not. Printed by every verify surface. */
export declare const EVENT_CHAIN_SCOPE: string;
/** `prevHash` of the first record of a chain segment. */
export declare const EVENT_CHAIN_GENESIS_HASH = "00000000";
/** How many bytes of a log's tail a writer needs to read to find the last line. */
export declare const EVENT_CHAIN_TAIL_BYTES = 65536;
/**
 * Bytes charged per line for its chain fields when a rewriter budgets its output. Measured against
 * the widest realistic shape: `,"seq":<up to 15 digits>,"prevHash":"xxxxxxxx",` plus the reset
 * marker — deliberately generous, because under-charging would blow a byte cap.
 */
export declare const EVENT_CHAIN_FIELD_OVERHEAD_BYTES = 64;
/** Marker record a rewriter puts first so its output can be checked against its input (ADR-002). */
export declare const EVENT_CHAIN_LEDGER_KIND = "chain-ledger";
export type EventChainDefectKind = 
/** A record's `prevHash` does not match the line before it — or a hole where a link should be. */
'BrokenLink'
/** The same `seq` appears twice in one segment — a rewrite duplicated a line, or two writers raced. */
 | 'DuplicateSeq'
/** `seq` went backwards without a recorded segment restart. */
 | 'NonMonotonicSeq'
/** A line that is not a readable record — the shape a partial write leaves. */
 | 'TornTail'
/** A rewrite accounts for more events than it measured in its input (ADR-002 — the 2 → 4 → 6 class). */
 | 'DoubleCounted'
/** A rewrite's own three numbers do not add up, or claim an impossible drop (ADR-002 AM-3). */
 | 'LedgerImbalance'
/** A ledger line whose fields are missing, mistyped or non-finite — never silently ignored (AM-5). */
 | 'MalformedLedger'
/** A rewrite's claim was never completed: the segment restarted or the file ended first (AM-4). */
 | 'ClaimInterrupted';
/**
 * The defect vocabulary, as data. ruview's ADR-010 names one more class that this list deliberately
 * omits — a class whose name would assert exactly the promise {@link EVENT_CHAIN_SCOPE} refuses —
 * and a test asserts no kind here ever grows that vocabulary.
 */
export declare const EVENT_CHAIN_DEFECT_KINDS: readonly EventChainDefectKind[];
export interface EventChainDefect {
    readonly kind: EventChainDefectKind;
    /** 1-based index into the lines handed to the verifier. */
    readonly line: number;
    readonly detail: string;
    readonly seq?: number;
}
export interface EventChainVerification {
    readonly ok: boolean;
    /** Non-empty lines examined. */
    readonly lines: number;
    /** Lines carrying a well-formed `seq` + `prevHash`. */
    readonly chained: number;
    /**
     * Leading run of records written before chaining existed. LEGAL, never a defect — the chain is
     * allowed to start mid-file. Reported so the uncovered part is honest rather than invisible.
     */
    readonly preChainPrefix: number;
    /** Recorded discontinuities (`chainReset: true`) — a torn tail the writer refused to paper over. */
    readonly resets: number;
    /** Highest `seq` seen in the last segment, or null when nothing is chained. */
    readonly lastSeq: number | null;
    readonly defects: readonly EventChainDefect[];
    /** {@link EVENT_CHAIN_SCOPE}, carried in the result so no surface can print a verdict without it. */
    readonly scope: string;
}
export interface ChainFields {
    readonly seq: number;
    readonly prevHash: string;
    /** Present only when the writer had to start a fresh segment because the tail was unreadable. */
    readonly chainReset?: true;
}
export interface EventChainLedger {
    readonly kind: typeof EVENT_CHAIN_LEDGER_KIND;
    /** Event weight of the INPUT, measured before aggregation. */
    readonly sourceEvents: number;
    /** What a byte budget deliberately discarded — so trimming is not mistaken for loss. */
    readonly droppedEvents: number;
    /** Last `seq` this rewrite wrote. Records past it are outside the claim. */
    readonly throughSeq: number;
    readonly compactedAt: string;
}
/**
 * FNV-1a, 32 bits, over both UTF-16 bytes of every code unit in order.
 *
 * Both bytes, unconditionally: folding with `& 0xff` would make every Cyrillic pair that shares a
 * low byte collide, and these logs carry Russian prompts. 32 bits gives roughly a 1-in-4.3e9
 * accidental-collision chance per link, which is the right size for detecting a bug and the wrong
 * size for detecting an enemy — see {@link EVENT_CHAIN_SCOPE}.
 */
export declare function fnv1a32(text: string): string;
/** The hash a record's successor must carry. Input is the line AS WRITTEN (ADR-001 decision 2). */
export declare function chainHashOf(line: string): string;
/** Non-empty lines of a JSONL text, terminators stripped. The one splitter both sides use. */
export declare function chainLinesOf(text: string): string[];
/**
 * Last usable line of a log's TAIL chunk — all a writer needs to extend the chain (FR-2).
 *
 * When the chunk does not start at byte 0 its first line may be a fragment; with more than one line
 * present the fragment is simply not the last one, and with exactly one line the caller is looking
 * at a single record longer than {@link EVENT_CHAIN_TAIL_BYTES}, which no writer here produces —
 * that returns `undefined`, and the caller starts a marked segment rather than chaining onto a guess.
 */
export declare function lastChainLine(tailText: string, opts?: {
    readonly partial?: boolean;
}): string | undefined;
/** What an appender needs to know about the file it is about to extend. */
export interface LogTail {
    readonly lastLine: string | undefined;
    /**
     * False when the file's final byte is not a newline — the shape a torn write leaves.
     *
     * LOAD-BEARING: appending straight onto a fragment GLUES the new record to it, so one torn write
     * silently eats the next one too. (Found by the CLI torn-tail test, 2026-07-29 — the first append
     * after a truncated line produced a single unreadable line instead of a marked restart.) The
     * appender emits a leading newline so the damage stays exactly one record wide.
     */
    readonly endsWithNewline: boolean;
    /**
     * True when the file is NOT empty but no complete record could be found in the tail window.
     *
     * AM-6 (Codex QE MED-6): without this, a torn record longer than {@link EVENT_CHAIN_TAIL_BYTES}
     * gave `lastLine: undefined`, which is indistinguishable from an EMPTY file — so the appender
     * started an UNMARKED genesis segment and quietly broke the marked-segment contract that ADR-001
     * D4 exists to enforce. "I saw nothing" and "there is nothing" are different facts.
     */
    readonly unreadable: boolean;
}
/** Read a tail chunk into the facts an appender needs. `partial` ⇒ the chunk starts mid-file. */
export declare function readTailInfo(tailText: string, opts?: {
    readonly partial?: boolean;
}): LogTail;
/** An empty log — what an appender assumes when the file is absent. */
export declare const EMPTY_LOG_TAIL: LogTail;
/**
 * The exact text to append for a run of records: chained, newline-terminated, and preceded by a
 * newline when the file ends mid-line. THE one place that knows how to extend one of these logs —
 * the recall hook and the guard audit must not each carry their own copy of this reasoning.
 */
export declare function appendChainedLines(records: readonly object[], tail?: LogTail): string;
/**
 * The chain fields the next appended record must carry, derived from the last line ALONE.
 *
 * TOTAL by construction — it cannot throw for any input, because the apply-leg hook's top safety
 * property is never-block (ADR-001 D2). Every unreadable shape resolves the same way: start a fresh
 * segment AND record the discontinuity, so a break is visible instead of silently healed (D4).
 *
 * - no last line (new/empty file)              → genesis, no marker: this is a chain START
 * - last line is an unchained record           → genesis, no marker: the chain starts mid-file (FR-5)
 * - last line is a chained record              → `seq + 1`, linked to that line's hash
 * - last line is unreadable / has a bad `seq`  → genesis + `chainReset: true` (FR-3)
 */
export declare function nextChainFields(lastLine: string | undefined, opts?: {
    readonly forceReset?: boolean;
}): ChainFields;
/** Append the chain fields to a record. Fields go LAST so readers that whitelist keys are unaffected. */
export declare function withChainFields<T extends object>(record: T, fields: ChainFields): T & ChainFields;
/**
 * Serialise a run of records into chained lines (no trailing newline on each), continuing from
 * `lastLine`. Used both by the appenders (1..3 records per prompt) and by the rewriters.
 */
export declare function chainRecordLines(records: readonly object[], lastLine: string | undefined, opts?: {
    readonly forceReset?: boolean;
}): string[];
/**
 * Default event weight of a line (ADR-002 decision 4): the ledger itself weighs nothing, an
 * aggregate weighs the reads it folded, anything else is one event.
 */
export declare function defaultEventWeight(record: Record<string, unknown>): number;
/**
 * Build the chained lines of a full rewrite: a {@link EventChainLedger} first, then the records.
 *
 * `sourceEvents` must be measured from the INPUT, before aggregation — a number derived from the
 * output can never disagree with it, which is the whole point (ADR-002).
 */
export declare function chainRewrite(records: readonly object[], opts: {
    readonly sourceEvents: number;
    readonly droppedEvents?: number;
    readonly compactedAt: string;
}): string[];
/** Total event weight of a JSONL text — the measurement a rewriter records as `sourceEvents`. */
export declare function eventWeightOfText(text: string, weightOf?: (record: Record<string, unknown>) => number): number;
export interface VerifyEventChainOptions {
    readonly eventWeight?: (record: Record<string, unknown>) => number;
}
/**
 * Verify a chained log. PURE: hand it the lines, get back every defect it can name.
 *
 * A file that has never been chained verifies OK with `preChainPrefix === lines` — records written
 * before chaining existed are legal, and the uncovered prefix is reported as a count rather than
 * flagged (FR-5). Once the chain starts, an unchained record after it is a hole (`BrokenLink`).
 */
export declare function verifyEventChain(lines: readonly string[], opts?: VerifyEventChainOptions): EventChainVerification;
/**
 * What a rewriter must observe about the live file to know nobody appended behind its back.
 *
 * A read → compute → temp → rename rewrite has a window: an append landing after the read is
 * OVERWRITTEN by the rename, and — because it was never in the input the ledger measured — verify
 * reports the result as perfectly clean. Silent loss, invisible to the very check built to see it.
 */
export interface RewriteSnapshot {
    readonly bytes: number;
    readonly lines: number;
    readonly lastLine: string | undefined;
    /** FNV over the WHOLE text: bytes+lines+lastLine miss an equal-length edit to a non-tail line
     *  (Codex re-QE HIGH) — only a full-content hash makes "unchanged" mean unchanged. */
    readonly textHash: string;
}
export declare function rewriteSnapshot(text: string): RewriteSnapshot;
/** True when the live file is byte-for-byte where the snapshot left it. */
export declare function rewriteSnapshotUnchanged(a: RewriteSnapshot, b: RewriteSnapshot): boolean;
export type GuardedRewriteStatus = 
/** The rewrite landed. */
'rewritten'
/** Another rewriter holds the lock — this one did nothing, which is correct. */
 | 'locked'
/** Appends kept landing mid-rewrite; nothing was renamed. NO DATA WAS LOST. */
 | 'raced'
/** The input's chain is already defective; laundering it into a clean rewrite is refused (AM-2). */
 | 'refused-dirty'
/** The file could not be read. */
 | 'unreadable'
/** The rewrite produced nothing usable; the file is left alone. */
 | 'empty';
export interface GuardedRewriteResult {
    readonly status: GuardedRewriteStatus;
    readonly attempts: number;
    /** Populated for `refused-dirty` so the caller can say WHY, loudly. */
    readonly defects: readonly EventChainDefect[];
}
export interface GuardedRewriteIo {
    /** Read the whole live log. `undefined` ⇒ unreadable. */
    readonly read: () => string | undefined;
    /** Write to a temp file and atomically rename it over the log. */
    readonly replace: (text: string) => void;
    /** Take the rewrite lock. `false` ⇒ someone else owns it. */
    readonly acquireLock: () => boolean;
    readonly releaseLock: () => void;
}
/** A rewrite proposal: the new text, plus whatever made the rewriter refuse. */
export interface RewriteProposal {
    readonly text: string;
    readonly refusedDirty?: boolean;
    readonly defects?: readonly EventChainDefect[];
}
export declare const DEFAULT_REWRITE_ATTEMPTS = 3;
/**
 * Run a whole-file rewrite so that a concurrent append can never be silently overwritten.
 *
 * Three guards, in order:
 *  1. an exclusive lock, so two rewriters cannot interleave at all;
 *  2. a re-read of the live file after computing the new text and BEFORE the rename — if it moved,
 *     the attempt is ABANDONED and retried against the newer file, so the append is folded in
 *     rather than lost;
 *  3. a bounded attempt count — a log under constant append is left alone, never truncated.
 *
 * HONEST RESIDUAL (state it, do not paper over it): the re-read narrows the window to the interval
 * between the final read and the `rename` syscall; it does not close it, because a conditional
 * rename is not an operation the filesystem offers. What it removes is the wide window (the whole
 * parse + compact + write) that made loss likely rather than rare.
 *
 * Pure orchestration — all IO is injected, which is what makes the race testable deterministically.
 */
export declare function guardedRewrite(io: GuardedRewriteIo, propose: (text: string) => RewriteProposal, opts?: {
    readonly attempts?: number;
}): GuardedRewriteResult;
/** Convenience wrapper for callers holding the whole file. */
export declare function verifyEventChainText(text: string, opts?: VerifyEventChainOptions): EventChainVerification;
/**
 * One line an operator can read. Always carries {@link EVENT_CHAIN_SCOPE} so no surface can print a
 * chain verdict without also printing what it does and does not mean.
 */
export declare function renderEventChainVerification(v: EventChainVerification, label: string): string;
/**
 * How old a defect is relative to the log's CURRENT unbroken run.
 *
 * `historical` — the break happened, and an unbroken segment has run since. It cannot be un-happened
 * and it does not make today's records suspect. `live` — the break is inside the segment we are
 * still appending to, so records after it are the ones a verdict would rest on.
 */
/**
 * Where a defect sits relative to the log's current unbroken run.
 *
 * Deliberately NOT called "historical". A break followed by ONE record is not a healed log, and a
 * name that implies healing would let a caller skip the count — the reviewer's exact objection
 * (codex `gpt-5.6-sol`, 2026-08-24: a defect at line 2 of 3 was filed as historical because line 3
 * existed). These names state a position; the COUNT states how much evidence stands behind it, and
 * the count is what a caller must show.
 */
export type ChainDefectAge = 'before-run' | 'in-run';
/**
 * The line where the log's current unbroken run begins: one past the last defect, or 1 when there
 * are none.
 *
 * Why this exists: `dz doctor` reported "learning verdicts computed from this log are unsafe" for
 * both `.dz` event logs, flatly, for four weeks. MEASURED 2026-08-24 — every defect in both files
 * precedes an unbroken run of 998 of 1138 rows in one and 88 of 426 in the other. The verdict was
 * true of the file and false of those runs, and a permanent red about something nobody can change is
 * a red that stops being read.
 */
export declare function liveSegmentStart(verification: EventChainVerification): number;
export interface ChainDefectAges {
    /** Defects that an unbroken run has followed. How MUCH of a run is `runRecords`, never implied. */
    readonly beforeRun: readonly EventChainDefect[];
    /** Defects with nothing sound after them — the strong verdict is earned here. */
    readonly inRun: readonly EventChainDefect[];
    /** First line of the current unbroken run. */
    readonly runFrom: number;
    /**
     * Records in that run. THE NUMBER IS THE EVIDENCE: 998 sound records after a break say something a
     * caller may relax on; 1 says almost nothing, and a caller that prints "sound" without printing
     * this number is overclaiming on its behalf.
     */
    readonly runRecords: number;
}
/**
 * Split defects by whether an unbroken run followed them, and say how long that run is.
 *
 * `runFrom` is computed from the defects themselves, so a defect can never classify itself: the run
 * only begins after the LAST of them. A log whose newest defect is its final record therefore has an
 * empty `beforeRun` and a `runRecords` of zero.
 */
export declare function classifyChainDefects(verification: EventChainVerification, totalRecords: number): ChainDefectAges;
//# sourceMappingURL=event-chain.d.ts.map