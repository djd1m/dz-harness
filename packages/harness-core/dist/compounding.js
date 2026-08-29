/**
 * `dz compounding` — does the learning loop actually PAY? (feature compounding, scout C2)
 *
 * Ported from rUv's darwin-mode (`security/compounding.ts`, `security/ablation.ts`,
 * `bench/{stats,promotion}.ts`) with an honesty split the port map demanded:
 *   - the STATS machinery ports verbatim (seeded mulberry32, bootstrap lower-95, decidePromotion,
 *     the min-n >= 5 rule — darwin's own FDR calibration shows n=3 gives a 33% false-discovery rate);
 *   - darwin's MEASUREMENT legs do NOT port: its FP-drop leg ignores the passed corpus (a fixture),
 *     `withoutMemory` is hard-coded 0, and "warm" is injected state — theatrical, exactly what this
 *     repo's claim-check culture forbids. The measurements here are dz-native, over data that exists.
 *
 * The report NEVER fakes a verdict: a gate without enough samples says INSUFFICIENT_DATA — after the
 * 2026-07-28 inventory found the apply-leg log dead for 19 days, "no data" is a finding, not a pass.
 *
 * Everything here is PURE: callers gather facts (files, store rows); this module only computes.
 */
import { EVENT_CHAIN_SCOPE, verifyEventChainText } from './event-chain.js';
// ── Seeded statistics (verbatim-shape port from darwin-mode bench/stats.ts) ──
/** Deterministic PRNG — same seed, same stream, byte-identical reports. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export const BOOTSTRAP_RESAMPLES = 5000;
/** Below this many samples PER ARM a comparison is noise: darwin's own FDR calibration measured a
 *  0.332 empirical false-discovery rate at n=3. */
export const MIN_SAMPLES_PER_ARM = 5;
/** Paired bootstrap over per-item deltas (b[i] - a[i]). */
export function bootstrapDelta(a, b, seed = 42) {
    // PAIRED means paired: unequal lengths silently truncated a decisive observation and promoted on
    // the remainder; a sparse/NaN entry is not an observation at all (Codex #9).
    if (a.length !== b.length || a.length === 0)
        return null;
    if (![...a, ...b].every((x) => typeof x === 'number' && Number.isFinite(x)))
        return null;
    const n = a.length;
    const deltas = [];
    for (let i = 0; i < n; i++)
        deltas.push((b[i] ?? 0) - (a[i] ?? 0));
    const rand = mulberry32(seed);
    const means = [];
    for (let r = 0; r < BOOTSTRAP_RESAMPLES; r++) {
        let sum = 0;
        for (let i = 0; i < n; i++)
            sum += deltas[Math.floor(rand() * n)] ?? 0;
        means.push(sum / n);
    }
    means.sort((x, y) => x - y);
    const meanDelta = deltas.reduce((s, d) => s + d, 0) / n;
    // Conservative nearest-rank percentile: ceil(B*p)-1. floor(B*p) sat one slot ABOVE the 2.5th
    // percentile and could flip a reject into a promote at the boundary (Codex #10 — a defect darwin
    // itself inherits; ported faithfully was still ported wrong).
    const lower95 = means[Math.max(0, Math.ceil(BOOTSTRAP_RESAMPLES * 0.025) - 1)] ?? 0;
    return { meanDelta, lower95, samples: n };
}
/** Darwin's decision rule: a positive mean is not enough — the LOWER bound must clear zero. */
export function decidePromotion(delta, minDelta = 0) {
    // NaN samples compared false against the minimum and PROMOTED (Codex #9) — every field must be a
    // real number and the count a real integer before any decision exists.
    if (delta === null ||
        !Number.isInteger(delta.samples) ||
        delta.samples < MIN_SAMPLES_PER_ARM ||
        !Number.isFinite(delta.meanDelta) ||
        !Number.isFinite(delta.lower95) ||
        !Number.isFinite(minDelta)) {
        return 'insufficient-data';
    }
    return delta.meanDelta > minDelta && delta.lower95 > 0 ? 'promote' : 'reject';
}
/**
 * The ONE definition of "a replayable pair": the readiness gate below COUNTS these and
 * `dz epoch-replay --emit` EMITS these. A second copy would let readiness say 12 while the runner
 * emits 9, silently — the drift class this repo keeps catching.
 *
 * Rules: a prompt with no query cannot be replayed; a TRUNCATED query is a prefix, not the prompt;
 * one prompt = one instance (the hook writes one row per injected hit, up to 3 per prompt).
 */
export function replayableInstances(usage, lessonText = new Map()) {
    const byKey = new Map();
    for (const u of usage) {
        if (typeof u.query !== 'string' || u.query.trim() === '')
            continue;
        if (u.queryTruncated === true)
            continue; // a prefix is not the prompt
        const key = u.eventId ?? `${u.runId ?? ''}|${u.ts}|${u.query}`;
        const entry = byKey.get(key) ?? { query: u.query, lessons: [] };
        const text = lessonText.get(u.dzId);
        if (typeof text === 'string' && text.trim() !== '' && !entry.lessons.includes(text)) {
            entry.lessons.push(text);
        }
        byKey.set(key, entry);
    }
    return [...byKey.entries()].map(([id, e]) => ({ id, query: e.query, lessons: e.lessons, class: null }));
}
const APPLY_LEG_STALE_DAYS = 7;
export function assembleCompoundingReport(facts) {
    const { lessons, usage, guard } = facts;
    // 1. Pool payoff — the "loops need all three legs" question, quantified.
    const injectedIds = new Set(usage.map((u) => u.dzId));
    const injectedEver = lessons.filter((l) => injectedIds.has(l.dzId)).length;
    const touchedEver = lessons.filter((l) => l.uses > 0 || injectedIds.has(l.dzId)).length;
    const total = lessons.length;
    const pool = {
        total,
        injectedEver,
        touchedEver,
        neverTouched: total - touchedEver,
        quarantined: lessons.filter((l) => l.quarantined).length,
        writeOnlyRatio: total === 0 ? 0 : (total - injectedEver) / total,
    };
    // 2. Guard trajectory — do the same mistakes recur less over time? Split the record span in half
    //    by TIME (not by count: a busy afternoon must not masquerade as an era).
    // Only events with a PARSEABLE timestamp participate; a span of zero has no halves (Codex #7).
    const guardTimed = guard
        .map((g) => ({ ...g, ms: Date.parse(g.ts) }))
        .filter((g) => Number.isFinite(g.ms))
        .sort((a, b) => a.ms - b.ms);
    const trajectory = [];
    const t0 = guardTimed.length > 0 ? guardTimed[0].ms : 0;
    const t1 = guardTimed.length > 0 ? guardTimed[guardTimed.length - 1].ms : 0;
    if (guardTimed.length >= 2 && t1 > t0) {
        const mid = t0 + (t1 - t0) / 2;
        let firstAudits = 0;
        let secondAudits = 0;
        for (const g of guardTimed) {
            if (g.ms <= mid)
                firstAudits += 1;
            else
                secondAudits += 1;
        }
        const perRule = new Map();
        for (const g of guardTimed) {
            const inFirst = g.ms <= mid;
            for (const rule of g.rules) {
                const e = perRule.get(rule) ?? { first: 0, second: 0 };
                if (inFirst)
                    e.first += 1;
                else
                    e.second += 1;
                perRule.set(rule, e);
            }
        }
        // Both halves must contain OBSERVATIONS for a rate comparison to mean anything.
        if (firstAudits > 0 && secondAudits > 0) {
            for (const [rule, e] of [...perRule.entries()].sort()) {
                const firstRate = e.first / firstAudits;
                const secondRate = e.second / secondAudits;
                trajectory.push({
                    rule,
                    firstHalfViolations: e.first,
                    secondHalfViolations: e.second,
                    firstHalfAudits: firstAudits,
                    secondHalfAudits: secondAudits,
                    improved: secondRate < firstRate,
                });
            }
        }
    }
    // 3. Replay readiness — cold-vs-warm needs (query -> injected lesson) pairs. They were never
    //    recorded before 2026-07-28, so this gate REPORTS accrual instead of faking a verdict.
    //    The rule ("no query / truncated query / one prompt = one pair") has exactly ONE definition,
    //    in epoch-replay.ts, and the RUNNER emits precisely what this gate counts — a second copy
    //    would let readiness say 12 while the runner emits 9, silently.
    const replayablePairs = replayableInstances(usage).length;
    const replay = {
        replayablePairs,
        minNeeded: MIN_SAMPLES_PER_ARM,
        verdict: replayablePairs >= MIN_SAMPLES_PER_ARM ? 'ready' : 'insufficient-data',
        note: replayablePairs >= MIN_SAMPLES_PER_ARM
            ? `${replayablePairs} unique prompt event(s) recorded — a cold-vs-warm replay can now be RUN (readiness, not a result)`
            : `${replayablePairs} unique prompt event(s); ${MIN_SAMPLES_PER_ARM} needed — queries are recorded as of 2026-07-28, data is accruing`,
    };
    // 4. Instrumentation health — "no data" must be a finding, never a silent pass.
    // Liveness compares RAW milliseconds (a 7d23h gap floored to "7 days" read as live), rejects
    // garbage timestamps, and treats a FUTURE timestamp beyond small clock skew as evidence of a
    // broken clock, not of liveness (Codex #8).
    const usageTimed = usage
        .map((u) => ({ ts: u.ts, ms: Date.parse(u.ts) }))
        .filter((u) => Number.isFinite(u.ms))
        .sort((a, b) => a.ms - b.ms);
    const lastUsage = usageTimed.length > 0 ? usageTimed[usageTimed.length - 1] : null;
    const nowMs = Date.parse(facts.nowTs);
    const CLOCK_SKEW_MS = 60_000;
    const gapMs = lastUsage && Number.isFinite(nowMs) ? nowMs - lastUsage.ms : null;
    const gapValid = gapMs !== null && gapMs >= -CLOCK_SKEW_MS;
    // 4b. Evidence-chain health. The numbers above are only worth as much as the log they came from,
    //     and a compaction bug already inflated that log once (2 → 4 → 6, fixed 2026-07-28).
    const chains = (facts.evidenceLogs ?? []).map((f) => {
        const v = verifyEventChainText(typeof f.text === 'string' ? f.text : '');
        return {
            log: f.log,
            ok: v.ok,
            chained: v.chained,
            preChainPrefix: v.preChainPrefix,
            defects: v.defects.length,
            defectKinds: [...new Set(v.defects.map((d) => d.kind))],
        };
    });
    const instrumentation = {
        lastUsageTs: lastUsage?.ts ?? null,
        gapDays: gapValid ? Math.max(0, Math.floor(gapMs / 86_400_000)) : null,
        applyLegLive: gapValid && gapMs <= APPLY_LEG_STALE_DAYS * 86_400_000,
        chains,
        chainsOk: chains.every((c) => c.ok),
        cmdUsageDepthDays: typeof facts.cmdUsageDepthDays === 'number' && Number.isFinite(facts.cmdUsageDepthDays)
            ? Math.max(0, facts.cmdUsageDepthDays)
            : null,
    };
    const improvedRules = trajectory.filter((t) => t.improved).length;
    const verdict = [
        `pool: ${injectedEver}/${total} lessons ever injected (${Math.round(pool.writeOnlyRatio * 100)}% write-only under the strict bar)`,
        trajectory.length > 0 ? `guard: ${improvedRules}/${trajectory.length} rules recur less in the later half` : 'guard: not enough history',
        `cold-vs-warm: ${replay.verdict === 'insufficient-data' ? 'INSUFFICIENT DATA (accruing)' : 'READY to measure'}`,
        instrumentation.applyLegLive ? 'apply leg: live' : 'apply leg: STALE — fix the instrumentation before trusting anything above',
        ...(chains.length === 0
            ? []
            : [
                instrumentation.chainsOk
                    ? 'evidence chain: verified'
                    : 'evidence chain: CORRUPT — the numbers above are computed from a damaged log',
            ]),
    ].join(' · ');
    return { pool, guardTrajectory: trajectory, replay, instrumentation, verdict };
}
export function renderCompoundingReport(r) {
    const out = [];
    out.push('dz compounding — does the learning loop pay? (honest report: gates without data say so)');
    out.push('');
    out.push(`  POOL PAYOFF: ${r.pool.total} lessons · ${r.pool.injectedEver} ever injected by the apply leg · ${r.pool.touchedEver} touched by any recall · ${r.pool.neverTouched} never touched · ${r.pool.quarantined} quarantined`);
    out.push(`    write-only ratio (strict bar): ${(r.pool.writeOnlyRatio * 100).toFixed(0)}%`);
    out.push('');
    if (r.guardTrajectory.length > 0) {
        out.push('  GUARD TRAJECTORY (violations, first half vs second half of the audit span):');
        for (const t of r.guardTrajectory) {
            out.push(`    ${t.improved ? '↓' : '·'} ${t.rule}: ${t.firstHalfViolations} → ${t.secondHalfViolations}`);
        }
    }
    else {
        out.push('  GUARD TRAJECTORY: not enough audit history to split');
    }
    out.push('');
    out.push(`  COLD-VS-WARM REPLAY: ${r.replay.note}`);
    out.push(`  INSTRUMENTATION: last apply-leg record ${r.instrumentation.lastUsageTs ?? 'never'}` +
        (r.instrumentation.gapDays !== null ? ` (${r.instrumentation.gapDays}d ago)` : '') +
        ` — ${r.instrumentation.applyLegLive ? 'live' : 'STALE'}`);
    for (const c of r.instrumentation.chains) {
        out.push(`  EVIDENCE CHAIN ${c.log}: ${c.ok ? 'verified' : `FAILED — ${c.defects} defect(s) [${c.defectKinds.join(', ')}]`}` +
            ` · ${c.chained} chained · ${c.preChainPrefix} pre-chain (uncovered)`);
    }
    out.push(`  COMMAND USAGE: ${r.instrumentation.cmdUsageDepthDays === null
        ? 'INSUFFICIENT_DATA (no readable .dz/cmd-usage.jsonl)'
        : `${Math.floor(r.instrumentation.cmdUsageDepthDays)}d history`}`);
    if (r.instrumentation.chains.length > 0)
        out.push(`    scope: ${EVENT_CHAIN_SCOPE}`);
    out.push('');
    out.push(`  VERDICT: ${r.verdict}`);
    return out.join('\n');
}
//# sourceMappingURL=compounding.js.map