/**
 * A focused work round. The module owns decisions only: callers inject observed state, time,
 * lesson ids, ledger writing/reading and pid liveness. In particular, this file never imports a
 * filesystem or process API; the CLI owns `.dz/rounds/` and the witnessed ledger writer.
 */

import { validateExperimentEnvelope } from './feature-adr-envelope.js';
import type { QeBridgeCost } from './review-cost.js';

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
  /** experiment-instrument FR-1/FR-3 (ADR-001): minted once at `openRound` — `--task` when given
   * (validated), else `slug@startedAt`. Optional at the TYPE level, not because a fresh round ever
   * omits it, but because a state file written before this feature landed has no such key on disk;
   * `closeRound` derives the same default for that legacy case and names the source (A4/A5). */
  readonly taskId?: string;
}

export interface RoundExecState {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly exitCode: number | null;
  readonly outcome: import('./round-exec.js').RoundExecOutcome;
  readonly tokens: number | null;
}

/** Additive row shape accepted by the existing run-cost ledger readers. */
/**
 * The row this version WRITES. It is deliberately not the shape the FILE holds: the ledger is
 * append-only, so rows written before a field existed do not carry it. Read a stored line as
 * `unknown` and put it through {@link validateClosedRoundLedgerRow} or your own guard — typing a
 * historical line with this interface and dereferencing a later field as a guaranteed string is the
 * defect this note exists to prevent (named by cross-family review, Codex gpt-5.6-sol, 2026-09-21).
 */
export interface RoundLedgerRow {
  readonly slug: string;
  readonly stage: 'round';
  /**
   * This round's identity as a FIELD. It is also the first token of `note`, and that prefix is what
   * the confirmation read greps for — but a key that lives inside prose can only be joined by
   * parsing prose. MEASURED on the COMMITTED `.dz/feature-adr/run-cost-ledger.jsonl` at `488f596c`
   * (backlog c60cc857, whose own numbers had gone stale): of 436 rows, 99 are `round`, and the
   * round's own identity sat in a FIELD 0 times out of 99 while sitting inside `note` prose 99 times
   * out of 99. Other id fields exist on those rows — 28 carry `taskId`, 76 carry `stateId` — but
   * they identify the TASK and the STATE FILE, not the round's ledger identity; 22 carry none of
   * `runId`/`taskId`/`stateId` (those three exactly — `runnerId`, the host, is on all 99).
   * Reproducer and pinning commit: package README, section `roundId`.
   */
  readonly roundId: string;
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
   *  (no explicit `--reviewer`) — `elapsedMs / 60000`, rounded to 1 decimal. review-cost-ledger
   *  fix-round-1 #1/#2 (ADR-001 п.2 amended): also present when an EXPLICIT `--reviewer` AGREES with
   *  the sidecar's own `gradedBy` (`reviewSource:'flag+qe-bridge'` below names that case). */
  readonly reviewMinutes?: number;
  /** measurement-integrity FR-7: present ONLY alongside `reviewMinutes` — names where `reviewer` and
   *  `reviewMinutes` came from, so a reader never confuses a sidecar-sourced figure for a flag.
   *  review-cost-ledger fix-round-1 #1/#2 (ADR-001 п.2 amended): `'qe-bridge'` when `reviewer` was
   *  FILLED from the sidecar (no `--reviewer` flag); `'flag+qe-bridge'` when an explicit `--reviewer`
   *  AGREES with the sidecar's own `gradedBy` (case-insensitive `family:model` equality, or a
   *  family-only flag matching the sidecar's family) — the flag's IDENTITY is confirmed by the
   *  sidecar, so its price/minutes are attributed too. A DISAGREEING explicit `--reviewer` is refused
   *  outright (`closeRound` never reaches row-building for that case) — never silently ignored. */
  readonly reviewSource?: 'qe-bridge' | 'flag+qe-bridge';
  /** experiment-instrument FR-1/FR-3 (ADR-001): the task identity this round's state carried (or, for
   *  a legacy state with no `taskId` on disk, the same `slug@startedAt` default `openRound` would have
   *  minted — always present, never null: a round always has a slug and a startedAt). */
  readonly taskId?: string;
  /** experiment-instrument A4/A5: present ONLY when `taskId` above was DERIVED here rather than read
   *  from the state file — i.e. the state predates this feature. A fresh round never carries this. */
  readonly taskIdSource?: 'derived-legacy';
  /** experiment-instrument FR-3/A2: the git sha `dz round close` resolved at close time (cli-only —
   *  the core never shells out), present only for a FINISHED outcome (`shipped|refuted`). */
  readonly shipSha?: string | null;
  /** experiment-instrument FR-3/A2: same timestamp as this row's own close (`closedAt`), present only
   *  alongside `shipSha` — the anchor "when was this shipped", not a duplicate of `date`. */
  readonly shippedAt?: string;
  /** experiment-instrument A2: present only when `shipSha` is `null` for a finished outcome — why the
   *  sha could not be resolved (e.g. "not a git repository", "git failed: …"). */
  readonly shipShaReason?: string;
  /** experiment-instrument r1-5 (Codex r1 HIGH #5, ADR-001 amended): `HEAD` alone does not identify
   *  what was actually shipped when the worktree carries uncommitted changes — this hub's own tree is
   *  ALWAYS dirty with unrelated files, so a clean-tree requirement was rejected; instead the row
   *  names the limit. `true` when `git status --porcelain` was non-empty at close time, `false` when
   *  empty, present only for a FINISHED outcome, alongside `shipSha`. */
  readonly shipTreeDirty?: boolean;
  /** experiment-instrument r1-5: present ONLY when `shipTreeDirty` above could not be determined (the
   *  `git status --porcelain` probe itself failed) — the same "never a bare unexplained gap" rule
   *  `shipShaReason` already follows, for the sibling probe. */
  readonly shipTreeDirtyReason?: string;
  /** review-cost-ledger FR-2/A2 (ADR-001 п.1-2): the qe-bridge reviewer's OWN price, from the stdout
   *  sidecar — present only when {@link reviewerCostSource} is `'qe-bridge-stdout'` (a usable price
   *  was found) or `'unavailable'` (present with the reviewer known but the price is not — `null` in
   *  that case, never omitted: NFR-4, "nothing is guessed"). */
  readonly reviewerCostUsd?: number | null;
  /** review-cost-ledger FR-2/A2: sum of the four token components below, present only alongside a
   *  successful {@link reviewerCostUsd} (`reviewerCostSource:'qe-bridge-stdout'`). fix-round-1 #5
   *  (Codex r1 HIGH #5): `null` — never a silently-zeroed sum — when the sidecar's own
   *  `tokens.tokensPartial` was `true` (at least one component was missing from the source JSON): an
   *  incomplete sum read as an exact zero is indistinguishable from a genuine zero-token review, which
   *  is the defect this field exists to avoid. */
  readonly reviewerTokens?: number | null;
  /** review-cost-ledger FR-2/A2: the same four components broken out, present only alongside a
   *  successful {@link reviewerCostUsd}. fix-round-1 #5: `partial:true` when the sidecar's `total`
   *  above is `null` for the reason described there — the four components themselves are still the
   *  real (possibly zero-substituted) values, only the aggregate is withheld. */
  readonly reviewerTokensBreakdown?: {
    readonly input: number;
    readonly output: number;
    readonly cacheCreation: number;
    readonly cacheRead: number;
    readonly partial?: true;
  };
  /** review-cost-ledger FR-2/A2/A3: `'qe-bridge-stdout'` when {@link reviewerCostUsd} is a real,
   *  parsed price; `'unavailable'` when a reviewer is known but no usable price could be found (the
   *  Codex limit, an unreadable/absent/unparseable stdout sidecar, or — fix-round-1 #2 — a sidecar
   *  price that exists but is NOT tied to this row's reviewer). Present ONLY in the same branch as
   *  {@link reviewMinutes}/{@link reviewSource} above (`reviewSource` is `'qe-bridge'` or
   *  `'flag+qe-bridge'`) — WITH two named exceptions, neither of which ever yields an `'ok'` price:
   *  (a) a Codex reviewer supplied via `--reviewer` with no matching signoff still gets `'unavailable'`
   *  + a reason naming the limit (ADR-001 п.3/FR-4); (b) an explicit `--reviewer` alongside a sidecar
   *  that carries a REAL cost record but is NOT tied to it (empty `gradedBy`, i.e. never fills
   *  `reviewer` and never agrees with it either) also gets `'unavailable'` — fix-round-1 #2 (Codex r1
   *  CRITICAL #2): an untied sidecar price, even `status:'ok'`, is NEVER attributed to an explicit
   *  reviewer it was not written for; a DISAGREEING sidecar (real `gradedBy`, does not match the flag)
   *  is refused outright by `closeRound` before any row is built at all (fix-round-1 #1/BLOCKER). */
  readonly reviewerCostSource?: 'qe-bridge-stdout' | 'unavailable';
  /** review-cost-ledger FR-2/A3: present ONLY alongside `reviewerCostSource:'unavailable'` — the
   *  status text explaining WHY (never a bare unexplained gap, same discipline as `shipShaReason`). */
  readonly reviewerCostReason?: string;
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
  /** review-cost-ledger FR-2/T3 (ADR-001 п.1): the reviewer's own price, read by the CALLER (the cli
   *  — `readQeBridgeCostSidecar`, T3) from the signoff's `rawStdoutFile` and parsed by
   *  `parseQeBridgeStdoutCost` (T1). `round.ts` never opens a file itself, same discipline as
   *  `gradedBy`/`elapsedMs` above. Absent when the caller never attempted a cost lookup at all
   *  (distinct from `{status:'absent'}`, which means a lookup WAS attempted and found nothing). */
  readonly cost?: QeBridgeCost;
}

type RoundRefusal = { readonly ok: false; readonly exit: 1 | 2; readonly reason: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** review-cost-ledger fix-round-1 #1/#2 (ADR-001 п.2 amended): does an explicit `--reviewer` AGREE
 *  with the qe-bridge sidecar's own `gradedBy` (already normalized by the caller to `family:model`,
 *  e.g. `claude:sonnet`)? Case-insensitive. An exact `family:model` match agrees; a FAMILY-ONLY flag
 *  (no `:` in it at all, e.g. `claude`) agrees with ANY `family:*` gradedBy of that same family —
 *  the lead naming only the family (not a specific model) is still confirming the sidecar's identity.
 *  Anything else (a different family, or a full `family:model` that does not match exactly) does NOT
 *  agree — `closeRound` refuses that case outright rather than guessing which one is right. */
function reviewerAgreesWithSidecar(reviewerFlag: string, gradedBy: string): boolean {
  const flag = reviewerFlag.trim().toLowerCase();
  const graded = gradedBy.trim().toLowerCase();
  if (flag === '' || graded === '') return false;
  if (flag === graded) return true;
  if (!flag.includes(':')) {
    const gradedFamily = graded.split(':')[0] ?? '';
    return flag === gradedFamily;
  }
  return false;
}

function validSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}

function validCount(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

/** experiment-instrument A1: a `--task` value is a non-empty string, at most 120 characters, with no
 *  control characters (C0 or DEL) — long/garbled input refuses rather than being silently minted. */
function validTaskId(value: string): boolean {
  return value.trim() !== '' && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
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
  /** experiment-instrument FR-1 (ADR-001): explicit task identity for this round. Absent ⇒
   * `slug@startedAt` (minted below); present but invalid (empty, >120 chars, control characters) ⇒
   * refused (A1) — never silently substituted with the default. */
  readonly task?: string | undefined;
}): { readonly ok: true; readonly state: RoundState; readonly archiveExisting: boolean } | RoundRefusal {
  if (!validSlug(input.slug) || !Number.isInteger(input.round) || input.round < 1 || !nonEmpty(input.topic)) {
    return { ok: false, exit: 2, reason: 'нужны безопасный --slug, положительный --round и непустой --topic' };
  }
  if (input.envelope !== undefined) {
    const v = validateExperimentEnvelope(input.envelope);
    if (!v.ok) return { ok: false, exit: 2, reason: `--envelope invalid — ${v.reason}` };
  }
  if (input.task !== undefined && !validTaskId(input.task)) {
    return { ok: false, exit: 2, reason: '--task должен быть непустой строкой ≤120 символов без управляющих символов' };
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
    taskId: input.task !== undefined ? input.task.trim() : `${input.slug}@${input.startedAt}`,
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
  /** experiment-instrument FR-3/A2/NFR-3: the git sha the CLI resolved (`git rev-parse HEAD`) — the
   *  core never shells out, so this always arrives as data, `null` when it could not be resolved.
   *  Only consulted for a FINISHED outcome (`shipped|refuted`); ignored otherwise. */
  readonly shipSha?: string | null | undefined;
  /** experiment-instrument A2: why `shipSha` is `null` (e.g. "not a git repository", "git failed: …")
   *  — required to explain a null sha on a finished outcome, ignored when `shipSha` is non-null. */
  readonly shipShaReason?: string | undefined;
  /** experiment-instrument r1-5: whether `git status --porcelain` in `projectRoot` was non-empty at
   *  close time (cli-resolved, same discipline as `shipSha` — the core never shells out). Ignored for
   *  an unfinished outcome, same as `shipSha`. */
  readonly shipTreeDirty?: boolean | undefined;
  /** experiment-instrument r1-5: why `shipTreeDirty` could not be determined — required only when the
   *  probe itself failed (`shipTreeDirty` absent), ignored otherwise. */
  readonly shipTreeDirtyReason?: string | undefined;
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

  // reviewer/reviewMinutes/reviewSource: reviewer is TIED to the sidecar (ADR-001 п.2, amended by
  // fix-round-1 #1/#2 after the Codex r1 BLOCKER/CRITICAL pair) either (a) it is FILLED from the
  // sidecar (no explicit --reviewer), or (b) it is an explicit --reviewer that AGREES with the
  // sidecar's own gradedBy. Case (b) exists because the pipeline's normal path ALWAYS passes
  // --reviewer (feature-adr.js) — under the old "flag always wins, sidecar never trusted for cost"
  // rule, the price this feature exists to record would NEVER be written on that path (BLOCKER #1).
  // A DISAGREEING explicit --reviewer is refused outright, below — never silently ignored, and never
  // silently misattributed (CRITICAL #2).
  let reviewer = nonEmpty(input.reviewer) ? input.reviewer.trim() : null;
  let reviewMinutes: number | null = null;
  let reviewSource: 'qe-bridge' | 'flag+qe-bridge' | null = null;
  const sidecarGradedBy = input.reviewSidecar !== undefined && nonEmpty(input.reviewSidecar.gradedBy)
    ? input.reviewSidecar.gradedBy.trim()
    : null;
  if (reviewer === null && sidecarGradedBy !== null) {
    reviewer = sidecarGradedBy;
    const elapsedMs = input.reviewSidecar!.elapsedMs;
    reviewMinutes = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round((elapsedMs / 60_000) * 10) / 10 : null;
    reviewSource = 'qe-bridge';
  } else if (reviewer !== null && sidecarGradedBy !== null) {
    if (reviewerAgreesWithSidecar(reviewer, sidecarGradedBy)) {
      const elapsedMs = input.reviewSidecar!.elapsedMs;
      reviewMinutes = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round((elapsedMs / 60_000) * 10) / 10 : null;
      reviewSource = 'flag+qe-bridge';
    } else {
      // fix-round-1 #1/#2 (ADR-001 п.2 amended): the same discipline a --grade disagreeing with the
      // sidecar's own grade already follows (FR-7) — an explicit reviewer naming someone ELSE than
      // the sidecar's own reviewer must never silently receive (or silently omit) that reviewer's
      // price; it refuses, naming both values, before any row is built.
      return {
        ok: false,
        exit: 2,
        reason: `--reviewer "${reviewer}" conflicts with the qe-bridge sidecar's reviewer "${sidecarGradedBy}" for slug ${input.state.slug}`,
      };
    }
  }

  // review-cost-ledger FR-3/A4 (ADR-001 п.4): a FINISHED review (shipped|refuted) with NEITHER an
  // explicit --reviewer NOR one filled from the sidecar is unmeasurable by definition — the audit
  // this feature exists to close (ADR-001 Q5). blocked|abandoned carry no such requirement, same as
  // they carry no grade requirement above: a review that never finished has no reviewer to name yet.
  if (finishedOutcome && reviewer === null) {
    return {
      ok: false,
      exit: 2,
      reason: `finished review requires a reviewer: outcome=${outcome} needs --reviewer <model> (no --reviewer flag and no qe-bridge signoff to fill it from)`,
    };
  }

  // review-cost-ledger FR-2/A2/A3 (ADR-001 п.1-3, amended by fix-round-1 #2/#3/#5): the reviewer's
  // price is written ONLY when the row's reviewer is TIED to the sidecar — reviewSource is
  // 'qe-bridge' or 'flag+qe-bridge' (the two cases computed above). fix-round-1 #2 (Codex r1
  // CRITICAL #2): the old "or it carries no gradedBy at all" hack is REMOVED — an untrusted sidecar
  // (empty gradedBy, e.g. T3's Codex-no-signoff synthesis) can still explain an ABSENT/UNPARSEABLE
  // price (that is a structural fact about the instrument, not an attribution), but it can NEVER
  // yield an 'ok' price for a reviewer it was not written for — an adversarial ok-cost sidecar with
  // an empty gradedBy is exactly the CRITICAL #2 failing input, and it must never buy a price here.
  let reviewerCostFields: Pick<RoundLedgerRow, 'reviewerCostUsd' | 'reviewerTokens' | 'reviewerTokensBreakdown' | 'reviewerCostSource' | 'reviewerCostReason'> | null = null;
  const sidecarCost = input.reviewSidecar?.cost;
  const reviewerTiedToSidecar = reviewSource === 'qe-bridge' || reviewSource === 'flag+qe-bridge';
  if (reviewerTiedToSidecar) {
    // fix-round-1 #3 (Codex r1 HIGH #3): a sidecar that filled/confirmed the reviewer but carries NO
    // cost record at all (cost undefined) used to leave every price field silently absent — the same
    // "never a bare unexplained gap" discipline as `shipShaReason` now applies here too.
    if (sidecarCost === undefined) {
      reviewerCostFields = { reviewerCostUsd: null, reviewerCostSource: 'unavailable', reviewerCostReason: 'sidecar carried no cost record' };
    } else if (sidecarCost.status === 'ok') {
      // fix-round-1 #5 (Codex r1 HIGH #5): tokensPartial on the sidecar means the sum is NOT a real
      // count (at least one component was missing) — reviewerTokens goes null rather than a silently
      // zeroed/short sum, while the still-valid price and the partial breakdown are kept.
      const partial = sidecarCost.tokens.tokensPartial === true;
      reviewerCostFields = {
        reviewerCostUsd: sidecarCost.costUsd,
        reviewerTokens: partial ? null : sidecarCost.tokens.total,
        reviewerTokensBreakdown: {
          input: sidecarCost.tokens.input,
          output: sidecarCost.tokens.output,
          cacheCreation: sidecarCost.tokens.cacheCreation,
          cacheRead: sidecarCost.tokens.cacheRead,
          ...(partial ? { partial: true as const } : {}),
        },
        reviewerCostSource: 'qe-bridge-stdout',
      };
    } else {
      const reason = nonEmpty(sidecarCost.reason)
        ? sidecarCost.reason.trim()
        : 'qe-bridge stdout sidecar carried no parseable cost line';
      reviewerCostFields = { reviewerCostUsd: null, reviewerCostSource: 'unavailable', reviewerCostReason: reason };
    }
  } else if (sidecarCost !== undefined) {
    // The reviewer is NOT tied to this sidecar (an untrusted/untied sidecar — e.g. T3's
    // Codex-no-signoff synthesis, empty gradedBy). It may still explain a NAMED limit
    // (status !== 'ok') — that is honest instrument metadata, not an attribution. fix-round-1 #2: an
    // 'ok' status here is NEVER trusted for a price, whatever the number — the sidecar was not
    // written for this reviewer, full stop.
    if (sidecarCost.status !== 'ok') {
      // Lead delta after Codex r2 (#2 partial): an untied sidecar's OWN reason (the cli's Codex
      // "tokens not visible" synthesis) was copied onto ANY explicit reviewer's row — a Claude
      // reviewer got a Codex-specific limit as its explanation. The sidecar's reason travels only
      // to a reviewer of the codex family; every other untied reviewer gets the neutral fact.
      const reviewerIsCodex = /^codex\b/i.test(reviewer ?? '');
      const reason = reviewerIsCodex && nonEmpty(sidecarCost.reason)
        ? sidecarCost.reason.trim()
        : 'explicit --reviewer is not tied to a qe-bridge sidecar (no signoff names this reviewer)';
      reviewerCostFields = { reviewerCostUsd: null, reviewerCostSource: 'unavailable', reviewerCostReason: reason };
    } else {
      reviewerCostFields = {
        reviewerCostUsd: null,
        reviewerCostSource: 'unavailable',
        reviewerCostReason: 'qe-bridge sidecar carried a price but is not tied to this row\'s reviewer',
      };
    }
  }

  const startedMs = Date.parse(input.state.startedAt);
  const closedMs = Date.parse(input.closedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(closedMs) || closedMs < startedMs) {
    return { ok: false, exit: 1, reason: 'длительность круга не установлена: время состояния недопустимо' };
  }
  const compactTs = new Date(closedMs).toISOString().replace(/[-:.]/g, '');
  const marker = `round-${input.state.slug}-${input.state.round}-${compactTs}`;
  const note = input.note?.trim() ?? '';

  // experiment-instrument FR-1/A4/A5: the state ALWAYS carries a taskId for a round opened after this
  // feature; a state written before it lacks the key on disk, so the same default `openRound` mints
  // is derived here and the derivation is named (`taskIdSource`) — never silently blended with a
  // fresh-mint taskId, which is what `taskIdSource` absent means.
  const taskIdFromState = input.state.taskId;
  const taskId = nonEmpty(taskIdFromState) ? taskIdFromState.trim() : `${input.state.slug}@${input.state.startedAt}`;
  const taskIdSource: 'derived-legacy' | null = nonEmpty(taskIdFromState) ? null : 'derived-legacy';

  // experiment-instrument FR-3/A2: only a FINISHED outcome carries a ship anchor — `blocked|abandoned`
  // never shipped anything, so a sha there would misleadingly imply a release. A null sha REQUIRES its
  // reason to be recorded next to it (never a bare, unexplained null on a finished row) — r1-6 (Codex
  // r1 MEDIUM #6): a caller that supplies no reason at all no longer leaves the row silently
  // unexplained; a stable default fills the gap instead of an absent key.
  const finishedForShip = outcome === 'shipped' || outcome === 'refuted';
  const shipSha = finishedForShip ? (input.shipSha ?? null) : null;
  const shipShaReason = finishedForShip && shipSha === null
    ? (nonEmpty(input.shipShaReason) ? input.shipShaReason.trim() : 'not provided')
    : null;
  // experiment-instrument r1-5 (Codex r1 HIGH #5, ADR-001 amended): `shipTreeDirty` is present only
  // when the caller (the cli) actually resolved it; `shipTreeDirtyReason` fills the gap when it could
  // not be. Neither is ever guessed here — the core never shells out to compute either.
  const shipTreeDirtyValue: boolean | undefined = finishedForShip && typeof input.shipTreeDirty === 'boolean'
    ? input.shipTreeDirty
    : undefined;
  // r2-2 (Codex r2 MEDIUM N2, lead delta): a finished row with NEITHER field used to omit both —
  // the same bare-gap shape r1-6 closed for the sha. The rule is symmetric: boolean, or a reason.
  const shipTreeDirtyReason = finishedForShip && shipTreeDirtyValue === undefined
    ? (nonEmpty(input.shipTreeDirtyReason) ? input.shipTreeDirtyReason.trim() : 'not provided')
    : undefined;

  const row: RoundLedgerRow = {
    slug: input.state.slug,
    stage: 'round',
    roundId: marker,
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
    taskId,
    ...(taskIdSource !== null ? { taskIdSource } : {}),
    ...(finishedForShip ? { shipSha, shippedAt: input.closedAt } : {}),
    ...(shipShaReason !== null ? { shipShaReason } : {}),
    ...(shipTreeDirtyValue !== undefined ? { shipTreeDirty: shipTreeDirtyValue } : {}),
    ...(shipTreeDirtyReason !== undefined ? { shipTreeDirtyReason } : {}),
    ...(reviewerCostFields !== null ? reviewerCostFields : {}),
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

/**
 * experiment-instrument FR-1/FR-3 (ADR-001 D-A): the single source every OTHER writer (an auto ledger
 * row, a qe-bridge signoff, a control-review row) consults to find this slug's task identity —
 * never guessed, never minted here. `states` is whatever the CALLER already read as "currently open
 * round state files for this slug" (the cli walks `.dz/rounds/<slug>-*.json`); this function does not
 * touch a filesystem and does not assume the caller pre-filtered by slug, so it filters again itself.
 *
 * `unreadableStateCount` (r1-2, Codex r1 HIGH #2) is how many FILENAMES the caller found matching this
 * slug's pattern that it could NOT parse into a `RoundState` — a corrupt or half-written state file is
 * never silent absence; it means the true open-round count for this slug is UNKNOWN, not zero.
 *
 * - Any unreadable candidate exists AND no readable one does ⇒ `{taskId: null, source: 'unavailable'}`
 *   — a round MAY be open here, but its state cannot be read (r1-2).
 * - Any unreadable candidate exists ALONGSIDE at least one readable one ⇒ `{taskId: null, source:
 *   'ambiguous'}` — the readable one might not be the only genuinely open round (r1-2).
 * - Zero candidates at all (readable or not) ⇒ `{taskId: null, source: 'no-open-round'}` — no open
 *   round, nothing to fill from (A4).
 * - Two or more readable matches, no unreadable ones ⇒ `{taskId: null, source: 'ambiguous'}` — which
 *   one is authoritative is not decidable here; a NULL is the honest answer, never "the latest wins" (A5).
 * - Exactly one readable match, no unreadable ones ⇒ its `taskId` when the state carries one
 *   (`source: 'open-round'`), or the SAME `slug@startedAt` default `openRound`/`closeRound` would
 *   derive for a legacy state missing the field on disk — labelled `source: 'derived-legacy'` (r1-1,
 *   Codex r1 CRITICAL #1: this used to report `'open-round'` for an invented value, indistinguishable
 *   from a value the round itself actually minted).
 */
export function readOpenRoundTaskId(
  states: readonly RoundState[],
  slug: string,
  unreadableStateCount = 0,
): {
  readonly taskId: string | null;
  readonly source: 'open-round' | 'derived-legacy' | 'no-open-round' | 'ambiguous' | 'unavailable';
} {
  const matches = states.filter((s) => s.slug === slug);
  const unreadable = Number.isFinite(unreadableStateCount) && unreadableStateCount > 0 ? Math.floor(unreadableStateCount) : 0;
  if (unreadable > 0 && matches.length === 0) return { taskId: null, source: 'unavailable' };
  if (unreadable > 0) return { taskId: null, source: 'ambiguous' };
  if (matches.length === 0) return { taskId: null, source: 'no-open-round' };
  if (matches.length > 1) return { taskId: null, source: 'ambiguous' };
  const state = matches[0]!;
  const taskId = nonEmpty(state.taskId) ? state.taskId.trim() : `${state.slug}@${state.startedAt}`;
  const source = nonEmpty(state.taskId) ? 'open-round' : 'derived-legacy';
  return { taskId, source };
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
