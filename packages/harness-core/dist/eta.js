/**
 * Pure ETA calibration for the live feature-adr statusline.
 *
 * This module deliberately performs no filesystem access and reads no ambient clock. Callers pass
 * parsed JSONL text and `nowMs`; malformed or unstamped observations remain unknown, never zero.
 */
import { CHECKPOINT_STAGES, DESIGN_SUBSTAGES, } from './feature-adr-checkpoints.js';
export const ETA_MAX_STAGE_MS = 6 * 3_600_000;
const DESIGN_STAGE_NAMES = new Set([
    'design',
    ...DESIGN_SUBSTAGES.map((stage) => `design:${stage}`),
]);
function macroStage(stage) {
    if (DESIGN_STAGE_NAMES.has(stage))
        return 'design';
    return CHECKPOINT_STAGES.includes(stage) ? stage : undefined;
}
/** Parse JSONL independently per line. A malformed line can never poison its valid neighbours. */
export function parseCheckpointLines(text, runId) {
    const observations = [];
    for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim();
        if (line === '')
            continue;
        try {
            const parsed = JSON.parse(line);
            if (parsed === null || typeof parsed !== 'object' || typeof parsed['stage'] !== 'string')
                continue;
            const ts = typeof parsed['ts'] === 'string' ? Date.parse(parsed['ts']) : Number.NaN;
            observations.push({
                runId,
                stage: parsed['stage'],
                result: parsed['result'],
                ...(Number.isFinite(ts) ? { tsMs: ts } : {}),
            });
        }
        catch {
            // One corrupt append is unknown evidence, not a zero-duration sample and not a fatal file.
        }
    }
    return observations;
}
/**
 * Split a slug's append-only history into monotonic timing slices.
 *
 * Distinct `design:*` siblings share one macro stage and may arrive in any order. A repeated sibling,
 * repeated macro stage, or move backwards starts a resume slice. The latest router is carried as
 * metadata into later slices, so their tier still comes from that invocation's router record.
 */
export function segmentRun(observations) {
    const segments = [];
    let entries = [];
    let router;
    let lastIndex = -1;
    let designKeys = new Set();
    let invocation = 0;
    let segmentRunId;
    const flush = () => {
        if (entries.length === 0)
            return;
        segments.push({
            runId: segmentRunId ?? entries[0].runId,
            observations: entries,
            ...(router !== undefined ? { router } : {}),
        });
        entries = [];
        lastIndex = -1;
        designKeys = new Set();
    };
    for (const observation of observations) {
        const macro = macroStage(observation.stage);
        if (macro === undefined)
            continue;
        const index = CHECKPOINT_STAGES.indexOf(macro);
        if (macro === 'router') {
            flush();
            router = observation;
            invocation += 1;
            segmentRunId = invocation === 1 ? observation.runId : `${observation.runId}#${invocation}`;
            entries.push(observation);
            lastIndex = index;
            continue;
        }
        const distinctDesignSibling = macro === 'design'
            && lastIndex === CHECKPOINT_STAGES.indexOf('design')
            && !designKeys.has(observation.stage);
        if (entries.length > 0 && (index < lastIndex || (index === lastIndex && !distinctDesignSibling))) {
            flush();
        }
        segmentRunId ??= observation.runId;
        entries.push(observation);
        lastIndex = index;
        if (macro === 'design')
            designKeys.add(observation.stage);
    }
    flush();
    return segments;
}
function tierOf(segment) {
    const result = segment.router?.result;
    if (result === null || typeof result !== 'object')
        return undefined;
    const tier = result['tier'];
    return typeof tier === 'string' && tier.length > 0 ? tier : undefined;
}
function coderUsed(observation) {
    const result = observation?.result;
    if (result === null || typeof result !== 'object')
        return undefined;
    const coder = result['coderUsed'];
    return typeof coder === 'string' ? coder : undefined;
}
function completionsOf(segment) {
    const completions = new Map();
    for (const observation of segment.observations) {
        const stage = macroStage(observation.stage);
        if (stage === undefined || observation.tsMs === undefined)
            continue;
        const current = completions.get(stage);
        if (current === undefined || observation.tsMs > current.tsMs) {
            completions.set(stage, { observation, tsMs: observation.tsMs });
        }
    }
    return completions;
}
function usableDelta(from, to) {
    if (from === undefined || to === undefined)
        return undefined;
    const delta = to.tsMs - from.tsMs;
    return delta < 0 || delta > ETA_MAX_STAGE_MS ? undefined : delta;
}
/** Extract one tier-labelled duration per `(runId, tier, stage)`, summing resumed slices. */
export function extractStageSamples(segments) {
    const raw = [];
    for (const segment of segments) {
        const tier = tierOf(segment);
        if (tier === undefined)
            continue;
        const completions = completionsOf(segment);
        let suppressedStage;
        for (let index = 1; index < CHECKPOINT_STAGES.length; index++) {
            const stage = CHECKPOINT_STAGES[index];
            if (stage === suppressedStage)
                continue;
            const current = completions.get(stage);
            if (current === undefined)
                continue;
            let predecessor = completions.get(CHECKPOINT_STAGES[index - 1]);
            let endpoint = current;
            const codexCoded = stage === 'code' && coderUsed(current.observation) === 'codex';
            if (codexCoded) {
                predecessor = completions.get('plan');
                const nextStage = CHECKPOINT_STAGES[index + 1];
                const candidate = nextStage === undefined ? undefined : completions.get(nextStage);
                if (candidate !== undefined) {
                    endpoint = candidate;
                    suppressedStage = nextStage;
                }
                // A dispatch without a measurable landing is preserved as typed UNKNOWN evidence. It has
                // no `ms`, so it cannot leak into a percentile, but it can invalidate an otherwise partial
                // resumed run during coverage normalization.
                if (predecessor === undefined || endpoint === current) {
                    raw.push({
                        runId: segment.runId,
                        tier,
                        stage: 'code',
                        codexCoded: true,
                        incompleteCoverage: true,
                        fromTsMs: predecessor?.tsMs ?? current.tsMs,
                        toTsMs: current.tsMs,
                    });
                    continue;
                }
            }
            const ms = usableDelta(predecessor, endpoint);
            if (ms === undefined || predecessor === undefined) {
                if (codexCoded) {
                    raw.push({
                        runId: segment.runId,
                        tier,
                        stage: 'code',
                        codexCoded: true,
                        incompleteCoverage: true,
                        fromTsMs: predecessor?.tsMs ?? current.tsMs,
                        toTsMs: endpoint.tsMs,
                    });
                }
                continue;
            }
            raw.push({
                runId: segment.runId,
                tier,
                stage,
                ms,
                fromTsMs: predecessor.tsMs,
                toTsMs: endpoint.tsMs,
                ...(codexCoded ? { codexCoded: true, coveredStages: [stage, suppressedStage] } : {}),
            });
        }
    }
    const aggregated = new Map();
    const coverageSlices = [];
    for (const current of raw) {
        if ('incompleteCoverage' in current) {
            coverageSlices.push(current);
            continue;
        }
        if (current.stage === 'code' || current.stage === 'qe') {
            // Pairing code→qe is a slice-level proof. Aggregating these stages now would erase whether
            // every resumed code slice actually acquired a landing witness.
            coverageSlices.push(current);
            continue;
        }
        // Coverage is part of the unit. A resumed run may switch coder family: merging a raw `code`
        // slice with a folded `code+qe` slice here would erase the standalone QE time before the
        // estimator can normalize both shapes.
        const coverage = (current.coveredStages ?? [current.stage]).join('+');
        const key = `${current.runId}\u0000${current.tier}\u0000${current.stage}\u0000${coverage}`;
        const previous = aggregated.get(key);
        if (previous === undefined) {
            aggregated.set(key, current);
            continue;
        }
        aggregated.set(key, {
            runId: current.runId,
            tier: current.tier,
            stage: current.stage,
            ms: previous.ms + current.ms,
            fromTsMs: Math.min(previous.fromTsMs, current.fromTsMs),
            toTsMs: Math.max(previous.toTsMs, current.toTsMs),
            ...(previous.codexCoded === true || current.codexCoded === true ? { codexCoded: true } : {}),
            ...(previous.coveredStages !== undefined || current.coveredStages !== undefined
                ? { coveredStages: [...new Set([...(previous.coveredStages ?? [previous.stage]), ...(current.coveredStages ?? [current.stage])])] }
                : {}),
        });
    }
    return [...aggregated.values(), ...coverageSlices].sort((left, right) => left.runId.localeCompare(right.runId)
        || left.tier.localeCompare(right.tier)
        || CHECKPOINT_STAGES.indexOf(left.stage) - CHECKPOINT_STAGES.indexOf(right.stage)
        || left.fromTsMs - right.fromTsMs);
}
function quantile(sorted, q) {
    if (sorted.length === 0)
        return Number.NaN;
    const position = (sorted.length - 1) * q;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const low = sorted[lower];
    const high = sorted[upper];
    return low + (high - low) * (position - lower);
}
function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
function isoDay(tsMs) {
    return new Date(tsMs).toISOString().slice(0, 10);
}
function evidenceWindow(samples) {
    if (samples.length === 0)
        return {};
    return {
        windowFrom: isoDay(Math.min(...samples.map((sample) => sample.fromTsMs))),
        windowTo: isoDay(Math.max(...samples.map((sample) => sample.toTsMs))),
    };
}
function stageBucket(samples, tier, stage) {
    const byRun = new Map();
    for (const entry of samples) {
        if ('incompleteCoverage' in entry)
            continue;
        if (entry.tier !== tier || entry.stage !== stage || !Number.isFinite(entry.ms) || entry.ms < 0)
            continue;
        const previous = byRun.get(entry.runId);
        byRun.set(entry.runId, previous === undefined ? entry : {
            ...entry,
            ms: previous.ms + entry.ms,
            fromTsMs: Math.min(previous.fromTsMs, entry.fromTsMs),
            toTsMs: Math.max(previous.toTsMs, entry.toTsMs),
            ...(previous.codexCoded === true || entry.codexCoded === true ? { codexCoded: true } : {}),
            ...(previous.coveredStages !== undefined || entry.coveredStages !== undefined
                ? { coveredStages: [...new Set([...(previous.coveredStages ?? [previous.stage]), ...(entry.coveredStages ?? [entry.stage])])] }
                : {}),
        });
    }
    return [...byRun.values()];
}
function statsFor(samples, tier, stage) {
    const bucket = stageBucket(samples, tier, stage);
    const durations = bucket.map((entry) => entry.ms).sort((a, b) => a - b);
    return {
        stage,
        coveredStages: [stage],
        samples: bucket,
        runs: bucket.length,
        p25: quantile(durations, 0.25),
        median: quantile(durations, 0.5),
        p75: quantile(durations, 0.75),
    };
}
/** Normalize Codex's folded code+qe sample and Claude's two ordinary samples to one comparable block. */
function codeQeBucket(samples, tier) {
    const byRun = new Map();
    for (const sample of samples) {
        if (sample.tier !== tier || (sample.stage !== 'code' && sample.stage !== 'qe'))
            continue;
        const parts = byRun.get(sample.runId) ?? { folded: [], rawCode: [], qe: [], incomplete: false };
        if ('incompleteCoverage' in sample)
            parts.incomplete = true;
        else if (sample.stage === 'qe')
            parts.qe.push(sample);
        else if (sample.coveredStages?.includes('qe') === true)
            parts.folded.push(sample);
        else
            parts.rawCode.push(sample);
        byRun.set(sample.runId, parts);
    }
    const bucket = [];
    for (const [runId, parts] of byRun) {
        if (parts.incomplete)
            continue;
        // Every raw code slice needs its own immediately-linked QE slice. One QE somewhere in the run
        // is not evidence that every resumed attempt landed.
        const availableQe = [...parts.qe];
        const pairedQe = [];
        let incomplete = false;
        for (const codeSample of parts.rawCode) {
            const match = availableQe.findIndex((sample) => sample.fromTsMs === codeSample.toTsMs);
            if (match < 0) {
                incomplete = true;
                break;
            }
            pairedQe.push(availableQe.splice(match, 1)[0]);
        }
        if (incomplete)
            continue;
        if (parts.folded.length === 0 && parts.rawCode.length === 0)
            continue;
        const contributing = [...parts.folded, ...parts.rawCode, ...pairedQe];
        bucket.push({
            runId,
            tier,
            stage: 'code',
            ms: contributing.reduce((sum, sample) => sum + sample.ms, 0),
            fromTsMs: Math.min(...contributing.map((sample) => sample.fromTsMs)),
            toTsMs: Math.max(...contributing.map((sample) => sample.toTsMs)),
            coveredStages: ['code', 'qe'],
            ...(parts.folded.some((sample) => sample.codexCoded === true) ? { codexCoded: true } : {}),
        });
    }
    return bucket;
}
function codeQeStats(samples, tier) {
    const bucket = codeQeBucket(samples, tier);
    const durations = bucket.map((entry) => entry.ms).sort((a, b) => a - b);
    return {
        stage: 'code',
        coveredStages: ['code', 'qe'],
        samples: bucket,
        runs: bucket.length,
        p25: quantile(durations, 0.25),
        median: quantile(durations, 0.5),
        p75: quantile(durations, 0.75),
    };
}
function normalizeCoverage(samples, tier) {
    const normalized = codeQeBucket(samples, tier);
    for (const stage of CHECKPOINT_STAGES) {
        if (stage === 'router' || stage === 'code' || stage === 'qe')
            continue;
        normalized.push(...stageBucket(samples, tier, stage));
    }
    return normalized;
}
/** Estimate the remaining macro stages without consulting the filesystem or an ambient clock. */
export function estimateEta(input) {
    if (input.hasCurrentCheckpoints === false)
        return { kind: 'no-checkpoints' };
    if (input.currentTier === undefined || input.currentTier.length === 0)
        return { kind: 'no-tier' };
    const remaining = [...new Set(input.remainingStages)].filter((stage) => stage !== 'router');
    if (remaining.length === 0)
        return { kind: 'no-checkpoints' };
    const statistics = [];
    for (let index = 0; index < remaining.length; index++) {
        const stage = remaining[index];
        const stats = stage === 'code' && remaining.includes('qe')
            ? codeQeStats(input.samples, input.currentTier)
            : statsFor(input.samples, input.currentTier, stage);
        if (stats.runs < 3) {
            const window = evidenceWindow(stats.samples);
            return {
                kind: 'insufficient-history',
                tier: input.currentTier,
                runsFound: stats.runs,
                thinStage: stage,
                ...window,
            };
        }
        statistics.push(stats);
        if (stats.coveredStages.includes('qe'))
            index = Math.max(index, remaining.indexOf('qe'));
    }
    const currentIndex = CHECKPOINT_STAGES.indexOf(input.currentStage);
    const normalizedHistory = normalizeCoverage(input.samples, input.currentTier);
    const normalizedCurrent = normalizeCoverage(input.currentRunSamples, input.currentTier);
    let currentTotal = 0;
    let historicalTotal = 0;
    for (const current of normalizedCurrent) {
        if (current.tier !== input.currentTier || CHECKPOINT_STAGES.indexOf(current.stage) >= currentIndex)
            continue;
        const historical = statsFor(normalizedHistory, input.currentTier, current.stage);
        if (historical.runs < 3 || !Number.isFinite(historical.median) || historical.median <= 0)
            continue;
        currentTotal += current.ms;
        historicalTotal += historical.median;
    }
    const paceFactor = historicalTotal > 0
        ? clamp(currentTotal / historicalTotal, 0.5, 2)
        : 1;
    const elapsed = input.lastCheckpointTsMs !== undefined
        && Number.isFinite(input.lastCheckpointTsMs)
        && Number.isFinite(input.nowMs)
        ? Math.max(0, input.nowMs - input.lastCheckpointTsMs)
        : 0;
    const currentStats = statistics.find((stats) => stats.stage === input.currentStage);
    const currentBound = currentStats === undefined
        ? 0
        : (input.currentStage === 'code' ? currentStats.p75 : currentStats.median) * paceFactor;
    const overrunMs = currentBound > 0 ? Math.max(0, elapsed - currentBound) : 0;
    const remainingValue = (stage, value) => {
        const paced = value * paceFactor;
        if (stage !== input.currentStage || elapsed === 0)
            return paced;
        // Once elapsed time outruns the historical bound, restarting the stale prior would ignore the
        // only live evidence we have. Add the measured overrun so the estimate extends monotonically.
        if (overrunMs > 0)
            return paced + overrunMs;
        return Math.max(0, paced - elapsed);
    };
    const contributing = statistics.flatMap((stats) => stats.samples);
    const window = evidenceWindow(contributing);
    const p25Ms = statistics.reduce((sum, stats) => sum + remainingValue(stats.stage, stats.p25), 0);
    const medianMs = statistics.reduce((sum, stats) => sum + remainingValue(stats.stage, stats.median), 0);
    const p75Ms = statistics.reduce((sum, stats) => sum + remainingValue(stats.stage, stats.p75), 0);
    const presentation = p75Ms / p25Ms > 1.5 ? 'range' : 'point';
    return {
        kind: 'eta',
        presentation,
        p25Ms,
        medianMs,
        p75Ms,
        runsUsed: Math.min(...statistics.map((stats) => stats.runs)),
        tier: input.currentTier,
        paceFactor,
        stagesCovered: [...new Set(statistics.flatMap((stats) => stats.coveredStages))],
        windowFrom: window.windowFrom,
        windowTo: window.windowTo,
    };
}
function displayMinutes(ms) {
    return Math.max(1, Math.ceil(ms / 60_000));
}
/** Render the compact Russian statusline fragment, always including its evidence basis. */
export function formatEta(estimate) {
    switch (estimate.kind) {
        case 'eta': {
            const basis = `n=${estimate.runsUsed} ранам ${estimate.tier}; окно ${estimate.windowFrom}–${estimate.windowTo}`;
            if (estimate.presentation === 'range') {
                return `⏱ ~${displayMinutes(estimate.p25Ms)}–${displayMinutes(estimate.p75Ms)}м (p25–p75 по ${basis})`;
            }
            return `⏱ ~${displayMinutes(estimate.medianMs)}м (медиана по ${basis})`;
        }
        case 'insufficient-history': {
            const window = estimate.windowFrom !== undefined && estimate.windowTo !== undefined
                ? `${estimate.windowFrom}–${estimate.windowTo}`
                : 'нет данных';
            return `ETA: недостаточно истории (n=${estimate.runsFound} ${estimate.tier}; окно ${window})`;
        }
        case 'no-tier':
        case 'no-checkpoints':
            return undefined;
        default: {
            const exhaustive = estimate;
            return exhaustive;
        }
    }
}
//# sourceMappingURL=eta.js.map