export function planWorktreeCleanup(facts, opts) {
    const plan = { now: opts.now, remove: [], keep: [] };
    for (const fact of facts) {
        let reason;
        if (fact.isMain)
            reason = 'main';
        else if (fact.dirtyFiles.length > 0)
            reason = `dirty (${fact.dirtyFiles.length})`;
        else if (fact.merged === null)
            reason = 'merged-unknown';
        else if (!fact.merged)
            reason = 'unmerged';
        else if (fact.lastCommitTs === null || !(opts.now - fact.lastCommitTs > opts.retentionMs))
            reason = 'younger than retention';
        if (reason)
            plan.keep.push({ fact, reason });
        else
            plan.remove.push(fact);
    }
    return plan;
}
/** The apply boundary is independently mutable while all filesystem work stays in the CLI. */
export function worktreeRemovalsToApply(plan, apply) {
    return apply ? plan.remove : [];
}
export function renderCleanupPlan(plan) {
    return [
        ...plan.remove.map(fact => `remove ${fact.path} (${fact.branch ?? 'detached'}, ${Math.floor((plan.now - fact.lastCommitTs) / 86400000)}d)`),
        ...plan.keep.map(({ fact, reason }) => `keep ${fact.path} — ${reason}` +
            (reason.startsWith('dirty (') ? ': ' + fact.dirtyFiles.slice(0, 5).join(', ') + (fact.dirtyFiles.length > 5 ? ' …' : '') : '')),
    ];
}
//# sourceMappingURL=run-cleanup.js.map