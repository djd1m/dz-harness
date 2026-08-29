/**
 * `dz cadence` — the "what shipped" aggregator (backlog ef740b44), built on one spine:
 * A WINDOW DEEPER THAN THE RECORD IS REFUSED (ADR-001). The weekly-digest research (2026-08-22)
 * caught a «year» digest standing on 174 days of data — scale forgery by aggregation; an
 * aggregator that silently computes any requested period repeats it mechanically.
 *
 * Four sources, every degradation NAMED in the report, never a silent zero:
 *  - graded shipments: features/<slug>/08_qe_report.md through the hardened readQeGrade
 *    (prefix-negation aware, all measured real-world grade forms); ungraded reports are a COLUMN;
 *  - npm publishes: the dz recap registry-time cache (third-party timestamps);
 *  - guard repeat decay on a FIXED rule set: a rule enters only with events BEFORE the window
 *    start (the data-driven birth proxy — the no-stubs class of «zero repeats because the rule is
 *    young» is excluded by construction);
 *  - knowledge reuse: recall events per bucket from .dz/recall-usage.jsonl.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readQeGrade } from './score.js';
export const CADENCE_WINDOW_DAYS = {
    day: 1, week: 7, month: 30, quarter: 91, halfyear: 182, year: 365,
};
/**
 * ADR-001: a window is accepted only when the record is at least TWO windows deep — two full units
 * are the minimum for the word «cadence»; one point has no rhythm.
 */
export function decideCadenceWindow(window, dataDepthDays) {
    const need = CADENCE_WINDOW_DAYS[window] * 2;
    const order = ['year', 'halfyear', 'quarter', 'month', 'week', 'day'];
    const largestAllowed = order.find((w) => dataDepthDays >= CADENCE_WINDOW_DAYS[w] * 2) ?? null;
    if (dataDepthDays >= need)
        return { ok: true, reason: `record depth ${dataDepthDays}d covers 2×${window}`, largestAllowed };
    return {
        ok: false,
        reason: `REFUSED: the record is ${dataDepthDays} day(s) deep and a ${window} cadence needs ${need} — a cadence computed from under two full windows is a scale forgery, not a number` +
            (largestAllowed ? `; the largest honest window today is «${largestAllowed}»` : '; even «day» is not established yet'),
        largestAllowed,
    };
}
/** ISO week key (YYYY-Www) for a ms timestamp. */
export function isoWeekOf(ms) {
    const d = new Date(ms);
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
/** Bucket events into ISO weeks inside [windowStart, now]. */
export function weeklyBuckets(events, windowStartMs, nowMs) {
    const out = new Map();
    for (const e of events) {
        if (!isFinite(e.ts) || e.ts < windowStartMs || e.ts > nowMs)
            continue;
        const k = isoWeekOf(e.ts);
        const list = out.get(k) ?? [];
        list.push(e);
        out.set(k, list);
    }
    return out;
}
/**
 * Repeat decay over the FIXED set: only rules with at least one event BEFORE the window start
 * qualify (their existence predates the window); newborn rules are EXCLUDED by construction and
 * returned separately so the exclusion is visible.
 */
export function guardRepeatDecay(events, windowStartMs) {
    const before = new Map();
    const inWindow = new Map();
    for (const e of events) {
        if (!isFinite(e.ts) || e.rule === '')
            continue;
        if (e.ts < windowStartMs)
            before.set(e.rule, (before.get(e.rule) ?? 0) + 1);
        else
            inWindow.set(e.rule, (inWindow.get(e.rule) ?? 0) + 1);
    }
    const decay = [...before.entries()]
        .map(([rule, b]) => ({ rule, before: b, inWindow: inWindow.get(rule) ?? 0 }))
        .sort((a, b) => b.before - a.before);
    const excludedNewborn = [...inWindow.keys()].filter((r) => !before.has(r)).sort();
    return { decay, excludedNewborn };
}
function safeJsonl(path) {
    const out = [];
    try {
        for (const line of readFileSync(path, 'utf-8').split('\n')) {
            if (line.trim() === '')
                continue;
            try {
                out.push(JSON.parse(line));
            }
            catch { /* torn line — skip, counted nowhere */ }
        }
    }
    catch { /* absent file — callers name the degradation */ }
    return out;
}
/** Build the full report. `now` injectable — the refusal decision must be testable. */
export function buildCadenceReport(root, window, now) {
    const nowMs = typeof now === 'number' && isFinite(now) ? now : Date.now();
    // Shipment events: graded 08 reports, dated by the run-cost ledger (fallback: report mtime is
    // NOT used — an mtime moves on every touch; an undatable report lands in `ungraded`... no: in
    // its own named bucket via ledger-missing) — v1 keeps the honest subset: ledger-dated only.
    const ledger = safeJsonl(join(root, '.dz', 'feature-adr', 'run-cost-ledger.jsonl'));
    const dateBySlug = new Map();
    let earliest = nowMs;
    for (const r of ledger) {
        if (typeof r.slug !== 'string' || typeof r.date !== 'string')
            continue;
        const ts = Date.parse(r.date);
        if (!isFinite(ts))
            continue;
        if (!dateBySlug.has(r.slug) || ts > dateBySlug.get(r.slug))
            dateBySlug.set(r.slug, ts);
        if (ts < earliest)
            earliest = ts;
    }
    // Record depth is the UNION of sources — the npm registry reaches months past the ledger, and a
    // refusal computed from the shallowest source alone would under-admit honest windows.
    let unionEarliest = earliest;
    try {
        const cache = JSON.parse(readFileSync(join(root, '.dz', 'recap', 'npm-times.json'), 'utf-8'));
        for (const entry of Object.values(cache.packages ?? {}))
            for (const iso of Object.values(entry.versions ?? {})) {
                const ts = Date.parse(iso);
                if (isFinite(ts) && ts < unionEarliest)
                    unionEarliest = ts;
            }
    }
    catch { /* cache absent — named later */ }
    for (const row of safeJsonl(join(root, '.dz', 'guard-audit.jsonl'))) {
        const ts = Date.parse(String(row.ts ?? ''));
        if (isFinite(ts) && ts < unionEarliest)
            unionEarliest = ts;
    }
    const depthDays = Math.floor((nowMs - unionEarliest) / 86400000);
    const decision = decideCadenceWindow(window, depthDays);
    const windowStart = nowMs - CADENCE_WINDOW_DAYS[window] * 86400000;
    const gradedWeekly = {};
    const byGrade = {};
    let ungraded = 0;
    let gradedTotal = 0;
    const featuresDir = join(root, 'features');
    if (existsSync(featuresDir) && decision.ok) {
        for (const slug of readdirSync(featuresDir)) {
            const report = join(featuresDir, slug, '08_qe_report.md');
            if (!existsSync(report))
                continue;
            const ts = dateBySlug.get(slug);
            if (ts === undefined || ts < windowStart || ts > nowMs)
                continue;
            const grade = readQeGrade(readFileSync(report, 'utf-8')).grade;
            if (grade === null) {
                ungraded += 1;
                continue;
            }
            gradedTotal += 1;
            byGrade[grade] = (byGrade[grade] ?? 0) + 1;
            const wk = isoWeekOf(ts);
            gradedWeekly[wk] = (gradedWeekly[wk] ?? 0) + 1;
        }
    }
    // npm publishes from the recap cache — third-party registry timestamps.
    const npmWeekly = {};
    let npmDegraded = null;
    const npmCache = join(root, '.dz', 'recap', 'npm-times.json');
    if (!existsSync(npmCache)) {
        npmDegraded = 'no npm-times cache — run `dz recap --refresh-publishes` first (registry timestamps are third-party data this command never fetches itself)';
    }
    else if (decision.ok) {
        try {
            const cache = JSON.parse(readFileSync(npmCache, 'utf-8'));
            for (const entry of Object.values(cache.packages ?? {})) {
                for (const iso of Object.values(entry.versions ?? {})) {
                    const ts = Date.parse(iso);
                    if (!isFinite(ts) || ts < windowStart || ts > nowMs)
                        continue;
                    const wk = isoWeekOf(ts);
                    npmWeekly[wk] = (npmWeekly[wk] ?? 0) + 1;
                }
            }
        }
        catch {
            npmDegraded = 'npm-times cache unreadable — refresh it (`dz recap --refresh-publishes`)';
        }
    }
    // Guard decay on the fixed set.
    const guardRows = safeJsonl(join(root, '.dz', 'guard-audit.jsonl'))
        .flatMap((r) => {
        const ts = Date.parse(String(r.ts ?? r.at ?? ''));
        if (!isFinite(ts))
            return [];
        // the live shape: one audit row carries violations[] each naming its rule
        if (Array.isArray(r.violations))
            return r.violations.map((v) => ({ ts, rule: String(v?.rule ?? '') })).filter((x) => x.rule !== '');
        return typeof r.rule === 'string' && r.rule !== '' ? [{ ts, rule: r.rule }] : [];
    });
    const guard = decision.ok ? guardRepeatDecay(guardRows, windowStart) : { decay: [], excludedNewborn: [] };
    const guardDegraded = guardRows.length === 0 ? 'no guard-audit events on disk — decay has nothing to stand on' : null;
    // Knowledge reuse: recall events.
    const recallRows = safeJsonl(join(root, '.dz', 'recall-usage.jsonl'))
        .map((r) => Date.parse(String(r.ts ?? r.at ?? '')))
        .filter((t) => isFinite(t));
    const recallWeekly = {};
    if (decision.ok)
        for (const ts of recallRows) {
            if (ts < windowStart || ts > nowMs)
                continue;
            const wk = isoWeekOf(ts);
            recallWeekly[wk] = (recallWeekly[wk] ?? 0) + 1;
        }
    const recallDegraded = recallRows.length === 0 ? 'no recall-usage events — the reuse leg has nothing to stand on' : null;
    return {
        window, decision, depthDays,
        shipments: { graded: gradedWeekly, ungraded, gradedTotal, byGrade },
        npmPublishes: { weekly: npmWeekly, degraded: npmDegraded },
        guard: { ...guard, degraded: guardDegraded },
        recalls: { weekly: recallWeekly, degraded: recallDegraded },
    };
}
//# sourceMappingURL=cadence.js.map