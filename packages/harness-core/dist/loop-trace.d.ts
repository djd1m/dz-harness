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
import type { TraceProjection } from './loop-plan.js';
/** Blob version stamp for the emitter half (read by scripts/gen-loop-blobs.mjs). */
export declare const LOOP_TRACE_BLOB_VERSION = "1.1.0";
export declare const LOOP_TRACE_SCHEMA_VERSION = 1;
/** runId VO: shell-inert, short. */
export declare const TRACE_RUNID_RE: RegExp;
/** stepId/itemKey VO: a stated, shell-inert superset of runId's alphabet (dots/underscores/colons
 * for fanout-registry keys; quotes, $, backticks, newlines, spaces all excluded). */
export declare const TRACE_KEY_RE: RegExp;
export interface TraceDispatchEvent {
    v: 1;
    runId: string;
    seq: number;
    event: 'dispatched';
    invocationId: string;
    stepId: string;
    itemKey: string | null;
    attempt: number;
    phase: string;
    model: string | null;
    causedBy: number[];
}
export interface TraceSettleEvent {
    v: 1;
    runId: string;
    seq: number;
    event: 'settled';
    invocationId: string;
    outcome: 'ok' | 'null' | 'error';
    wallTime?: string | null;
}
/**
 * WHICH CODE PATH was meant to write this file. A HINT, never a trust statement — the rendered
 * script's flush is performed BY AN AGENT, which therefore controls these bytes before the file
 * exists and could write any value here. It is deliberately NOT called `attestedBy`, so nothing in
 * the codebase can read it as provenance (ADR-001 round 1 made exactly that mistake). The trust
 * question is answered by `deriveAttestation`, from an artifact the sandboxed script cannot write.
 */
export type TraceEmitterPath = 'dz-process' | 'rendered-script';
export interface TraceRunOpened {
    v: 1;
    runId: string;
    seq: number;
    event: 'run.opened';
    planDigest: string;
    execFp: string;
    /** Optional ON THE WIRE (NFR-1): an older reader ignores it, a newer reader over an older trace
     *  gets `unknown` — which is never `instrument`. */
    emitterPath?: TraceEmitterPath;
}
export interface TraceRunClosed {
    v: 1;
    runId: string;
    seq: number;
    event: 'run.closed';
    counts: {
        dispatched: number;
        settled: number;
    };
}
/** A deliberate work-dropping receipt. Its presence is required for overflow:'truncate' to grade. */
export interface TraceFanoutTruncatedEvent {
    v: 1;
    runId: string;
    seq: number;
    event: 'fanout-truncated';
    stage: string;
    registrySize: number;
    dispatched: number;
    reason: string;
}
export type TraceEvent = TraceDispatchEvent | TraceSettleEvent | TraceRunOpened | TraceRunClosed | TraceFanoutTruncatedEvent;
export interface TraceState {
    runId: string;
    seq: number;
    dispatched: number;
    settled: number;
    /** Buffered, validated event lines awaiting the next flush. */
    buffer: string[];
}
/** shq twin, private to the trace plane (kept self-named so the trace blob never collides with the
 * checkpoints blob's shellQuote when both are included in one script). */
export declare function traceShellQuote(s: string): string;
/**
 * Validate one event BEFORE it is buffered (the injection discipline): trace.jsonl is the
 * AUTHORITATIVE ordering source, so a non-conforming or injected event is a HARD ERROR at buffer
 * time — never a line repaired later. Returns an error string or null.
 */
export declare function traceValidateEvent(e: unknown): string | null;
/**
 * Open a trace state and buffer the run.opened frame. Throws on an invalid runId (fail-closed).
 *
 * `emitterPath` is REQUIRED and has NO DEFAULT, on purpose: a default would be chosen once, by
 * whoever added the parameter, and every future caller that forgot it would silently inherit that
 * choice. A missing argument must be a compile error instead.
 */
export declare function traceInit(runId: string, planDigest: string, execFp: string, emitterPath: TraceEmitterPath): TraceState;
/**
 * Allocate the DISPATCH seq and buffer the event — called SYNCHRONOUSLY immediately before the
 * `agent()`/`parallel()` call (the same synchronous statement pair; AM-2). Returns the seq.
 */
export declare function traceOnDispatch(state: TraceState, e: {
    invocationId: string;
    stepId: string;
    itemKey: string | null;
    attempt: number;
    phase: string;
    model: string | null;
    causedBy: number[];
}): number;
/** Allocate the SETTLE seq and buffer the event — called synchronously in the continuation after
 * the await resolves or rejects. Returns the seq (the causedBy input for dependents). */
export declare function traceOnSettle(state: TraceState, e: {
    invocationId: string;
    outcome: 'ok' | 'null' | 'error';
}): number;
/** Emit the trace half of the loud truncation receipt. This is not a dispatch and does not alter
 * run.closed invocation counts. */
export declare function traceOnFanoutTruncated(state: TraceState, e: {
    stage: string;
    registrySize: number;
    dispatched: number;
    reason: string;
}): number;
/** Buffer the run.closed frame (a trace without it parses as incomplete). */
export declare function traceClose(state: TraceState): void;
/**
 * Drain the buffer into ONE batched append command (the flush the cheap writer agent runs).
 * Each ENTIRE line is shq-escaped before splicing (JSON.stringify never emits raw newlines, so
 * printf '%s\n' emits exactly one record per line). Wall-clock is added SHELL-SIDE via sed —
 * diagnostic only (INV-16). Returns null when the buffer is empty (no agent call to spend).
 */
export declare function traceFlushCmd(state: TraceState, traceFileAbs: string): string | null;
/**
 * Drain the buffered, already-VALIDATED lines — the runner's flush primitive (W17/T0.1). The
 * fs-less Claude host turns the same buffer into a shell command (`traceFlushCmd`); a host that
 * HAS fs (the `dz workflow run` scheduler) appends exactly these lines itself. One buffer, two
 * drains, zero second line-shape: a line this returns has already passed `traceValidateEvent`,
 * because nothing else can enter the buffer. Empty buffer ⇒ `[]` (never a repeat of the last
 * batch).
 */
export declare function traceDrain(state: TraceState): string[];
/**
 * Build the feature-ADR live-panel telemetry leg. Totality comes from the caller's grouped splice:
 * returning the bare command lets that splice preserve the trace flush's exit status while
 * swallowing only the panel leg's failure. The `loop` producer marker stops a generated loop's
 * high-frequency zero counters from displacing a live `/feature-adr` run's meaningful panel.
 */
export declare function traceFaRecordCmd(dzBin: unknown, slug: unknown, stepLabel: unknown, projectAbs: unknown): string | null;
/** Build one feature-ADR run-cost row without manufacturing wall-clock data in JavaScript. */
export declare function traceLedgerLine(opts: {
    slug: unknown;
    runId?: unknown;
    planDigest?: unknown;
    /**
     * `agents` is the TOTAL number of agent invocations this run made — model dispatches AND infra
     * agents (trace flush, checkpoint read/write, training-pair write/backfill, landed-barrier probes,
     * and this ledger writer itself) — counted at write time. It is NOT the trace's model-dispatch
     * count; the ledger's `agents` column means `agent_count` from the Workflow completion
     * notification, and this row must not silently redefine it.
     */
    agents?: unknown;
    date?: unknown;
    outcome?: unknown;
}): string | null;
/** Build the single command that appends a run-cost row and confirms the write. */
export declare function traceLedgerAppendCmd(repoAbs: unknown, line: unknown): string | null;
export interface TraceRun {
    runId: string | null;
    planDigest: string | null;
    execFp: string | null;
    events: TraceEvent[];
    /** No run.closed frame ⇒ the tail may be lost; truncated-window invariants report inconclusive. */
    incomplete: boolean;
    parseErrors: string[];
    /** The self-declared HINT (see TraceEmitterPath) — null when absent. NEVER read as provenance. */
    emitterPath: TraceEmitterPath | null;
    /** Two `run.opened` frames that DISAGREE. The scan used to keep the last one silently, which
     *  would let a spliced frame overwrite the genuine one; a conflict now forbids `instrument`. */
    openConflict: boolean;
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
export declare function parseTrace(text: string): TraceRun;
/**
 * ATTESTATION — the trust question, answered by the READER, never by the file.
 *
 * `instrument` means, EXACTLY (ADR-001 round 3, wording taken from the cross-family reviewer):
 * *the bytes read match the identifiers, the hash and the line count asserted by the co-located
 * `run-state.json`.* It does NOT mean `dz` historically wrote those bytes, nor that this is the
 * directory it wrote them in. A byte-identical replay passes. Copying the matched trace+run-state
 * pair elsewhere passes. Both are accepted and tested, not patched.
 *
 * What it DOES buy: `run-state.json` is written by the dz process, and the rendered script runs in a
 * sandbox with no filesystem — so an agent that mis-writes, truncates, reorders or invents its
 * flush cannot reach `instrument`. What it cannot buy: a defence against an actor with write access
 * to the run directory. On this machine the agent IS such an actor and the signing key is readable
 * by the same account, so no local artifact — signature included — closes that. Named, not hidden.
 *
 * `unknown` is kept DISTINCT from `agent` (a legacy instrument run, a stripped field and explicit
 * agent testimony are different facts) while sharing its conservative tier for every decision.
 */
export type TraceAttestation = 'instrument' | 'agent' | 'unknown';
/** The subset of `run-state.json` the attestation reads. Unknown-shaped input is not an error — it
 *  simply fails to bind, which yields `unknown`. */
export interface TraceRunStateBinding {
    runId?: unknown;
    planDigest?: unknown;
    execFp?: unknown;
    traceSha256?: unknown;
    traceLines?: unknown;
}
/** What the CALLER measured about the trace text it actually read. Passed in rather than computed
 *  here so this module keeps its zero dependencies (no node:crypto) and stays trivially testable. */
export interface TraceObserved {
    sha256: string;
    lines: number;
}
export declare function deriveAttestation(run: TraceRun, state: TraceRunStateBinding | null | undefined, observed: TraceObserved): TraceAttestation;
export type InvariantStatus = 'pass' | 'fail' | 'inconclusive';
export interface InvariantVerdict {
    id: string;
    status: InvariantStatus;
    message: string;
    /**
     * FR-3 — the qualifier travels IN the verdict, never beside it. A caller that stores a verdict
     * and reads it back later must not be able to end up holding a bare `pass` whose attestation was
     * dropped in transit. Optional only so a caller that has not derived one is a compile-time
     * possibility; `stampAttestation` is how the reader attaches it.
     */
    attestation?: TraceAttestation;
}
/** Attach one attestation to every verdict in a batch. Kept as a named function rather than a spread
 *  at each call site so a NEW verdict producer cannot silently ship unstamped verdicts. */
export declare function stampAttestation(verdicts: InvariantVerdict[], attestation: TraceAttestation): InvariantVerdict[];
/**
 * Evaluate the plan-derived runtime invariants over an observed trace. Consumes ONLY
 * `toTraceProjection(plan)` (AM-3) and ONLY runtime-assigned `seq` (never wallTime — INV-16).
 * The SAME function serves the fitness suite and `dz workflow-trace` (one implementation,
 * two call sites). An incomplete trace turns window-truncated checks inconclusive, never pass.
 */
export declare function runInvariants(projection: TraceProjection, run: TraceRun): InvariantVerdict[];
export interface ExpectedInvariant {
    /** happens-before: `before` event must have a smaller seq than `after`.
     * streaming-overlap: QUANTIFIED streaming property (QE round-3 B4) — SOME dispatch of
     * `downstream` must precede the FINAL settle of `upstream` (by seq). */
    type: 'happens-before' | 'no-overlap' | 'max-concurrency' | 'streaming-overlap';
    /** For happens-before. */
    before?: {
        event: 'dispatched' | 'settled';
        stepId: string;
        itemKey?: string | null;
    };
    after?: {
        event: 'dispatched' | 'settled';
        stepId: string;
        itemKey?: string | null;
    };
    /** For streaming-overlap. */
    upstream?: string;
    downstream?: string;
    /** For no-overlap / max-concurrency. */
    steps?: string[];
    limit?: number;
    note?: string;
}
/** Evaluate hand-authored expected invariants (from a fitness fixture) over a trace — by SEQ only. */
export declare function evaluateExpectedInvariants(expected: ExpectedInvariant[], run: TraceRun): InvariantVerdict[];
export interface TimelineRow {
    seq: number;
    kind: 'trace' | 'checkpoint' | 'ledger' | 'usage' | 'journal';
    label: string;
    detail: string;
    wallTime: string | null;
}
export interface Timeline {
    runId: string | null;
    incomplete: boolean;
    rows: TimelineRow[];
    sources: string[];
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
export declare function assembleTimeline(input: {
    trace: string;
    checkpoints?: string | null;
    ledger?: string | null;
    usageEvents?: unknown[] | null;
    journal?: string | null;
}): Timeline;
/**
 * ONE self-contained HTML file: mermaid for the plan TOPOLOGY, an HTML/CSS waterfall TABLE for the
 * event timeline — two different renderers structurally (Codex 04/Q3: mermaid degrades on dense
 * traces; the timeline is never a second mermaid diagram).
 */
export declare function renderTimelineHtml(timeline: Timeline, projection: TraceProjection | null, verdicts: InvariantVerdict[]): string;
//# sourceMappingURL=loop-trace.d.ts.map