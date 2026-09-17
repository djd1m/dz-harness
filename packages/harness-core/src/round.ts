/**
 * A focused work round. The module owns decisions only: callers inject observed state, time,
 * lesson ids, ledger writing/reading and pid liveness. In particular, this file never imports a
 * filesystem or process API; the CLI owns `.dz/rounds/` and the witnessed ledger writer.
 */

import { validateExperimentEnvelope } from './feature-adr-envelope.js';

const ROUND_OUTCOMES = ['shipped', 'refuted', 'blocked', 'abandoned'] as const;
type RoundOutcome = typeof ROUND_OUTCOMES[number];

export interface RoundState {
  readonly slug: string;
  readonly round: number;
  readonly topic: string;
  readonly startedAt: string;
  readonly pid: number;
  readonly ownerKind: 'explicit' | 'parent' | 'exec' | 'run';
  readonly ownerRun?: string;
  readonly run?: string;
  readonly recalled: readonly string[];
  readonly execs?: readonly RoundExecState[];
  /** experiment-envelope FR-3(в): the envelope the pipeline built after its Step-0 router, carried
   * unchanged through `round open --envelope` into `closeRound`'s ledger row. Opaque here (never
   * interpreted by round.ts) — validated once, at `openRound`, and trusted from then on. */
  readonly envelope?: unknown;
}

export interface RoundExecState {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly exitCode: number | null;
  readonly outcome: import('./round-exec.js').RoundExecOutcome;
  readonly tokens: number | null;
}

/** Additive row shape accepted by the existing run-cost ledger readers. */
export interface RoundLedgerRow {
  readonly slug: string;
  readonly stage: 'round';
  readonly tier: null;
  readonly coder: string | null;
  readonly reviewer: string | null;
  readonly lead: null;
  readonly minutes: number | null;
  readonly agents: number | null;
  readonly tokens: number | null;
  /** measurement-integrity FR-7: was always `null` before this feature — `shipped|refuted` now
   *  requires a real grade; `blocked|abandoned` still writes `null` (a review that never finished has
   *  nothing to grade). */
  readonly grade: string | null;
  readonly outcome: RoundOutcome;
  readonly reason: string | null;
  readonly round: number;
  readonly lessons: readonly string[];
  readonly noNewKnowledge: string | null;
  readonly note: string;
  readonly date: null;
  readonly costIn?: 'stages';
  /** experiment-envelope FR-3(в): copied verbatim from the state that closed this round, when present. */
  readonly envelope?: unknown;
  /** round-state-lock (lead edit after Codex re-review): identity of the state instance this row
   * closes — lets a retried `close` detect its own earlier row regardless of the clock. */
  readonly stateId?: string;
  /** measurement-integrity FR-7: present ONLY when `reviewer` was filled from the qe-bridge sidecar
   *  (no explicit `--reviewer`) — `elapsedMs / 60000`, rounded to 1 decimal. */
  readonly reviewMinutes?: number;
  /** measurement-integrity FR-7: present ONLY alongside `reviewMinutes` — names where `reviewer` and
   *  `reviewMinutes` came from, so a reader never confuses a sidecar-sourced figure for a flag. */
  readonly reviewSource?: 'qe-bridge';
}

/**
 * measurement-integrity FR-7: the qe-bridge cross-model-review signoff for THIS round — read by the
 * CLI from `features/<slug>/.fa-state/qe-bridge/signoff-*.json`, selected by matching `slug` AND
 * falling inside THIS round's own `[startedAt, closedAt]` interval (fix-round-1/F9, Codex r1 HIGH
 * #9 — the CLI-side lookup, `findQeBridgeSignoffForRound`, is what enforces that; multiple qualifying
 * signoffs there are an AMBIGUITY refusal, never "the latest wins"), passed in here as DATA.
 * `closeRound` never opens a file.
 */
export interface RoundReviewSidecar {
  /** Who graded it — family + model, e.g. `codex:gpt-5.6-sol`. */
  readonly gradedBy: string;
  readonly elapsedMs: number;
  /** The sidecar's OWN verdict, when it carries one — checked against `--grade` for a conflict. */
  readonly grade?: string | null;
  /** measurement-integrity fix-round-1/F9: the slug this signoff was written FOR — carried through so
   *  a reader of the eventual ledger row can independently confirm it was not another slug's file. */
  readonly slug?: string;
  /** measurement-integrity fix-round-1/F9: the qe-bridge review's OWN internal run id (from the
   *  signoff filename, `signoff-<runId>.json`) — a DIFFERENT id space from `RoundState.run` (which
   *  names a feature-adr pipeline run); carried for traceability/audit, never used as a join key. */
  readonly runId?: string | null;
  /** measurement-integrity fix-round-1/F9: when this signoff was emitted — the timestamp
   *  `findQeBridgeSignoffForRound` uses to confirm it falls inside THIS round's own interval. */
  readonly emittedAt?: string;
}

type RoundRefusal = { readonly ok: false; readonly exit: 1 | 2; readonly reason: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function validSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}

function validCount(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

export function openRound(input: {
  readonly slug: string;
  readonly round: number;
  readonly topic: string;
  readonly startedAt: string;
  readonly ownerPid: number;
  readonly ownerKind: 'explicit' | 'parent' | 'run';
  readonly ownerRun?: string | undefined;
  readonly run?: string | undefined;
  readonly recalled: readonly string[];
  readonly existing: RoundState | null;
  readonly force: boolean;
  readonly existingOwnerAlive: boolean | null;
  readonly isRunAlive: (runId: string) => boolean | null;
  /** experiment-envelope FR-3(в)/AC-5: when present, validated BEFORE anything else — an invalid
   * envelope refuses the open (exit 2) with the validator's own reason, same as any other malformed
   * input to this command. Absent stays absent (round open without --envelope is unaffected). */
  readonly envelope?: unknown;
}): { readonly ok: true; readonly state: RoundState; readonly archiveExisting: boolean } | RoundRefusal {
  if (!validSlug(input.slug) || !Number.isInteger(input.round) || input.round < 1 || !nonEmpty(input.topic)) {
    return { ok: false, exit: 2, reason: 'нужны безопасный --slug, положительный --round и непустой --topic' };
  }
  if (input.envelope !== undefined) {
    const v = validateExperimentEnvelope(input.envelope);
    if (!v.ok) return { ok: false, exit: 2, reason: `--envelope invalid — ${v.reason}` };
  }
  const runOwner = input.ownerKind === 'run';
  if (!Number.isFinite(Date.parse(input.startedAt)) || !Number.isInteger(input.ownerPid)
    || (runOwner ? input.ownerPid !== 0 || !nonEmpty(input.ownerRun) : input.ownerPid < 1)
    || (!runOwner && input.ownerKind !== 'explicit' && input.ownerKind !== 'parent')) {
    return { ok: false, exit: 2, reason: 'время начала или pid круга недопустимы' };
  }
  const state: RoundState = {
    slug: input.slug,
    round: input.round,
    topic: input.topic.trim(),
    startedAt: input.startedAt,
    pid: input.ownerPid,
    ownerKind: input.ownerKind,
    ...(runOwner ? { ownerRun: input.ownerRun!.trim() } : {}),
    ...(nonEmpty(input.run) ? { run: input.run.trim() } : {}),
    recalled: [...input.recalled],
    ...(input.envelope !== undefined ? { envelope: input.envelope } : {}),
  };
  let existingOwnerAlive = input.existingOwnerAlive;
  if (input.existing?.ownerKind === 'run' && input.force) {
    try { existingOwnerAlive = nonEmpty(input.existing.ownerRun) ? input.isRunAlive(input.existing.ownerRun) : null; }
    catch { existingOwnerAlive = null; }
  }
  if (input.existing !== null && input.force && existingOwnerAlive === false) {
    return { ok: true, archiveExisting: true, state };
  }
  if (input.existing !== null && input.force) {
    return {
      ok: false,
      exit: 1,
      reason: input.existing.ownerKind === 'run'
        ? `круг открыт живым прогоном ${input.existing.ownerRun ?? 'unknown'}, --force не перезаписывает живой круг`
        : `круг открыт живым процессом ${input.existing.pid}, --force не перезаписывает живой круг`,
    };
  }
  if (input.existing !== null) return { ok: false, exit: 1, reason: 'круг уже открыт' };
  return { ok: true, archiveExisting: false, state };
}

export function closeRound(input: {
  readonly state: RoundState;
  readonly outcome: string;
  readonly reason?: string | undefined;
  readonly lessons?: readonly string[];
  readonly noNewKnowledge?: string | undefined;
  readonly tokens?: number | undefined;
  readonly agents?: number | undefined;
  readonly coder?: string | undefined;
  readonly reviewer?: string | undefined;
  readonly note?: string | undefined;
  readonly noCost?: boolean | undefined;
  readonly closedAt: string;
  readonly knownLessonIds: readonly string[];
  readonly stateId?: string | undefined;
  /** measurement-integrity FR-7: `A`, `A-`, `B+`, … — mandatory for `shipped|refuted`, a
   *  warned-and-dropped no-op for `blocked|abandoned`. */
  readonly grade?: string | undefined;
  /** measurement-integrity FR-7: the qe-bridge signoff for this slug, read by the CALLER. */
  readonly reviewSidecar?: RoundReviewSidecar | undefined;
}, io: {
  readonly writeLedger: (row: RoundLedgerRow) => unknown;
  readonly readLedgerTail: () => string;
}): { readonly ok: true; readonly row: RoundLedgerRow; readonly marker: string; readonly warnings: readonly string[] } | RoundRefusal {
  if (!(ROUND_OUTCOMES as readonly string[]).includes(input.outcome)) {
    return { ok: false, exit: 2, reason: '--outcome: shipped | refuted | blocked | abandoned' };
  }
  // fix-round-1/F6: `openRound` validated the envelope once, at open time, then trusted it verbatim
  // out of the state FILE from then on. A state file is mutable disk state between open and close —
  // corrupted or hand-edited in that window, it would ride an invalid/tampered envelope straight
  // into the ledger row. Re-validating here, right before the row is built, closes that window.
  if (input.state.envelope !== undefined) {
    const v = validateExperimentEnvelope(input.state.envelope);
    if (!v.ok) return { ok: false, exit: 2, reason: `envelope in round state invalid — ${v.reason}` };
  }
  if (!validCount(input.tokens) || !validCount(input.agents)) {
    return { ok: false, exit: 2, reason: '--tokens и --agents должны быть целыми числами не меньше нуля' };
  }
  const lessons = [...new Set(input.lessons ?? [])];
  const noNewKnowledge = input.noNewKnowledge?.trim() ?? '';
  if (lessons.length === 0 && noNewKnowledge === '') {
    return { ok: false, exit: 1, reason: 'урок не назван: передайте --lesson teach:<id> или --no-new-knowledge "<почему>"' };
  }
  if (lessons.length > 0 && noNewKnowledge !== '') {
    return { ok: false, exit: 1, reason: '--lesson и --no-new-knowledge взаимоисключающие' };
  }
  const known = new Set(input.knownLessonIds);
  const missing = lessons.find((id) => !/^teach:[a-z0-9]+$/i.test(id) || !known.has(id));
  if (missing !== undefined) return { ok: false, exit: 1, reason: `урок не найден: ${missing}` };

  // measurement-integrity FR-7 (ADR-001 D5): grade is mandatory for a FINISHED review
  // (shipped|refuted), a warned-and-dropped no-op for one that never finished (blocked|abandoned —
  // "Отвергнуто: --grade всегда обязателен — заблокированный круг оценки не имеет"). Placed AFTER
  // the outcome/envelope/tokens/lesson checks above (unchanged ordering, unchanged refusal reasons
  // for those) and BEFORE the duration/row-build below.
  const outcome = input.outcome as RoundOutcome;
  const finishedOutcome = outcome === 'shipped' || outcome === 'refuted';
  const gradeFlagRaw = nonEmpty(input.grade) ? input.grade.trim() : null;
  if (gradeFlagRaw !== null && !/^[A-F][+-]?$/.test(gradeFlagRaw)) {
    return { ok: false, exit: 2, reason: `--grade "${gradeFlagRaw}" не распознан — ожидается вид A|A-|B+|C…F` };
  }
  const warnings: string[] = [];
  // measurement-integrity fix-round-1/F10 (Codex r1 MEDIUM #10): for an UNFINISHED outcome, --grade
  // is dropped-with-warning HERE, BEFORE it is ever compared against the sidecar. The OLD ordering
  // ran the conflict check first — so `--outcome blocked --grade B` against a STALE sidecar grade
  // `A` refused outright instead of the promised warning-and-drop, because a value that was about to
  // be discarded still had to survive a conflict check on its way to being discarded. `gradeFlag` is
  // `null` for an unfinished outcome from this point on, exactly as if `--grade` had never been
  // passed — the conflict check below therefore never sees it.
  const gradeFlag = finishedOutcome ? gradeFlagRaw : null;
  if (!finishedOutcome && gradeFlagRaw !== null) {
    warnings.push(`--grade "${gradeFlagRaw}" проигнорирован: outcome=${outcome} не является завершённым ревью, оценка не пишется`);
  }
  const sidecarGrade = input.reviewSidecar !== undefined && nonEmpty(input.reviewSidecar.grade ?? undefined)
    ? (input.reviewSidecar.grade as string).trim()
    : null;
  if (gradeFlag !== null && sidecarGrade !== null && gradeFlag !== sidecarGrade) {
    return {
      ok: false,
      exit: 2,
      reason: `--grade "${gradeFlag}" конфликтует с оценкой сайдкара qe-bridge "${sidecarGrade}" для slug ${input.state.slug}`,
    };
  }
  if (finishedOutcome && gradeFlag === null) {
    return { ok: false, exit: 2, reason: `grade required for a finished review: outcome=${outcome} требует --grade <A|A-|B+|…>` };
  }
  const gradeForRow = gradeFlag;

  // reviewer/reviewMinutes/reviewSource: an explicit --reviewer always wins; the sidecar fills the
  // gap only, and only its OWN two derived fields travel with it (a flag-supplied reviewer never
  // carries a sidecar-sourced `reviewMinutes`/`reviewSource` — that would misattribute where the
  // minutes figure came from).
  let reviewer = nonEmpty(input.reviewer) ? input.reviewer.trim() : null;
  let reviewMinutes: number | null = null;
  let reviewSource: 'qe-bridge' | null = null;
  if (reviewer === null && input.reviewSidecar !== undefined && nonEmpty(input.reviewSidecar.gradedBy)) {
    reviewer = input.reviewSidecar.gradedBy.trim();
    const elapsedMs = input.reviewSidecar.elapsedMs;
    reviewMinutes = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round((elapsedMs / 60_000) * 10) / 10 : null;
    reviewSource = 'qe-bridge';
  }

  const startedMs = Date.parse(input.state.startedAt);
  const closedMs = Date.parse(input.closedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(closedMs) || closedMs < startedMs) {
    return { ok: false, exit: 1, reason: 'длительность круга не установлена: время состояния недопустимо' };
  }
  const compactTs = new Date(closedMs).toISOString().replace(/[-:.]/g, '');
  const marker = `round-${input.state.slug}-${input.state.round}-${compactTs}`;
  const note = input.note?.trim() ?? '';
  const row: RoundLedgerRow = {
    slug: input.state.slug,
    stage: 'round',
    tier: null,
    coder: nonEmpty(input.coder) ? input.coder.trim() : null,
    reviewer,
    lead: null,
    minutes: input.noCost === true ? null : Math.floor((closedMs - startedMs) / 60_000),
    agents: input.noCost === true ? null : input.agents ?? null,
    tokens: input.noCost === true ? null : input.tokens ?? null,
    grade: gradeForRow,
    outcome,
    reason: nonEmpty(input.reason) ? input.reason.trim() : null,
    round: input.state.round,
    lessons,
    noNewKnowledge: noNewKnowledge === '' ? null : noNewKnowledge,
    note: note === '' ? marker : `${marker} | ${note}`,
    date: null,
    ...(input.noCost === true ? { costIn: 'stages' as const } : {}),
    ...(nonEmpty(input.stateId) ? { stateId: input.stateId } : {}),
    ...(input.state.envelope !== undefined ? { envelope: input.state.envelope } : {}),
    ...(reviewSource !== null ? { reviewSource } : {}),
    ...(reviewMinutes !== null ? { reviewMinutes } : {}),
  };

  try {
    io.writeLedger(row);
  } catch {
    return { ok: false, exit: 1, reason: 'строка не найдена — круг НЕ закрыт (писатель отказал)' };
  }
  let tail = '';
  try { tail = io.readLedgerTail(); } catch { /* unreadable is absence of a receipt */ }
  if (!tail.includes(marker)) {
    return { ok: false, exit: 1, reason: 'строка не найдена — круг НЕ закрыт' };
  }
  return { ok: true, row, marker, warnings };
}

/**
 * measurement-integrity fix-round-1/F8 (Codex r1 CRITICAL #8): validate an ALREADY-WRITTEN ledger
 * row against the CURRENT schema's `shipped|refuted require a grade` rule (ADR-001 D5 / FR-7).
 *
 * This exists for exactly one caller: `dz round close`'s idempotent-retry path. When the predicted
 * marker (or `stateId`) is already found in the ledger tail, the CLI used to skip `closeRound`
 * ENTIRELY and delete the round's state file — so an OLD row written before FR-7 shipped (`shipped`
 * with `grade: null`, the exact defect this feature exists to close) could be "recognised as already
 * closed" and the state removed without ever being checked against the rule that is supposed to be
 * mandatory. This function is that missing check, run on the ALREADY-FOUND row before the CLI is
 * allowed to treat the retry as a success.
 *
 * Deliberately NARROW: it re-checks only the ONE FR-7 invariant (a schema rule with a proving test),
 * not every field `closeRound` validates on the FIRST write (grade format, envelope shape, …) — those
 * were already enforced when the row was ORIGINALLY written; re-validating them here would either
 * duplicate that logic or silently drift from it. Pure, never throws.
 */
export function validateClosedRoundLedgerRow(row: unknown): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return { ok: false, reason: 'найденная строка леджера не JSON-объект — не удаётся проверить оценку' };
  }
  const r = row as Record<string, unknown>;
  const outcome = r['outcome'];
  if (typeof outcome !== 'string' || !(ROUND_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false, reason: `найденная строка леджера несёт неизвестный outcome ${JSON.stringify(outcome)}` };
  }
  const finishedOutcome = outcome === 'shipped' || outcome === 'refuted';
  if (!finishedOutcome) return { ok: true }; // blocked|abandoned carry no grade requirement (FR-7)
  const grade = r['grade'];
  if (typeof grade !== 'string' || !/^[A-F][+-]?$/.test(grade)) {
    return {
      ok: false,
      reason: `найденная строка леджера — outcome=${outcome} без валидной оценки (grade=${JSON.stringify(grade)}); ` +
        'закрытие отказано (measurement-integrity ADR-001 D5 / FR-7 требует непустую оценку для завершённого ревью)',
    };
  }
  return { ok: true };
}

export function listRounds(states: readonly RoundState[], input: {
  readonly now: number;
  readonly olderThanMinutes: number;
  readonly isPidAlive: (pid: number) => boolean | null;
  readonly isRunAlive: (runId: string) => boolean | null;
}): Array<{ readonly state: RoundState; readonly ageMinutes: number; readonly pidAlive: boolean | null }> {
  if (!Number.isFinite(input.now) || !Number.isFinite(input.olderThanMinutes) || input.olderThanMinutes < 0) return [];
  const rows: Array<{ state: RoundState; ageMinutes: number; pidAlive: boolean | null }> = [];
  for (const state of states) {
    const startedMs = Date.parse(state.startedAt);
    if (!Number.isFinite(startedMs)) continue;
    const ageMinutes = Math.max(0, Math.floor((input.now - startedMs) / 60_000));
    if (ageMinutes <= input.olderThanMinutes) continue;
    let pidAlive: boolean | null = null;
    try {
      pidAlive = state.ownerKind === 'run'
        ? input.isRunAlive(state.ownerRun ?? '')
        : input.isPidAlive(state.pid);
    } catch { /* an unavailable probe is unknown */ }
    rows.push({ state, ageMinutes, pidAlive });
  }
  return rows.sort((a, b) => b.ageMinutes - a.ageMinutes || a.state.slug.localeCompare(b.state.slug) || a.state.round - b.state.round);
}
