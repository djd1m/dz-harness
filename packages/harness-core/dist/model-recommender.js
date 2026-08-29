/**
 * model-recommender (backlog a9c3dd5c, function 3) — the PURE half of `dz routing recommend`.
 *
 * NOT a fifth analyzer (ADR-001 D1): this module HARVESTS per-stage (model → success) samples out of
 * the harness's own workflow records (and imported run-meta sidecars) and hands them to the EXISTING
 * `selectAutoCost` brain in routing-outcomes.ts — the same brain the `auto-cost` plan spec reads. The
 * store that brain trusts (`.dz/routing-outcomes.json`) had never been fed before this feature.
 *
 * Honesty rules, load-bearing:
 *  - The ONLY grade a record carries is RUN-level. Attributing it to every stage's model is an
 *    INFERENCE, and the printed basis states the rule rather than implying it (ADR-001 D2).
 *  - Cross-family QE is UNREPRESENTABLE, not filtered: the qe pick is computed with the family
 *    parameter forced to the cross of the code pick's family (ADR-001 D3).
 *  - `--apply` idempotency lives here as a pure plan (`planFeed`): double-feeding the same runs
 *    would manufacture confidence the data does not contain (ADR-001 D4).
 *
 * No fs, no clock, no randomness — the CLI reads records and does the I/O.
 */
import { COST_LADDER, selectAutoCost } from './routing-outcomes.js';
/** success ⇔ grade ≥ this floor. DATA, exported, and printed in every basis (FR-4). */
export const GRADE_SUCCESS_FLOOR = 'B';
const SUCCESS_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B']);
export function gradeIsSuccess(grade) {
    return SUCCESS_GRADES.has(grade.trim().toUpperCase());
}
const RULE_TEXT = `success ⇔ QE grade ≥ ${GRADE_SUCCESS_FLOOR} (run-level); the run's ONE grade is attributed to every ` +
    `stage's model of that run — an inference, stated here because a hidden basis is an opinion in uniform`;
/** `codex:gpt-5.5:xhigh (usage-switched)` → `gpt-5.5`; claude ids pass through; unknown → null. */
export function normalizeModelId(raw) {
    if (typeof raw !== 'string' || raw === '')
        return null;
    let id = raw.replace(/ \(usage-switched\)$/, '').trim();
    const codex = /^codex:([^:]+)(?::[a-z]+)?$/.exec(id);
    if (codex !== null)
        id = codex[1];
    return COST_LADDER.some((r) => r.id === id) ? id : null;
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** The run-level grade, wherever this record's era put it (`result.qeGrade`, `result.grade`,
 * `result.qe.grade`). A string that does not look like a grade is not one. */
function extractGrade(result) {
    const looksLikeGrade = (v) => typeof v === 'string' && /^[A-F][+-]?$/.test(v.trim().toUpperCase());
    if (looksLikeGrade(result['qeGrade']))
        return result['qeGrade'].trim().toUpperCase();
    if (looksLikeGrade(result['grade']))
        return result['grade'].trim().toUpperCase();
    const qe = result['qe'];
    if (isRecord(qe) && looksLikeGrade(qe['grade']))
        return qe['grade'].trim().toUpperCase();
    return null;
}
/** Harvest per-stage samples from already-read records (live harness records AND the `runMeta.records`
 * of imported run-meta sidecars — they are the same shape by construction). */
export function harvestStageOutcomes(records) {
    const samples = [];
    const skipped = { noResult: 0, noModels: 0, noGrade: 0, unknownModel: 0 };
    const runs = new Set();
    let min = null;
    let max = null;
    for (const source of records) {
        if (!isRecord(source)) {
            skipped.noResult += 1;
            continue;
        }
        const result = source['result'];
        if (!isRecord(result)) {
            skipped.noResult += 1;
            continue;
        }
        const modelsUsed = result['modelsUsed'];
        if (!isRecord(modelsUsed)) {
            skipped.noModels += 1;
            continue;
        }
        const grade = extractGrade(result);
        if (grade === null) {
            skipped.noGrade += 1;
            continue;
        }
        // Full canonical JSON is intentional: the former 40-character prefix merged distinct records
        // whose stage names shared a long prefix, manufacturing idempotency across different runs.
        const runId = typeof source['runId'] === 'string' ? source['runId'] : `models:${JSON.stringify(modelsUsed)}`;
        const ts = typeof source['timestamp'] === 'string' ? source['timestamp'] : null;
        const tier = typeof result['tier'] === 'string' && result['tier'] !== '' ? result['tier'] : 'unknown';
        let contributed = false;
        for (const [stage, rawModel] of Object.entries(modelsUsed)) {
            const model = normalizeModelId(rawModel);
            if (model === null) {
                skipped.unknownModel += 1;
                continue;
            }
            contributed = true;
            samples.push({ runId, ts, tier, stage, model, success: gradeIsSuccess(grade), grade });
        }
        if (contributed) {
            runs.add(runId);
            if (ts !== null) {
                if (min === null || ts < min)
                    min = ts;
                if (max === null || ts > max)
                    max = ts;
            }
        }
    }
    return {
        samples,
        runsUsed: runs.size,
        window: min !== null && max !== null ? { min, max } : null,
        skipped,
        rule: RULE_TEXT,
    };
}
function rungFamily(id) {
    const rung = COST_LADDER.find((r) => r.id === id);
    return rung !== undefined ? rung.family : 'claude';
}
function toSpec(id) {
    return rungFamily(id) === 'openai' ? `codex:${id}:high` : id;
}
const CROSS_NOTE = 'the qe pick is computed with the family FORCED to the cross of the code pick — a same-family qe recommendation is unrepresentable (ADR-001 D3)';
/** Recommend per stage over the harvested samples (optionally one tier's slice). */
export function recommendModels(harvest, opts = {}) {
    const slice = opts.tier === undefined ? harvest.samples : harvest.samples.filter((s) => s.tier === opts.tier);
    const tierLabel = opts.tier ?? 'all';
    const byStage = new Map();
    for (const s of slice) {
        const bucket = byStage.get(s.stage) ?? [];
        bucket.push(s);
        byStage.set(s.stage, bucket);
    }
    const statsFor = (stage) => (model) => {
        const rows = (byStage.get(stage) ?? []).filter((s) => s.model === model);
        const successes = rows.filter((s) => s.success).length;
        return { attempts: rows.length, successes, successRate: rows.length === 0 ? 0 : successes / rows.length };
    };
    const pickFor = (stage, family) => {
        const pick = selectAutoCost(stage, tierLabel, statsFor(stage), {
            ...(opts.qualityBar !== undefined ? { qualityBar: opts.qualityBar } : {}),
            ...(opts.minSamples !== undefined ? { minSamples: opts.minSamples } : {}),
            ...(family !== undefined ? { family } : {}),
        });
        return {
            stage,
            spec: toSpec(pick.model),
            pick,
            family: rungFamily(pick.model),
            samples: (byStage.get(stage) ?? []).length,
            insufficientData: !pick.metBar,
        };
    };
    const stages = [...byStage.keys()].sort();
    const perStage = [];
    // code first — the qe family depends on it (D3).
    const code = pickFor('code');
    for (const stage of stages) {
        if (stage === 'qe') {
            const cross = code.family === 'claude' ? 'openai' : 'claude';
            perStage.push(pickFor('qe', cross));
        }
        else {
            perStage.push(pickFor(stage));
        }
    }
    if (!stages.includes('code'))
        perStage.unshift(code);
    const pending = unfedRuns(harvest.samples, opts.alreadyFed ?? []);
    const harvestRunIds = [...new Set(harvest.samples.map((s) => s.runId))];
    const fed = new Set(opts.alreadyFed ?? []);
    const fedInHarvest = harvestRunIds.filter((runId) => fed.has(runId)).length;
    return {
        perStage,
        basis: {
            runsUsed: harvest.runsUsed,
            window: harvest.window,
            rule: harvest.rule,
            skipped: harvest.skipped,
            crossFamilyNote: CROSS_NOTE,
            unfed: { count: pending.length, runIds: pending },
            freshness: pending.length === 0 ? 'current' : fedInHarvest === 0 ? 'unfed' : 'stale',
        },
    };
}
/** One shared definition of the telemetry/store gap, used by recommendation, apply and guard. */
export function unfedRuns(samples, alreadyFed) {
    const fed = new Set(alreadyFed);
    return [...new Set(samples.map((s) => s.runId))].filter((runId) => !fed.has(runId)).sort();
}
/** A run feeds ONCE. Double-feeding the same telemetry manufactures confidence the data does not
 * contain — the second `--apply` must feed 0 and say which runs it skipped. */
export function planFeed(samples, alreadyFed) {
    const fed = new Set(alreadyFed);
    const toFeed = [];
    const skippedRuns = new Set();
    const seenSamples = new Set();
    for (const s of samples) {
        if (fed.has(s.runId))
            skippedRuns.add(s.runId);
        else {
            // A multi-stage run legitimately feeds one sample per stage. Only a repeated sample from a
            // duplicated record is suppressed within this harvest.
            const sampleKey = JSON.stringify([s.runId, s.stage]);
            if (!seenSamples.has(sampleKey)) {
                seenSamples.add(sampleKey);
                toFeed.push(s);
            }
        }
    }
    const fedAfter = [...new Set([...alreadyFed, ...toFeed.map((s) => s.runId)])].sort();
    return { toFeed, skippedRuns: [...skippedRuns].sort(), fedAfter };
}
//# sourceMappingURL=model-recommender.js.map