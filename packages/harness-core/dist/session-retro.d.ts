/**
 * Per-session retro & co-learning loop (feature session-retro-colearn, ADR-001).
 *
 * At session end, `dz retro` mines the CURRENT session transcript for recurring PROCESS rakes, drills the
 * user (socratic + checklist), and teaches/reinforces the agent — from the same mistake ("учиться вместе").
 * The recurrence ledger IS the `dz teach` store (domain `retro`), so agent-recall and user-recurrence read
 * ONE store (Step-0 recall: a feedback loop needs collect + rank + apply, not two write-only logs).
 *
 * parse/detect/render are PURE + deterministic (sorted, no clock/random); the stream/find helpers do disk
 * I/O with TOP-LEVEL node:fs (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun)
 * and NEVER slurp a whole transcript (they reach ~95 MB — read + split lines, parse line-by-line).
 *
 * SAFETY PROPERTY (ADR-001 §3, load-bearing): a rake seen for the FIRST time (effective count < threshold)
 * is taught silently but NOT drilled — no nagging on a one-off. Drills are for recurrent patterns only.
 */
export interface SessionEvent {
    readonly kind: 'user' | 'assistant' | 'tool';
    readonly text: string;
    readonly tool?: string;
    readonly file?: string;
    readonly ok?: boolean;
    /** `tool_use.id` on a call, `tool_result.tool_use_id` on its result — the pairing key that lets
     * the fold tell WHICH executed command a failure belongs to (ADR-004). Absent ⇒ no pairing. */
    readonly toolUseId?: string;
}
export interface ProcessSignature {
    readonly id: string;
    readonly label: string;
    readonly socratic: string;
    readonly checklist: string;
    readonly skill?: string;
}
export interface ProcessHit {
    readonly signature: string;
    readonly label: string;
    readonly withinSession: number;
    readonly evidence: readonly string[];
}
export interface RetroItem {
    readonly hit: ProcessHit;
    readonly ledgerCount: number;
    readonly effective: number;
    readonly status: 'drill' | 'accrue';
    readonly drill?: string;
}
export interface Retro {
    readonly items: readonly RetroItem[];
    readonly drilled: number;
    readonly accrued: number;
    readonly totalEvents: number;
}
export declare const RETRO_DOMAIN = "retro";
export declare const DEFAULT_DRILL_THRESHOLD = 2;
export declare const PROCESS_SIGNATURES: readonly ProcessSignature[];
export declare const RETRO_DEBT_MARKER = "\u26A0 RETRO DEBT";
/**
 * Detect PROCESS rakes over the event stream. PURE + deterministic. Conservative (high-precision): prefer a
 * miss to a false accusation (a wrong "you claimed done without testing" erodes trust worse than a miss).
 * Returns ONE aggregated hit per signature that fired, `withinSession` = occurrence count.
 */
export declare function detectProcessRakes(events: readonly SessionEvent[]): ProcessHit[];
/** The stable store-key lesson for a signature (so teach/reinforce dedups on it and the ledger counts it). */
export declare function retroLessonText(sig: string): string;
/** Render the mix drill: a socratic predict-then-reveal prompt, a marker, then the concrete checklist. */
export declare function renderDrill(sig: ProcessSignature, effective: number): string;
/**
 * Build the retro. PURE. A hit is DRILLED only when `ledgerCount + withinSession >= threshold` (recurrent);
 * otherwise it ACCRUES (taught silently, no drill) — the load-bearing anti-noise property (ADR-001 §3).
 */
export declare function buildRetro(hits: readonly ProcessHit[], ledger: ReadonlyMap<string, number>, totalEvents: number, drillThreshold?: number): Retro;
/** Human render of the retro. Deterministic. */
export declare function renderRetro(retro: Retro): string;
/**
 * Parse a Claude Code JSONL transcript into a normalized event stream. Bad/`null`/malformed lines are
 * skipped (never throws — cross-model QE caught a crash on a `null` line and a `[null]` content block).
 * ADJACENT text blocks WITHIN one message are merged into a single assistant/user event, so a
 * multi-block turn ("Done." + "Fixed.") counts as ONE claim, not two (the anti-noise guarantee) —
 * but original CONTENT-BLOCK ORDER is preserved across tool blocks: admission text followed by a
 * `dz teach` tool_use in the SAME message must settle the debt, which requires the teach event to
 * land AFTER the text event (cross-family QE P1-1: the old flush-at-end put all text last, so a
 * same-turn teach looked EARLIER than its admission and the happy path read as an unpaid debt).
 */
export declare function streamSessionEvents(path: string): SessionEvent[];
/**
 * Parse a JSONL CHUNK (whole file or an incremental tail of complete lines) into events. PURE.
 * Extracted from streamSessionEvents so the per-turn tail scan parses only the new bytes.
 */
export declare function parseSessionJsonl(raw: string): SessionEvent[];
/** Find the most recently modified session transcript (roam state, then ~/.claude/projects). Null if none. */
export declare function findLatestTranscript(repoRoot: string): string | null;
export declare const RETRO_SCAN_STATE_FILE = "retro-scan-state.json";
export declare const RETRO_PENDING_FILE = "retro-pending.json";
export interface AdmissionDebt {
    readonly snippet: string;
    /** Paired call ids issued against THIS debt, in registration order (oldest first).
     * Absent, rather than an empty array, when no calls await confirmation. */
    readonly awaiting?: readonly string[];
}
export interface RetroPendingSentinel {
    readonly schema: 1;
    readonly sessionId: string;
    readonly transcript: string;
    readonly snippet: string;
    readonly ts: string;
    readonly awaiting?: readonly string[];
}
/** Where the Stop-hook scan got its transcript path — or why it has none. */
export interface ScanTailSource {
    /** The transcript to scan, or null when no source named one. */
    readonly path: string | null;
    readonly source: 'flag' | 'positional' | 'stop-hook-stdin' | 'none';
    /** Present only when `path` is null: WHY the scan is refusing, in words a hook author can act on. */
    readonly reason?: string;
}
/**
 * Decide which transcript a `dz retro --scan-tail` run is entitled to read. PURE.
 *
 * Round 3, P1-3 (Codex r2 on `harness-cli/src/cli.ts:8508-8510`): the Stop-hook mode fell back to
 * `findLatestTranscript(root)` whenever no positional path was given, so it scanned whichever file
 * happened to have the newest mtime. With three to five sessions and their subagents alive at once —
 * the ordinary state of this machine, not an edge case — that is routinely ANOTHER session's file:
 * the scan advances the wrong session's offset and never sees the current turn's admission.
 *
 * The Stop hook hands the exact path on stdin (`{"session_id":…,"transcript_path":…}`), so the order
 * is: an explicit `--transcript`, then a positional path (a human running it by hand means THAT file),
 * then the hook payload. With none of the three the answer is a REFUSAL with a stated reason — never
 * a guess. Refusing is safe here in a way guessing is not: a skipped scan self-heals on the next turn
 * (nothing advanced), while a scan of the wrong transcript corrupts two sessions' state at once.
 *
 * A blank or whitespace-only string is NOT a path: an unset shell variable expands to exactly that.
 */
export declare function resolveScanTailTranscript(input: {
    readonly flag?: string | undefined;
    readonly positional?: string | undefined;
    readonly stdin?: string | undefined;
}): ScanTailSource;
export interface TailScanOutcome {
    readonly status: 'pending' | 'cleared' | 'none' | 'no-transcript' | 'contended';
    readonly snippet?: string;
    readonly scannedBytes: number;
    readonly offset: number;
}
/** The scan-state + sentinel pair is a read-modify-write store; per the repo concurrency rule
 * (`.claude/rules/cross-runtime-concurrency.md`) it gets a named lock in the same change. */
export declare const RETRO_SCAN_LOCK_NAME = "retro-scan";
/**
 * Fold the admission debt over an event chunk. PURE. Asymmetric by design (ADR-001 D4): a new
 * assistant admission ARMS the debt; only {@link isTeachCommand} — a Bash tool_use invoking teach
 * at a command boundary — PAYS it. Neither prose ("I'll run dz teach"), nor an `echo`/`grep` decoy,
 * nor a tool_result echoing the phrase settles anything (cross-family QE P1-2). Since the fix round's
 * own review (finding R1) the command text is NECESSARY but not SUFFICIENT: a teach that carries a
 * `tool_use_id` is only REGISTERED by its call, and the debt is settled by that call's own result
 * carrying a teach RECEIPT ({@link TEACH_RECEIPT_RE}) — `exit 0\ndz teach "never runs"` pays nothing,
 * and two parallel teaches that both come back receipt-less leave the debt armed (round 3, P1-2).
 * A teach with NO id still pays on the call alone: nothing could ever confirm it. The detector in
 * detectProcessRakes stays looser (any non-directive text mention) because its failure mode is a
 * false accusation, while this fold's failure mode is a silently forgiven debt.
 */
export declare function foldAdmissionDebt(events: readonly SessionEvent[], prior: AdmissionDebt | null): AdmissionDebt | null;
/**
 * One incremental scan transaction: read state → read the new transcript bytes (whole lines only —
 * a partial trailing line is left for the next scan) → fold the debt → persist state + sentinel.
 * NEVER throws (it runs inside a Stop hook; a broken scan must never surface as a turn failure).
 *
 * The WHOLE read→fold→write runs under `withProjectLockSync` (cross-family QE P1-3): two overlapping
 * Stop scans that both read the same offset/sentinel and then rename/unlink independently lose one
 * side's update — atomic per-file renames do not prevent that, only mutual exclusion does. The
 * critical section is short and synchronous (bounded ≤8 MB read, no subprocess, 65 ms measured on
 * a 5 MB first scan) and the lock lives beside the store it guards: `<root>/.dz/locks/retro-scan.lock`
 * for the store files in `<root>/.dz/`. A contended scan gives up fast and reports `contended` —
 * nothing advanced, so the next turn re-scans the same bytes (self-healing, never a lost update).
 */
export declare function runRetroTailScan(dzDir: string, transcriptPath: string | null, nowIso?: string): TailScanOutcome;
/** The transaction body — call ONLY under the named lock. Never throws for ordinary fs failures. */
declare function scanTailUnderLock(dzDir: string, transcriptPath: string, nowIso?: string): TailScanOutcome;
/**
 * Is this sentinel about the CURRENT session? Prefer identity (session id, then transcript path);
 * only when the hook payload carries neither does the ts-freshness window decide. PURE.
 */
/** TEST-ONLY handle on the UNLOCKED transaction body (ADR-002 D-4 / ADR-003 clause 3 RED half):
 * the lost-update reproducer must be able to run the same read→fold→write WITHOUT mutual
 * exclusion, so the named lock is proven to be what prevents the regression. Never call this from
 * production code — `runRetroTailScan` is the only sanctioned entry point. */
export declare const __scanTailUnderLockForTest: typeof scanTailUnderLock;
export declare function retroSentinelIsFresh(sentinel: Partial<RetroPendingSentinel>, ctx: {
    sessionId?: string;
    transcriptPath?: string;
    nowMs: number;
}): boolean;
/**
 * The ≤300-char next-prompt directive. It deliberately does NOT spell a teach invocation the scanner
 * could mistake for the payment: events carrying RETRO_DEBT_MARKER are excluded from matching, and
 * the phrasing keeps `dz` and `teach` apart as a second guard (ADR-001 D4). It demands the SPECIFIC
 * lesson from the assistant — the hook itself only ever auto-teaches the templated one (D3).
 */
export declare function renderRetroDebtDirective(sentinel: {
    snippet: string;
}): string;
export {};
//# sourceMappingURL=session-retro.d.ts.map