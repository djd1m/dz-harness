# 04. API Reference

Формальная справка: CLI-команды, флаги, схемы JSON-файлов.

## CLI: `npx @dzhechkov/p-replicator`

### Subcommands

| Subcommand | Назначение | Exit code |
|---|---|---|
| `init` (default) | Установка пакета в проект | `0` ok, `1` если уже установлен без `--force` |
| `update` | Обновление файлов до новой версии | `0` ok, `1` если не установлен |
| `remove` | Удаление package-tracked файлов | `0` ok, `1` если не установлен |
| `list` | Список установленных components | `0` |
| `doctor` | Health check pre-shipped contract | `0` ok, `1` если что-то не так |
| `verify` | Pre-shipped + post-/replicate проверка | `0` ok, `1` если pre-shipped contract нарушен |

### Глобальные флаги

| Флаг | Где работает | Описание |
|---|---|---|
| `--force` | `init` | Перезаписать существующие файлы (с merge-логикой для settings.json) |
| `--dry-run` | `init`, `update`, `remove` | Preview без записи на диск |
| `--reset-settings` | `init --force`, `update` | Полный overwrite settings.json (отключает merge) |
| `--help`, `-h` | любой | Показать help |
| `--version`, `-v` | любой | Показать версию пакета |

### Slash command флаги (внутри Claude Code)

| Флаг | Где работает | Описание |
|---|---|---|
| `--feature-branches` | `/run`, `/go` | Каждая фича в отдельной ветке `feature/{NNN}-{id}` |
| `--auto-merge` | `/run`, `/go` (с `--feature-branches`) | Автомердж feature-ветки в main после успеха |
| `--skip-tests` | `/start` | Пропустить генерацию тестов |
| `--skip-seed` | `/start` | Пропустить DB seeding |
| `--dry-run` | `/start`, `/replicate` | Preview без записи |

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

**Поля:**

| Поле | Тип | Назначение |
|---|---|---|
| `version` | semver | Версия pre-replicator при последнем install/update |
| `installedAt` | ISO-8601 | Timestamp последней установки |
| `components` | array of group keys | Pre-shipped группы (skills/commands/agents/rules/settings/hooks) |
| `files` | sorted array | Все package-tracked файлы (для `remove`) |
| `shippedDefaults` | optional map | Snapshot template'ов для orphan detection при upgrade |

**Backward compat:** manifest без `shippedDefaults` (pre-1.4.3) загружается
без ошибок — orphan detection skipped на первый upgrade.

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

| Field | Required | Тип | Заполняется кем | Назначение |
|-------|----------|-----|-----------------|-----------|
| `id` | yes | kebab-case slug | initial generation | Стабильный идентификатор |
| `number` | optional | int | `--feature-branches` flag | Sequential 1..N для branch naming |
| `branch` | optional | string | `--feature-branches` после успеха | `feature/{NNN}-{id}` actual ref |
| `name` | recommended | string | initial generation | Human-readable title |
| `priority` | yes | enum | initial generation | `mvp` \| `high` \| `medium` \| `low` |
| `status` | yes | enum | lifecycle | `planned` \| `next` \| `in_progress` \| `done` \| `blocked` |
| `complexity` | optional | enum | initial generation | `simple` \| `medium` \| `complex` |
| `estimated_hours` | optional | string | initial generation | Time hint |
| `blockers` | optional | string[] | manual | Issue IDs или free-form |
| `expected_files` | optional | string[] | initial generation | Используется `/next update` для detection |
| `depends_on` | optional | string[] | initial generation | Feature IDs которые должны завершиться первыми |

---

## State-file schema (`.claude/.p-replicator-state.json`)

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

**Поля:**

| Field | Тип | Назначение |
|---|---|---|
| `currentCommand` | `/<name>` | Активная команда сейчас (`null` если idle) |
| `currentPhase` | object | Live progress в текущей команде |
| `currentPhase.name` | string | Имя фазы (e.g., `VALIDATE`, `IMPLEMENT`) |
| `currentPhase.index` | int | Текущая фаза 1..total |
| `currentPhase.total` | int | Сколько всего фаз |
| `currentPhase.progress` | float 0..1 | Прогресс в текущей фазе |
| `lastCommand` | `/<name>` | Предыдущая команда (для статусной строки) |
| `lastFeature` | string | ID последней реализованной фичи |
| `updatedAt` | ISO-8601 | Time-stamp |

**Stale check:** statusline игнорирует state старше 30 минут.

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

## settings.json — структура

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "_comment": "Описание установки",
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
    "type": "command",       // только "command" поддерживается
    "command": "node .claude/hooks/statusline.cjs"
  }
}
```

Скрипт пишет в stdout multi-line ANSI-output. Удалите поле — statusline
выключится (merge сохранит удаление при upgrade).

### `hooks.<EventType>` array

Каждый element:

```json
{
  "matcher": "*",                    // или regex для tool-name
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/X.cjs",
      "timeout": 10                  // в секундах
    }
  ]
}
```

**Event types в Claude Code:**
- `SessionStart` — при начале сессии (stdout инжектится в context)
- `Stop` — при завершении turn'а (side-effects: commit, log)
- `PreToolUse`, `PostToolUse` — вокруг tool-вызовов

---

## COMPONENTS schema (внутри `src/utils.js`)

Контракт того что shipped и что generated:

```javascript
const COMPONENTS = {
  skills: {
    src: '.claude/skills',
    kind: 'pre-shipped',
    label: 'Skills (10 skill packs)',
    group: 'core',
    items: { 'explore': '...', /* ... 10 entries */ },
  },
  commands: {
    src: '.claude/commands',
    kind: 'pre-shipped',
    label: 'Commands (orchestration + workflow)',
    group: 'core',
    items: { 'replicate': '...', /* ... 11 entries */ },
  },
  agents: { kind: 'pre-shipped', items: { /* 4 entries */ } },
  rules:  { kind: 'pre-shipped', items: { /* 5 entries */ } },
  settings: { isFile: true, kind: 'pre-shipped', items: { 'settings.json': '...' } },
  hooks: { kind: 'pre-shipped', items: { /* 6 entries */ } },

  // Project-generated (created by /replicate Phase 3)
  projectAgents: {
    kind: 'project-generated',
    items: {
      '.claude/agents/planner.md': '...',
      '.claude/agents/code-reviewer.md': '...',
      '.claude/agents/architect.md': '...',
    },
  },
  projectRules: {
    kind: 'project-generated',
    items: {
      '.claude/rules/security.md': '...',
      '.claude/rules/coding-style.md': '...',
      '.claude/rules/testing.md': '...',
    },
  },
  projectFiles: {
    kind: 'project-generated',
    items: {
      'CLAUDE.md': '...',
      '.claude/feature-roadmap.json': '...',
      'DEVELOPMENT_GUIDE.md': '...',
      'docker-compose.yml': '...',
    },
  },
};
```

**Identity:**
- `kind: 'pre-shipped'` — installed by `init`, file paths derived from `src` + item key
- `kind: 'project-generated'` — created by `/replicate` Phase 3, item keys ARE full paths
- `isFile: true` — single-file component (settings.json), not a directory

**Helper:** `utils.getItemRelativePath(comp, itemKey)` — централизованная derivation:
- pre-shipped skills: `<src>/<itemKey>/SKILL.md`
- pre-shipped hooks: `<src>/<itemKey>.cjs`
- pre-shipped commands/rules/agents: `<src>/<itemKey>.md`
- pre-shipped settings.json: `comp.src` (full path)
- project-generated: `itemKey` (already full path)

Используется `verify`, `doctor`, `list` для единообразного path-resolution.

---

## Hook scripts API

### `session-insights.cjs`

**Trigger:** `SessionStart` hook.
**Reads:** `.claude/insights/index.md` (`## YYYY-MM-DD` headings)
**Writes:** stdout (Claude Code инжектит в session context)
**Output:** до 3 свежих insights в `## Recent project insights\n\n## ... ## ... ## ...` format

### `autocommit-roadmap.cjs` / `autocommit-insights.cjs` / `autocommit-plans.cjs`

**Trigger:** `Stop` hook.
**Reads:** target paths (roadmap json / insights/ dir / plans/ dir)
**Side-effect:** `git add` + `git diff --cached --quiet` check + `git commit --only` if changed
**stdout/stderr:** suppressed (`stdio: 'ignore'`)
**Always exits 0** (best-effort, не блокирует сессию)

### `statusline.cjs`

**Trigger:** Claude Code `statusLine` config (every prompt render).
**Reads:** filesystem heuristics + state-file
**Writes:** stdout 6-line ANSI-output (header + 5 content)
**Defensive:** every section wrapped в `safeRun()` with fallback

### `state-update.cjs`

**Invoked:** by pipeline commands via Bash tool
**Args:** `--command`, `--phase`, `--index`, `--total`, `--progress`, `--last-command`, `--last-feature`, `--json`
**Writes:** `.claude/.p-replicator-state.json`
**Always exits 0** (best-effort)

---

## Дальше

- [05_architecture.md](./05_architecture.md) — как всё это устроено внутри
