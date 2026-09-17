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

interface RawRecord {
  readonly type?: unknown;
  readonly timestamp?: unknown;
  readonly ts?: unknown;
  readonly payload?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function finiteNonNegative(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Epoch ms from a record's own `timestamp` (current schema) or `ts` (legacy/defensive), or `null`. */
function recordTimeMs(rec: Record<string, unknown>): number | null {
  const raw = rec['timestamp'] ?? rec['ts'];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function isoOrNull(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

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

/** Pull `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}`
 *  (both schemas use these five field names) out of a usage-bearing sub-object. */
function totalsFrom(usage: Record<string, unknown>): CodexRolloutTotals {
  return {
    input: finiteNonNegative(usage['input_tokens']),
    cachedInput: finiteNonNegative(usage['cached_input_tokens']),
    output: finiteNonNegative(usage['output_tokens']),
    reasoning: finiteNonNegative(usage['reasoning_output_tokens']),
    total: finiteNonNegative(usage['total_tokens']),
  };
}

/**
 * Parse ONE rollout file's full text into a {@link CodexRollout}. Pure, never-throws; a corrupt line
 * is skipped exactly the way `extractCostSamples` (`cost-ledger.ts`) skips one.
 *
 * `fileName`, when given, is used ONLY as a last-resort `id` source (the `rollout-<ts>-<uuid>.jsonl`
 * name's own uuid) when no `session_meta` record carried one — never trusted over the file's own
 * content.
 */
export function parseCodexRollout(text: string, fileName?: string): CodexRollout | CodexRolloutParseError {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { error: 'empty rollout text' };
  }

  let id: string | null = null;
  let cwd: string | null = null;
  let sessionMetaModel: string | null = null;
  let turnContextModel: string | null = null;
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  let lastTotals: CodexRolloutTotals | null = null;
  let sawAnyRecord = false;

  // measurement-integrity fix-round-1/F5 (Codex r1 HIGH #5): each `turn_context` record OPENS a new
  // turn, in file order. `open` is the turn currently being built; `turns` collects CLOSED ones. A
  // turn closes when the NEXT `turn_context` is seen (its `endedAt` is that boundary's own
  // timestamp) or, for the LAST open turn, at end-of-file (`endedAt` = the last record's timestamp).
  // A usage-bearing record is attached to whichever turn is open at its own timestamp — `null` stays
  // on a turn that never saw one, so a caller can tell "nothing to attribute here" from "attributed
  // zero".
  // Lead delta after Codex r2 (#5 PARTIAL, new HIGH #1): a turn's totals are the DELTA of the
  // session-cumulative usage between its open and close (the record's own usage counter is
  // cumulative for the session — assigning the last cumulative total to a turn made the second turn
  // carry the first one's tokens). `startedMs: null` marks a turn opened by a `turn_context` WITHOUT
  // a timestamp: it still closes the previous turn (so no usage can leak into it) but can never be
  // matched to a window — the rollout reports it under `unmatchableTurns`.
  interface OpenTurn { model: string | null; cwd: string | null; startedMs: number | null; baseline: CodexRolloutTotals | null; totals: CodexRolloutTotals | null }
  const closedTurns: CodexRolloutTurn[] = [];
  let open: OpenTurn | null = null;

  let unmatchableTurns = 0;
  const closeOpenTurn = (endMs: number | null): void => {
    if (open === null) return;
    if (open.startedMs === null || endMs === null) unmatchableTurns += 1;
    closedTurns.push({
      model: open.model,
      cwd: open.cwd,
      startedAt: open.startedMs === null ? null : isoOrNull(open.startedMs),
      endedAt: endMs === null ? null : isoOrNull(endMs),
      totals: open.totals,
    });
  };
  const deltaTotals = (now: CodexRolloutTotals, base: CodexRolloutTotals | null): CodexRolloutTotals => {
    if (base === null) return now;
    const d = (a: number, b: number): number => (a - b >= 0 ? a - b : a); // a counter that went DOWN is per-record, not cumulative
    return { input: d(now.input, base.input), cachedInput: d(now.cachedInput, base.cachedInput), output: d(now.output, base.output), reasoning: d(now.reasoning, base.reasoning), total: d(now.total, base.total) };
  };

  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // corrupt line — skip, never throw
    }
    if (!isRecord(rec)) continue;
    sawAnyRecord = true;

    const ms = recordTimeMs(rec);
    if (ms !== null) {
      firstMs = firstMs === null ? ms : Math.min(firstMs, ms);
      lastMs = lastMs === null ? ms : Math.max(lastMs, ms);
    }

    const type = rec['type'];
    const payload = isRecord(rec['payload']) ? rec['payload'] : null;
    if (payload === null) continue;

    if (type === 'session_meta') {
      if (id === null) id = nonEmptyString(payload['session_id']) ?? nonEmptyString(payload['id']);
      if (cwd === null) cwd = nonEmptyString(payload['cwd']);
      // Step 0's documented (legacy, not observed live on this machine) shape put `model` directly on
      // `session_meta` — accepted here too, but `turnContextModel` always wins at the end (below)
      // since that is what the measured current schema actually carries.
      if (sessionMetaModel === null) sessionMetaModel = nonEmptyString(payload['model']);
    } else if (type === 'turn_context') {
      if (turnContextModel === null) turnContextModel = nonEmptyString(payload['model']);
      if (cwd === null) cwd = nonEmptyString(payload['cwd']);
      // Close the previous open turn AT this boundary (even when the boundary has no timestamp —
      // the previous turn must stop absorbing usage), then open the new one.
      closeOpenTurn(ms);
      open = { model: nonEmptyString(payload['model']), cwd: nonEmptyString(payload['cwd']) ?? cwd, startedMs: ms, baseline: lastTotals, totals: null };
    }

    // Legacy shape (Step 0's documented one, not observed live on this machine 2026-09-16):
    // `type: "token_count"`, `payload.info.total_token_usage`.
    if (type === 'token_count') {
      const info = isRecord(payload['info']) ? payload['info'] : null;
      const usage = info !== null && isRecord(info['total_token_usage']) ? info['total_token_usage'] : null;
      if (usage !== null) {
        const t = totalsFrom(usage);
        if (open !== null) open.totals = deltaTotals(t, open.baseline);
        lastTotals = t;
      }
    }
    // Current shape (measured live, cli_version 0.154.0): `type: "token_usage_record"`,
    // `payload.usage`.
    if (type === 'token_usage_record') {
      const usage = isRecord(payload['usage']) ? payload['usage'] : null;
      if (usage !== null) {
        const t = totalsFrom(usage);
        if (open !== null) open.totals = deltaTotals(t, open.baseline);
        lastTotals = t;
      }
    }
  }
  if (open !== null && lastMs !== null) closeOpenTurn(lastMs);

  if (!sawAnyRecord) return { error: 'no parseable JSON lines in rollout text' };
  if (id === null) {
    // Last resort: the uuid embedded in `rollout-<ts>-<uuid>.jsonl` — never invented, only read back.
    // A plain "greedy dash" regex would stop at the uuid's OWN internal dashes (its 8-4-4-4-12 hex
    // groups), so this matches the canonical uuid shape explicitly rather than "everything after the
    // last dash".
    const m = typeof fileName === 'string'
      ? /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$/.exec(fileName)
      : null;
    id = m !== null ? (m[1] ?? null) : null;
  }
  if (id === null) return { error: 'no session_meta record and no id in fileName — cannot identify this rollout' };
  if (lastTotals === null) {
    return { error: 'no token_count or token_usage_record entry — nothing to attribute' };
  }

  return {
    id,
    cwd,
    model: turnContextModel ?? sessionMetaModel,
    startedAt: isoOrNull(firstMs),
    endedAt: isoOrNull(lastMs),
    totals: lastTotals,
    granularity: closedTurns.length > 0 ? 'turn' : 'session',
    unmatchableTurns,
    turns: closedTurns,
  };
}

export type CodexRolloutMatch =
  | { readonly status: 'none' }
  | { readonly status: 'one'; readonly rollout: CodexRollout }
  | { readonly status: 'ambiguous'; readonly candidates: readonly CodexRollout[] };

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
 * measurement-integrity fix-round-1/F5 (Codex r1 HIGH #5): every candidate window `matchCodexRollouts`
 * may attribute spend to, at the SHARPEST granularity `parseCodexRollout` could recover from the
 * file. For a `granularity: 'turn'` rollout this is one candidate PER TURN THAT ACTUALLY CARRIES
 * USAGE (a turn nothing was ever attributed to yields no candidate — there is nothing honest to
 * report for it); for `granularity: 'session'` it is exactly one candidate, the whole file, exactly
 * as this reader behaved before this fix.
 *
 * This is the fix for the CRITICAL scenario the Codex review named: the OLD matcher tested the
 * whole session's `[startedAt, endedAt]` against the query window, so ANY brief overlap with that wide
 * interval could attribute an entire multi-turn session's cumulative spend (and, potentially, another
 * turn's DIFFERENT model) to one stage. Scoping candidates to turns means two turns of the SAME
 * session that only one of them overlaps the window can no longer collide — and two turns that BOTH
 * overlap it correctly produce two candidates, which the caller below turns into `ambiguous` rather
 * than an arbitrary pick (this is also where "the model of every usage-bearing turn matching a window
 * must agree" ends up enforced: two turns with different models can only both match by being two
 * SEPARATE candidates, which is ambiguous by construction — there is no path where a mismatch is
 * silently resolved to one of them).
 */
function candidateViewsOf(r: CodexRollout): readonly CodexRollout[] {
  if (r.granularity === 'session') return [r];
  const out: CodexRollout[] = [];
  for (const turn of r.turns) {
    if (turn.totals === null) continue; // nothing was ever attributed to this turn — not a candidate
    out.push({
      id: r.id,
      unmatchableTurns: r.unmatchableTurns,
      cwd: turn.cwd,
      model: turn.model,
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      totals: turn.totals,
      granularity: 'turn',
      turns: [turn],
    });
  }
  return out;
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
export function matchCodexRollouts(
  rollouts: readonly CodexRollout[],
  window: CodexRolloutMatchWindow,
): CodexRolloutMatch {
  const fromMs = Date.parse(window.from);
  const toMs = Date.parse(window.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return { status: 'none' };

  const candidates: CodexRollout[] = [];
  for (const r of rollouts) {
    for (const view of candidateViewsOf(r)) {
      if (view.startedAt === null || view.endedAt === null) continue;
      const startMs = Date.parse(view.startedAt);
      const endMs = Date.parse(view.endedAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      // Lead delta after Codex r2 (#5): the turn must START inside the window — a turn that merely
      // brushes the window's edge (any-overlap) is exactly how a neighbouring dispatch's turn leaks in.
      if (startMs < fromMs || startMs > toMs) continue;
      if (window.cwd !== undefined && view.cwd !== window.cwd) continue;
      if (window.model !== undefined && view.model !== window.model) continue;
      candidates.push(view);
    }
  }

  if (candidates.length === 0) return { status: 'none' };
  if (candidates.length === 1) return { status: 'one', rollout: candidates[0]! };
  return { status: 'ambiguous', candidates };
}
