# 06. Troubleshooting

Common issues and resolutions.

## Installation / `init`

### `init` refuses: "P-Replicator is already installed"

```bash
# To upgrade preserving customizations:
npx @dzhechkov/p-replicator update

# Or via init --force (also preserves customizations):
npx @dzhechkov/p-replicator init --force

# Full reset to defaults (loses user hooks):
npx @dzhechkov/p-replicator init --force --reset-settings
```

### Missing files after `init`

```bash
npx @dzhechkov/p-replicator doctor
```

If anything fails (e.g., "security.md missing"):

```bash
npx @dzhechkov/p-replicator init --force      # full pre-shipped reinstall
```

### Install went to `~/node_modules` instead of project

Cause: no `package.json` in your project, npm walks up and finds one in
home directory.

Fix: create `package.json` in project root:

```bash
npm init -y
npx @dzhechkov/p-replicator init
```

---

## After `/replicate`

### `/replicate` didn't generate expected commands (`/run`, `/feature`, `/myinsights`, ...)

**This is solved in v1.4.0+.** All 11 generic commands are now **pre-shipped**
via `init` — `/replicate` Phase 3 doesn't generate them, only enhances
project-specific artifacts.

If you're on an old version (≤1.3.x):

```bash
npx @dzhechkov/p-replicator@latest init --force
```

After upgrade, `verify` will show the full set:

```bash
npx @dzhechkov/p-replicator verify
```

### `/replicate` Phase 3 says "Generate /commands/start.md"

Stale phrasing in `replicate.md`. Should read "Pre-shipped... do NOT
overwrite". If you see this:

```bash
npx @dzhechkov/p-replicator@latest update    # updates replicate.md
```

In v1.4.0+ a meta-test catches this regression. See
`tests/e2e/lifecycle.test.js` describe `meta: doc-consistency`.

### Project-specific agents (planner.md, architect.md) not created

Normal if `/replicate` Phase 3 hasn't run yet. Run `/replicate "description"`
in Claude Code.

`verify` shows them as **hints** (warning, not error) when `CLAUDE.md` or
`feature-roadmap.json` exists but agents are absent.

---

## Hooks / Statusline

### Statusline doesn't appear

**Checks:**

1. Does your Claude Code version support `statusLine` config? Update Claude Code.
2. Is `statusLine` field present in `.claude/settings.json`?
   ```bash
   cat .claude/settings.json | grep -A 3 statusLine
   ```
3. Does the script run directly?
   ```bash
   node .claude/hooks/statusline.cjs
   ```
   Should print 6 lines of ANSI output.

If point 3 fails:

```bash
node .claude/hooks/statusline.cjs 2>&1
```

Shows stack trace. Likely corrupt JSON or missing `.p-replicator.json`.

### Hooks aren't auto-committing

```bash
npx @dzhechkov/p-replicator doctor
```

In `Prerequisites:` section, expect:

```
✓ git on PATH
```

If `✗ git NOT on PATH` — install git, add to PATH.

Also verify `.git` directory exists (you're in a repo):

```bash
git rev-parse --git-dir
```

### Hooks run but don't commit anything

**Cause:** `.git` exists but no changes to commit (which is normal).

**Debug** directly:

```bash
node .claude/hooks/autocommit-roadmap.cjs
echo "Exit: $?"
git log -1 --format="%s"
```

If a file isn't tracked by git, do `git add .claude/feature-roadmap.json`
manually once.

### Statusline shows "Settings ⚠️ merged" but I didn't change anything

Cause: some process modified `settings.json` (formatting, whitespace,
ordering). Statusline compares via deep-equals on sorted keys.

Fix:

```bash
npx @dzhechkov/p-replicator init --force --reset-settings
```

### Settings.json lost my custom hooks after update

**This WAS a bug pre-v1.4.2.** In v1.4.2+, `update` and `init --force` use
`mergeSettingsJson` which preserves user customizations.

If you're on v1.4.1 or earlier:

```bash
npx @dzhechkov/p-replicator@latest update
```

If you've irrecoverably lost hooks — restore from git history:

```bash
git log -p --follow -- .claude/settings.json
```

---

## Roadmap / `--feature-branches`

### `/run --feature-branches` immediately fails "not on main"

Cause: you're on a feature branch (not main).

```bash
git status
git checkout main           # switch to main
/run mvp --feature-branches
```

### `--feature-branches` lost my unsaved changes

They're in stash:

```bash
git stash list                              # list stashes
git stash show stash@{0}                    # preview
git stash pop                               # restore (or git stash drop to discard)
```

`p-replicator` auto-stashes with message "auto-stash before /run feature-branches".

### Feature branch without `number` in roadmap

Cause: roadmap created pre-v1.5.0 (no `number` field).

`--feature-branches` flag auto-assigns `number = max(numbers) + 1` on first
encounter, persists back. Just run `/run mvp --feature-branches` again —
numbers fill in.

---

## Tests / Snapshot

### `npm test` fails after my template changes

```bash
npm test 2>&1 | head -30                    # see which tests fail
```

Common causes:

1. **Snapshot test fails** — templates changed, baseline outdated.
   ```bash
   npm run snapshot:baseline                # regenerate
   npm test                                 # should be green
   ```

2. **Meta-test fails** — `replicate-pipeline.md` or `replicate.md` mention
   pre-shipped command in wrong section. Review your edits.

3. **Unit test fails on COMPONENTS** — broke SSOT. Check that you added
   `kind`, `items`, `label` to the new component group.

### `verify` shows orphans post-init

Cause: you upgraded from an old version (≤1.4.2) that didn't track
`shippedDefaults`. Orphan detection skipped on first upgrade.

Fix:

```bash
npx @dzhechkov/p-replicator init --force    # populate shippedDefaults in manifest
npx @dzhechkov/p-replicator init --force    # second pass removes real orphans (if any)
```

After this, orphan detection works on every subsequent upgrade.

---

## Insights

### Insights aren't auto-injected into new sessions

**Checks:**

1. Does `.claude/insights/index.md` exist with entries?
   ```bash
   wc -l .claude/insights/index.md
   grep -c "^## " .claude/insights/index.md      # entry count
   ```
2. Does the `session-insights.cjs` hook work?
   ```bash
   node .claude/hooks/session-insights.cjs
   ```
   Should print `## Recent project insights\n\n## ... ## ... ## ...`.
3. Is the SessionStart hook configured?
   ```bash
   cat .claude/settings.json | grep -A 5 SessionStart
   ```

If all 3 are OK but still nothing — Claude Code may cache session context.
Restart `claude`.

### `/myinsights recall <query>` finds nothing

Cause: query doesn't match tags. Recall is case-insensitive substring
search across tags + body.

Tip: check entry tags:

```bash
grep "^\*\*Tags:" .claude/insights/index.md | head -10
```

Use a more specific query (e.g., `prisma` instead of `bug`).

---

## MCP servers

### MCP servers don't connect

This is outside `p-replicator` scope — it's Claude Code config. Check:

```bash
cat .mcp.json                           # format correct?
claude --debug                          # MCP errors in logs?
```

Statusline shows server count from `.mcp.json` regardless of working state.

---

## Performance

### Statusline lags on every command

**Cause:** very large `docs/` or filesystem trees.

**Diagnose:**

```bash
time node .claude/hooks/statusline.cjs    # how many seconds?
```

Should be < 100ms. If > 1s, check `docs/` size:

```bash
du -sh docs/
find docs/ -type f -name "*.md" | wc -l
```

**Workaround:** temporarily disable statusline by removing the
`statusLine` field in `.claude/settings.json`.

See `KNOWN_LIMITATIONS.md` item L6 — future enhancement: env var
`STATUSLINE_PROFILE=1` for per-section measurements.

---

## Version incompatibilities

### I'm on an old version. Should I upgrade?

| Current → Target | What you get | Migration cost |
|---|---|---|
| 1.3.x → 1.5.0 | All pre-shipped commands + statusline + feature-branches + merge logic | Run `init --force` (preserves customizations) |
| 1.4.0 → 1.4.1 | Cross-platform hooks + sync merge mode | `init --force` |
| 1.4.1 → 1.4.2 | Settings merge (preserve customizations) | `init --force` is safe (preserves) |
| 1.4.2 → 1.4.3 | Orphan detection | First upgrade lacks baseline — re-run `init --force` to populate |
| 1.4.3 → 1.5.0 | Statusline + --feature-branches | `update` or `init --force` |

Full history — in [07_changelog.md](./07_changelog.md) or `CHANGELOG.md`
(authoritative).

---

## When all else fails

1. Read `KNOWN_LIMITATIONS.md` — might be a known limitation
2. Run `verify` + `doctor` — collect exact output
3. File issue: https://github.com/djd1m/dz-harness-hub/issues
   include: version, `verify` output, repro steps
