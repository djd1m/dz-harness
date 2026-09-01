/** Pure decisions for the Step-7.5 Codex companion liveness barrier. */

export const DEFAULT_CODE_LANDING_CEILING_MS = 7_200_000;
export const CODE_LANDING_CEILING_ENV = 'DZ_FEATURE_ADR_CODE_LANDING_CEILING_MS';

export type CodeLandingLivenessVerdict =
  | 'coder-running'
  | 'landed'
  | 'genuinely-not-landed'
  | 'exited-without-edits'
  | 'dead-worker'
  | 'inconclusive';

export type CodeLandingLivenessReason =
  | 'recorded-pid-alive'
  | 'recorded-pid-absent'
  | 'terminal-companion'
  | 'ceiling-exceeded'
  | 'companion-probe-error'
  | 'unparseable-companion-status'
  | 'recorded-pid-unavailable'
  | 'git-evidence-unavailable'
  | 'reported-zero-touched-files';

export interface CodeLandingLivenessInput {
  readonly companionStatus: unknown;
  readonly recordedPidAlive: boolean | null;
  readonly targetsChanged: boolean | null;
  readonly elapsedMs: number;
  readonly ceilingMs: number;
  /**
   * How many files the companion job itself REPORTED writing (`result.touchedFiles.length`), or
   * null when the record could not be read. Zero from a cleanly-terminated job is a different
   * event from "the window expired": the coder finished and wrote nothing, which is what happens
   * when it asks a question a non-interactive dispatch cannot answer. Folding the two together
   * hides the only cure that works — answer the gate and re-dispatch.
   */
  readonly reportedTouchedFiles?: number | null;
}

export interface CodeLandingLivenessDecision {
  readonly verdict: CodeLandingLivenessVerdict;
  readonly reason: CodeLandingLivenessReason;
}

export function decideCodeLandingLiveness(input: CodeLandingLivenessInput): CodeLandingLivenessDecision {
  const status = typeof input.companionStatus === 'string' ? input.companionStatus.trim().toLowerCase() : ''
  const elapsedMs = Number.isFinite(input.elapsedMs) ? Math.max(0, input.elapsedMs) : 0
  const ceilingMs = Number.isFinite(input.ceilingMs) && input.ceilingMs > 0 ? input.ceilingMs : DEFAULT_CODE_LANDING_CEILING_MS
  const live = status === 'running' || status === 'queued'
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled'

  if (live && input.recordedPidAlive === false) {
    return { verdict: 'dead-worker', reason: 'recorded-pid-absent' }
  }
  if (live && input.recordedPidAlive === true) {
    if (elapsedMs >= ceilingMs) return { verdict: 'inconclusive', reason: 'ceiling-exceeded' }
    return { verdict: 'coder-running', reason: 'recorded-pid-alive' }
  }
  if (live) return { verdict: 'inconclusive', reason: 'recorded-pid-unavailable' }
  if (terminal) {
    if (input.targetsChanged === true) return { verdict: 'landed', reason: 'terminal-companion' }
    if (input.targetsChanged === false) {
      if (input.reportedTouchedFiles === 0) {
        return { verdict: 'exited-without-edits', reason: 'reported-zero-touched-files' }
      }
      return { verdict: 'genuinely-not-landed', reason: 'terminal-companion' }
    }
    return { verdict: 'inconclusive', reason: 'git-evidence-unavailable' }
  }
  return {
    verdict: 'inconclusive',
    reason: status === '' ? 'companion-probe-error' : 'unparseable-companion-status',
  }
}

export function extractCodexCompanionJobId(text: unknown): string | null {
  const match = /\bstarted in the background as (task-[a-z0-9]+(?:-[a-z0-9]+)*)\b/i.exec(String(text ?? ''));
  return match && match[1] ? match[1] : null;
}

export interface CodeLandingLivenessProbe {
  readonly companionStatus: string;
  readonly recordedPidAlive: boolean | null;
  readonly targetsChanged: boolean | null;
  readonly elapsedMs: number;
  readonly ceilingMs: number;
  readonly startMs: number;
  readonly reportedTouchedFiles: number | null;
}

export function parseCodeLandingLivenessSignal(text: unknown): CodeLandingLivenessProbe | null {
  const source = String(text ?? '');
  // touched-files is OPTIONAL in the grammar: an older probe, or a state record we could not read,
  // simply omits it and the field stays null — which keeps the verdict at genuinely-not-landed
  // rather than inventing a clean exit. Absence is never evidence here.
  const match = /^CODEX-LIVENESS-SIGNAL companion=([a-z-]+) pid-alive=(true|false|unknown) targets-changed=(true|false|unknown) elapsed-ms=(\d+) ceiling-ms=(\d+) start-ms=(\d+)(?: touched-files=(\d+|unknown))?[ \t]*$/m.exec(source);
  if (!match) return null;
  const asTriState = (value: string): boolean | null => value === 'true' ? true : value === 'false' ? false : null;
  return {
    companionStatus: String(match[1]),
    recordedPidAlive: asTriState(String(match[2])),
    targetsChanged: asTriState(String(match[3])),
    elapsedMs: Number(match[4]),
    ceilingMs: Number(match[5]),
    startMs: Number(match[6]),
    reportedTouchedFiles: match[7] === undefined || match[7] === 'unknown' ? null : Number(match[7]),
  };
}
