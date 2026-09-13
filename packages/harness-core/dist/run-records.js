/**
 * Witnessed run records — the decision half of `dz feature-adr-record` (ADR-001 … ADR-003).
 *
 * Two durable writers in the /feature-adr workflow still handed a subagent a PRE-BAKED shell string
 * carrying their payload: the run-cost ledger and the training-pair capture. That is the shape a
 * security classifier blocked NINE times in one run — one entity instructing another to append state
 * it never verified. The checkpoint writer was migrated for that reason; these two were left behind.
 *
 * The role change is the point: the subagent stops being a COURIER (handed a shell string, appends
 * it) and becomes a CALLER (handed arguments; the command decides). A courier can neither refuse nor
 * verify.
 *
 * Pure: payload in, verdict out. The CLI owns paths, the append, the read-back and the exit code.
 */
import { redactTrainingPayload } from './feature-adr-checkpoints.js';
/** A serialised record line above this is refused rather than truncated (acid case A2). */
export const RECORD_MAX_LINE_CHARS = 24_000;
/** Fields every ledger row must carry before it is worth writing down. */
const LEDGER_REQUIRED = ['slug', 'stage'];
/** Fields every training pair must carry — the dataset is worthless without input/output. */
const PAIR_REQUIRED = ['slug', 'stage', 'input', 'output'];
const refuse = (reason) => ({ verdict: 'refused', exit: 2, reason, blocking: false, line: null });
/** `duplicate` and `skipped` both wrote nothing and both are fine — but they are DIFFERENT facts. */
const noop = (verdict, reason) => ({
    verdict,
    exit: 0,
    reason,
    blocking: false,
    line: null,
});
function shapeMismatch(kind, payload) {
    // AM-1 FIRST, before the required-field sweep. A ledger row offered as a training pair fails BOTH
    // checks, and the wrong-kind reason is the one that tells the caller what actually happened —
    // "missing field `output`" sends them looking for a field they never meant to send.
    if (kind === 'ledger' && 'input' in payload && 'output' in payload) {
        // BOTH fields together are the training-pair signature. Either one alone is not: a ledger row may
        // legitimately carry `input: {cached_tokens: 80}` (cross-family review, 2026-08-21) and refusing
        // it would make the command reject honest data on a name collision.
        return 'this payload carries BOTH `input` and `output` — it is a training pair, not a ledger row';
    }
    if (kind === 'training-pair' && 'tokens' in payload && !('input' in payload)) {
        return 'this payload looks like a ledger row (`tokens` without `input`), not a training pair';
    }
    const required = kind === 'ledger' ? LEDGER_REQUIRED : PAIR_REQUIRED;
    for (const field of required) {
        const v = payload[field];
        if (v === undefined || v === null)
            return `a ${kind} record is missing the required field \`${field}\``;
        // EMPTY is not present. An earlier version checked only string-emptiness, so `input: []` and
        // `output: {}` satisfied the requirement and an empty record reached the file — a pair with no
        // content is worse than no pair, because it looks captured.
        if (typeof v === 'string' && v.trim() === '')
            return `a ${kind} record has an EMPTY \`${field}\``;
        if (Array.isArray(v) && v.length === 0)
            return `a ${kind} record has an EMPTY \`${field}\` (empty array)`;
        if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
            return `a ${kind} record has an EMPTY \`${field}\` (empty object)`;
        }
    }
    return null;
}
/** A runner id is missing when absent or blank — the same gap rule the date stamp uses. */
function isRunnerGap(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}
export function decideRecordWrite(input) {
    const { kind, payloadRaw, stage } = input;
    if (kind !== 'ledger' && kind !== 'training-pair') {
        return refuse(`unknown --kind \`${String(kind)}\` — expected ledger or training-pair`);
    }
    if (typeof stage !== 'string' || stage.trim() === '')
        return refuse('--stage is required');
    if (input.stageProducedResult === false) {
        return refuse(`stage \`${stage}\` produced no result — there is nothing to record`);
    }
    let payload;
    try {
        payload = JSON.parse(payloadRaw);
    }
    catch {
        return refuse('the payload is not valid JSON — refused before any write, the target is untouched');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return refuse('the payload must be a JSON object');
    }
    // Operator-profile redaction AT THE PERSIST SEAM (ADR-001 Decision 5 / CF-6 of operator-profile).
    // Every witnessed training-pair write funnels through this decision, so redacting HERE covers the
    // workflow's inline pair builder and any future caller — the core buildTrainingPair redaction
    // alone guarded a path that does not run (Codex cross-family finding, 2026-08-28). Redaction runs
    // BEFORE the shape check, the line cap and the serialisation, so nothing downstream — the file,
    // the read-back, the refusal texts — ever sees a byte of the profile block.
    const obj = (kind === 'training-pair' ? redactTrainingPayload(payload) : payload);
    const mismatch = shapeMismatch(kind, obj);
    if (mismatch !== null)
        return refuse(mismatch);
    // The record is filed under `--stage`, and the payload carries its own. A disagreement means the
    // row would land in the wrong stage's file (pairs) or under a wrong label (ledger) — both available
    // here, so leaving them uncompared was a free check declined.
    const payloadStage = obj['stage'];
    if (typeof payloadStage === 'string' && payloadStage !== stage) {
        return refuse(`the payload's stage \`${payloadStage}\` disagrees with --stage \`${stage}\` — the record would be filed under the wrong stage`);
    }
    // The no-write outcomes are checked AFTER the payload is validated: reporting `duplicate` for a
    // malformed payload would hide a real defect behind a benign-looking verdict.
    // A mark whose TARGET does not exist is STALE: a previous run took the mark and died before writing.
    // Reporting `duplicate` there lets one crash lose the record forever — the silent-loss shape this
    // whole feature removes (cross-family review, 2026-08-21). A stale mark does NOT stop the write; it
    // is recorded on the decision so the caller can say why it proceeded anyway.
    const staleMark = input.markExists === true && input.targetExists === false;
    if (input.markExists === true && !staleMark) {
        return noop('duplicate', 'a mark for this record already exists — another run captured it first');
    }
    if (input.targetHasPair === true) {
        return noop('skipped', 'the target already holds this record — nothing to add');
    }
    // The timestamp goes in BEFORE serialisation. The shell `sed` this replaces rewrote `"date":null`
    // inside an already-serialised document — text surgery on a structured value, and the exact place
    // a payload containing that literal token could corrupt itself.
    const stamped = { ...obj };
    const isGap = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    if (input.timestamp != null && input.timestamp !== '') {
        // An EMPTY STRING is a gap, not a value. Stamping only over null/undefined let
        // `"date":""` through as `written` (cross-family review, 2026-08-21) — a row that looks recorded
        // and carries no date.
        if (kind === 'ledger' && isGap(stamped['date']))
            stamped['date'] = input.timestamp.slice(0, 10);
    }
    // WHO ran this. Stamped HERE and nowhere else, for a structural reason: the workflow lives in a
    // sandbox with no host, no process and no clock, so it cannot name its own runner — but this
    // command runs outside that sandbox and can. Same seam that already stamps the date.
    //
    // The field answers a DIFFERENT question from the zombie-preflight predicate (backlog 4a727ac6):
    // that one asks "is this job's PARENT still alive", this one asks "which runner produced this
    // row". Complementary, not duplicate — a future run index joins them, and neither can answer for
    // the other. Absent identity stays ABSENT: an unknown runner is never invented as 'unknown',
    // because a fabricated identity is worse than a missing one for anything that later joins on it.
    // A blank supplied id is a gap too: `'   '` sneaking in as a value would join later as a distinct
    // runner made of spaces — the same class of harm as inventing 'unknown'.
    //
    // Stamped BEFORE `ts` below (fix-round-1/AM-n, cross-family review B): a runnerId this call itself
    // adds is still an ESTABLISHED field, from the runnerId feature that shipped before
    // ledger-stage-minutes — NFR-1's "new fields land after everything else" is a promise about the
    // fields THIS feature introduces (`ts`, `minutesSincePrev`, `minutesSource`), not about the order
    // decideRecordWrite happens to run its own blocks in. The original order stamped `ts` first, so a
    // freshly-added runnerId landed AFTER it — an object key order a `--full-qe-extended` Codex review
    // (grade B) caught by diffing `Object.keys` against the documented convention.
    if (kind === 'ledger' && isRunnerGap(stamped['runnerId']) && !isRunnerGap(input.runnerId)) {
        stamped['runnerId'] = input.runnerId.trim();
    }
    if (input.timestamp != null && input.timestamp !== '') {
        // FR-1 (ledger-stage-minutes): every ledger row also gets the FULL ISO instant it was recorded,
        // next to `date` — `date` alone cannot answer "how long between two rows of this run", `ts` can.
        //
        // fix-round-1/AM-n (cross-family review B): `ts` is ALWAYS the instant of THIS write, never a
        // value the payload happened to bring in — the delta below measures from `ts`, and a caller-
        // supplied instant (stale, forged, or simply wrong) would silently become "now" for that
        // measurement. The original `isGap` check let a non-empty payload `ts` survive untouched, which
        // is exactly the value a clock-skewed or replayed payload could poison. No data is discarded: a
        // real payload `ts` is kept, renamed to `payloadTs`, so the row still says what the caller claimed
        // — just not under the name the delta trusts.
        if (kind === 'ledger') {
            const payloadTs = stamped['ts'];
            // Lead edit after re-review (Codex B): never clobber a `payloadTs` the caller already carries,
            // and re-insert `ts` so it lands LAST even when the payload brought its own `ts` key
            // (assigning an existing property keeps its old insertion position).
            if (!isGap(payloadTs) && isGap(stamped['payloadTs']))
                stamped['payloadTs'] = payloadTs;
            delete stamped['ts'];
            stamped['ts'] = input.timestamp;
        }
        if (kind === 'training-pair' && isGap(stamped['ts']))
            stamped['ts'] = input.timestamp;
    }
    // FR-2 (ledger-stage-minutes): the writer cannot measure a stage's full duration — the workflow
    // sandbox has no clock (`Date.now()` is banned there for resume-safety) — but it DOES know the
    // moment of every write and the run each write belongs to. For an `auto:true` row that carries a
    // `runId`, the gap since the PREVIOUS row of the same run is a real, partial measurement, and it
    // gets its own named field and source rather than being folded into (or mistaken for) `minutes`
    // — "a claim exactly as strong as its inputs" (lesson, repeated 2026-08-25/2026-09-12): a partial
    // quantity is reported as itself, tagged with where it came from, never smuggled into a field that
    // implies the whole. `minutes` is left untouched by this block — it stays whatever the payload
    // already carried (null for every auto row today).
    if (kind === 'ledger') {
        const runIdVal = stamped['runId'];
        // Lead edit after re-review (Codex B): the pipeline's own rows carry NO runId in the payload —
        // the CLI resolves it at write time (`resolved-at-write`) — so the caller may hand the resolved
        // id in as `effectiveRunId`; the delta is measurable for those rows too.
        const effectiveRunId = typeof input.effectiveRunId === 'string' && input.effectiveRunId.trim() !== '' ? input.effectiveRunId : null;
        const hasRunId = (typeof runIdVal === 'string' && runIdVal.trim() !== '') || effectiveRunId !== null;
        if (stamped['auto'] === true && hasRunId) {
            const nowTs = typeof stamped['ts'] === 'string' && stamped['ts'].trim() !== '' ? stamped['ts'] : null;
            const prevTs = typeof input.previousRowTs === 'string' && input.previousRowTs.trim() !== '' ? input.previousRowTs : null;
            let minutesSincePrev = null;
            let minutesSource = 'unavailable';
            if (nowTs !== null && prevTs !== null) {
                const nowMs = Date.parse(nowTs);
                const prevMs = Date.parse(prevTs);
                // Absence of a receipt is not success: an unparseable timestamp or a previous row that is
                // somehow LATER than this one (clock skew, out-of-order backfill) must not be reported as a
                // measured value — it stays `unavailable`, never a fabricated or negative minute count.
                if (Number.isFinite(nowMs) && Number.isFinite(prevMs) && nowMs >= prevMs) {
                    minutesSincePrev = Math.round(((nowMs - prevMs) / 60000) * 10) / 10;
                    minutesSource = 'ledger-ts-delta';
                }
            }
            stamped['minutesSincePrev'] = minutesSincePrev;
            stamped['minutesSource'] = minutesSource;
        }
    }
    let line;
    try {
        line = JSON.stringify(stamped);
    }
    catch {
        return refuse('the payload could not be serialised (circular or unsupported value)');
    }
    const cap = input.maxChars ?? RECORD_MAX_LINE_CHARS;
    if (line.length > cap) {
        return refuse(`the serialised record is ${line.length} chars, above the ${cap}-char cap — refused rather than truncated`);
    }
    if (line.includes('\n'))
        return refuse('the serialised record contains a newline — one record is one line');
    return {
        verdict: 'written',
        exit: 0,
        reason: staleMark
            ? `${kind} record ready to append (a STALE mark was found — its target is absent, so a previous holder died before writing)`
            : `${kind} record ready to append`,
        blocking: false,
        line,
        staleMark,
    };
}
/** The read-back verdict (ADR-002): equal bytes or NOT written. Never inferred from the absence of an error. */
export function decideReadBack(appended, lastLineOnDisk) {
    if (lastLineOnDisk === null) {
        return {
            verdict: 'not-verified',
            exit: 3,
            reason: 'the record was appended but the file could not be read back — treat this as NOT written',
            blocking: false,
            line: appended,
        };
    }
    if (lastLineOnDisk !== appended) {
        return {
            verdict: 'not-verified',
            exit: 3,
            reason: 'the last line on disk differs from what was appended — treat this as NOT written',
            blocking: false,
            line: appended,
        };
    }
    return { verdict: 'written', exit: 0, reason: 'appended and verified by re-reading the tail', blocking: false, line: appended };
}
/** The one line every caller reads last, in the shape the other gates use. */
export function recordVerdictLine(kind, stage, d) {
    return `feature-adr record (${kind}/${stage}): ${d.verdict.toUpperCase()} — ${d.reason}`;
}
//# sourceMappingURL=run-records.js.map