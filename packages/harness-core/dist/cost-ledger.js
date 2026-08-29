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
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hasKnownPricing, usageCost } from './cost-scoring.js';
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
    const buckets = new Map();
    const keyOwners = new Map();
    const foreign = [];
    const conflicting = [];
    const missingTranscript = [];
    let stageTokensSum = 0;
    for (const stage of record.stages) {
        const samples = byAgent.get(stage.agentId) ?? [];
        if (samples.length === 0)
            missingTranscript.push(`${stage.label} (${stage.agentId})`);
        let b = buckets.get(stage.label);
        if (b === undefined) {
            b = {
                stage: stage.label,
                phase: stage.phase,
                models: new Set(),
                agentIds: [],
                claims: [],
                sum: 0,
                startedAtMs: null,
                endedAtMs: null,
                costUsd: 0,
                pricingKnown: true,
            };
            buckets.set(stage.label, b);
        }
        b.models.add(stage.model);
        b.agentIds.push(stage.agentId);
        if (stage.startedAtMs !== null) {
            b.startedAtMs = b.startedAtMs === null ? stage.startedAtMs : Math.min(b.startedAtMs, stage.startedAtMs);
            const end = stage.durationMs === null ? stage.startedAtMs : stage.startedAtMs + stage.durationMs;
            b.endedAtMs = b.endedAtMs === null ? end : Math.max(b.endedAtMs, end);
        }
        if (!hasKnownPricing(stage.model))
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
        const cost = usageCost(mix, stage.model);
        b.costUsd += Number.isFinite(cost) && cost > 0 ? cost : 0;
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
            phase: b.phase,
            model: models.length === 1 ? (models[0] ?? 'unknown') : 'mixed',
            agentIds: b.agentIds,
            tokensIn,
            tokensCacheWrite,
            tokensCacheRead,
            tokensOut,
            weightedTokens: b.sum,
            costUsd: b.costUsd,
            pricingKnown: b.pricingKnown,
            startedTs: isoOrNull(b.startedAtMs),
            endedTs: isoOrNull(b.endedAtMs),
            calls: b.claims.length,
        });
    }
    rows.sort((a, z) => z.weightedTokens - a.weightedTokens || a.stage.localeCompare(z.stage));
    // ── named defects ──
    const orphans = (input.orphanAgentIds ?? []).filter((x) => typeof x === 'string' && x.length > 0);
    if (unaccountedTokens > Math.floor(epsilon * runTotalTokens)) {
        defects.push({
            kind: 'Unaccounted',
            detail: orphans.length > 0
                ? `${orphans.length} agent transcript(s) in the run directory have no workflowProgress entry`
                : 'run spend is attributed to no stage',
            tokens: unaccountedTokens,
            ...(orphans.length > 0 ? { subjects: orphans } : {}),
        });
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
    // INSUFFICIENT_DATA is NOT success (ADR-003): no samples means nothing was measured, and a
    // "0 === 0, so it balances" shortcut would let an absent transcript store read as a clean run.
    const verdict = runTotalTokens === 0 && stageTokensSum === 0
        ? 'INSUFFICIENT_DATA'
        : defects.length > 0
            ? 'DEFECT'
            : 'BALANCED';
    let totalCostUsd = 0;
    for (const r of rows)
        totalCostUsd += r.costUsd;
    const fallbackModels = [...new Set(record.stages.filter((s) => !hasKnownPricing(s.model)).map((s) => s.model))].sort();
    return {
        runId: record.runId,
        slug: record.slug,
        workflowName: record.workflowName,
        status: record.status,
        startedTs: isoOrNull(record.startedAtMs),
        rows,
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
        },
        recordTotalTokens: record.recordTotalTokens,
        totalCostUsd,
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
            a.cost += row.costUsd;
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
            avgCostUsd: runs > 0 ? a.cost / runs : 0,
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
    if (report.recordTotalTokens !== null) {
        lines.push(`  note: the run record's own totalTokens is ${fmt(report.recordTotalTokens)} — a RAW unweighted cached sum of the same per-agent list, reported for traceability, NOT the invariant's right-hand side`);
    }
    if (report.pricingFallbackModels.length > 0) {
        lines.push(`  note: ~USD marked * uses sonnet-class FALLBACK pricing for: ${report.pricingFallbackModels.join(', ')}`);
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
        const runs = listCostLedgerRuns(opts);
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
        const orphanAgentIds = [];
        for (const f of files) {
            const samples = extractCostSamples(safeReadText(join(ref.transcriptDir, f)));
            runSamples.push(...samples);
            const m = /^agent-(.+)\.jsonl$/.exec(f);
            if (m === null)
                continue;
            const agentId = m[1] ?? '';
            if (stageAgentIds.has(agentId))
                perAgent.set(agentId, samples);
            else if (samples.length > 0)
                orphanAgentIds.push(agentId);
        }
        return buildCostLedger({
            record,
            stageSamples: [...perAgent.entries()].map(([agentId, samples]) => ({ agentId, samples })),
            runSamples,
            orphanAgentIds,
            ...(listingTruncated ? { transcriptListingTruncated: true } : {}),
            ...(opts.epsilon !== undefined ? { epsilon: opts.epsilon } : {}),
        });
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
//# sourceMappingURL=cost-ledger.js.map