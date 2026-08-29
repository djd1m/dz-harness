/**
 * `workflow-run-dispatch` — the DISPATCHER SEAM of `dz workflow run` (ADR-002 O1).
 *
 * Why a seam at all: the two runtimes disagree about almost everything that matters (stdin open vs
 * closed, envelope shape, where a deliverable appears, what a clean exit means), and the scheduler
 * must not know any of it. What it knows is: ask for a dispatch, get back a typed outcome whose
 * failure reason is a member of ONE list.
 *
 * Everything below the contract is CONVENTION — and every convention here is a MEASURED lesson, not
 * a preference. Each one is named at its definition with the observation that produced it, because
 * a convention whose reason is lost is the next thing somebody "cleans up".
 */
import type { Deliverable } from './loop-plan.js';
import { type BridgeFamily } from './qe-bridge.js';
import type { WfRunReason } from './workflow-run.js';
/** The dispatch REQUEST — every field resolved by the scheduler, so an adapter never re-decides. */
export interface DispatchRequest {
    stepId: string;
    /** The fanout member key, or null for a top-level step. */
    itemKey: string | null;
    /** 1-based; INCLUDES the initial attempt. */
    attempt: number;
    /** Fully assembled (USER prompt + shared contract lines + item binding), ingress-defanged. */
    prompt: string;
    /** Resolved at preflight (AM-8) — TOTAL, never inferred inside the adapter. */
    family: BridgeFamily;
    /** The PROBED id, never the requested spec: an allowlist says a name is spellable, only a probe
     * says it answers. */
    resolvedModelId: string;
    deliverable: Deliverable;
    /** Declared reads — the input paths a file-mode step is asked to OPEN. They travel so the adapter
     * (and the scheduler's dispatch-time containment re-check) can hold them to the SAME realpath /
     * symlinked-ancestor discipline as writes: a read that escapes the root is not safer than a write
     * that does (Step-8 re-QE R3-A). */
    expectedReads: string[];
    /** Declared writes. The scheduler owns the landed barrier (it snapshots the baseline); the
     * adapter only needs to know the step is in file mode. */
    expectedWrites: string[];
    timeoutMs: number;
    /** Target tree for file mode; ignored by a return-value claude dispatch (isolated temp cwd). */
    cwd: string;
}
export interface DispatchFailure {
    reason: WfRunReason;
    detail: string;
}
export interface DispatchResult {
    /** Pinned to the trace settle vocabulary (`loop-trace.ts` settle outcomes) — one word, two planes. */
    outcome: 'ok' | 'null' | 'error';
    /** Envelope-extracted text; null on null/error. */
    text: string | null;
    family: BridgeFamily;
    modelUsed: string | null;
    wallMs: number;
    /** null when the runtime did not report a count — NEVER 0, never estimated (ADR-004 C4). */
    tokensIn: number | null;
    tokensOut: number | null;
    tokensSource: 'claude-envelope' | 'codex-stderr' | null;
    failure?: DispatchFailure;
}
export interface ProbeOutcome {
    /** The id that ANSWERED, or null when no candidate did. */
    id: string | null;
    wallMs: number;
    detail: string;
}
export interface Dispatcher {
    /** Once per run per family; the result is cached by the SCHEDULER and persisted into run-state
     * (AM-8), so a resume compares against the id that actually ran. */
    probe(candidates: string[]): Promise<ProbeOutcome>;
    dispatch(req: DispatchRequest): Promise<DispatchResult>;
}
/**
 * The 4 reasons an ADAPTER may produce — the producer PARTITION of the one 22-member
 * `WF_RUN_REASONS` list (K3). There is no second taxonomy: the type stays `WfRunReason`, and this
 * array is the data a test uses to assert who is allowed to produce what. The other 18 members have
 * preflight, scheduler or state-plane producers.
 */
export declare const DISPATCH_REASONS: readonly ["dispatch-timeout", "dispatch-dead", "prompt-over-ceiling", "probe-failed"];
export type DispatchReason = (typeof DISPATCH_REASONS)[number];
/** Measured 2026-08-12: a codex `exec` at xhigh effort needs this much wall clock at the far end of
 * its distribution. Used as the scheduler's DEFAULT per-stage timeout when the operator gives none. */
export declare const CODEX_EXEC_XHIGH_TIMEOUT_MS = 560000;
export interface ChildRun {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    spawnError: string | null;
}
export type ChildRunner = (bin: string, argv: string[], opts: {
    stdinText: string | null;
    timeoutMs: number;
    cwd: string;
    detached: boolean;
}) => Promise<ChildRun>;
/**
 * W1 — the timeout/dead discriminator, decided on the WRAPPER'S OWN FIELDS and nothing else.
 *
 * The distinction is load-bearing because the two have different retry semantics and different
 * operator meanings: a timeout says "it was still working", a dead dispatch says "nothing came
 * back". Deciding it from stderr text would make the verdict depend on a runtime's phrasing.
 *
 *   • `timedOut === true` ⇒ `timeout` — the deadline timer FIRED, full stop;
 *   • a spawn error, or `exitCode === null` WITHOUT a timeout ⇒ `dead` (the process never ran, or
 *     vanished);
 *   • anything else ⇒ `exited`, and the FAMILY parser decides. A clean exit with no parseable
 *     envelope is ALSO dead — the "spawned but mute" case — but that call belongs to the parser
 *     that knows what an envelope looks like, not to this function.
 */
export declare function classifyChildRun(run: ChildRun): {
    kind: 'timeout';
} | {
    kind: 'dead';
    detail: string;
} | {
    kind: 'exited';
    exitCode: number;
};
/**
 * Prepended to a RETURN-VALUE codex dispatch. Codex `exec` is an agent with a workspace, not a
 * completion endpoint: without this it will happily start reading files to answer a question whose
 * whole answer is in the prompt. Paired with `--sandbox read-only`, which makes the instruction
 * enforceable rather than advisory.
 */
export declare const CODEX_SCOPING_PREFIX = "Answer directly from this prompt text alone; no commands, no files, no tools.";
/**
 * The REAL prompt ceiling for `codex exec`.
 *
 * The folk value 1200 is refuted history: it came from an era when the prompt travelled through a
 * fire-and-forget wrapper. Over-ceiling ⇒ a LOUD `prompt-over-ceiling`, never truncation — a
 * truncated prompt produces a confident answer to a question nobody asked.
 */
export declare const CODEX_EXEC_PROMPT_CEILING_CHARS = 24000;
/**
 * argv for one codex dispatch. The prompt travels as ONE argv element (no shell, no quoting), and
 * `stdinText` is ALWAYS null for codex — MEASURED this session: with stdin left open, codex-cli
 * 0.148.0 prints `Reading additional input from stdin...` and waits. `< /dev/null` is not a style
 * choice; it is the difference between a 5.7 s answer and a hang.
 *
 * Return-value mode gets the scoping prefix AND `--sandbox read-only`. File mode gets NEITHER: the
 * step's whole deliverable is a file it must be able to write.
 */
export declare function codexExecArgv(modelId: string, prompt: string, deliverable: Deliverable): string[];
/** The liveness probe: an allowlist says an id is SPELLABLE, only a probe says it ANSWERS. */
export declare function codexProbeArgv(candidateId: string): string[];
/** Word-bounded `OK` on a clean exit — the `interpretClaudeProbe` twin. */
export declare function interpretCodexProbe(out: {
    stdout: string;
    exitCode: number | null;
}): boolean;
/**
 * Best-effort token extraction from codex stderr — null when absent, NEVER 0 and never estimated.
 *
 * MEASURED (codex-cli 0.148.0, this session): the trailer is a TOTAL only —
 * `tokens used\n9,820` — with no input/output split. `wf-budget-1` has no field for a total, and
 * attributing a total to either half would be a fabrication, so this returns BOTH nulls for that
 * shape and the row's `tokensSource` stays null. The split branch below exists because some
 * builds/configs do print one; it is tested, not assumed. (Named consequence: codex runs report no
 * token counts today. That is the honest state, not a bug to paper over — see the manifest.)
 */
export declare function extractCodexTokens(stderr: string): {
    tokensIn: number | null;
    tokensOut: number | null;
};
/**
 * The claude `--output-format json` USAGE fields, pinned to the LIVE envelope shape.
 *
 * MEASURED this session (`claude -p --output-format json`, sonnet):
 * `usage.input_tokens = 2`, `usage.output_tokens = 4`, alongside `cache_read_input_tokens` and
 * `cache_creation_input_tokens`. Only the two plain counters are reported — cache tokens are a
 * SEPARATE dimension `wf-budget-1` has no field for, and silently folding them into `tokensIn`
 * would inflate every cached run's cost picture. Added to the architecture's export list; see the
 * manifest.
 */
export declare function extractClaudeUsage(stdout: string): {
    tokensIn: number | null;
    tokensOut: number | null;
};
/**
 * The codex adapter. Conventions, each a Confirmation-1 assertion:
 * stdin ALWAYS closed; the prompt as one argv element; scoping prefix + `--sandbox read-only` on
 * return-value and NEITHER on file mode; `detached: true` on every spawn (AM-10).
 */
export declare function makeCodexExecDispatcher(run: ChildRunner, opts?: {
    bin?: string;
    ceilingChars?: number;
    isolatedCwd?: () => string;
    monotonicMs?: () => number;
}): Dispatcher;
/**
 * The claude adapter. Return-value mode is the `dz qe-bridge` ISOLATION discipline verbatim:
 * `claudeReviewArgs(model)` (which carries `CLAUDE_ISOLATION_ARGS`: `--output-format json`,
 * `--safe-mode`, `--strict-mcp-config`, `--tools ''`, `--no-session-persistence`), an EMPTY temp
 * cwd so no project state leaks in, the prompt on STDIN (no ARG_MAX ceiling, no shell), and a
 * LAST-anchored envelope parse so anything a customization printed first is structurally outside
 * the reviewed text.
 *
 * File mode drops `--tools ''` and `--safe-mode` (the step's deliverable is a file it must write)
 * and runs in `req.cwd`, but keeps `--output-format json` and the envelope parse — and the
 * scheduler's landed barrier still has the last word.
 */
export declare function makeClaudePDispatcher(run: ChildRunner, opts?: {
    bin?: string;
    isolatedCwd?: () => string;
    monotonicMs?: () => number;
}): Dispatcher;
/**
 * FILE-mode claude argv: the isolation set MINUS the two flags that would make writing impossible
 * (`--tools ''` and `--safe-mode`). Everything that makes the reply READABLE stays — the envelope
 * is how the runner tells an answer from a banner, in either mode.
 */
export declare function claudeFileArgs(model: string): string[] | null;
/**
 * Neutralize anchored `GATE: PASS|FAIL` lines inside UPSTREAM text before it is spliced into a
 * DOWNSTREAM prompt.
 *
 * Why this exists as a second defence, when `gateVerdict` is already LAST-anchored: the two attacks
 * are different. The egress parser stops a single reply from smuggling a verdict past its own
 * terminal line. This stops a reply that legitimately CONTAINS a verdict — an upstream gate's own
 * answer — from becoming the terminal line of a DOWNSTREAM step's reply once the model quotes its
 * input back. Without it, "please review the previous verdict" is a working exploit against a plan
 * that never did anything wrong.
 *
 * NEUTRALIZATION, not deletion: the words survive so the downstream model can still read what the
 * upstream said. Only the ANCHORED grammar is broken. Idempotent — defanging twice is defanging
 * once, so a value that travels through three steps is not progressively mangled.
 */
export declare function defangGateEchoes(text: string): string;
//# sourceMappingURL=workflow-run-dispatch.d.ts.map