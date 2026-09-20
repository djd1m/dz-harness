/**
 * The experiment envelope (ADR-001, experiment-envelope). Pure data, built ONCE per run right after
 * the Step-0 router and before Step 1, then carried unchanged into every autorow the pipeline writes
 * (the run-cost ledger, training pairs, the round state). It answers two questions the pipeline used
 * to leave unanswered: what STRATUM was this run (task kind, tier, priority) and what DECISION did
 * routing make (which arms were considered, which one was chosen, by which policy, evaluated by whom).
 *
 * D1 (ADR-001): collecting these fields per-writer let three sources disagree — `mode` and `runId`
 * already drifted across the ledger (133/343 and 34/343 respectively, MEASURED in Step 0). Building
 * the envelope once and threading the same object through every writer removes that class of drift
 * by construction.
 */

export const ENVELOPE_SCHEMA = 1 as const;

export const TASK_KINDS = ['feature', 'bugfix', 'refactor', 'tooling', 'docs', 'research'] as const;
export type TaskKind = typeof TASK_KINDS[number];

export const PRIORITIES = ['speed', 'balance', 'quality', 'unset'] as const;
export type EnvelopePriority = typeof PRIORITIES[number];

export const TIERS = ['S', 'M', 'L', 'XL'] as const;
export type EnvelopeTier = typeof TIERS[number];

export interface ExperimentEnvelopeArms {
  readonly mode: readonly string[];
  readonly stages: Readonly<Record<string, readonly string[]>>;
}

export interface ExperimentEnvelopeChosen {
  readonly mode: string;
  readonly stages: Readonly<Record<string, string>>;
  /** Lead delta after Codex r2 (HIGH): a stage whose chosen spec was NOT among the offered arms
   * (usage-override, session-inherited fallback) is recorded HERE explicitly — arms stay the set that
   * was actually offered; the winner is never appended to them after the fact. */
  readonly overrides?: Readonly<Record<string, string>>;
  /**
   * ablation-c-start (ADR-001, T3; fix-round-1 BLOCKER #2): the pre-registered ablation-C arm
   * (`direct` | `reference`) for THIS run, filled only when `args.experiment`/`args.taskId` were
   * given AND the workflow successfully RESOLVED an existing assignment for that task via
   * `dz experiment resolve` — never taken from a caller-supplied arm option (that was the BLOCKER
   * fix-round-1 found: a caller could set the arm to anything, with zero journal entry). Deliberately
   * a SEPARATE field from `mode` — `mode` already means "same-family vs cross-family reviewer" (a
   * different axis) — so setting `qeMode` never redefines what `mode` has always meant. Absent (not
   * `null`) when no arm was resolved, so `JSON.stringify` drops the key and an unflagged run's
   * envelope stays byte-identical to before this feature (NFR-2).
   */
  readonly qeMode?: string;
}

export interface ExperimentEnvelopePolicy {
  readonly name: string;
  readonly version: string;
  readonly propensity: number | null;
}

export interface ExperimentEnvelopeEvaluator {
  readonly family: 'claude' | 'codex' | null;
  readonly model: string | null;
  readonly source: 'planned' | 'actual';
}

export interface ExperimentEnvelope {
  readonly schema: 1;
  readonly runId: string;
  /**
   * fix-round-1/F4: `null` when the persistent `.fa-state/attempt` counter probe failed — never a
   * fabricated guess (the old `resumedStages.length > 0 ? 2 : 1` heuristic silently reported "2" for
   * every third-and-later retry). Mirrors the `treeSha`/`treeShaReason` null+reason shape below.
   */
  readonly attempt: number | null;
  /** Required (non-empty) exactly when `attempt` is null; null whenever `attempt` is a real count. */
  readonly attemptReason: string | null;
  readonly taskKind: TaskKind;
  readonly tier: EnvelopeTier;
  readonly priority: EnvelopePriority;
  readonly treeSha: string | null;
  readonly treeShaReason: string | null;
  readonly arms: ExperimentEnvelopeArms;
  readonly chosen: ExperimentEnvelopeChosen;
  readonly policy: ExperimentEnvelopePolicy;
  readonly evaluator: ExperimentEnvelopeEvaluator;
}

export interface BuildExperimentEnvelopeInput {
  readonly runId: string;
  readonly attempt: number | null;
  readonly attemptReason?: string | null;
  readonly taskKind: TaskKind;
  readonly tier: EnvelopeTier;
  readonly priority: EnvelopePriority;
  readonly treeSha: string | null;
  readonly treeShaReason?: string | null;
  readonly arms: ExperimentEnvelopeArms;
  readonly chosen: ExperimentEnvelopeChosen;
  readonly policy: ExperimentEnvelopePolicy;
  readonly evaluator: ExperimentEnvelopeEvaluator;
}

/**
 * Assembles the normalized envelope object from already-resolved inputs. This function does not
 * derive routing decisions itself (the caller — the Step-0-adjacent block in the workflow — resolves
 * `arms`/`chosen`/`evaluator` from the routing tables); it only shapes the result consistently and
 * fills the one field that has a computed default: `treeShaReason` is populated only when `treeSha`
 * is null, and cleared when it is not.
 */
export function buildExperimentEnvelope(input: BuildExperimentEnvelopeInput): ExperimentEnvelope {
  return {
    schema: ENVELOPE_SCHEMA,
    runId: input.runId,
    attempt: input.attempt,
    attemptReason: input.attempt === null ? (input.attemptReason ?? 'unavailable') : null,
    taskKind: input.taskKind,
    tier: input.tier,
    priority: input.priority,
    treeSha: input.treeSha,
    treeShaReason: input.treeSha === null ? (input.treeShaReason ?? 'unavailable') : null,
    arms: { mode: [...input.arms.mode], stages: { ...input.arms.stages } },
    chosen: {
      mode: input.chosen.mode,
      stages: { ...input.chosen.stages },
      overrides: { ...(input.chosen.overrides ?? {}) },
      ...(input.chosen.qeMode !== undefined ? { qeMode: input.chosen.qeMode } : {}),
    },
    policy: { ...input.policy },
    evaluator: { ...input.evaluator },
  };
}

const HEX40 = /^[0-9a-f]{40}$/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Validates an envelope value field by field, IN ORDER, and returns the FIRST invalid field by name
 * (never a batch of errors — the refusal channel this feeds, `run-records.ts` FR-5, prints one reason
 * line and that line must name something actionable).
 */
export function validateExperimentEnvelope(value: unknown): { ok: true } | { ok: false; reason: string } {
  if (!isPlainObject(value)) return { ok: false, reason: 'envelope: expected an object' };
  const v = value;

  if (v.schema !== ENVELOPE_SCHEMA) {
    return { ok: false, reason: `schema: expected ${ENVELOPE_SCHEMA}, got ${JSON.stringify(v.schema)}` };
  }
  if (!isNonEmptyString(v.runId)) {
    return { ok: false, reason: 'runId: expected a non-empty string' };
  }
  if (v.attempt !== null) {
    if (typeof v.attempt !== 'number' || !Number.isInteger(v.attempt) || v.attempt < 1) {
      return { ok: false, reason: 'attempt: expected an integer >= 1 or null' };
    }
  } else if (!isNonEmptyString(v.attemptReason)) {
    return { ok: false, reason: 'attemptReason: required (non-empty) when attempt is null' };
  }
  if (typeof v.taskKind !== 'string' || !(TASK_KINDS as readonly string[]).includes(v.taskKind)) {
    return { ok: false, reason: `taskKind: expected one of ${TASK_KINDS.join('|')}, got ${JSON.stringify(v.taskKind)}` };
  }
  if (typeof v.tier !== 'string' || !(TIERS as readonly string[]).includes(v.tier)) {
    return { ok: false, reason: `tier: expected one of ${TIERS.join('|')}, got ${JSON.stringify(v.tier)}` };
  }
  if (typeof v.priority !== 'string' || !(PRIORITIES as readonly string[]).includes(v.priority)) {
    return { ok: false, reason: `priority: expected one of ${PRIORITIES.join('|')}, got ${JSON.stringify(v.priority)}` };
  }
  if (v.treeSha !== null) {
    if (typeof v.treeSha !== 'string' || !HEX40.test(v.treeSha)) {
      return { ok: false, reason: 'treeSha: expected 40 hex chars or null' };
    }
  } else if (!isNonEmptyString(v.treeShaReason)) {
    return { ok: false, reason: 'treeShaReason: required (non-empty) when treeSha is null' };
  }

  if (!isPlainObject(v.arms)) return { ok: false, reason: 'arms: expected an object' };
  const arms = v.arms;
  if (!Array.isArray(arms.mode) || arms.mode.length === 0 || !arms.mode.every((m) => isNonEmptyString(m))) {
    return { ok: false, reason: 'arms.mode: expected a non-empty array of non-empty strings' };
  }
  const armsMode = arms.mode as readonly string[];
  if (!isPlainObject(arms.stages)) return { ok: false, reason: 'arms.stages: expected an object' };
  const armsStageEntries = Object.entries(arms.stages);
  if (armsStageEntries.length === 0) return { ok: false, reason: 'arms.stages: expected at least one stage' };
  for (const [stage, specs] of armsStageEntries) {
    // F7: an empty stage NAME (a real, if odd, JS object key) is refused too — a stage nobody can
    // name is a stage nobody can dispatch to member-check against.
    if (stage.trim() === '') return { ok: false, reason: 'arms.stages: stage name must not be empty' };
    if (!Array.isArray(specs) || specs.length === 0 || !specs.every((s) => isNonEmptyString(s))) {
      return { ok: false, reason: `arms.stages.${stage}: expected a non-empty array of non-empty strings` };
    }
  }

  if (!isPlainObject(v.chosen)) return { ok: false, reason: 'chosen: expected an object' };
  const chosen = v.chosen;
  if (!isNonEmptyString(chosen.mode)) return { ok: false, reason: 'chosen.mode: expected a non-empty string' };
  // F7 (fix-round-1): a valid-SHAPED row can still describe an IMPOSSIBLE decision — `chosen.mode`
  // naming an option `arms.mode` never offered, or a stage's chosen spec absent from what that
  // stage's own arms offered. Membership is checked AFTER shape, so a shape error is still reported
  // first (the more actionable message).
  if (!armsMode.includes(chosen.mode)) {
    return { ok: false, reason: `chosen.mode: "${chosen.mode}" is not a member of arms.mode (${armsMode.join('|')})` };
  }
  if (!isPlainObject(chosen.stages)) return { ok: false, reason: 'chosen.stages: expected an object' };
  const chosenStageEntries = Object.entries(chosen.stages);
  if (chosenStageEntries.length === 0) return { ok: false, reason: 'chosen.stages: expected at least one stage' };
  for (const [stage, spec] of chosenStageEntries) {
    if (stage.trim() === '') return { ok: false, reason: 'chosen.stages: stage name must not be empty' };
    if (!isNonEmptyString(spec)) return { ok: false, reason: `chosen.stages.${stage}: expected a non-empty string` };
  }
  const armsStageNames = new Set(Object.keys(arms.stages as Record<string, unknown>));
  const chosenStageNames = new Set(Object.keys(chosen.stages as Record<string, unknown>));
  if (armsStageNames.size !== chosenStageNames.size || ![...armsStageNames].every((s) => chosenStageNames.has(s))) {
    return { ok: false, reason: 'chosen.stages: stage set disagrees with arms.stages' };
  }
  const armsStages = arms.stages as Record<string, readonly string[]>;
  // Lead delta after Codex r2 (HIGH): arms are IMMUTABLE — the offered set. A chosen spec outside it is
  // legal only when `chosen.overrides` names that stage with the SAME spec (an explicit, auditable
  // "chosen outside the offered arms"), never by appending the winner to arms after the fact.
  const overridesRaw = chosen.overrides === undefined ? {} : chosen.overrides;
  if (!isPlainObject(overridesRaw)) return { ok: false, reason: 'chosen.overrides: expected an object when present' };
  const overrides = overridesRaw as Record<string, unknown>;
  for (const [stage, spec] of Object.entries(overrides)) {
    if (!(stage in (chosen.stages as Record<string, unknown>))) return { ok: false, reason: `chosen.overrides.${stage}: names a stage absent from chosen.stages` };
    if (!isNonEmptyString(spec)) return { ok: false, reason: `chosen.overrides.${stage}: expected a non-empty string` };
    if ((chosen.stages as Record<string, unknown>)[stage] !== spec) return { ok: false, reason: `chosen.overrides.${stage}: "${String(spec)}" disagrees with chosen.stages.${stage}` };
  }
  for (const [stage, spec] of chosenStageEntries) {
    const offered = armsStages[stage]!;
    if (!offered.includes(spec as string) && overrides[stage] !== spec) {
      return { ok: false, reason: `chosen.stages.${stage}: "${String(spec)}" is not a member of arms.stages.${stage} (${offered.join('|')}) and not declared in chosen.overrides` };
    }
  }
  // ablation-c-start (ADR-001, T3): qeMode is OPTIONAL — absent on every run this feature does not
  // touch — but when present must be a non-empty string, same shape rule as every other envelope
  // field (never a silently-accepted empty label).
  if (chosen.qeMode !== undefined && !isNonEmptyString(chosen.qeMode)) {
    return { ok: false, reason: 'chosen.qeMode: expected a non-empty string when present' };
  }

  if (!isPlainObject(v.policy)) return { ok: false, reason: 'policy: expected an object' };
  const policy = v.policy;
  if (!isNonEmptyString(policy.name)) return { ok: false, reason: 'policy.name: expected a non-empty string' };
  if (!isNonEmptyString(policy.version)) return { ok: false, reason: 'policy.version: expected a non-empty string' };
  if (policy.propensity !== null && typeof policy.propensity !== 'number') {
    return { ok: false, reason: 'policy.propensity: expected a number or null' };
  }

  if (!isPlainObject(v.evaluator)) return { ok: false, reason: 'evaluator: expected an object' };
  const evaluator = v.evaluator;
  if (evaluator.family !== null && evaluator.family !== 'claude' && evaluator.family !== 'codex') {
    return { ok: false, reason: 'evaluator.family: expected claude, codex, or null' };
  }
  if (evaluator.model !== null && typeof evaluator.model !== 'string') {
    return { ok: false, reason: 'evaluator.model: expected a string or null' };
  }
  if (evaluator.source !== 'planned' && evaluator.source !== 'actual') {
    return { ok: false, reason: 'evaluator.source: expected planned or actual' };
  }

  return { ok: true };
}
