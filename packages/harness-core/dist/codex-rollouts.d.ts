/**
 * A pure reader for Codex CLI rollout logs (feature `measurement-integrity`, ADR-001 D3).
 *
 * A `dz feature-adr-record --kind ledger` row for a Codex coder/reviewer stage carries
 * `tokens: null` in 130 of 156 recorded rows (Step 0, 2026-09-16) even though the spend is sitting
 * right there on disk: Codex writes one JSONL file per session at
 * `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`, and nothing in the pipeline reads it. The
 * pipeline dispatches Codex without an explicit session id (`codex exec -C <repo> -m <id> …`), so the
 * only way to join a ledger row to the rollout that produced it is a WINDOW match: the stage's own
 * start/end time, its `cwd`, and its model.
 *
 * PURE — this module never opens `~/.codex/sessions` itself; the CLI reads the files and hands their
 * TEXT to {@link parseCodexRollout}. It must never gain a `node:fs` import (the `core-boundary`
 * ratchet, `test/core-boundary.test.ts`, pins the current file/import count).
 *
 * ## A measured schema correction (read before touching the parser)
 *
 * Step 0's assessment described the usage record as `type: "token_count"`, keyed
 * `payload.info.total_token_usage`. A live probe of this machine's `~/.codex/sessions` (2026-09-16,
 * `cli_version: "0.154.0"`, every rollout from the last two days) found NO such record — the CURRENT
 * shape is `type: "token_usage_record"`, keyed `payload.usage`, with the same five sub-fields
 * (`input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`,
 * `total_tokens`). The model id lives on `type: "turn_context"`'s `payload.model` (not on
 * `session_meta`, as Step 0 assumed), and `cwd` is carried by BOTH `session_meta.payload.cwd` and
 * `turn_context.payload.cwd`. Rather than build against a shape that no longer exists on this
 * machine, {@link parseCodexRollout} accepts BOTH the documented legacy shape and the measured
 * current one — Codex CLI versions drift the schema (C-2: this module depends on no version beyond
 * the fields it reads), and a reader that understands only a shape nothing on disk still emits would
 * fail FR-5 at the exact thing it exists to fix.
 *
 * @packageDocumentation
 */
export interface CodexRolloutTotals {
    readonly input: number;
    readonly cachedInput: number;
    readonly output: number;
    readonly reasoning: number;
    readonly total: number;
}
/**
 * measurement-integrity fix-round-1/F5 (Codex r1 HIGH #5): one TURN of a session — the span between
 * one `turn_context` record and the next (or the file's last record, for the final turn). A turn
 * carries its OWN model/cwd (from ITS `turn_context`) and, when a usage-bearing record (`token_count`
 * / `token_usage_record`) was seen while this turn was current, that record's totals — `null` when no
 * such record fell inside this turn's interval (nothing to attribute to it).
 */
export interface CodexRolloutTurn {
    readonly model: string | null;
    readonly cwd: string | null;
    readonly startedAt: string | null;
    readonly endedAt: string | null;
    readonly totals: CodexRolloutTotals | null;
}
export interface CodexRollout {
    readonly id: string;
    readonly cwd: string | null;
    readonly model: string | null;
    /** ISO, or `null` when no record in the file carried a parseable timestamp. */
    readonly startedAt: string | null;
    readonly endedAt: string | null;
    readonly totals: CodexRolloutTotals;
    /** measurement-integrity fix-round-1/F5: `'turn'` when the file carried at least one `turn_context`
     *  record (the measured current schema always does) — {@link matchCodexRollouts} then matches at
     *  TURN granularity, never against this whole session's wide interval. `'session'` when the schema
     *  gave no turn boundaries at all (the legacy shape Step 0 documented) — matching honestly falls
     *  back to the whole-session interval, and that fact travels with the result rather than being
     *  silently assumed away. */
    readonly granularity: 'turn' | 'session';
    /** turns whose open or close boundary carried no timestamp — reported, never matched. */
    readonly unmatchableTurns: number;
    /** Empty when `granularity === 'session'`. */
    readonly turns: readonly CodexRolloutTurn[];
}
export interface CodexRolloutParseError {
    readonly error: string;
}
/**
 * Parse ONE rollout file's full text into a {@link CodexRollout}. Pure, never-throws; a corrupt line
 * is skipped exactly the way `extractCostSamples` (`cost-ledger.ts`) skips one.
 *
 * `fileName`, when given, is used ONLY as a last-resort `id` source (the `rollout-<ts>-<uuid>.jsonl`
 * name's own uuid) when no `session_meta` record carried one — never trusted over the file's own
 * content.
 */
export declare function parseCodexRollout(text: string, fileName?: string): CodexRollout | CodexRolloutParseError;
export type CodexRolloutMatch = {
    readonly status: 'none';
} | {
    readonly status: 'one';
    readonly rollout: CodexRollout;
} | {
    readonly status: 'ambiguous';
    readonly candidates: readonly CodexRollout[];
};
export interface CodexRolloutMatchWindow {
    /** ISO instant — the window's lower bound. */
    readonly from: string;
    /** ISO instant — the window's upper bound. */
    readonly to: string;
    /** Exact match against {@link CodexRollout.cwd}, when given. */
    readonly cwd?: string;
    /** Exact match against {@link CodexRollout.model}, when given. */
    readonly model?: string;
}
/**
 * Which candidate VIEWS (session-level, or — per {@link candidateViewsOf} — turn-level whenever the
 * schema recovered turn boundaries) have an interval that OVERLAPS the given `[from, to]` window
 * (never nearest-in-time — ADR-001 D3 rejects "closest by clock" because two reviews back to back
 * would attribute one's spend to the other). A candidate with no parseable timestamps never matches —
 * an unattributable interval is not a wildcard.
 *
 * `0` matches → `{status:'none'}`. `1` → `{status:'one', rollout}`. `>1` → `{status:'ambiguous',
 * candidates}` — NEVER an arbitrary pick of "the first" (NFR-3). `>1` also covers the case where two
 * DIFFERENT turns (of the same or different rollouts) overlap the window with different models — that
 * disagreement can never resolve to a lone `'one'`, it always surfaces as `'ambiguous'`.
 */
export declare function matchCodexRollouts(rollouts: readonly CodexRollout[], window: CodexRolloutMatchWindow): CodexRolloutMatch;
//# sourceMappingURL=codex-rollouts.d.ts.map