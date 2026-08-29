---
name: "git-conflict-resolve"
description: "Resolves merge and rebase conflicts by preserving both sides' intent."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# git-conflict-resolve

Walk through merge, rebase, or cherry-pick conflicts one block at a time. Figure out what each side was trying to do.

## When to use

- User has merge conflicts after `git merge`
- User has rebase conflicts during `git rebase`
- User has cherry-pick conflicts from `git cherry-pick`
- User pastes a file with conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
- User says their rebase is stuck or they do not know how to continue
- User asks how to merge two branches that they know have conflicts
- User wants to understand what two divergent branches changed differently

## When NOT to use

- User wants to create a merge/PR (use a PR creation workflow)
- User wants to review changes that are already merged (use `pr-review`)
- User wants to undo a merge entirely (advise `git merge --abort` or `git reset`)
- User has build errors after a clean merge (no conflict markers -- use `debugging` or `ci-fix`)
- User wants to understand git concepts (branching, rebasing theory) without an active conflict

## Procedure

1. **Check the current state.** Before touching any files, understand the situation:
   - Run `git status` to see which files have conflicts and the current operation (merge, rebase, cherry-pick).
   - Run `git log --oneline --graph -20` to visualize the branch topology. Understand which commits are on each side.
   - Run `git diff --cc` to see the combined diff for conflicted files.
   - Identify: What branch/commit is being merged into what? How many commits are involved? How many files are conflicted?
   - If in a rebase, note which commit in the rebase sequence caused the conflict (`git rebase --show-current-patch`).

2. **For each conflict block, name both sides' intent.** Read the conflict markers carefully:
   ```
   <<<<<<< HEAD (or ours)
   // Code from the current branch
   =======
   // Code from the incoming branch
   >>>>>>> feature-branch (or theirs)
   ```
   For each block, explicitly state:
   - **Ours intent:** "The current branch changed X to do Y because Z"
   - **Theirs intent:** "The incoming branch changed X to do W because V"
   - **Classify the conflict:**
     - **Same-goal:** Both sides made the same change independently (e.g., both fixed the same bug). Resolution: pick either side -- they are equivalent.
     - **Independent:** Both sides changed the same area but for unrelated reasons (e.g., one added a parameter, one renamed the function). Resolution: merge both changes.
     - **Logical conflict:** Both sides changed the same logic in incompatible ways (e.g., one moved the code, one modified it). Resolution: requires understanding the desired behavior -- ASK THE USER.

3. **Pick resolution strategy per block.**
   - **Style conflicts** (imports reordered, formatting changes): Match the dominant branch's style. Usually the target branch (ours).
   - **Semantic/independent conflicts** (both sides added different things): Merge both additions. Order them logically (alphabetical for imports, chronological for migrations).
   - **Logical conflicts** (incompatible changes to the same logic): Do NOT guess. Present both versions to the user with your analysis of what each side intended, and ask which behavior they want. If you can propose a synthesis that preserves both intents, offer it as an option.
   - **Deletion conflicts** (one side deleted, the other modified): Check if the modification depends on the deleted code. If the deletion was a cleanup and the modification is a new feature, keep the modified version.

4. **Order multi-file resolution: leaves to roots.** When multiple files conflict:
   - Start with leaf files (utilities, helpers, types) that other files depend on.
   - Then resolve files that import from the leaves.
   - Finally resolve entry points and configuration files.
   - This order prevents cascading re-conflicts and lets you verify imports as you go.
   - For each file, read the full file after resolving (not just the conflict hunks) to ensure consistency.

5. **Verify the resolution.** After resolving all conflicts:
   - Run `git diff` to review the complete resolution. Read every changed line.
   - Run the test suite (`npm test -- --run` or equivalent). Passing tests are the strongest signal that the resolution is correct.
   - Check for common merge artifacts:
     - Duplicate imports
     - Duplicate function definitions
     - Missing imports for code that was added by one side
     - Inconsistent variable names (one side renamed, the other added references to the old name)
   - If tests fail, the resolution has a bug. Fix it before continuing.

6. **Stage and continue with the correct command.** The continue command depends on the operation:
   - **Merge:** `git add <resolved-files>` then `git commit` (or `git merge --continue`)
   - **Rebase:** `git add <resolved-files>` then `git rebase --continue`
   - **Cherry-pick:** `git add <resolved-files>` then `git cherry-pick --continue`
   - Never use `git add .` -- only stage the files you intentionally resolved.
   - After continuing, verify with `git log --oneline -5` that the history looks correct.

7. **Escape hatches.** If the resolution goes wrong or the user wants to start over:
   - **Abort the operation:** `git merge --abort`, `git rebase --abort`, or `git cherry-pick --abort`. This returns to the state before the operation started.
   - **Skip a commit during rebase:** `git rebase --skip` (only if the commit is truly unnecessary after resolution).
   - **Start a rebase over:** `git rebase --abort` then re-plan the rebase strategy. Sometimes interactive rebase with reordered commits avoids the conflict entirely.
   - **Nuclear option:** If the branch is deeply tangled, suggest creating a new branch from the target and manually applying changes with `git cherry-pick` or `git diff | git apply`.
   - Always inform the user of these options. Never force a resolution path.

## Key Rules

- Never resolve a logical conflict without the user's input. You can propose a resolution, but the user decides.
- Read the full file after resolving, not just the conflict hunks. Context matters.
- Run tests after resolving. A green test suite is the only reliable confirmation.
- Use the correct continue command for the operation in progress. `git merge --continue` is not the same as `git rebase --continue`.
- When in doubt, abort and re-plan. A clean abort is better than a bad resolution.
- Do not use `git checkout --ours` or `git checkout --theirs` on entire files unless you have verified the other side has no meaningful changes in that file.

## Output Format

Return a structured resolution with: conflict summary (files, blocks, classifications), resolution per block with rationale, verification results (tests, diff review), and the continue command to run.
