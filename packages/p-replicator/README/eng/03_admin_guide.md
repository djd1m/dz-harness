# 03. Admin Guide

For users who want to understand and customize the `p-replicator`
infrastructure: hooks, statusline, settings.json, insights, roadmap.

## settings.json — main configuration

**Location:** `.claude/settings.json` in the project root.

**Default structure (after init):**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "_comment": "Default hooks + statusline shipped by @dzhechkov/p-replicator init.",
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/statusline.cjs"
  },
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/session-insights.cjs", "timeout": 5 }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/autocommit-roadmap.cjs", "timeout": 10 },
          { "type": "command", "command": "node .claude/hooks/autocommit-insights.cjs", "timeout": 10 },
          { "type": "command", "command": "node .claude/hooks/autocommit-plans.cjs", "timeout": 10 }
        ]
      }
    ]
  }
}
```

**Customization:** add new hooks or event types — they will be **preserved**
on `init --force` or `update` thanks to merge logic (`mergeSettingsJson` +
`removeOrphanHooks`).

**Full reset to defaults:**

```bash
npx @dzhechkov/p-replicator init --force --reset-settings
```

---

## Hooks — lifecycle

`p-replicator` ships **6 cross-platform Node scripts** in `.claude/hooks/`:

| Hook | Event | Purpose |
|---|---|---|
| `session-insights.cjs` | SessionStart | Inject 3 recent insights from `.claude/insights/index.md` to stdout (Claude Code captures) |
| `autocommit-roadmap.cjs` | Stop | Auto-commit `.claude/feature-roadmap.json` if changed |
| `autocommit-insights.cjs` | Stop | Auto-commit `.claude/insights/` if changed |
| `autocommit-plans.cjs` | Stop | Auto-commit `docs/plans/` if changed |
| `statusline.cjs` | (statusLine) | Multi-line dashboard above the prompt |
| `state-update.cjs` | (utility) | Argv-driven helper for writing `.claude/.p-replicator-state.json` |

**Cross-platform discipline:** all 4 autocommit scripts use
`execFileSync('git', [...])` (no shell pipes, no `2>/dev/null`/`|| true`).
Works identically on Windows-cmd, bash, PowerShell.

**Each script is defensive:** wrapped in try/catch, always exits 0
(best-effort, never blocks the session).

---

## Statusline — dashboard

**What it shows (6 lines):**

```
P-Replicator V1.5.0 ● user │ Sonnet 4.7
🚀 Pipeline   /<cmd> ▓▓▓░░░░ 50%  │ Phase: VALIDATE (2/4)  │ Last: /replicate
🎯 Roadmap    [●●●○○○○○] mvp 3/8   │ Done 5/12  │ ▶ auth-jwt  │ Domain: banking
📊 SPARC      ●11/11  │ 🟢 78/100  │ Plans ●3  │ ADRs ●2  │ Harvest 2026-05-05
🛠️ Toolkit   Skills ●10/10 │ Cmds ●11/11 │ Agents ●4+3 │ Rules ●13+2 │ Hooks ●17/17
💡 Insights   ●12 (2026-05-06) │ Tests 85/85 ✓ │ MCP ●1/1 │ Settings ✓ │ 🧬 Keysarium ✓
```

**Sources (heuristic + state-file):**

| Metric | Source |
|---|---|
| Pipeline command + phase + progress | `.claude/.p-replicator-state.json` |
| Roadmap progress | `.claude/feature-roadmap.json` |
| SPARC count | `docs/{PRD,Architecture,...}.md` |
| Validation score | regex extract from `docs/validation-report.md` |
| Plans count | `docs/plans/*.md` |
| ADRs count | `docs/ADR.md` H2/H3 headings, or `docs/adr/*.md`, or `docs/ddd/adr/*.md` |
| Insights count + last date | `## YYYY-MM-DD` in `.claude/insights/index.md` |
| Toolkit counts | filesystem walks of `.claude/{skills,commands,agents,rules,hooks}/` |
| Settings status | deep-equals current vs `manifest.shippedDefaults` |
| MCP servers | `.mcp.json` |
| Domain | keyword grep in `CLAUDE.md` |
| Last harvest | `TOOLKIT_HARVEST.md` mtime |
| Last test | optional `.claude/.last-test.json` cache |

**Stale state:** state file older than 30 minutes is ignored (Pipeline
section shows `idle`).

**Defensive design:** every section wrapped in `safeRun()` with fallback —
one parse error doesn't break the whole status bar.

**Disable statusline:**

Remove the `statusLine` field from `.claude/settings.json`. On next
`update` with merge logic, the deletion is preserved.

---

## State file for live progress

`.claude/.p-replicator-state.json` — ephemeral state, updated by commands
during pipeline execution:

```json
{
  "currentCommand": "/feature",
  "currentPhase": {
    "name": "VALIDATE",
    "index": 2,
    "total": 4,
    "progress": 0.5
  },
  "lastCommand": "/replicate",
  "lastFeature": "auth-jwt",
  "updatedAt": "2026-05-07T..."
}
```

**Updated via `state-update.cjs`:**

```bash
node .claude/hooks/state-update.cjs \
  --command /feature \
  --phase VALIDATE \
  --index 2 \
  --total 4 \
  --progress 0.5
```

Pipeline commands optionally call this script (via Bash tool) so statusline
shows real progress.

**⚠️ Known limitation:** this file is not auto-gitignored. Recommended:

```
echo ".claude/.p-replicator-state.json" >> .gitignore
echo ".claude/.last-test.json" >> .gitignore
```

See `KNOWN_LIMITATIONS.md` item L5.

---

## Insights system

**Storage:** `.claude/insights/index.md` (markdown log).

**Entry format:**

```markdown
## YYYY-MM-DD — short title

**Tags:** tag1, tag2, tag3

**Problem:**
What happened (1-3 sentences).

**Solution:**
What fixed it (1-5 sentences with code if relevant).

**References:** file:line or commit hash or external link

---
```

**Lifecycle:**

- ≤ 50 entries → single `index.md`
- > 50 → split into archive `<YYYY-MM>.md` with `index.md` as TOC
- Never delete — only supersede via `**Status:** superseded by <link>`

**Tag conventions:**
- ✅ `prisma-migration`, `postgres-timezone`, `docker-compose-network`
- ❌ `bug`, `fix`, `important` (too generic — recall fails)

**Auto-injection via SessionStart hook** — described above.

---

## Roadmap management

**File:** `.claude/feature-roadmap.json` (generated in `/replicate` Phase 3
from PRD MVP scope, or by hand).

**Schema (post v1.5.0):**

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
      "expected_files": ["packages/backend/src/auth/jwt.ts"],
      "depends_on": []
    }
  ]
}
```

**Lifecycle states:**
- `planned` → not yet prioritized
- `next` → next in queue (picked by `/next`)
- `in_progress` → actively being worked
- `done` → implemented
- `blocked` → waiting on `depends_on` or manual fix

**`number` and `branch`** are populated by `--feature-branches` flag in
`/run` or `/go`.

**Auto-commit** via `autocommit-roadmap.cjs` (Stop hook) on changes.

---

## Doctor + Verify — two distinct tools

| Tool | Checks | When |
|---|---|---|
| `npx @dzhechkov/p-replicator doctor` | Pre-shipped contract: 10 skills + 11 commands + 4 agents + 13 rules + settings.json + 17 hooks + git on PATH | After init / when something seems broken |
| `npx @dzhechkov/p-replicator verify` | Pre-shipped + post-/replicate hints (CLAUDE.md, planner.md, security.md, feature-roadmap.json, etc.) | After every `/replicate` to confirm |

**`doctor` exit codes:**
- `0` — all good
- `1` — something must-have is missing (run `init --force` to repair)

**`verify` exit codes:**
- `0` — pre-shipped contract OK (may have warnings about project-specific)
- `1` — pre-shipped contract violated

---

## Update workflow

```bash
# Safe upgrade with preserved customizations:
npx @dzhechkov/p-replicator@latest update

# Or via init --force (also preserves customizations):
npx @dzhechkov/p-replicator@latest init --force

# Full reset of settings.json to defaults:
npx @dzhechkov/p-replicator@latest init --force --reset-settings
```

**What the merge logic does:**
1. Reads `manifest.shippedDefaults['settings.json']` (what we shipped previously)
2. Reads current `templates/.claude/settings.json` (new template)
3. Reads `.claude/settings.json` (user's current)
4. **Orphan detection:** removes hooks present in old template but missing in new
5. **Merge:** adds hooks from new template that aren't already in user's current
6. User-added hooks (never in old template) are **preserved**

**Identity model:** hooks are compared by `command` string. User-modified
default (changed command) → treated as user-added, preserved.

See algorithm details in [05_architecture.md](./05_architecture.md).

---

## MCP servers

**File:** `.mcp.json` (project-local).

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

Statusline shows MCP server count in the Status line.

`/replicate` Phase 3 auto-generates `.mcp.json` when external integrations
are detected.

---

## Keysarium integration

If `.keysarium.json` (from sibling `@dzhechkov/keysarium` package) is
detected:

- `init` shows an integration banner
- Statusline shows `🧬 Keysarium ✓`
- `/replicate` Phase 3 doesn't duplicate skills already provided by Keysarium

Keysarium docs are in its own package.

---

## Next

- [04_api_reference.md](./04_api_reference.md) — formal schemas
- [05_architecture.md](./05_architecture.md) — internal design
- [06_troubleshooting.md](./06_troubleshooting.md) — common issues
