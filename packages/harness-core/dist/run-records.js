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
import { matchCodexRollouts } from './codex-rollouts.js';
import { redactTrainingPayload } from './feature-adr-checkpoints.js';
import { validateExperimentEnvelope } from './feature-adr-envelope.js';
/** Bare Claude model names the pipeline actually emits with no `claude:` prefix (`coder: 'sonnet'`,
 *  `'opus'`, `'fable'`, real values observed in `.dz/feature-adr/run-cost-ledger.jsonl`). */
const BARE_CLAUDE_NAMES = new Set(['sonnet', 'opus', 'haiku', 'fable']);
/** id/effort alphabet a model spec component may use (lead delta after Codex r2, new MEDIUM #3). */
const SPEC_PART = /^[A-Za-z0-9._-]+$/;
/**
 * Parse an executor spec — the shapes actually recorded in `coder`/`reviewer` fields
 * (`codex:gpt-5.6-sol:high`, `claude:sonnet`, bare `sonnet`/`opus`, bare `codex`, bare `claude`) —
 * into `{family, model, effort}`. Pure, never throws.
 *
 * Returns `null` (never a guess) for anything that cannot be resolved to exactly ONE model:
 * - a bare `'codex'` or `'claude'` (family named, no model at all);
 * - an annotated/aggregate field such as `'claude:sonnet x2'` or `'qe-bridge:claude x2 + lead'` (real
 *   values this ledger carries for a MULTI-reviewer round) — any embedded whitespace means the field
 *   names more than one resolvable spec, and picking one would misattribute to the others;
 * - a bare model id with no family marker that is not one of the known bare Claude names (e.g. a full
 *   `'claude-sonnet-5'` — that shape is handled by the OLDER vendor-prefix path in {@link priceLookup}
 *   for backward compatibility, not by this parser).
 */
export function parseModelSpec(spec) {
    if (typeof spec !== 'string')
        return null;
    const trimmed = spec.trim();
    if (trimmed === '' || /\s/.test(trimmed))
        return null;
    const parts = trimmed.split(':');
    const head = parts[0] ?? '';
    if (head === 'codex') {
        const model = parts[1];
        if (model === undefined || model === '')
            return null; // bare 'codex' — no reliable model
        // Lead delta after Codex r2 (new MEDIUM #3): exactly 2 or 3 non-empty components, id alphabet
        // only — `codex:gpt-5.6-sol:high:garbage` is a corrupt/aggregate spec, never a reliable model.
        if (parts.length > 3 || !SPEC_PART.test(model) || (parts.length === 3 && (parts[2] === '' || !SPEC_PART.test(parts[2]))))
            return null;
        const effort = parts[2] ?? null;
        return { family: 'codex', model, effort: effort === '' ? null : effort };
    }
    if (head === 'claude') {
        const model = parts[1];
        if (model === undefined || model === '')
            return null; // bare 'claude' — no reliable model
        return { family: 'claude', model, effort: null };
    }
    if (parts.length === 1 && BARE_CLAUDE_NAMES.has(head)) {
        return { family: 'claude', model: head, effort: null };
    }
    return null;
}
function isCodexFamily(v) {
    return typeof v === 'string' && /codex/i.test(v);
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** Longest-prefix match against the CALLER'S OWN table (never `cost-scoring.ts`'s internal
 *  constant) — the whole point of a price SNAPSHOT is that it answers only from what the caller
 *  handed in at write time, mirroring `pricingFor`'s matching rule without importing it.
 *
 *  measurement-integrity fix-round-1/F7 (Codex r1 HIGH #7): the OLD version stripped only a
 *  `vendor/`-shaped prefix, so the REAL recorded shape `codex:gpt-5.6-sol:high` (or `claude:sonnet`)
 *  never matched anything and always landed in `prices.unknown[]`. This now runs the id through the
 *  SAME {@link parseModelSpec} FR-4's matcher uses, then reconstructs the normalized id the way
 *  `cost-scoring.ts`'s `pricingFor`/`hasKnownPricing` key their table (`claude-<model>` for the
 *  Claude family; the bare model for Codex — its ids carry no vendor prefix). A spec this parser
 *  cannot resolve falls back to the OLD vendor-prefix strip, so an already-working bare id
 *  (`claude-sonnet-5`, `gpt-4o`) keeps matching exactly as before (NFR-1). */
function priceLookup(modelId, table) {
    if (typeof modelId !== 'string' || modelId.length === 0)
        return null;
    const parsed = parseModelSpec(modelId);
    const id = parsed !== null
        ? (parsed.family === 'claude' ? `claude-${parsed.model}` : parsed.model).toLowerCase()
        : modelId.toLowerCase().replace(/^[a-z0-9-]+\//, '');
    let best = null;
    let bestLen = 0;
    for (const [key, price] of Object.entries(table)) {
        const k = key.toLowerCase();
        if (id.startsWith(k) && k.length > bestLen) {
            best = price;
            bestLen = k.length;
        }
    }
    return best;
}
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
function shapeMismatch(kind, payload, autoFlag) {
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
    // experiment-envelope FR-5 / ADR-001 D2: `auto:true` marks a pipeline-written row, and the pipeline
    // is obligated to carry the envelope built once after the Step-0 router — a row missing it is
    // useless for learning and would silently corrupt the sample (the "warn but write" alternative was
    // rejected in the ADR: a warning nobody reads left `tokens=null` unnoticed for years). A MANUAL row
    // (no `auto`) stays compatible: no envelope required, but one that IS present is still validated —
    // never trusted just because a human typed it.
    //
    // fix-round-1/F2 (cross-family review, HIGH #2): the PAYLOAD's own `auto` field used to be the
    // ONLY signal — an automatic producer that forgot it, or sent `"true"`/`false`, was silently
    // accepted as a manual row and skipped the envelope requirement entirely. `autoFlag` is the CLI's
    // own trusted `--auto` argument (never JSON a caller could typo): it is a SECOND, independent
    // trust source, unioned with the payload field rather than replacing it — nothing that used to be
    // gated stops being gated, and a `--auto`-dispatched caller is now gated even if its hand-built
    // payload forgot the field. Independently of either source, a PRESENT `auto` field is checked for
    // shape: only the literal `true` is a legal value — anything else (a string, `false`, a number) is
    // refused outright, because a field whose only sane value is `true` holding something else is a
    // caller bug worth surfacing, not silently downgrading to "manual".
    if (kind === 'ledger') {
        const rawAuto = payload['auto'];
        if (rawAuto !== undefined && rawAuto !== true) {
            return 'a ledger record\'s `auto` field must be `true` or absent';
        }
        const envelope = payload['envelope'];
        const envelopePresent = envelope !== undefined && envelope !== null;
        const isAuto = autoFlag === true || rawAuto === true;
        if (isAuto && !envelopePresent) {
            return 'an auto ledger row must carry `envelope` (experiment-envelope FR-5)';
        }
        if (envelopePresent) {
            const v = validateExperimentEnvelope(envelope);
            if (!v.ok)
                return `envelope invalid — ${v.reason}`;
        }
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
    const mismatch = shapeMismatch(kind, obj, input.auto === true);
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
    // fix-round-1/F2: the CLI's own `--auto` flag is authoritative — when set, the written row MUST
    // carry `auto:true` too (not just gate on it transiently), so every downstream reader of the
    // PERSISTED line keeps seeing the same signal `shapeMismatch` already gated on above. A no-op when
    // the payload already said `auto:true` (shapeMismatch already refused any OTHER value).
    if (kind === 'ledger' && input.auto === true)
        stamped['auto'] = true;
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
    // measurement-integrity FR-5 (rollout enrichment) + FR-6 (price snapshot). Both are ADDITIVE and
    // OPT-IN on `input.enrich` — a caller that never passes it gets byte-identical output to before
    // this feature (NFR-1).
    if (kind === 'ledger' && input.enrich !== undefined) {
        const enrich = input.enrich;
        // FR-5: only a codex-family coder/reviewer with `tokens: null` is a candidate — a Claude row, or
        // one that already has a token figure, is left untouched. The loose `/codex/i` check below only
        // decides whether this row is WORTH TRYING at all.
        const tokensIsNull = stamped['tokens'] === null;
        const looksCodexFamily = isCodexFamily(stamped['coder']) || isCodexFamily(stamped['reviewer']);
        if (tokensIsNull && looksCodexFamily) {
            // measurement-integrity fix-round-1/F4 (Codex r1 HIGH #4): the matcher REQUIRES a reliable
            // model, parsed the same way FR-7's price lookup parses one — never `/codex/i` alone. If
            // `coder`/`reviewer` do not resolve to exactly ONE codex model between them (a bare `'codex'`
            // with no model at all, or the two fields naming DIFFERENT codex models), the matcher is never
            // even called with an unreliable/omitted model filter — a lone rollout in the window would
            // otherwise be accepted as `'one'` on time+cwd alone and its tokens misattributed to the wrong
            // model's stage.
            const codexModels = new Set([parseModelSpec(stamped['coder']), parseModelSpec(stamped['reviewer'])]
                .filter((s) => s !== null && s.family === 'codex')
                .map((s) => s.model));
            if (codexModels.size !== 1) {
                stamped['tokensSource'] = 'codex-rollout:no-model';
            }
            else if (enrich.window !== undefined) {
                const model = [...codexModels][0];
                const match = matchCodexRollouts(enrich.rollouts ?? [], {
                    from: enrich.window.from,
                    to: enrich.window.to,
                    model,
                    ...(enrich.cwd !== undefined ? { cwd: enrich.cwd } : {}),
                });
                if (match.status === 'one') {
                    stamped['tokens'] = match.rollout.totals.total;
                    const startMs = match.rollout.startedAt !== null ? Date.parse(match.rollout.startedAt) : NaN;
                    const endMs = match.rollout.endedAt !== null ? Date.parse(match.rollout.endedAt) : NaN;
                    // measurement-integrity fix-round-1/F6 (Codex r1 HIGH #6): fill-ONLY-null — an existing
                    // `minutes` figure (a manually recorded one, say) must never be silently overwritten by a
                    // derived rollout duration.
                    if (stamped['minutes'] === null && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
                        stamped['minutes'] = Math.round(((endMs - startMs) / 60000) * 10) / 10;
                    }
                    stamped['tokensSource'] = 'codex-rollout';
                    stamped['rolloutId'] = match.rollout.id;
                }
                else {
                    // `none` or `ambiguous` — NFR-3: an explicit status, never a guessed number.
                    stamped['tokensSource'] = `codex-rollout:${match.status}`;
                }
            }
            else {
                // Eligible in principle (codex family, one reliable model, tokens null) but no window was
                // supplied — AC-4's "old row without a window": no enrichment is even attempted, and that
                // fact is itself recorded rather than left silently absent.
                stamped['tokensSource'] = 'unavailable';
            }
        }
        // FR-6: the price snapshot, for every model this row names — independent of the FR-5 branch
        // above (a Claude row gets priced too; only tokens enrichment is codex-specific).
        if (enrich.prices !== undefined) {
            const modelIds = new Set();
            for (const v of [stamped['coder'], stamped['reviewer']]) {
                if (typeof v === 'string' && v.trim() !== '')
                    modelIds.add(v.trim());
            }
            const envelope = stamped['envelope'];
            if (isRecord(envelope)) {
                const chosen = envelope['chosen'];
                if (isRecord(chosen)) {
                    const stages = chosen['stages'];
                    if (isRecord(stages)) {
                        for (const v of Object.values(stages)) {
                            if (typeof v === 'string' && v.trim() !== '')
                                modelIds.add(v.trim());
                        }
                    }
                }
            }
            const table = {};
            const unknown = [];
            for (const modelId of modelIds) {
                const price = priceLookup(modelId, enrich.prices);
                if (price === null)
                    unknown.push(modelId);
                else
                    table[modelId] = { prompt: price.prompt, completion: price.completion, cachedInput: price.cachedInput, cacheCreation: price.cacheCreation };
            }
            const computedPrices = {
                snapshotAt: input.timestamp ?? null,
                table,
                ...(unknown.length > 0 ? { unknown } : {}),
            };
            // measurement-integrity fix-round-1/F6 (Codex r1 HIGH #6): fill-ONLY-null for `prices` too — an
            // existing snapshot (a previous write already priced this row) is never unconditionally
            // replaced. Equal → left alone (idempotent re-enrichment, common on a retried write). Different
            // → a named `pricesConflict`, never a silent re-price (ADR-001 D4 forbids re-pricing after the
            // fact — a DIFFERING recomputation is exactly that, so it is surfaced, not applied).
            const existingPrices = stamped['prices'];
            if (existingPrices === undefined || existingPrices === null) {
                stamped['prices'] = computedPrices;
            }
            else if (isRecord(existingPrices) && isRecord(existingPrices['table']) && (existingPrices['unknown'] === undefined || Array.isArray(existingPrices['unknown']))) {
                // Lead delta after Codex r2 (new MEDIUM #4): compare the WHOLE snapshot canonically (table +
                // sorted unknown), not the table alone.
                const canon = (t, u) => JSON.stringify({ table: t, unknown: Array.isArray(u) ? [...u].map(String).sort() : [] });
                if (canon(existingPrices['table'], existingPrices['unknown']) !== canon(table, unknown)) {
                    stamped['pricesConflict'] = { existing: existingPrices, recomputed: computedPrices };
                }
            }
            else {
                // A malformed existing snapshot (no table / bad unknown) is a CONFLICT, never silently trusted.
                stamped['pricesConflict'] = { existing: existingPrices, recomputed: computedPrices, reason: 'existing prices snapshot is malformed' };
            }
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