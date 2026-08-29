/**
 * `dz tg-post` — the pure half: validate an approved draft against what Telegram will accept and
 * what the channel's own accepted design demands.
 *
 * The design is NOT this module's to invent. features/genai-tweets-channel/ carries four ACCEPTED
 * ADRs (2026-08-04): HTML mode, never MarkdownV2 (18 escapes against 3, one miss is a 400); the
 * cadence rule "no posts 00:00-06:00 MSK"; link previews off by default because x.com previews in
 * Telegram have been broken since 2022; and ADR-004's standing order — publishing stays MANUAL, and
 * autonomous publishing means REVISING the ADR, not flipping a quiet flag. This module only makes
 * those decisions checkable.
 *
 * PURE: no filesystem, no network, no clock — the timestamp arrives as a parameter, or the MSK
 * night-window rule could not be tested at all.
 */
/** Tags Bot API accepts in HTML mode (verified against the live docs, Bot API 10.2). */
export declare const TG_ALLOWED_TAGS: readonly string[];
/** Hard ceiling for `sendMessage.text`, characters after entity parsing. */
export declare const TG_TEXT_LIMIT = 4096;
export interface TgHtmlIssue {
    readonly kind: 'unknown-tag' | 'unclosed-tag' | 'stray-close' | 'bare-ampersand' | 'bare-angle' | 'over-limit' | 'empty';
    readonly detail: string;
}
/**
 * The character count Telegram limits: text WITHOUT the markup. An approximation is stated as one —
 * entities like tg-emoji count differently — but a draft within this bound by a margin is safe, and
 * the render prints the number so the author sees the headroom, not a verdict.
 */
export declare function tgVisibleLength(html: string): number;
/**
 * Everything wrong with a draft, or an empty list. One pass, every finding named — a validator that
 * stops at the first fault sends the author around the loop once per mistake.
 */
export declare function tgPostHtmlIssues(html: string): TgHtmlIssue[];
export interface TgSendDecision {
    readonly action: 'send' | 'refuse';
    readonly reason: string;
}
/**
 * May this draft go out NOW?
 *
 * The night window is ADR-003's cadence rule, encoded as a refusal with an explicit override rather
 * than as advice: 00:00-06:00 MSK is when the channel's audience is asleep and its author is too —
 * a send landing then is far more often a timezone mistake than an intention. `--night` states the
 * intention; without it the refusal names the local MSK time it computed, so the operator can check
 * the arithmetic instead of trusting it.
 */
/**
 * The dedup key for a post: sha256 of its VISIBLE text (markup stripped). Two drafts that render
 * identically in Telegram are the same post even if their HTML differs by a whitespace — the key
 * must be about what the reader sees, not the bytes (G5, ADR-005).
 */
export declare function tgVisibleSha256(html: string): string;
/** One recorded send. sha256 is the visible-text key; ts is ISO. */
/** One journal line. status: 'pending' written BEFORE the send (crash-window guard), 'sent' after
 *  Telegram accepts. A legacy line with no status is treated as 'sent'. */
export interface TgSentRecord {
    readonly sha256: string;
    readonly ts: string;
    readonly status?: 'pending' | 'sent';
}
export declare function decideTgSend(input: {
    readonly issues: readonly TgHtmlIssue[];
    readonly provenanceOutcome: 'allowed' | 'blocked' | 'not-established' | 'skipped';
    readonly confirmed: boolean;
    readonly nowUtcIso: string;
    readonly nightOverride: boolean;
    /** G6 stop-cord: a `.dz/tg-post/HALT` file exists. Checked FIRST, before anything else. */
    readonly halted?: boolean;
    /** sha256 of THIS post's visible text (tgVisibleSha256) — the G5 dedup key. */
    readonly sha256?: string;
    /** The send journal as FACTS (the pure half never reads a file). Undefined ⇒ log unreadable. */
    readonly sentLog?: readonly TgSentRecord[] | undefined;
    /** G4 ceiling; default 10 (ADR-003). Sends in the trailing 24h are counted against it. */
    readonly maxPostsPerDay?: number;
}): TgSendDecision;
//# sourceMappingURL=tg-post.d.ts.map