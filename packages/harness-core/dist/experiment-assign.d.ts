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
export interface AssignArmInput {
    readonly experiment: string;
    readonly stratum: string;
    /** Pre-registered seed — fixed once, before any assignment is made. */
    readonly seed: number;
    /** 0-based ordinal of this task within its `(experiment, stratum)` sequence. */
    readonly index: number;
    /** The arms on offer, e.g. `['direct', 'reference']`. At least 2, all non-empty, all unique. */
    readonly arms: readonly string[];
}
export type AssignArmResult = {
    readonly ok: true;
    readonly arm: string;
    readonly propensity: number;
    readonly block: number;
    readonly position: number;
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * Deterministically assign one arm to task ordinal `index` within `(experiment, stratum)`. Refuses
 * (never throws, never guesses) on any malformed input — empty strings, a non-integer seed/index, a
 * negative index, fewer than two arms, duplicate or blank arm names.
 */
export declare function assignArm(input: AssignArmInput): AssignArmResult;
export interface AssignmentRecord {
    readonly ts: string;
    readonly experiment: string;
    readonly taskId: string;
    readonly stratum: string;
    readonly seed: number;
    readonly index: number;
    readonly block: number;
    readonly position: number;
    readonly arm: string;
    readonly propensity: number;
    readonly assignedAt: string;
}
export interface ReadAssignmentsResult {
    readonly records: readonly AssignmentRecord[];
    /** Non-blank lines that did not parse as a valid assignment record. Never silently dropped: a
     * caller checking "is this task assigned?" must be able to tell "no" from "the journal is
     * unreadable here" (A5). */
    readonly malformedLines: number;
}
export type VerifyAssignmentResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: string;
    /** Lead delta after Codex r2: `null` when the record failed on its SEED — there is nothing to
     *  expect, because the tuple it would be derived from is itself the thing under suspicion. */
    readonly expected: {
        readonly arm: string;
        readonly block: number;
        readonly position: number;
        readonly propensity: number;
    } | null;
    readonly actual: {
        readonly arm: string;
        readonly block: number;
        readonly position: number;
        readonly propensity: number;
    };
};
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
export declare function verifyAssignmentRecord(record: AssignmentRecord, arms: readonly string[], pinnedSeed?: number): VerifyAssignmentResult;
/**
 * Parse a JSONL assignments journal (one record per line) into records, WITHOUT touching the
 * filesystem — the caller reads the file, this only parses its text (NFR-1: the core stays
 * `node:fs`-free). A line that is blank is skipped silently (append-only files end in a trailing
 * newline); a line that is non-blank but does not parse as JSON, or parses to something missing a
 * required field, counts toward `malformedLines` and is otherwise ignored — corruption is named, not
 * folded into "not assigned" (A5).
 */
export declare function readAssignments(text: string): ReadAssignmentsResult;
//# sourceMappingURL=experiment-assign.d.ts.map