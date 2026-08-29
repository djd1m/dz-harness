# 05. Architecture

Internal design of `p-replicator` — how it installs, upgrades, coexists
with user customizations.

## Two-tier model: Pre-shipped vs Project-generated

The fundamental architectural split:

| Tier | Created by | Lives in | Updated |
|---|---|---|---|
| **Pre-shipped** | `npx p-replicator init` | `.claude/{skills,commands,agents,rules,hooks}/` + `settings.json` | On each package upgrade |
| **Project-generated** | `/replicate` Phase 3 (LLM execution) | Various: `CLAUDE.md`, `.claude/agents/planner.md`, `docs/`, etc. | Only on regeneration |

This is **the main fix** of v1.4.0 — previously `/replicate` Phase 3 tried
to generate ALL artifacts (including generic commands like `/run`,
`/feature`), which led to flaky outputs (LLM compression, missed templates).
Post-v1.4.0, generic commands are pre-shipped, Phase 3 generates ONLY
project-specific artifacts.

---

## SSOT: `utils.COMPONENTS`

Single source of truth for what's shipped and what's generated:

```javascript
const COMPONENTS = {
  // Pre-shipped (6 groups, install via npx init):
  skills: { kind: 'pre-shipped', src: '.claude/skills', items: { /* 10 */ } },
  commands: { kind: 'pre-shipped', src: '.claude/commands', items: { /* 11 */ } },
  agents: { kind: 'pre-shipped', src: '.claude/agents', items: { /* 4 */ } },
  rules: { kind: 'pre-shipped', src: '.claude/rules', items: { /* 5 */ } },
  settings: { kind: 'pre-shipped', isFile: true, src: '.claude/settings.json' },
  hooks: { kind: 'pre-shipped', src: '.claude/hooks', items: { /* 6 */ } },

  // Project-generated (3 groups, created by /replicate Phase 3):
  projectAgents: { kind: 'project-generated', items: { /* full paths */ } },
  projectRules: { kind: 'project-generated', items: { /* full paths */ } },
  projectFiles: { kind: 'project-generated', items: { /* full paths */ } },
};
```

**Consumers:**
- `init.js` / `update.js` iterate only `kind === 'pre-shipped'` for install
- `doctor.js` checks existence of pre-shipped artifacts
- `list.js` outputs metadata
- `verify.js` checks BOTH groups (pre-shipped strict, project-generated hints)
- `cli.js` showHelp dynamically counts items for display

**Any future edit to items automatically updates all 5 surfaces** —
eliminating drift issues that existed pre-v1.3.1.

---

## Path derivation: `getItemRelativePath()`

A single helper centralizes path derivation across all groups:

```javascript
function getItemRelativePath(comp, itemKey) {
  if (comp.isFile) return comp.src;                                // settings.json
  if (comp.kind === 'project-generated') return itemKey;            // full paths
  if (comp.src === '.claude/skills') return path.join(comp.src, itemKey, 'SKILL.md');
  if (comp.src === '.claude/hooks') return path.join(comp.src, itemKey + '.cjs');
  return path.join(comp.src, itemKey + '.md');                     // commands/rules/agents
}
```

---

## Cross-platform hooks (v1.4.1)

**Design principle:** zero shell dependency.

All 7 hook scripts are pure Node, using `execFileSync('git', [...])`
instead of shell pipes. This works equivalently on:
- Windows cmd.exe (no `2>/dev/null`, no `2>nul` — neither needed)
- Bash / zsh / Git Bash on Windows
- PowerShell

**Pattern for autocommit script:**

```javascript
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TARGET = path.resolve(process.cwd(), '.claude', 'feature-roadmap.json');
const SILENT = { stdio: 'ignore' };
const git = (args) => execFileSync('git', args, SILENT);

try {
  if (!fs.existsSync(TARGET)) process.exit(0);
  try { git(['rev-parse', '--git-dir']); } catch { process.exit(0); }
  git(['add', '--', TARGET]);
  let hasDiff = false;
  try { git(['diff', '--cached', '--quiet', '--', TARGET]); }
  catch { hasDiff = true; }
  if (hasDiff) git(['commit', '--only', '--', TARGET, '-m', '...']);
} catch { process.exit(0); }
```

**Defensive properties:**
- `if (!fs.existsSync) exit 0` — no file, nothing to commit
- `try { rev-parse } catch { exit 0 }` — no git repo, skip
- `try { diff } catch { hasDiff = true }` — `git diff --quiet` exits 1 if diff
- Outer `try/catch` ensures exit 0 on any error (best-effort)

---

## Sync-templates: MERGE mode (v1.4.1)

**File:** `scripts/sync-templates.js` — **not** a `prepublishOnly` hook, and not part of publishing.
`prepublishOnly` runs the publish gate (`scripts/prepublish-gate.mjs`); this script is opt-in only and
refuses to run unless the root it finds carries a `.p-replicator-sync-source` marker. The section
below records how its MERGE mode works, for whoever opts in — it does not describe anything that
happens during a normal publish.

**Goal:** copy `.claude/` from source repo into `templates/.claude/` (which
ends up in the npm tarball).

**Pre-v1.4.1 (BUG):** `cleanDir(target)` + `copyRecursive(source, target)` —
cleared target before copy. Deleted files present in `templates/` but absent
in source. This **silently deleted all v1.4.0 pre-shipped commands** during
`npm publish --dry-run`.

**Post-v1.4.1 (FIX):** `ensureDir(target)` + `copyRecursive(source, target)` —
copies/overwrites source files but does NOT delete target-only ones.
Pre-shipped files survive; source files overwrite with correct content.

**Idempotent:** running twice consecutively → identical result.

---

## Settings.json merge (v1.4.2)

`init --force` and `update` use `mergeSettingsJson(existing, template)` to
preserve user customizations.

### Algorithm

```
mergeSettingsJson(existing, template):
  if !existing: return template (fresh install)
  if !template: return existing (defensive)

  merged = {...existing}

  # Top level: template only fills what user lacks
  for each (key, value) in template:
    if key not in merged: merged[key] = value

  # Hooks: deep merge per event type
  if template.hooks:
    merged.hooks = mergeHookEvents(existing.hooks, template.hooks)

  return merged

mergeHookEvents(existing, template):
  for each eventType in template:
    if !existing[eventType]: existing[eventType] = template[eventType]
    else: mergeHookMatchers(existing[eventType], template[eventType])

mergeHookMatchers(existing[], template[]):
  for each tplEntry in template:
    target = existing.find(e => e.matcher === tplEntry.matcher)
    if !target: existing.push(tplEntry)
    else:
      existingCmds = Set(target.hooks.map(h => h.command))
      for each tplHook in tplEntry.hooks:
        if !existingCmds.has(tplHook.command):
          target.hooks.push(tplHook)   # de-dup by command string
```

### Identity model

Hooks are compared by `command` string. Implications:

- User-added hook (absent from template): **preserved**
- User-modified default (changed command): treated as user-added → **preserved**
  (old default removed via orphan detection if it was in shippedDefaults)
- Identical command in template and user: **de-duped** (single copy)
- New hook in template: **added** to user's settings

### Override

`--reset-settings` flag disables merge — full overwrite. For when user wants
clean slate.

---

## Orphan detection (v1.4.3)

**Problem with merge-only logic:** if a new package version removes a hook,
the old hook lingers forever in user's settings (looks user-added from
merge perspective).

**Solution:** `manifest.shippedDefaults` baseline.

### Algorithm

```
init/update upgrade flow:
  1. previousManifest = read .p-replicator.json BEFORE overwrite
  2. oldTpl = previousManifest.shippedDefaults['settings.json']
  3. newTpl = read templates/.claude/settings.json (current)
  4. existing = read user's .claude/settings.json
  5. cleaned = removeOrphanHooks(existing, oldTpl, newTpl)
  6. merged = mergeSettingsJson(cleaned, newTpl)
  7. write merged to .claude/settings.json
  8. write new manifest with shippedDefaults = newTpl (for next upgrade)

removeOrphanHooks(existing, oldTpl, newTpl):
  if !oldTpl: return existing (first upgrade, no baseline yet)
  oldCmds = extractCommands(oldTpl)
  newCmds = extractCommands(newTpl)
  orphans = oldCmds.filter(c => !newCmds.has(c))
  return existing with orphan commands filtered out
```

### Properties

- **User-added** (never in `oldTpl`) → preserved
- **Removed default** (was in `oldTpl`, gone from `newTpl`, present in user's) → removed
- **Unchanged default** (in all three) → kept
- **Renamed/modified default** (cmd-string changed) → old orphaned, new added via merge

### Backward compat

If manifest has no `shippedDefaults` (pre-1.4.3 install) — orphan detection
skipped on first upgrade. Manifest gets populated for future upgrades.

---

## Statusline architecture (v1.5.0)

**Goal:** single-script multi-line dashboard.

```
┌─ statusline.cjs (entry, ~330 LOC) ─────────────────────────┐
│                                                             │
│   1. main()                                                 │
│      ├── parseManifest() ───────► .p-replicator.json       │
│      ├── parseState() ──────────► .claude/.p-replicator-state.json (with stale check) │
│      ├── parseRoadmap() ────────► .claude/feature-roadmap.json │
│      ├── parseSparcDocs() ──────► docs/PRD.md, ..., ADR.md  │
│      ├── parseValidationScore() ► docs/validation-report.md (regex) │
│      ├── parseAdrs() ───────────► docs/ADR.md OR docs/adr/ OR docs/ddd/adr/ │
│      ├── parsePlans() ──────────► docs/plans/*.md           │
│      ├── parseInsights() ───────► .claude/insights/index.md │
│      ├── parseToolkit() ────────► filesystem walks          │
│      ├── parseSettingsStatus() ─► deep-equals current vs shippedDefaults │
│      ├── parseMcpServers() ─────► .mcp.json                 │
│      ├── parseKeysarium() ──────► .keysarium.json existence │
│      ├── parseDomain() ─────────► CLAUDE.md keyword grep    │
│      ├── parseLastHarvest() ────► TOOLKIT_HARVEST.md mtime  │
│      └── parseLastTest() ───────► .claude/.last-test.json (optional) │
│                                                             │
│   2. lines = [                                              │
│        buildHeader(manifest),                               │
│        buildPipeline(state),                                │
│        buildRoadmap(roadmap, domain),                       │
│        buildDocs(sparc, validation, plans, adrs, lastHarvest), │
│        buildToolkit(toolkit, expected),                     │
│        buildStatus(insights, lastTest, mcpServers, settingsStatus, keysarium), │
│      ]                                                       │
│                                                             │
│   3. process.stdout.write(lines.join('\n') + '\n')          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Defensive design:** every `parse*` function wrapped in `safeRun()` with
fallback. One parse error → fallback value, other sections work.

**State-file flow:**

```
command (e.g., /run) ──Bash──► node .claude/hooks/state-update.cjs --command /run --phase loop --progress 0.4
                                          │
                                          ▼
                              .claude/.p-replicator-state.json (atomic write)
                                          ▲
                                          │
Claude Code prompt ────────► node .claude/hooks/statusline.cjs
                                          │
                                          ▼
                              reads state, computes heuristics, renders 6 lines
```

**Stale check:** state older than 30 minutes → ignored (Pipeline section
shows `idle`).

---

## Test infrastructure

**Suite:** 105 tests, 36 suites, ~25 sec runtime.

| Layer | File | Coverage |
|---|---|---|
| **Unit** | `tests/unit/utils.test.js` (54 tests) | Pure functions: createManifest, mergeSettingsJson, removeOrphanHooks, getItemRelativePath, parseToolkit logic |
| **E2E** | `tests/e2e/lifecycle.test.js` (48 tests) | Full CLI lifecycle, hooks installation, settings merge edge cases, statusline output, --feature-branches docs |
| **Snapshot** | `tests/snapshot/templates.test.js` (3 tests) | SHA-256 baseline of all 115 files in `templates/` |

**Meta-tests:** verify consistency between documents:
- `replicate-pipeline.md` mentions every pre-shipped command (no orphan in rule)
- `replicate.md` Phase 3 doesn't claim "Generate `<pre-shipped>.md`" (no spec drift)

**Snapshot baseline** regenerated via `npm run snapshot:baseline` after
intentional template changes.

---

## Module composition: `view()` syntax (Claude Code-specific)

Skills use `view()` for cross-skill loading at runtime:

```markdown
view() .claude/skills/explore/SKILL.md
view() .claude/skills/explore/references/questioning-techniques.md
```

Claude Code resolves these references dynamically: when executing a skill,
the LLM reads referenced files at the moment of use. This lets skill A
delegate to skill B without duplicating content.

**Limitation:** only Claude Code supports this runtime mechanism. For
other platforms (Codex, OpenCode), skill content must be **inlined**
(compiled into command markdown) at install time. See
`MULTIPLATFORM_ROADMAP.md`.

---

## Pipeline: `/replicate` phases

```
INPUT (idea or company name)
   │
   ▼
Phase 0: PRODUCT DISCOVERY (optional)
   │   skill: reverse-engineering-unicorn
   │   output: docs/00_product_discovery.md
   ▼
Phase 1: PLANNING
   │   skill: sparc-prd-mini (internally: explore + research + solve + 5 SPARC phases)
   │   output: docs/PRD.md, Architecture.md, Pseudocode.md, ... (11 docs)
   ▼
Phase 2: VALIDATION (5-agent swarm)
   │   skill: requirements-validator
   │   output: docs/validation-report.md, docs/test-scenarios.md (BDD)
   │   verdict: 🟢 READY / 🟡 CAVEATS / 🔴 NEEDS WORK (max 3 retries)
   ▼
Phase 3: TOOLKIT GENERATION (project-specific only)
   │   skill: cc-toolkit-generator-enhanced (9 modules)
   │   output: project agents (planner, code-reviewer, architect),
   │            project rules (security, coding-style, testing),
   │            project skills (project-context, coding-standards),
   │            CLAUDE.md, feature-roadmap.json, DEVELOPMENT_GUIDE.md
   ▼
Phase 4: FINALIZE
   │   output: docker-compose.yml, Dockerfile, .gitignore
   │   action: git commit
   ▼
DONE — project ready for /start or /run
```

---

## Next

- [06_troubleshooting.md](./06_troubleshooting.md) — common issues
- [07_changelog.md](./07_changelog.md) — version history
