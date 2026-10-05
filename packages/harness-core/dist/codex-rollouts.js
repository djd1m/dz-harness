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
import { fnv1a64 } from './feature-adr-checkpoints.js';
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function nonEmptyString(v) {
    return typeof v === 'string' && v.length > 0 ? v : null;
}
function finiteNonNegative(v) {
    return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
/** Epoch ms from a record's own `timestamp` (current schema) or `ts` (legacy/defensive), or `null`. */
function recordTimeMs(rec) {
    const raw = rec['timestamp'] ?? rec['ts'];
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw;
    if (typeof raw === 'string') {
        const ms = Date.parse(raw);
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}
function isoOrNull(ms) {
    if (ms === null || !Number.isFinite(ms) || Math.abs(ms) > 8.64e15)
        return null;
    try {
        return new Date(ms).toISOString();
    }
    catch {
        return null;
    }
}
/** Pull `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}`
 *  (both schemas use these five field names) out of a usage-bearing sub-object. */
function totalsFrom(usage) {
    return {
        cachedWrite: finiteNonNegative(usage['cache_write_input_tokens']),
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
export function parseCodexRollout(text, fileName) {
    if (typeof text !== 'string' || !text.trim())
        return { error: 'empty rollout text' };
    const diagnostics = [];
    let id = null;
    let cwd = null;
    let model = null;
    let sessionCwd = null;
    let firstMs = null;
    let lastMs = null;
    let cumulative = null;
    let witnessMs = null;
    let sawTurnModel = false;
    const modern = new Map();
    const conflicted = new Set();
    const legacy = [];
    const scopeDiagnostics = [];
    const turns = [];
    let current;
    const empty = () => ({ input: null, cachedInput: null, cachedWrite: null, output: null, reasoning: null, total: null });
    const fields = ['input', 'cachedInput', 'cachedWrite', 'output', 'reasoning', 'total'];
    const sum = (values) => Object.fromEntries(fields.map((field) => {
        const counts = values.map((v) => v[field]);
        const total = counts.reduce((n, v) => n + (v ?? 0), 0);
        if (!Number.isSafeInteger(total))
            diagnostics.push('aggregate-overflow:' + field);
        return [field, counts.length > 0 && counts.every((v) => v != null) && Number.isSafeInteger(total) ? total : null];
    }));
    const readUsage = (usage, owned = []) => {
        const t = totalsFrom(usage);
        for (const [key, v] of Object.entries(usage))
            if (key.endsWith('_tokens') && v != null && finiteNonNegative(v) === null)
                owned.push('invalid-counter:' + key);
        if (t.input != null && ((t.cachedInput != null && t.cachedInput > t.input) || (t.cachedInput != null && t.cachedWrite != null && t.cachedInput + t.cachedWrite > t.input)))
            owned.push('cache-exceeds-input');
        if (t.output != null && t.reasoning != null && t.reasoning > t.output)
            owned.push('reasoning-exceeds-output');
        if (t.input != null && t.output != null && t.total != null && t.input + t.output !== t.total)
            owned.push('total-split-mismatch');
        diagnostics.push(...owned);
        return t;
    };
    const signature = (r) => JSON.stringify([r.turnId, r.totals.input, r.totals.cachedInput, r.totals.output, r.totals.reasoning, r.totals.total]);
    for (const [sourceRecord, line] of text.split('\n').entries()) {
        if (!line.trim())
            continue;
        let raw;
        try {
            raw = JSON.parse(line);
        }
        catch {
            diagnostics.push('malformed-record');
            continue;
        }
        if (!isRecord(raw))
            continue;
        const ms = recordTimeMs(raw);
        if (ms !== null) {
            firstMs = firstMs === null ? ms : Math.min(firstMs, ms);
            lastMs = lastMs === null ? ms : Math.max(lastMs, ms);
        }
        const payload = isRecord(raw['payload']) ? raw['payload'] : null;
        if (!payload)
            continue;
        if (raw['type'] === 'session_meta') {
            id ??= nonEmptyString(payload['session_id']) ?? nonEmptyString(payload['id']);
            cwd ??= nonEmptyString(payload['cwd']);
            sessionCwd ??= nonEmptyString(payload['cwd']);
            model ??= nonEmptyString(payload['model']);
        }
        if (raw['type'] === 'turn_context') {
            if (current)
                current.endedAt = isoOrNull(ms);
            current = { model: nonEmptyString(payload['model']), cwd: nonEmptyString(payload['cwd']) ?? sessionCwd,
                turnId: nonEmptyString(payload['turn_id']), startedAt: isoOrNull(ms), endedAt: null, totals: null, baseline: cumulative };
            turns.push(current);
            if (!sawTurnModel && current.model !== null) {
                model = current.model;
                sawTurnModel = true;
            }
            cwd ??= current.cwd;
        }
        const modernUsage = raw['type'] === 'token_usage_record' && isRecord(payload['usage']) ? payload['usage'] : null;
        const info = isRecord(payload['info']) ? payload['info'] : null;
        const countEvent = raw['type'] === 'token_count' || (raw['type'] === 'event_msg' && payload['type'] === 'token_count');
        const recordDiagnostics = [];
        let recordWitness;
        const witness = modernUsage ? payload['thread_token_usage'] : countEvent ? info?.['total_token_usage'] : null;
        if (isRecord(witness) && (witnessMs === null || ms === null || ms >= witnessMs)) {
            const next = readUsage(witness, recordDiagnostics);
            recordWitness = next;
            if (cumulative?.total != null && next.total != null && next.total < cumulative.total) {
                diagnostics.push('cumulative-reset');
                recordDiagnostics.push('cumulative-reset');
            }
            cumulative = next;
            witnessMs = ms;
        }
        if (modernUsage) {
            const owned = [];
            const totals = readUsage(modernUsage, owned);
            const responseId = nonEmptyString(payload['response_id']);
            const turnId = nonEmptyString(payload['turn_id']) ?? current?.turnId ?? null;
            const key = responseId ? 'response:' + responseId : 'record:' + fnv1a64(JSON.stringify([id, turnId, isoOrNull(ms), totals]));
            if (!responseId)
                diagnostics.push('response-id-unavailable');
            if (payload['session_id'] != null && id != null && payload['session_id'] !== id) {
                diagnostics.push('foreign-session');
                owned.push('foreign-session');
            }
            const receipt = { key, responseId, turnId, turnIndex: current ? turns.indexOf(current) : null, timestamp: isoOrNull(ms), totals, sourceRecord, diagnostics: owned,
                payloadDigest: fnv1a64(JSON.stringify([payload['session_id'] ?? id, payload['thread_id'] ?? id, turnId, current?.model ?? model, current?.cwd ?? cwd, totals])), source: 'modern-response' };
            if (current?.turnId != null && turnId !== current.turnId) {
                diagnostics.push('turn-association-conflict');
                owned.push('turn-association-conflict');
            }
            const previous = modern.get(key);
            if (previous && previous.payloadDigest !== receipt.payloadDigest) {
                conflicted.add(key);
                diagnostics.push('conflicting-response:' + key);
            }
            else
                modern.set(key, previous ? { ...previous, diagnostics: [...new Set([...(previous.diagnostics ?? []), ...owned])] } : receipt);
        }
        else if (countEvent && info && isRecord(info['last_token_usage'])) {
            const owned = [];
            const totals = readUsage(info['last_token_usage'], owned);
            recordDiagnostics.push(...owned);
            legacy.push({ key: 'legacy:' + fnv1a64(JSON.stringify([id, current?.turnId, isoOrNull(ms), witness, totals])), responseId: null,
                turnId: current?.turnId ?? null, turnIndex: current ? turns.indexOf(current) : null, timestamp: isoOrNull(ms), totals, sourceRecord, diagnostics: owned, payloadDigest: fnv1a64(JSON.stringify([current?.turnId, totals])), source: 'legacy-last' });
        }
        else if (countEvent && cumulative && current) {
            const baseline = current.baseline;
            current.totals = baseline === null ? cumulative : Object.fromEntries(fields.map((field) => {
                const now = cumulative?.[field];
                const base = baseline[field];
                const delta = now != null && base != null ? now - base : null;
                if (delta != null && delta < 0)
                    diagnostics.push('cumulative-reset:' + field);
                return [field, delta != null && delta >= 0 ? delta : null];
            }));
        }
        if (recordWitness !== undefined || recordDiagnostics.length > 0) {
            let receiptCount = modern.size - conflicted.size;
            if (legacy.length) {
                const modernReceipts = [...modern.values()].filter((r) => !conflicted.has(r.key));
                const legacyKeys = new Set(legacy.filter((r) => !modernReceipts.some((m) => signature(m) === signature(r) && m.timestamp != null && r.timestamp != null && Math.abs(Date.parse(m.timestamp) - Date.parse(r.timestamp)) <= 5000)).map((r) => r.key));
                receiptCount += legacyKeys.size;
            }
            scopeDiagnostics.push({ sourceRecord, receiptCount, timestamp: isoOrNull(ms), diagnostics: recordDiagnostics,
                ...(recordWitness !== undefined ? { witness: recordWitness } : {}) });
        }
    }
    if (current)
        current.endedAt = isoOrNull(lastMs);
    if (id === null && fileName)
        id = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$/.exec(fileName)?.[1] ?? null;
    if (id === null)
        return { error: 'no session_meta record and no id in fileName — cannot identify this rollout' };
    const seenTurnIds = new Set();
    for (const turn of turns)
        if (turn.turnId !== null) {
            if (seenTurnIds.has(turn.turnId))
                diagnostics.push('turn-association-conflict');
            seenTurnIds.add(turn.turnId);
        }
    const responses = [...modern.values()].filter((r) => !conflicted.has(r.key));
    const seenLegacy = new Set();
    for (const receipt of legacy) {
        const mirror = responses.some((r) => signature(r) === signature(receipt) && r.timestamp != null && receipt.timestamp != null
            && Math.abs(Date.parse(r.timestamp) - Date.parse(receipt.timestamp)) <= 5000);
        if (!mirror && !seenLegacy.has(receipt.key)) {
            responses.push(receipt);
            seenLegacy.add(receipt.key);
        }
    }
    if (responses.length === 0 && cumulative === null && conflicted.size === 0)
        return { error: 'no token_count or token_usage_record entry — nothing to attribute' };
    for (const turn of turns) {
        const selected = responses.filter((r) => r.turnIndex === turns.indexOf(turn));
        if (selected.length > 0)
            turn.totals = sum(selected.map((r) => r.totals));
    }
    const totals = conflicted.size > 0 ? empty() : responses.length > 0 ? sum(responses.map((r) => r.totals)) : cumulative;
    if (responses.length > 0 && cumulative?.total != null && totals.total !== cumulative.total)
        diagnostics.push('cumulative-witness-mismatch');
    return { id, cwd, model, startedAt: isoOrNull(firstMs), endedAt: isoOrNull(lastMs), totals,
        granularity: turns.length ? 'turn' : 'session', unmatchableTurns: turns.filter((t) => t.startedAt === null || t.endedAt === null).length,
        turns: turns.map(({ baseline: _baseline, ...turn }) => turn), receipts: responses, diagnostics: [...new Set(diagnostics)],
        cumulativeWitness: cumulative, scopeDiagnostics, ...(fileName ? { sourcePath: fileName } : {}) };
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
function candidateViewsOf(r) {
    if (r.granularity === 'session')
        return r.turns.length === 0 ? [r] : [];
    const out = [];
    const turnIdCounts = new Map();
    for (const turn of r.turns)
        if (turn.turnId != null)
            turnIdCounts.set(turn.turnId, (turnIdCounts.get(turn.turnId) ?? 0) + 1);
    for (const [turnIndex, turn] of r.turns.entries()) {
        if (turn.turnId != null && turnIdCounts.get(turn.turnId) !== 1)
            continue;
        if (turn.totals === null)
            continue; // nothing was ever attributed to this turn — not a candidate
        // Original turn position owns membership, even when adjacent boundaries share a timestamp.
        const receipts = r.receipts?.filter((receipt) => {
            if (receipt.turnIndex != null) {
                if (!Number.isSafeInteger(receipt.turnIndex) || receipt.turnIndex < 0 || receipt.turnIndex >= r.turns.length || receipt.turnIndex !== turnIndex)
                    return false;
                return receipt.turnId === null || turn.turnId == null || receipt.turnId === turn.turnId;
            }
            return receipt.turnId !== null && turn.turnId === receipt.turnId && turnIdCounts.get(receipt.turnId) === 1;
        });
        const contradicts = r.receipts?.some((receipt) => receipt.turnIndex === turnIndex && receipt.turnId !== null && turn.turnId != null && receipt.turnId !== turn.turnId);
        if (contradicts || (r.receipts && r.receipts.length > 0 && receipts?.length === 0))
            continue;
        out.push({
            ...r,
            id: r.id,
            turnId: turn.turnId ?? null,
            receipts: receipts ?? [],
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
export function matchCodexRollouts(rollouts, window) {
    const fromMs = Date.parse(window.from ?? '');
    const toMs = Date.parse(window.to ?? '');
    const hasWindow = window.from !== undefined || window.to !== undefined;
    const exact = window.rolloutId !== undefined || window.turnId !== undefined;
    if ((hasWindow && (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs)) || (!hasWindow && !exact))
        return { status: 'none' };
    const candidates = [];
    for (const r of rollouts) {
        for (const view of candidateViewsOf(r)) {
            if (window.rolloutId !== undefined && view.id !== window.rolloutId)
                continue;
            if (window.turnId !== undefined && view.turnId !== window.turnId)
                continue;
            if (hasWindow && (view.startedAt === null || view.endedAt === null))
                continue;
            const startMs = Date.parse(view.startedAt ?? '');
            const endMs = Date.parse(view.endedAt ?? '');
            if (hasWindow && (!Number.isFinite(startMs) || !Number.isFinite(endMs)))
                continue;
            // Lead delta after Codex r2 (#5): the turn must START inside the window — a turn that merely
            // brushes the window's edge (any-overlap) is exactly how a neighbouring dispatch's turn leaks in.
            if (hasWindow && (startMs < fromMs || startMs > toMs))
                continue;
            if (window.cwd !== undefined && view.cwd !== window.cwd)
                continue;
            if (window.model !== undefined && view.model !== window.model)
                continue;
            candidates.push(view);
        }
    }
    if (candidates.length === 0)
        return { status: 'none' };
    if (candidates.length === 1)
        return { status: 'one', rollout: candidates[0] };
    return { status: 'ambiguous', candidates };
}
//# sourceMappingURL=codex-rollouts.js.map