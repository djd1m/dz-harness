/**
 * A focused work round. The module owns decisions only: callers inject observed state, time,
 * lesson ids, ledger writing/reading and pid liveness. In particular, this file never imports a
 * filesystem or process API; the CLI owns `.dz/rounds/` and the witnessed ledger writer.
 */

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
  readonly grade: null;
  readonly outcome: RoundOutcome;
  readonly reason: string | null;
  readonly round: number;
  readonly lessons: readonly string[];
  readonly noNewKnowledge: string | null;
  readonly note: string;
  readonly date: null;
  readonly costIn?: 'stages';
  /** round-state-lock (lead edit after Codex re-review): identity of the state instance this row
   * closes — lets a retried `close` detect its own earlier row regardless of the clock. */
  readonly stateId?: string;
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
}): { readonly ok: true; readonly state: RoundState; readonly archiveExisting: boolean } | RoundRefusal {
  if (!validSlug(input.slug) || !Number.isInteger(input.round) || input.round < 1 || !nonEmpty(input.topic)) {
    return { ok: false, exit: 2, reason: 'нужны безопасный --slug, положительный --round и непустой --topic' };
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
}, io: {
  readonly writeLedger: (row: RoundLedgerRow) => unknown;
  readonly readLedgerTail: () => string;
}): { readonly ok: true; readonly row: RoundLedgerRow; readonly marker: string } | RoundRefusal {
  if (!(ROUND_OUTCOMES as readonly string[]).includes(input.outcome)) {
    return { ok: false, exit: 2, reason: '--outcome: shipped | refuted | blocked | abandoned' };
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
    reviewer: nonEmpty(input.reviewer) ? input.reviewer.trim() : null,
    lead: null,
    minutes: input.noCost === true ? null : Math.floor((closedMs - startedMs) / 60_000),
    agents: input.noCost === true ? null : input.agents ?? null,
    tokens: input.noCost === true ? null : input.tokens ?? null,
    grade: null,
    outcome: input.outcome as RoundOutcome,
    reason: nonEmpty(input.reason) ? input.reason.trim() : null,
    round: input.state.round,
    lessons,
    noNewKnowledge: noNewKnowledge === '' ? null : noNewKnowledge,
    note: note === '' ? marker : `${marker} | ${note}`,
    date: null,
    ...(input.noCost === true ? { costIn: 'stages' as const } : {}),
    ...(nonEmpty(input.stateId) ? { stateId: input.stateId } : {}),
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
  return { ok: true, row, marker };
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
