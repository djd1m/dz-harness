/**
 * Agent SDK Dreaming integration — bridges Opus 4.8 Dreaming with Reflexion.
 *
 * Per ADR-005: this is orchestration-layer code. It reads session JSONL files
 * (produced by Agent SDK), extracts patterns, and feeds them into the Reflexion
 * system. The MemoryBackend interface is unchanged.
 *
 * @packageDocumentation
 */
import type { MemoryRecord } from './backend.js';
/** A pattern extracted from an Agent SDK session. */
export interface DreamPattern {
    readonly skillId: string;
    readonly outcome: 'excellent' | 'good' | 'needs_work' | 'failed';
    readonly score: number;
    readonly insight: string;
    readonly sessionFile: string;
    readonly timestamp: string;
}
/** Options for the dream harvester. */
export interface DreamOptions {
    /** Directory containing Agent SDK session JSONL files. */
    readonly sessionsDir: string;
    /** Only process sessions newer than this ISO timestamp. */
    readonly since?: string;
}
/**
 * True when a "user" message is actually a system/harness wrapper
 * (task notifications, system reminders, bash transcripts, command metadata,
 * compaction continuations) rather than a human checkpoint response.
 *
 * Such messages must be skipped entirely by the harvester — e.g. a
 * `<task-notification>…TaskStop…</task-notification>` would otherwise hit the
 * `'stop'` substring and be recorded as a fake `failed@0.0` signal.
 */
export declare function isSystemWrapper(text: string): boolean;
/**
 * True for insights that are NOISE rather than reusable learnings, so both the
 * ingest gate and the retro-prune step can drop them:
 *
 * - `Tool mcp__* invoked during session` (telemetry, no longer harvested)
 * - `User responded: "<system wrapper…"` for every wrapper prefix recognized
 *   by {@link isSystemWrapper}, including session-continuation forms.
 * - `User responded: "<bare approval>"` — a checkpoint approval echoed as a
 *   pattern (e.g. `продолжай`, `ok`, `да`). These are REWARD signal (which
 *   phase was approved), captured separately; as a recallable "pattern" they
 *   carry zero reusable insight and clutter `dz recall`. Gated by EXACT match
 *   (after {@link normalizeCheckpointText}) against {@link EXCELLENT_RESPONSES},
 *   so a SUBSTANTIVE response ("продолжай, но добавь X") is NOT flagged and is
 *   preserved — it may carry real signal.
 *
 * This predicate is the shared contract for the prune step.
 */
export declare function isNoiseInsight(text: string): boolean;
/**
 * Harvest patterns from Agent SDK session files.
 *
 * Scans `.jsonl` files in `sessionsDir`, extracts checkpoint-response reward
 * signals, and returns them as `DreamPattern`s ready to be fed into Reflexion
 * via `reflexion.record()`.
 *
 * NOISE GATE (a real-store audit found ~85 of 91 records were junk):
 * - Tool invocations are NOT harvested — a `tool_use` is telemetry, not a learning.
 * - System wrappers arriving as user messages ({@link isSystemWrapper}) are skipped.
 * - Verdict classification only fires on checkpoint-like messages (≤ 200 chars,
 *   ≤ 100 for failed) and only on ANCHORED standalone words/phrases, never bare
 *   substrings — "в stop hook" and "не изобретать заново" are live-store
 *   misfires that bare substrings produced.
 */
export declare function harvestDreamPatterns(options: DreamOptions): DreamPattern[];
/** Convert a DreamPattern to a MemoryRecord for storage via any MemoryBackend. */
export declare function dreamPatternToRecord(pattern: DreamPattern): MemoryRecord;
//# sourceMappingURL=dreaming.d.ts.map