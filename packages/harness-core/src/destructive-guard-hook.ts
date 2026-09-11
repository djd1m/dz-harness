// destructive-guard-hook — the CONSUMER half of the destructive-command guard
// (feature `destructive-command-guard`, ADR-001, plan task T8).
//
// WHY THIS FILE EXISTS AT ALL. The classifier (`destructive-guard.ts`) already returned a verdict,
// and nothing on either host read it: the export existed, the consumer did not, so
// `rm -rf .agentic-qe` still executed on both runtimes. A verdict nobody consumes is a document,
// not a guard. This module is that consumer — and it is ONE module rather than two hook bodies,
// because the two hosts must give the SAME answer in the SAME words. A refusal text duplicated in
// two shell-spawned strings drifts silently the first time either is edited.
//
// PURE BY CONTRACT, exactly like the classifier it wraps: a payload in, an exit code and a piece of
// text out. No filesystem access, no subprocess, no environment. The hook bodies that call it read
// stdin, hand the parsed object over, print what comes back and exit with the code — nothing else.
//
// FAIL-OPEN ON OUR OWN FAILURE. Every branch that is not a decided `refuse` exits 0. An unparseable
// payload, a classifier that throws, a tool that is not a shell — none of them is evidence of a
// violation, and a guard that blocks on its own confusion is a guard the user switches off. This is
// the same polarity the sibling guards ship with (`claim-check-hook.cjs`, `dz-codex-veto.cjs`).

import { classifyDestructive } from './destructive-guard.js';
import type { DestructiveVerdict } from './destructive-guard.js';

/** Prefix of a BLOCKING message. Must appear verbatim for a block to be attributed to this guard. */
export const DESTRUCTIVE_REFUSE_MARKER = 'DZ-DESTRUCTIVE:';

/** Prefix of a non-blocking message: an `undecidable` verdict, or our own failure to read. */
export const DESTRUCTIVE_WARN_MARKER = 'DZ-DESTRUCTIVE-WARN:';

/**
 * Which host contract the payload follows. The two differ in ONE measured respect, so the
 * difference is a parameter rather than a guess:
 *
 * - `claude` — Claude Code sends `tool_name` for every tool and the registered matcher is `^Bash$`.
 *   A payload whose `tool_name` is not a shell tool is skipped WITHOUT looking at any command field,
 *   which is what the host contract promises and what the test pins.
 * - `codex` — AM-8 of `crossrt-2-codex-hooks`: key on the PRESENCE of `tool_input.command`, never on
 *   `tool_name` equality. Codex's shell tool has been observed under more than one name
 *   (`Bash|shell|local_shell` is the matcher the emitted registry entry already carries), so a
 *   tool_name test there would silently disarm the guard the day the runtime renames its tool.
 */
export type DestructiveHookHost = 'claude' | 'codex';

/** Tool names that ARE a shell on the Claude host. */
const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set(['Bash', 'bash', 'shell', 'local_shell']);

export interface DestructiveHookDecision {
  /** 2 = block the call (the host contract on BOTH runtimes). 0 = let it through. */
  readonly exitCode: 0 | 2;
  /** Exactly what the hook body writes to stderr. Empty string ⇒ write nothing at all. */
  readonly stderr: string;
  /**
   * What happened, for tests and for the helper's own notes log:
   * `refuse` / `allow` / `undecidable` are the classifier's three outcomes;
   * `skipped` = not a shell command, the classifier was never consulted;
   * `unreadable` = the payload or the classifier failed us, and we passed rather than guessed.
   */
  readonly outcome: 'refuse' | 'allow' | 'undecidable' | 'skipped' | 'unreadable';
  /** The rule id from a refusal, so a note can record WHICH rule fired without the command line. */
  readonly rule: string | null;
}

/**
 * Render the limits block from THE VERDICT's own list — never from a copy kept here.
 *
 * ADR-001 obliges the guard to NAME what it does not decide, in its own text, on every verdict it
 * speaks about: a guard silent about its limits reads as a guarantee that recursive deletion is
 * covered, and it is not. Re-listing them in this file would be a second copy free to drift from
 * the classifier's; `verdict.limits` is the single source.
 */
function renderLimits(limits: readonly string[]): string {
  const head = 'Чего этот страж НЕ решает (печатается при каждом вердикте, чтобы он не читался как гарантия):';
  return [head, ...limits.map((l) => `  - ${l}`)].join('\n');
}

function renderRefusal(verdict: DestructiveVerdict): string {
  return [
    `${DESTRUCTIVE_REFUSE_MARKER} ОТКАЗ — удаление по буквальному пути в защищаемое хранилище.`,
    '',
    `Путь:    ${verdict.path ?? '(не назван)'}`,
    `Правило: ${verdict.rule ?? '(не названо)'}`,
    `Причина: ${verdict.reason}`,
    '',
    renderLimits(verdict.limits),
    '',
    'Санкционированное удаление защищаемого хранилища выполняет владелец вручную, вне сеанса агента.',
    '',
  ].join('\n');
}

function renderUndecidable(verdict: DestructiveVerdict): string {
  return [
    `${DESTRUCTIVE_WARN_MARKER} команду не удалось разобрать (${verdict.reason}) — ПРОПУЩЕНА без отказа: «проверить не удалось» никогда не выдаётся за «запрещено» (AC-10).`,
    renderLimits(verdict.limits),
    '',
  ].join('\n');
}

function unreadable(message: string): DestructiveHookDecision {
  return {
    exitCode: 0,
    // One line, and no limits block: there is no verdict here to quote limits FROM, and inventing
    // one would be the same lie in the other direction.
    stderr: `${DESTRUCTIVE_WARN_MARKER} ${message} — пропуск без отказа; отсутствие вердикта нарушением не является.\n`,
    outcome: 'unreadable',
    rule: null,
  };
}

const SKIP: DestructiveHookDecision = { exitCode: 0, stderr: '', outcome: 'skipped', rule: null };
const ALLOW: DestructiveHookDecision = { exitCode: 0, stderr: '', outcome: 'allow', rule: null };

/**
 * Turn one hook payload into an exit code and a piece of text. The whole policy, both hosts.
 *
 * @param payload the parsed stdin object, or `null`/anything else when it did not parse.
 * @param host    which host contract the payload follows — see {@link DestructiveHookHost}.
 */
export function decideDestructiveHook(payload: unknown, host: DestructiveHookHost): DestructiveHookDecision {
  if (payload === null || typeof payload !== 'object') {
    return unreadable('полезная нагрузка хука не прочиталась');
  }

  const p = payload as { tool_name?: unknown; tool_input?: unknown };

  if (host === 'claude') {
    // The Claude contract: decide from the tool NAME first, and on a non-shell tool return before
    // any command field is even looked at.
    const toolName = typeof p.tool_name === 'string' ? p.tool_name : '';
    if (!SHELL_TOOL_NAMES.has(toolName)) return SKIP;
  }

  const input = p.tool_input;
  const command = input !== null && typeof input === 'object' ? (input as { command?: unknown }).command : undefined;
  if (typeof command !== 'string' || command === '') return SKIP;

  let verdict: DestructiveVerdict;
  try {
    verdict = classifyDestructive(command);
  } catch (err) {
    // Our own failure. Never a refusal — see the FAIL-OPEN note at the top of the file.
    return unreadable(`классификатор не смог вынести вердикт (${String((err as Error)?.message ?? err)})`);
  }

  if (verdict.outcome === 'refuse') {
    return { exitCode: 2, stderr: renderRefusal(verdict), outcome: 'refuse', rule: verdict.rule };
  }
  if (verdict.outcome === 'undecidable') {
    return { exitCode: 0, stderr: renderUndecidable(verdict), outcome: 'undecidable', rule: null };
  }
  return ALLOW;
}
