---
description: Determine the next feature to work on. Reads `.claude/feature-roadmap.json`, applies priority + status filters, and returns the top entry. Subcommands: default (show top 3), `update` (scan codebase + suggest status changes), `<feature-id>` (mark a specific feature done and cascade unblock).
argument-hint: '[update | <feature-id>]'
---

# /next $ARGUMENTS

## Purpose

Single source of "what to work on next" backed by `.claude/feature-roadmap.json`.
Used by `/run` for autonomous loops and by humans to navigate sprint state.

## Modes

### Default (no arguments)

1. Read `.claude/feature-roadmap.json`
2. Filter entries to `status ∈ {next, planned}`
3. Sort by priority (`mvp` > `high` > `medium` > `low`), then by `id`
4. Output top 3 entries with: id, name, priority, complexity hint, blockers

```
═══════════════════════════════════════════════════════════════
Next 3 features:
1. [mvp] auth-jwt           — User login with JWT tokens (medium, 2-4h)
2. [mvp] user-profile       — Profile CRUD endpoints (simple, 1-2h)
3. [high] payment-webhook   — Stripe webhook handler (complex, 4-6h)

In progress: <id> [<name>]
Done: <N> / <total>
Blocked: <count> (run /next blocked to see)
═══════════════════════════════════════════════════════════════
```

### `/next update`

1. Scan codebase for evidence of feature completion (e.g., file paths in
   roadmap entry's `expected_files` exist + tests pass)
2. Suggest status updates for each detected feature:
   - `planned` → `next` if dependencies met
   - `in_progress` → `done` if implementation + tests present
   - `next` → `blocked` if dependency entry is `blocked`
3. Print proposed diff, ask for confirmation
4. Apply, commit `docs(roadmap): update statuses`

### `/next <feature-id>`

1. Mark that feature `done` in roadmap
2. Cascade: any feature that listed `<feature-id>` as a blocker is unblocked
   (status `blocked` → `next`)
3. Update `last_completed` field
4. Commit roadmap, return next item to work on

## Roadmap Schema

`.claude/feature-roadmap.json`:

```json
{
  "version": "1.0",
  "features": [
    {
      "id": "auth-jwt",
      "number": 1,
      "branch": "feature/001-auth-jwt",
      "name": "JWT-based authentication",
      "priority": "mvp",
      "status": "next",
      "complexity": "medium",
      "estimated_hours": "2-4",
      "blockers": [],
      "expected_files": [
        "packages/backend/src/auth/jwt.ts",
        "packages/backend/src/auth/middleware.ts"
      ],
      "depends_on": []
    }
  ]
}
```

### Schema fields (post v1.5.0)

**This table is THE schema for `.claude/feature-roadmap.json`.** It is the only one: any other
document that shows the file's fields must point here rather than restate them, because two
descriptions of one file are two chances to be wrong and only one of them can be right.

**Who creates the file** — both answers are true, in different modes, and this is the one place that
says so:

- after `/replicate`, Phase 3 generates it from the PRD MVP scope;
- in Mode 2 (an existing project where `init` added the toolkit and `/replicate` never ran), the user
  writes it by hand if they want batch automation via `/run mvp`; ad-hoc `/feature <id>` needs no
  roadmap at all.

`priority` is a CLOSED set — `mvp`, `high`, `medium`, `low`. A value outside it is not a new priority,
it is a roadmap this toolkit cannot read: the status line counts MVP by `priority === 'mvp'` and will
mark the file rather than quietly report zero.

| Field | Required | Populated by | Purpose |
|-------|----------|--------------|---------|
| `id` | yes | initial roadmap generation | Stable kebab-case slug |
| `number` | optional | `--feature-branches` flag in `/run` or `/go` | Sequential 1, 2, 3 ... assigned on first encounter; used to compose branch name |
| `branch` | optional | `--feature-branches` flag after feature completes | `feature/{NNN}-{id}` actually pushed |
| `name` | recommended | initial generation | Human-readable title |
| `priority` | yes | initial generation | `mvp` \| `high` \| `medium` \| `low` |
| `status` | yes | lifecycle | `planned` \| `next` \| `in_progress` \| `done` \| `blocked` |
| `complexity` | optional | initial generation | `simple` \| `medium` \| `complex` |
| `estimated_hours` | optional | initial generation | Time hint |
| `blockers` | optional | manual | List of blocking issue IDs |
| `expected_files` | optional | initial generation | Used by `/next update` to detect completion |
| `depends_on` | optional | initial generation | Other feature IDs that must complete first |

## Auto-Generation

If `.claude/feature-roadmap.json` does not exist when `/next` is called:
1. Read `docs/PRD.md` and extract user stories
2. Generate initial roadmap with all stories as `planned`
3. Set MVP scope from PRD's "MVP" section
4. Commit `docs(roadmap): initial roadmap from PRD`

## Related

- `/run mvp` — automated loop over MVP-scoped roadmap entries
- `/go <id>` — work on a specific feature (called by /run)
- `docs/PRD.md` — source for initial roadmap generation
