# Basic Evaluation: Context Window Management

## Eval 1: Priority-Based Pruning — Long Session

**Input:** Simulate a long conversation (50+ turns) with multiple file reads, verbose build outputs, and a current active task. Trigger: "manage context".

**Expected behavior:**
- Estimates context usage at >60%
- Selects Priority-Based Pruning strategy
- Ranks context items by priority tiers
- Summarizes low-priority items (old build logs, early conversation turns)
- Preserves: current task instructions, recent decisions, active file contents
- Reports context reduction percentage

**Pass criteria:**
- Context after is lower than context before
- Essential context preserved (current task, recent outputs)
- Build logs and old conversation turns summarized, not active files
- essential_context_preserved = true

---

## Eval 2: Checkpoint-Restore — Multi-Phase Task

**Input:** Mid-way through a multi-file refactoring with 10 files modified, 5 decisions made. Context at ~75%. Trigger: "save progress and continue".

**Expected behavior:**
- Selects Checkpoint-Restore strategy
- Writes checkpoint file with: files modified, decisions made, next steps
- Checkpoint file path reported
- After restore: essential state recovered from checkpoint

**Pass criteria:**
- Checkpoint file created at a valid path
- File contains structured state (not prose dump)
- Decisions and file list recoverable from checkpoint
- Context usage reduced after checkpoint

---

## Eval 3: Anti-Pattern — Premature Pruning Detection

**Input:** Context at 40% (below threshold). User says "compact".

**Expected behavior:**
- Estimates context at 40% (below 60% threshold)
- Reports that management is not yet needed
- Does NOT prune or summarize
- Suggests monitoring and revisiting at 60%

**Pass criteria:**
- Does not apply any strategy at 40% usage
- Explains the 60% threshold
- No context items lost
