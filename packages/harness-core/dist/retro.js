/**
 * `dz retro` — what was done over a day, a week or a month.
 *
 * This module is PURE: no filesystem, no network, and — load-bearing — no clock. The window arrives
 * as a parameter, because a window you cannot pin in a test is a window whose arithmetic errors you
 * cannot catch. MEASURED in this project 2026-08-22: an agent's timestamp was off by a YEAR, the
 * query returned 15 530 "hits" for a "week", and nothing about the output looked wrong.
 *
 * Its second job is refusing. Half of an honest report is declining to answer what the data cannot
 * support, and those refusals live here as behaviour — types that cannot express a quarter, a
 * decision function that names the real span in days, and a three-state section verdict where
 * "the source said nothing" and "the source was not read" can never collapse into one zero.
 *
 * See features/dz-retro/03_adr/ for the decisions and the measurements behind them.
 */
export const REFUSED_HORIZONS = ['quarter', 'half-year', 'year'];
const HORIZON_DAYS = { day: 1, week: 7, month: 30 };
const REFUSED_DAYS = { quarter: 90, 'half-year': 182, year: 365 };
const DAY_MS = 86_400_000;
function isoDay(value) {
    return value.slice(0, 10);
}
/**
 * The window for a horizon, anchored on an EXPLICIT date. Never reads the clock.
 * `atIso` may be a full timestamp; only its date part is used.
 */
export function retroWindow(horizon, atIso) {
    const end = isoDay(atIso);
    const endMs = Date.parse(`${end}T00:00:00.000Z`);
    if (Number.isNaN(endMs))
        throw new Error(`retroWindow: not an ISO date: ${JSON.stringify(atIso)}`);
    const days = HORIZON_DAYS[horizon];
    const startMs = endMs - (days - 1) * DAY_MS;
    return { horizon, startIso: new Date(startMs).toISOString().slice(0, 10), endIso: end, days };
}
/** Is this instant inside the window? Compared in UTC, never as strings (ADR/AM-5). */
export function withinWindow(w, isoInstant) {
    const t = Date.parse(isoInstant);
    if (Number.isNaN(t))
        return false;
    const from = Date.parse(`${w.startIso}T00:00:00.000Z`);
    const to = Date.parse(`${w.endIso}T00:00:00.000Z`) + DAY_MS;
    return t >= from && t < to;
}
/**
 * May we report over the requested horizon at all?
 *
 * `spanDays` is the age of the LONGEST record we actually hold. Asking for a year over 174 days of
 * data is not a thin report — it is an invented one, so it is refused and the real span is named.
 */
export function decideHorizon(input) {
    const req = input.requested.trim().toLowerCase();
    const span = Number.isFinite(input.spanDays) ? Math.max(0, Math.floor(input.spanDays)) : 0;
    if (req in HORIZON_DAYS) {
        const need = HORIZON_DAYS[req];
        if (span < need) {
            return {
                action: 'refuse',
                reason: `a ${req} needs ${need} day(s) of records and we hold ${span} — reporting it would invent the difference`,
            };
        }
        return { action: 'report', reason: `${req}: ${need} day(s) against ${span} day(s) of records` };
    }
    if (REFUSED_HORIZONS.includes(req)) {
        const need = REFUSED_DAYS[req];
        return {
            action: 'refuse',
            reason: `a ${req} needs about ${need} days of records and the longest record here spans ${span} day(s) — there is exactly one complete quarter, so a quarter-over-quarter comparison is arithmetically impossible and a year would be fabrication`,
        };
    }
    return { action: 'refuse', reason: `unknown horizon ${JSON.stringify(input.requested)} — use --day, --week or --month` };
}
/**
 * Does this source cover the whole window?
 *
 * `dataStart: null` means the source was NOT READ — a different fact from "read, and empty".
 * Collapsing the two is how a report says "nothing happened" about a week it could not see.
 */
export function sectionStatus(input) {
    if (input.dataStart === null) {
        return { status: 'unavailable', dataStart: null, note: 'source not read — this section says nothing, which is not the same as zero' };
    }
    const start = isoDay(input.dataStart);
    if (start <= isoDay(input.windowStart)) {
        return { status: 'full', dataStart: start, note: `records cover the whole window (from ${start})` };
    }
    return { status: 'partial', dataStart: start, note: `records only begin ${start}, inside the window — everything before that is unknown, not absent` };
}
/**
 * Measures of the INSTRUMENT, not of the work (ADR-003). Each will be proposed again precisely
 * because each is a one-liner to compute, so each carries the measurement that refutes it.
 */
export const FORBIDDEN_METRICS = [
    { name: 'commit count', reason: 'this project mandates a commit per logical change; 1318 commits over 66 active days measures compliance with that rule, not output (MEASURED 2026-08-22)' },
    { name: 'lines changed', reason: 'generated artifacts dominate — 352 of 1318 commits are docs, and one pipeline run writes 8-10 files before a line of product code exists' },
    { name: 'token spend', reason: 'self-declared an estimate, once wrong sixfold, covers 17 days, and 20 of 86 ledger rows carry no number by construction' },
    { name: 'learning event volume', reason: '640 in May against 10454 in August, but the sources are post-edit and post-command hooks: the curve measures when hooks were installed' },
    { name: 'inventory counts', reason: 'skills, packages and tests only ever grow, so they can only ever flatter' },
    { name: 'learned lesson count', reason: 'already refuted by this project’s own dz compounding: 54% of the pool has never been read by anyone' },
];
function emptyOrUnavailable(v, emptyLine) {
    return v.status === 'unavailable'
        ? ['not read — this section cannot say anything about this window']
        : [emptyLine];
}
export function buildRetro(facts) {
    const ws = facts.window.startIso;
    const sections = [];
    // 1. Deliveries
    {
        const v = sectionStatus({ dataStart: facts.deliveries?.dataStart ?? null, windowStart: ws });
        const items = (facts.deliveries?.items ?? []).filter((d) => withinWindow(facts.window, d.createdIso));
        const graded = items.filter((d) => d.gradeStatus === 'unique');
        const ambiguous = items.filter((d) => d.gradeStatus === 'ambiguous');
        const ungraded = items.filter((d) => d.gradeStatus === 'none' || d.gradeStatus === 'no-report');
        const lines = items.length === 0
            ? emptyOrUnavailable(v, 'no feature directories were created in this window')
            : [
                `${items.length} feature director${items.length === 1 ? 'y' : 'ies'} created`,
                `${graded.length} carry a grade an independent review stated unambiguously${graded.length > 0 ? `: ${tally(graded.map((d) => d.grade))}` : ''}`,
                `${ambiguous.length} have a report that states MORE THAN ONE grade — reported as ambiguous, never guessed`,
                `${ungraded.length} have no letter grade in their report, or no report at all`,
                'cadence is not value: this counts deliveries, not what they were worth',
            ];
        sections.push({ id: 'deliveries', title: 'Deliveries', verdict: v, lines });
    }
    // 2. Publishes
    {
        const v = sectionStatus({ dataStart: facts.publishes?.dataStart ?? null, windowStart: ws });
        const items = (facts.publishes?.items ?? []).filter((p) => withinWindow(facts.window, p.iso));
        const pkgs = new Set(items.map((p) => p.pkg));
        const lines = items.length === 0
            ? emptyOrUnavailable(v, 'no versions were accepted by the registry in this window')
            : [
                `${items.length} version(s) accepted by the registry across ${pkgs.size} package(s)`,
                'timestamps are the registry’s own — this is the one record here nobody local can backdate',
            ];
        sections.push({ id: 'publishes', title: 'Publishes', verdict: v, lines });
    }
    // 3. Discipline — DESCRIBES, never compares (ADR-004)
    {
        const v = sectionStatus({ dataStart: facts.guard?.dataStart ?? null, windowStart: ws });
        const runs = (facts.guard?.items ?? []).filter((g) => withinWindow(facts.window, g.iso));
        const byVerdict = new Map();
        const byRule = new Map();
        for (const r of runs) {
            byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);
            for (const rule of r.rules)
                byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
        }
        const lines = runs.length === 0
            ? emptyOrUnavailable(v, 'no gate runs were recorded in this window')
            : [
                `${runs.length} gate run(s): ${[...byVerdict.entries()].map(([k, n]) => `${k} ${n}`).join(', ')}`,
                byRule.size === 0
                    ? 'no rule was violated in this window'
                    : `violations by rule: ${[...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`,
            ];
        // The caveat is NOT optional and NOT conditional: it is the whole honesty of the section.
        lines.push('a rule missing from this list was either never violated or did not yet exist — the log records a rule only when it fires, so it cannot tell those apart');
        lines.push('this section describes the window; it deliberately computes no comparison between periods');
        sections.push({ id: 'discipline', title: 'Discipline', verdict: v, lines });
    }
    // 4. Knowledge reuse
    {
        const v = sectionStatus({ dataStart: facts.reuse?.dataStart ?? null, windowStart: ws });
        const r = facts.reuse;
        const lines = r === null || r.lessonsTotal === 0
            ? emptyOrUnavailable(v, 'no lessons are stored, so there is nothing to reuse')
            : [
                `${r.eventsInWindow} recall event(s) in this window`,
                `${r.lessonsEverRecalled} of ${r.lessonsTotal} stored lessons have ever been read (${Math.round((r.lessonsEverRecalled / r.lessonsTotal) * 100)}%)`,
                'this is a ratio with a hostile denominator: storing more unread lessons makes it worse, not better',
            ];
        sections.push({ id: 'reuse', title: 'Knowledge reuse', verdict: v, lines });
    }
    const caveats = [];
    if (facts.uncommittedSlugs.length > 0) {
        caveats.push(`${facts.uncommittedSlugs.length} feature director${facts.uncommittedSlugs.length === 1 ? 'y is' : 'ies are'} not committed yet and therefore invisible to this report: ${facts.uncommittedSlugs.join(', ')}`);
    }
    caveats.push('none of the following is computed here, and each carries the measurement that disqualifies it: ' + FORBIDDEN_METRICS.map((m) => m.name).join(', '));
    return { window: facts.window, spanDays: facts.spanDays, sections, caveats };
}
function tally(values) {
    const m = new Map();
    for (const v of values)
        m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k}×${n}`).join(' ');
}
/** The human rendering. `--json` prints the SAME `RetroReport` — one structure, two spellings (FR-6). */
export function renderRetro(report) {
    const out = [];
    out.push(`dz retro — ${report.window.horizon}: ${report.window.startIso} … ${report.window.endIso} (${report.window.days} day(s))`);
    out.push(`records held: ${report.spanDays} day(s)`);
    for (const s of report.sections) {
        out.push('');
        out.push(`${s.title}  [${s.verdict.status}]${s.verdict.dataStart !== null ? ` · records from ${s.verdict.dataStart}` : ''}`);
        out.push(`  ${s.verdict.note}`);
        for (const l of s.lines)
            out.push(`  · ${l}`);
    }
    out.push('');
    for (const c of report.caveats)
        out.push(`! ${c}`);
    return out;
}
//# sourceMappingURL=retro.js.map