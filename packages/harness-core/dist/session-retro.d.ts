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
 * Text blocks WITHIN one message are merged into a SINGLE assistant/user event, so a multi-block turn
 * ("Done." + "Fixed.") counts as ONE claim, not two (else the anti-noise guarantee is defeated).
 */
export declare function streamSessionEvents(path: string): SessionEvent[];
/** Find the most recently modified session transcript (roam state, then ~/.claude/projects). Null if none. */
export declare function findLatestTranscript(repoRoot: string): string | null;
//# sourceMappingURL=session-retro.d.ts.map