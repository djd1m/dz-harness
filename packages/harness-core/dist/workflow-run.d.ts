/**
 * `workflow-run` — the PURE scheduler half of `dz workflow run` (feature dz-workflow-run).
 *
 * `dz workflow run` INTERPRETS a `loop-plan/1` plan; it never executes the rendered Claude-host
 * script (ADR-001). That is the whole design in one sentence, and everything in this file follows
 * from it: the plan is read through a PROJECTION (`toRunProjection` — the AM-3 doctrine, now with a
 * second enactor), the enactment DECISIONS come from the one shared module the rendered script also
 * carries as a blob (`loop-run-semantics`), and the trace is emitted through the SAME validated
 * grammar the Claude host uses (`loop-trace`), so a divergent event cannot even be buffered.
 *
 * PURITY (NFR-3): everything here is deterministic under injected seams — a `Dispatcher` per family,
 * a `RunStore` for every byte that touches a disk, an injected clock and an injected runId. No
 * `spawn`, no `fs`, no `Date`, no randomness. That is what buys the determinism test, the
 * replay-derived discrimination leg, the landed-barrier mutant and all 22 taxonomy producers
 * WITHOUT spawning a single child.
 *
 * The three refusal planes, in the order a run meets them:
 *   1. PREFLIGHT — decidable before anything is spawned (no trace plane, unroutable model, a write
 *      that escapes the root, same-family QE, an operator override that cannot fit a boundary).
 *   2. RESUME — decidable from state + checkpoints + artifact probes, never from a step list.
 *   3. RUNTIME — dispatch failures, gate verdicts, deliverables that did not land, budget.
 * Every refusal names itself from ONE closed list (`WF_RUN_REASONS`), and the list is the count
 * authority a reachability suite walks.
 */
import type { LoopPlan, RunProjection, RunStepSpec } from './loop-plan.js';
import { type BridgeFamily } from './qe-bridge.js';
import { type Dispatcher } from './workflow-run-dispatch.js';
export declare const WF_RUN_STATE_SCHEMA = "wf-run-state/1";
export declare const WF_BUDGET_ROW_SCHEMA = "wf-budget-1";
export declare const WF_PAUSE_ENVELOPE_SCHEMA = "wf-pause-envelope/1";
export declare const WF_RUN_RESULT_SCHEMA = "wf-run-result/1";
export declare const WF_RUN_OWNER_HOST = "dz-workflow-run";
/** ADR-004 W9 — a DECLARED GUESS, deliberately ONE exported constant so calibration is a one-line
 * change with a name, not a number sprinkled through the scheduler. */
export declare const WALLCLOCK_CEILING_MULTIPLIER = 1.5;
/** 75 = sysexits EX_TEMPFAIL ("try again later"). NOT 3: that collides with workflow-lint's
 * inconclusive and reads ignorable, while a pause strands resumable progress (AM-11). */
export declare const WF_EXIT: {
    readonly completed: 0;
    readonly failed: 1;
    readonly usage: 2;
    readonly pause: 75;
};
/**
 * The CLOSED reason set (AM-1 + AM-15 + AM-19) as DATA — the single count authority. The
 * reachability suite WALKS this array: a member no in-suite scenario can produce fails the suite, so
 * the list can never quietly grow a decorative member or lose a real one. Every count written in
 * prose anywhere is a DESCRIPTION of this array, never a second authority.
 */
export declare const WF_RUN_REASONS: readonly ["plan-invalid", "trace-emit-required", "plan-model-unroutable", "artifact-path-escapes-root", "probe-failed", "dispatch-timeout", "dispatch-dead", "gate-verdict-unparseable", "deliverable-not-landed", "same-family-qe-refused", "prompt-over-ceiling", "stale-input-refused", "resume-model-unavailable", "foreign-run-refused", "run-exists", "run-locked", "budget-exhausted", "budget-extension-exhausted", "budget-invariant-violated", "resume-already-completed", "wall-extension-exhausted", "reservation-unsatisfiable", "gate-failed", "plan-pause"];
export type WfRunReason = (typeof WF_RUN_REASONS)[number];
/**
 * The members whose PRODUCER lives in the impure half (`dz workflow run`'s CLI): a run DIRECTORY
 * that already holds a run, and a LIVE owner marker. Neither is decidable without a filesystem, so
 * neither can be produced by the core suite.
 *
 * Exported as DATA so the reachability proof spans both packages WITHOUT either side restating the
 * other's list: the core suite asserts `produced-in-core ∪ this === WF_RUN_REASONS`, and the CLI
 * suite asserts it produces every member of exactly this array. Together that is a real 23/23 walk;
 * a member that fell out of both halves would fail the core union check, and a member added here
 * without a CLI producer would fail the CLI check.
 */
export declare const WF_RUN_REASONS_CLI_PRODUCED: readonly ["run-exists", "run-locked"];
export interface WfRunOwner {
    host: typeof WF_RUN_OWNER_HOST;
    runnerVersion: string;
    pid: number;
    startedMarker: string;
}
export interface WfRunState {
    schema: typeof WF_RUN_STATE_SCHEMA;
    /**
     * CONTENT binding for the attestation (feature honest-trace-provenance, ADR-001 round 3).
     * Identifiers alone were not enough: a fabricated trace dropped beside a genuine run-state with
     * matching ids satisfied the binding, which is exactly the counterexample that failed round 2.
     * Optional because a state written before this feature has none — and a state with NO binding can
     * never mint `instrument`, which is the fail-closed direction.
     */
    traceSha256?: string;
    traceLines?: number;
    owner: WfRunOwner;
    status: 'running' | 'paused' | 'completed' | 'failed';
    runId: string;
    /** BARE hex everywhere it is stored or compared (K7) — the rendered header's `sha256:` prefix is
     * display-only. One domain, so no comparison has to remember to strip a prefix. */
    planDigest: string;
    execFp: string;
    argsHash: string;
    pause?: {
        state: string;
        resumeArg: string;
        payloadSchema: Record<string, unknown> | null;
        remainingSteps: string[];
        reservationNote: string;
    };
    failure?: {
        reason: WfRunReason;
        detail: string;
    };
    /**
     * DIAGNOSTIC-ONLY (W10). Read by NOTHING — the resume cursor comes from checkpoint lines plus
     * artifact probes, never from a step list a crashed writer may have half-updated. A test corrupts
     * this field arbitrarily and asserts every resume decision is byte-identical.
     */
    completedSteps: string[];
    /** stepId → PROBED model id (joins resume identity, AM-8). */
    resolvedModels: Record<string, string>;
    budget: {
        total: number;
        spent: number;
        extensions: {
            ts: string;
            extra: number;
            newTotal: number;
        }[];
    };
    wallClock: {
        ceilingMs: number;
        spentMs: number;
        extensions: {
            ts: string;
            extraMs: number;
            newCeilingMs: number;
        }[];
    };
    waivers: {
        kind: 'same-family-qe';
        step: string;
        recordedDebt: string;
    }[];
    /**
     * Every resume arg supplied so far, across ALL legs (Step-8 re-QE NEW-B2). Which pauses are
     * SATISFIED is run state, not an argument of the current invocation: a three-pause plan is
     * resumed three times, and leg 3 supplies only its own key.
     */
    resumeArgs?: Record<string, string>;
    coderFamily: BridgeFamily;
    startedAt: string;
    updatedAt: string;
    /** True when a scripted-dispatcher TEST SEAM supplied the dispatchers — recorded LOUDLY, because
     * a test seam that leaves no trace in the artifact is indistinguishable from a real run. */
    dispatcherOverride?: boolean;
}
export interface WfBudgetRow {
    schema: typeof WF_BUDGET_ROW_SCHEMA;
    kind: 'stage' | 'probe';
    runId: string;
    /** Joins 1:1 to the trace's dispatch events; null on a probe row (a probe is not a dispatch). */
    dispatchSeq: number | null;
    stepId: string | null;
    itemKey: string | null;
    attempt: number | null;
    family: BridgeFamily;
    model: string | null;
    wallMs: number;
    tokensIn: number | null;
    tokensOut: number | null;
    tokensSource: 'claude-envelope' | 'codex-stderr' | null;
    outcome: 'ok' | 'null' | 'error' | null;
    timeoutMs: number | null;
}
export interface WfPauseEnvelope {
    schema: typeof WF_PAUSE_ENVELOPE_SCHEMA;
    runId: string;
    exitCode: 75;
    pauseState: string;
    /** CLOSED (Step-8 HIGH-7): a member of `WF_RUN_REASONS`, never a free string. */
    reason: WfRunReason;
    /** The REAL path of this run's state file — a custom `--run-dir` must not be told to look in the
     * default one. */
    runStatePath: string;
    /** A command that actually works for this run, `--run-dir` included. */
    resumeCmd: string;
}
export interface WfRunResult {
    schema: typeof WF_RUN_RESULT_SCHEMA;
    runId: string;
    status: 'completed' | 'failed';
    reason?: WfRunReason;
    exitCode: 0 | 1;
    /**
     * The gate `terminal:` route this run ended on, when it ended on one (Step-8 MEDIUM-13).
     *
     * A terminal route is a PLAN-DECLARED ending, so the exit code stays 0 — parity with the rendered
     * script, whose top-level terminal `return` also completes the Workflow. But "completed" and
     * "completed because a gate rejected it" are different facts, and a wrapper could not tell them
     * apart from the result line alone; the route was visible only in the ledger. It is a field
     * rather than a new exit code because changing the exit semantics would silently reclassify every
     * existing terminal-route run.
     */
    terminalRoute?: string;
    /** True when the SCRIPTED dispatcher seam supplied the models (Step-8 MEDIUM-11) — a run that
     * dispatched to no real model must say so in its own result, not only in a state file. */
    dispatcherOverride?: boolean;
}
export interface RunnerInputs {
    plan: LoopPlan;
    runId: string;
    coderFamily: BridgeFamily;
    allowSameFamilyQe: boolean;
    defaultFamily: BridgeFamily | null;
    budgetOverride: number | null;
    maxWallClockMsOverride: number | null;
    stageTimeoutMsOverride: number | null;
    /** runId to resume, or null for a fresh run. */
    resume: string | null;
    resumeArgs: Record<string, string>;
    budgetExtra: number | null;
    wallClockExtraMs: number | null;
    runnerVersion: string;
    cwdRoot: string;
}
/**
 * The run-args identity hash, over the inputs MINUS an ENUMERATED exclusion list (AM-13 / W12).
 *
 * The exclusions are the whole point and they are returned as DATA so a test can pin them rather
 * than restate them: the plan-declared `resumeArg` keys (supplying one is what a resume IS),
 * `budgetExtra` and `wallClockExtra` (extending a ceiling is a resume-plane input, not a different
 * run). Everything else — including a resume arg the plan never declared — is IDENTITY, so changing
 * it makes the resume stale rather than silently continuing a different run.
 */
export declare function computeRunArgsHash(inputs: RunnerInputs, proj: RunProjection): {
    hash: string;
    excluded: string[];
};
export interface BoundaryReservation {
    boundaryId: string;
    kind: 'stage' | 'region' | 'gate';
    steps: string[];
    /** Worst-case agent invocations this boundary can consume, retries and redos included. */
    invocations: number;
    /** Worst-case wall clock, before the ceiling multiplier. */
    wallMs: number;
}
/**
 * Worst-case reservation PER BOUNDARY (AM-4: a region is reserved as a whole and never interrupted,
 * which is what makes "pause BEFORE the region" expressible at all).
 *
 *   • stage — the step's declared `maxAgents`;
 *   • gate  — the gate's own allowance PLUS the declared redo allowance, reserved AT the gate
 *             boundary (a plan-declared redo must be affordable where it is spent, not somewhere
 *             upstream, or a short budget pauses in the middle of a redo loop);
 *   • region — every activated member × the whole chain. This is the number that can legitimately
 *             exceed the plan's total: the render's ceiling counts a member step ONCE, the runtime
 *             dispatches it per item. Naming the gap here is what makes the extension cap
 *             satisfiable instead of a surprise mid-run.
 */
export declare function computeBoundaryReservations(proj: RunProjection, timeoutMsFor: (s: RunStepSpec) => number): BoundaryReservation[];
/**
 * The extension cap (AM-14, correcting AM-5's doubling): `max(2 × originalTotal, Σ reservations)`.
 *
 * The doubling bound ALONE left a valid plan permanently unresumable — counterexample from the
 * amendment: T=10 with a last boundary needing 25 can never be finished, because the achievable cap
 * is 20 and the prefix already spent some of it. Σ reservations is PREFIX-CLOSED (actual spend per
 * construct never exceeds its own reservation), so default caps are satisfiable BY CONSTRUCTION.
 * The named cost: for attempt-heavy plans the cap is larger than 2×T, so the doubling guarantee is
 * weakened exactly there — the extension records are what keep that audited.
 */
export declare function computeAchievableMax(originalTotal: number, reservations: BoundaryReservation[]): number;
/** ADR-004 W9: Σ worst-case wall × the declared multiplier. The multiplier is a GUESS with a name. */
export declare function computeWallClockCeilingMs(reservations: BoundaryReservation[]): number;
export interface PreflightDeps {
    /** Resolve a path to its real location, or null when it cannot be resolved. */
    realpath: (p: string) => string | null;
    exists: (p: string) => boolean;
}
export interface PreflightOk {
    ok: true;
    projection: RunProjection;
    planDigest: string;
    execFp: string;
    argsHash: string;
    /** stepId → family, TOTAL over every dispatching step (AM-8): resolution happens ONCE, here. */
    families: Record<string, BridgeFamily>;
    reservations: BoundaryReservation[];
    budgetTotal: number;
    wallCeilingMs: number;
    achievableMax: number;
    /** The wall twin of `achievableMax` (AM-14 arithmetic): `max(2 × the COMPUTED default ceiling,
     * Σ boundary wall reservations)`. Plan-derived, so an operator override cannot inflate its own
     * cap (Step-8 HIGH-5). */
    achievableWallMs: number;
    /** same-family QE steps proceeding under the LOUD waiver (each one owes a re-QE debt). */
    qeWaivers: {
        step: string;
    }[];
}
export interface PreflightRefusal {
    ok: false;
    reason: WfRunReason;
    detail: string;
}
/** The per-stage timeout the run uses: the operator's override, else the measured codex xhigh
 * ceiling (the far end of the distribution — a shorter default would turn slow models into
 * `dispatch-timeout` noise). */
export declare function stageTimeoutMs(inputs: RunnerInputs): number;
/**
 * Refusals in a FIXED order, each one named:
 *   trace-emit-required → plan-model-unroutable → artifact-path-escapes-root →
 *   same-family-qe-refused (unless waived) → reservation-unsatisfiable.
 *
 * The order is not cosmetic. `trace-emit-required` comes first because a run with no trace plane is
 * unverifiable — refusing it later would mean deciding routing for a run nobody could ever check.
 * `reservation-unsatisfiable` comes last because it is the only refusal that depends on every
 * preceding resolution, and it fires ONLY for an EXPLICIT operator override: the defaults are
 * satisfiable by construction (AM-14), so a default-budget run that cannot fit a boundary pauses and
 * resumes rather than refusing to start.
 *
 * `plan-invalid` never reaches here — the CLI parses and validates first and exits 2.
 */
export declare function preflight(inputs: RunnerInputs, deps: PreflightDeps): PreflightOk | PreflightRefusal;
export interface RunResumeDecision {
    ok: boolean;
    reason?: WfRunReason;
    detail?: string;
    /** Completed top-level boundaryIds. Built from checkpoint lines + artifact probes ONLY. */
    cursor: Set<string>;
}
/**
 * The runner's checkpoint key: `checkpointInputHash` (the `fa-ckpt-2` line shape the timeline reader
 * already merges), SALTED with the exec fingerprint exactly like the rendered script's
 * `__ckptInputHash`. Salting with the fingerprint is what makes a semantics change invalidate every
 * prior checkpoint instead of resuming into a plan that no longer means the same thing.
 */
export declare function runnerCheckpointHash(boundaryId: string, execFp: string, promptText: string, depResults: unknown[]): string;
/**
 * Refusals in a FIXED order: foreign-run-refused → resume-already-completed → stale-input-refused →
 * resume-model-unavailable. (`run-locked` is the CALLER's — it belongs to the lock, not to the
 * decision.)
 *
 * Two properties this function exists to guarantee:
 *   • A STALE-INPUT mismatch never resumes, in ANY mode — there is no override, because the hash
 *     proves run-INPUT identity and an input change means the remaining work is not the work the
 *     checkpoints describe.
 *   • The cursor is built from CHECKPOINT LINES plus ARTIFACT PROBES and from nothing else.
 *     `completedSteps` in run-state is diagnostic: a crashed writer can leave it optimistic, and a
 *     resume that believed it would skip work that never happened.
 */
/**
 * The OWNERSHIP + IDENTITY half of the resume decision — everything decidable WITHOUT dispatching
 * anything (Step-8 re-QE NEW-B1).
 *
 * Round 1 hoisted the model probe above the whole decision so `resume-model-unavailable` could be
 * produced at all. That was right, and it had a cost nobody priced: a foreign, completed or
 * stale-input run PROBED first and therefore wrote a `wf-budget-1` probe row before being refused.
 * A refused run must spend NOTHING — a budget row is a record of work, and there was none.
 *
 * So the decision is in two phases now. This one needs no dispatcher, runs first, and refuses on
 * ownership or identity. The model-availability half stays in `decideRunResume`, after the probe.
 * Returns null when there is nothing to refuse.
 */
export declare function decideResumeIdentity(opts: {
    runState: WfRunState | null;
    hasTrace: boolean;
    identity: {
        planDigest: string;
        execFp: string;
        argsHash: string;
    };
}): {
    reason: WfRunReason;
    detail: string;
} | null;
/**
 * Accumulate the resume args of the WHOLE pause chain (Step-8 re-QE NEW-B2).
 *
 * A pause is satisfied by an arg supplied in SOME leg, not necessarily the current one. Reading only
 * `inputs.resumeArgs` meant leg 3 (supplying `go2`) forgot that leg 2 had supplied `go1`, so the run
 * fell back to the already-satisfied first pause and could never advance past two pauses at all
 * (MEASURED: P1 → P2 → P1 → P1). The satisfied set is run STATE, so it lives in run-state.
 *
 * FIRST WINS for a key that has already been consumed: the boundary it satisfied has already run,
 * and its result is in the checkpoints and the trace. Re-supplying the SAME value is a harmless
 * repeat; re-supplying a DIFFERENT one is refused rather than silently re-deciding history.
 */
export declare function accumulateResumeArgs(persisted: Record<string, string> | undefined, supplied: Record<string, string>): {
    args: Record<string, string>;
    conflict: {
        key: string;
        was: string;
        now: string;
    } | null;
};
export declare function decideRunResume(opts: {
    runState: WfRunState | null;
    hasTrace: boolean;
    identity: {
        planDigest: string;
        execFp: string;
        argsHash: string;
    };
    checkpointsText: string | null;
    expectedHashFor: (boundaryId: string) => string;
    probeArtifact: (rel: string) => boolean;
    /** The declared writes of a boundary — its checkpoint is only resumable while they still EXIST.
     * (Step-8 BLOCKER-2: this was missing, so `probeArtifact` was never called and a checkpointed
     * file stage whose deliverable had been deleted was skipped on resume.) */
    declaredWritesFor?: (boundaryId: string) => string[];
    reprobedModels: Record<string, string | null>;
}): RunResumeDecision;
/**
 * Torn-tail-tolerant JSONL reader (ADR-004 Confirmation-4b). A malformed LAST line is the signature
 * of a process that died mid-append — it is skipped with a NAMED warning. A malformed INTERIOR line
 * is not: something rewrote history, and silently continuing would hide it.
 */
export declare function readJsonlTolerant(text: string): {
    rows: unknown[];
    tornTail: boolean;
    warnings: string[];
};
/** The machine-readable pause envelope (AM-16): a wrapper distinguishes pause from failure using
 * ONLY stdout + the exit code, never prose. */
export declare function buildPauseEnvelope(runId: string, pauseState: string, reason: WfRunReason, planPath: string, resumeArg: string | null, where?: {
    runStatePath?: string | undefined;
    runDirArg?: string | null | undefined;
}): WfPauseEnvelope;
export interface RunStore {
    runDirExists(): boolean;
    hasTrace(): boolean;
    /**
     * The trace text written so far, or null when there is none.
     *
     * ADDED to the architecture's verbatim `RunStore` (flagged, not smuggled): a RESUMED leg must
     * CONTINUE the seq counter, not restart it at 1. Without this the two legs of one run collide on
     * seq 1..n and the CONCATENATED trace fails `seq-monotonic` and `join-coverage` — which is
     * exactly the property ADR-004 Confirmation-3 requires to hold across a resume. Reading the file
     * is the only way the pure half can know the high-water mark, and putting the mark in run-state
     * instead would make a diagnostic field load-bearing (the W10 mistake).
     */
    readTraceText(): string | null;
    /** sha256 + non-empty line count of trace.jsonl AS IT NOW STANDS ON DISK, or null when absent.
     *  Impure by nature (hashing a file), so it lives behind the store seam like every other fs read. */
    measureTrace(): {
        sha256: string;
        lines: number;
    } | null;
    readRunState(): WfRunState | null;
    /** Atomic in the fs impl (temp + rename): a half-written state is a foreign run forever. */
    writeRunState(s: WfRunState): void;
    appendTraceLines(lines: string[]): void;
    readCheckpointsText(): string | null;
    appendCheckpointLine(line: string): void;
    appendBudgetRow(row: WfBudgetRow): void;
    appendLedgerLine(line: string): void;
    probeArtifact(rel: string): boolean;
    /**
     * Does this declared artifact path STILL resolve inside the run root, RIGHT NOW? (re-QE R3-A /
     * round-1 C4's "repeat containment immediately before filesystem access".) The fs impl applies
     * the realpath + symlinked-ancestor walk; a symlink planted between preflight and dispatch is
     * caught here for reads AND writes, not only inferred from a landed-barrier miss on writes.
     */
    pathContainmentOk(rel: string): boolean;
    /** Pre-dispatch content fingerprints of the declared writes (null = absent). */
    snapshotWrites(rels: string[]): Record<string, string | null>;
    writeReqeDebt(record: object): void;
}
export interface SchedulerDeps {
    store: RunStore;
    dispatchers: Record<BridgeFamily, Dispatcher>;
    /** Short state transactions ONLY — never held across a dispatch. */
    lock<T>(fn: () => T): T;
    /** Injected ISO clock (determinism, NFR-2). */
    now(): string;
    monotonicMs(): number;
    /**
     * TEST SEAM (named, never a casual flag): disables the landed barrier so the F5 mutant can show
     * the lying file-step passing. Default false; a run that sets it records `dispatcherOverride`.
     */
    disableLandedBarrier?: boolean;
    /** TEST SEAM: corrupts reservation arithmetic so the per-spawn guard fires inside a reserved
     * region — the ONLY way to reach `budget-invariant-violated` without a real arithmetic bug. */
    corruptReservations?: boolean;
    /** Recorded loudly in run-state when the dispatchers came from the scripted test seam. */
    dispatcherOverride?: boolean;
    planPath?: string;
    slug?: string;
    /** The REAL path of this run's `run-state.json` (Step-8 HIGH-7 — the envelope may not guess it). */
    runStatePath?: string;
    /** The `--run-dir` value the caller used, so the resume command reproduces THIS run. */
    runDirArg?: string | null;
    /** The pid that actually HOLDS this run's owner claim, and when it took it (Step-8 HIGH-6).
     * `run-state.owner.pid` used to be initialised to 0 — a durable record of a process that never
     * existed, which no liveness check could ever mean anything against. */
    ownerPid?: number;
    ownerStartedMarker?: string;
}
export type RunOutcome = {
    kind: 'completed';
    exitCode: 0;
    result: WfRunResult;
} | {
    kind: 'failed';
    exitCode: 1;
    reason: WfRunReason;
    detail: string;
    result: WfRunResult;
} | {
    kind: 'paused';
    exitCode: 75;
    envelope: WfPauseEnvelope;
};
/**
 * THE interpreter loop.
 *
 * Per boundary, in plan order: RESERVE (and pause BEFORE the boundary if the worst case does not
 * fit) → dispatch through the family `Dispatcher` with immediate retries over the closed classes →
 * settle through the shared trace emitter → verify a file deliverable actually landed → checkpoint →
 * append the budget row. A per-spawn guard fires only if the reservation arithmetic was WRONG, and
 * that is a FAILURE (`budget-invariant-violated`), never a pause: a pause promises the remaining
 * work fits after an extension, and a broken invariant promises nothing.
 */
export declare function runWorkflow(inputs: RunnerInputs, pre: PreflightOk, deps: SchedulerDeps): Promise<RunOutcome>;
//# sourceMappingURL=workflow-run.d.ts.map