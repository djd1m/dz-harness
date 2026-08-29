# 04. API Reference

Formal reference: CLI commands, flags, JSON schemas.

## CLI: `npx @dzhechkov/p-replicator`

### Subcommands

| Subcommand | Purpose | Exit code |
|---|---|---|
| `init` (default) | Install package in project | `0` ok, `1` if already installed without `--force` |
| `update` | Upgrade files to new version | `0` ok, `1` if not installed |
| `remove` | Delete package-tracked files | `0` ok, `1` if not installed |
| `list` | List installed components | `0` |
| `doctor` | Health check of pre-shipped contract | `0` ok, `1` if anything broken |
| `verify` | Pre-shipped + post-/replicate verification | `0` ok, `1` if pre-shipped contract violated |

### Global flags

| Flag | Where it works | Description |
|---|---|---|
| `--force` | `init` | Overwrite existing files (with merge logic for settings.json) |
| `--dry-run` | `init`, `update`, `remove` | Preview without writing to disk |
| `--reset-settings` | `init --force`, `update` | Full overwrite of settings.json (disables merge) |
| `--help`, `-h` | any | Show help |
| `--version`, `-v` | any | Show package version |

### Slash command flags (inside Claude Code)

| Flag | Where | Description |
|---|---|---|
| `--feature-branches` | `/run`, `/go` | Each feature on its own branch `feature/{NNN}-{id}` |
| `--auto-merge` | `/run`, `/go` (with `--feature-branches`) | Auto-merge feature branch into main on success |
| `--skip-tests` | `/start` | Skip test generation |
| `--skip-seed` | `/start` | Skip DB seeding |
| `--dry-run` | `/start`, `/replicate` | Preview without writing |

---

## Manifest schema (`.p-replicator.json`)

```json
{
  "version": "1.5.0",
  "installedAt": "2026-05-07T12:00:00.000Z",
  "components": ["agents", "commands", "hooks", "rules", "settings", "skills"],
  "files": [
    ".claude/agents/doc-validator.md",
    ".claude/commands/replicate.md",
    "...sorted list of all installed files..."
  ],
  "shippedDefaults": {
    "settings.json": {
      "hooks": { "SessionStart": [...], "Stop": [...] },
      "statusLine": { "type": "command", "command": "..." }
    }
  }
}
```

| Field | Type | Purpose |
|---|---|---|
| `version` | semver | Package version at last install/update |
| `installedAt` | ISO-8601 | Timestamp of last install |
| `components` | array of group keys | Pre-shipped groups |
| `files` | sorted array | All package-tracked files (for `remove`) |
| `shippedDefaults` | optional map | Template snapshots for orphan detection on upgrade |

**Backward compat:** manifest without `shippedDefaults` (pre-1.4.3) loads
without error — orphan detection is skipped on first upgrade.

---

## Roadmap schema (`.claude/feature-roadmap.json`)

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

### Feature fields

| Field | Required | Type | Populated by | Purpose |
|-------|----------|------|--------------|---------|
| `id` | yes | kebab-case slug | initial generation | Stable identifier |
| `number` | optional | int | `--feature-branches` flag | Sequential 1..N for branch naming |
| `branch` | optional | string | `--feature-branches` after success | `feature/{NNN}-{id}` actual ref |
| `name` | recommended | string | initial generation | Human-readable title |
| `priority` | yes | enum | initial generation | `mvp` \| `high` \| `medium` \| `low` |
| `status` | yes | enum | lifecycle | `planned` \| `next` \| `in_progress` \| `done` \| `blocked` |
| `complexity` | optional | enum | initial generation | `simple` \| `medium` \| `complex` |
| `estimated_hours` | optional | string | initial generation | Time hint |
| `blockers` | optional | string[] | manual | Issue IDs |
| `expected_files` | optional | string[] | initial generation | Used by `/next update` for completion detection |
| `depends_on` | optional | string[] | initial generation | Feature IDs that must complete first |

---

## State file schema (`.claude/.p-replicator-state.json`)

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

| Field | Type | Purpose |
|---|---|---|
| `currentCommand` | `/<name>` | Active command (`null` if idle) |
| `currentPhase` | object | Live progress in current command |
| `currentPhase.name` | string | Phase name (e.g., `VALIDATE`) |
| `currentPhase.index` | int | Current phase 1..total |
| `currentPhase.total` | int | Total phases |
| `currentPhase.progress` | float 0..1 | Progress within current phase |
| `lastCommand` | `/<name>` | Previous command (for status) |
| `lastFeature` | string | ID of last implemented feature |
| `updatedAt` | ISO-8601 | Timestamp |

**Stale check:** statusline ignores state older than 30 minutes.

**Update API:**

```bash
node .claude/hooks/state-update.cjs \
  --command /feature \
  --phase VALIDATE \
  --index 2 \
  --total 4 \
  --progress 0.5 \
  --last-command /replicate \
  --last-feature auth-jwt
```

Or with full JSON:

```bash
node .claude/hooks/state-update.cjs --json '{"currentCommand":"/run", ...}'
```

---

## settings.json structure

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "_comment": "Description",
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/statusline.cjs"
  },
  "hooks": {
    "SessionStart": [ /* matchers + hooks */ ],
    "Stop": [ /* matchers + hooks */ ],
    "PreToolUse": [ /* user-added */ ],
    "PostToolUse": [ /* user-added */ ]
  }
}
```

### `statusLine` field

```json
{
  "statusLine": {
    "type": "command",       // only "command" supported
    "command": "node .claude/hooks/statusline.cjs"
  }
}
```

Script writes multi-line ANSI output to stdout. Remove the field to disable
statusline (merge preserves the deletion on upgrade).

### `hooks.<EventType>` array

Each entry:

```json
{
  "matcher": "*",                    // or regex for tool-name
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/X.cjs",
      "timeout": 10                  // seconds
    }
  ]
}
```

**Event types in Claude Code:**
- `SessionStart` — at session start (stdout injected into context)
- `Stop` — at turn end (side-effects: commit, log)
- `PreToolUse`, `PostToolUse` — around tool calls

---

## COMPONENTS schema (in `src/utils.js`)

The contract for what's shipped vs generated:

```javascript
const COMPONENTS = {
  skills: {
    src: '.claude/skills',
    kind: 'pre-shipped',
    label: 'Skills (10 skill packs)',
    group: 'core',
    items: { 'explore': '...', /* ... 10 entries */ },
  },
  commands: { kind: 'pre-shipped', items: { /* 11 */ } },
  agents:   { kind: 'pre-shipped', items: { /* 4 */ } },
  rules:    { kind: 'pre-shipped', items: { /* 5 */ } },
  settings: { isFile: true, kind: 'pre-shipped', items: { 'settings.json': '...' } },
  hooks:    { kind: 'pre-shipped', items: { /* 6 */ } },

  // Project-generated (created by /replicate Phase 3)
  projectAgents: { kind: 'project-generated', items: { /* full paths */ } },
  projectRules:  { kind: 'project-generated', items: { /* full paths */ } },
  projectFiles:  { kind: 'project-generated', items: { /* full paths */ } },
};
```

**Identity:**
- `kind: 'pre-shipped'` — installed by `init`, file paths derived from `src` + item key
- `kind: 'project-generated'` — created by `/replicate` Phase 3, item keys ARE full paths
- `isFile: true` — single-file component (settings.json), not a directory

**Helper:** `utils.getItemRelativePath(comp, itemKey)` centralizes path
derivation:
- pre-shipped skills: `<src>/<itemKey>/SKILL.md`
- pre-shipped hooks: `<src>/<itemKey>.cjs`
- pre-shipped commands/rules/agents: `<src>/<itemKey>.md`
- pre-shipped settings.json: `comp.src` (full path)
- project-generated: `itemKey` (already full path)

Used by `verify`, `doctor`, `list` for uniform path resolution.

---

## Hook scripts API

### `session-insights.cjs`

**Trigger:** `SessionStart` hook.
**Reads:** `.claude/insights/index.md` (`## YYYY-MM-DD` headings)
**Writes:** stdout (Claude Code injects into session context)
**Output:** up to 3 recent insights as `## Recent project insights\n\n## ... ## ... ## ...`

### `autocommit-roadmap.cjs` / `autocommit-insights.cjs` / `autocommit-plans.cjs`

**Trigger:** `Stop` hook.
**Reads:** target paths
**Side-effect:** `git add` + `git diff --cached --quiet` check + `git commit --only` if changed
**stdout/stderr:** suppressed
**Always exits 0** (best-effort)

### `statusline.cjs`

**Trigger:** Claude Code `statusLine` config (every prompt render).
**Reads:** filesystem heuristics + state-file
**Writes:** stdout 6-line ANSI output (header + 5 content)
**Defensive:** every section wrapped in `safeRun()` with fallback

### `state-update.cjs`

**Invoked:** by pipeline commands via Bash tool
**Args:** `--command`, `--phase`, `--index`, `--total`, `--progress`, `--last-command`, `--last-feature`, `--json`
**Writes:** `.claude/.p-replicator-state.json`
**Always exits 0** (best-effort)

---

## Next

- [05_architecture.md](./05_architecture.md) — internal design details
