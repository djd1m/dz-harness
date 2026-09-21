/** Pure parsing and classification for one `dz round exec` subprocess receipt. */

export type RoundExecOutcome =
  | 'done'
  | 'timeout'
  | 'session-limit'
  | 'model-refused'
  | 'failed'
  | 'empty';

export interface RoundExecLedgerRow {
  readonly stage: 'round-exec';
  readonly slug: string;
  readonly round: number;
  readonly coder: string;
  readonly minutes: number;
  readonly tokens: number | null;
  readonly agents: 1;
  readonly outcome: RoundExecOutcome;
  readonly exitCode: number | null;
  readonly bytes: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly log: string;
  readonly brief: string;
}

export function parseCodexTokens(logText: string): number | null {
  const matches = [...logText.matchAll(/^tokens used[ \t]*\r?\n([0-9][0-9, \t]*)[ \t]*$/gmi)];
  const raw = matches.at(-1)?.[1];
  if (raw === undefined) return null;
  const parsed = Number(raw.replace(/[ ,\t]/g, ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function classifyRoundExecOutcome(input: {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly bytes: number;
  /** How the run ENDED: the limit/refusal signatures are end-state facts, so they read the tail. */
  readonly tail: string;
  /**
   * The WHOLE log, when the caller has it. The turn marker is not an end-state fact — it is the last
   * `\ncodex\n` ANYWHERE in the log — and a fixed tail window cannot hold it: MEASURED 2026-09-20 on
   * three real rounds, Codex's final answer ran 12–20 KB (it quotes runner output), so the marker sat
   * at ~95% of the file and fell outside the caller's 4 KB tail. All three runs had landed their files
   * and were green, and all three were recorded `failed`. Defaults to `tail` for callers that only
   * have the window.
   */
  readonly fullText?: string;
}): RoundExecOutcome {
  if (input.timedOut) return 'timeout';
  if (/rate limit|usage limit|limit reached/i.test(input.tail)) return 'session-limit';
  if (/HTTP 400|not supported when using Codex/i.test(input.tail)) return 'model-refused';
  if (input.exitCode === 0 && input.bytes > 0) {
    const haystack = input.fullText ?? input.tail;
    const marker = haystack.lastIndexOf('\ncodex\n');
    const finalLine = marker < 0 ? '' : haystack.slice(marker + '\ncodex\n'.length).split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (finalLine !== '') return 'done';
  }
  if (input.exitCode === 0 && input.bytes === 0) return 'empty';
  return 'failed';
}

export function buildRoundExecRow(input: {
  readonly slug: string;
  readonly round: number;
  readonly model: string;
  readonly effort: string;
  readonly minutes: number;
  readonly tokens: number | null;
  readonly outcome: RoundExecOutcome;
  readonly exitCode: number | null;
  readonly bytes: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly log: string;
  readonly brief: string;
}): RoundExecLedgerRow {
  return {
    stage: 'round-exec',
    slug: input.slug,
    round: input.round,
    coder: `codex:${input.model}:${input.effort}`,
    minutes: input.minutes,
    tokens: input.tokens,
    agents: 1,
    outcome: input.outcome,
    exitCode: input.exitCode,
    bytes: input.bytes,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    log: input.log,
    brief: input.brief,
  };
}
