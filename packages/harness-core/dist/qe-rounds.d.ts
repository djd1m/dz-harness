/**
 * qe-rounds — how many Step-8 review rounds has one feature already had?
 *
 * The stopping rule existed ONLY as a sentence in a prose module:
 *
 *     .claude/skills/feature-adr/modules/08-qe.md:246
 *     "Max iterations: 3. After 3 iterations, flag remaining gaps for user decision."
 *
 * MEASURED 2026-08-27: no counter existed anywhere — `grep -rl 'ReviewScope|scopeId|findingId|
 * lineage'` over harness-core/src and harness-cli/src returned nothing. So the rule sat at layer 4 of
 * the cost-of-detection ladder, and every restart of the agent forgot the sentence. One real slug
 * accumulated **38** graded rounds and 4 failed attempts against a documented ceiling of 3.
 *
 * This module READS what `dz qe-bridge` already writes. It records nothing of its own — deliberately:
 * a counter that starts recording today could not answer for the 38 rounds already on disk, which are
 * the only real evidence this feature has.
 */
/** One graded review round, as `dz qe-bridge` recorded it. */
export interface QeRound {
    runId: string;
    emittedAt: string;
    grade: string;
    /** Findings by severity, lowercased. Absent severities are simply not present. */
    severities: Record<string, number>;
    /** The file this round was read from, so a caller can point at it. */
    file: string;
}
/** An attempt that produced NO verdict. Never merged into the round count, never dropped. */
export interface QeFailedAttempt {
    runId: string;
    emittedAt: string;
    reason: string;
    file: string;
}
export type QeRoundsStatus = 'under-ceiling' | 'at-or-over-ceiling' | 'not-established';
export interface QeRoundsReport {
    status: QeRoundsStatus;
    /** Present only when status is 'not-established'. */
    notEstablishedReason?: string | undefined;
    /** The directory actually read. One directory — never a union. */
    dir: string;
    ceiling: number;
    /** Distinct runIds among graded sign-offs. THIS is the number the ceiling applies to. */
    rounds: number;
    /** Graded rounds in emission order. */
    roundList: QeRound[];
    /** Attempts that produced no verdict. Reported separately, on purpose. */
    failedAttempts: QeFailedAttempt[];
    /** Files that would not parse or carried no runId. Named, never silently skipped. */
    unreadable: {
        file: string;
        why: string;
    }[];
    /** Grades in emission order, e.g. ['C','C','B'] — a shape a reader can judge at a glance. */
    grades: string[];
    firstAt?: string | undefined;
    lastAt?: string | undefined;
}
export declare const QE_ROUNDS_DEFAULT_CEILING = 3;
/**
 * Read ONE feature directory's review rounds.
 *
 * `featureDir` is a directory, never a slug — and that is load-bearing. MEASURED 2026-08-27: the slug
 * `package-story-page-hardening` exists in two separate checkouts holding 38 and 7 records. A function
 * that resolved a slug by searching would have summed them to 45 for a run that had 38, and the
 * output would look identical to a correct one. Resolving a slug to a directory is the caller's job.
 */
export declare function readQeRounds(featureDir: string, opts?: {
    ceiling?: number;
}): QeRoundsReport;
/** The number alone, for a caller that only needs to compare it. `-1` means NOT ESTABLISHED. */
export declare function countQeRounds(featureDir: string, opts?: {
    ceiling?: number;
}): number;
//# sourceMappingURL=qe-rounds.d.ts.map