/**
 * Per-stage cost ledger with a reconciliation invariant for feature-adr runs
 * (feature `cost-ledger`, ADR-001/ADR-002/ADR-003).
 *
 * A feature-adr run reports ONE number. The recorded run `wf_0576bd7d-797` has
 * `totalTokens: 623290` — the "623k subagent tokens" figure in project memory. That number cannot
 * be attributed to a stage, so "where the budget burns" is a feeling. feature-adr ALREADY labels
 * every stage via `stageLabel()` and the harness ALREADY persists those labels next to per-agent
 * transcripts; nothing joined labels to spend. This module is that join.
 *
 * ## What this is
 *
 * A POST-HOC DERIVER (ADR-001). It reads what is already on disk —
 * `<session>/workflows/wf_<runId>.json` for the stage labels and
 * `<session>/subagents/workflows/<runId>/agent-<agentId>.jsonl` for the spend — and never edits
 * `.claude/workflows/feature-adr.js`. A killed run is still derivable, which a stage-boundary
 * writer could not manage; 5 of 29 recorded runs on this machine are killed.
 *
 * ## The invariant (ADR-002 — the load-bearing half)
 *
 * The obvious run total, the record's own `totalTokens`, is EXACTLY `Σ workflowProgress[].tokens`
 * in 29 of 29 recorded runs. Reconciling against it can never fail: a vacuous gate that would print
 * BALANCED forever and be believed. So the right-hand side comes from the run's transcript
 * DIRECTORY LISTING — a source independent of the record — and both sides run the SAME estimator
 * (`weightedTokensOf`, shared with `dz usage`):
 *
 * ```
 *   accountedTokens + unaccountedTokens      === runTotalTokens
 *   accountedTokens + doubleAttributedTokens === stageTokensSum
 * ```
 *
 * Raw integer equality, no epsilon: rounding happens exactly once, per sample, at extraction.
 * {@link verifyCostLedgerReport} re-derives both identities from the emitted report — the writer
 * clamps, the verifier enforces raw equality (the `event-chain.ts` house pattern). A mismatch is a
 * NAMED defect from {@link COST_LEDGER_DEFECT_KINDS}, never a rounding remainder.
 *
 * ## What this is NOT — read {@link COST_LEDGER_SCOPE} before describing it to anyone
 *
 * The totals are LOCAL TRANSCRIPT ESTIMATES. No billing API is consulted. The invariant therefore
 * catches ATTRIBUTION errors — a double-counted stage, a stage missing from the ledger — and says
 * NOTHING about whether the prices are right. The USD column is a secondary figure derived from a
 * static table that has no `claude-fable` entry, so it falls back to sonnet-class pricing for the
 * default model of every recorded run; the fallback is REPORTED, per ADR-003, not hidden.
 *
 * The ADR-158 reference implementation this feature is grounded in quotes a ~50.5% figure. That
 * number is SYNTHETIC, belongs to their document, and is never a measurement of this repo.
 *
 * @packageDocumentation
 */
import { closeSync, constants, fstatSync, openSync, readSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MODEL_PRICES, hasKnownPricing, usageCost } from './cost-scoring.js';
import { CANONICAL_STAGES, canonicalStage } from './feature-adr-stage-canon.js';
import { resolveLedgerModelProvenance } from './run-records.js';
import { buildStageUsageReport } from './stage-usage.js';
import { parseCodexRollout } from './codex-rollouts.js';
import { fnv1a64 } from './feature-adr-checkpoints.js';
import { createHash } from 'node:crypto';
import { parseTrace } from './loop-trace.js';
import { claudeProjectsRoot, rawTokenMixOf, weightedTokensOf } from './usage.js';
// ── Scope + vocabulary ──────────────────────────────────────
/** The one sentence that states what the ledger is and is not. Printed by EVERY surface (ADR-003). */
export const COST_LEDGER_SCOPE = 'local transcript ESTIMATES, not billed amounts — the reconciliation invariant catches ATTRIBUTION ' +
    'errors (double-counted or missing stages), NOT pricing errors';
/**
 * The defect vocabulary, as data. Deliberately absent: any name implying these are BILLED amounts —
 * that name would assert exactly the promise {@link COST_LEDGER_SCOPE} refuses. A test pins this
 * list so the vocabulary cannot quietly grow such a name.
 */
export const COST_LEDGER_DEFECT_KINDS = [
    'Unaccounted',
    'DoubleAttributed',
    'ForeignSample',
    'MissingStageTranscript',
    'MalformedRecord',
    'TruncatedListing',
];
export const COST_LEDGER_VERDICTS = [
    'BALANCED',
    'DEFECT',
    'INCOMPLETE_INVENTORY',
    'INSUFFICIENT_DATA',
];
/**
 * Default reconciliation tolerance, as a FRACTION of the run total. Zero, because the arithmetic is
 * exact integer — there is no rounding remainder for a tolerance to absorb, so any remainder is a
 * defect. A caller may raise it to tolerate small orphans; its value is always printed.
 */
export const DEFAULT_COST_LEDGER_EPSILON = 0;
/** Guard against a pathological run directory degrading into a hang. */
const MAX_RUN_TRANSCRIPT_FILES = 2_000;
/** `--run` / `--slug` become path segments; only these shapes are ever joined onto a root. */
const RUN_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const SLUG_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
// ── Small clamped helpers ───────────────────────────────────
function finiteNonNegative(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}
function nonEmptyString(v) {
    return typeof v === 'string' && v.length > 0 ? v : null;
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isoOrNull(ms) {
    if (ms === null || !Number.isFinite(ms) || Math.abs(ms) > 8.64e15)
        return null;
    try {
        return new Date(ms).toISOString();
    }
    catch {
        return null;
    }
}
// ── PURE: transcript sample extraction ──────────────────────
/**
 * Extract deduped, weighted usage samples from ONE transcript's text. Pure and never-throw — a
 * corrupt line is skipped, exactly as `computeUsage` does.
 *
 * `weighted` is `Math.round(weightedTokensOf(...))`: the SINGLE rounding point of the feature, so
 * every sum downstream is exact integer arithmetic and the reconciliation identity is raw equality
 * rather than a float comparison (ADR-002).
 */
export function extractCostSamples(text) {
    const out = [];
    if (typeof text !== 'string' || text.length === 0)
        return out;
    const seen = new Set();
    for (const line of text.split('\n')) {
        if (line.length === 0)
            continue;
        if (line.indexOf('usage') === -1)
            continue; // cheap pre-filter before the parse
        let rec;
        try {
            rec = JSON.parse(line);
        }
        catch {
            continue; // corrupt line — skip, never throw
        }
        if (!isRecord(rec))
            continue;
        const message = isRecord(rec['message']) ? rec['message'] : {};
        const usage = isRecord(message['usage']) ? message['usage'] : null;
        if (usage === null)
            continue;
        const weighted = Math.round(weightedTokensOf(usage));
        if (!Number.isFinite(weighted) || weighted <= 0)
            continue;
        const mix = rawTokenMixOf(usage);
        const tsRaw = rec['timestamp'];
        let ts = null;
        if (typeof tsRaw === 'number' && Number.isFinite(tsRaw))
            ts = tsRaw;
        else if (typeof tsRaw === 'string') {
            const parsed = Date.parse(tsRaw);
            ts = Number.isFinite(parsed) ? parsed : null;
        }
        const model = nonEmptyString(message['model']) ?? nonEmptyString(rec['model']);
        const id = nonEmptyString(message['id']) ?? '';
        const reqId = nonEmptyString(rec['requestId']) ?? '';
        // With no ids, fall back to a CONTENT key including the raw vector + model: `{input:50}` and
        // `{output:10}` both weigh 50, so a total-only key would silently merge distinct records.
        // The WEIGHTED value is part of the anon key (Codex QE MED): two calls with identical raw
        // totals but different cache-TTL classes weigh differently (125 vs 200) — a key blind to the
        // weight would merge them and the ledger could stay BALANCED with a call missing.
        const key = id !== '' || reqId !== ''
            ? id + ':' + reqId
            : `anon:${String(ts)}:${mix.input}:${mix.cacheWrite}:${mix.cacheRead}:${mix.output}:${model ?? ''}:${weighted}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ key, ts, weighted, ...mix, model });
    }
    return out;
}
// ── PURE: run-record parsing ────────────────────────────────
/**
 * Parse a `wf_<runId>.json` object into a {@link WorkflowRunRecord}. Pure and never-throw; every
 * number is clamped and every unusable field is RECORDED in `malformed` rather than dropped, so it
 * can surface as a `MalformedRecord` defect (the vocabulary refuses silent ignores).
 *
 * `args` is stored as a JSON STRING in the recorded runs on this machine and as an object in
 * others; both shapes are accepted.
 */
export function parseWorkflowRunRecord(raw) {
    if (!isRecord(raw))
        return null;
    const runId = nonEmptyString(raw['runId']);
    if (runId === null)
        return null;
    const malformed = [];
    let slug = null;
    const args = raw['args'];
    if (isRecord(args)) {
        slug = nonEmptyString(args['slug']);
    }
    else if (typeof args === 'string' && args.length > 0) {
        try {
            const parsed = JSON.parse(args);
            if (isRecord(parsed))
                slug = nonEmptyString(parsed['slug']);
        }
        catch {
            const m = /"slug"\s*:\s*"([^"]+)"/.exec(args);
            slug = m ? (m[1] ?? null) : null;
        }
    }
    const stages = [];
    const progress = raw['workflowProgress'];
    if (progress !== undefined && !Array.isArray(progress)) {
        malformed.push('workflowProgress is not an array');
    }
    if (Array.isArray(progress)) {
        for (let i = 0; i < progress.length; i += 1) {
            const e = progress[i];
            if (!isRecord(e) || e['type'] !== 'workflow_agent')
                continue;
            const label = nonEmptyString(e['label']);
            const agentId = nonEmptyString(e['agentId']);
            if (label === null || agentId === null) {
                malformed.push(`workflowProgress[${i}]: workflow_agent without ${label === null ? 'label' : 'agentId'}`);
                continue;
            }
            stages.push({
                label,
                agentId,
                model: nonEmptyString(e['model']) ?? 'unknown',
                phase: nonEmptyString(e['phaseTitle']),
                startedAtMs: finiteNonNegative(e['startedAt']),
                durationMs: finiteNonNegative(e['durationMs']),
                state: nonEmptyString(e['state']),
                recordTokens: finiteNonNegative(e['tokens']),
            });
        }
    }
    return {
        runId,
        workflowName: nonEmptyString(raw['workflowName']),
        slug,
        status: nonEmptyString(raw['status']),
        startedAtMs: finiteNonNegative(raw['startTime']),
        durationMs: finiteNonNegative(raw['durationMs']),
        recordTotalTokens: finiteNonNegative(raw['totalTokens']),
        stages,
        malformed,
    };
}
/**
 * Build the report and evaluate the invariant. PURE — no filesystem, no clock. Every number that
 * enters is clamped here (the writer clamps; {@link verifyCostLedgerReport} enforces raw equality).
 */
export function buildCostLedger(input) {
    const { record } = input;
    const epsilonRaw = input.epsilon;
    const epsilon = typeof epsilonRaw === 'number' && Number.isFinite(epsilonRaw) && epsilonRaw >= 0 && epsilonRaw <= 1
        ? epsilonRaw
        : DEFAULT_COST_LEDGER_EPSILON;
    const defects = [];
    for (const m of record.malformed)
        defects.push({ kind: 'MalformedRecord', detail: m });
    // A capped listing means the right-hand side is PARTIAL — BALANCED must be impossible on it.
    if (input.transcriptListingTruncated === true) {
        defects.push({
            kind: 'TruncatedListing',
            detail: `transcript listing hit the ${MAX_RUN_TRANSCRIPT_FILES}-file cap — the run total is incomplete, no verdict may rest on it`,
        });
    }
    // Every sample number is CLAMPED here (Codex QE MED): the contract says the writer clamps, and a
    // negative/non-finite `weighted` sliding through would make negative totals read BALANCED.
    const clampSample = (s) => {
        const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
        return { ...s, weighted: n(s.weighted), input: n(s.input), cacheWrite: n(s.cacheWrite), cacheRead: n(s.cacheRead), output: n(s.output) };
    };
    input = {
        ...input,
        runSamples: input.runSamples.map(clampSample),
        stageSamples: input.stageSamples.map((e) => ({ agentId: e.agentId, samples: e.samples.map(clampSample) })),
        ...(input.orphanTranscripts !== undefined
            ? { orphanTranscripts: input.orphanTranscripts.map((e) => ({ agentId: e.agentId, samples: e.samples.map(clampSample) })) }
            : {}),
    };
    // RIGHT — the run's universe, deduped by sample key.
    const universe = new Map();
    for (const s of input.runSamples)
        if (!universe.has(s.key))
            universe.set(s.key, s);
    let runTotalTokens = 0;
    for (const s of universe.values())
        runTotalTokens += s.weighted;
    // LEFT — per stage, joined agentId → label. Several agents may share one label.
    const byAgent = new Map();
    for (const e of input.stageSamples)
        if (!byAgent.has(e.agentId))
            byAgent.set(e.agentId, e.samples);
    // measurement-integrity FR-4: a bucket is now keyed by (label, occurrence) rather than by label
    // alone — a label repeated N times in `record.stages` (a retried stage) produces N buckets, each
    // its own row, instead of one row silently summing N attempts together. `labelTotalCount` is a
    // first pass so every occurrence's row can carry the SAME `attempts` total, including the first.
    const labelTotalCount = new Map();
    for (const stage of record.stages)
        labelTotalCount.set(stage.label, (labelTotalCount.get(stage.label) ?? 0) + 1);
    const labelSeen = new Map();
    const buckets = new Map();
    const bucketOrder = [];
    const keyOwners = new Map();
    const foreign = [];
    const conflicting = [];
    const missingTranscript = [];
    let stageTokensSum = 0;
    for (const stage of record.stages) {
        const samples = byAgent.get(stage.agentId) ?? [];
        if (samples.length === 0)
            missingTranscript.push(`${stage.label} (${stage.agentId})`);
        const attempt = (labelSeen.get(stage.label) ?? 0) + 1;
        labelSeen.set(stage.label, attempt);
        const attempts = labelTotalCount.get(stage.label) ?? 1;
        // measurement-integrity fix-round-1/F11 (Codex r1 MEDIUM #11): the key used to be a NUL-
        // delimited template literal (`${stage.label}\0${attempt}`) - readable in an editor as a plain
        // space because NUL renders invisibly, but NUL is a LEGAL JSON-string character (the same
        // delimiter-ambiguity class `stageCostAggregates` below already fixed for its own key). An
        // unambiguous JSON-tuple serialization removes the theoretical collision outright, and matches
        // the pattern already used two functions down in this file.
        const bucketKey = JSON.stringify([stage.label, attempt]);
        let b = buckets.get(bucketKey);
        if (b === undefined) {
            b = {
                stage: stage.label,
                attempt,
                attempts,
                phase: stage.phase,
                models: new Set(),
                agentIds: [],
                claims: [],
                sum: 0,
                startedAtMs: null,
                endedAtMs: null,
                costUsd: 0,
                familyCostUsd: null,
                pricingKnown: true,
            };
            buckets.set(bucketKey, b);
            bucketOrder.push(bucketKey);
        }
        b.models.add(stage.model);
        b.agentIds.push(stage.agentId);
        if (stage.startedAtMs !== null) {
            b.startedAtMs = b.startedAtMs === null ? stage.startedAtMs : Math.min(b.startedAtMs, stage.startedAtMs);
            const end = stage.durationMs === null ? stage.startedAtMs : stage.startedAtMs + stage.durationMs;
            b.endedAtMs = b.endedAtMs === null ? end : Math.max(b.endedAtMs, end);
        }
        const rateKey = Object.keys(MODEL_PRICES).filter((key) => stage.model.toLowerCase().replace(/^[a-z0-9-]+\//, '').startsWith(key)).sort((a, b) => b.length - a.length)[0];
        const exactPrice = rateKey === stage.model.toLowerCase() && !rateKey?.includes('claude');
        if (!exactPrice)
            b.pricingKnown = false;
        // Price per AGENT, using that agent's own model, then aggregate — a `mixed` label must not be
        // priced at one arbitrary model's rate.
        let mix = { promptTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, completionTokens: 0 };
        for (const s of samples) {
            if (!universe.has(s.key)) {
                foreign.push(s.key);
                continue; // NEVER add a sample outside the run's universe — it would break the identity
            }
            const canonical = universe.get(s.key);
            if (canonical !== undefined && canonical.weighted !== s.weighted)
                conflicting.push(s.key);
            stageTokensSum += s.weighted;
            b.sum += s.weighted;
            b.claims.push(s);
            let owners = keyOwners.get(s.key);
            if (owners === undefined) {
                owners = new Set();
                keyOwners.set(s.key, owners);
            }
            owners.add(stage.label);
            mix = {
                promptTokens: mix.promptTokens + s.input,
                cachedInputTokens: mix.cachedInputTokens + s.cacheRead,
                cacheCreationTokens: mix.cacheCreationTokens + s.cacheWrite,
                completionTokens: mix.completionTokens + s.output,
            };
        }
        const cost = hasKnownPricing(stage.model) ? usageCost(mix, stage.model) : null;
        if (cost !== null && Number.isFinite(cost)) {
            if (exactPrice)
                b.costUsd += cost;
            else
                b.familyCostUsd = (b.familyCostUsd ?? 0) + cost;
        }
    }
    // accountedTokens — the DEDUPED union of stage-claimed samples, so a double-claim inflates
    // `stageTokensSum` without inflating this. That difference IS `doubleAttributedTokens`.
    let accountedTokens = 0;
    for (const key of keyOwners.keys()) {
        const s = universe.get(key);
        if (s !== undefined)
            accountedTokens += s.weighted;
    }
    const unaccountedTokens = runTotalTokens - accountedTokens;
    const doubleAttributedTokens = stageTokensSum - accountedTokens;
    const rows = [];
    for (const b of buckets.values()) {
        let tokensIn = 0;
        let tokensCacheWrite = 0;
        let tokensCacheRead = 0;
        let tokensOut = 0;
        // Sum over CLAIMS, not over deduped keys. `weightedTokens` must equal this bucket's
        // contribution to `stageTokensSum` (the verifier asserts Σ rows === stageTokensSum), so the raw
        // columns and `calls` have to count the same way — otherwise a double-attributed run shows a
        // weighted total its own in/out columns contradict.
        for (const s of b.claims) {
            tokensIn += s.input;
            tokensCacheWrite += s.cacheWrite;
            tokensCacheRead += s.cacheRead;
            tokensOut += s.output;
        }
        const models = [...b.models].sort();
        rows.push({
            runId: record.runId,
            slug: record.slug,
            stage: b.stage,
            stageCanonical: canonicalStage(b.stage).stage,
            attempt: b.attempt,
            attempts: b.attempts,
            phase: b.phase,
            model: models.length === 1 ? (models[0] ?? 'unknown') : 'mixed',
            agentIds: b.agentIds,
            tokensIn,
            tokensCacheWrite,
            tokensCacheRead,
            tokensOut,
            weightedTokens: b.sum,
            costUsd: b.pricingKnown ? b.costUsd : null,
            knownEstimatedCostUsd: b.costUsd,
            familyEstimatedCostUsd: b.pricingKnown ? null : b.familyCostUsd,
            pricingProvenance: models.map((model) => {
                const normalized = model.toLowerCase().replace(/^[a-z0-9-]+\//, '');
                const tableKey = Object.keys(MODEL_PRICES).filter((key) => normalized.startsWith(key)).sort((a, b) => b.length - a.length)[0] ?? null;
                return { model, tableKey, matchKind: tableKey === null ? 'unknown' : tableKey === normalized && !tableKey.includes('claude') ? 'exact' : 'family-estimate',
                    source: 'MODEL_PRICES static snapshot', fingerprint: fnv1a64(JSON.stringify(MODEL_PRICES)), current: false, billed: false };
            }),
            pricingKnown: b.pricingKnown,
            startedTs: isoOrNull(b.startedAtMs),
            endedTs: isoOrNull(b.endedAtMs),
            calls: b.claims.length,
        });
    }
    rows.sort((a, z) => z.weightedTokens - a.weightedTokens || a.stage.localeCompare(z.stage) || a.attempt - z.attempt);
    // ── orphan-transcript inventory (measurement-integrity FR-3 / ADR-001 D2) ──
    // A transcript present in the run's directory with no `workflowProgress[]` entry is named
    // explicitly here, rather than dissolved into the generic `Unaccounted` defect the way it was
    // before this feature. `orphanTranscripts` is ALWAYS present in the report (count 0 when there are
    // none) — additive, never a replacement for `unaccountedTokens`.
    let orphanTokens = 0;
    let orphanIds = [];
    let orphanMethod = 'count-fallback';
    if (input.orphanTranscripts !== undefined) {
        orphanMethod = 'per-transcript';
        const seenOrphanKeys = new Set();
        for (const o of input.orphanTranscripts) {
            if (typeof o.agentId === 'string' && o.agentId.length > 0)
                orphanIds.push(o.agentId);
            for (const s of o.samples) {
                if (seenOrphanKeys.has(s.key))
                    continue;
                seenOrphanKeys.add(s.key);
                orphanTokens += s.weighted;
            }
        }
    }
    else {
        orphanIds = (input.orphanAgentIds ?? []).filter((x) => typeof x === 'string' && x.length > 0);
        if (orphanIds.length > 0) {
            // No per-transcript samples were supplied — `orphanTokens` is still reported as the
            // reconciliation's own `unaccountedTokens` (an honest BEST ESTIMATE, never invented) so a
            // reader can see roughly how much spend is implicated. measurement-integrity fix-round-1/F1
            // (Codex r1 CRITICAL #1): this figure is NO LONGER used below to shrink the `Unaccounted`
            // defect — count-fallback's `orphanExplained` stays 0. The old behavior treated the WHOLE
            // remainder as "orphan-explained" and could downgrade a genuine `DEFECT` (unattributed spend
            // whose CAUSE is not actually known — a count-fallback orphan is a NAME, not a subtraction
            // proof) into a merely-incomplete `INCOMPLETE_INVENTORY`. Only the EXACT `'per-transcript'`
            // method — which sums real extracted samples — is trusted to reduce the residual.
            orphanTokens = unaccountedTokens;
        }
    }
    // ── named defects ──
    const tolerance = Math.floor(epsilon * runTotalTokens);
    if (unaccountedTokens > tolerance) {
        // ONLY the portion NOT already explained by a named orphan transcript is a genuine `Unaccounted`
        // defect — and ONLY the exact `'per-transcript'` method may explain any of it (F1 above).
        const orphanExplained = orphanMethod === 'per-transcript' ? Math.min(orphanTokens, unaccountedTokens) : 0;
        const residual = unaccountedTokens - orphanExplained;
        if (residual > 0) {
            defects.push({
                kind: 'Unaccounted',
                detail: orphanIds.length > 0
                    ? 'run spend is attributed to no stage, beyond what the named orphan transcripts explain'
                    : 'run spend is attributed to no stage',
                tokens: residual,
            });
        }
    }
    const doubleClaimed = [...keyOwners.entries()].filter(([, owners]) => owners.size > 1);
    if (doubleAttributedTokens > 0 || doubleClaimed.length > 0) {
        const stagesInvolved = new Set();
        for (const [, owners] of doubleClaimed)
            for (const o of owners)
                stagesInvolved.add(o);
        defects.push({
            kind: 'DoubleAttributed',
            detail: `${doubleClaimed.length} usage sample(s) claimed by more than one stage`,
            tokens: doubleAttributedTokens,
            subjects: [...stagesInvolved].sort(),
        });
    }
    if (foreign.length > 0) {
        defects.push({
            kind: 'ForeignSample',
            detail: `${foreign.length} stage sample(s) absent from the run's transcript directory`,
            subjects: foreign.slice(0, 10),
        });
    }
    if (conflicting.length > 0) {
        defects.push({
            kind: 'MalformedRecord',
            detail: `${conflicting.length} sample(s) extracted to different token values in two files — the extractor is not deterministic`,
            subjects: conflicting.slice(0, 10),
        });
    }
    if (missingTranscript.length > 0) {
        defects.push({
            kind: 'MissingStageTranscript',
            detail: `${missingTranscript.length} stage(s) in the run record have no usage samples`,
            subjects: missingTranscript,
        });
    }
    const identityHolds = accountedTokens + unaccountedTokens === runTotalTokens &&
        accountedTokens + doubleAttributedTokens === stageTokensSum;
    if (!identityHolds) {
        defects.push({
            kind: 'MalformedRecord',
            detail: `reconciliation identity broken: accounted ${accountedTokens} + unaccounted ${unaccountedTokens} ` +
                `!= total ${runTotalTokens}, or + double ${doubleAttributedTokens} != stageSum ${stageTokensSum}`,
        });
    }
    // measurement-integrity fix-round-1/F1 (Codex r1 CRITICAL #1): a named orphan transcript makes the
    // inventory incomplete REGARDLESS of tokens or epsilon — an orphan with zero usage samples
    // (`orphanTokens === 0`) or one whose spend happens to fall under a generous epsilon is STILL a
    // transcript the inventory does not know about. Equality of SUMS never proves attribution; the
    // epsilon budget is about tolerating a small unattributable REMAINDER (the generic `Unaccounted`
    // defect above, which still honors `tolerance`), never about excusing a NAMED gap in the inventory
    // itself. `hasOrphan` therefore no longer reads `orphanTokens`/`tolerance` at all.
    const hasOrphan = orphanIds.length > 0;
    // INSUFFICIENT_DATA is NOT success (ADR-003): no samples means nothing was measured, and a
    // "0 === 0, so it balances" shortcut would let an absent transcript store read as a clean run.
    //
    // measurement-integrity ADR-001 D2: INCOMPLETE_INVENTORY outranks BALANCED (an orphan transcript
    // can never read as balanced) and is outranked by DEFECT (a genuine attribution defect — one NOT
    // fully explained by a named orphan — is worse than "the inventory is incomplete but everything it
    // does have reconciles").
    const verdict = runTotalTokens === 0 && stageTokensSum === 0
        ? 'INSUFFICIENT_DATA'
        : defects.length > 0
            ? 'DEFECT'
            : hasOrphan
                ? 'INCOMPLETE_INVENTORY'
                : 'BALANCED';
    const knownEstimatedCostUsd = rows.reduce((n, r) => n + (r.knownEstimatedCostUsd ?? 0), 0);
    const totalCostUsd = rows.every((r) => r.costUsd !== null) ? knownEstimatedCostUsd : null;
    const fallbackModels = [...new Set(record.stages.filter((s) => !hasKnownPricing(s.model)).map((s) => s.model))].sort();
    const byCanonicalStage = {};
    for (const k of [...CANONICAL_STAGES, 'unknown', 'unattributed'])
        byCanonicalStage[k] = { tokens: 0, agents: 0, attempts: 0 };
    for (const row of rows) {
        const bucket = byCanonicalStage[row.stageCanonical];
        bucket.tokens += row.weightedTokens;
        bucket.agents += row.agentIds.length;
        bucket.attempts += 1;
    }
    byCanonicalStage.unattributed = { tokens: orphanTokens, agents: orphanIds.length, attempts: orphanIds.length };
    return {
        runId: record.runId,
        slug: record.slug,
        workflowName: record.workflowName,
        status: record.status,
        startedTs: isoOrNull(record.startedAtMs),
        rows,
        byCanonicalStage,
        reconciliation: {
            runTotalTokens,
            accountedTokens,
            stageTokensSum,
            unaccountedTokens,
            doubleAttributedTokens,
            epsilon,
            identityHolds,
            verdict,
            defects,
            orphanTranscripts: { count: orphanIds.length, tokens: orphanTokens, ids: orphanIds, method: orphanMethod },
        },
        recordTotalTokens: record.recordTotalTokens,
        totalCostUsd,
        knownEstimatedCostUsd,
        pricingFallbackModels: fallbackModels,
        estimated: true,
        scope: COST_LEDGER_SCOPE,
    };
}
/**
 * Re-derive both identities from an EMITTED report — the verifier half of the house pattern. It
 * trusts nothing the builder computed except the numbers it printed, so a future writer bug shows
 * up as a `MalformedRecord` finding instead of a plausible table.
 */
export function verifyCostLedgerReport(report) {
    const out = [];
    const r = report.reconciliation;
    const nums = [r.runTotalTokens, r.accountedTokens, r.stageTokensSum, r.unaccountedTokens, r.doubleAttributedTokens];
    if (nums.some((n) => !Number.isFinite(n))) {
        out.push({ kind: 'MalformedRecord', detail: 'reconciliation carries a non-finite number' });
        return out;
    }
    if (r.accountedTokens + r.unaccountedTokens !== r.runTotalTokens) {
        out.push({
            kind: 'MalformedRecord',
            detail: `accounted ${r.accountedTokens} + unaccounted ${r.unaccountedTokens} !== runTotal ${r.runTotalTokens}`,
        });
    }
    if (r.accountedTokens + r.doubleAttributedTokens !== r.stageTokensSum) {
        out.push({
            kind: 'MalformedRecord',
            detail: `accounted ${r.accountedTokens} + double ${r.doubleAttributedTokens} !== stageSum ${r.stageTokensSum}`,
        });
    }
    let rowSum = 0;
    for (const row of report.rows)
        rowSum += row.weightedTokens;
    if (rowSum !== r.stageTokensSum) {
        out.push({ kind: 'MalformedRecord', detail: `Σ rows ${rowSum} !== stageSum ${r.stageTokensSum}` });
    }
    if (!COST_LEDGER_VERDICTS.includes(r.verdict)) {
        out.push({ kind: 'MalformedRecord', detail: `unknown verdict ${String(r.verdict)}` });
    }
    return out;
}
// ── PURE: FR-8 feed-forward reader ──────────────────────────
/**
 * Aggregate per-stage cost across runs, for a future auto-cost router that today chooses models
 * from a STATIC assumptions table.
 *
 * **WIRING INTO ROUTING IS OUT OF SCOPE for this feature** — this returns data and nothing consumes
 * it yet. That is deliberate: an ESTIMATED number must not drive an expensive routing decision
 * until it has been calibrated. Rows from runs whose verdict is not `BALANCED` are EXCLUDED, so a
 * run with a known attribution defect can never quietly become a routing input.
 */
export function stageCostAggregates(reports) {
    const acc = new Map();
    for (const report of reports) {
        // measurement-integrity T2: `!== 'BALANCED'` already excludes `INCOMPLETE_INVENTORY` — a run
        // with a named orphan transcript is exactly as unfit for a routing input as one with a DoubleAttributed
        // defect, and this single comparison against the full 4-value vocabulary keeps excluding it
        // without a second branch to forget.
        if (report.reconciliation.verdict !== 'BALANCED')
            continue;
        for (const row of report.rows) {
            // JSON-tuple key (Codex QE LOW): NUL is a LEGAL JSON-string character, so even a NUL join
            // can collide when labels themselves contain NUL — the same delimiter-ambiguity class the
            // guard-promotion digest fixed. Unambiguous serialization beats a cleverer separator.
            const key = JSON.stringify([row.stage, row.model]);
            let a = acc.get(key);
            if (a === undefined) {
                a = { stage: row.stage, model: row.model, total: 0, cost: 0, runs: new Set() };
                acc.set(key, a);
            }
            a.total += row.weightedTokens;
            a.cost = a.cost === null || row.costUsd === null ? null : a.cost + row.costUsd;
            a.runs.add(row.runId);
        }
    }
    const out = [];
    for (const a of acc.values()) {
        const runs = a.runs.size;
        out.push({
            stage: a.stage,
            model: a.model,
            avgTokens: runs > 0 ? Math.round(a.total / runs) : 0,
            runs,
            totalTokens: a.total,
            avgCostUsd: a.cost === null ? null : runs > 0 ? a.cost / runs : 0,
        });
    }
    out.sort((x, y) => y.avgTokens - x.avgTokens || x.stage.localeCompare(y.stage));
    return out;
}
// ── PURE: rendering + serialization ─────────────────────────
function fmt(n) {
    if (!Number.isFinite(n))
        return '?';
    return Math.round(n).toLocaleString('en-US');
}
function usd(n) {
    if (n === null)
        return 'unavailable';
    if (!Number.isFinite(n) || n <= 0)
        return '$0.00';
    return '$' + n.toFixed(n < 1 ? 4 : 2);
}
function pad(s, width) {
    return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
function padLeft(s, width) {
    return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}
/** Human table + reconciliation line + verdict + the honest-scope note (ADR-003). */
export function renderCostLedger(report) {
    const lines = [];
    const head = [
        `run ${report.runId}`,
        report.slug !== null ? `slug ${report.slug}` : null,
        report.workflowName !== null ? report.workflowName : null,
        report.status !== null ? report.status : null,
        report.startedTs !== null ? report.startedTs : null,
    ]
        .filter((x) => x !== null)
        .join(' · ');
    lines.push(`usage --by-stage: ${head}`);
    const r = report.reconciliation;
    if (report.rows.length === 0) {
        lines.push('usage --by-stage: no stage rows — nothing was measured for this run');
    }
    else {
        const stageW = Math.max(5, ...report.rows.map((x) => x.stage.length));
        const modelW = Math.max(5, ...report.rows.map((x) => x.model.length));
        lines.push(`  ${pad('stage', stageW)}  ${pad('model', modelW)}  ${padLeft('weighted', 12)}  ${padLeft('in', 9)}  ${padLeft('out', 9)}  ${padLeft('calls', 5)}  ${padLeft('~USD', 9)}`);
        for (const row of report.rows) {
            lines.push(`  ${pad(row.stage, stageW)}  ${pad(row.model, modelW)}  ${padLeft(fmt(row.weightedTokens), 12)}  ${padLeft(fmt(row.tokensIn), 9)}  ${padLeft(fmt(row.tokensOut), 9)}  ${padLeft(String(row.calls), 5)}  ${padLeft(usd(row.costUsd) + (row.pricingKnown ? '' : '*'), 9)}`);
        }
    }
    const pctUn = r.runTotalTokens > 0 ? (100 * r.unaccountedTokens) / r.runTotalTokens : 0;
    lines.push(`  reconciliation: accounted ${fmt(r.accountedTokens)} + unaccounted ${fmt(r.unaccountedTokens)} = run total ${fmt(r.runTotalTokens)}` +
        ` (epsilon ${(r.epsilon * 100).toFixed(2)}%, unaccounted ${pctUn.toFixed(1)}%)`);
    if (r.doubleAttributedTokens !== 0) {
        lines.push(`  reconciliation: accounted ${fmt(r.accountedTokens)} + double-attributed ${fmt(r.doubleAttributedTokens)} = Σ stages ${fmt(r.stageTokensSum)}`);
    }
    lines.push(`  identity: ${r.identityHolds ? 'holds (raw integer equality)' : 'BROKEN'}`);
    lines.push(`  verdict: ${r.verdict}`);
    for (const d of r.defects) {
        const tok = d.tokens === undefined ? '' : ` (${fmt(d.tokens)} weighted tokens)`;
        const subj = d.subjects === undefined || d.subjects.length === 0 ? '' : ` [${d.subjects.slice(0, 6).join(', ')}${d.subjects.length > 6 ? ', …' : ''}]`;
        lines.push(`    ${d.kind}: ${d.detail}${tok}${subj}`);
    }
    if (r.orphanTranscripts.count > 0) {
        const idsPreview = r.orphanTranscripts.ids.slice(0, 6).join(', ') + (r.orphanTranscripts.ids.length > 6 ? ', …' : '');
        lines.push(`  orphanTranscripts: ${r.orphanTranscripts.count} transcript(s) with no inventory row, ${fmt(r.orphanTranscripts.tokens)} weighted tokens ` +
            `(${r.orphanTranscripts.method}) [${idsPreview}]`);
    }
    // measurement-integrity FR-2/T1: the canon block — one line per non-empty bucket, `unattributed`
    // (orphan tokens) and `unknown` (unrecognised verbatim labels) LAST so the named canon reads first.
    const canonEntries = Object.entries(report.byCanonicalStage).filter(([, v]) => v.tokens > 0 || v.attempts > 0);
    if (canonEntries.length > 0) {
        canonEntries.sort(([a], [z]) => {
            const rank = (k) => (k === 'unknown' ? 2 : k === 'unattributed' ? 3 : 1);
            return rank(a) - rank(z) || a.localeCompare(z);
        });
        lines.push('  by canonical stage:');
        for (const [stage, agg] of canonEntries) {
            lines.push(`    ${pad(stage, 14)} ${padLeft(fmt(agg.tokens), 12)} tok  ${padLeft(String(agg.agents), 4)} agent(s)  ${padLeft(String(agg.attempts), 4)} attempt(s)`);
        }
    }
    if (report.recordTotalTokens !== null) {
        lines.push(`  note: the run record's own totalTokens is ${fmt(report.recordTotalTokens)} — a RAW unweighted cached sum of the same per-agent list, reported for traceability, NOT the invariant's right-hand side`);
    }
    if (report.pricingFallbackModels.length > 0) {
        lines.push(`  note: primary ~USD unavailable; FALLBACK pricing is not used for: ${report.pricingFallbackModels.join(', ')}`);
    }
    lines.push(`  scope: ${COST_LEDGER_SCOPE}`);
    return lines.join('\n');
}
/**
 * FR-7 serialization: one JSON object per line. The first line is a `kind: "cost-ledger-scope"`
 * header carrying {@link COST_LEDGER_SCOPE}, so the honest scope travels with the file; the last is
 * the reconciliation. This is a REGENERABLE REPORT, never a read-back source of truth (ADR-001).
 */
export function costLedgerJsonl(report) {
    const lines = [];
    lines.push(JSON.stringify({
        kind: 'cost-ledger-scope',
        runId: report.runId,
        slug: report.slug,
        estimated: true,
        derived: true,
        scope: COST_LEDGER_SCOPE,
    }));
    for (const row of report.rows)
        lines.push(JSON.stringify({ kind: 'cost-ledger-row', ...row }));
    lines.push(JSON.stringify({ kind: 'cost-ledger-reconciliation', ...report.reconciliation }));
    return lines.join('\n') + '\n';
}
function safeReadJson(path) {
    try {
        const st = lstatSync(path);
        if (!st.isFile())
            return null;
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
function safeReadText(path) {
    try {
        const st = lstatSync(path);
        if (!st.isFile())
            return '';
        return readFileSync(path, 'utf-8');
    }
    catch {
        return '';
    }
}
function safeListDir(path) {
    try {
        const st = lstatSync(path);
        if (!st.isDirectory())
            return [];
        return readdirSync(path);
    }
    catch {
        return [];
    }
}
/**
 * List a PROJECT directory, following a symlink at that ONE level.
 *
 * The asymmetry against {@link safeListDir} is deliberate and load-bearing. `usage.ts` refuses to
 * follow symlinked project directories, and rightly — an account-wide scan that follows links can
 * be pointed at an unbounded tree. But this repo ROAMS its own transcript store: the entry
 * `~/.claude/projects/-home-dz-projects-2026-dz-harness-hub` is a symlink to
 * `<repo>/roam/claude-state` (MEASURED — reproducer: `readlink` on that path). With a plain `lstat`
 * gate the ledger found 0 of this project's 29 run records: the feature was blind to exactly the
 * project it exists to measure.
 *
 * So: the project level follows one link; EVERY level below still uses `lstat` and never follows.
 * That keeps the hazards `usage.ts` guards against — a symlinked session directory, a FIFO or a
 * link to a huge file where a transcript should be — while making the roaming layout readable. The
 * ledger is also per-RUN, not account-wide, so the unbounded-walk concern does not apply.
 */
function safeListProjectDir(path) {
    try {
        if (!statSync(path).isDirectory())
            return [];
        return readdirSync(path);
    }
    catch {
        return [];
    }
}
/**
 * Enumerate workflow run records, newest first. NEVER throws — an unreadable tree yields `[]`.
 * READONLY. `lstat` everywhere, so a symlinked session or run directory is never walked.
 */
export function listCostLedgerRuns(opts = {}) {
    const root = opts.projectsRoot ?? claudeProjectsRoot();
    const out = [];
    if (!root || !existsSync(root))
        return out;
    const projectDirs = opts.projectDir !== undefined && opts.projectDir.length > 0 ? [opts.projectDir] : safeListDir(root);
    // Two project-dir ALIASES to one transcript tree (~/.claude/projects entries are symlinks on this
    // machine) would double-discover every run: FR-8 then derives the same run twice and halves into a
    // 2x average (Codex QE MED). Canonicalize and visit each real tree once; runIds dedupe as a belt.
    const seenRealProj = new Set();
    const seenRunIds = new Set();
    for (const proj of projectDirs) {
        // A project dir name is data from the filesystem, but `opts.projectDir` is caller-supplied.
        if (proj.includes('/') || proj.includes('\\') || proj === '.' || proj === '..')
            continue;
        const projPath = join(root, proj);
        let realProj = projPath;
        try {
            realProj = realpathSync(projPath);
        }
        catch { /* keep the lexical path */ }
        if (seenRealProj.has(realProj))
            continue;
        seenRealProj.add(realProj);
        for (const sess of safeListProjectDir(projPath)) {
            if (sess.endsWith('.jsonl'))
                continue;
            const wfDir = join(projPath, sess, 'workflows');
            for (const f of safeListDir(wfDir)) {
                if (!f.endsWith('.json'))
                    continue;
                const recordPath = join(wfDir, f);
                const parsed = parseWorkflowRunRecord(safeReadJson(recordPath));
                if (parsed === null)
                    continue;
                if (!RUN_ID_PATTERN.test(parsed.runId))
                    continue; // runId becomes a path segment
                if (seenRunIds.has(parsed.runId))
                    continue; // belt to the realpath braces
                seenRunIds.add(parsed.runId);
                out.push({
                    runId: parsed.runId,
                    slug: parsed.slug,
                    workflowName: parsed.workflowName,
                    status: parsed.status,
                    startedAtMs: parsed.startedAtMs,
                    recordPath,
                    transcriptDir: join(projPath, sess, 'subagents', 'workflows', parsed.runId),
                });
            }
        }
    }
    out.sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0) || b.runId.localeCompare(a.runId));
    return out;
}
/**
 * Derive the ledger for ONE run. Returns `null` when no run matches — an ABSENT run is never a
 * BALANCED empty report (ADR-003). NEVER throws; READONLY.
 */
export function deriveCostLedger(opts = {}) {
    try {
        if (opts.runId !== undefined && !RUN_ID_PATTERN.test(opts.runId))
            return null;
        if (opts.slug !== undefined && !SLUG_PATTERN.test(opts.slug))
            return null;
        const runs = listCostLedgerRuns({ ...opts, ...(opts.projectRoot !== undefined && opts.projectDir === undefined ? { projectDir: resolve(opts.projectRoot).replace(/[\\/]/g, '-') } : {}) }).filter((ref) => opts.projectRoot === undefined || relative(opts.projectsRoot ?? claudeProjectsRoot(), ref.recordPath).split(sep)[0] === resolve(opts.projectRoot).replace(/[\\/]/g, '-'));
        const ref = opts.runId !== undefined
            ? runs.find((r) => r.runId === opts.runId)
            : opts.slug !== undefined
                ? runs.find((r) => r.slug === opts.slug)
                : runs[0];
        if (ref === undefined)
            return null;
        const record = parseWorkflowRunRecord(safeReadJson(ref.recordPath));
        if (record === null)
            return null;
        const stageAgentIds = new Set(record.stages.map((s) => s.agentId));
        const allFiles = safeListDir(ref.transcriptDir).filter((f) => f.endsWith('.jsonl'));
        // A capped listing means the run total is built from a PARTIAL directory — BALANCED on partial
        // evidence is the false green this feature exists to refuse (Codex QE HIGH). The cap stays (a
        // pathological dir must not hang us) but it becomes a NAMED defect, never a silent slice.
        const listingTruncated = allFiles.length > MAX_RUN_TRANSCRIPT_FILES;
        const files = allFiles.slice(0, MAX_RUN_TRANSCRIPT_FILES);
        const runSamples = [];
        const perAgent = new Map();
        // measurement-integrity FR-3: a transcript file with NO matching `workflowProgress[]` entry is an
        // orphan REGARDLESS of whether it happened to log any usage samples — a zero-sample orphan is
        // still a transcript the inventory does not know about, so it is counted here (0 tokens, still a
        // named id) rather than silently dropped the way the pre-existing `orphanAgentIds.length > 0`
        // gate did.
        //
        // measurement-integrity fix-round-1/F2 (Codex r1 HIGH #2): the OLD loop compared inventory
        // MEMBERSHIP by `agentId` alone and treated two anomalies as invisible: a file whose name does not
        // match the `agent-<id>.jsonl` shape was `continue`d past — dropped from BOTH `perAgent` and
        // `orphanTranscripts` — and a SECOND file for an agentId already known simply OVERWROTE the first
        // in `perAgent`, silently discarding one transcript's samples while reading as "the one known
        // agent". Both are now named inventory anomalies, folded into the SAME `orphanTranscripts` list
        // (so the existing `hasOrphan`/verdict machinery in `buildCostLedger` already refuses to call
        // either case BALANCED) with a synthetic, self-describing id — never silently absorbed as "known".
        const orphanTranscripts = [];
        const unparseableNames = [];
        const duplicateFor = [];
        for (const f of files) {
            const samples = extractCostSamples(safeReadText(join(ref.transcriptDir, f)));
            runSamples.push(...samples);
            // `journal.jsonl` is a KNOWN, EXPECTED per-run housekeeping file (present in every real run
            // directory alongside the `agent-<id>.jsonl` transcripts — verified against live
            // `roam/claude-state/**/subagents/workflows/wf_*` directories) that carries no usage samples of
            // its own. Naming it an inventory anomaly would make F2's fix fire on every single run there is
            // — the false-positive explosion this feature exists to AVOID, not cause.
            if (f === 'journal.jsonl')
                continue;
            const m = /^agent-(.+)\.jsonl$/.exec(f);
            if (m === null) {
                unparseableNames.push(f);
                orphanTranscripts.push({ agentId: `unparseable:${f}`, samples });
                continue;
            }
            const agentId = m[1] ?? '';
            if (!stageAgentIds.has(agentId)) {
                orphanTranscripts.push({ agentId, samples });
            }
            else if (perAgent.has(agentId)) {
                // A SECOND transcript file for an agentId already claimed — never silently overwrite the
                // first one's samples nor pretend this file belongs to "the known agent" too.
                duplicateFor.push(agentId);
                orphanTranscripts.push({ agentId: `duplicate:${agentId}:${f}`, samples });
            }
            else {
                perAgent.set(agentId, samples);
            }
        }
        const report = buildCostLedger({
            record,
            stageSamples: [...perAgent.entries()].map(([agentId, samples]) => ({ agentId, samples })),
            runSamples,
            orphanAgentIds: orphanTranscripts.map((o) => o.agentId),
            orphanTranscripts,
            ...(listingTruncated ? { transcriptListingTruncated: true } : {}),
            ...(opts.epsilon !== undefined ? { epsilon: opts.epsilon } : {}),
        });
        return { ...report, authoritativeEvidence: { roots: [opts.projectsRoot ?? claudeProjectsRoot(), dirname(dirname(dirname(ref.recordPath))), ref.transcriptDir],
                files: [ref.recordPath, ...files.map((file) => join(ref.transcriptDir, file)), ...record.stages.map((stage) => join(ref.transcriptDir, 'agent-' + stage.agentId + '.jsonl'))] } };
    }
    catch {
        return null; // never-throw contract
    }
}
/**
 * FR-8 IO wrapper: derive every run and aggregate. Runs that do not reconcile are excluded by
 * {@link stageCostAggregates}. NEVER throws; READONLY. Still NOT wired into routing.
 */
export function deriveStageCostAggregates(opts = {}) {
    try {
        const maxRuns = typeof opts.maxRuns === 'number' && Number.isFinite(opts.maxRuns) && opts.maxRuns > 0
            ? Math.floor(opts.maxRuns)
            : 200;
        const reports = [];
        for (const ref of listCostLedgerRuns(opts).slice(0, maxRuns)) {
            const rep = deriveCostLedger({ ...opts, runId: ref.runId });
            if (rep !== null)
                reports.push(rep);
        }
        return stageCostAggregates(reports);
    }
    catch {
        return [];
    }
}
/**
 * FR-7 opt-in materialization. Atomic: writes a sibling `.tmp` then `renameSync`s over the target,
 * and removes the temp file if the rename fails, so a crash can never leave a half-written ledger.
 * Returns `true` on success; never throws.
 */
export function writeCostLedgerJsonl(path, report) {
    const tmp = path + '.tmp';
    try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(tmp, costLedgerJsonl(report), 'utf-8');
        renameSync(tmp, path);
        return true;
    }
    catch {
        try {
            unlinkSync(tmp);
        }
        catch {
            /* nothing to clean up */
        }
        return false;
    }
}
// Capture contract: ordered named fields, with absent distinct from explicit null.
// Kept private at producer/reader boundaries; both use this exact sha256 representation.
function capturedPayload(evidence) {
    const value = (v) => v === undefined ? { absent: true } : v;
    const receipts = Array.isArray(evidence['receipts']) ? evidence['receipts'] : [];
    return JSON.stringify([
        ...['schema', 'sessionId', 'turnId', 'sourcePath', 'matchBasis', 'capturedFrom', 'capturedTo', 'model', 'cwd', 'reportedTotalBasis', 'inputCacheSemantics'].map((k) => [k, value(evidence[k])]),
        ['owner', ...['runId', 'taskId', 'stage', 'attempt', 'role'].map((k) => [k, value(evidence['owner']?.[k])])],
        receipts.map((raw) => {
            const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
            const t = r['totals'];
            return [...['key', 'responseId', 'turnId', 'turnIndex', 'timestamp', 'payloadDigest', 'source'].map((k) => [k, value(r[k])]),
                ['totals', ...['input', 'output', 'cachedInput', 'cachedWrite', 'reasoning', 'total'].map((k) => [k, value(t?.[k])])]];
        }),
    ]);
}
const stageObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
function stageReadText(path, allowedRoot, maxBytes = 64 * 1024 * 1024) {
    let fd;
    try {
        const root = realpathSync(allowedRoot);
        const abs = resolve(path);
        const actual = realpathSync(abs);
        const stat = lstatSync(abs);
        if (!stat.isFile() || stat.isSymbolicLink() || (actual !== root && !actual.startsWith(root + sep)))
            return { text: null, diagnostic: 'source-outside-root-or-nonregular' };
        let ancestor = dirname(abs);
        while (ancestor !== root && ancestor !== dirname(ancestor)) {
            if (lstatSync(ancestor).isSymbolicLink())
                return { text: null, diagnostic: 'source-symlink' };
            ancestor = dirname(ancestor);
        }
        fd = openSync(abs, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev)
            return { text: null, diagnostic: 'source-changed-during-read' };
        const chunks = [];
        let bytes = 0;
        while (true) {
            const chunk = Buffer.alloc(Math.min(65536, maxBytes + 1 - bytes));
            const n = readSync(fd, chunk, 0, chunk.length, null);
            if (!n)
                break;
            bytes += n;
            if (bytes > maxBytes)
                return { text: null, diagnostic: 'source-input-too-large' };
            chunks.push(chunk.subarray(0, n));
        }
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), diagnostic: null };
    }
    catch {
        return { text: null, diagnostic: 'missing-or-unreadable-source' };
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
function stageReadRows(path, root, maxBytes, maxRecords = 100000) {
    const read = stageReadText(path, root, maxBytes);
    const diagnostics = [];
    const rows = [];
    if (read.diagnostic)
        diagnostics.push(read.diagnostic);
    let scanned = 0;
    for (const line of (read.text ?? '').split('\n')) {
        if (!line.trim())
            continue;
        if (++scanned > maxRecords) {
            diagnostics.push('inventory-truncated');
            break;
        }
        try {
            const value = JSON.parse(line);
            if (stageObject(value))
                rows.push(value);
            else
                diagnostics.push('malformed-record');
        }
        catch {
            diagnostics.push('malformed-record');
        }
    }
    return { rows, diagnostics, fingerprint: read.text === null ? null : createHash('sha256').update(read.text).digest('hex') };
}
/** Scoped source selection. Explicit project/run never falls through to an unrelated global run. */
export function deriveStageUsageReport(opts) {
    const project = resolve(opts.projectRoot);
    const source = opts.source ?? 'auto';
    const sourceRoot = resolve(opts.codexSessionsRoot ?? join(process.env['HOME'] ?? '', '.codex/sessions'));
    const roots = [join(project, '.dz'), sourceRoot, resolve(opts.projectsRoot ?? claudeProjectsRoot()), join(resolve(opts.projectsRoot ?? claudeProjectsRoot()), project.replace(/[\\/]/g, '-'))];
    const files = [];
    if (opts.runDir !== undefined)
        roots.push(resolve(project, opts.runDir));
    if (source === 'claude-transcript')
        roots.push(resolve(opts.projectsRoot ?? claudeProjectsRoot()));
    const build = (input) => ({ ...buildStageUsageReport(input), authoritativeEvidence: { roots, files } });
    const insufficient = (reason) => build({ sourceKind: source, sourcePath: project, runId: opts.runId ?? null, rows: [], diagnostics: [reason] });
    if (!['auto', 'workflow-budget', 'fa-ledger', 'claude-transcript'].includes(source))
        return insufficient('unknown-source');
    const faPath = join(project, '.dz/feature-adr/run-cost-ledger.jsonl');
    files.push(faPath);
    const fa = stageReadRows(faPath, project, opts.maxBytes, opts.maxRecords);
    const faMatches = fa.rows.filter((row) => (opts.runId === undefined || row['runId'] === opts.runId) && (opts.slug === undefined || row['slug'] === opts.slug));
    const faIds = [...new Set(faMatches.map((row) => typeof row['runId'] === 'string' ? row['runId'] : '').filter(Boolean))];
    const projections = faMatches.filter((row) => row['summary'] === true && row['sourceProjection'] === 'workflow-budget');
    const projectionDiagnostics = [];
    const projectedIds = new Set();
    const safeRunId = (value) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value) && value !== '.' && value !== '..';
    for (const row of projections) {
        if (!safeRunId(row['workflowRunId']) || row['runId'] !== row['workflowRunId'] || (row['projectRoot'] !== undefined && (typeof row['projectRoot'] !== 'string' || resolve(row['projectRoot']) !== project))) {
            projectionDiagnostics.push('inventory-workflow-projection-identity-invalid');
            continue;
        }
        projectedIds.add(row['workflowRunId']);
    }
    const projectedRunId = projectedIds.size === 1 ? [...projectedIds][0] : null;
    const traceRoot = join(project, '.dz/loop-trace');
    let wfDirs = [];
    if (opts.runDir !== undefined)
        wfDirs = [resolve(project, opts.runDir)];
    else if (opts.runId !== undefined && safeRunId(opts.runId))
        wfDirs = [join(traceRoot, opts.runId)].filter((dir) => existsSync(join(dir, 'budget.jsonl')));
    else if (opts.slug !== undefined)
        wfDirs = [...projectedIds].map((id) => join(traceRoot, id));
    else if (opts.runId === undefined) {
        try {
            wfDirs = readdirSync(traceRoot).filter(safeRunId).map((name) => join(traceRoot, name)).filter((dir) => existsSync(join(dir, 'budget.jsonl')));
        }
        catch { /* no selected Wf inventory */ }
    }
    roots.push(...wfDirs);
    for (const dir of wfDirs)
        files.push(...['budget.jsonl', 'trace.jsonl', 'run-state.json'].map((name) => join(dir, name)));
    // Scoped native census, preserving latest-within-source semantics while refusing unresolved ties.
    const claudeRoot = resolve(opts.projectsRoot ?? claudeProjectsRoot());
    const projectDir = project.replace(/[\\/]/g, '-');
    const claudeRefs = (opts.runId !== undefined && !RUN_ID_PATTERN.test(opts.runId)) || (opts.slug !== undefined && !SLUG_PATTERN.test(opts.slug)) ? []
        : listCostLedgerRuns({ projectsRoot: claudeRoot, projectDir }).filter((ref) => (opts.runId === undefined || ref.runId === opts.runId) && (opts.slug === undefined || ref.slug === opts.slug));
    roots.push(claudeRoot, join(claudeRoot, projectDir));
    for (const ref of claudeRefs) {
        roots.push(ref.transcriptDir);
        files.push(ref.recordPath, ...safeListDir(ref.transcriptDir).filter((f) => f.endsWith('.jsonl')).slice(0, MAX_RUN_TRANSCRIPT_FILES).map((f) => join(ref.transcriptDir, f)));
    }
    const claudeAmbiguous = claudeRefs.length > 1 && claudeRefs[0].startedAtMs === claudeRefs[1].startedAtMs;
    const faIndependent = faMatches.some((row) => !(!stageObject(row['usageEvidence']) && (row['summary'] === true || ['full', 'round', 'control', 'publish'].includes(String(row['stage'])))));
    const authorities = Number(wfDirs.length > 0) + Number(faIndependent) + Number(claudeRefs.length > 0);
    if (source === 'auto' && (authorities > 1 || wfDirs.length > 1 || (faIndependent && faIds.length > 1) || claudeAmbiguous))
        return insufficient('source-selection-ambiguous');
    if (source === 'auto' && projectionDiagnostics.length)
        return insufficient(projectionDiagnostics[0]);
    const chosen = source === 'auto' ? wfDirs.length === 1 ? 'workflow-budget' : faIndependent ? 'fa-ledger' : claudeRefs.length ? 'claude-transcript' : projections.length ? 'fa-ledger' : 'none' : source;
    if (chosen === 'workflow-budget') {
        if (opts.slug !== undefined && opts.runId === undefined && projectedRunId === null)
            return insufficient(projectionDiagnostics[0] ?? 'workflow-source-missing-or-ambiguous');
        if (wfDirs.length !== 1)
            return insufficient('workflow-source-missing-or-ambiguous');
        const dir = wfDirs[0];
        const allowed = opts.runDir === undefined ? project : dir;
        const budget = stageReadRows(join(dir, 'budget.jsonl'), allowed, opts.maxBytes, opts.maxRecords);
        const trace = stageReadRows(join(dir, 'trace.jsonl'), allowed, opts.maxBytes, opts.maxRecords);
        const stateRead = stageReadText(join(dir, 'run-state.json'), allowed, opts.maxBytes);
        let state = null;
        try {
            const value = JSON.parse(stateRead.text ?? 'null');
            if (stageObject(value))
                state = value;
        }
        catch { /* named below */ }
        const runId = opts.runId ?? projectedRunId ?? (typeof state?.['runId'] === 'string' ? state['runId'] : null);
        const diagnostics = [...budget.diagnostics, ...trace.diagnostics, ...projectionDiagnostics];
        if (!state || state['runId'] !== runId)
            diagnostics.push('inventory-run-state-unavailable-or-foreign');
        if (state && state['traceSha256'] == null)
            diagnostics.push('inventory-trace-binding-unavailable');
        else if (state && state['traceSha256'] !== trace.fingerprint)
            diagnostics.push('inventory-trace-binding-mismatch');
        const validatedTrace = parseTrace(trace.rows.map((row) => JSON.stringify(row)).join('\n'));
        for (const row of projections)
            if (row['workflowRunId'] !== runId || row['runId'] !== runId || (row['planDigest'] !== undefined && (typeof row['planDigest'] !== 'string' || row['planDigest'] !== state?.['planDigest'] || row['planDigest'] !== validatedTrace.planDigest)))
                diagnostics.push('inventory-workflow-projection-identity-mismatch');
        if (validatedTrace.parseErrors.length || validatedTrace.openConflict)
            diagnostics.push('inventory-trace-invalid');
        const rows = budget.rows.filter((row) => {
            if (row['schema'] !== 'wf-budget-1' || (row['kind'] !== 'stage' && row['kind'] !== 'probe')) {
                diagnostics.push('malformed-budget-schema');
                return false;
            }
            if (row['projectRoot'] !== undefined && resolve(String(row['projectRoot'])) !== project) {
                diagnostics.push('foreign-project-root');
                return false;
            }
            return true;
        });
        const expected = validatedTrace.events.filter((row) => row.event === 'dispatched' && row.runId === runId).map((row) => ({ ...row, dispatchSeq: row.seq, evidenceKey: JSON.stringify(['wf-dispatch', row.runId, row.seq]) }));
        if (trace.rows.some((row) => row['runId'] !== runId))
            diagnostics.push('foreign-trace-run');
        return build({ sourceKind: 'workflow-budget', sourcePath: dir, runId, rows,
            ...(trace.diagnostics.length === 0 ? { expected } : {}), diagnostics });
    }
    if (chosen === 'fa-ledger') {
        if (opts.runDir !== undefined)
            return insufficient('source-selection-conflicting-run-dir');
        if (opts.runId === undefined && faIds.length !== 1)
            return insufficient('fa-run-selection-ambiguous-or-unidentified');
        const runId = opts.runId ?? faIds[0];
        const selected = faMatches.filter((row) => row['runId'] === runId);
        const diagnostics = [...fa.diagnostics];
        const sourceDiagnostics = [];
        const rows = [];
        const expected = [];
        const witnesses = [];
        const moneyObservations = [];
        let independent = true;
        for (const row of selected) {
            const identity = resolveLedgerModelProvenance(row);
            const evidence = stageObject(row['usageEvidence']) ? row['usageEvidence'] : null;
            if (!evidence && (row['summary'] === true || ['full', 'round', 'control', 'publish'].includes(String(row['stage']))))
                continue;
            const suppliedMoney = stageObject(row['reportedCostObservation']) ? row['reportedCostObservation'] : null;
            const moneyScope = evidence && Array.isArray(evidence['receipts']) ? JSON.stringify([evidence['sessionId'], evidence['turnId'], evidence['receipts'].filter(stageObject).map((r) => r['key']).sort()]) : null;
            moneyObservations.push({ id: suppliedMoney?.['id'] ?? (moneyScope === null ? null : 'captured-scope:' + fnv1a64(moneyScope)),
                scope: suppliedMoney?.['scope'] ?? moneyScope, basis: suppliedMoney?.['basis'] ?? 'caller-reported-captured-scope', runId: row['runId'], amount: row['reportedCostUsd'] ?? null });
            if (!evidence || !Array.isArray(evidence['receipts']) || evidence['schema'] !== 'codex-rollout-scope-1') {
                rows.push(row);
                independent = false;
                diagnostics.push('source-scope-unavailable');
                continue;
            }
            for (const field of ['capturedFrom', 'capturedTo'])
                if (evidence[field] != null && (typeof evidence[field] !== 'string' || !Number.isFinite(Date.parse(evidence[field]))))
                    sourceDiagnostics.push('invalid-captured-window:' + field);
            if (!['codex', 'openai'].includes(identity.family ?? ''))
                sourceDiagnostics.push('captured-source-model-family-conflict');
            if (identity.model === null || identity.diagnostics.length)
                sourceDiagnostics.push(...identity.diagnostics.map((d) => 'captured-' + d));
            const captured = evidence['receipts'].filter(stageObject);
            if (captured.some((r) => !stageObject(r['totals'])))
                sourceDiagnostics.push('invalid-captured-totals');
            if (evidence['captureSha256'] !== undefined) {
                if (createHash('sha256').update(capturedPayload(evidence)).digest('hex') !== evidence['captureSha256'])
                    sourceDiagnostics.push('captured-payload-sha256-mismatch');
                const owner = stageObject(evidence['owner']) ? evidence['owner'] : {};
                for (const key of ['runId', 'taskId', 'stage', 'attempt', 'role'])
                    if (owner[key] !== (row[key] ?? null))
                        sourceDiagnostics.push('captured-owner-mismatch:' + key);
                if (evidence['model'] !== identity.model || evidence['cwd'] !== project || evidence['reportedTotalBasis'] !== row['reportedTotalBasis'] || evidence['inputCacheSemantics'] !== row['inputCacheSemantics'])
                    sourceDiagnostics.push('captured-scope-mismatch');
            }
            if (fnv1a64(JSON.stringify(captured.map((receipt) => [receipt['key'], receipt['payloadDigest']]))) !== evidence['payloadDigest'])
                sourceDiagnostics.push('captured-scope-fingerprint-mismatch');
            if (captured.length !== evidence['receipts'].length) {
                sourceDiagnostics.push('invalid-captured-scope');
                independent = false;
            }
            const sourcePath = typeof evidence['sourcePath'] === 'string' ? evidence['sourcePath'] : '';
            if (sourcePath)
                files.push(resolve(sourcePath));
            const original = stageReadText(sourcePath, sourceRoot, opts.maxBytes);
            const parsed = original.text === null ? null : parseCodexRollout(original.text, sourcePath);
            if (evidence['matchBasis'] !== 'exact') {
                independent = false;
                diagnostics.push('legacy-window-assurance');
            }
            let scopedTotal = 0;
            let allKnown = true;
            const scopeAssociations = new Set();
            const matchedSourceKeys = new Set();
            let maxSourceRecord = -1;
            const scopedDimensions = { tokensIn: 0, tokensOut: 0, tokensCacheRead: 0, tokensCacheWrite: 0, tokensReasoning: 0 };
            for (const receipt of captured) {
                const key = typeof receipt['key'] === 'string' ? receipt['key'] : null;
                const totals = stageObject(receipt['totals']) ? receipt['totals'] : {};
                const claim = { ...row, reportedCostUsd: null, evidenceKey: key, tokensTotal: totals['total'], tokensIn: totals['input'], tokensOut: totals['output'],
                    tokensCacheRead: totals['cachedInput'], tokensCacheWrite: totals['cachedWrite'], tokensReasoning: totals['reasoning'],
                    reportedTotalBasis: 'raw-inclusive', inputCacheSemantics: 'includes-cache-read-write' };
                rows.push(claim);
                expected.push({ evidenceKey: key });
                if (!parsed || 'error' in parsed || parsed.id !== evidence['sessionId']) {
                    independent = false;
                    diagnostics.push('source-witness-unavailable');
                    continue;
                }
                const found = parsed.receipts?.find((r) => JSON.stringify([parsed.id, r.key]) === key);
                if (!found) {
                    sourceDiagnostics.push('captured-source-receipt-missing-or-foreign');
                    independent = false;
                    continue;
                }
                matchedSourceKeys.add(found.key);
                maxSourceRecord = Math.max(maxSourceRecord, found.sourceRecord ?? -1);
                for (const diagnostic of found.diagnostics ?? [])
                    sourceDiagnostics.push('source-receipt:' + diagnostic);
                for (const field of ['input', 'output', 'cachedInput', 'cachedWrite', 'reasoning', 'total'])
                    if (totals[field] !== found.totals[field])
                        sourceDiagnostics.push('captured-source-dimension-mismatch:' + field);
                for (const field of ['responseId', 'turnId', 'timestamp', 'source'])
                    if (receipt[field] !== found[field])
                        sourceDiagnostics.push('captured-source-identity-mismatch:' + field);
                // Association refers to the original independently parsed array, never a filtered view.
                let turn;
                let sourceTurnIndex = null;
                let sessionScope = false;
                if (found.turnIndex != null) {
                    if (Number.isSafeInteger(found.turnIndex) && found.turnIndex >= 0 && found.turnIndex < parsed.turns.length) {
                        sourceTurnIndex = found.turnIndex;
                        turn = parsed.turns[sourceTurnIndex];
                    }
                    else
                        sourceDiagnostics.push('source-turn-index-invalid');
                }
                else if (found.turnId !== null) {
                    const matches = parsed.turns.map((t, index) => ({ t, index })).filter(({ t }) => t.turnId === found.turnId);
                    if (matches.length === 1) {
                        sourceTurnIndex = matches[0].index;
                        turn = matches[0].t;
                    }
                    else
                        sourceDiagnostics.push('source-turn-identity-missing-or-ambiguous');
                }
                else if (parsed.granularity === 'session' && parsed.turns.length === 0 && evidence['turnId'] == null)
                    sessionScope = true;
                if (!turn && !sessionScope) {
                    sourceDiagnostics.push('source-turn-association-unavailable');
                    independent = false;
                }
                if (turn?.turnId != null && (parsed.turns.filter((t) => t.turnId === turn.turnId).length !== 1 || (found.turnId !== null && found.turnId !== turn.turnId)))
                    sourceDiagnostics.push('source-turn-identity-conflict');
                if (evidence['turnId'] != null && (evidence['turnId'] !== found.turnId || (turn?.turnId != null && evidence['turnId'] !== turn.turnId)))
                    sourceDiagnostics.push('captured-turn-identity-conflict');
                const explicitLegacyAssociation = receipt['turnIndex'] == null && receipt['turnId'] != null && receipt['turnId'] === found.turnId
                    && turn?.turnId === found.turnId && parsed.turns.filter((t) => t.turnId === found.turnId).length === 1;
                if (receipt['turnIndex'] !== found.turnIndex && !explicitLegacyAssociation && !(sessionScope && receipt['turnIndex'] == null && found.turnIndex == null))
                    sourceDiagnostics.push('captured-source-identity-mismatch:turnIndex');
                if (turn || sessionScope) {
                    scopeAssociations.add(turn ? 'turn:' + sourceTurnIndex : 'session');
                    const authority = turn ?? parsed;
                    if (evidence['capturedFrom'] !== authority.startedAt)
                        sourceDiagnostics.push('captured-source-start-scope-mismatch');
                    if (identity.model !== authority.model || authority.cwd === null || resolve(authority.cwd) !== project
                        || row['reportedTotalBasis'] !== 'raw-inclusive' || row['inputCacheSemantics'] !== 'includes-cache-read-write')
                        sourceDiagnostics.push('captured-source-scope-mismatch');
                }
                if (found.timestamp !== null && ((typeof evidence['capturedFrom'] === 'string' && Date.parse(found.timestamp) < Date.parse(evidence['capturedFrom'])) || (typeof evidence['capturedTo'] === 'string' && Date.parse(found.timestamp) > Date.parse(evidence['capturedTo']))))
                    sourceDiagnostics.push('captured-source-window-mismatch');
                if (found.payloadDigest !== receipt['payloadDigest'])
                    sourceDiagnostics.push('source-payload-conflict');
                if (!found.responseId) {
                    independent = false;
                    diagnostics.push('source-receipt-identity-unavailable');
                }
                witnesses.push({ evidenceKey: key, tokensTotal: found.totals.total, reportedTotalBasis: 'raw-inclusive' });
                if (found.totals.total === null)
                    allKnown = false;
                else
                    scopedTotal += found.totals.total;
                for (const [field, value] of Object.entries({ tokensIn: found.totals.input, tokensOut: found.totals.output, tokensCacheRead: found.totals.cachedInput,
                    tokensCacheWrite: found.totals.cachedWrite ?? null, tokensReasoning: found.totals.reasoning }))
                    scopedDimensions[field] = scopedDimensions[field] === null || value === null ? null : scopedDimensions[field] + value;
            }
            if (allKnown && !Number.isSafeInteger(scopedTotal))
                sourceDiagnostics.push('source-scoped-aggregate-overflow:total');
            for (const [field, value] of Object.entries(scopedDimensions))
                if (value !== null && !Number.isSafeInteger(value))
                    sourceDiagnostics.push('source-scoped-aggregate-overflow:' + field);
            if (parsed && !('error' in parsed))
                for (const scope of parsed.scopeDiagnostics ?? []) {
                    // A matching prefix and recorded end bound establish the SAME used witness scope.
                    if (scope.receiptCount !== matchedSourceKeys.size || maxSourceRecord < 0 || maxSourceRecord > scope.sourceRecord
                        || (scope.timestamp !== null && typeof evidence['capturedTo'] === 'string' && Date.parse(scope.timestamp) > Date.parse(evidence['capturedTo'])))
                        continue;
                    for (const diagnostic of scope.diagnostics)
                        sourceDiagnostics.push('source-scope:' + diagnostic);
                    if (scope.witness)
                        for (const [field, actual] of Object.entries({ total: allKnown ? scopedTotal : null, input: scopedDimensions['tokensIn'], output: scopedDimensions['tokensOut'], cachedInput: scopedDimensions['tokensCacheRead'], cachedWrite: scopedDimensions['tokensCacheWrite'], reasoning: scopedDimensions['tokensReasoning'] })) {
                            const witness = scope.witness[field];
                            if (actual != null && witness != null && actual !== witness)
                                sourceDiagnostics.push('source-scoped-witness-mismatch:' + field);
                        }
                }
            if (scopeAssociations.size > 1)
                sourceDiagnostics.push('captured-mixed-turn-association');
            // Verify the captured receipt subset, not an expanded session's later cumulative total.
            // A malformed record still leaves the source census undecidable; receipt mutations are
            // detected above by their captured payload hashes and identities.
            if (parsed && !('error' in parsed) && parsed.diagnostics?.includes('malformed-record'))
                sourceDiagnostics.push('source:malformed-record');
            if (Array.isArray(row['usageDiagnostics']) && row['usageDiagnostics'].some((d) => typeof d === 'string' && /invalid|mismatch|conflict|reset|overflow|foreign/.test(d)))
                sourceDiagnostics.push('captured-source-was-invalid');
            const claimTotal = row['tokensTotal'] ?? row['tokens'];
            if (parsed && !('error' in parsed) && allKnown && Number.isSafeInteger(scopedTotal) && claimTotal !== scopedTotal)
                sourceDiagnostics.push('source-claim-total-mismatch');
            if (parsed && !('error' in parsed) && allKnown && row['tokens'] != null && row['tokens'] !== scopedTotal)
                sourceDiagnostics.push('source-compatibility-total-mismatch');
            for (const [field, value] of Object.entries(scopedDimensions))
                if (parsed && !('error' in parsed) && row[field] != null && value !== null && row[field] !== value)
                    sourceDiagnostics.push('source-dimension-mismatch:' + field);
            if (!captured.length) {
                rows.push(row);
                independent = false;
                diagnostics.push('source-scope-empty');
            }
        }
        if (!rows.length && selected.some((row) => row['summary'] === true))
            diagnostics.push('projection-only-spend-unavailable');
        if (sourceDiagnostics.length)
            for (const row of rows)
                row['usageDiagnostics'] = [...(Array.isArray(row['usageDiagnostics']) ? row['usageDiagnostics'] : []), 'source-payload-conflict'];
        return build({ sourceKind: 'fa-ledger', sourcePath: faPath, runId, rows,
            ...(independent ? { expected, witnesses } : {}), moneyObservations, diagnostics, sourceDiagnostics });
    }
    if (chosen === 'claude-transcript') {
        if (claudeAmbiguous)
            return insufficient('source-selection-ambiguous');
        const legacy = deriveCostLedger({ ...(opts.epsilon !== undefined ? { epsilon: opts.epsilon } : {}), projectRoot: project, ...(claudeRefs[0] !== undefined ? { runId: claudeRefs[0].runId } : opts.runId !== undefined ? { runId: opts.runId } : {}), ...(opts.slug !== undefined ? { slug: opts.slug } : {}), ...(opts.projectsRoot !== undefined ? { projectsRoot: opts.projectsRoot } : {}) });
        if (!legacy || (opts.slug !== undefined && legacy.slug !== opts.slug))
            return insufficient('claude-source-missing');
        if (legacy.authoritativeEvidence) {
            roots.push(...legacy.authoritativeEvidence.roots);
            files.push(...legacy.authoritativeEvidence.files);
        }
        const report = build({ sourceKind: 'claude-transcript', sourcePath: opts.projectsRoot ?? claudeProjectsRoot(), runId: legacy.runId,
            rows: legacy.rows.map((row) => ({ runId: row.runId, stage: row.stage, model: row.model, family: 'claude', attempt: row.attempt,
                tokensTotal: row.weightedTokens, reportedTotalBasis: 'weighted-input-equivalent', evidenceKey: JSON.stringify([row.runId, row.stage, row.attempt]) })), diagnostics: ['legacy-weighted-transcript-view'] });
        return { ...report, legacyCostLedger: legacy };
    }
    return insufficient('no-selected-project-source');
}
export function renderStageUsageReport(report) {
    const number = (n) => n === null ? 'unavailable' : String(n);
    const rows = report.rows.map((row) => `${row.stage ?? 'unattributed'} | ${row.model ?? 'unknown model'} | total ${number(row.tokensTotal)} (${row.reportedTotalBasis}) | input ${number(row.tokensIn)} cache-read ${number(row.tokensCacheRead)} cache-write ${number(row.tokensCacheWrite)} output ${number(row.tokensOut)} | estimated USD ${number(row.estimatedCostUsd)}`);
    return [`usage --by-stage: ${report.verdict} — ${report.sourceKind} ${report.sourcePath}`, `metric: ${report.metric}; known subtotal ${number(report.knownRunTotalTokens)}; full total ${number(report.runTotalTokens)}`,
        `conservation: ${report.conservation.status}; inventory: ${report.inventory.status}; source verification: ${report.sourceVerification.status}; source verified total ${number(report.sourceVerifiedTotalTokens)}`,
        `reported USD ${number(report.reportedCostUsd)}; known reported subtotal ${number(report.knownReportedCostUsd)}; money coverage ${report.reportedCostCoverage.status}`,
        `estimated USD ${number(report.estimatedCostUsd)}; known estimated subtotal ${number(report.knownEstimatedCostUsd)}; billed USD unavailable (not observed)`, ...rows,
        ...report.diagnostics.map((d) => 'diagnostic: ' + d), ...report.sourceVerification.diagnostics.map((d) => 'source: ' + d)].join('\n');
}
//# sourceMappingURL=cost-ledger.js.map