/** Pure cleanup decisions: the CLI gathers facts and executes the explicit apply selection. */
export type WorktreeFact = {
  path: string; branch: string | null; detached: boolean; isMain: boolean;
  merged: boolean | null; dirtyFiles: string[]; lastCommitTs: number | null;
};
export type WorktreeCleanupPlan = {
  now: number;
  remove: WorktreeFact[];
  keep: { fact: WorktreeFact; reason: 'main' | 'unmerged' | `dirty (${number})` | 'younger than retention' | 'merged-unknown' }[];
};

export function planWorktreeCleanup(facts: WorktreeFact[], opts: { now: number; retentionMs: number }): WorktreeCleanupPlan {
  const plan: WorktreeCleanupPlan = { now: opts.now, remove: [], keep: [] };
  for (const fact of facts) {
    let reason: WorktreeCleanupPlan['keep'][number]['reason'] | undefined;
    if (fact.isMain) reason = 'main';
    else if (fact.dirtyFiles.length > 0) reason = `dirty (${fact.dirtyFiles.length})`;
    else if (fact.merged === null) reason = 'merged-unknown';
    else if (!fact.merged) reason = 'unmerged';
    else if (fact.lastCommitTs === null || !(opts.now - fact.lastCommitTs > opts.retentionMs)) reason = 'younger than retention';
    if (reason) plan.keep.push({ fact, reason });
    else plan.remove.push(fact);
  }
  return plan;
}

/** The apply boundary is independently mutable while all filesystem work stays in the CLI. */
export function worktreeRemovalsToApply(plan: WorktreeCleanupPlan, apply: boolean): WorktreeFact[] {
  return apply ? plan.remove : [];
}

export function renderCleanupPlan(plan: WorktreeCleanupPlan): string[] {
  return [
    ...plan.remove.map(fact => `remove ${fact.path} (${fact.branch ?? 'detached'}, ${Math.floor((plan.now - fact.lastCommitTs!) / 86400000)}d)`),
    ...plan.keep.map(({ fact, reason }) => `keep ${fact.path} — ${reason}` +
      (reason.startsWith('dirty (') ? ': ' + fact.dirtyFiles.slice(0, 5).join(', ') + (fact.dirtyFiles.length > 5 ? ' …' : '') : '')),
  ];
}
