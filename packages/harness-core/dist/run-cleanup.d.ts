/** Pure cleanup decisions: the CLI gathers facts and executes the explicit apply selection. */
export type WorktreeFact = {
    path: string;
    branch: string | null;
    detached: boolean;
    isMain: boolean;
    merged: boolean | null;
    dirtyFiles: string[];
    lastCommitTs: number | null;
};
export type WorktreeCleanupPlan = {
    now: number;
    remove: WorktreeFact[];
    keep: {
        fact: WorktreeFact;
        reason: 'main' | 'unmerged' | `dirty (${number})` | 'younger than retention' | 'merged-unknown';
    }[];
};
export declare function planWorktreeCleanup(facts: WorktreeFact[], opts: {
    now: number;
    retentionMs: number;
}): WorktreeCleanupPlan;
/** The apply boundary is independently mutable while all filesystem work stays in the CLI. */
export declare function worktreeRemovalsToApply(plan: WorktreeCleanupPlan, apply: boolean): WorktreeFact[];
export declare function renderCleanupPlan(plan: WorktreeCleanupPlan): string[];
//# sourceMappingURL=run-cleanup.d.ts.map