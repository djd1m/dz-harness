/**
 * Deterministic, blocked arm assignment for a prospective ablation (ADR-001, ablation-c-start).
 *
 * WHY. The owner's question — does the Step-8 QE mode change task speed — is only answerable
 * causally if the variant a task receives is decided by chance, BEFORE the work starts, and tied to
 * the task's own identity so a repeated query for the same task never reassigns it. This module is
 * that decision: a PURE function of `(experiment, stratum, seed, index)`. No filesystem, no clock,
 * no network — the caller (the cli) owns the journal, the lock, and the "did work already start?"
 * check; this module only computes.
 *
 * ALGORITHM — block randomization, one pair per arm-combination per block. `mulberry32` is the
 * repo's ONLY pseudo-random generator (`compounding.ts` — "no second RNG in this repo"); reused
 * here rather than adding a second stream. Block size is `arms.length * 2` — two occurrences of
 * every arm per block, so a completed block is always perfectly balanced and `propensity` (the
 * arm's actual share of its block) is a fixed `1 / arms.length` — never guessed, never assumed
 * 0.5 by default (NFR-4). The block's own permutation is seeded from
 * `fnv1a(JSON.stringify([experiment, stratum, seed, block]))` (a JSON-tuple, not a delimiter join —
 * the same reason `workOrderDigestInput` in epoch-replay.ts uses tuples: a delimiter in `experiment`
 * or `stratum` could otherwise make two different keys hash identically) — so different strata (and
 * different experiments) never share a stream, and the SAME `(experiment, stratum, seed, index)`
 * always rederives the SAME arm (A1 idempotency, A2 block balance, A3 propensity).
 */
import { fnv1a } from './feature-adr-checkpoints.js';
import { mulberry32 } from './compounding.js';
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim() !== '';
}
/** Fisher-Yates, driven by the given deterministic RNG. Does not mutate its input. */
function shuffle(items, rand) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}
/**
 * Deterministically assign one arm to task ordinal `index` within `(experiment, stratum)`. Refuses
 * (never throws, never guesses) on any malformed input — empty strings, a non-integer seed/index, a
 * negative index, fewer than two arms, duplicate or blank arm names.
 */
export function assignArm(input) {
    if (!isNonEmptyString(input?.experiment))
        return { ok: false, reason: 'experiment: expected a non-empty string' };
    if (!isNonEmptyString(input?.stratum))
        return { ok: false, reason: 'stratum: expected a non-empty string' };
    if (!Number.isInteger(input?.seed) || input.seed < 0)
        return { ok: false, reason: 'seed: expected a non-negative integer' };
    if (!Number.isInteger(input?.index) || input.index < 0)
        return { ok: false, reason: 'index: expected a non-negative integer' };
    if (!Array.isArray(input?.arms) || input.arms.length < 2) {
        return { ok: false, reason: 'arms: expected an array of at least 2 arm names' };
    }
    if (!input.arms.every(isNonEmptyString))
        return { ok: false, reason: 'arms: every arm name must be a non-empty string' };
    const seen = new Set();
    for (const a of input.arms) {
        if (seen.has(a))
            return { ok: false, reason: `arms: duplicate arm name ${JSON.stringify(a)}` };
        seen.add(a);
    }
    const blockSize = input.arms.length * 2; // two copies of every arm — always a perfect block
    const block = Math.floor(input.index / input.arms.length / 2); // == Math.floor(index / blockSize)
    const position = input.index % blockSize;
    const key = JSON.stringify({ experiment: input.experiment, stratum: input.stratum, seed: input.seed, block });
    const rand = mulberry32(parseInt(fnv1a(key), 16) >>> 0);
    // Base card set for this block: every arm twice, in the input's own order — then permuted by the
    // block-seeded stream, so the CONTENT of every block is fixed by construction (perfect balance)
    // and only the ORDER is randomized.
    const cards = [];
    for (const a of input.arms) {
        cards.push(a);
        cards.push(a);
    }
    const permuted = shuffle(cards, rand);
    const arm = permuted[position];
    const propensity = 2 / blockSize; // == 1 / arms.length — the arm's fixed, actual share of its block
    return { ok: true, arm, propensity, block, position };
}
/** fix-round-1 (Codex r1 HIGH #7): `new Date().toISOString()` is the ONLY producer of `ts`/
 * `assignedAt` (see the cli's `experimentJournalPath` writer) — a record whose timestamp does not
 * match that exact shape did not come from this code path, so it is corruption, not merely an
 * unusual value. */
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function isValidIsoTimestamp(v) {
    // Lead delta after Codex r2 (MEDIUM): shape + `Date.parse` accepts impossible calendar dates —
    // `2026-02-30T00:00:00.000Z` parses (it rolls into March) and passed. Round-tripping through
    // `toISOString()` is the exact check: only a real instant re-serializes to the same string.
    if (typeof v !== 'string' || !ISO_TIMESTAMP_RE.test(v))
        return false;
    const ms = Date.parse(v);
    return Number.isFinite(ms) && new Date(ms).toISOString() === v;
}
/**
 * PURELY STRUCTURAL: every field is present and the right TYPE. This is `readAssignments`'s gate —
 * it decides whether a journal LINE parses at all (A5's `malformedLines`). It deliberately does NOT
 * validate timestamp FORMAT, propensity RANGE, or arm MEMBERSHIP: a line that is well-typed but
 * semantically wrong (a hand-edited `position:99`, `propensity:2`, a flipped `arm`) is exactly the
 * "syntactically valid corruption" `verifyAssignmentRecord` below exists to catch — folding those
 * checks in here would make a single semantically-tampered record poison `readAssignments` for
 * every caller, including ones (like `status`'s per-task duration math) that need to name WHICH
 * task is bad rather than refuse the whole read (fix-round-1 HIGH #7/#8 — see `verifyAssignmentRecord`).
 */
function isValidAssignmentRecord(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const r = v;
    return (isNonEmptyString(r['ts']) &&
        isNonEmptyString(r['experiment']) &&
        isNonEmptyString(r['taskId']) &&
        isNonEmptyString(r['stratum']) &&
        Number.isInteger(r['seed']) && r['seed'] >= 0 &&
        Number.isInteger(r['index']) && r['index'] >= 0 &&
        Number.isInteger(r['block']) && r['block'] >= 0 &&
        Number.isInteger(r['position']) && r['position'] >= 0 &&
        isNonEmptyString(r['arm']) &&
        typeof r['propensity'] === 'number' && Number.isFinite(r['propensity']) &&
        isNonEmptyString(r['assignedAt']));
}
/**
 * fix-round-1 (Codex r1 HIGH #7) — "syntactically valid journal corruption is accepted and returned
 * as the task's assignment". A record that passes `isValidAssignmentRecord`'s SHAPE checks can still
 * have been hand-edited to a different arm/block/position/propensity while keeping every field the
 * right TYPE (e.g. flipping `arm:"direct"` to `arm:"reference"`, or `position:99`). The only way to
 * catch that is to REDERIVE the assignment from the record's own tuple
 * `(experiment, stratum, seed, index)` via the SAME pure `assignArm` that produced it, and compare —
 * never trust the stored arm/block/position/propensity on their own. `arms` is the experiment's own
 * registered arm set (from its `dz experiment init` config), passed in by the caller — this module
 * stays pure and fs-free.
 */
export function verifyAssignmentRecord(record, arms, pinnedSeed) {
    // Lead delta after Codex r2 (BLOCKER): rederiving from `record.seed` proves the record is
    // internally CONSISTENT, never that it is AUTHENTIC — a row carrying any seed at all passes,
    // because the check compares the row with itself. The experiment's pinned seed (from its
    // `dz experiment init` config, the one value fixed before the first assignment) is the trusted
    // side of the comparison; a row that disagrees with it is tampered, however well-formed.
    if (pinnedSeed !== undefined && record.seed !== pinnedSeed) {
        return {
            ok: false,
            reason: `assignment-tampered: task ${JSON.stringify(record.taskId)} carries seed ${record.seed}, but experiment ${JSON.stringify(record.experiment)} is pinned to seed ${pinnedSeed} — a record's own seed can never authenticate it`,
            expected: null,
            actual: { arm: record.arm, block: record.block, position: record.position, propensity: record.propensity },
        };
    }
    const recomputed = assignArm({ experiment: record.experiment, stratum: record.stratum, seed: record.seed, index: record.index, arms });
    const actual = { arm: record.arm, block: record.block, position: record.position, propensity: record.propensity };
    const expected = recomputed.ok
        ? { arm: recomputed.arm, block: recomputed.block, position: recomputed.position, propensity: recomputed.propensity }
        : { arm: '(tuple refused)', block: -1, position: -1, propensity: -1 };
    if (!recomputed.ok) {
        return {
            ok: false,
            reason: `assignment-tampered: task ${JSON.stringify(record.taskId)}'s stored tuple (experiment=${JSON.stringify(record.experiment)}, stratum=${JSON.stringify(record.stratum)}, seed=${record.seed}, index=${record.index}) no longer rederives a valid assignment (${recomputed.reason}) — the stored record does not match what assignArm would produce from its own tuple`,
            expected,
            actual,
        };
    }
    if (expected.arm !== actual.arm || expected.block !== actual.block || expected.position !== actual.position || expected.propensity !== actual.propensity) {
        return {
            ok: false,
            reason: `assignment-tampered: task ${JSON.stringify(record.taskId)}'s stored assignment does not match what assignArm rederives from its own tuple (experiment=${JSON.stringify(record.experiment)}, stratum=${JSON.stringify(record.stratum)}, seed=${record.seed}, index=${record.index}) — the journal line was modified after it was written`,
            expected,
            actual,
        };
    }
    // fix-round-1 HIGH #7 (named explicitly in the brief, beyond what recompute-and-compare already
    // implies): timestamp FORMAT, propensity RANGE, and arm MEMBERSHIP. Recompute already makes a
    // WRONG arm/propensity/block/position fail above; these three checks catch what recompute cannot
    // — `assignArm` never produces a `ts`/`assignedAt` at all (they are wall-clock, not derived from
    // the tuple), so a hand-edited "not-a-date" needs its own check.
    if (!isValidIsoTimestamp(record.ts) || !isValidIsoTimestamp(record.assignedAt)) {
        return {
            ok: false,
            reason: `assignment-tampered: task ${JSON.stringify(record.taskId)}'s ts/assignedAt is not a valid ISO-8601 UTC timestamp (ts=${JSON.stringify(record.ts)}, assignedAt=${JSON.stringify(record.assignedAt)})`,
            expected,
            actual,
        };
    }
    if (!(record.propensity >= 0 && record.propensity <= 1)) {
        return {
            ok: false,
            reason: `assignment-tampered: task ${JSON.stringify(record.taskId)}'s propensity ${record.propensity} is outside the valid [0,1] range`,
            expected,
            actual,
        };
    }
    if (!arms.includes(record.arm)) {
        return {
            ok: false,
            reason: `assignment-tampered: task ${JSON.stringify(record.taskId)}'s arm ${JSON.stringify(record.arm)} is not one of this experiment's registered arms (${arms.join(', ')})`,
            expected,
            actual,
        };
    }
    return { ok: true };
}
/**
 * Parse a JSONL assignments journal (one record per line) into records, WITHOUT touching the
 * filesystem — the caller reads the file, this only parses its text (NFR-1: the core stays
 * `node:fs`-free). A line that is blank is skipped silently (append-only files end in a trailing
 * newline); a line that is non-blank but does not parse as JSON, or parses to something missing a
 * required field, counts toward `malformedLines` and is otherwise ignored — corruption is named, not
 * folded into "not assigned" (A5).
 */
export function readAssignments(text) {
    const records = [];
    let malformedLines = 0;
    for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim();
        if (line === '')
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            malformedLines++;
            continue;
        }
        if (isValidAssignmentRecord(parsed))
            records.push(parsed);
        else
            malformedLines++;
    }
    return { records, malformedLines };
}
//# sourceMappingURL=experiment-assign.js.map