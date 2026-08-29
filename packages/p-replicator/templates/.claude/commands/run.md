---
description: Autonomous build loop — picks next feature from roadmap, dispatches to /go, repeats until exhausted. Modes: `mvp` (default — only features tagged mvp), `all` (everything in `next` or `planned`). Auto-commits after each feature. Supports `--feature-branches` for per-feature git branches (teaching/demo workflow).
argument-hint: '[mvp | all] [--feature-branches] [--auto-merge]'
---

# /run $ARGUMENTS

## Purpose

One-command autonomous feature build. Reads `.claude/feature-roadmap.json`,
loops through features via `/next` → `/go`, marks them done, commits, and
continues until the scoped list is exhausted.

> **PROCESS COMPLIANCE — BLOCKING RULES:**
> - MUST delegate to `/next`, `/go`, `/plan`, `/feature` — NEVER spawn raw Agent tools directly
> - MUST commit after each feature (one feature = one commit cluster)
> - FORBIDDEN: bypassing /go's complexity routing
> - FORBIDDEN: batching multiple features in a single commit wave

## Step 0: Parse Scope

| `$ARGUMENTS` | Filter applied to roadmap |
|--------------|---------------------------|
| `mvp` (default if empty) | Only features with `priority: "mvp"` and status in `next`/`planned` |
| `all` | All features with status in `next`/`planned` |

If `.claude/feature-roadmap.json` does not exist → halt with:
```
Roadmap not found. Run /replicate first or create .claude/feature-roadmap.json manually.
```

## Step 1: Bootstrap Check

If `CLAUDE.md` exists but core scaffolding is missing (e.g., no `package.json`,
no `docker-compose.yml`), call `/start` once before the loop. Skip if
scaffolding already in place.

## Step 2: Feature Loop

```
while features_remaining_in_scope:
    feature_id = /next                       # pick highest-priority next/planned
    if not feature_id: break
    /go feature_id                           # complexity router → /plan or /feature
    verify completion (tests green, code committed)
    mark roadmap entry: status = "done"
    git commit -m "docs(roadmap): mark <id> as done"
    git push origin HEAD
```

Between iterations, briefly summarize progress: `Completed N of M features in scope`.

## Step 3: Final Summary

When the loop terminates (scope exhausted or user interrupt):

```
═══════════════════════════════════════════════════════════════
✅ /run complete — scope: <mvp|all>
   Completed: <N> features
   Total commits: <count>
   Time elapsed: <duration>
   Next: /docs to generate documentation, /harvest to extract knowledge
═══════════════════════════════════════════════════════════════
```

## Error Recovery

If a single feature fails (test red, validation blocked), `/run`:
1. Marks that feature as `blocked` with reason
2. Continues to next feature in scope
3. At the end, lists all blocked features for manual review

`/run` does NOT abort the whole loop on one feature failure — autonomous mode
is designed for unattended operation.

## Flag: `--feature-branches` (v1.5.0)

Create a separate git branch per feature. Useful for **teaching/demo
workflows** where each feature must be a discrete unit the instructor can
checkout independently.

### Branch naming format

```
feature/{NNN}-{id}
```
where `NNN` is a zero-padded 3-digit feature number from the roadmap, and
`{id}` is the feature's slug. Example: `feature/001-auth-jwt`.

### Per-feature workflow with --feature-branches

```
For each feature in scope:
  1. Verify on `main` branch (else fail with hint to switch)
  2. If working tree is dirty:
       git stash push -u -m "auto-stash before /run feature-branches"
  3. Read roadmap entry; if feature has no `number`, assign max(numbers) + 1
     and persist back to .claude/feature-roadmap.json
  4. git checkout -b feature/{NNN}-{id}    # branched from main
  5. /go {feature-id}                       # delegate to standard pipeline
  6. git push origin feature/{NNN}-{id} --set-upstream
  7. Mark roadmap entry: status=done, branch="feature/{NNN}-{id}"
  8. git checkout main                      # ready for next iteration
  9. If --auto-merge ALSO passed:
       git merge --no-ff feature/{NNN}-{id} -m "merge: feature/{NNN}-{id}"
```

### Companion flag: `--auto-merge`

Off by default. When passed alongside `--feature-branches`, each feature
branch is merged into `main` (with `--no-ff`) immediately after completion.
Without `--auto-merge`, branches are pushed but **NOT** merged — instructor
or reviewer is expected to merge via PR or manually.

### Roadmap schema extension (post v1.5.0)

```json
{
  "id": "auth-jwt",
  "number": 1,
  "branch": "feature/001-auth-jwt",
  "name": "JWT-based authentication",
  "priority": "mvp",
  "status": "done",
  ...
}
```

`number` is auto-assigned on first encounter when `--feature-branches` is
used. `branch` is populated when the feature completes successfully.

### Use cases

- **Teaching:** instructor checks out `feature/003-payment` to demo a specific
  feature. All branches are pushed, easy to fetch and explore.
- **Code review:** each feature has standalone branch for PR-based review.
- **Experimentation:** abandon a branch cleanly without disturbing main.

### Anti-patterns

- Running `--feature-branches` while on a feature branch (not main) → fails
- Mixing `--feature-branches` with non-branch features in the same session
  → mark already-merged features explicitly with `branch: "main"` to avoid retry

## Related

- `/next` — picks next feature (called per iteration)
- `/go` — complexity router (called per feature; also accepts `--feature-branches`)
- `/plan`, `/feature` — actual implementation pipelines
- `.claude/feature-roadmap.json` — source of truth for what to build
