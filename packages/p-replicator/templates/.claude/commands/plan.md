---
description: Lightweight implementation planning. Creates a single plan file in `docs/plans/<feature>.md` with sections (Goal, Tasks, Files, Dependencies, Risks). Faster alternative to `/feature` for tasks touching ≤ 3 files.
argument-hint: '<feature-name | task-description>'
---

# /plan $ARGUMENTS

## Purpose

Generate a focused implementation plan for a small task without running the
full SPARC-mini lifecycle. Plans live in `docs/plans/` and are auto-committed.

## When to use /plan vs /feature

| Use `/plan` | Use `/feature` |
|-------------|----------------|
| ≤ 3 files | ≥ 4 files |
| < 30 min implementation | > 1 hour |
| No new architecture | New layer/pattern |
| Bug fix or small improvement | New capability |

If unsure, run `/go <name>` — it scores complexity and routes correctly.

## Process

### 1. Clarify (if ambiguous)

Read `$ARGUMENTS`. If task is too vague, ask 1-3 targeted questions before
proceeding.

### 2. Read Context

- `docs/Architecture.md` — relevant subsystems
- `docs/Specification.md` — requirements that touch this task
- Source files matching the task scope (use Grep to locate)

### 3. Write Plan

Create `docs/plans/<slug>.md` with:

```markdown
# Plan: <feature-name>

**Status:** draft
**Created:** <ISO timestamp>
**Estimated:** <time>

## Goal
<1-2 sentence outcome statement>

## Tasks
- [ ] Task 1 — concrete, verifiable
- [ ] Task 2

## Files Touched
| File | Change | Reason |
|------|--------|--------|

## Dependencies
- Blocks: <feature-id>
- Blocked by: <feature-id>

## Risks
- <risk> — <mitigation>

## Verification
How to confirm done.
```

### 4. Auto-Commit

If `Stop` hook is configured (default in v1.4+), the plan auto-commits when
the response ends. Otherwise: `git add docs/plans/<slug>.md && git commit
-m "docs(plan): <feature-name>"`.

### 5. Report

```
✅ Plan saved: docs/plans/<slug>.md
   Tasks: <N>, Files: <count>
   Next: implement directly, or run /go <slug> for autonomous execution
```

## Related

- `/feature` — full SPARC-mini lifecycle (heavier)
- `/go` — auto-pick between /plan and /feature
- `docs/plans/` — directory of all plans
