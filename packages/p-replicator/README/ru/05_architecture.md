# 05. Архитектура

Внутреннее устройство `p-replicator` — как ставится, как обновляется,
как сосуществует с user customizations.

## Двухуровневая модель: Pre-shipped vs Project-generated

Главное архитектурное разделение:

| Уровень | Кто создаёт | Где живёт | Изменяется |
|---|---|---|---|
| **Pre-shipped** | `npx p-replicator init` | `.claude/{skills,commands,agents,rules,hooks}/` + `settings.json` | На каждом upgrade пакета |
| **Project-generated** | `/replicate` Phase 3 (LLM execution) | Различные места: `CLAUDE.md`, `.claude/agents/planner.md`, `docs/`, и т.д. | Только при пересоздании |

Это **главный фикс** v1.4.0 — раньше `/replicate` Phase 3 пыталась генерировать
ВСЕ артефакты (включая generic команды как `/run`, `/feature`), что приводило
к flaky outputs (LLM compression, missed templates). После v1.4.0
generic-команды pre-shipped, Phase 3 генерирует ТОЛЬКО project-specific.

---

## SSOT: `utils.COMPONENTS`

Единый источник правды о том что shipped и что generated. Структура:

```javascript
const COMPONENTS = {
  // Pre-shipped (6 групп, install via npx init):
  skills: { kind: 'pre-shipped', src: '.claude/skills', items: { /* 10 */ } },
  commands: { kind: 'pre-shipped', src: '.claude/commands', items: { /* 11 */ } },
  agents: { kind: 'pre-shipped', src: '.claude/agents', items: { /* 4 */ } },
  rules: { kind: 'pre-shipped', src: '.claude/rules', items: { /* 5 */ } },
  settings: { kind: 'pre-shipped', isFile: true, src: '.claude/settings.json' },
  hooks: { kind: 'pre-shipped', src: '.claude/hooks', items: { /* 6 */ } },

  // Project-generated (3 группы, created by /replicate Phase 3):
  projectAgents: { kind: 'project-generated', items: { /* full paths */ } },
  projectRules: { kind: 'project-generated', items: { /* full paths */ } },
  projectFiles: { kind: 'project-generated', items: { /* full paths */ } },
};
```

**Consumers:**
- `init.js` / `update.js` — итерируют только `kind === 'pre-shipped'` для install
- `doctor.js` — проверяет существование pre-shipped artifacts
- `list.js` — выводит metadata
- `verify.js` — проверяет ОБЕ группы (pre-shipped strict, project-generated
  hints)
- `cli.js` showHelp — динамически считает items для отображения

**Любая будущая правка items автоматически обновляет все 5 поверхностей** —
устранены drift-проблемы которые были до v1.3.1.

---

## Path derivation: `getItemRelativePath()`

Один helper централизует derivation для всех групп:

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

**Дизайн-принцип:** zero shell dependency.

Все 15 hook-скриптов написаны на pure Node, используют `execFileSync('git', [...])`
вместо shell-pipes. Это эквивалентно работает на:
- Windows cmd.exe (нет `2>/dev/null`, есть `2>nul` — не нужен ни тот ни другой)
- Bash / zsh / Git Bash на Windows
- PowerShell

**Pattern для autocommit-скрипта:**

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
- `if (!fs.existsSync) exit 0` — нет файла, нечего коммитить
- `try { rev-parse } catch { exit 0 }` — нет git репозитория, skip
- `try { diff } catch { hasDiff = true }` — `git diff --quiet` exits 1 if diff
- Outer `try/catch` гарантирует exit 0 при любых ошибках (best-effort)

---

## Sync-templates: MERGE mode (v1.4.1)

**Файл:** `scripts/sync-templates.js` — runs as `prepublishOnly` hook.

**Цель:** скопировать `.claude/` из source-repo в `templates/.claude/`
(который попадает в npm tarball).

**До v1.4.1 (BUG):** `cleanDir(target)` + `copyRecursive(source, target)` —
очищал target перед copy. Удалял файлы которые есть в `templates/` но нет в
source. Это **silently удалило все v1.4.0 pre-shipped команды** во время
`npm publish --dry-run`.

**После v1.4.1 (FIX):** `ensureDir(target)` + `copyRecursive(source, target)` —
копирует/перезаписывает source-файлы, но НЕ удаляет target-only. Pre-shipped
файлы выживают, source файлы overwrite'ят с правильным содержимым.

**Идемпотентность:** прогон 2 раза подряд → одинаковый result.

---

## Settings.json merge (v1.4.2)

`init --force` и `update` используют `mergeSettingsJson(existing, template)`
для preserve user customizations:

### Алгоритм

```
mergeSettingsJson(existing, template):
  if !existing: return template (fresh install)
  if !template: return existing (defensive)

  merged = {...existing}

  # Top-level: template добавляет только то чего нет у user
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

Hooks сравниваются по `command` string. Implications:

- User-added hook (отсутствует в template): **preserved**
- User-modified default (изменил command): treated как user-added → **preserved**
  (старый default удаляется через orphan detection если был в shippedDefaults)
- Identical command в template и user: **de-duped** (только одна копия)
- New hook in template: **added** к user's settings

### Override

`--reset-settings` flag отключает merge — full overwrite. Для случаев когда
user хочет clean-slate.

---

## Orphan detection (v1.4.3)

**Проблема merge-only логики:** если в новой версии package удаляет hook,
старый hook остаётся у user'а forever (user-added perspective).

**Решение:** `manifest.shippedDefaults` baseline.

### Алгоритм

```
init/update upgrade flow:
  1. previousManifest = read .p-replicator.json BEFORE overwrite
  2. oldTpl = previousManifest.shippedDefaults['settings.json']
  3. newTpl = read templates/.claude/settings.json (current)
  4. existing = read user's .claude/settings.json
  5. cleaned = removeOrphanHooks(existing, oldTpl, newTpl)
  6. merged = mergeSettingsJson(cleaned, newTpl)
  7. write merged to .claude/settings.json
  8. write new manifest with shippedDefaults = newTpl (для следующего upgrade)

removeOrphanHooks(existing, oldTpl, newTpl):
  if !oldTpl: return existing (first upgrade, no baseline yet)
  oldCmds = extractCommands(oldTpl)
  newCmds = extractCommands(newTpl)
  orphans = oldCmds.filter(c => !newCmds.has(c))
  return existing with orphan commands filtered out
```

### Свойства

- **User-added** (никогда не было в `oldTpl`) → preserved
- **Removed default** (было в `oldTpl`, нет в `newTpl`, есть у user) → удалён
- **Unchanged default** (есть везде) → kept
- **Renamed/modified default** (cmd-string changed) → старый orphaned, новый
  added через merge

### Backward compat

Если manifest без `shippedDefaults` (pre-1.4.3 install) — orphan detection
skipped на первый upgrade. Manifest заполняется на текущем install для
будущих upgrade'ов.

---

## Statusline architecture (v1.5.0)

**Цель:** single-script multi-line dashboard.

```
┌─ statusline.cjs (entry, ~330 LOC) ─────────────────────────┐
│                                                             │
│   1. main()                                                 │
│      ├── parseManifest() ───────► .p-replicator.json       │
│      ├── parseState() ──────────► .claude/.p-replicator-state.json (with stale-check) │
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

**Defensive design:** каждая `parse*` функция wrapped в `safeRun()` с
fallback. Один parse error → fallback value, остальные секции работают.

**State-file flow:**

```
команда (e.g., /run) ──Bash──► node .claude/hooks/state-update.cjs --command /run --phase loop --progress 0.4
                                          │
                                          ▼
                              .claude/.p-replicator-state.json (atomic write)
                                          ▲
                                          │
Claude Code prompt ────────► node .claude/hooks/statusline.cjs
                                          │
                                          ▼
                              читает state, считает heuristics, рендерит 6 строк
```

**Stale check:** state старше 30 минут → ignore (показывается `idle` в Pipeline
секции).

---

## Test infrastructure

**Suite:** 105 tests, 36 suites, ~25 sec runtime.

| Layer | File | Coverage |
|---|---|---|
| **Unit** | `tests/unit/utils.test.js` (54 tests) | Pure functions: createManifest, mergeSettingsJson, removeOrphanHooks, getItemRelativePath, parseToolkit logic |
| **E2E** | `tests/e2e/lifecycle.test.js` (48 tests) | Full CLI lifecycle, hooks installation, settings merge edge cases, statusline output, --feature-branches docs |
| **Snapshot** | `tests/snapshot/templates.test.js` (3 tests) | SHA-256 baseline для всех 115 файлов в `templates/` |

**Меta-тесты:** проверяют consistency между документами. Например:
- `replicate-pipeline.md` упоминает все pre-shipped commands (no orphan in rule)
- `replicate.md` Phase 3 не утверждает «Generate `<pre-shipped>.md`» (no
  drift в spec)

**Snapshot baseline** регенерируется через `npm run snapshot:baseline` после
intentional template changes.

---

## Module composition: `view()` syntax (Claude Code-specific)

Skills используют `view()` для cross-skill loading в runtime:

```markdown
view() .claude/skills/explore/SKILL.md
view() .claude/skills/explore/references/questioning-techniques.md
```

Claude Code разрешает эти ссылки динамически: при выполнении skill,
LLM читает referenced files в момент использования. Это позволяет skill A
делегировать в skill B без duplicate-копий контента.

**Ограничение:** только Claude Code поддерживает этот runtime-механизм. Для
других платформ (Codex, OpenCode) skill content должен быть **inlined**
(скомпилирован в command markdown) на install-time. См.
`MULTIPLATFORM_ROADMAP.md`.

---

## Pipeline: `/replicate` фазы

```
INPUT (idea or company name)
   │
   ▼
Phase 0: PRODUCT DISCOVERY (опц.)
   │   skill: reverse-engineering-unicorn
   │   output: docs/00_product_discovery.md
   ▼
Phase 1: PLANNING
   │   skill: sparc-prd-mini (внутри: explore + research + solve + 5 SPARC phases)
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
DONE — project готов к /start или /run
```

---

## Дальше

- [06_troubleshooting.md](./06_troubleshooting.md) — типичные проблемы
- [07_changelog.md](./07_changelog.md) — история эволюции
