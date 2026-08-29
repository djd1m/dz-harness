/**
 * Deterministic, advisory-only policy for recognising a trailing low-grade QE streak.
 *
 * This module is intentionally value-in/value-out. The CLI owns filesystem reads, path confinement,
 * defaults, and presentation; the core owns parsing, corroboration, policy, and the decision record.
 */

export const RESTART_ADVISOR_SCHEMA = 'restart-advisor/1' as const;
export const RESTART_ADVISOR_MAX_EVIDENCE = 20;
export const RESTART_ADVISOR_MAX_DIAGNOSTICS = 20;

export type RestartGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type RestartThreshold = 'C' | 'D';
export type RestartSource = 'checkpoints' | 'training-pairs' | 'none';
export type RestartPolicyOrigin = 'default' | 'flag' | 'caller';
export type RestartRecommendation =
  | 'RESTART_CODE_STAGE'
  | 'NO_RESTART_RECOMMENDATION'
  | 'NOT_ESTABLISHED'
  | 'INVALID_INPUT';
export type RestartReason =
  | 'TRAILING_STREAK_AT_OR_BELOW_THRESHOLD'
  | 'TRAILING_STREAK_INTERRUPTED'
  | 'INSUFFICIENT_TRAILING_EVIDENCE'
  | 'OPAQUE_TRAILING_EVIDENCE'
  | 'ROUND_GAP'
  | 'NO_QE_HISTORY'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_EVIDENCE_INVALID'
  | 'POLICY_INVALID'
  | 'INPUT_INVALID';

export interface RestartNormalizedRound {
  readonly round: number;
  readonly line: number;
  readonly grade: RestartGrade | null;
  readonly problem: 'UNSUPPORTED_GRADE' | 'MALFORMED_JSON' | 'INVALID_RECORD' | null;
}

export interface ParsedRestartHistory {
  readonly source: Exclude<RestartSource, 'none'>;
  readonly present: boolean;
  readonly recordsRead: number;
  readonly qeCandidates: number;
  readonly identityMode: 'none' | 'explicit' | 'implicit' | 'mixed';
  readonly rounds: readonly RestartNormalizedRound[];
  readonly diagnostics: readonly string[];
  readonly fatal: boolean;
}

export interface RestartDecisionInput {
  readonly history: readonly RestartNormalizedRound[];
  readonly threshold?: RestartThreshold;
  readonly rounds?: number;
}

export interface RestartDecision {
  readonly recommendation: RestartRecommendation;
  readonly recommendRestart: boolean;
  readonly autoAction: false;
  readonly trailingAtOrBelow: number;
  readonly reason: RestartReason;
  readonly evidence: readonly RestartNormalizedRound[];
}

export interface RestartAdvisorInput {
  readonly slug: string;
  readonly checkpointsJsonl?: string | null;
  readonly trainingPairsJsonl?: string | null;
  /** I/O boundary failures already converted to deterministic, operator-visible diagnostics. */
  readonly readDiagnostics?: readonly string[];
  /** CLI/input-boundary refusals that must remain one versioned INVALID_INPUT result. */
  readonly inputErrors?: readonly string[];
}

export interface RestartAdvisorPolicy {
  readonly threshold?: RestartThreshold;
  readonly rounds?: number;
  readonly thresholdOrigin?: RestartPolicyOrigin;
  readonly roundsOrigin?: RestartPolicyOrigin;
}

export interface RestartAdvice {
  readonly schema: typeof RESTART_ADVISOR_SCHEMA;
  readonly slug: string;
  readonly source: RestartSource;
  readonly sourcePath: string | null;
  readonly inspectedPaths: readonly string[];
  readonly corroborated: boolean;
  readonly policy: {
    readonly threshold: RestartThreshold | null;
    readonly thresholdOrigin: RestartPolicyOrigin;
    readonly rounds: number | null;
    readonly roundsOrigin: RestartPolicyOrigin;
  };
  readonly counts: {
    readonly recordsRead: number;
    readonly qeCandidates: number;
    readonly normalizedRounds: number;
    readonly trailingAtOrBelow: number;
  };
  readonly evidence: readonly RestartNormalizedRound[];
  readonly evidenceSummary: { readonly total: number; readonly returned: number; readonly truncated: boolean };
  readonly diagnostics: readonly string[];
  readonly diagnosticsSummary: { readonly total: number; readonly returned: number; readonly truncated: boolean };
  readonly recommendation: RestartRecommendation;
  readonly recommendRestart: boolean;
  readonly autoAction: false;
  readonly trailingAtOrBelow: number;
  readonly reason: RestartReason;
  readonly decisionLogLine: string;
}

type SourceKind = Exclude<RestartSource, 'none'>;

interface CandidateRound {
  readonly line: number;
  readonly fingerprint: string;
  readonly explicitIdentity: boolean;
  readonly explicitRound: number | null;
  readonly grade: RestartGrade | null;
  readonly problem: RestartNormalizedRound['problem'];
}

const GRADES = new Set<RestartGrade>(['A', 'B', 'C', 'D', 'F']);
const GRADE_RANK: Readonly<Record<RestartGrade, number>> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalGrade(value: unknown): RestartGrade | null {
  return typeof value === 'string' && GRADES.has(value as RestartGrade)
    ? value as RestartGrade
    : null;
}

function boundedValue(value: unknown): string {
  let rendered: string;
  try { rendered = JSON.stringify(value); } catch { rendered = String(value); }
  if (rendered === undefined) rendered = String(value);
  return rendered.length <= 120 ? rendered : `${rendered.slice(0, 117)}...`;
}

function nestedRecord(source: SourceKind, record: Record<string, unknown>): Record<string, unknown> | null {
  if (source === 'training-pairs') return isRecord(record.evaluation) ? record.evaluation : null;
  const result = isRecord(record.result) ? record.result : null;
  return result !== null && isRecord(result.qe) ? result.qe : null;
}

function roundIdentity(
  record: Record<string, unknown>,
  nested: Record<string, unknown> | null,
): { explicit: false; round: null; fatal: false; diagnostic: null }
  | { explicit: true; round: number | null; fatal: boolean; diagnostic: string | null } {
  const values: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(record, 'round')) values.push(record.round);
  if (nested !== null && Object.prototype.hasOwnProperty.call(nested, 'round')) values.push(nested.round);
  if (values.length === 0) return { explicit: false, round: null, fatal: false, diagnostic: null };
  if (!values.every((value) => Number.isInteger(value) && (value as number) > 0)) {
    return {
      explicit: true,
      round: null,
      fatal: true,
      diagnostic: `invalid explicit round identity ${values.map(boundedValue).join(' / ')}`,
    };
  }
  const distinct = [...new Set(values as number[])];
  if (distinct.length !== 1) {
    return {
      explicit: true,
      round: null,
      fatal: true,
      diagnostic: `conflicting explicit round identities ${distinct.join(' / ')}`,
    };
  }
  return { explicit: true, round: distinct[0]!, fatal: false, diagnostic: null };
}

function parseHistory(jsonl: string | null | undefined, source: SourceKind): ParsedRestartHistory {
  const present = jsonl !== null && jsonl !== undefined;
  if (!present || jsonl === '') {
    return {
      source, present, recordsRead: 0, qeCandidates: 0, identityMode: 'none',
      rounds: [], diagnostics: [], fatal: false,
    };
  }

  const candidates: CandidateRound[] = [];
  const diagnostics: string[] = [];
  let recordsRead = 0;
  let qeCandidates = 0;
  let fatal = false;
  const lines = jsonl.split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    let physical = lines[index]!.replace(/\r$/, '');
    if (index === 0) physical = physical.replace(/^\uFEFF/, '');
    if (physical.trim() === '') continue;
    recordsRead += 1;
    const line = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(physical);
    } catch (error) {
      diagnostics.push(`${source} line ${line}: malformed JSON (${(error as Error).message})`);
      candidates.push({
        line, fingerprint: physical, explicitIdentity: false, explicitRound: null,
        grade: null, problem: 'MALFORMED_JSON',
      });
      continue;
    }
    if (!isRecord(parsed)) {
      diagnostics.push(`${source} line ${line}: JSON record is not an object`);
      candidates.push({
        line, fingerprint: physical, explicitIdentity: false, explicitRound: null,
        grade: null, problem: 'INVALID_RECORD',
      });
      continue;
    }
    if (parsed.stage !== 'qe') continue;
    qeCandidates += 1;

    const nested = nestedRecord(source, parsed);
    const identity = roundIdentity(parsed, nested);
    if (identity.fatal) {
      fatal = true;
      diagnostics.push(`${source} line ${line}: ${identity.diagnostic}`);
    }
    const rawGrade = nested?.grade;
    const grade = canonicalGrade(rawGrade);
    const problem = grade === null ? 'UNSUPPORTED_GRADE' as const : null;
    if (problem !== null) {
      diagnostics.push(`${source} line ${line}: unsupported grade ${boundedValue(rawGrade)}; expected A|B|C|D|F`);
    }
    candidates.push({
      line,
      fingerprint: physical,
      explicitIdentity: identity.explicit,
      explicitRound: identity.round,
      grade,
      problem,
    });
  }

  const identityCandidates = candidates.filter((candidate) =>
    candidate.problem !== 'MALFORMED_JSON' && candidate.problem !== 'INVALID_RECORD');
  const explicitCount = identityCandidates.filter((candidate) => candidate.explicitIdentity).length;
  const implicitCount = identityCandidates.length - explicitCount;
  const identityMode: ParsedRestartHistory['identityMode'] = candidates.length === 0
    ? 'none'
    : identityCandidates.length === 0
      ? 'implicit'
      : explicitCount === identityCandidates.length
      ? 'explicit'
      : implicitCount === identityCandidates.length
        ? 'implicit'
        : 'mixed';
  if (identityMode === 'mixed') {
    fatal = true;
    diagnostics.push(`${source}: mixed explicit and implicit round identities are ambiguous`);
  }
  if (identityMode === 'explicit' && identityCandidates.length !== candidates.length) {
    fatal = true;
    diagnostics.push(`${source}: malformed records cannot be placed among explicit round identities`);
  }

  const rounds: RestartNormalizedRound[] = [];
  if (identityMode === 'implicit') {
    let priorFingerprint: string | null = null;
    for (const candidate of candidates) {
      if (candidate.fingerprint === priorFingerprint) continue;
      priorFingerprint = candidate.fingerprint;
      rounds.push({ round: rounds.length + 1, line: candidate.line, grade: candidate.grade, problem: candidate.problem });
    }
  } else if (identityMode === 'explicit') {
    const byRound = new Map<number, RestartNormalizedRound>();
    for (const candidate of candidates) {
      if (candidate.explicitRound === null) continue;
      const next: RestartNormalizedRound = {
        round: candidate.explicitRound,
        line: candidate.line,
        grade: candidate.grade,
        problem: candidate.problem,
      };
      const prior = byRound.get(candidate.explicitRound);
      if (prior === undefined) {
        byRound.set(candidate.explicitRound, next);
      } else if (prior.grade !== next.grade || prior.problem !== next.problem) {
        fatal = true;
        diagnostics.push(
          `${source}: conflicting duplicate round ${candidate.explicitRound} at lines ${prior.line} and ${next.line}`,
        );
      }
    }
    rounds.push(...[...byRound.values()].sort((left, right) => left.round - right.round));
  }

  return {
    source,
    present,
    recordsRead,
    qeCandidates,
    identityMode,
    rounds,
    diagnostics,
    fatal,
  };
}

export function parseCheckpointQeHistory(jsonl: string | null | undefined): ParsedRestartHistory {
  return parseHistory(jsonl, 'checkpoints');
}

export function parseTrainingPairQeHistory(jsonl: string | null | undefined): ParsedRestartHistory {
  return parseHistory(jsonl, 'training-pairs');
}

function boundedEvidence(history: readonly RestartNormalizedRound[]): readonly RestartNormalizedRound[] {
  return history.slice(-RESTART_ADVISOR_MAX_EVIDENCE).map((round) => ({ ...round }));
}

function invalidDecision(history: readonly RestartNormalizedRound[]): RestartDecision {
  return {
    recommendation: 'INVALID_INPUT',
    recommendRestart: false,
    autoAction: false,
    trailingAtOrBelow: 0,
    reason: 'POLICY_INVALID',
    evidence: boundedEvidence(history),
  };
}

export function decideRestartRecommendation(input: RestartDecisionInput): RestartDecision {
  const { history, threshold, rounds } = input;
  if ((threshold !== 'C' && threshold !== 'D')
    || !Number.isFinite(rounds)
    || !Number.isInteger(rounds)
    || (rounds ?? 0) < 1) {
    return invalidDecision(history);
  }
  const requiredRounds = rounds as number;
  for (let index = 0; index < history.length; index += 1) {
    const current = history[index]!;
    if (!Number.isInteger(current.round) || current.round < 1
      || (index > 0 && current.round <= history[index - 1]!.round)) {
      return invalidDecision(history);
    }
  }
  if (history.length === 0) {
    return {
      recommendation: 'NOT_ESTABLISHED', recommendRestart: false, autoAction: false,
      trailingAtOrBelow: 0, reason: 'NO_QE_HISTORY', evidence: [],
    };
  }

  let trailing = 0;
  let expectedRound = history[history.length - 1]!.round;
  let boundary: 'better' | 'opaque' | 'gap' | 'start' = 'start';
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const current = history[index]!;
    if (current.round !== expectedRound) { boundary = 'gap'; break; }
    if (current.grade === null || current.problem !== null) { boundary = 'opaque'; break; }
    if (GRADE_RANK[current.grade] > GRADE_RANK[threshold]) { boundary = 'better'; break; }
    trailing += 1;
    expectedRound -= 1;
  }

  const evidence = boundedEvidence(history);
  if (trailing >= requiredRounds) {
    return {
      recommendation: 'RESTART_CODE_STAGE', recommendRestart: true, autoAction: false,
      trailingAtOrBelow: trailing, reason: 'TRAILING_STREAK_AT_OR_BELOW_THRESHOLD', evidence,
    };
  }
  if (boundary === 'better') {
    return {
      recommendation: 'NO_RESTART_RECOMMENDATION', recommendRestart: false, autoAction: false,
      trailingAtOrBelow: trailing, reason: 'TRAILING_STREAK_INTERRUPTED', evidence,
    };
  }
  return {
    recommendation: 'NOT_ESTABLISHED', recommendRestart: false, autoAction: false,
    trailingAtOrBelow: trailing,
    reason: boundary === 'gap'
      ? 'ROUND_GAP'
      : boundary === 'opaque'
        ? 'OPAQUE_TRAILING_EVIDENCE'
        : 'INSUFFICIENT_TRAILING_EVIDENCE',
    evidence,
  };
}

function sameNormalizedHistory(left: ParsedRestartHistory, right: ParsedRestartHistory): boolean {
  if (left.rounds.length !== right.rounds.length) return false;
  return left.rounds.every((round, index) => {
    const other = right.rounds[index];
    return other !== undefined
      && round.round === other.round
      && round.grade === other.grade
      && round.problem === other.problem;
  });
}

function sourcePath(slug: string, source: RestartSource): string | null {
  if (source === 'checkpoints') return `features/${slug}/.fa-state/checkpoints.jsonl`;
  if (source === 'training-pairs') return `.dz/fa-training/${slug}/qe.jsonl`;
  return null;
}

interface AdviceAssembly {
  readonly source: RestartSource;
  readonly selected: ParsedRestartHistory | null;
  readonly corroborated: boolean;
  readonly decision: RestartDecision;
  readonly diagnostics: readonly string[];
}

function assembleAdvice(
  checkpoints: ParsedRestartHistory,
  trainingPairs: ParsedRestartHistory,
  readDiagnostics: readonly string[],
  decisionInput: Omit<RestartDecisionInput, 'history'>,
): AdviceAssembly {
  const diagnostics = [...readDiagnostics, ...checkpoints.diagnostics, ...trainingPairs.diagnostics];
  if (readDiagnostics.length > 0 || checkpoints.fatal || trainingPairs.fatal) {
    return {
      source: 'none', selected: null, corroborated: false, diagnostics,
      decision: {
        recommendation: 'NOT_ESTABLISHED', recommendRestart: false, autoAction: false,
        trailingAtOrBelow: 0, reason: 'SOURCE_EVIDENCE_INVALID', evidence: [],
      },
    };
  }

  const checkpointHasHistory = checkpoints.qeCandidates > 0;
  const trainingHasHistory = trainingPairs.qeCandidates > 0;
  if (!checkpointHasHistory && !trainingHasHistory) {
    return {
      source: 'none', selected: null, corroborated: false, diagnostics,
      decision: decideRestartRecommendation({ history: [], ...decisionInput }),
    };
  }
  if (checkpointHasHistory && trainingHasHistory && !sameNormalizedHistory(checkpoints, trainingPairs)) {
    diagnostics.push('checkpoint and training-pair histories do not normalize to the same rounds; refusing to union them');
    return {
      source: 'none', selected: null, corroborated: false, diagnostics,
      decision: {
        recommendation: 'NOT_ESTABLISHED', recommendRestart: false, autoAction: false,
        trailingAtOrBelow: 0, reason: 'SOURCE_CONFLICT', evidence: [],
      },
    };
  }

  const selected = checkpointHasHistory ? checkpoints : trainingPairs;
  return {
    source: selected.source,
    selected,
    corroborated: checkpointHasHistory && trainingHasHistory,
    diagnostics,
    decision: decideRestartRecommendation({ history: selected.rounds, ...decisionInput }),
  };
}

function decisionLogPayload(advice: RestartAdvice): Record<string, unknown> {
  return {
    slug: advice.slug,
    recommendation: advice.recommendation,
    autoAction: false,
    threshold: advice.policy.threshold,
    thresholdOrigin: advice.policy.thresholdOrigin,
    rounds: advice.policy.rounds,
    roundsOrigin: advice.policy.roundsOrigin,
    trailingAtOrBelow: advice.trailingAtOrBelow,
    source: advice.sourcePath ?? 'none',
    evidence: advice.evidence.map((round) => ({
      round: round.round,
      grade: round.grade,
      ...(round.problem === null ? {} : { problem: round.problem }),
    })),
    diagnostics: advice.diagnosticsSummary.total,
    reason: advice.reason,
  };
}

export function renderRestartDecisionLog(advice: RestartAdvice): string {
  return `restart-advisor decision ${JSON.stringify(decisionLogPayload(advice))}`;
}

export function adviseRestart(input: RestartAdvisorInput, policy: RestartAdvisorPolicy = {}): RestartAdvice {
  const checkpoints = parseCheckpointQeHistory(input.checkpointsJsonl);
  const trainingPairs = parseTrainingPairQeHistory(input.trainingPairsJsonl);
  const threshold = policy.threshold === 'C' || policy.threshold === 'D' ? policy.threshold : null;
  const validRounds = Number.isFinite(policy.rounds) && Number.isInteger(policy.rounds) && (policy.rounds ?? 0) > 0
    ? policy.rounds as number
    : null;
  const thresholdOrigin = policy.thresholdOrigin ?? 'caller';
  const roundsOrigin = policy.roundsOrigin ?? 'caller';
  const inspectedPaths = [
    `features/${input.slug}/.fa-state/checkpoints.jsonl`,
    `.dz/fa-training/${input.slug}/qe.jsonl`,
  ];

  let assembly: AdviceAssembly;
  if ((input.inputErrors?.length ?? 0) > 0) {
    assembly = {
      source: 'none', selected: null, corroborated: false,
      diagnostics: [...(input.inputErrors ?? [])],
      decision: {
        recommendation: 'INVALID_INPUT', recommendRestart: false, autoAction: false,
        trailingAtOrBelow: 0, reason: 'INPUT_INVALID', evidence: [],
      },
    };
  } else if (input.slug.trim() === '') {
    assembly = {
      source: 'none', selected: null, corroborated: false,
      diagnostics: ['slug must be a non-empty string'],
      decision: {
        recommendation: 'INVALID_INPUT', recommendRestart: false, autoAction: false,
        trailingAtOrBelow: 0, reason: 'INPUT_INVALID', evidence: [],
      },
    };
  } else if (threshold === null || validRounds === null) {
    const invalid = decideRestartRecommendation({
      history: [],
      ...(threshold === null ? {} : { threshold }),
      ...(validRounds === null ? {} : { rounds: validRounds }),
    });
    assembly = {
      source: 'none', selected: null, corroborated: false,
      diagnostics: ['threshold must be C|D and rounds must be a positive integer; core supplies no defaults'],
      decision: invalid,
    };
  } else {
    assembly = assembleAdvice(
      checkpoints,
      trainingPairs,
      input.readDiagnostics ?? [],
      { threshold, rounds: validRounds },
    );
  }

  const selected = assembly.selected;
  const evidence = assembly.decision.evidence;
  const boundedDiagnostics = assembly.diagnostics.slice(0, RESTART_ADVISOR_MAX_DIAGNOSTICS);
  const base = {
    schema: RESTART_ADVISOR_SCHEMA,
    slug: input.slug,
    source: assembly.source,
    sourcePath: sourcePath(input.slug, assembly.source),
    inspectedPaths,
    corroborated: assembly.corroborated,
    policy: { threshold, thresholdOrigin, rounds: validRounds, roundsOrigin },
    counts: {
      recordsRead: selected?.recordsRead ?? checkpoints.recordsRead + trainingPairs.recordsRead,
      qeCandidates: selected?.qeCandidates ?? checkpoints.qeCandidates + trainingPairs.qeCandidates,
      normalizedRounds: selected?.rounds.length ?? 0,
      trailingAtOrBelow: assembly.decision.trailingAtOrBelow,
    },
    evidence,
    evidenceSummary: {
      total: selected?.rounds.length ?? evidence.length,
      returned: evidence.length,
      truncated: (selected?.rounds.length ?? evidence.length) > evidence.length,
    },
    diagnostics: boundedDiagnostics,
    diagnosticsSummary: {
      total: assembly.diagnostics.length,
      returned: boundedDiagnostics.length,
      truncated: assembly.diagnostics.length > boundedDiagnostics.length,
    },
    recommendation: assembly.decision.recommendation,
    recommendRestart: assembly.decision.recommendRestart,
    autoAction: false as const,
    trailingAtOrBelow: assembly.decision.trailingAtOrBelow,
    reason: assembly.decision.reason,
  } satisfies Omit<RestartAdvice, 'decisionLogLine'>;
  const advice = { ...base, decisionLogLine: '' } satisfies RestartAdvice;
  return { ...advice, decisionLogLine: renderRestartDecisionLog(advice) };
}
