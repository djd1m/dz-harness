/**
 * Agent SDK Dreaming integration — bridges Opus 4.8 Dreaming with Reflexion.
 *
 * Per ADR-005: this is orchestration-layer code. It reads session JSONL files
 * (produced by Agent SDK), extracts patterns, and feeds them into the Reflexion
 * system. The MemoryBackend interface is unchanged.
 *
 * @packageDocumentation
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Prefixes of system/harness wrappers that arrive as "user" messages in
 * session JSONL but were never typed by a human. Compared case-insensitively
 * against the trimmed message start.
 */
const SYSTEM_WRAPPER_PREFIXES = [
    '<task-notification',
    '<system-reminder',
    '<local-command-caveat',
    '<command-name',
    '<bash-input',
    '<bash-stdout',
    '<system notification',
    '[system notification',
];
/** Compaction continuations ("This session is being continued from…"). */
const SESSION_CONTINUATION_RE = /^this session is being continued/i;
/**
 * True when a "user" message is actually a system/harness wrapper
 * (task notifications, system reminders, bash transcripts, command metadata,
 * compaction continuations) rather than a human checkpoint response.
 *
 * Such messages must be skipped entirely by the harvester — e.g. a
 * `<task-notification>…TaskStop…</task-notification>` would otherwise hit the
 * `'stop'` substring and be recorded as a fake `failed@0.0` signal.
 */
export function isSystemWrapper(text) {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    return (SYSTEM_WRAPPER_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
        SESSION_CONTINUATION_RE.test(trimmed));
}
/**
 * Exact-match (post-normalization) checkpoint approvals → excellent@1.0.
 * Kept deliberately conservative: only short, unambiguous "proceed" phrases.
 */
const EXCELLENT_RESPONSES = new Set([
    'ок',
    'ok',
    'next',
    'продолжай',
    'да',
    'дальше',
    'поехали',
    'хорошо',
    'отлично',
    'good',
    'lgtm',
    'да, продолжай',
]);
/**
 * Only messages this short are considered checkpoint-like for the
 * needs_work/failed verdict checks. Longer messages routinely QUOTE words
 * like 'stop' or 'переделай' without meaning them as verdicts.
 */
const CHECKPOINT_MAX_LENGTH = 200;
/**
 * A `failed@0.0` verdict poisons the reward store, so it demands the tightest
 * gate: real rejections ("стоп", "stop — wrong direction") are terse. Anything
 * longer than this is an instruction that happens to contain a rejection word.
 */
const FAILED_MAX_LENGTH = 100;
/** Normalize a checkpoint response: trim, lowercase, strip trailing punctuation. */
function normalizeCheckpointText(text) {
    return text.trim().toLowerCase().replace(/[\s.!…]+$/u, '');
}
/** Escape a literal string for embedding in a RegExp source. */
function escapeRegExp(literal) {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Unicode-aware "standalone word" boundary, as lookarounds.
 *
 * CRITICAL: JS `\b` is ASCII-only — `\bпеределай\b` NEVER matches Cyrillic
 * text because Cyrillic letters are non-word characters for `\b` (both sides
 * of the "boundary" are non-word, so there is no boundary). Every RU/EN
 * keyword must go through these lookarounds instead; no raw `\b` anywhere.
 *
 * The hyphen is treated as a joiner so glued/compound forms do not match:
 * "напеределай", "stopwatch", "restop", "стоп-кран", "wrong-таки".
 */
const WORD_BEFORE = '(?<![\\p{L}\\p{N}-])';
const WORD_AFTER = '(?![\\p{L}\\p{N}-])';
/** True when `word` occurs in `text` as a standalone word (Unicode-aware). */
function hasStandaloneWord(text, word) {
    const re = new RegExp(`${WORD_BEFORE}${escapeRegExp(word)}${WORD_AFTER}`, 'iu');
    return re.test(text);
}
/**
 * failed@0.0 — only when rejection is the ESSENCE of the message: the
 * normalized text STARTS with a standalone rejection anchor. Mid-sentence
 * mentions ("можешь добавить в stop hook…", "wrong-таки было") must NOT fire —
 * a real misfire from the live store classified a normal instruction about a
 * "stop hook" as failed@0.0.
 *
 * Documented choice: "стоп машина" starts with standalone "стоп" and DOES
 * classify as failed — leading "стоп" as a word is accepted as a halt order.
 *
 * Applied to the normalized (trimmed, lowercased, punctuation-stripped) text.
 */
const FAILED_LEADING_RE = new RegExp(`^(?:стоп|stop|wrong|(?:это\\s+|вс[её]\\s+)?неправильно)${WORD_AFTER}`, 'u');
/**
 * needs_work@0.3 — only ANCHORED imperative rework phrases, never bare
 * keywords. Standalone-word matches anywhere in the message.
 */
const NEEDS_WORK_WORDS = [
    'переделай',
    'переделать',
    'redo',
    'rework',
    'start over',
];
/**
 * 'заново' fires ONLY inside imperative collocations ("сделай всё заново",
 * "начни заново"). Bare 'заново' — and especially the idiom "не изобретать
 * заново" (don't reinvent the wheel; a real misfire from the live store) —
 * must NOT fire.
 */
const ZANOVO_IMPERATIVE_RE = new RegExp(`${WORD_BEFORE}(?:сделай|сделать|начни|начать|давай|начн[её]м)\\s+(?:вс[её]\\s+)?заново${WORD_AFTER}`, 'iu');
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
export function isNoiseInsight(text) {
    if (/^Tool mcp__.+ invoked during session$/.test(text))
        return true;
    const userPrefix = 'User responded: "';
    if (text.startsWith(userPrefix)) {
        const inner = text.slice(userPrefix.length);
        if (isSystemWrapper(inner))
            return true;
        // Strip the trailing quote of the `User responded: "…"` wrapper, then
        // normalize and require an EXACT match — reuses the existing approval
        // vocabulary instead of duplicating it.
        const approval = inner.replace(/"$/u, '');
        if (EXCELLENT_RESPONSES.has(normalizeCheckpointText(approval)))
            return true;
        return false;
    }
    return false;
}
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
export function harvestDreamPatterns(options) {
    const { sessionsDir, since } = options;
    if (!existsSync(sessionsDir))
        return [];
    const patterns = [];
    const files = readdirSync(sessionsDir)
        .filter((f) => f.endsWith('.jsonl'))
        .sort();
    for (const file of files) {
        const filePath = join(sessionsDir, file);
        const lines = readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                // Skip entries older than `since`
                if (since !== undefined && entry.timestamp && entry.timestamp < since)
                    continue;
                // NOTE: tool_use blocks are intentionally NOT harvested. "Tool X
                // invoked during session" is pure telemetry with zero insight — it
                // was the dominant noise source in real stores.
                // Extract checkpoint responses (reward signals)
                if (entry.type === 'user' && typeof entry.message?.content === 'string') {
                    const raw = entry.message.content;
                    // System wrappers masquerade as user messages — skip entirely.
                    if (isSystemWrapper(raw))
                        continue;
                    const trimmed = raw.trim();
                    const normalized = normalizeCheckpointText(raw);
                    let outcome = 'good';
                    let score = 0.7;
                    if (EXCELLENT_RESPONSES.has(normalized)) {
                        outcome = 'excellent';
                        score = 1.0;
                    }
                    else if (trimmed.length <= CHECKPOINT_MAX_LENGTH) {
                        // Anchored verdicts only on checkpoint-like (short) messages.
                        // PRECISION over recall: a missed downgrade costs nothing (the
                        // 'good' outcome is not recorded), a false failed@0.0 poisons the
                        // reward store. When in doubt, do not classify.
                        if (trimmed.length <= FAILED_MAX_LENGTH && FAILED_LEADING_RE.test(normalized)) {
                            outcome = 'failed';
                            score = 0.0;
                        }
                        else if (NEEDS_WORK_WORDS.some((word) => hasStandaloneWord(trimmed, word)) ||
                            ZANOVO_IMPERATIVE_RE.test(trimmed)) {
                            outcome = 'needs_work';
                            score = 0.3;
                        }
                    }
                    if (outcome !== 'good') {
                        patterns.push({
                            skillId: 'checkpoint-response',
                            outcome,
                            score,
                            insight: `User responded: "${entry.message.content.slice(0, 100)}"`,
                            sessionFile: file,
                            timestamp: entry.timestamp ?? new Date().toISOString(),
                        });
                    }
                }
            }
            catch {
                // Skip malformed JSONL lines
            }
        }
    }
    return patterns;
}
/**
 * Monotonic sequence counter for record IDs.
 *
 * `Date.now()` alone collides when multiple patterns are converted within the
 * same millisecond (common when storing a harvested batch in a tight loop),
 * which silently overwrites earlier records in any keyed backend. Combining the
 * timestamp with an always-incrementing counter guarantees uniqueness without
 * relying on `Math.random()` (which may be constrained/seeded in some runtimes).
 */
let dreamRecordSeq = 0;
/** Convert a DreamPattern to a MemoryRecord for storage via any MemoryBackend. */
export function dreamPatternToRecord(pattern) {
    const seq = (dreamRecordSeq = (dreamRecordSeq + 1) % Number.MAX_SAFE_INTEGER);
    return {
        id: `dream:${pattern.sessionFile}:${pattern.skillId}:${Date.now()}:${seq}`,
        skillId: pattern.skillId,
        text: pattern.insight,
        score: pattern.score,
        outcome: pattern.outcome,
        timestamp: pattern.timestamp,
        metadata: { sessionFile: pattern.sessionFile },
    };
}
//# sourceMappingURL=dreaming.js.map