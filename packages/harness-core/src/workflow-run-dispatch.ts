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

import { CODEX_EXEC_PROMPT_CEILING_CHARS } from './feature-adr-routing.js';
import type { Deliverable } from './loop-plan.js';
import { claudeProbeArgs, claudeReviewArgs, extractClaudeResult, interpretClaudeProbe, type BridgeFamily } from './qe-bridge.js';
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
  tokensSource: 'claude-envelope' | 'codex-stderr' | 'codex-json' | null;
  tokensTotal?: number | null;
  tokensCacheRead?: number | null;
  tokensCacheWrite?: number | null;
  tokensReasoning?: number | null;
  reportedTotalBasis?: 'raw-inclusive' | 'uncached-display' | 'reported-unknown' | 'output-only' | 'unknown';
  inputCacheSemantics?: 'includes-cache-read-write' | 'excludes-cache-read-write' | 'uncached-display' | 'unknown';
  reportedCostUsd?: number | null;
  usageDiagnostics?: string[];
  totalDerivation?: string;
  modelProvenance?: string;
  usageSource?: { schema: string; scope: string; threadId: string | null; turnId: string | null; receiptId: string | null };
  failure?: DispatchFailure;
}

export interface ProbeOutcome {
  /** The id that ANSWERED, or null when no candidate did. */
  id: string | null;
  wallMs: number;
  detail: string;
  provenance?: {
    schema: 'wf-probe-attempts-1'; complete: boolean; totalConsidered: number;
    attempts: Array<{ ordinal: number; model: string | null; family: BridgeFamily; wrapperInvoked: boolean;
      outcome: 'answered' | 'failed' | 'rejected'; selected: boolean;
      reason: 'answered' | 'timeout' | 'spawn-error' | 'no-exit-code' | 'exit-nonzero' | 'unexpected-response' | 'invalid-candidate' }>;
  } | null;
  provenanceReason?: 'candidate-model-invalid' | 'wrapper-result-invalid' | null;
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
export const DISPATCH_REASONS = ['dispatch-timeout', 'dispatch-dead', 'prompt-over-ceiling', 'probe-failed'] as const;
export type DispatchReason = (typeof DISPATCH_REASONS)[number];

/** Measured 2026-08-12: a codex `exec` at xhigh effort needs this much wall clock at the far end of
 * its distribution. Used as the scheduler's DEFAULT per-stage timeout when the operator gives none. */
export const CODEX_EXEC_XHIGH_TIMEOUT_MS = 560_000;

// ─────────────────────────────────────────────────────────────────────────────
// The impure child seam BOTH adapters ride (implemented in harness-cli by generalizing
// `runClaudeBridge`: deadline timer + SIGTERM, settled flag, env scrub, injectable spawnImpl).
// ─────────────────────────────────────────────────────────────────────────────

export interface ChildRun {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  spawnError: string | null;
}

export type ChildRunner = (
  bin: string,
  argv: string[],
  opts: { stdinText: string | null; timeoutMs: number; cwd: string; detached: boolean },
) => Promise<ChildRun>;

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
export function classifyChildRun(run: ChildRun):
  | { kind: 'timeout' }
  | { kind: 'dead'; detail: string }
  | { kind: 'exited'; exitCode: number } {
  if (run.timedOut === true) return { kind: 'timeout' };
  if (run.spawnError !== null && run.spawnError !== undefined && run.spawnError !== '') {
    return { kind: 'dead', detail: run.spawnError };
  }
  if (run.exitCode === null || run.exitCode === undefined) {
    return { kind: 'dead', detail: 'the child exited with no code and the deadline never fired — it vanished' };
  }
  return { kind: 'exited', exitCode: run.exitCode };
}

// ── codexExec conventions (each one MEASURED — 02_research §5; re-measured this session) ────────

/**
 * Prepended to a RETURN-VALUE codex dispatch. Codex `exec` is an agent with a workspace, not a
 * completion endpoint: without this it will happily start reading files to answer a question whose
 * whole answer is in the prompt. Paired with `--sandbox read-only`, which makes the instruction
 * enforceable rather than advisory.
 */
export const CODEX_SCOPING_PREFIX =
  'Answer directly from this prompt text alone; no commands, no files, no tools.';

/**
 * The REAL prompt ceiling for `codex exec` — RE-EXPORTED, never re-declared.
 *
 * The folk value 1200 is refuted history: it came from an era when the prompt travelled through a
 * fire-and-forget wrapper. Over-ceiling ⇒ a LOUD `prompt-over-ceiling`, never truncation — a
 * truncated prompt produces a confident answer to a question nobody asked.
 *
 * ONE NUMBER, ONE DEFINITION. Until 2026-09-20 this module declared its own `= 24_000` beside the
 * one in `feature-adr-routing.ts`, and NOTHING compared them: no test imported both, so the two
 * could diverge in silence and `codexExecPlan` would route to Claude at a different threshold than
 * `makeCodexExecDispatcher` rejects at. Measured: `feature-adr-codex-dispatch.test.ts` asserts only
 * `> 4000`, and the mirror guard in `codex-scoped-review.test.ts` ties routing.ts to the four
 * workflow copies but knows nothing about this file.
 *
 * The definition lives in `feature-adr-routing.ts` and not here because THAT module is lifted
 * verbatim into the workflow sandbox by `scripts/gen-loop-blobs.mjs` and therefore may not import
 * anything. The dependency can only point this way.
 */
export { CODEX_EXEC_PROMPT_CEILING_CHARS };

/**
 * argv for one codex dispatch. The prompt travels as ONE argv element (no shell, no quoting), and
 * `stdinText` is ALWAYS null for codex — MEASURED this session: with stdin left open, codex-cli
 * 0.148.0 prints `Reading additional input from stdin...` and waits. `< /dev/null` is not a style
 * choice; it is the difference between a 5.7 s answer and a hang.
 *
 * Return-value mode gets the scoping prefix AND `--sandbox read-only`. File mode gets NEITHER: the
 * step's whole deliverable is a file it must be able to write.
 */
export function codexExecArgv(modelId: string, prompt: string, deliverable: Deliverable): string[] {
  const returnValue = (deliverable ?? 'return-value') !== 'file';
  const text = returnValue ? CODEX_SCOPING_PREFIX + '\n\n' + prompt : prompt;
  return ['exec', '-m', modelId, ...(returnValue ? ['--sandbox', 'read-only'] : []), '--json', text];
}

/** The liveness probe: an allowlist says an id is SPELLABLE, only a probe says it ANSWERS. */
export function codexProbeArgv(candidateId: string): string[] {
  return ['exec', '-m', candidateId, '--sandbox', 'read-only', 'Reply with exactly: OK'];
}

/** Word-bounded `OK` on a clean exit — the `interpretClaudeProbe` twin. */
export function interpretCodexProbe(out: { stdout: string; exitCode: number | null }): boolean {
  if (out.exitCode !== 0) return false;
  return /\bOK\b/.test(String(out.stdout ?? ''));
}

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
type ObservedUsage = Pick<DispatchResult, 'tokensIn' | 'tokensOut' | 'tokensSource' | 'tokensTotal' | 'tokensCacheRead' | 'tokensCacheWrite' | 'tokensReasoning' | 'reportedTotalBasis' | 'inputCacheSemantics' | 'reportedCostUsd' | 'usageDiagnostics' | 'usageSource' | 'totalDerivation'>;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const emptyUsage = (): ObservedUsage => ({ tokensIn: null, tokensOut: null, tokensTotal: null, tokensCacheRead: null,
  tokensCacheWrite: null, tokensReasoning: null, tokensSource: null, reportedTotalBasis: 'unknown', inputCacheSemantics: 'unknown',
  reportedCostUsd: null, usageDiagnostics: [] });

export function extractCodexTokens(stderr: string): ObservedUsage {
  const text = String(stderr ?? ''); const usage = emptyUsage();
  const numeric = (raw: string | undefined): number | null => raw === undefined ? null : count(Number(raw.replace(/[,_\s]/g, '')));
  const input = /\binput\b[^\n\d+.-]{0,20}([+-]?\d[\d,_]*(?:\.\d+)?)|\btokens?\s+in\b[^\n\d+.-]{0,10}([+-]?\d[\d,_]*(?:\.\d+)?)/i.exec(text);
  const output = /\boutput\b[^\n\d+.-]{0,20}([+-]?\d[\d,_]*(?:\.\d+)?)|\btokens?\s+out\b[^\n\d+.-]{0,10}([+-]?\d[\d,_]*(?:\.\d+)?)/i.exec(text);
  const total = /tokens used\s*\n\s*([+-]?\d[\d,_]*(?:\.\d+)?)|Token usage:\s*total=([+-]?\d[\d,_]*(?:\.\d+)?)/i.exec(text);
  usage.tokensIn = numeric(input?.[1] ?? input?.[2]); usage.tokensOut = numeric(output?.[1] ?? output?.[2]);
  usage.tokensTotal = numeric(total?.[1] ?? total?.[2]);
  if (input && usage.tokensIn === null) usage.usageDiagnostics!.push('invalid-counter:input');
  if (output && usage.tokensOut === null) usage.usageDiagnostics!.push('invalid-counter:output');
  if (total && usage.tokensTotal === null) usage.usageDiagnostics!.push('invalid-counter:total');
  const cached = /\(\+([\d,_]+) cached\)/i.exec(text);
  if (total?.[2] && cached) usage.tokensCacheRead = numeric(cached[1]);
  usage.reportedTotalBasis = total?.[2] ? 'uncached-display' : 'reported-unknown';
  usage.inputCacheSemantics = total?.[2] ? 'uncached-display' : 'unknown';
  usage.tokensSource = usage.tokensTotal != null || usage.tokensIn != null || usage.tokensOut != null ? 'codex-stderr' : null;
  usage.totalDerivation = usage.tokensTotal === null ? 'not-recorded' : 'reported';
  return usage;
}

export function extractClaudeUsage(stdout: string): ObservedUsage {
  let chosen: Record<string, unknown> | null = null;
  for (const line of [String(stdout).trim(), ...String(stdout).split(/\r?\n/)]) {
    try { const obj = JSON.parse(line) as Record<string, unknown>; if (obj && obj['type'] === 'result') chosen = obj; } catch { /* non-envelope line */ }
  }
  const result = emptyUsage(); if (!chosen) return result;
  const usage = chosen['usage']; if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return result;
  const raw = usage as Record<string, unknown>;
  const invalid = (obj: Record<string, unknown>, key: string) => obj[key] != null && count(obj[key]) === null;
  const field = (obj: Record<string, unknown>, key: string): number | null => {
    if (invalid(obj, key)) result.usageDiagnostics!.push('invalid-count:' + key);
    return count(obj[key]);
  };
  result.tokensIn = field(raw, 'input_tokens'); result.tokensOut = field(raw, 'output_tokens');
  result.tokensCacheRead = field(raw, 'cache_read_input_tokens'); result.tokensCacheWrite = field(raw, 'cache_creation_input_tokens');
  const creation = raw['cache_creation'];
  if (creation != null) {
    if (typeof creation !== 'object' || Array.isArray(creation)) {
      result.usageDiagnostics!.push('invalid-cache-creation-shape'); result.tokensCacheWrite = null;
    } else {
      const nested = creation as Record<string, unknown>;
      const a = field(nested, 'ephemeral_5m_input_tokens'); const b = field(nested, 'ephemeral_1h_input_tokens');
      const nestedInvalid = invalid(nested, 'ephemeral_5m_input_tokens') || invalid(nested, 'ephemeral_1h_input_tokens');
      const total = a !== null && b !== null ? count(a + b) : null;
      if (a !== null && b !== null && total === null) result.usageDiagnostics!.push('cache-creation-overflow');
      if (nestedInvalid || (a !== null && b !== null && total === null)) result.tokensCacheWrite = null;
      else if (raw['cache_creation_input_tokens'] == null) result.tokensCacheWrite = total;
      else if (result.tokensCacheWrite !== null && total !== null && total !== result.tokensCacheWrite) {
        result.usageDiagnostics!.push('cache-creation-mismatch'); result.tokensCacheWrite = null;
      }
    }
  }
  result.tokensReasoning = field(raw, 'reasoning_output_tokens');
  if (result.tokensReasoning !== null && result.tokensOut !== null && result.tokensReasoning > result.tokensOut) {
    result.usageDiagnostics!.push('reasoning-exceeds-output'); result.tokensReasoning = null;
  }
  result.tokensTotal = field(raw, 'total_tokens');
  const components = [result.tokensIn, result.tokensCacheRead, result.tokensCacheWrite, result.tokensOut];
  const partitionKnown = components.every((n) => n !== null);
  const derived = partitionKnown ? count(components.reduce<number>((n, v) => n + (v ?? 0), 0)) : null;
  if (partitionKnown && derived === null) result.usageDiagnostics!.push('total-overflow');
  if (invalid(raw, 'total_tokens')) result.totalDerivation = 'invalid-reported-total';
  else if (raw['total_tokens'] == null) {
    result.tokensTotal = derived; result.totalDerivation = derived === null ? 'not-recorded' : 'disjoint-dimensions';
  } else result.totalDerivation = 'reported';
  if (derived !== null && result.tokensTotal !== null && result.tokensTotal !== derived) result.usageDiagnostics!.push('total-split-mismatch');
  result.reportedCostUsd = typeof chosen['total_cost_usd'] === 'number' && Number.isFinite(chosen['total_cost_usd']) && chosen['total_cost_usd'] >= 0 ? chosen['total_cost_usd'] : null;
  result.reportedTotalBasis = 'raw-inclusive'; result.inputCacheSemantics = 'excludes-cache-read-write'; result.tokensSource = 'claude-envelope';
  return result;
}

function codexStructuredOutput(stdout: string): { structured: boolean; valid: boolean; text: string; usage: ObservedUsage; reportedModel?: string | null } {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim());
  const events: Record<string, unknown>[] = []; let malformed = false; let recognized = false;
  const types = new Set(['thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'item.started', 'item.updated', 'item.completed', 'error']);
  for (const line of lines) {
    if (/"type"\s*:\s*"(?:thread\.|turn\.|item\.|error")/.test(line)) recognized = true;
    try { const event = JSON.parse(line) as Record<string, unknown>;
      if (event && typeof event === 'object' && typeof event['type'] === 'string' && (types.has(event['type']) || /^(thread|turn|item)\./.test(event['type']))) recognized = true;
      events.push(event);
    } catch { malformed = true; }
  }
  if (!recognized) return { structured: false, valid: true, text: stdout.trim(), usage: emptyUsage() };
  const result = emptyUsage(); let failedTerminal = false; let text = ''; let threadId: string | null = null; const terminals: Record<string, unknown>[] = []; const reportedModels = new Set<string>();
  for (const event of events) {
    if (!event || typeof event !== 'object' || !types.has(String(event['type']))) { malformed = true; continue; }
    if (typeof event['model'] === 'string' && event['model'].trim()) reportedModels.add(event['model']);
    if (event['type'] === 'thread.started' && typeof event['thread_id'] === 'string') { if (threadId !== null && threadId !== event['thread_id']) malformed = true; threadId = event['thread_id']; }
    if (event['type'] === 'item.completed' && event['item'] && typeof event['item'] === 'object') {
      const item = event['item'] as Record<string, unknown>; if (item['type'] === 'agent_message' && typeof item['text'] === 'string') text = item['text'];
    }
    if (event['type'] === 'turn.completed' || (event['type'] === 'turn.failed' && event['usage'] != null)) terminals.push(event);
    if (event['type'] === 'turn.failed' || event['type'] === 'error') failedTerminal = true;
  }
  const distinct = new Set(terminals.map((v) => { const u = v['usage'] && typeof v['usage'] === 'object' ? v['usage'] as Record<string,unknown> : {}; return JSON.stringify([v['turn_id'] ?? null, ...['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'].map((key) => u[key] ?? null)]); }));
  if (distinct.size !== 1) { malformed = true; result.usageDiagnostics!.push(distinct.size === 0 ? 'terminal-usage-unavailable' : 'conflicting-terminal-usage'); }
  if (distinct.size === 1) {
    const terminal = terminals[0]!; const raw = terminal['usage'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const usage = raw as Record<string, unknown>;
      result.tokensIn = count(usage['input_tokens']); result.tokensOut = count(usage['output_tokens']);
      result.tokensCacheRead = count(usage['cached_input_tokens']); result.tokensCacheWrite = count(usage['cache_write_input_tokens']);
      result.tokensReasoning = count(usage['reasoning_output_tokens']);
      const derived = result.tokensIn !== null && result.tokensOut !== null ? count(result.tokensIn + result.tokensOut) : null;
      result.tokensTotal = count(usage['total_tokens']) ?? derived;
      result.totalDerivation = count(usage['total_tokens']) !== null ? 'reported' : derived === null ? 'not-recorded' : 'input-plus-output';
      if (derived !== null && result.tokensTotal !== derived) result.usageDiagnostics!.push('total-split-mismatch');
      if (result.tokensCacheRead != null && result.tokensIn != null && result.tokensCacheRead > result.tokensIn) result.usageDiagnostics!.push('cache-exceeds-input');
      if (result.tokensReasoning != null && result.tokensOut != null && result.tokensReasoning > result.tokensOut) result.usageDiagnostics!.push('reasoning-exceeds-output');
      for (const [key, value] of Object.entries(usage)) if (key.endsWith('_tokens') && count(value) === null) result.usageDiagnostics!.push('invalid-counter:' + key);
      result.tokensSource = 'codex-json'; result.reportedTotalBasis = 'raw-inclusive'; result.inputCacheSemantics = 'includes-cache-read-write';
      result.usageSource = { schema: 'codex-exec-json', scope: 'terminal-turn', threadId, turnId: typeof terminal['turn_id'] === 'string' ? terminal['turn_id'] : null, receiptId: null };
    } else malformed = true;
  }
  if (malformed) result.usageDiagnostics!.push('malformed-event-stream');
  if (failedTerminal) result.usageDiagnostics!.push('runtime-turn-failed');
  if (reportedModels.size > 1) result.usageDiagnostics!.push('provider-model-mismatch');
  return { structured: true, valid: !malformed && !failedTerminal, text, usage: result, reportedModel: reportedModels.size === 1 ? [...reportedModels][0]! : null };
}

/** Observe the existing wrapper seam; this does not attest OS child start. */
function collectProbeMetadata(family: BridgeFamily) {
  const attempts: NonNullable<ProbeOutcome['provenance']>['attempts'] = [];
  let totalConsidered = 0;
  let invalid: Exclude<ProbeOutcome['provenanceReason'], undefined> = null;
  return {
    record(id: string, wrapperInvoked: boolean, r: ChildRun | null, selected: boolean) {
      const ordinal = ++totalConsidered;
      if (wrapperInvoked && (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(id))) invalid = 'candidate-model-invalid';
      let reason: NonNullable<ProbeOutcome['provenance']>['attempts'][number]['reason'] = 'invalid-candidate';
      if (r !== null) {
        const typed = typeof r.stdout === 'string' && typeof r.stderr === 'string' && typeof r.timedOut === 'boolean'
          && (r.exitCode === null || (Number.isSafeInteger(r.exitCode) && r.exitCode >= 0))
          && (r.spawnError === null || (typeof r.spawnError === 'string' && r.spawnError.length > 0));
        const consistent = typed && !(r.timedOut && (r.spawnError !== null || r.exitCode === 0))
          && !(r.spawnError !== null && r.exitCode !== null) && !(selected && (r.timedOut || r.spawnError !== null || r.exitCode !== 0));
        if (!consistent && invalid !== 'candidate-model-invalid') invalid = 'wrapper-result-invalid';
        reason = r.timedOut ? 'timeout' : r.spawnError !== null ? 'spawn-error' : r.exitCode === null ? 'no-exit-code'
          : r.exitCode !== 0 ? 'exit-nonzero' : selected ? 'answered' : 'unexpected-response';
      }
      if (ordinal <= 32) attempts.push({ ordinal, model: wrapperInvoked ? id : null, family, wrapperInvoked,
        outcome: !wrapperInvoked ? 'rejected' : selected ? 'answered' : 'failed', reason, selected });
    },
    finish(): Pick<ProbeOutcome, 'provenance' | 'provenanceReason'> {
      return { provenance: invalid === null ? { schema: 'wf-probe-attempts-1', complete: totalConsidered <= 32, totalConsidered, attempts } : null,
        provenanceReason: invalid };
    },
  };
}

// ── the adapter factories (pure over the injected ChildRunner) ───────────────────────────────────

function failed(family: BridgeFamily, model: string | null, wallMs: number, reason: DispatchReason, detail: string, outcome: 'null' | 'error' = 'null'): DispatchResult {
  return {
    outcome,
    text: null,
    family,
    modelUsed: model,
    modelProvenance: 'probed-request',
    wallMs,
    tokensIn: null,
    tokensOut: null,
    tokensSource: null,
    failure: { reason, detail },
  };
}

/**
 * The codex adapter. Conventions, each a Confirmation-1 assertion:
 * stdin ALWAYS closed; the prompt as one argv element; scoping prefix + `--sandbox read-only` on
 * return-value and NEITHER on file mode; `detached: true` on every spawn (AM-10).
 */
export function makeCodexExecDispatcher(run: ChildRunner, opts?: { bin?: string; ceilingChars?: number; isolatedCwd?: () => string; monotonicMs?: () => number }): Dispatcher {
  const bin = opts?.bin ?? 'codex';
  const ceiling = opts?.ceilingChars ?? CODEX_EXEC_PROMPT_CEILING_CHARS;
  // A PROBE has no target tree. the current working directory is the CLI’s business — core never reaches for it,
  // which is what keeps the purity grep over this package honest.
  // The adapter CLOCKS ITSELF, through an INJECTED monotonic source. Core may not reach for a real
  // clock (that is what makes every property in this feature reproducible), so the default is a
  // fixed 0 and the CLI injects the real one; the scheduler's own delta fills in when it is 0. A
  // live probe MEASURED the un-clocked version reporting `wallMs: 0` on a 4.4 s real dispatch —
  // per-dispatch wall clock is the one thing budget.jsonl exists to carry, so a 0 there is a lie.
  const clock = opts?.monotonicMs ?? ((): number => 0);
  const isolatedCwd = opts?.isolatedCwd ?? ((): string => '.');
  return {
    probe: async (candidates) => {
      const t0 = clock();
      const list = candidates.length > 0 ? candidates : ['gpt-5.5'];
      const started: string[] = [];
      const observation = collectProbeMetadata('openai');
      for (const id of list) {
        const wrapperInvoked = true;
        const r = await run(bin, codexProbeArgv(id), { stdinText: null, timeoutMs: 120_000, cwd: isolatedCwd(), detached: true });
        started.push(id);
        const selected = interpretCodexProbe(r);
        observation.record(id, wrapperInvoked, r, selected);
        if (selected) return { id, wallMs: clock() - t0, detail: `codex answered on ${id}`, ...observation.finish() };
      }
      return { id: null, wallMs: clock() - t0, detail: `no codex candidate answered a probe (tried: ${started.join(', ')}) — an allowlist says an id is spellable, only a probe says it answers`, ...observation.finish() };
    },
    dispatch: async (req) => {
      const t0 = clock();
      if (req.prompt.length > ceiling) {
        return failed('openai', req.resolvedModelId, 0, 'prompt-over-ceiling',
          `assembled prompt is ${req.prompt.length} chars, over the ${ceiling}-char codex exec ceiling — refusing LOUDLY rather than truncating, because a truncated prompt produces a confident answer to a question nobody asked`,
          'error');
      }
      const r = await run(bin, codexExecArgv(req.resolvedModelId, req.prompt, req.deliverable), {
        stdinText: null, // MEASURED: codex waits on an open stdin
        timeoutMs: req.timeoutMs,
        cwd: req.cwd,
        detached: true,
      });
      const parsed = codexStructuredOutput(String(r.stdout ?? ''));
      const usage = parsed.structured ? parsed.usage : extractCodexTokens(r.stderr);
      const cls = classifyChildRun(r);
      if (cls.kind === 'timeout') return { ...failed('openai', req.resolvedModelId, req.timeoutMs, 'dispatch-timeout', `the ${req.timeoutMs}ms deadline fired on step ${req.stepId}`), ...usage };
      if (cls.kind === 'dead') return { ...failed('openai', req.resolvedModelId, clock() - t0, 'dispatch-dead', cls.detail), ...usage };
      if (cls.exitCode !== 0 || !parsed.valid || parsed.text === '') return { ...failed('openai', req.resolvedModelId, clock() - t0, 'dispatch-dead', 'Codex exited nonzero, had an invalid structured event stream, or was spawned-but-mute with no final text'), ...usage };
      return { outcome: 'ok', text: parsed.text, family: 'openai', modelUsed: parsed.reportedModel ?? req.resolvedModelId,
        modelProvenance: parsed.reportedModel ? 'provider-reported' : 'probed-request', wallMs: clock() - t0, ...usage };

    },
  };
}

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
export function makeClaudePDispatcher(run: ChildRunner, opts?: { bin?: string; isolatedCwd?: () => string; monotonicMs?: () => number }): Dispatcher {
  const bin = opts?.bin ?? 'claude';
  const clock = opts?.monotonicMs ?? ((): number => 0);
  const isolatedCwd = opts?.isolatedCwd ?? ((): string => '.');
  return {
    probe: async (candidates) => {
      const t0 = clock();
      const list = candidates.length > 0 ? candidates : ['sonnet'];
      const tried: string[] = [];
      const observation = collectProbeMetadata('claude');
      for (const id of list) {
        const argv = claudeProbeArgs(id);
        tried.push(id);
        if (argv === null) { observation.record(id, false, null, false); continue; } // existing unsafe rejection
        const wrapperInvoked = true;
        const r = await run(bin, argv, { stdinText: null, timeoutMs: 120_000, cwd: isolatedCwd(), detached: true });
        const selected = interpretClaudeProbe({ stdout: r.stdout, exitCode: r.exitCode ?? 1 });
        observation.record(id, wrapperInvoked, r, selected);
        if (selected) return { id, wallMs: clock() - t0, detail: `claude answered on ${id}`, ...observation.finish() };
      }
      return { id: null, wallMs: clock() - t0, detail: `no claude candidate answered a probe (tried: ${tried.join(', ')})`, ...observation.finish() };
    },
    dispatch: async (req) => {
      const t0 = clock();
      const fileMode = req.deliverable === 'file';
      const argv = fileMode ? claudeFileArgs(req.resolvedModelId) : claudeReviewArgs(req.resolvedModelId);
      if (argv === null) {
        return failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', `model id ${JSON.stringify(req.resolvedModelId)} is not a safe claude id`);
      }
      const r = await run(bin, argv, {
        stdinText: req.prompt, // MEASURED: `printf … | claude -p` answers, so there is no ARG_MAX ceiling
        timeoutMs: req.timeoutMs,
        cwd: fileMode ? req.cwd : isolatedCwd(),
        detached: true,
      });
      const usage = extractClaudeUsage(r.stdout);
      const cls = classifyChildRun(r);
      if (cls.kind === 'timeout') return { ...failed('claude', req.resolvedModelId, req.timeoutMs, 'dispatch-timeout', `the ${req.timeoutMs}ms deadline fired on step ${req.stepId}`), ...usage };
      if (cls.kind === 'dead') return { ...failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', cls.detail), ...usage };
      if (cls.exitCode !== 0) return { ...failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', `claude exited ${cls.exitCode} — a nonzero exit is a failed dispatch even with a success envelope`), ...usage };
      const env = extractClaudeResult(r.stdout);
      if (!env.ok) return { ...failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', `reply is not readable as a result envelope: ${env.detail}`), ...usage };
      return { outcome: 'ok', text: env.text, family: 'claude', modelUsed: req.resolvedModelId, modelProvenance: 'probed-request', wallMs: clock() - t0, ...usage };

    },
  };
}

/**
 * FILE-mode claude argv: the isolation set MINUS the two flags that would make writing impossible
 * (`--tools ''` and `--safe-mode`). Everything that makes the reply READABLE stays — the envelope
 * is how the runner tells an answer from a banner, in either mode.
 */
export function claudeFileArgs(model: string): string[] | null {
  const review = claudeReviewArgs(model);
  if (review === null) return null;
  const drop = new Set(['--safe-mode']);
  const out: string[] = [];
  for (let i = 0; i < review.length; i++) {
    const a = review[i] as string;
    if (drop.has(a)) continue;
    if (a === '--tools' && review[i + 1] === '') {
      i++; // skip the empty allowlist value too
      continue;
    }
    out.push(a);
  }
  return out;
}

// ── ingress defang (ADR-002 Confirmation-3 — the defangSignoffEchoes pattern, retargeted) ────────

/** The neutralization marker. Visible on purpose: an operator reading a prompt must be able to SEE
 * that a quoted verdict was defanged rather than wonder why a reply looks odd. */
const GATE_QUOTED_MARKER = '[quoted-gate-verdict]';

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
export function defangGateEchoes(text: string): string {
  return String(text ?? '').replace(GATE_ECHO_RE, (_m, lead: string, verdict: string) => `${lead}${GATE_QUOTED_MARKER} ${verdict}`);
}

/**
 * ONE grammar for both halves (Step-8 MEDIUM-12).
 *
 * The parser (`gateVerdict`) matches `/^\s*GATE:\s*(PASS|FAIL)\s*$/` — JavaScript `\s`, which
 * includes NBSP, the various Unicode spaces, and `\r`. The defanger used `[ \t]`, ASCII only. The
 * gap was demonstrable: an NBSP-prefixed `GATE: PASS` was PARSED as a verdict and NOT defanged, so
 * an upstream reply could still mint a downstream verdict by prefixing one non-breaking space.
 * `[^\S\n]` is exactly "`\s` except the line separator" — the same character class the parser sees
 * once the reply has been split into lines.
 */
const GATE_ECHO_RE = /^([^\S\n]*(?:[>*~-][^\S\n]*)*)(?:\*{0,2}#{0,4}[^\S\n]*)?GATE[^\S\n]*[:=][^\S\n]*(PASS|FAIL)[^\S\n]*$/gm;
