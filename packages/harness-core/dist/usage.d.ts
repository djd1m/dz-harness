/**
 * `dz usage` data source — a READONLY, never-throw, best-effort estimate of Claude SESSION
 * and WEEKLY token usage, aggregated from the local Claude Code transcript files under
 * `~/.claude/projects/<munged>/<session>.jsonl`.
 *
 * ## Honest-uncertainty contract (LOAD-BEARING)
 *
 * These percentages are ESTIMATES derived by aggregating local transcript token counts against
 * USER-CONFIGURED limits. There is no official Anthropic usage API being consulted; claude.ai is
 * authoritative. Therefore:
 *
 * - Every JSON payload emitted by the CLI carries `estimated: true`.
 * - When a limit is unconfigured, the corresponding `pct` is `null` — unknown, never 0.
 * - Weekly usage counts from a fixed configured reset anchor such as `Wed 08:59`, not from a
 *   rolling seven-day window.
 * - Session usage counts from the active fixed-length transcript block, not from a rolling
 *   last-N-hours window.
 *
 * ## Statusline discipline
 *
 * Modeled on {@link ./statusline.ts} and {@link ./vector-tier.ts}'s `readVectorEngineMode`:
 * - never-throw — missing/corrupt config, transcript directories, and jsonl lines collapse to
 *   best-effort zero/null values, never exceptions;
 * - readonly — `computeUsage` performs zero writes;
 * - bounded scanning via an mtime prefilter;
 * - injectable clock — `computeUsage(root, now?)` takes an optional epoch-ms clock.
 *
 * @packageDocumentation
 */
/**
 * Per-token price ratios relative to base input, used to turn a raw token mix into INPUT-EQUIVALENT
 * tokens. Without this the metric is ~90-99% cache-read and measures context size, not work.
 * (Anthropic list pricing: 5m cache write 1.25x input, cache read 0.1x input, output 5x input.)
 */
export declare const TOKEN_WEIGHTS: {
    readonly input: 1;
    readonly cacheWrite: 1.25;
    readonly cacheWrite1h: 2;
    readonly cacheRead: 0.1;
    readonly output: 5;
};
/** The four raw token buckets of one `message.usage` record, after clamping. */
export interface RawTokenMix {
    readonly input: number;
    /** Cache-CREATION tokens, already priced at their TTL rate inside {@link weightedTokensOf}. */
    readonly cacheWrite: number;
    readonly cacheRead: number;
    readonly output: number;
}
/**
 * The raw token buckets of an Anthropic `message.usage` object, clamped to finite non-negatives.
 * `cacheWrite` prefers the TTL breakdown (`cache_creation.ephemeral_*`) and falls back to the flat
 * `cache_creation_input_tokens` — reading only the flat field scored a nested-only record as ZERO.
 */
export declare function rawTokenMixOf(usage: unknown): RawTokenMix;
/**
 * THE estimator — cost-weighted "input-equivalent" tokens for one `message.usage` object.
 *
 * A flat token sum is 89-99.7% `cache_read` on this machine, which tracks CONVERSATION LENGTH
 * rather than work done. {@link TOKEN_WEIGHTS} are the published per-token price ratios relative to
 * base input, so the result tracks consumption instead of context size.
 *
 * Extracted verbatim from `computeUsage`'s per-sample arithmetic so that `dz usage` and the
 * per-stage cost ledger measure the same quantity (feature `cost-ledger`, ADR-002 — the invariant
 * only means something if both sides use ONE estimator). The return value is UNROUNDED; callers
 * that need exact integer identities round once at their own extraction point.
 */
export declare function weightedTokensOf(usage: unknown): number;
export declare const CLAUDE_USAGE_MODELS: readonly ["fable", "opus", "sonnet", "haiku"];
export type ClaudeUsageModel = (typeof CLAUDE_USAGE_MODELS)[number];
export interface UsageWindow {
    readonly startedAtMs: number;
    readonly resetsAtMs: number;
}
export interface WeeklyResetAnchor {
    readonly weekday: number;
    readonly hour: number;
    readonly minute: number;
    /** Explicit UTC offset in minutes (e.g. `+03:00` → 180). When present, the boundary is an
     * ABSOLUTE instant, immune to the server's timezone. When absent (legacy `Wed 08:59`), the
     * boundary is computed in server-local time — PROVEN wrong when the machine's tz differs from
     * the account's reset tz (idea c8513be9: the same wall-clock instant produced window starts a
     * WEEK apart under UTC vs Europe/Moscow, so the counter held the old week for hours after the
     * real reset while printing the "correct" clock time). */
    readonly offsetMinutes?: number;
}
/** Optional, plan-dependent calibration limits from `.dz/config.json`. Absent ⇒ pct is `null`. */
export interface UsageLimits {
    readonly sessionTokenLimit?: number;
    readonly weeklyTokenLimit?: number;
    readonly weeklyTokenLimitByModel?: Partial<Record<ClaudeUsageModel, number>>;
    readonly weeklyResetAnchor?: string;
    readonly sessionBlockHours?: number;
    readonly calibratedAt?: string;
    readonly source?: string;
    /** Routing must not read the estimated pcts (ADR-001 usage-honesty, FR-3). Legacy
     *  `_disabledReason` free-text also reads as true — the note WAS the switch, now it is data. */
    readonly routingDisabled?: boolean;
    /** Account identity captured at calibration time (FR-4); a login change stales the calibration. */
    readonly calibrationAccount?: string | null;
}
export interface UsageModelEstimate {
    readonly tokens: number;
    readonly pct: number | null;
}
/** A never-throw usage estimate. `estimated` is ALWAYS `true` (honest-uncertainty marker). */
export interface UsageEstimate {
    /** Active fixed-length session block token total (all projects). */
    readonly sessionTokens: number;
    /** Fixed weekly-reset-window token total (all projects). */
    readonly weeklyTokens: number;
    /** `null` ⇔ `sessionTokenLimit` unconfigured (unknown — never a guess). */
    readonly sessionPct: number | null;
    /** Binding weekly pct: per-model max when configured, otherwise all-model aggregate. */
    readonly weeklyPct: number | null;
    /** ISO — active block start + configured session hours; `null` when there is no active block. */
    readonly sessionResetsAt: string | null;
    /** ISO — next configured fixed weekly reset. */
    readonly weeklyResetsAt: string | null;
    /** ALWAYS `true` — these are estimates from local aggregation, not an official API. */
    readonly estimated: true;
    /** Present only when per-model weekly limits are configured. */
    readonly weeklyByModel?: Partial<Record<ClaudeUsageModel, UsageModelEstimate>>;
    /** Raw weekly model totals for calibration; CLI omits this from the compatibility JSON. */
    readonly weeklyTokensByModel: Partial<Record<ClaudeUsageModel, number>>;
    /** Model family that supplied the binding top-level weeklyPct, if any. */
    readonly weeklyBindingModel?: ClaudeUsageModel;
    /** Traceability for tests and calibration diagnostics. */
    readonly sessionStartedAt: string | null;
    readonly weeklyStartedAt: string | null;
    /**
     * Why the routed pcts are null (ADR-001 usage-honesty): empty ⇔ the numbers are established.
     * `scan-empty` — recent transcripts exist yet the scan extracted nothing (instrument failure);
     * `window-miss:*` — samples exist but the configured window filtered them all (misaligned
     * anchor); `routing-disabled` — config says the estimates must not steer; `calibration-stale` —
     * the account changed since calibration. A zero pct is legitimate ONLY on a machine with no
     * recent transcripts at all.
     */
    readonly notEstablished: readonly UsageNotEstablishedReason[];
    /**
     * The raw estimates when the routed pcts are nulled by `routing-disabled`/`calibration-stale` —
     * for HUMAN eyes (recalled lesson: an estimated pct must never drive routing until its window is
     * verified against the provider). Absent when the top-level pcts already carry the numbers.
     */
    readonly estimatesNotForRouting?: {
        readonly sessionPct: number | null;
        readonly weeklyPct: number | null;
    };
}
export interface UsageCalibrationInput {
    readonly sessionPct?: unknown;
    readonly weeklyPct?: unknown;
    readonly modelPct?: Readonly<Record<string, unknown>>;
    readonly calibratedAt: string;
    readonly source: 'claude.ai/settings/usage';
}
export interface UsageCalibrationChange {
    readonly key: string;
    readonly before: number | null;
    readonly after: number;
    readonly tokens: number;
    readonly pct: number;
}
export interface UsageCalibrationPlan {
    readonly before: UsageLimits;
    readonly after: UsageLimits;
    readonly changes: readonly UsageCalibrationChange[];
    readonly skipped: readonly string[];
}
export declare function parseWeeklyResetAnchor(anchor: string): WeeklyResetAnchor | null;
export declare function weeklyWindowFor(nowMs: number, anchor: string): UsageWindow | null;
/**
 * A simple fixed-duration grid helper kept exported for pure date-math tests. `computeUsage` uses
 * transcript-established session blocks per the feature requirements because no account-specific
 * session anchor is stored today.
 */
export declare function fixedBlockWindowFor(nowMs: number, blockHours: number): UsageWindow | null;
export declare function normalizeClaudeUsageModel(raw: unknown): ClaudeUsageModel | null;
export declare function normalizeClaudeUsageModelKey(raw: unknown): ClaudeUsageModel | null;
/**
 * The `~/.claude/projects` root (the account-wide transcript store). Overridable via
 * `DZ_CLAUDE_PROJECTS_ROOT` — used by tests to point at a temp tree. Never throws.
 */
/**
 * The logged-in account identity, from `~/.claude.json` (oauthAccount email or uuid). Honest null
 * when unreadable/absent — and null==null is NOT an account change (machines that never expose it
 * keep the pre-FR-4 behavior). Never throws.
 */
export declare function readClaudeAccountId(): string | null;
/** Closed set of not-established reasons (ADR-001). */
export type UsageNotEstablishedReason = 'scan-empty' | 'window-miss:weekly' | 'routing-disabled' | 'calibration-stale:account-changed' | 'calibration-stale:account-unverifiable';
export declare function claudeProjectsRoot(): string;
/**
 * Read `memory.usage.*` from `<projectRoot>/.dz/config.json`. NEVER throws —
 * absent/corrupt/partial config ⇒ `{}` or only valid fields.
 */
export declare function readUsageLimits(projectRoot: string): UsageLimits;
/**
 * Estimate SESSION + WEEKLY token usage from the local Claude transcript store. NEVER throws;
 * READONLY; `projectRoot` scopes ONLY the config (limits) read — measurement is account-wide
 * (all projects). `now` is injectable for tests.
 */
export declare function computeUsage(projectRoot: string, now?: number): UsageEstimate;
export declare function deriveUsageCalibration(current: UsageEstimate, before: UsageLimits, input: UsageCalibrationInput): UsageCalibrationPlan;
//# sourceMappingURL=usage.d.ts.map