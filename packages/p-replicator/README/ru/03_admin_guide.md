# 03. Admin Guide — конфигурация и тонкая настройка

Для тех, кто хочет понять и кастомизировать инфраструктуру `p-replicator`:
hooks, statusline, settings.json, insights, roadmap.

## settings.json — главный конфиг

**Расположение:** `.claude/settings.json` в корне проекта.

**Структура (defaults после init):**

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

**Кастомизация:** добавляйте новые hooks или event types — они будут СОХРАНЕНЫ
при `init --force` или `update` благодаря merge-логике (`mergeSettingsJson` +
`removeOrphanHooks`).

**Полный сброс к defaults:**

```bash
npx @dzhechkov/p-replicator init --force --reset-settings
```

---

## Hooks — жизненный цикл

`p-replicator` shipped с **6 cross-platform Node-скриптами** в `.claude/hooks/`:

| Hook | Event | Что делает |
|---|---|---|
| `session-insights.cjs` | SessionStart | Инжектит 3 свежих insights из `.claude/insights/index.md` в stdout (Claude Code захватывает) |
| `autocommit-roadmap.cjs` | Stop | Auto-commit `.claude/feature-roadmap.json` если изменён |
| `autocommit-insights.cjs` | Stop | Auto-commit `.claude/insights/` если изменены |
| `autocommit-plans.cjs` | Stop | Auto-commit `docs/plans/` если изменены |
| `statusline.cjs` | (statusLine) | Multi-line dashboard над промптом |
| `state-update.cjs` | (utility) | Argv-driven helper для записи `.claude/.p-replicator-state.json` |

**Cross-platform discipline:** все 4 autocommit-скрипта используют
`execFileSync('git', [...])` (без shell-pipes, без `2>/dev/null`/`|| true` —
работает на Windows-cmd, bash, PowerShell идентично).

**Каждый скрипт defensive:** wrapped в try/catch, exit 0 always (best-effort,
не блокирует сессию).

---

## Statusline — приборная панель

**Что показывает (6 строк):**

```
P-Replicator V1.5.0 ● user │ Sonnet 4.7
🚀 Pipeline   /<cmd> ▓▓▓░░░░ 50%  │ Phase: VALIDATE (2/4)  │ Last: /replicate
🎯 Roadmap    [●●●○○○○○] mvp 3/8   │ Done 5/12  │ ▶ auth-jwt  │ Domain: banking
📊 SPARC      ●11/11  │ 🟢 78/100  │ Plans ●3  │ ADRs ●2  │ Harvest 2026-05-05
🛠️ Toolkit   Skills ●10/10 │ Cmds ●11/11 │ Agents ●4+3 │ Rules ●13+2 │ Hooks ●17/17
💡 Insights   ●12 (2026-05-06) │ Tests 85/85 ✓ │ MCP ●1/1 │ Settings ✓ │ 🧬 Keysarium ✓
```

**Источники (heuristic + state-file):**

| Метрика | Откуда |
|---|---|
| Pipeline command + phase + progress | `.claude/.p-replicator-state.json` (state-file) |
| Roadmap progress | `.claude/feature-roadmap.json` |
| SPARC count | `docs/{PRD,Architecture,...}.md` files |
| Validation score | regex extract from `docs/validation-report.md` |
| Plans count | `docs/plans/*.md` |
| ADRs count | `docs/ADR.md` `## ADR-...` headings, или `docs/adr/*.md`, или `docs/ddd/adr/*.md` |
| Insights count + last date | `## YYYY-MM-DD` headings в `.claude/insights/index.md` |
| Toolkit counts | filesystem walk `.claude/{skills,commands,agents,rules,hooks}/` |
| Settings status | deep-equals current vs `manifest.shippedDefaults` → `defaults`/`merged` |
| MCP servers | `.mcp.json` |
| Domain | keyword grep `CLAUDE.md` (banking/retail/enterprise/healthcare) |
| Last harvest | `TOOLKIT_HARVEST.md` mtime |
| Last test | optional `.claude/.last-test.json` cache |

**Stale state file:** если `.p-replicator-state.json` старше 30 минут —
игнорируется (показывается `idle`).

**Защита от поломки:** каждая секция wrapped в `safeRun()` — error в одной
не убивает весь statusline.

**Отключить statusline:**

Удалите поле `statusLine` из `.claude/settings.json`. На следующем `update`
с merge-логикой удаление будет сохранено.

---

## State-file для live progress

`.claude/.p-replicator-state.json` — ephemeral state, обновляется командами
во время выполнения pipeline:

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

**Обновляется через `state-update.cjs`:**

```bash
node .claude/hooks/state-update.cjs \
  --command /feature \
  --phase VALIDATE \
  --index 2 \
  --total 4 \
  --progress 0.5
```

Команды pipeline'а опционально вызывают этот скрипт через Bash tool, чтобы
statusline показывал реальный прогресс.

**⚠️ Известное ограничение:** этот файл не auto-gitignored. Рекомендуется
добавить вручную:

```
echo ".claude/.p-replicator-state.json" >> .gitignore
echo ".claude/.last-test.json" >> .gitignore
```

См. `KNOWN_LIMITATIONS.md` пункт L5.

---

## Insights system

**Storage:** `.claude/insights/index.md` (markdown лог).

**Формат entry:**

```markdown
## YYYY-MM-DD — короткий title

**Tags:** tag1, tag2, tag3

**Problem:**
Что произошло (1-3 предложения).

**Solution:**
Что починило (1-5 предложений с кодом если уместно).

**References:** file:line или commit hash или external link

---
```

**Жизненный цикл:**

- ≤ 50 entries → один `index.md`
- > 50 → split на archive `<YYYY-MM>.md` с `index.md` как TOC
- Никогда не удалять — only supersede через `**Status:** superseded by <link>`

**Tag-конвенции:**
- ✅ `prisma-migration`, `postgres-timezone`, `docker-compose-network`
- ❌ `bug`, `fix`, `important` (слишком generic — recall fail'ит)

**Auto-injection через SessionStart hook** — описано выше.

---

## Roadmap management

**Файл:** `.claude/feature-roadmap.json` (генерируется в `/replicate` Phase 3
из PRD MVP scope, или вручную).

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
      "expected_files": [
        "packages/backend/src/auth/jwt.ts"
      ],
      "depends_on": []
    }
  ]
}
```

**Lifecycle states:**
- `planned` → ещё не приоритетная
- `next` → следующая в очереди (берётся `/next`)
- `in_progress` → активно работают
- `done` → реализована
- `blocked` → ждёт `depends_on` или manual fix

**Поля `number` и `branch`** заполняются `--feature-branches` flag'ом в `/run`
или `/go`.

**Auto-commit** через `autocommit-roadmap.cjs` (Stop hook) при изменениях.

---

## Doctor + Verify — два разных инструмента

| Инструмент | Что проверяет | Когда |
|---|---|---|
| `npx @dzhechkov/p-replicator doctor` | Pre-shipped contract: 10 skills + 11 commands + 4 agents + 13 rules + settings.json + 17 hooks + git on PATH | После init / при подозрении что что-то сломалось |
| `npx @dzhechkov/p-replicator verify` | Pre-shipped + post-/replicate hints (CLAUDE.md, planner.md, security.md, feature-roadmap.json, и т.д.) | После каждого `/replicate` для уверенности |

**`doctor` exit codes:**
- `0` — всё в порядке
- `1` — что-то отсутствует из must-have (используйте `init --force` для repair)

**`verify` exit codes:**
- `0` — pre-shipped contract в порядке (могут быть warnings про project-specific)
- `1` — pre-shipped contract нарушен

---

## Update workflow

```bash
# Безопасный upgrade с preserve user customizations:
npx @dzhechkov/p-replicator@latest update

# Или через init --force (тоже preserves customizations):
npx @dzhechkov/p-replicator@latest init --force

# Полный сброс settings.json к defaults:
npx @dzhechkov/p-replicator@latest init --force --reset-settings
```

**Что делает merge-логика:**
1. Читает `manifest.shippedDefaults['settings.json']` (что мы shipped в прошлый раз)
2. Читает текущий `templates/.claude/settings.json` (новый template)
3. Читает `.claude/settings.json` (user's current)
4. **Orphan detection:** удаляет hooks, которые были в old template но НЕТ в new
5. **Merge:** добавляет hooks из new template которых ЕЩЁ НЕТ в user's current
6. User-added hooks (никогда не были в old template) — **СОХРАНЯЮТСЯ**

**Identity model:** hooks сравниваются по `command` string. User-modified
default (изменил command) → treated как user-added, preserved.

См. подробности алгоритма в [05_architecture.md](./05_architecture.md).

---

## MCP servers

**Файл:** `.mcp.json` (project-local).

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

Statusline показывает количество MCP серверов в строке Status.

`/replicate` Phase 3 автоматически генерирует `.mcp.json` при detected
external integrations.

---

## Связь с Keysarium

Если в проекте обнаружен `.keysarium.json` (от соседнего пакета
`@dzhechkov/keysarium`):

- `init` показывает интеграционный banner
- Statusline показывает `🧬 Keysarium ✓`
- `/replicate` Phase 3 НЕ дублирует skills, которые уже предоставлены
  Keysarium'ом

Документация Keysarium — в собственном пакете.

---

## Дальше

- [04_api_reference.md](./04_api_reference.md) — формальные схемы
- [05_architecture.md](./05_architecture.md) — внутреннее устройство
- [06_troubleshooting.md](./06_troubleshooting.md) — типичные проблемы
