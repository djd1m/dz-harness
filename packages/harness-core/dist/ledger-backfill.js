/**
 * Fill the run-cost ledger's missing numbers from the host's own workflow record.
 *
 * THE DEFECT THIS CLOSES (MEASURED 2026-08-25). `.dz/feature-adr/run-cost-ledger.jsonl` had 87 rows:
 * 66 hand-typed rows carried `tokens`/`minutes`, and ALL 20 rows written automatically by the
 * pipeline carried `tokens:null, minutes:null, agents:null`. So "what did this feature cost" was
 * answerable only for runs a human retyped — 76% of the data was manual transcription.
 *
 * The numbers were never MISSING. They sit in the Claude Code host's workflow record (per-agent
 * `tokens` and `durationMs`, verified to sum to the record's own total), and `deriveCostLedger`
 * already reads them. The sandboxed workflow legitimately cannot: it has no filesystem and never
 * sees the completion notification, which is why it writes `null` rather than an estimate — the
 * right call, and the reason this join belongs on the dz side, AFTER the run.
 *
 * FOUR RULES, each one a test:
 *  1. A derived number is MARKED ({@link LEDGER_FILL_SOURCE}). A number we computed must never be
 *     indistinguishable from a number the operator asserted.
 *  2. A non-null value is NEVER overwritten. The operator's number is their claim about their run;
 *     ours is a derivation. When they disagree, theirs stands and the disagreement is reported.
 *  3. A row we cannot fill is REPORTED, never silently skipped — no `runId`, or a `runId` with no
 *     host record, comes back named. Silence would read as "nothing left to fill".
 *  4. Every other field and the row ORDER survive byte-for-byte. This rewrites an append-only log;
 *     the only defensible rewrite is one that changes exactly the fields it says it changes.
 *
 * @packageDocumentation
 */
/** Marks a value this module derived from the host record rather than one a human typed. */
export const LEDGER_FILL_SOURCE = 'host-record';
/** The facts lookup returns this when the row's key matches MORE THAN ONE host run. */
export const AMBIGUOUS = 'ambiguous';
const FILLABLE = ['tokens', 'minutes', 'agents'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/**
 * Plan the fill. PURE: takes the ledger's raw lines and a runId→facts lookup, returns the new lines.
 * Nothing is read or written here — the caller owns the file and the atomic replace.
 */
export function planLedgerBackfill(input) {
    // A run's spend belongs to ONE row. An L/XL feature writes a `plan` row and a `full` row under one
    // slug, and giving both the same run total would double-count that run for anyone who sums the
    // column — a fabrication produced by addition rather than by writing. This is the mirror of the
    // ambiguous-slug rule: there, many runs claimed one row; here, one run would be claimed by many.
    // Both are refused, and for the same reason: we cannot tell which claim is the true one.
    const claimants = new Map();
    for (const raw of input.lines) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
                continue;
            const r = parsed;
            if (FILLABLE.every((f) => isNum(r[f])))
                continue;
            const rid = typeof r['runId'] === 'string' && r['runId'] !== '' ? r['runId'] : null;
            const slg = typeof r['slug'] === 'string' && r['slug'] !== '' ? r['slug'] : null;
            const k = rid !== null ? 'runId:' + rid : slg !== null ? 'slug:' + slg : null;
            if (k !== null)
                claimants.set(k, (claimants.get(k) ?? 0) + 1);
        }
        catch { /* a torn line claims nothing */ }
    }
    const outLines = [];
    const rows = [];
    const disagreements = [];
    let filledRows = 0;
    input.lines.forEach((raw, index) => {
        // A line we cannot parse is passed through UNCHANGED. This rewrites an append-only log; a
        // torn line is evidence, and dropping or "repairing" it would destroy the only trace of it.
        let row;
        try {
            const parsed = JSON.parse(raw);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
                throw new Error('not an object');
            row = parsed;
        }
        catch {
            outLines.push(raw);
            if (raw.trim() !== '')
                rows.push({ index, runId: null, slug: null, key: null, filled: [], skipped: 'malformed-line' });
            return;
        }
        const runId = typeof row['runId'] === 'string' && row['runId'] !== '' ? row['runId'] : null;
        const slug = typeof row['slug'] === 'string' && row['slug'] !== '' ? row['slug'] : null;
        const missing = FILLABLE.filter((f) => !isNum(row[f]));
        if (missing.length === 0) {
            outLines.push(raw);
            rows.push({ index, runId, slug, key: null, filled: [], skipped: 'already-complete' });
            return;
        }
        // runId is exact and wins. The slug is the FALLBACK, and only because the sandboxed workflow
        // cannot know its own run id — it has no access to one, so a row it writes can never name one.
        const key = runId !== null ? 'runId' : slug !== null ? 'slug' : null;
        const value = runId ?? slug;
        if (key === null || value === null) {
            outLines.push(raw);
            rows.push({ index, runId, slug, key: null, filled: [], skipped: 'no-join-key' });
            return;
        }
        if ((claimants.get(key + ':' + value) ?? 0) > 1) {
            outLines.push(raw);
            rows.push({ index, runId, slug, key: null, filled: [], skipped: 'shared-run-claim' });
            return;
        }
        const facts = input.facts(key, value);
        if (facts === AMBIGUOUS) {
            // Refuse, do not guess. A feature run twice has two host runs under one slug; picking either
            // would attribute one run's spend to the other row and call it measured.
            outLines.push(raw);
            rows.push({ index, runId, slug, key: null, filled: [], skipped: 'ambiguous-slug' });
            return;
        }
        if (facts === null) {
            outLines.push(raw);
            rows.push({ index, runId, slug, key: null, filled: [], skipped: 'no-host-record' });
            return;
        }
        const filled = [];
        const next = { ...row };
        for (const field of FILLABLE) {
            const derived = facts[field];
            if (!isNum(derived))
                continue;
            if (isNum(row[field])) {
                // Rule 2: the operator's number stands. A disagreement is REPORTED so it can be looked at,
                // never resolved silently in our favour.
                if (row[field] !== derived)
                    disagreements.push({ index, field, existing: row[field], derived });
                continue;
            }
            next[field] = derived;
            filled.push(field);
        }
        if (filled.length === 0) {
            outLines.push(raw);
            rows.push({ index, runId, slug, key: null, filled: [], skipped: 'host-record-empty' });
            return;
        }
        // Rule 1: say where these numbers came from, and HOW they were matched. A slug match is weaker
        // evidence than a run id, and a reader who cannot tell them apart cannot weigh the number.
        next['filledFrom'] = LEDGER_FILL_SOURCE;
        next['filledBy'] = key;
        next['filledFields'] = filled;
        outLines.push(JSON.stringify(next));
        rows.push({ index, runId, slug, key, filled, skipped: null });
        filledRows++;
    });
    return { lines: outLines, rows, filledRows, disagreements };
}
/**
 * Resolve the run a ledger row is being written FOR, at write time.
 *
 * This is the fix for the root defect behind the whole backfill: the sandboxed workflow has no
 * access to its own run id — it is not in `args` and not a sandbox global — so a row it writes can
 * never name one, and 16 of 20 automatic rows carried no join key at all (MEASURED 2026-08-25).
 *
 * The command that APPENDS the row does run on the host, where the records live, so it can answer
 * the question the sandbox cannot. Resolving here rather than afterwards is strictly better: at
 * write time the run is IN FLIGHT and is simply the newest one for that slug, while an hour later
 * the same slug may have several and the choice becomes a guess.
 *
 * Refuses rather than guesses in every unclear case:
 *  - no slug, or no candidate for it → `null`;
 *  - the newest candidate is TIED with another on `startedAtMs`, or has no timestamp at all → `null`,
 *    because "newest" is then not a fact;
 *  - a row that already names a run keeps it — resolution never overwrites.
 */
export function resolveLedgerRunId(row, runs) {
    if (typeof row.runId === 'string' && row.runId !== '')
        return null;
    const slug = typeof row.slug === 'string' && row.slug !== '' ? row.slug : null;
    if (slug === null)
        return null;
    const dated = runs.filter((r) => r.slug === slug && typeof r.startedAtMs === 'number' && Number.isFinite(r.startedAtMs));
    if (dated.length === 0)
        return null;
    let newest = dated[0];
    for (const r of dated)
        if (r.startedAtMs > newest.startedAtMs)
            newest = r;
    // A tie means the newest is not a fact. Two runs cannot both be the one this row is for.
    if (dated.filter((r) => r.startedAtMs === newest.startedAtMs).length > 1)
        return null;
    return newest.runId;
}
//# sourceMappingURL=ledger-backfill.js.map