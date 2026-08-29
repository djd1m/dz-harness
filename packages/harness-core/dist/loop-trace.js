/**
 * `loop-trace/1` — the trace plane of loop-designer (ADR-003: THE loop is its own sequencer).
 *
 * The host runtime's journal.jsonl has neither `seq` nor `ts` (MEASURED, K3) and is not repo code,
 * so ordering can never come from it. Instead, the GENERATED loop emits its own trace events:
 * `seq` is allocated by ONE module-level counter incremented SYNCHRONOUSLY at the lifecycle
 * transition — immediately before `agent()`/`parallel()` is called (`dispatched`) and synchronously
 * in the continuation after the `await` settles (`settled`). The sandbox runs a single-threaded JS
 * context, so the counter is by construction unique and strictly increasing within a run (INV-14),
 * and the allocation can never be separated from the call by an async write (AM-2 — the seq-at-
 * write-time trap). `wallTime` is written shell-side by the flush command and is DIAGNOSTIC ONLY
 * (INV-16 — never an operand of an invariant).
 *
 * EMITTER HALF (top of file, sandbox-safe — the `trace` blob is generated from these exports by
 * scripts/gen-loop-blobs.mjs; no fs/Date/random/process here, ever).
 *
 * IMPORTS (QE round-7, stated precisely): this module has NO RUNTIME IMPORT. Its single `import
 * type { TraceProjection } from './loop-plan.js'` is type-only and is erased at compile time, so
 * there is no runtime cycle with loop-plan and the generated blob carries no import at all. (The
 * ItemKey domain travels the other way — loop-plan imports `TRACE_KEY_RE` from here and re-exports
 * it as `ITEM_KEY_RE`, one object shared by both layers.) "Import-free" would be the WRONG word.
 * READER HALF (below) — parseTrace / assembleTimeline / runInvariants / renderTimelineHtml,
 * consumed by `dz workflow-trace` and by the fitness suite (same runInvariants, two call sites).
 */
/** Blob version stamp for the emitter half (read by scripts/gen-loop-blobs.mjs). */
export const LOOP_TRACE_BLOB_VERSION = '1.1.0';
export const LOOP_TRACE_SCHEMA_VERSION = 1;
/** runId VO: shell-inert, short. */
export const TRACE_RUNID_RE = /^[a-z0-9-]{1,40}$/;
/** stepId/itemKey VO: a stated, shell-inert superset of runId's alphabet (dots/underscores/colons
 * for fanout-registry keys; quotes, $, backticks, newlines, spaces all excluded). */
export const TRACE_KEY_RE = /^[a-z0-9_.:-]{1,64}$/i;
/** shq twin, private to the trace plane (kept self-named so the trace blob never collides with the
 * checkpoints blob's shellQuote when both are included in one script). */
export function traceShellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
/**
 * Validate one event BEFORE it is buffered (the injection discipline): trace.jsonl is the
 * AUTHORITATIVE ordering source, so a non-conforming or injected event is a HARD ERROR at buffer
 * time — never a line repaired later. Returns an error string or null.
 */
export function traceValidateEvent(e) {
    if (typeof e !== 'object' || e === null || Array.isArray(e))
        return 'event must be an object';
    const ev = e;
    if (ev['v'] !== 1)
        return 'v must be 1';
    if (typeof ev['runId'] !== 'string' || !TRACE_RUNID_RE.test(ev['runId']))
        return 'runId fails its VO regex';
    if (typeof ev['seq'] !== 'number' || !Number.isInteger(ev['seq']) || ev['seq'] < 1)
        return 'seq must be a positive integer';
    const kind = ev['event'];
    if (kind === 'dispatched') {
        if (typeof ev['invocationId'] !== 'string' || ev['invocationId'] === '')
            return 'invocationId required';
        if (typeof ev['stepId'] !== 'string' || !TRACE_KEY_RE.test(ev['stepId']))
            return 'stepId fails its VO regex';
        if (ev['itemKey'] !== null && (typeof ev['itemKey'] !== 'string' || !TRACE_KEY_RE.test(ev['itemKey'])))
            return 'itemKey fails its VO regex';
        if (typeof ev['attempt'] !== 'number' || ev['attempt'] < 1)
            return 'attempt must be >= 1';
        if (typeof ev['phase'] !== 'string' || ev['phase'] === '')
            return 'phase required';
        if (!Array.isArray(ev['causedBy']) || ev['causedBy'].some((n) => typeof n !== 'number'))
            return 'causedBy must be a number array';
        return null;
    }
    if (kind === 'settled') {
        if (typeof ev['invocationId'] !== 'string' || ev['invocationId'] === '')
            return 'invocationId required';
        if (ev['outcome'] !== 'ok' && ev['outcome'] !== 'null' && ev['outcome'] !== 'error')
            return 'outcome must be ok|null|error';
        return null;
    }
    if (kind === 'run.opened') {
        if (typeof ev['planDigest'] !== 'string' || typeof ev['execFp'] !== 'string')
            return 'run.opened needs planDigest + execFp';
        const ep = ev['emitterPath'];
        // Absent is legal (NFR-1). Present-but-outside-the-union is a REFUSAL, not a downgrade: a value
        // like 'trusted' is someone trying to say something the vocabulary does not permit.
        if (ep !== undefined && ep !== 'dz-process' && ep !== 'rendered-script')
            return 'emitterPath must be dz-process|rendered-script';
        return null;
    }
    if (kind === 'run.closed') {
        const c = ev['counts'];
        if (typeof c !== 'object' || c === null)
            return 'run.closed needs counts';
        return null;
    }
    return 'unknown event kind';
}
/** Reader extension kept outside the generated emitter slice: the two locked feature-adr workflow
 * copies embed the v1 emitter byte-for-byte and cannot be rewritten during this parallel Step 7. */
function traceValidateReaderEvent(e) {
    const base = traceValidateEvent(e);
    if (base !== 'unknown event kind')
        return base;
    const ev = e;
    if (ev['event'] !== 'fanout-truncated')
        return base;
    if (typeof ev['stage'] !== 'string' || !TRACE_KEY_RE.test(ev['stage']))
        return 'fanout-truncated stage fails its VO regex';
    if (typeof ev['registrySize'] !== 'number' || !Number.isInteger(ev['registrySize']) || ev['registrySize'] < 0)
        return 'fanout-truncated registrySize must be a non-negative integer';
    if (typeof ev['dispatched'] !== 'number' || !Number.isInteger(ev['dispatched']) || ev['dispatched'] < 0 || ev['dispatched'] > ev['registrySize'])
        return 'fanout-truncated dispatched must be an integer within registrySize';
    if (typeof ev['reason'] !== 'string' || ev['reason'].trim() === '')
        return 'fanout-truncated reason required';
    return null;
}
/**
 * Open a trace state and buffer the run.opened frame. Throws on an invalid runId (fail-closed).
 *
 * `emitterPath` is REQUIRED and has NO DEFAULT, on purpose: a default would be chosen once, by
 * whoever added the parameter, and every future caller that forgot it would silently inherit that
 * choice. A missing argument must be a compile error instead.
 */
export function traceInit(runId, planDigest, execFp, emitterPath) {
    if (!TRACE_RUNID_RE.test(runId))
        throw new Error('loop-trace: runId fails ' + String(TRACE_RUNID_RE));
    const state = { runId, seq: 0, dispatched: 0, settled: 0, buffer: [] };
    const opened = { v: 1, runId, seq: ++state.seq, event: 'run.opened', planDigest, execFp, emitterPath };
    traceBuffer(state, opened);
    return state;
}
function traceBuffer(state, e) {
    const err = traceValidateEvent(e);
    if (err !== null)
        throw new Error('loop-trace: refusing non-conforming event (' + err + ') — the authoritative ordering source is never repaired later');
    state.buffer.push(JSON.stringify(e));
}
/**
 * Allocate the DISPATCH seq and buffer the event — called SYNCHRONOUSLY immediately before the
 * `agent()`/`parallel()` call (the same synchronous statement pair; AM-2). Returns the seq.
 */
export function traceOnDispatch(state, e) {
    const seq = ++state.seq;
    state.dispatched++;
    traceBuffer(state, {
        v: 1,
        runId: state.runId,
        seq,
        event: 'dispatched',
        invocationId: e.invocationId,
        stepId: e.stepId,
        itemKey: e.itemKey,
        attempt: e.attempt,
        phase: e.phase,
        model: e.model,
        causedBy: e.causedBy,
    });
    return seq;
}
/** Allocate the SETTLE seq and buffer the event — called synchronously in the continuation after
 * the await resolves or rejects. Returns the seq (the causedBy input for dependents). */
export function traceOnSettle(state, e) {
    const seq = ++state.seq;
    state.settled++;
    traceBuffer(state, { v: 1, runId: state.runId, seq, event: 'settled', invocationId: e.invocationId, outcome: e.outcome });
    return seq;
}
/** Emit the trace half of the loud truncation receipt. This is not a dispatch and does not alter
 * run.closed invocation counts. */
export function traceOnFanoutTruncated(state, e) {
    const seq = ++state.seq;
    const event = { v: 1, runId: state.runId, seq, event: 'fanout-truncated', ...e };
    const err = traceValidateReaderEvent(event);
    if (err !== null)
        throw new Error('loop-trace: refusing non-conforming event (' + err + ') — the authoritative ordering source is never repaired later');
    state.buffer.push(JSON.stringify(event));
    return seq;
}
/** Buffer the run.closed frame (a trace without it parses as incomplete). */
export function traceClose(state) {
    const closed = {
        v: 1,
        runId: state.runId,
        seq: ++state.seq,
        event: 'run.closed',
        counts: { dispatched: state.dispatched, settled: state.settled },
    };
    traceBuffer(state, closed);
}
/**
 * Drain the buffer into ONE batched append command (the flush the cheap writer agent runs).
 * Each ENTIRE line is shq-escaped before splicing (JSON.stringify never emits raw newlines, so
 * printf '%s\n' emits exactly one record per line). Wall-clock is added SHELL-SIDE via sed —
 * diagnostic only (INV-16). Returns null when the buffer is empty (no agent call to spend).
 */
export function traceFlushCmd(state, traceFileAbs) {
    if (state.buffer.length === 0)
        return null;
    const lines = state.buffer.splice(0, state.buffer.length);
    const file = traceShellQuote(traceFileAbs);
    const dir = traceShellQuote(traceFileAbs.replace(/\/[^/]*$/, ''));
    const printfs = lines
        .map((l) => "printf '%s\\n' " + traceShellQuote(l) + ' | sed "s/}$/,\\"wallTime\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}/" >> ' + file)
        .join(' && ');
    return 'mkdir -p ' + dir + ' && ' + printfs;
}
/**
 * Drain the buffered, already-VALIDATED lines — the runner's flush primitive (W17/T0.1). The
 * fs-less Claude host turns the same buffer into a shell command (`traceFlushCmd`); a host that
 * HAS fs (the `dz workflow run` scheduler) appends exactly these lines itself. One buffer, two
 * drains, zero second line-shape: a line this returns has already passed `traceValidateEvent`,
 * because nothing else can enter the buffer. Empty buffer ⇒ `[]` (never a repeat of the last
 * batch).
 */
export function traceDrain(state) {
    if (state.buffer.length === 0)
        return [];
    return state.buffer.splice(0, state.buffer.length);
}
/**
 * Build the feature-ADR live-panel telemetry leg. Totality comes from the caller's grouped splice:
 * returning the bare command lets that splice preserve the trace flush's exit status while
 * swallowing only the panel leg's failure. The `loop` producer marker stops a generated loop's
 * high-frequency zero counters from displacing a live `/feature-adr` run's meaningful panel.
 */
export function traceFaRecordCmd(dzBin, slug, stepLabel, projectAbs) {
    if (typeof slug !== 'string' || slug === ''
        || typeof stepLabel !== 'string' || stepLabel === ''
        || typeof projectAbs !== 'string' || projectAbs === '')
        return null;
    const bin = typeof dzBin === 'string' && dzBin !== '' ? dzBin : 'dz';
    const cmd = traceShellQuote(bin) + ' statusline --fa-record --slug ' + traceShellQuote(slug)
        + ' --step ' + traceShellQuote(stepLabel) + ' --kind loop --project ' + traceShellQuote(projectAbs);
    return cmd + ' >/dev/null 2>&1';
}
/** Build one feature-ADR run-cost row without manufacturing wall-clock data in JavaScript. */
export function traceLedgerLine(opts) {
    try {
        if (typeof opts.slug !== 'string' || opts.slug === '')
            return null;
        const agents = typeof opts.agents === 'number'
            && Number.isFinite(opts.agents)
            && Number.isInteger(opts.agents)
            && opts.agents >= 0
            ? opts.agents
            : 0;
        const date = typeof opts.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : null;
        const outcome = typeof opts.outcome === 'string' && opts.outcome !== '' ? opts.outcome : 'unknown';
        const line = JSON.stringify({
            slug: opts.slug,
            stage: 'loop-run',
            tier: null,
            tokens: null,
            minutes: null,
            agents,
            coder: null,
            grade: null,
            date,
            auto: true,
            outcome,
            runId: typeof opts.runId === 'string' ? opts.runId : null,
            planDigest: typeof opts.planDigest === 'string' ? opts.planDigest : null,
        });
        return line.length <= 4000 ? line : null;
    }
    catch {
        return null;
    }
}
/** Build the single command that appends a run-cost row and confirms the write. */
export function traceLedgerAppendCmd(repoAbs, line) {
    if (typeof repoAbs !== 'string' || repoAbs === '' || typeof line !== 'string' || line === '')
        return null;
    const dir = traceShellQuote(repoAbs + '/.dz/feature-adr');
    const file = traceShellQuote(repoAbs + '/.dz/feature-adr/run-cost-ledger.jsonl');
    // The field token has a fixed position, and JSON-escaped scalar values (including slug,
    // runId, and planDigest) cannot introduce the raw `"date":null` token targeted by sed.
    return 'mkdir -p ' + dir
        + " && printf '%s' " + traceShellQuote(line)
        + ' | sed "s/\\"date\\":null/\\"date\\":\\"$(date -u +%Y-%m-%d)\\"/" >> ' + file
        + " && printf '\\n' >> " + file
        + ' && echo LEDGER-OK';
}
/**
 * Parse a trace.jsonl text. Tolerant of a missing run.closed (incomplete: true); a DUPLICATE
 * settle for one invocation is a PARSE ERROR, never a silent merge (INV-15).
 *
 * W17 / AM-12 — `run.events` is CANONICALIZED by ascending `seq` after the line scan. The host's
 * batched racing flush agents legitimately append out of seq order (MEASURED on the committed
 * `pkg-audit-1` run: lines 1-2 are settles seq 7 and 6, ahead of `run.opened` seq 1), and the
 * reader used to inherit that file order — so `invocations()` DROPPED every settle that preceded
 * its own dispatch in the file, and a complete, successful run read as three FAIL verdicts. seq is
 * the authoritative order (it is allocated synchronously at the lifecycle transition); file order
 * is a durability artifact the flush design already blesses, and it stays recoverable only from the
 * raw text.
 *
 * Order of the two bookkeeping passes is load-bearing:
 *   • LINE-SHAPE errors (unparseable / invalid event) are recorded in FILE order — they describe
 *     the bytes, and quoting them in file order is what lets a human find the line.
 *   • The duplicate-dispatch and duplicate-settle checks run AFTER canonicalization, so "which
 *     settle is the duplicate" is decided by seq, not by which flush batch happened to land first
 *     (before this, reversing the flush order changed WHICH event INV-15 refused).
 * The sort is stable, so two events sharing one seq keep their file order relative to each other —
 * the only ordering the file can still testify to. INV-14 fails such a trace on uniqueness anyway.
 */
export function parseTrace(text) {
    const run = { runId: null, planDigest: null, execFp: null, events: [], incomplete: true, parseErrors: [], emitterPath: null, openConflict: false };
    const scanned = [];
    for (const line of String(text ?? '').split('\n')) {
        const t = line.trim();
        if (t === '')
            continue;
        let e;
        try {
            e = JSON.parse(t);
        }
        catch {
            run.parseErrors.push('unparseable line: ' + t.slice(0, 120));
            continue;
        }
        const err = traceValidateReaderEvent(e);
        if (err !== null) {
            run.parseErrors.push('invalid event (' + err + '): ' + t.slice(0, 120));
            continue;
        }
        scanned.push(e);
    }
    // CANONICALIZATION (the W17 fix): ascending seq, stable.
    scanned.sort((a, b) => a.seq - b.seq);
    const settledSeen = new Set();
    const dispatchSeen = new Set();
    for (const ev of scanned) {
        if (ev.event === 'run.opened') {
            const prior = run.events.some((p) => p.event === 'run.opened');
            if (prior) {
                const disagrees = run.runId !== ev.runId ||
                    run.planDigest !== ev.planDigest ||
                    run.execFp !== ev.execFp ||
                    run.emitterPath !== (ev.emitterPath ?? null);
                if (disagrees) {
                    run.openConflict = true;
                    run.parseErrors.push('conflicting run.opened frames — refusing to prefer either (ADR-001)');
                }
            }
            run.runId = ev.runId;
            run.planDigest = ev.planDigest;
            run.execFp = ev.execFp;
            run.emitterPath = ev.emitterPath ?? null;
        }
        if (ev.event === 'run.closed')
            run.incomplete = false;
        if (ev.event === 'dispatched') {
            const key = ev.invocationId + '@' + ev.attempt;
            if (dispatchSeen.has(key))
                run.parseErrors.push('duplicate dispatch for ' + key);
            dispatchSeen.add(key);
        }
        if (ev.event === 'settled') {
            if (settledSeen.has(ev.invocationId)) {
                run.parseErrors.push('duplicate settle for invocation ' + ev.invocationId + ' — refusing to merge (INV-15)');
                continue;
            }
            settledSeen.add(ev.invocationId);
        }
        run.events.push(ev);
    }
    return run;
}
export function deriveAttestation(run, state, observed) {
    // A conflict between two run.opened frames forbids the favourable reading outright: preferring
    // either one is exactly the silent choice this feature exists to remove.
    if (run.openConflict)
        return 'unknown';
    // QE round 1 / H1: EVERY bound value must be non-empty. Equality alone let a trace whose
    // planDigest and execFp are both '' bind against a state carrying the same two empty strings —
    // an "identity" that identifies nothing. A binding over absent values is not a binding.
    const nonEmpty = (a, b) => typeof a === 'string' && a !== '' && a === b;
    const bound = state != null &&
        nonEmpty(state.runId, run.runId) &&
        nonEmpty(state.planDigest, run.planDigest) &&
        nonEmpty(state.execFp, run.execFp) &&
        // CONTENT binding, not just identifiers: a legacy run-state with no traceSha256 can never mint
        // `instrument` (that was the reviewer's stale-directory counterexample).
        nonEmpty(state.traceSha256, observed.sha256) &&
        typeof state.traceLines === 'number' && state.traceLines === observed.lines;
    if (bound)
        return 'instrument';
    if (run.emitterPath === 'rendered-script')
        return 'agent';
    return 'unknown';
}
/** Attach one attestation to every verdict in a batch. Kept as a named function rather than a spread
 *  at each call site so a NEW verdict producer cannot silently ship unstamped verdicts. */
export function stampAttestation(verdicts, attestation) {
    return verdicts.map((v) => ({ ...v, attestation }));
}
function invocations(run) {
    const out = new Map();
    for (const e of run.events) {
        if (e.event === 'dispatched') {
            out.set(e.invocationId, {
                invocationId: e.invocationId,
                stepId: e.stepId,
                itemKey: e.itemKey,
                dispatchSeq: e.seq,
                settleSeq: null,
                causedBy: e.causedBy,
            });
        }
        else if (e.event === 'settled') {
            const inv = out.get(e.invocationId);
            if (inv)
                inv.settleSeq = e.seq;
        }
    }
    return [...out.values()];
}
/**
 * Evaluate the plan-derived runtime invariants over an observed trace. Consumes ONLY
 * `toTraceProjection(plan)` (AM-3) and ONLY runtime-assigned `seq` (never wallTime — INV-16).
 * The SAME function serves the fitness suite and `dz workflow-trace` (one implementation,
 * two call sites). An incomplete trace turns window-truncated checks inconclusive, never pass.
 */
export function runInvariants(projection, run) {
    const out = [];
    const invs = invocations(run);
    // INV-14 (RESTATED, W17/AM-12 — verdict id UNCHANGED: `seq-monotonic` is the consumer contract,
    // keyed on by the fitness suite and every `dz workflow-trace` reader, so only the SEMANTICS and
    // the message restate). `parseTrace` now canonicalizes by seq, so "strictly increasing in event
    // order" became tautological — it tested the reader's own sort. The property that still has
    // teeth is the SINGLE-ALLOCATOR witness:
    //   • seq values are UNIQUE (two writers, or one writer allocating twice, collide) — always;
    //   • on a COMPLETE trace they are exactly contiguous 1..maxSeq (a closed run that skips a
    //     number lost an event or had a second allocator);
    //   • on an INCOMPLETE trace a gap is INCONCLUSIVE, never a pass — the window is truncated, so
    //     a missing number is indistinguishable from an unflushed one.
    // Residue accepted and named in AM-12: a writer allocating unique + contiguous seq in a
    // non-monotonic ORDER is no longer detectable. Allocation order was only ever observable through
    // the racy append that this fix (correctly) stopped trusting.
    {
        const seqs = run.events.map((e) => e.seq);
        const dupes = [...new Set(seqs.filter((s, i) => seqs.indexOf(s) !== i))].sort((a, b) => a - b);
        if (dupes.length > 0) {
            out.push({
                id: 'seq-monotonic',
                status: 'fail',
                message: 'duplicate seq value(s) ' + dupes.join(', ') + ' — the single-ALLOCATOR property is broken (seq must be unique across the whole run)',
            });
        }
        else {
            const maxSeq = seqs.length === 0 ? 0 : Math.max(...seqs);
            const missing = [];
            const present = new Set(seqs);
            for (let s = 1; s <= maxSeq && missing.length < 8; s++)
                if (!present.has(s))
                    missing.push(s);
            if (missing.length === 0) {
                out.push({ id: 'seq-monotonic', status: 'pass', message: 'seq unique and contiguous 1..' + maxSeq + ' (' + seqs.length + ' events)' });
            }
            else if (run.incomplete) {
                out.push({
                    id: 'seq-monotonic',
                    status: 'inconclusive',
                    message: 'seq unique but NOT contiguous (missing ' + missing.join(', ') + ' of 1..' + maxSeq + ') on an INCOMPLETE trace — a truncated window is indistinguishable from a lost event',
                });
            }
            else {
                out.push({
                    id: 'seq-monotonic',
                    status: 'fail',
                    message: 'seq is not contiguous 1..' + maxSeq + ' on a COMPLETE trace — missing ' + missing.join(', ') + ' (a closed run that skips a number lost an event or had a second allocator)',
                });
            }
        }
    }
    // INV-15: pairing (a dangling dispatch is only conclusive on a complete trace).
    {
        const dangling = invs.filter((i) => i.settleSeq === null);
        if (run.parseErrors.some((p) => p.includes('duplicate settle'))) {
            out.push({ id: 'dispatch-settle-pairing', status: 'fail', message: 'duplicate settle refused at parse (INV-15)' });
        }
        else if (dangling.length > 0) {
            out.push({
                id: 'dispatch-settle-pairing',
                status: run.incomplete ? 'inconclusive' : 'fail',
                message: dangling.length + ' invocation(s) never settled' + (run.incomplete ? ' (trace incomplete — window truncated)' : ''),
            });
        }
        else {
            out.push({ id: 'dispatch-settle-pairing', status: 'pass', message: 'every dispatch has exactly one settle' });
        }
    }
    // Happens-before from deps: every dispatch of step X after the settle of each dep (by seq).
    for (const hb of projection.happensBefore) {
        const depSettles = invs.filter((i) => i.stepId === hb.afterSettleOf && i.settleSeq !== null).map((i) => i.settleSeq);
        const xDispatches = invs.filter((i) => i.stepId === hb.step).map((i) => i.dispatchSeq);
        const id = 'happens-before:' + hb.afterSettleOf + '→' + hb.step;
        if (xDispatches.length === 0 || depSettles.length === 0) {
            out.push({ id, status: run.incomplete ? 'inconclusive' : 'fail', message: 'edge unobserved' + (run.incomplete ? ' (incomplete trace)' : ' in a complete trace') });
            continue;
        }
        const minDispatch = Math.min(...xDispatches);
        const maxSettle = Math.max(...depSettles);
        // required ordering: at least one settle of the dep precedes EVERY dispatch of X; strict form:
        // every dispatch of X comes after SOME settle of its dep.
        const violated = xDispatches.some((d) => !depSettles.some((s) => s < d));
        if (violated)
            out.push({ id, status: 'fail', message: `dispatch of ${hb.step} (seq ${minDispatch}) precedes every settle of ${hb.afterSettleOf} (max settle seq ${maxSettle})` });
        else
            out.push({ id, status: 'pass', message: 'ordering respected' });
    }
    // Regions: concurrency bound + join coverage (over seq windows, never wallTime).
    for (const region of projection.regions) {
        const members = invs.filter((i) => region.members.includes(i.stepId) || i.stepId === region.fanout);
        const bound = region.maxFanout;
        const idC = 'region-concurrency:' + region.fanout;
        if (bound >= 1 && members.length > 0) {
            // sweep over dispatch/settle transitions in seq order
            const points = [];
            for (const m of members) {
                points.push({ seq: m.dispatchSeq, delta: 1 });
                if (m.settleSeq !== null)
                    points.push({ seq: m.settleSeq, delta: -1 });
            }
            points.sort((a, b) => a.seq - b.seq);
            let cur = 0;
            let peak = 0;
            for (const p of points) {
                cur += p.delta;
                peak = Math.max(peak, cur);
            }
            if (peak > bound)
                out.push({ id: idC, status: 'fail', message: `observed scheduling concurrency ${peak} exceeds maxFanout ${bound}` });
            else
                out.push({ id: idC, status: 'pass', message: `peak scheduled concurrency ${peak} <= maxFanout ${bound}` });
        }
        // ADR-001: coverage is matched to registry POSITIONS, never inferred from equal totals. A
        // duplicate-valued registry therefore owns two independent expected slots. Retries do not
        // manufacture coverage: only attempt 1 of the first member stage witnesses branch admission.
        const idD = 'region-dispatch-completeness:' + region.fanout;
        if (projection.kind === 'trace-projection/1' || !Array.isArray(region.registry) || typeof region.registrySize !== 'number' || region.overflow === undefined) {
            out.push({ id: idD, status: 'inconclusive', message: 'trace-projection/1 region has no positional registry evidence — dispatch completeness cannot be proved' });
        }
        else {
            const registry = region.dedup === true
                ? region.registry.filter((key, index, all) => all.indexOf(key) === index)
                : region.registry;
            const expected = region.overflow === 'truncate' ? registry.slice(0, Math.max(0, region.maxFanout)) : registry;
            const witness = region.members[0];
            const observed = witness === undefined
                ? []
                : run.events.filter((e) => e.event === 'dispatched' && e.stepId === witness && e.attempt === 1).map((e) => e.itemKey);
            const unmatched = new Set(expected.map((_key, index) => index));
            const extras = [];
            for (const key of observed) {
                const position = [...unmatched].find((index) => expected[index] === key);
                if (position === undefined)
                    extras.push(key);
                else
                    unmatched.delete(position);
            }
            const missing = [...unmatched].map((index) => `#${index + 1}:${expected[index]}`);
            const receipt = run.events.find((e) => e.event === 'fanout-truncated' && e.stage === region.fanout);
            const badReceipt = region.overflow === 'truncate' && (receipt === undefined ||
                receipt.registrySize !== region.registrySize ||
                receipt.dispatched !== expected.length ||
                receipt.reason.trim() === '');
            if (missing.length > 0 || extras.length > 0 || badReceipt) {
                const parts = [];
                if (missing.length > 0)
                    parts.push('missing registry position(s) ' + missing.join(', '));
                if (extras.length > 0)
                    parts.push('unexpected dispatch key(s) ' + extras.map((x) => String(x)).join(', '));
                if (badReceipt)
                    parts.push('missing or mismatched fanout-truncated trace receipt');
                out.push({
                    id: idD,
                    status: run.incomplete && region.overflow === 'window' && missing.length > 0 && extras.length === 0 ? 'inconclusive' : 'fail',
                    message: parts.join('; ') + (run.incomplete ? ' (trace incomplete)' : ''),
                });
            }
            else {
                out.push({ id: idD, status: 'pass', message: `every one of ${expected.length} expected registry position(s) has exactly one first-attempt dispatch${region.overflow === 'truncate' ? ' and a matching truncation receipt' : ''}` });
            }
        }
        // Join coverage: the join itself is a structural pseudo-step (no trace event of its own), so
        // its trace-visible witnesses are (a) every dispatched member settles (a dispatched branch is
        // never skippable) and (b) every post-region dispatching step (`after`) dispatches AFTER every
        // member settle — both by SEQ.
        const idJ = 'join-coverage:' + region.fanout;
        if (region.joinPolicy === 'all-activated' || region.joinPolicy === 'all-declared') {
            const dangling = members.filter((m) => m.settleSeq === null);
            if (dangling.length > 0) {
                out.push({
                    id: idJ,
                    status: run.incomplete ? 'inconclusive' : 'fail',
                    message: `${dangling.length} dispatched branch(es) never settled (policy ${region.joinPolicy}) — a dispatched branch is never skippable` + (run.incomplete ? ' (trace incomplete)' : ''),
                });
            }
            else {
                const afterDispatches = invs.filter((i) => region.after.includes(i.stepId)).map((i) => i.dispatchSeq);
                const maxMemberSettle = members.length > 0 ? Math.max(...members.map((m) => m.settleSeq)) : 0;
                const early = afterDispatches.filter((d) => d < maxMemberSettle);
                if (early.length > 0) {
                    out.push({ id: idJ, status: 'fail', message: `a post-barrier step dispatched (seq ${Math.min(...early)}) before every branch settled (max settle seq ${maxMemberSettle})` });
                }
                else {
                    out.push({ id: idJ, status: 'pass', message: 'every dispatched branch settled; post-barrier steps dispatched after the last settle' });
                }
            }
        }
    }
    return out;
}
function findSeq(run, sel) {
    const invs = invocations(run);
    const matches = invs.filter((i) => i.stepId === sel.stepId && (sel.itemKey === undefined || i.itemKey === (sel.itemKey ?? null)));
    if (matches.length === 0)
        return null;
    if (sel.event === 'dispatched')
        return Math.min(...matches.map((m) => m.dispatchSeq));
    const settles = matches.filter((m) => m.settleSeq !== null).map((m) => m.settleSeq);
    return settles.length === 0 ? null : Math.max(...settles);
}
/** Evaluate hand-authored expected invariants (from a fitness fixture) over a trace — by SEQ only. */
export function evaluateExpectedInvariants(expected, run) {
    const out = [];
    expected.forEach((inv, idx) => {
        const id = 'expected[' + idx + ']:' + inv.type + (inv.note ? ' ' + inv.note : '');
        if (inv.type === 'happens-before') {
            if (!inv.before || !inv.after) {
                out.push({ id, status: 'inconclusive', message: 'malformed expected invariant' });
                return;
            }
            const b = findSeq(run, inv.before);
            const a = findSeq(run, inv.after);
            if (b === null || a === null) {
                out.push({ id, status: run.incomplete ? 'inconclusive' : 'fail', message: 'selector matched no event' });
                return;
            }
            if (b < a)
                out.push({ id, status: 'pass', message: `seq ${b} < ${a}` });
            else
                out.push({ id, status: 'fail', message: `required seq(${inv.before.event} ${inv.before.stepId}) < seq(${inv.after.event} ${inv.after.stepId}) but ${b} >= ${a}` });
            return;
        }
        if (inv.type === 'streaming-overlap') {
            // QE round-3 B4 (reviewer R3(a), CONFIRMED): the round-2 spec was the ITEM-PAIR LITERAL
            // seq(dispatch sb:item1) < seq(settle sa:item3) — a completed reverse-batched pipeline
            // execution with ZERO resolver deviations legally settles sa:item3 first and was condemned.
            // The quantified form: EXISTS a dispatch of `downstream` with seq < the FINAL settle of
            // `upstream`. Every legal completed pipeline order passes (any non-final upstream settle
            // hands off to its downstream dispatch before the final upstream settle under the suite's
            // one-settle-per-turn scheduling model); a barrier topology NEVER passes (its join forces
            // every downstream dispatch after ALL upstream settles).
            if (typeof inv.upstream !== 'string' || typeof inv.downstream !== 'string') {
                out.push({ id, status: 'inconclusive', message: 'streaming-overlap needs upstream + downstream stepIds' });
                return;
            }
            const all = invocations(run);
            const upSettles = all.filter((i) => i.stepId === inv.upstream && i.settleSeq !== null).map((i) => i.settleSeq);
            const downDispatches = all.filter((i) => i.stepId === inv.downstream).map((i) => i.dispatchSeq);
            if (upSettles.length === 0 || downDispatches.length === 0) {
                out.push({ id, status: run.incomplete ? 'inconclusive' : 'fail', message: 'selector matched no event' });
                return;
            }
            const finalUpSettle = Math.max(...upSettles);
            const firstOverlap = downDispatches.filter((d) => d < finalUpSettle).sort((x, y) => x - y)[0];
            if (firstOverlap !== undefined) {
                out.push({ id, status: 'pass', message: `streaming overlap observed: seq(dispatch ${inv.downstream}) ${firstOverlap} < seq(final settle ${inv.upstream}) ${finalUpSettle}` });
            }
            else {
                out.push({ id, status: 'fail', message: `no dispatch of ${inv.downstream} precedes the final settle of ${inv.upstream} (min dispatch seq ${Math.min(...downDispatches)} >= final settle seq ${finalUpSettle}) — barrier-shaped execution, not a streaming pipeline` });
            }
            return;
        }
        if (inv.type === 'max-concurrency') {
            const invs = invocations(run).filter((i) => (inv.steps ?? []).includes(i.stepId));
            const points = [];
            for (const m of invs) {
                points.push({ seq: m.dispatchSeq, delta: 1 });
                if (m.settleSeq !== null)
                    points.push({ seq: m.settleSeq, delta: -1 });
            }
            points.sort((x, y) => x.seq - y.seq);
            let cur = 0;
            let peak = 0;
            for (const p of points) {
                cur += p.delta;
                peak = Math.max(peak, cur);
            }
            const limit = inv.limit ?? Infinity;
            if (peak <= limit)
                out.push({ id, status: 'pass', message: `peak ${peak} <= ${limit}` });
            else
                out.push({ id, status: 'fail', message: `peak scheduled concurrency ${peak} > limit ${limit}` });
            return;
        }
        if (inv.type === 'no-overlap') {
            const [sa, sb] = inv.steps ?? [];
            if (!sa || !sb) {
                out.push({ id, status: 'inconclusive', message: 'no-overlap needs two steps' });
                return;
            }
            const A = invocations(run).filter((i) => i.stepId === sa);
            const B = invocations(run).filter((i) => i.stepId === sb);
            const overlap = A.some((a) => B.some((b) => a.settleSeq !== null && b.settleSeq !== null && a.dispatchSeq < b.settleSeq && b.dispatchSeq < a.settleSeq));
            if (overlap)
                out.push({ id, status: 'fail', message: `${sa} and ${sb} overlap in scheduled windows` });
            else
                out.push({ id, status: 'pass', message: 'no forbidden overlap' });
            return;
        }
        out.push({ id, status: 'inconclusive', message: 'unknown expected-invariant type' });
    });
    return out;
}
/**
 * Merge one timeline: trace.jsonl is the AUTHORITATIVE order (rows sorted by seq); checkpoints,
 * cost-ledger lines and usageEvents are appended as unordered context rows (seq 0); journal.jsonl
 * contributes a DIAGNOSTIC LINE COUNT only, never ordering (the ACL of 04 §8).
 *
 * Honesty fix (2026-08-20): this note used to promise "agentId correlation", which the code never
 * did — it counts lines. A comment claiming an analysis that does not exist is the same defect class
 * this feature was built to remove, one layer up. The real correlation now lives in
 * `trace-corroborate.ts`, behind `dz workflow-trace --corroborate`, where it is scoped and tested.
 */
export function assembleTimeline(input) {
    const run = parseTrace(input.trace);
    const rows = [];
    const sources = ['trace'];
    for (const e of run.events) {
        if (e.event === 'dispatched') {
            rows.push({ seq: e.seq, kind: 'trace', label: `dispatch ${e.stepId}${e.itemKey ? ':' + e.itemKey : ''}#${e.attempt}`, detail: `phase=${e.phase} model=${e.model ?? '-'} causedBy=[${e.causedBy.join(',')}]`, wallTime: null });
        }
        else if (e.event === 'settled') {
            rows.push({ seq: e.seq, kind: 'trace', label: `settle ${e.invocationId}`, detail: `outcome=${e.outcome}`, wallTime: e.wallTime ?? null });
        }
        else if (e.event === 'run.opened') {
            rows.push({ seq: e.seq, kind: 'trace', label: 'run.opened', detail: `plan=${e.planDigest.slice(0, 12)} exec-fp=${e.execFp.slice(0, 12)}`, wallTime: null });
        }
        else if (e.event === 'fanout-truncated') {
            rows.push({ seq: e.seq, kind: 'trace', label: `fanout-truncated ${e.stage}`, detail: `${e.dispatched} of ${e.registrySize} — ${e.reason}`, wallTime: null });
        }
        else {
            rows.push({ seq: e.seq, kind: 'trace', label: 'run.closed', detail: JSON.stringify(e.counts), wallTime: null });
        }
    }
    rows.sort((a, b) => a.seq - b.seq);
    if (input.checkpoints) {
        sources.push('checkpoints');
        for (const line of input.checkpoints.split('\n')) {
            const t = line.trim();
            if (t === '')
                continue;
            try {
                const e = JSON.parse(t);
                rows.push({ seq: 0, kind: 'checkpoint', label: `checkpoint ${e.stage ?? '?'}`, detail: t.slice(0, 120), wallTime: null });
            }
            catch {
                rows.push({ seq: 0, kind: 'checkpoint', label: 'checkpoint (malformed line)', detail: t.slice(0, 120), wallTime: null });
            }
        }
    }
    if (input.ledger) {
        sources.push('ledger');
        for (const line of input.ledger.split('\n')) {
            const t = line.trim();
            if (t !== '')
                rows.push({ seq: 0, kind: 'ledger', label: 'cost', detail: t.slice(0, 160), wallTime: null });
        }
    }
    if (Array.isArray(input.usageEvents)) {
        sources.push('usageEvents');
        for (const u of input.usageEvents)
            rows.push({ seq: 0, kind: 'usage', label: 'usage', detail: JSON.stringify(u).slice(0, 160), wallTime: null });
    }
    if (input.journal) {
        sources.push('journal (diagnostic only — never ordering)');
        let n = 0;
        for (const line of input.journal.split('\n'))
            if (line.trim() !== '')
                n++;
        rows.push({ seq: 0, kind: 'journal', label: 'journal', detail: n + ' host-journal line(s) — COUNT only; the host journal carries no seq/ts and NEVER orders this timeline. For an actual comparison run: dz workflow-trace --corroborate <hostRunDir>', wallTime: null });
    }
    return { runId: run.runId, incomplete: run.incomplete, rows, sources };
}
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/**
 * ONE self-contained HTML file: mermaid for the plan TOPOLOGY, an HTML/CSS waterfall TABLE for the
 * event timeline — two different renderers structurally (Codex 04/Q3: mermaid degrades on dense
 * traces; the timeline is never a second mermaid diagram).
 */
export function renderTimelineHtml(timeline, projection, verdicts) {
    const mermaid = ['graph TD'];
    if (projection) {
        for (const hb of projection.happensBefore)
            mermaid.push(`  ${hb.afterSettleOf} --> ${hb.step}`);
        for (const r of projection.regions) {
            mermaid.push(`  ${r.fanout} -. fanout x${r.maxFanout} .-> ${r.join || 'join'}`);
        }
    }
    const traceRows = timeline.rows.filter((r) => r.kind === 'trace');
    const maxSeq = Math.max(1, ...traceRows.map((r) => r.seq));
    const bar = (seq) => `<div class="bar" style="margin-left:${((seq - 1) / maxSeq) * 80}%;width:${Math.max(1, 80 / maxSeq)}%"></div>`;
    const rowsHtml = timeline.rows
        .map((r) => `<tr class="k-${r.kind}"><td>${r.seq || ''}</td><td>${esc(r.label)}</td><td>${esc(r.detail)}</td><td>${esc(r.wallTime ?? '')}</td><td class="w">${r.kind === 'trace' && r.seq > 0 ? bar(r.seq) : ''}</td></tr>`)
        .join('\n');
    const verdictsHtml = verdicts.map((v) => `<li class="v-${v.status}"><b>${esc(v.id)}</b> — ${v.status.toUpperCase()}: ${esc(v.message)}</li>`).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><title>loop-trace ${esc(timeline.runId ?? '')}</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:1.5rem;max-width:1100px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:2px 6px;font-size:12px}
.w{min-width:240px}.bar{height:10px;background:#4a7;border-radius:2px}
.v-fail{color:#b00}.v-pass{color:#171}.v-inconclusive{color:#970}
pre.mermaid{background:#f6f6f6;padding:8px}
.note{color:#666;font-size:12px}
</style></head><body>
<h1>loop-trace timeline — run ${esc(timeline.runId ?? '(unknown)')}${timeline.incomplete ? ' <em>(INCOMPLETE — no run.closed; the unflushed tail may be lost)</em>' : ''}</h1>
<p class="note">Ordering source: the loop's own trace.jsonl seq (runtime-assigned at dispatch/settle transitions). wallTime is diagnostic only (INV-16). Sources: ${esc(timeline.sources.join(', '))}.</p>
<h2>Plan topology (mermaid)</h2>
<pre class="mermaid">${esc(mermaid.join('\n'))}</pre>
<h2>Invariant verdicts</h2>
<ul>${verdictsHtml || '<li>(no plan given — invariants not evaluated)</li>'}</ul>
<h2>Event waterfall (HTML table — deliberately not mermaid)</h2>
<table><tr><th>seq</th><th>event</th><th>detail</th><th>wallTime (diagnostic)</th><th>waterfall</th></tr>
${rowsHtml}
</table>
</body></html>`;
}
//# sourceMappingURL=loop-trace.js.map