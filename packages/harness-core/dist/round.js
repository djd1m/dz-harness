/**
 * A focused work round. The module owns decisions only: callers inject observed state, time,
 * lesson ids, ledger writing/reading and pid liveness. In particular, this file never imports a
 * filesystem or process API; the CLI owns `.dz/rounds/` and the witnessed ledger writer.
 */
import { validateExperimentEnvelope } from './feature-adr-envelope.js';
const ROUND_OUTCOMES = ['shipped', 'refuted', 'blocked', 'abandoned'];
function nonEmpty(value) {
    return typeof value === 'string' && value.trim() !== '';
}
function validSlug(value) {
    return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}
function validCount(value) {
    return value === undefined || (Number.isInteger(value) && value >= 0);
}
export function openRound(input) {
    if (!validSlug(input.slug) || !Number.isInteger(input.round) || input.round < 1 || !nonEmpty(input.topic)) {
        return { ok: false, exit: 2, reason: 'нужны безопасный --slug, положительный --round и непустой --topic' };
    }
    if (input.envelope !== undefined) {
        const v = validateExperimentEnvelope(input.envelope);
        if (!v.ok)
            return { ok: false, exit: 2, reason: `--envelope invalid — ${v.reason}` };
    }
    const runOwner = input.ownerKind === 'run';
    if (!Number.isFinite(Date.parse(input.startedAt)) || !Number.isInteger(input.ownerPid)
        || (runOwner ? input.ownerPid !== 0 || !nonEmpty(input.ownerRun) : input.ownerPid < 1)
        || (!runOwner && input.ownerKind !== 'explicit' && input.ownerKind !== 'parent')) {
        return { ok: false, exit: 2, reason: 'время начала или pid круга недопустимы' };
    }
    const state = {
        slug: input.slug,
        round: input.round,
        topic: input.topic.trim(),
        startedAt: input.startedAt,
        pid: input.ownerPid,
        ownerKind: input.ownerKind,
        ...(runOwner ? { ownerRun: input.ownerRun.trim() } : {}),
        ...(nonEmpty(input.run) ? { run: input.run.trim() } : {}),
        recalled: [...input.recalled],
        ...(input.envelope !== undefined ? { envelope: input.envelope } : {}),
    };
    let existingOwnerAlive = input.existingOwnerAlive;
    if (input.existing?.ownerKind === 'run' && input.force) {
        try {
            existingOwnerAlive = nonEmpty(input.existing.ownerRun) ? input.isRunAlive(input.existing.ownerRun) : null;
        }
        catch {
            existingOwnerAlive = null;
        }
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
    if (input.existing !== null)
        return { ok: false, exit: 1, reason: 'круг уже открыт' };
    return { ok: true, archiveExisting: false, state };
}
export function closeRound(input, io) {
    if (!ROUND_OUTCOMES.includes(input.outcome)) {
        return { ok: false, exit: 2, reason: '--outcome: shipped | refuted | blocked | abandoned' };
    }
    // fix-round-1/F6: `openRound` validated the envelope once, at open time, then trusted it verbatim
    // out of the state FILE from then on. A state file is mutable disk state between open and close —
    // corrupted or hand-edited in that window, it would ride an invalid/tampered envelope straight
    // into the ledger row. Re-validating here, right before the row is built, closes that window.
    if (input.state.envelope !== undefined) {
        const v = validateExperimentEnvelope(input.state.envelope);
        if (!v.ok)
            return { ok: false, exit: 2, reason: `envelope in round state invalid — ${v.reason}` };
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
    if (missing !== undefined)
        return { ok: false, exit: 1, reason: `урок не найден: ${missing}` };
    // measurement-integrity FR-7 (ADR-001 D5): grade is mandatory for a FINISHED review
    // (shipped|refuted), a warned-and-dropped no-op for one that never finished (blocked|abandoned —
    // "Отвергнуто: --grade всегда обязателен — заблокированный круг оценки не имеет"). Placed AFTER
    // the outcome/envelope/tokens/lesson checks above (unchanged ordering, unchanged refusal reasons
    // for those) and BEFORE the duration/row-build below.
    const outcome = input.outcome;
    const finishedOutcome = outcome === 'shipped' || outcome === 'refuted';
    const gradeFlagRaw = nonEmpty(input.grade) ? input.grade.trim() : null;
    if (gradeFlagRaw !== null && !/^[A-F][+-]?$/.test(gradeFlagRaw)) {
        return { ok: false, exit: 2, reason: `--grade "${gradeFlagRaw}" не распознан — ожидается вид A|A-|B+|C…F` };
    }
    const warnings = [];
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
        ? input.reviewSidecar.grade.trim()
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
    let reviewMinutes = null;
    let reviewSource = null;
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
    const row = {
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
        ...(input.noCost === true ? { costIn: 'stages' } : {}),
        ...(nonEmpty(input.stateId) ? { stateId: input.stateId } : {}),
        ...(input.state.envelope !== undefined ? { envelope: input.state.envelope } : {}),
        ...(reviewSource !== null ? { reviewSource } : {}),
        ...(reviewMinutes !== null ? { reviewMinutes } : {}),
    };
    try {
        io.writeLedger(row);
    }
    catch {
        return { ok: false, exit: 1, reason: 'строка не найдена — круг НЕ закрыт (писатель отказал)' };
    }
    let tail = '';
    try {
        tail = io.readLedgerTail();
    }
    catch { /* unreadable is absence of a receipt */ }
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
export function validateClosedRoundLedgerRow(row) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        return { ok: false, reason: 'найденная строка леджера не JSON-объект — не удаётся проверить оценку' };
    }
    const r = row;
    const outcome = r['outcome'];
    if (typeof outcome !== 'string' || !ROUND_OUTCOMES.includes(outcome)) {
        return { ok: false, reason: `найденная строка леджера несёт неизвестный outcome ${JSON.stringify(outcome)}` };
    }
    const finishedOutcome = outcome === 'shipped' || outcome === 'refuted';
    if (!finishedOutcome)
        return { ok: true }; // blocked|abandoned carry no grade requirement (FR-7)
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
export function listRounds(states, input) {
    if (!Number.isFinite(input.now) || !Number.isFinite(input.olderThanMinutes) || input.olderThanMinutes < 0)
        return [];
    const rows = [];
    for (const state of states) {
        const startedMs = Date.parse(state.startedAt);
        if (!Number.isFinite(startedMs))
            continue;
        const ageMinutes = Math.max(0, Math.floor((input.now - startedMs) / 60_000));
        if (ageMinutes <= input.olderThanMinutes)
            continue;
        let pidAlive = null;
        try {
            pidAlive = state.ownerKind === 'run'
                ? input.isRunAlive(state.ownerRun ?? '')
                : input.isPidAlive(state.pid);
        }
        catch { /* an unavailable probe is unknown */ }
        rows.push({ state, ageMinutes, pidAlive });
    }
    return rows.sort((a, b) => b.ageMinutes - a.ageMinutes || a.state.slug.localeCompare(b.state.slug) || a.state.round - b.state.round);
}
//# sourceMappingURL=round.js.map