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

import type { FailureClass, LoopPlan, RunBoundary, RunProjection, RunStepSpec } from './loop-plan.js';
import { toRunProjection, planDigest } from './loop-plan.js';
import { computeExecAxisInputs, computeExecFingerprint } from './loop-render.js';
import {
  parseTrace,
  traceClose,
  traceDrain,
  traceInit,
  traceLedgerLine,
  traceOnDispatch,
  traceOnFanoutTruncated,
  traceOnSettle,
  traceShellQuote,
  TRACE_KEY_RE,
  type TraceState,
} from './loop-trace.js';
import { classifyFailure, errSnap, gateVerdict, joinRegion, stepContractLines, type JoinOutcome } from './loop-run-semantics.js';
import { checkpointInputHash, decideCheckpointResume, parseCheckpointRead, serializeCheckpoint } from './feature-adr-checkpoints.js';
import { modelFamily, type BridgeFamily } from './qe-bridge.js';
import { CODEX_EXEC_XHIGH_TIMEOUT_MS, defangGateEchoes, type DispatchResult, type Dispatcher } from './workflow-run-dispatch.js';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas / constants
// ─────────────────────────────────────────────────────────────────────────────

export const WF_RUN_STATE_SCHEMA = 'wf-run-state/1';
export const WF_BUDGET_ROW_SCHEMA = 'wf-budget-1';
export const WF_PAUSE_ENVELOPE_SCHEMA = 'wf-pause-envelope/1';
export const WF_RUN_RESULT_SCHEMA = 'wf-run-result/1';
export const WF_RUN_OWNER_HOST = 'dz-workflow-run';

/** ADR-004 W9 — a DECLARED GUESS, deliberately ONE exported constant so calibration is a one-line
 * change with a name, not a number sprinkled through the scheduler. */
export const WALLCLOCK_CEILING_MULTIPLIER = 1.5;

/** 75 = sysexits EX_TEMPFAIL ("try again later"). NOT 3: that collides with workflow-lint's
 * inconclusive and reads ignorable, while a pause strands resumable progress (AM-11). */
export const WF_EXIT = { completed: 0, failed: 1, usage: 2, pause: 75 } as const;

/**
 * The CLOSED reason set (AM-1 + AM-15 + AM-19) as DATA — the single count authority. The
 * reachability suite WALKS this array: a member no in-suite scenario can produce fails the suite, so
 * the list can never quietly grow a decorative member or lose a real one. Every count written in
 * prose anywhere is a DESCRIPTION of this array, never a second authority.
 */
export const WF_RUN_REASONS = [
  'plan-invalid', 'trace-emit-required', 'plan-model-unroutable', 'artifact-path-escapes-root',
  'probe-failed', 'dispatch-timeout', 'dispatch-dead', 'gate-verdict-unparseable',
  'deliverable-not-landed', 'same-family-qe-refused', 'prompt-over-ceiling',
  'stale-input-refused', 'resume-model-unavailable', 'foreign-run-refused', 'run-exists',
  'run-locked', 'budget-exhausted', 'budget-extension-exhausted', 'budget-invariant-violated',
  'resume-already-completed', 'wall-extension-exhausted', 'reservation-unsatisfiable',
  // AM-19: a PARSED `GATE: FAIL` with its routing exhausted is not an unparseable verdict. The
  // model answered clearly; the plan declared nowhere for the answer to go. Two producers, two
  // members — collapsing them would tell an operator the model produced garbage when it did not.
  'gate-failed',
  // AM-20 (Step-8 HIGH-7): a plan-declared pause is a first-class RESULT of a run, and AM-16
  // requires the envelope's `reason` to be a member of THIS list. It was emitting the free string
  // `typed-pause`, which is exactly the "closed set with an escape hatch" shape the taxonomy exists
  // to forbid — a wrapper switching on the list would have fallen through.
  'plan-pause',
] as const;
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
export const WF_RUN_REASONS_CLI_PRODUCED = ['run-exists', 'run-locked'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// State shapes (ADR-003 `wf-run-state/1`)
// ─────────────────────────────────────────────────────────────────────────────

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
  failure?: { reason: WfRunReason; detail: string };
  /**
   * DIAGNOSTIC-ONLY (W10). Read by NOTHING — the resume cursor comes from checkpoint lines plus
   * artifact probes, never from a step list a crashed writer may have half-updated. A test corrupts
   * this field arbitrarily and asserts every resume decision is byte-identical.
   */
  completedSteps: string[];
  /** stepId → PROBED model id (joins resume identity, AM-8). */
  resolvedModels: Record<string, string>;
  budget: { total: number; spent: number; extensions: { ts: string; extra: number; newTotal: number }[] };
  wallClock: { ceilingMs: number; spentMs: number; extensions: { ts: string; extraMs: number; newCeilingMs: number }[] };
  waivers: { kind: 'same-family-qe'; step: string; recordedDebt: string }[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Runner inputs + identity
// ─────────────────────────────────────────────────────────────────────────────

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

/** Small, dependency-free 64-bit FNV — the same shape the checkpoint plane uses, kept local so this
 * module has no reason to reach for a crypto import in a file that must stay trivially pure. */
function fnv64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
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
export function computeRunArgsHash(inputs: RunnerInputs, proj: RunProjection): { hash: string; excluded: string[] } {
  const excluded = [...proj.resumeArgKeys, 'budgetExtra', 'wallClockExtra'].sort();
  const declared = new Set(proj.resumeArgKeys);
  const identityArgs = Object.keys(inputs.resumeArgs)
    .filter((k) => !declared.has(k))
    .sort()
    .map((k) => [k, inputs.resumeArgs[k] ?? null] as const);
  const tuple = [
    'wf-run-args/1',
    inputs.runId,
    inputs.coderFamily,
    inputs.allowSameFamilyQe,
    inputs.defaultFamily,
    inputs.budgetOverride,
    inputs.maxWallClockMsOverride,
    inputs.stageTimeoutMsOverride,
    inputs.cwdRoot,
    identityArgs,
  ];
  return { hash: fnv64(JSON.stringify(tuple)), excluded };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reservation arithmetic (ADR-004 W11 / W19 / W9)
// ─────────────────────────────────────────────────────────────────────────────

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
export function computeBoundaryReservations(
  proj: RunProjection,
  timeoutMsFor: (s: RunStepSpec) => number,
): BoundaryReservation[] {
  const gateAllowanceOf = (b: RunBoundary): number => {
    const g = b.stage?.gate;
    if (b.stage === undefined || g === null || g === undefined) return 0;
    if (g.maxRedos <= 0 || g.failRoute === null || g.failRoute.startsWith('terminal:')) return 0;
    const route = proj.boundaries.find((x) => x.boundaryId === g.failRoute)?.stage;
    return g.maxRedos * ((route === undefined ? 1 : worstCaseInvocations(route)) + worstCaseInvocations(b.stage));
  };
  const gateWallOf = (b: RunBoundary): number => {
    const g = b.stage?.gate;
    if (b.stage === undefined || g === null || g === undefined) return 0;
    if (g.maxRedos <= 0 || g.failRoute === null || g.failRoute.startsWith('terminal:')) return 0;
    const route = proj.boundaries.find((x) => x.boundaryId === g.failRoute)?.stage;
    const routeWall = route === undefined ? 0 : worstCaseInvocations(route) * timeoutMsFor(route);
    return g.maxRedos * (routeWall + worstCaseInvocations(b.stage) * timeoutMsFor(b.stage));
  };

  const out: BoundaryReservation[] = [];
  for (const b of proj.boundaries) {
    if (b.kind === 'pause') continue; // a pause dispatches nothing — it reserves nothing
    if (b.kind === 'region') {
      const r = b.region;
      if (r === undefined) continue;
      const members = activatedMembers(r.registry, r.dedup, r.maxFanout, r.overflow).length;
      const perItem = r.chain.reduce((n, s) => n + worstCaseInvocations(s), 0);
      const perItemWall = r.chain.reduce((n, s) => n + worstCaseInvocations(s) * timeoutMsFor(s), 0);
      out.push({
        boundaryId: b.boundaryId,
        kind: 'region',
        steps: r.chain.map((s) => s.stepId),
        invocations: members * perItem,
        // a `barrier`/`pipeline` region runs at most maxFanout branches at once, so its worst-case
        // WALL is the serialized work divided by the concurrency bound (never below one full item)
        wallMs: r.maxFanout > 0 ? Math.ceil((members * perItemWall) / r.maxFanout) : members * perItemWall,
      });
      continue;
    }
    const s = b.stage;
    if (s === undefined) continue;
    out.push({
      boundaryId: b.boundaryId,
      kind: b.kind === 'gate' ? 'gate' : 'stage',
      steps: [s.stepId],
      invocations: worstCaseInvocations(s) + gateAllowanceOf(b),
      wallMs: worstCaseInvocations(s) * timeoutMsFor(s) + gateWallOf(b),
    });
  }
  return out;
}

/**
 * The members a fanout actually ACTIVATES.
 *
 * `maxFanout` caps CONCURRENCY under the default/window policy. Only the explicitly declared
 * `overflow:'truncate'` escape hatch caps activation, and that path owes stderr + trace receipts.
 * This function is shared by reservation arithmetic and enactment so neither can silently retain
 * the old prefix-only interpretation.
 */
function activatedMembers(registry: string[], dedup: boolean, maxFanout: number, overflow: 'window' | 'truncate'): string[] {
  const base = dedup ? [...new Set(registry)] : [...registry];
  return overflow === 'truncate' && maxFanout > 0 ? base.slice(0, maxFanout) : base;
}

/**
 * The worst-case invocations ONE occurrence of a step can consume: it cannot attempt more times
 * than its retry profile allows, and the budget guard caps it at its declared allowance. Reserving
 * the raw `maxAgents` would over-reserve by the whole retry headroom a step never asked for — and
 * an over-reservation is not "safe", it is a run that pauses before work it could have afforded.
 */
function worstCaseInvocations(s: RunStepSpec): number {
  return Math.max(1, Math.min(s.maxAgents, s.retryMaxAttempts));
}

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
export function computeAchievableMax(originalTotal: number, reservations: BoundaryReservation[]): number {
  const sigma = reservations.reduce((n, r) => n + r.invocations, 0);
  return Math.max(2 * originalTotal, sigma);
}

/** ADR-004 W9: Σ worst-case wall × the declared multiplier. The multiplier is a GUESS with a name. */
export function computeWallClockCeilingMs(reservations: BoundaryReservation[]): number {
  const sigma = reservations.reduce((n, r) => n + r.wallMs, 0);
  return Math.ceil(sigma * WALLCLOCK_CEILING_MULTIPLIER);
}

// ─────────────────────────────────────────────────────────────────────────────
// Preflight
// ─────────────────────────────────────────────────────────────────────────────

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
  qeWaivers: { step: string }[];
}

export interface PreflightRefusal {
  ok: false;
  reason: WfRunReason;
  detail: string;
}

/** The per-stage timeout the run uses: the operator's override, else the measured codex xhigh
 * ceiling (the far end of the distribution — a shorter default would turn slow models into
 * `dispatch-timeout` noise). */
export function stageTimeoutMs(inputs: RunnerInputs): number {
  const o = inputs.stageTimeoutMsOverride;
  return typeof o === 'number' && Number.isFinite(o) && o > 0 ? Math.floor(o) : CODEX_EXEC_XHIGH_TIMEOUT_MS;
}

/**
 * A declared artifact path — READ or WRITE — must resolve INSIDE the run root.
 *
 * Step-8 CRITICAL-4 closed two holes at once:
 *   - only `writes` were checked, while AM-9 covers reads and writes. A read is a path the runner
 *     hands a model and asks it to open; `../../.ssh/id_rsa` is not less dangerous for being a read.
 *   - containment was decided by `realpath(fullPath)`, which is NULL for a not-yet-created leaf —
 *     the normal case for a write. A nonexistent leaf under a SYMLINKED ANCESTOR therefore passed:
 *     nothing resolved, so nothing was compared.
 *
 * The fix is the nearest-existing-ancestor walk the CLI already uses for `--out`: every EXISTING
 * component on the way down is resolved and required to stay under the real root, so a symlink
 * anywhere on the path is caught whether or not the leaf exists yet.
 *
 * (The control-character class is spelled with escapes now. It was written with literal control
 * BYTES, which made the guard invisible to `grep` and one careless editor save away from silently
 * becoming `/[ -]/`.)
 */
function escapesRoot(rel: string, root: string, deps: PreflightDeps): string | null {
  if (rel === '') return 'an empty path';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(rel)) return 'a control character';
  if (rel.startsWith('/')) return 'an absolute path';
  const segments = rel.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segments.some((seg) => seg === '..')) return 'a ".." segment';
  if (segments.length === 0) return 'an empty path';
  const base = root.replace(/\/+$/, '');
  const realRoot = deps.realpath(base) ?? base;
  const under = (candidate: string): boolean => candidate === realRoot || candidate.startsWith(realRoot + '/');
  let walked = base;
  for (const seg of segments) {
    walked = walked + '/' + seg;
    if (!deps.exists(walked)) continue; // nothing to resolve yet — deeper components cannot exist either
    const real = deps.realpath(walked);
    if (real === null) return 'a path component that cannot be resolved';
    if (!under(real)) return 'a component whose real location is outside the run root (a symlinked ancestor)';
  }
  return null;
}

/** Every dispatching step of a projection, top-level and fanout members alike. */
function allSpecs(proj: RunProjection): RunStepSpec[] {
  const out: RunStepSpec[] = [];
  for (const b of proj.boundaries) {
    if (b.stage !== undefined) out.push(b.stage);
    if (b.region !== undefined) out.push(...b.region.chain);
  }
  return out;
}

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
export function preflight(inputs: RunnerInputs, deps: PreflightDeps): PreflightOk | PreflightRefusal {
  const proj = toRunProjection(inputs.plan);

  if (!proj.traceEmit) {
    return {
      ok: false,
      reason: 'trace-emit-required',
      detail: 'the plan does not set `trace.emit: true` — a dz run with no trace plane produces nothing the reader, the invariants or the discrimination criterion can check, so it is refused rather than run blind (AM-6)',
    };
  }

  const specs = allSpecs(proj);
  const families: Record<string, BridgeFamily> = {};
  for (const s of specs) {
    const f = modelFamily(s.model) ?? inputs.defaultFamily;
    if (f === null) {
      return {
        ok: false,
        reason: 'plan-model-unroutable',
        detail: `step ${s.stepId} declares model ${JSON.stringify(s.model)}, which maps to no model family, and no --default-family was given — guessing a family here would silently decide who is allowed to review this run's code`,
      };
    }
    families[s.stepId] = f;
  }

  for (const s of specs) {
    // READS AND WRITES (AM-9). A read is a path the runner hands a model and asks it to open —
    // containment is not a property of the direction of the I/O.
    for (const [kind, list] of [['read', s.reads], ['write', s.writes]] as const) {
      for (const rel of list) {
        const why = escapesRoot(rel, inputs.cwdRoot, deps);
        if (why !== null) {
          return {
            ok: false,
            reason: 'artifact-path-escapes-root',
            detail: `step ${s.stepId} declares ${kind} ${JSON.stringify(rel)}, which is ${why} — a declared artifact path is one the runner PROBES and a model is asked to open or create; it may not leave the run root`,
          };
        }
      }
    }
  }

  const qeWaivers: { step: string }[] = [];
  for (const s of specs) {
    if (!s.qeRole) continue;
    if (families[s.stepId] !== inputs.coderFamily) continue;
    if (!inputs.allowSameFamilyQe) {
      return {
        ok: false,
        reason: 'same-family-qe-refused',
        detail: `step ${s.stepId} is marked \`x-role: qe\` and resolves to family ${families[s.stepId]}, which is the family that WROTE the code (--coder-family ${inputs.coderFamily}). Independent cross-model review catches what self-review misses; pass --allow-same-family-qe to proceed under a recorded re-QE debt`,
      };
    }
    qeWaivers.push({ step: s.stepId });
  }

  const reservations = computeBoundaryReservations(proj, () => stageTimeoutMs(inputs));
  const budgetTotal = inputs.budgetOverride ?? proj.budgetTotal;
  const wallCeilingMs = inputs.maxWallClockMsOverride ?? computeWallClockCeilingMs(reservations);

  if (inputs.budgetOverride !== null) {
    const worst = reservations.reduce<BoundaryReservation | null>((a, r) => (a === null || r.invocations > a.invocations ? r : a), null);
    if (worst !== null && worst.invocations > budgetTotal) {
      return {
        ok: false,
        reason: 'reservation-unsatisfiable',
        detail: `--budget ${budgetTotal} is below the worst-case reservation of boundary ${worst.boundaryId} (${worst.invocations} invocations over step(s) ${worst.steps.join(', ')}) — that boundary could never run, so the run would pause forever instead of finishing`,
      };
    }
  }
  if (inputs.maxWallClockMsOverride !== null) {
    const worst = reservations.reduce<BoundaryReservation | null>((a, r) => (a === null || r.wallMs > a.wallMs ? r : a), null);
    if (worst !== null && worst.wallMs > wallCeilingMs) {
      return {
        ok: false,
        reason: 'reservation-unsatisfiable',
        detail: `--max-wall-clock ${wallCeilingMs}ms is below the worst-case wall reservation of boundary ${worst.boundaryId} (${worst.wallMs}ms over step(s) ${worst.steps.join(', ')}) — that boundary could never run`,
      };
    }
  }

  const { hash: argsHash } = computeRunArgsHash(inputs, proj);
  return {
    ok: true,
    projection: proj,
    planDigest: planDigest(inputs.plan),
    execFp: computeExecFingerprint(computeExecAxisInputs(inputs.plan)),
    argsHash,
    families,
    reservations,
    budgetTotal,
    wallCeilingMs,
    achievableMax: computeAchievableMax(proj.budgetTotal, reservations),
    achievableWallMs: Math.max(2 * computeWallClockCeilingMs(reservations), reservations.reduce((n, r) => n + r.wallMs, 0)),
    qeWaivers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume
// ─────────────────────────────────────────────────────────────────────────────

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
export function runnerCheckpointHash(boundaryId: string, execFp: string, promptText: string, depResults: unknown[]): string {
  return checkpointInputHash(boundaryId, [execFp, promptText, ...depResults]);
}

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
export function decideResumeIdentity(opts: {
  runState: WfRunState | null;
  hasTrace: boolean;
  identity: { planDigest: string; execFp: string; argsHash: string };
}): { reason: WfRunReason; detail: string } | null {
  const st = opts.runState;
  if (st === null) {
    if (opts.hasTrace) {
      return {
        reason: 'foreign-run-refused',
        detail: 'the run directory holds a trace but no `wf-run-state/1` — it was written by another host (a Claude-host generated loop writes traces here too). Cross-host merge of one runId is refused, never reconciled',
      };
    }
    return { reason: 'foreign-run-refused', detail: 'no run state to resume' };
  }
  if (st.schema !== WF_RUN_STATE_SCHEMA || st.owner?.host !== WF_RUN_OWNER_HOST) {
    return {
      reason: 'foreign-run-refused',
      detail: `run state is owned by ${JSON.stringify(st.owner?.host ?? null)} under schema ${JSON.stringify(st.schema ?? null)}, not ${WF_RUN_OWNER_HOST}/${WF_RUN_STATE_SCHEMA}`,
    };
  }
  if (st.status === 'completed') {
    return { reason: 'resume-already-completed', detail: `run ${st.runId} already completed — a completed run is not resumable` };
  }
  const axes: [string, string, string][] = [
    ['planDigest', st.planDigest, opts.identity.planDigest],
    ['execFp', st.execFp, opts.identity.execFp],
    ['argsHash', st.argsHash, opts.identity.argsHash],
  ];
  for (const [name, was, now] of axes) {
    if (was !== now) {
      return {
        reason: 'stale-input-refused',
        detail: `${name} changed since the run was written (${String(was).slice(0, 16)}… → ${String(now).slice(0, 16)}…) — the checkpoints describe a different run, and there is no override for that`,
      };
    }
  }
  return null;
}

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
export function accumulateResumeArgs(
  persisted: Record<string, string> | undefined,
  supplied: Record<string, string>,
): { args: Record<string, string>; conflict: { key: string; was: string; now: string } | null } {
  const args: Record<string, string> = { ...(persisted ?? {}) };
  for (const [k, v] of Object.entries(supplied)) {
    const prior = args[k];
    if (prior !== undefined && prior !== v) return { args, conflict: { key: k, was: prior, now: v } };
    args[k] = v;
  }
  return { args, conflict: null };
}

export function decideRunResume(opts: {
  runState: WfRunState | null;
  hasTrace: boolean;
  identity: { planDigest: string; execFp: string; argsHash: string };
  checkpointsText: string | null;
  expectedHashFor: (boundaryId: string) => string;
  probeArtifact: (rel: string) => boolean;
  /** The declared writes of a boundary — its checkpoint is only resumable while they still EXIST.
   * (Step-8 BLOCKER-2: this was missing, so `probeArtifact` was never called and a checkpointed
   * file stage whose deliverable had been deleted was skipped on resume.) */
  declaredWritesFor?: (boundaryId: string) => string[];
  reprobedModels: Record<string, string | null>;
}): RunResumeDecision {
  const empty = new Set<string>();
  // the ownership/identity half — SHARED with the pre-probe phase, so the two can never disagree
  const refusal = decideResumeIdentity({ runState: opts.runState, hasTrace: opts.hasTrace, identity: opts.identity });
  if (refusal !== null) return { ok: false, reason: refusal.reason, detail: refusal.detail, cursor: empty };
  const st = opts.runState as WfRunState;

  for (const [stepId, persisted] of Object.entries(st.resolvedModels ?? {})) {
    if (!(stepId in opts.reprobedModels)) continue;
    if (opts.reprobedModels[stepId] !== persisted) {
      return {
        ok: false,
        reason: 'resume-model-unavailable',
        detail: `step ${stepId} ran on model ${persisted}, which no longer answers a probe (re-probe said ${JSON.stringify(opts.reprobedModels[stepId])}) — finishing a run on a different model would silently mix two models' work`,
        cursor: empty,
      };
    }
  }

  const parsed = parseCheckpointRead(opts.checkpointsText ?? '');
  const cursor = new Set<string>();
  for (const [boundaryId, entry] of Object.entries(parsed.entries)) {
    // ARTIFACT PROBES, not just hashes (the `STAGE_ARTIFACTS` semantics ADR-003 Confirmation-5
    // names): a checkpoint says "this stage ran", and the declared write says "and here is what it
    // produced". If the write is gone, the stage did not leave what the run depends on, so the
    // checkpoint alone must not skip it — a resume that trusts the hash and not the disk silently
    // continues without the deliverable.
    const writes = opts.declaredWritesFor?.(boundaryId) ?? [];
    const listing = new Set<string>(writes.filter((rel) => opts.probeArtifact(rel)));
    const d = decideCheckpointResume({
      mode: 'auto',
      entry,
      inputHash: opts.expectedHashFor(boundaryId),
      artifactRel: writes.length === 0 ? null : writes,
      listing,
    });
    if (d.resume) cursor.add(boundaryId);
  }
  return { ok: true, cursor };
}

/**
 * The results map a RESUME must recompute checkpoint hashes against.
 *
 * Step-8 BLOCKER-2: the hashes were recomputed with `{}`, while the PERSISTED hashes were built from
 * the live `ctx.results`. Any boundary with a dep therefore hashed differently on resume and re-ran
 * — work already paid for, done twice. The reconstruction has two sources, because the run had two:
 * checkpointed stage results, and the resume ARGS that satisfied a pause boundary (a pause is never
 * checkpointed; its "result" is the value the operator supplied).
 */
function resumeResults(pre: PreflightOk, effectiveArgs: Record<string, string>, checkpointsText: string | null): Record<string, unknown> {
  const out = checkpointResults(checkpointsText);
  for (const b of pre.projection.boundaries) {
    if (b.kind !== 'pause') continue;
    const key = b.pause?.resumeArg ?? '';
    if (key !== '' && Object.prototype.hasOwnProperty.call(effectiveArgs, key)) out[b.boundaryId] = effectiveArgs[key];
  }
  return out;
}

/** The writes a boundary DECLARES — a stage's own, or every chain step's for a region. */
function declaredWritesOf(pre: PreflightOk, boundaryId: string): string[] {
  const b = pre.projection.boundaries.find((x) => x.boundaryId === boundaryId);
  if (b === undefined) return [];
  if (b.stage !== undefined) return b.stage.deliverable === 'file' ? [...b.stage.writes] : [];
  if (b.region !== undefined) return b.region.chain.filter((c) => c.deliverable === 'file').flatMap((c) => c.writes);
  return [];
}

/** The checkpointed RESULT for a resumed boundary (so downstream steps see what it produced). */
function checkpointResults(checkpointsText: string | null): Record<string, unknown> {
  const parsed = parseCheckpointRead(checkpointsText ?? '');
  const out: Record<string, unknown> = {};
  for (const [stage, entry] of Object.entries(parsed.entries)) out[stage] = entry.result;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared readers / envelopes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Torn-tail-tolerant JSONL reader (ADR-004 Confirmation-4b). A malformed LAST line is the signature
 * of a process that died mid-append — it is skipped with a NAMED warning. A malformed INTERIOR line
 * is not: something rewrote history, and silently continuing would hide it.
 */
export function readJsonlTolerant(text: string): { rows: unknown[]; tornTail: boolean; warnings: string[] } {
  const lines = String(text ?? '').split('\n');
  // trailing empties are the normal shape of an append-per-line file, not a torn tail
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  const rows: unknown[] = [];
  const warnings: string[] = [];
  let tornTail = false;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (t === '') continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      if (i === lines.length - 1) {
        tornTail = true;
        warnings.push(`torn tail: the LAST line is unparseable (${t.length} chars) — skipped as an interrupted append; every earlier row was read`);
      } else {
        warnings.push(`unparseable INTERIOR line ${i + 1} — NOT skipped silently: an interior tear means the file was rewritten, not merely interrupted`);
      }
    }
  }
  return { rows, tornTail, warnings };
}

/** The machine-readable pause envelope (AM-16): a wrapper distinguishes pause from failure using
 * ONLY stdout + the exit code, never prose. */
export function buildPauseEnvelope(
  runId: string,
  pauseState: string,
  reason: WfRunReason,
  planPath: string,
  resumeArg: string | null,
  where?: { runStatePath?: string | undefined; runDirArg?: string | null | undefined },
): WfPauseEnvelope {
  // Step-8 HIGH-7: both of these were hard-coded to the DEFAULT run home, so a run under
  // `--run-dir features/<slug>` was handed a state path that does not exist and a resume command
  // that would start a different run. An envelope whose own pointer is wrong is worse than none —
  // it is a machine-readable wrong answer.
  //
  // re-QE R3-B: every INTERPOLATED value is shell-quoted with `traceShellQuote` (the repo's existing
  // single-quote-escape helper, shared with the trace flush), so a run dir / plan path / runId /
  // arg key containing a space or a metachar is safe for an operator to PASTE. A resume command that
  // word-splits or injects when pasted is a command the pause envelope should never emit.
  const q = traceShellQuote;
  const runDirFlag = where?.runDirArg === undefined || where.runDirArg === null || where.runDirArg === '' ? '' : ` --run-dir ${q(where.runDirArg)}`;
  const resumeCmd =
    `dz workflow run ${q(planPath)} --resume ${q(runId)}${runDirFlag}`
    + (resumeArg === null || resumeArg === '' ? '' : ` --arg ${q(resumeArg + '=<value>')}`);
  return {
    schema: WF_PAUSE_ENVELOPE_SCHEMA,
    runId,
    exitCode: 75,
    pauseState,
    reason,
    runStatePath: where?.runStatePath ?? `.dz/loop-trace/${runId}/run-state.json`,
    resumeCmd,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The effects seams
// ─────────────────────────────────────────────────────────────────────────────

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
  measureTrace(): { sha256: string; lines: number } | null;
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

export type RunOutcome =
  | { kind: 'completed'; exitCode: 0; result: WfRunResult }
  | { kind: 'failed'; exitCode: 1; reason: WfRunReason; detail: string; result: WfRunResult }
  | { kind: 'paused'; exitCode: 75; envelope: WfPauseEnvelope };

/** The item-key domain is the SHARED one (`TRACE_KEY_RE`): a registry value that the trace plane
 * would refuse must never reach a dispatch, or a trace-on run refuses what a trace-off run completes. */
function safeItemKey(k: string): boolean {
  return TRACE_KEY_RE.test(k);
}

/** Map a dispatch outcome onto the CLOSED failure enum, through the SAME classifier the rendered
 * script uses. A timeout is the one case the adapter knows better than any message heuristic. */
function failureClassOf(res: DispatchResult): FailureClass | null {
  if (res.failure?.reason === 'dispatch-timeout') return 'timeout';
  if (res.outcome === 'null') return classifyFailure('null', []);
  return classifyFailure('error', errSnap(new Error(res.failure?.detail ?? res.text ?? '')));
}

interface RunCtx {
  inputs: RunnerInputs;
  pre: PreflightOk;
  deps: SchedulerDeps;
  trace: TraceState;
  state: WfRunState;
  results: Record<string, unknown>;
  settleSeq: Record<string, number>;
  invocationN: number;
  dispatchCount: number;
  agentCalls: number;
  /** The reservation currently being spent inside, for the per-spawn invariant guard. */
  activeReservation: { boundaryId: string; remaining: number } | null;
}

class BudgetInvariantError extends Error {
  constructor(readonly boundaryId: string, readonly detail: string) {
    super(detail);
    this.name = 'BudgetInvariantError';
  }
}

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
export async function runWorkflow(inputs: RunnerInputs, pre: PreflightOk, deps: SchedulerDeps): Promise<RunOutcome> {
  const store = deps.store;
  const startedAt = deps.now();

  // ── PROBE FIRST (Step-8 BLOCKER-1) ──
  //
  // The probe has to happen BEFORE the resume decision, not after it. Probing afterwards meant
  // `decideRunResume` was handed an empty `reprobedModels`, skipped every persisted step, and
  // `resume-model-unavailable` could not be produced by the real runner at all — a resumed run
  // silently switched model ids and finished green. A probe answer is the ONLY thing that makes the
  // persisted id checkable, so it is the first thing the runner establishes.
  //
  // A null answer is NOT decided here: on a resume it means `resume-model-unavailable` (the id this
  // run committed to is gone), on a fresh run it means `probe-failed`. Deciding it after the resume
  // check keeps each refusal the precise one.
  // ── PHASE 0: ownership + identity, BEFORE anything is spent (re-QE NEW-B1) ──
  //
  // A refused run must write ZERO budget rows. The probe below is real work with a real record, so
  // everything decidable without it is decided first.
  const priorStateEarly = inputs.resume !== null ? store.readRunState() : null;
  if (inputs.resume !== null) {
    const refusal = decideResumeIdentity({
      runState: priorStateEarly,
      hasTrace: store.hasTrace(),
      identity: { planDigest: pre.planDigest, execFp: pre.execFp, argsHash: pre.argsHash },
    });
    if (refusal !== null) return failOutcome(inputs.runId, refusal.reason, refusal.detail, null);
  }

  // The pause chain's args, accumulated across every leg (re-QE NEW-B2).
  const accumulated = accumulateResumeArgs(priorStateEarly?.resumeArgs, inputs.resumeArgs);
  if (accumulated.conflict !== null) {
    const c = accumulated.conflict;
    return failOutcome(
      inputs.runId,
      'stale-input-refused',
      `--arg ${c.key} was already supplied as ${JSON.stringify(c.was)} on an earlier leg and is now ${JSON.stringify(c.now)} — the pause it satisfied has already run, and its result is in the checkpoints and the trace. Re-deciding it now would make this run's history disagree with itself`,
      null,
    );
  }
  const effectiveArgs = accumulated.args;

  const usedFamilies = [...new Set(Object.values(pre.families))];
  const probedIds: Partial<Record<BridgeFamily, string | null>> = {};
  let probeAgentCalls = 0;
  const probeDetail: Partial<Record<BridgeFamily, string>> = {};
  for (const family of usedFamilies) {
    const candidates = [...new Set(allSpecs(pre.projection).filter((s) => pre.families[s.stepId] === family).map((s) => s.model).filter((m): m is string => typeof m === 'string'))];
    const probe = await deps.dispatchers[family].probe(candidates);
    probeAgentCalls++;
    store.appendBudgetRow({
      schema: WF_BUDGET_ROW_SCHEMA,
      kind: 'probe',
      runId: inputs.runId,
      dispatchSeq: null,
      stepId: null,
      itemKey: null,
      attempt: null,
      family,
      model: probe.id,
      wallMs: probe.wallMs,
      tokensIn: null,
      tokensOut: null,
      tokensSource: null,
      outcome: null,
      timeoutMs: null,
    });
    probedIds[family] = probe.id;
    probeDetail[family] = `candidates: ${candidates.join(', ') || 'defaults'} — ${probe.detail}`;
  }
  /** stepId → the id that answers NOW (null when nothing did). */
  const reprobedModels: Record<string, string | null> = {};
  for (const spec of allSpecs(pre.projection)) {
    reprobedModels[spec.stepId] = probedIds[pre.families[spec.stepId] as BridgeFamily] ?? null;
  }

  // ── resume decision (authority: checkpoints + artifact probes; NEVER completedSteps) ──
  let cursor = new Set<string>();
  const priorState: WfRunState | null = priorStateEarly;
  if (inputs.resume !== null) {
    const checkpointsText = store.readCheckpointsText();
    const priorResults = resumeResults(pre, effectiveArgs, checkpointsText);
    const decision = decideRunResume({
      runState: priorState,
      hasTrace: store.hasTrace(),
      identity: { planDigest: pre.planDigest, execFp: pre.execFp, argsHash: pre.argsHash },
      checkpointsText,
      // the SAME inputs the persisted hashes were built from — see `resumeResults`
      expectedHashFor: (id) => expectedHashFor(pre, id, priorResults),
      probeArtifact: (rel) => store.probeArtifact(rel),
      declaredWritesFor: (id) => declaredWritesOf(pre, id),
      reprobedModels,
    });
    if (!decision.ok) {
      const reason = decision.reason ?? 'foreign-run-refused';
      return failOutcome(inputs.runId, reason, decision.detail ?? '', null);
    }
    cursor = decision.cursor;
  }

  // a family with NO answering model cannot run anything — decided after the resume check so a
  // resumed run reports the precise `resume-model-unavailable` instead of a generic probe failure
  for (const family of usedFamilies) {
    if (probedIds[family] == null) {
      return failOutcome(inputs.runId, 'probe-failed', `no ${family} model answered a probe (${probeDetail[family] ?? ''})`, null);
    }
  }

  const state: WfRunState = {
    schema: WF_RUN_STATE_SCHEMA,
    owner: {
      host: WF_RUN_OWNER_HOST,
      runnerVersion: inputs.runnerVersion,
      // the CURRENT holder of the claim, not the previous leg's (a resumed run is owned by the
      // process running it) — and never the placeholder 0
      pid: deps.ownerPid ?? priorState?.owner.pid ?? 0,
      startedMarker: deps.ownerStartedMarker ?? priorState?.owner.startedMarker ?? startedAt,
    },
    status: 'running',
    runId: inputs.runId,
    planDigest: pre.planDigest,
    execFp: pre.execFp,
    argsHash: pre.argsHash,
    completedSteps: [...cursor],
    resolvedModels: { ...(priorState?.resolvedModels ?? {}) },
    // CUMULATIVE (Step-8 HIGH-5): each leg adds its delta to the total the PREVIOUS leg reached,
    // never to the plan default. Resetting to `default + this leg's extra` while keeping the old
    // extension rows made the ledger and the ceiling disagree — two resumes of +1 each left a
    // total of default+1 with two rows claiming otherwise, so extensions were laundered away (and,
    // with a bigger first extra, could be re-granted for free).
    budget: {
      total: (priorState?.budget.total ?? pre.budgetTotal) + (inputs.budgetExtra ?? 0),
      spent: priorState?.budget.spent ?? 0,
      extensions: [...(priorState?.budget.extensions ?? [])],
    },
    wallClock: {
      ceilingMs: (priorState?.wallClock.ceilingMs ?? pre.wallCeilingMs) + (inputs.wallClockExtraMs ?? 0),
      spentMs: priorState?.wallClock.spentMs ?? 0,
      extensions: [...(priorState?.wallClock.extensions ?? [])],
    },
    waivers: pre.qeWaivers.map((w) => ({ kind: 'same-family-qe' as const, step: w.step, recordedDebt: `.fa-state/reqe-due.json` })),
    resumeArgs: effectiveArgs,
    coderFamily: inputs.coderFamily,
    startedAt: priorState?.startedAt ?? startedAt,
    updatedAt: startedAt,
    ...(deps.dispatcherOverride === true ? { dispatcherOverride: true } : {}),
  };

  // ── extension caps (AM-13/AM-14): recorded, and refused beyond the achievable maximum ──
  if (inputs.budgetExtra !== null && inputs.budgetExtra > 0) {
    const newTotal = state.budget.total;
    if (newTotal > pre.achievableMax) {
      return failOutcome(
        inputs.runId,
        'budget-extension-exhausted',
        `--budget-extra ${inputs.budgetExtra} takes the total to ${newTotal}, past the achievable maximum ${pre.achievableMax} (= max(2 × ${pre.projection.budgetTotal}, Σ reservations ${pre.reservations.reduce((n, r) => n + r.invocations, 0)})) — the cap is finite and plan-derived on purpose`,
        null,
      );
    }
    state.budget.extensions.push({ ts: startedAt, extra: inputs.budgetExtra, newTotal });
  }
  if (inputs.wallClockExtraMs !== null && inputs.wallClockExtraMs > 0) {
    const newCeilingMs = state.wallClock.ceilingMs;
    // AM-14's reservation-derived form, not `2 × whatever this invocation's ceiling happens to be`
    // (Step-8 HIGH-5): the cap must be a property of the PLAN, or `--max-wall-clock` would inflate
    // its own cap and `--wall-clock-extra` could then walk it anywhere.
    const wallCap = pre.achievableWallMs;
    if (newCeilingMs > wallCap) {
      return failOutcome(
        inputs.runId,
        'wall-extension-exhausted',
        `--wall-clock-extra ${inputs.wallClockExtraMs}ms takes the ceiling to ${newCeilingMs}ms, past the cap ${wallCap}ms`,
        null,
      );
    }
    state.wallClock.extensions.push({ ts: startedAt, extraMs: inputs.wallClockExtraMs, newCeilingMs });
  }

  const opened = openTrace(inputs, pre, store, inputs.resume !== null);
  const ctx: RunCtx = {
    inputs,
    pre,
    deps,
    trace: opened.trace,
    state,
    results: resumeResults(pre, effectiveArgs, store.readCheckpointsText()),
    settleSeq: opened.settleSeq,
    invocationN: 0,
    dispatchCount: 0,
    agentCalls: probeAgentCalls,
    activeReservation: null,
  };

  // a waived same-family QE step owes a machine debt, not a doc instruction (the FR-2.9 precedent)
  for (const w of pre.qeWaivers) {
    // The FR-2.9 `reqe-due-1` shape VERBATIM (`reqe.ts` parseReqeDebt), because the debt is only
    // real if `dz reqe` can read it — a record in a shape the reader rejects is a promise, not a
    // debt. `qeFamily` equals `coderFamily` here: that identity IS the waiver.
    store.writeReqeDebt({
      schema: 'reqe-due-1',
      slug: deps.slug ?? inputs.runId,
      coderFamily: inputs.coderFamily,
      qeFamily: inputs.coderFamily,
      qeGrade: null,
      reason: `dz workflow run ${inputs.runId}: step ${w.step} (x-role: qe) resolved to the CODER family ${inputs.coderFamily} and ran under --allow-same-family-qe — the cross-family guard was consciously suspended, so an independent review is OWED`,
      emittedAt: startedAt,
      runStamp: `${inputs.runId}:${pre.execFp.slice(0, 16)}`,
    });
  }

  // the PROBED ids (established above, before the resume decision) become this run's resolution
  for (const s of allSpecs(pre.projection)) {
    const id = probedIds[pre.families[s.stepId] as BridgeFamily];
    if (id != null) state.resolvedModels[s.stepId] = id;
  }

  // ── the boundary walk ──
  const reservationOf = new Map(pre.reservations.map((r) => [r.boundaryId, r]));
  try {
    for (const b of pre.projection.boundaries) {
      if (cursor.has(b.boundaryId)) continue; // resumed — its result already lives in ctx.results

      const res = reservationOf.get(b.boundaryId) ?? null;
      const remainingBudget = state.budget.total - state.budget.spent;
      const remainingWall = state.wallClock.ceilingMs - state.wallClock.spentMs;

      if (res !== null && res.invocations > remainingBudget) {
        return pauseOutcome(ctx, b, 'AWAITING_BUDGET', 'budget-exhausted',
          `boundary ${b.boundaryId} reserves ${res.invocations} invocation(s) over step(s) ${res.steps.join(', ')}, and only ${remainingBudget} of ${state.budget.total} remain — pausing BEFORE the boundary so it is never interrupted mid-region (AM-4)`);
      }
      if (res !== null && res.wallMs > remainingWall) {
        return pauseOutcome(ctx, b, 'AWAITING_WALL_CLOCK', 'budget-exhausted',
          `boundary ${b.boundaryId} reserves ${res.wallMs}ms of wall clock and only ${remainingWall}ms of ${state.wallClock.ceilingMs}ms remain — pausing BEFORE the boundary`);
      }

      if (b.kind === 'pause') {
        const key = b.pause?.resumeArg ?? '';
        // satisfied by ANY leg, not just this one (re-QE NEW-B2)
        const supplied = key !== '' && Object.prototype.hasOwnProperty.call(effectiveArgs, key);
        if (!supplied) {
          return pauseOutcome(ctx, b, b.pause?.state ?? 'AWAITING_INPUT', 'plan-pause',
            `the plan declares pause state ${JSON.stringify(b.pause?.state ?? '')} here; re-invoke with --arg ${key}=<value> to continue`);
        }
        ctx.results[b.boundaryId] = effectiveArgs[key];
        continue;
      }

      ctx.activeReservation = res === null ? null : { boundaryId: b.boundaryId, remaining: deps.corruptReservations === true ? 0 : res.invocations };

      if (b.kind === 'region') {
        await runRegion(ctx, b);
        ctx.activeReservation = null;
        continue;
      }

      const terminal = await runStage(ctx, b);
      ctx.activeReservation = null;
      if (terminal !== null) {
        // A gate `terminal:` route ends the run BY PLAN DESIGN. Parity with the rendered script:
        // the top-level terminal return skips the epilogue, so `run.closed` is NOT written and the
        // trace parses as incomplete. See the FLAG in the change manifest: `RunOutcome` has no
        // terminal member, so this reports as `completed` with the route named in the ledger row.
        return terminalOutcome(ctx, terminal, startedAt);
      }
    }
  } catch (e) {
    if (e instanceof BudgetInvariantError) {
      return failOutcome(inputs.runId, 'budget-invariant-violated', e.detail, ctx);
    }
    if (e instanceof RunFailure) {
      return failOutcome(inputs.runId, e.reason, e.detail, ctx);
    }
    throw e;
  }

  // ── completed epilogue: the ONLY path that closes the trace ──
  traceClose(ctx.trace);
  flush(ctx);
  ctx.state.status = 'completed';
  ctx.state.completedSteps = pre.projection.boundaries.map((b) => b.boundaryId);
  ctx.state.updatedAt = deps.now();
  stampTraceBinding(ctx.state, store);
  deps.lock(() => store.writeRunState(ctx.state));
  appendLedger(ctx, 'completed');
  return {
    kind: 'completed',
    exitCode: 0,
    result: {
      schema: WF_RUN_RESULT_SCHEMA,
      runId: inputs.runId,
      status: 'completed',
      exitCode: 0,
      ...(deps.dispatcherOverride === true ? { dispatcherOverride: true } : {}),
    },
  };
}

/**
 * Open the run's trace state. A FRESH run buffers its own `run.opened` frame; a RESUMED leg picks
 * the seq counter up where the previous leg left it and emits NO second `run.opened` — one run has
 * ONE opened frame and ONE monotonically allocated seq space, whatever the process boundaries.
 * The dispatched/settled counters are recovered too, so the `run.closed` counts describe the whole
 * run rather than its last leg.
 */
function openTrace(inputs: RunnerInputs, pre: PreflightOk, store: RunStore, resuming: boolean): { trace: TraceState; settleSeq: Record<string, number> } {
  // 'dz-process': this runner IS the dz process, and it appends trace.jsonl itself. The value is a
  // fact about which code path is running, not a claim about trustworthiness — see ADR-001.
  const st = traceInit(inputs.runId, pre.planDigest, pre.execFp, 'dz-process');
  if (!resuming) return { trace: st, settleSeq: {} };
  const priorText = store.readTraceText();
  if (priorText === null || priorText.trim() === '') return { trace: st, settleSeq: {} };
  const prior = parseTrace(priorText);
  const maxSeq = prior.events.reduce((m, e) => Math.max(m, e.seq), 0);
  if (maxSeq <= 0) return { trace: st, settleSeq: {} };
  st.buffer.length = 0;
  st.seq = maxSeq;
  st.dispatched = prior.events.filter((e) => e.event === 'dispatched').length;
  st.settled = prior.events.filter((e) => e.event === 'settled').length;
  // Recover the previous leg's settle seqs so a resumed step's `causedBy` still points at the
  // upstream settle that actually happened. Without this a resumed leg emits `causedBy: []` for
  // every dep it did not re-run — technically honest, but it drops the causal edge a reader draws.
  const stepOf = new Map<string, { stepId: string; itemKey: string | null }>();
  for (const e of prior.events) {
    if (e.event === 'dispatched') stepOf.set(e.invocationId, { stepId: e.stepId, itemKey: e.itemKey });
  }
  const settleSeq: Record<string, number> = {};
  for (const e of prior.events) {
    if (e.event !== 'settled') continue;
    const who = stepOf.get(e.invocationId);
    if (who !== undefined) settleSeq[settleKey(who.stepId, who.itemKey)] = e.seq;
  }
  return { trace: st, settleSeq };
}

/** A named, non-retryable runtime refusal raised from deep inside the walk. */
class RunFailure extends Error {
  constructor(readonly reason: WfRunReason, readonly detail: string) {
    super(detail);
    this.name = 'RunFailure';
  }
}

function expectedHashFor(pre: PreflightOk, boundaryId: string, results: Record<string, unknown>): string {
  const b = pre.projection.boundaries.find((x) => x.boundaryId === boundaryId);
  const spec = b?.stage ?? null;
  const prompt = spec === null ? '' : assemblePrompt(spec, null, null);
  const deps = (b?.deps ?? []).map((d) => results[d] ?? null);
  return runnerCheckpointHash(boundaryId, pre.execFp, prompt, deps);
}

/**
 * THE prompt assembly, both enactors' version: the USER prompt seed, then the SHARED contract lines
 * (`stepContractLines` — the same function `loop-render` splices), then the per-item binding, then
 * the upstream value.
 *
 * The upstream value is spliced through `defangGateEchoes` (ADR-002 Confirmation-3). This is the
 * INGRESS half of the gate defence and it is separate from the LAST-anchored parser for a reason:
 * the parser stops one reply from smuggling a verdict past its own terminal line, while this stops
 * an upstream gate's LEGITIMATE verdict from becoming a downstream step's terminal line the moment
 * that step quotes its input back. "Summarize the previous review" would otherwise be a working
 * exploit against a plan that did nothing wrong. Neutralization, not deletion — the downstream
 * model still reads every upstream word.
 */
function assemblePrompt(spec: RunStepSpec, itemKey: string | null, upstream: unknown): string {
  const parts: string[] = [spec.prompt ?? `TODO: prompt for step ${spec.stepId} (phase ${spec.phase})`]; // no-stubs: the SAME default prompt sentinel the render emits (loop-render.ts:186) — an authoring cue both enactors must show identically, not unfinished code
  parts.push(...stepContractLines({
    reads: spec.reads,
    writes: spec.writes,
    deliverable: spec.deliverable,
    tools: spec.tools,
    gate: spec.gate === null ? null : { kind: spec.gate.kind },
  }));
  if (itemKey !== null) parts.push('this branch handles registry item: ' + itemKey);
  if (upstream !== null && upstream !== undefined) {
    // a STRING travels as text (that is what the model produced and what it must read back); any
    // other shape is serialized. Both go through the defang — a JSON string can carry a newline too.
    const raw = typeof upstream === 'string' ? upstream : JSON.stringify(upstream);
    parts.push('upstream value: ' + defangGateEchoes(raw));
  }
  return parts.join('\n');
}

function flush(ctx: RunCtx): void {
  const lines = traceDrain(ctx.trace);
  if (lines.length > 0) ctx.deps.store.appendTraceLines(lines);
}

function spendBudget(ctx: RunCtx, stepId: string): void {
  if (ctx.activeReservation !== null) {
    if (ctx.activeReservation.remaining <= 0) {
      throw new BudgetInvariantError(
        ctx.activeReservation.boundaryId,
        `boundary ${ctx.activeReservation.boundaryId} tried to dispatch ${stepId} beyond its own reservation — the reservation arithmetic is WRONG. This is a FAILURE, never a pause: a pause promises the remaining work fits after an extension, and a broken invariant promises nothing`,
      );
    }
    ctx.activeReservation.remaining--;
  }
  ctx.state.budget.spent++;
  ctx.agentCalls++;
}

/** Dispatch ONE invocation with the closed-class immediate retry policy. Returns the settled result. */
async function dispatchOnce(
  ctx: RunCtx,
  spec: RunStepSpec,
  itemKey: string | null,
  upstream: unknown,
  causedBy: number[],
): Promise<{ ok: boolean; value: unknown; res: DispatchResult | null; reason: WfRunReason | null; detail: string }> {
  const family = ctx.pre.families[spec.stepId] as BridgeFamily;
  const dispatcher = ctx.deps.dispatchers[family];
  const model = ctx.state.resolvedModels[spec.stepId] ?? null;
  const timeoutMs = stageTimeoutMs(ctx.inputs);
  const prompt = assemblePrompt(spec, itemKey, upstream);

  let lastRes: DispatchResult | null = null;
  for (let attempt = 1; attempt <= spec.retryMaxAttempts; attempt++) {
    // CONTAINMENT re-check FIRST — before ANY invocation accounting (R4: refuse before you
    // account, the NEW-B1 discipline). Round-3 R3-A put this after spendBudget + traceOnDispatch,
    // so a refused step still burned a budget unit and emitted a phantom `dispatched` event with no
    // settle. Preflight validated these paths against a tree the models this run has since written
    // to; a symlink planted since is caught HERE, for READS and writes alike, before the adapter is
    // handed the target cwd and before the run charges itself for a dispatch that never happens.
    for (const [kind, rel] of [...spec.reads.map((r) => ['read', r] as const), ...spec.writes.map((w) => ['write', w] as const)]) {
      if (!ctx.deps.store.pathContainmentOk(rel)) {
        return {
          ok: false,
          value: null,
          res: null,
          reason: 'artifact-path-escapes-root',
          detail: `step ${spec.stepId} declared ${kind} ${JSON.stringify(rel)} no longer resolves inside the run root at dispatch time — a symlink was planted after preflight, and a declared artifact path may not leave the root whichever direction the I/O goes`,
        };
      }
    }
    spendBudget(ctx, spec.stepId);
    const invocationId = spec.stepId + (itemKey === null ? '' : ':' + itemKey) + '#' + String(++ctx.invocationN);
    const dispatchSeq = traceOnDispatch(ctx.trace, {
      invocationId,
      stepId: spec.stepId,
      itemKey,
      attempt,
      phase: spec.phase,
      model,
      causedBy: causedBy.filter((n) => typeof n === 'number' && n > 0),
    });
    ctx.dispatchCount++;

    const baseline = spec.deliverable === 'file' && spec.writes.length > 0 ? ctx.deps.store.snapshotWrites(spec.writes) : null;
    const t0 = ctx.deps.monotonicMs();
    const res = await dispatcher.dispatch({
      stepId: spec.stepId,
      itemKey,
      attempt,
      prompt,
      family,
      resolvedModelId: model ?? '',
      deliverable: spec.deliverable,
      expectedReads: spec.reads,
      expectedWrites: spec.writes,
      timeoutMs,
      cwd: ctx.inputs.cwdRoot,
    });
    const wallMs = res.wallMs > 0 ? res.wallMs : Math.max(0, ctx.deps.monotonicMs() - t0);
    ctx.state.wallClock.spentMs += wallMs;
    lastRes = res;

    // LANDED BARRIER (scheduler-owned, dispatcher-independent): a settled dispatch is not a
    // delivered file. Declared writes must EXIST and be NEWLY CHANGED against the pre-dispatch
    // snapshot — an untouched leftover from a previous run is not this step's deliverable.
    let outcome = res.outcome;
    let landedFailure: string | null = null;
    if (outcome === 'ok' && baseline !== null && ctx.deps.disableLandedBarrier !== true) {
      const notLanded: string[] = [];
      for (const rel of spec.writes) {
        if (!ctx.deps.store.probeArtifact(rel)) {
          notLanded.push(`${rel} (absent)`);
          continue;
        }
        const after = ctx.deps.store.snapshotWrites([rel])[rel] ?? null;
        if (after !== null && after === baseline[rel]) notLanded.push(`${rel} (unchanged since before the dispatch)`);
      }
      if (notLanded.length > 0) {
        outcome = 'error';
        landedFailure = `step ${spec.stepId} settled ok but its declared write(s) did not land: ${notLanded.join(', ')}`;
      }
    }

    const settleSeq = traceOnSettle(ctx.trace, { invocationId, outcome });
    ctx.settleSeq[settleKey(spec.stepId, itemKey)] = settleSeq;
    ctx.deps.store.appendBudgetRow({
      schema: WF_BUDGET_ROW_SCHEMA,
      kind: 'stage',
      runId: ctx.inputs.runId,
      dispatchSeq,
      stepId: spec.stepId,
      itemKey,
      attempt,
      family,
      model: res.modelUsed ?? model,
      wallMs,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      tokensSource: res.tokensSource,
      outcome,
      timeoutMs,
    });
    flush(ctx);

    if (outcome === 'ok') return { ok: true, value: res.text, res, reason: null, detail: '' };
    if (landedFailure !== null) {
      return { ok: false, value: null, res, reason: 'deliverable-not-landed', detail: landedFailure };
    }

    const cls = failureClassOf(res);
    const retryable = attempt < spec.retryMaxAttempts && cls !== null && spec.retryOn.includes(cls);
    if (!retryable) {
      return {
        ok: false,
        value: null,
        res,
        reason: res.failure?.reason ?? 'dispatch-dead',
        detail: res.failure?.detail ?? `step ${spec.stepId} settled ${outcome} (class ${String(cls)}) and this step's retryOn does not cover it`,
      };
    }
  }
  return { ok: false, value: null, res: lastRes, reason: lastRes?.failure?.reason ?? 'dispatch-dead', detail: 'retries exhausted' };
}

function settleKey(stepId: string, itemKey: string | null): string {
  return stepId + ' ' + (itemKey ?? '');
}

function causedByOf(ctx: RunCtx, deps: string[]): number[] {
  return deps.map((d) => ctx.settleSeq[settleKey(d, null)] ?? -1).filter((n) => n > 0);
}

/** A top-level agent/gate boundary. Returns a terminal-route label, or null to continue. */
async function runStage(ctx: RunCtx, b: RunBoundary): Promise<string | null> {
  const spec = b.stage;
  if (spec === undefined) return null;
  const upstream = b.deps.length === 1 ? ctx.results[b.deps[0] as string] ?? null : null;
  const causedBy = causedByOf(ctx, b.deps);

  let redosLeft = spec.gate?.maxRedos ?? 0;
  for (;;) {
    const r = await dispatchOnce(ctx, spec, null, upstream, causedBy);
    if (!r.ok) throw new RunFailure(r.reason ?? 'dispatch-dead', r.detail);

    if (spec.kind !== 'gate' || spec.gate === null) {
      ctx.results[b.boundaryId] = r.value;
      checkpoint(ctx, b, r.value);
      return null;
    }

    // GATE — the verdict is PARSED by the shared grammar and never synthesized.
    const verdict = gateVerdict(r.value);
    if (verdict === 'pass') {
      ctx.results[b.boundaryId] = r.value;
      checkpoint(ctx, b, r.value);
      return null;
    }
    const route = spec.gate.failRoute;
    if (route !== null && route.startsWith('terminal:')) return route;
    if (redosLeft <= 0) {
      // Parity with the rendered script (`loop-render.ts` gate routing): a non-pass verdict with
      // its declared routing exhausted is a LOUD run failure — never a silent pass, never a retry.
      // TWO members, because there are two different facts to report (AM-19).
      throw verdict === 'invalid'
        ? new RunFailure(
            'gate-verdict-unparseable',
            `gate ${spec.stepId} produced no single anchored terminal "GATE: PASS|FAIL" line — an unparseable verdict is a loud failure, never a synthesized pass, and no redos remain`,
          )
        : new RunFailure(
            'gate-failed',
            `gate ${spec.stepId} returned a PARSED "GATE: FAIL" verdict with no redos left and no terminal route declared (failRoute ${JSON.stringify(route)}) — the grammar was satisfied and the model answered clearly; the run fails because the plan declares nowhere for a failing gate to go`,
          );
    }
    redosLeft--;
    if (route !== null) {
      const routeBoundary = ctx.pre.projection.boundaries.find((x) => x.boundaryId === route);
      const routeSpec = routeBoundary?.stage;
      if (routeSpec !== undefined) {
        const rr = await dispatchOnce(ctx, routeSpec, null, ctx.results[route] ?? null, causedByOf(ctx, routeBoundary?.deps ?? []));
        if (!rr.ok) throw new RunFailure(rr.reason ?? 'dispatch-dead', rr.detail);
        ctx.results[route] = rr.value;
      }
    }
  }
}

/** A parallel region: every registry member activated, at most `maxFanout` in flight, joined by the
 * SHARED `joinRegion` decision. */
async function runRegion(ctx: RunCtx, b: RunBoundary): Promise<void> {
  const r = b.region;
  if (r === undefined) return;
  const members = activatedMembers(r.registry, r.dedup, r.maxFanout, r.overflow);
  if (r.overflow === 'truncate') {
    traceOnFanoutTruncated(ctx.trace, {
      stage: r.fanout,
      registrySize: r.registry.length,
      dispatched: members.length,
      reason: r.truncateReason ?? '',
    });
    flush(ctx);
  }
  for (const k of members) {
    if (!safeItemKey(k)) {
      throw new RunFailure(
        'plan-invalid',
        `fanout ${r.fanout} registry item ${JSON.stringify(k)} is outside the shared ItemKey domain ${String(TRACE_KEY_RE)} — the trace plane would refuse the event, so a trace-on run must refuse the dispatch rather than complete where a trace-off run would`,
      );
    }
  }
  const causedBy = causedByOf(ctx, b.deps);
  const bound = r.maxFanout > 0 ? r.maxFanout : 1;
  const results: unknown[] = new Array(members.length).fill(null);
  /** The FIRST branch failure, kept so a join refusal reports what actually killed the region
   * rather than inventing a reason of its own. */
  const branchFailures: { reason: WfRunReason; detail: string }[] = [];

  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= members.length) return;
      const item = members[i] as string;
      let value: unknown = ctx.results[b.boundaryId] ?? null;
      let failed = false;
      for (const spec of r.chain) {
        const rr = await dispatchOnce(ctx, spec, item, value, causedBy);
        if (!rr.ok) {
          // a failing branch is a NULL branch — the JOIN decides what that means, not the loop
          failed = true;
          branchFailures.push({ reason: rr.reason ?? 'dispatch-dead', detail: rr.detail });
          break;
        }
        value = rr.value;
      }
      results[i] = failed ? null : value;
    }
  };
  await Promise.all(Array.from({ length: Math.min(bound, Math.max(members.length, 1)) }, () => worker()));

  // `joinRegion` THROWS a named message when the policy is not met — parity with the rendered
  // script, which routes that throw through its single terminal exit. Here it becomes a typed run
  // failure carrying the FIRST branch's reason: the join did not invent the failure, it refused to
  // paper over one.
  let join: JoinOutcome;
  try {
    join = joinRegion(results, { policy: r.joinPolicy, onInvalid: r.onInvalid, region: r.fanout });
  } catch (e) {
    const failure = branchFailures[0];
    throw new RunFailure(
      failure?.reason ?? 'dispatch-dead',
      `${e instanceof Error ? e.message : String(e)} (onInvalid: ${r.onInvalid})` + (failure === undefined ? '' : ` — first failing branch: ${failure.detail}`),
    );
  }
  ctx.results[b.boundaryId] = join.values;
  if (r.join !== '') ctx.results[r.join] = join.values;
  checkpoint(ctx, b, join.values);
}

/** K6: the runner checkpoints EVERY top-level agent/gate/region boundary UNCONDITIONALLY — its
 * resume cursor is built from these lines, so making them optional would make resume optional.
 * `plan.checkpointing` stays what it always was: the CLAUDE-host opt-in. */
function checkpoint(ctx: RunCtx, b: RunBoundary, value: unknown): void {
  const line = serializeCheckpoint(b.boundaryId, expectedHashFor(ctx.pre, b.boundaryId, ctx.results), value);
  if (line !== null) ctx.deps.store.appendCheckpointLine(line);
}

/**
 * THE ONE PLACE the content binding is refreshed. A helper rather than three inline copies, because
 * three call sites mean three chances to forget — and a forgotten one degrades silently to
 * `unknown` (fail-closed, but a real dz run would then read as un-attested).
 * Called AFTER the final trace flush, so it describes the bytes a reader will actually see.
 */
function stampTraceBinding(state: WfRunState, store: RunStore): void {
  const m = store.measureTrace();
  if (m === null) return; // no trace ⇒ no binding to make; the reader will say `unknown`
  state.traceSha256 = m.sha256;
  state.traceLines = m.lines;
}

function appendLedger(ctx: RunCtx, outcome: string): void {
  const line = traceLedgerLine({
    slug: ctx.deps.slug ?? ctx.inputs.runId,
    runId: ctx.inputs.runId,
    planDigest: ctx.pre.planDigest,
    agents: ctx.agentCalls,
    outcome,
    date: null,
  });
  if (line !== null) ctx.deps.store.appendLedgerLine(line);
}

/** PAUSE — flush WITHOUT `run.closed` (parity with the render's top-level terminal return, which
 * skips the epilogue). The trace legitimately parses as incomplete, and window-truncated invariants
 * report inconclusive rather than pass. */
function pauseOutcome(ctx: RunCtx, b: RunBoundary, pauseState: string, reason: WfRunReason, detail: string): RunOutcome {
  flush(ctx);
  const remaining = ctx.pre.projection.boundaries.map((x) => x.boundaryId).slice(ctx.pre.projection.boundaries.findIndex((x) => x.boundaryId === b.boundaryId));
  ctx.state.status = 'paused';
  ctx.state.pause = {
    state: pauseState,
    resumeArg: b.pause?.resumeArg ?? '',
    payloadSchema: b.pause?.payloadSchema ?? null,
    remainingSteps: remaining,
    reservationNote: detail,
  };
  ctx.state.updatedAt = ctx.deps.now();
  stampTraceBinding(ctx.state, ctx.deps.store);
  ctx.deps.lock(() => ctx.deps.store.writeRunState(ctx.state));
  appendLedger(ctx, 'paused');
  return {
    kind: 'paused',
    exitCode: 75,
    envelope: buildPauseEnvelope(ctx.inputs.runId, pauseState, reason, ctx.deps.planPath ?? '<plan.json>', b.pause?.resumeArg ?? null, {
      runStatePath: ctx.deps.runStatePath,
      runDirArg: ctx.deps.runDirArg ?? null,
    }),
  };
}

function terminalOutcome(ctx: RunCtx, route: string, _startedAt: string): RunOutcome {
  flush(ctx); // NO traceClose: parity with the render's terminal return skipping the epilogue
  ctx.state.status = 'completed';
  ctx.state.updatedAt = ctx.deps.now();
  stampTraceBinding(ctx.state, ctx.deps.store);
  ctx.deps.lock(() => ctx.deps.store.writeRunState(ctx.state));
  appendLedger(ctx, route);
  return {
    kind: 'completed',
    exitCode: 0,
    result: {
      schema: WF_RUN_RESULT_SCHEMA,
      runId: ctx.inputs.runId,
      status: 'completed',
      exitCode: 0,
      terminalRoute: route, // MEDIUM-13: a wrapper can now tell this from an ordinary completion
      ...(ctx.deps.dispatcherOverride === true ? { dispatcherOverride: true } : {}),
    },
  };
}

/** FAIL — flush WITHOUT `run.closed`, name the reason, and emit NO pause envelope (AM-16: that is
 * exactly what lets a wrapper tell a pause from a failure using stdout and the exit code alone). */
function failOutcome(runId: string, reason: WfRunReason, detail: string, ctx: RunCtx | null): RunOutcome {
  if (ctx !== null) {
    flush(ctx);
    ctx.state.status = 'failed';
    ctx.state.failure = { reason, detail };
    ctx.state.updatedAt = ctx.deps.now();
    ctx.deps.lock(() => ctx.deps.store.writeRunState(ctx.state));
    appendLedger(ctx, 'failed');
  }
  return {
    kind: 'failed',
    exitCode: 1,
    reason,
    detail,
    result: {
      schema: WF_RUN_RESULT_SCHEMA,
      runId,
      status: 'failed',
      reason,
      exitCode: 1,
      ...(ctx?.deps.dispatcherOverride === true ? { dispatcherOverride: true } : {}),
    },
  };
}
