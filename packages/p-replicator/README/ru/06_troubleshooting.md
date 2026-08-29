# 06. Troubleshooting

Типичные проблемы и пути их решения.

## Установка / `init`

### `init` отказывается работать: «P-Replicator is already installed»

```bash
# Если хотите upgrade с preserve customizations:
npx @dzhechkov/p-replicator update

# Или через init --force (тоже preserves customizations):
npx @dzhechkov/p-replicator init --force

# Полный сброс к defaults (потеряете user hooks):
npx @dzhechkov/p-replicator init --force --reset-settings
```

### После `init` отсутствуют какие-то файлы

```bash
npx @dzhechkov/p-replicator doctor
```

Если что-то fail'ит (e.g., «security.md missing»):

```bash
npx @dzhechkov/p-replicator init --force      # полная переустановка pre-shipped
```

### Установка пошла в `~/node_modules`, а не в проект

Cause: в проекте нет `package.json`, npm walk'ает вверх и находит `package.json`
в home-директории.

Fix: создайте `package.json` в корне проекта:

```bash
npm init -y
npx @dzhechkov/p-replicator init
```

---

## После `/replicate`

### `/replicate` не сгенерировала ожидаемые команды (`/run`, `/feature`, `/myinsights`, ...)

**Это решено в v1.4.0+.** Теперь все 11 generic команд **pre-shipped** через
`init` — `/replicate` Phase 3 их не генерирует, только enhance'ит project-specific
артефакты.

Если у вас старая версия (≤1.3.x):

```bash
npx @dzhechkov/p-replicator@latest init --force
```

После обновления `verify` покажет полный набор:

```bash
npx @dzhechkov/p-replicator verify
```

### `/replicate` Phase 3 пишет «Generate /commands/start.md»

Это устаревшая formulation в `replicate.md`. Должна быть `Pre-shipped... do
NOT overwrite`. Если видите эту фразу:

```bash
npx @dzhechkov/p-replicator@latest update    # обновит replicate.md
```

В v1.4.0+ есть meta-test который ловит эту регрессию. См.
`tests/e2e/lifecycle.test.js` describe `meta: doc-consistency`.

### Project-specific агенты (planner.md, architect.md) не созданы

Это нормально если `/replicate` Phase 3 ещё не запускалась. Запустите
`/replicate "описание"` в Claude Code.

`verify` показывает их как **hints** (warning, не error) если `CLAUDE.md` или
`feature-roadmap.json` есть, но agents отсутствуют.

---

## Hooks / Statusline

### Statusline не отображается

**Проверки:**

1. Версия Claude Code поддерживает `statusLine` config? Обновите Claude Code до
   последней.
2. Поле `statusLine` присутствует в `.claude/settings.json`?
   ```bash
   cat .claude/settings.json | grep -A 3 statusLine
   ```
3. Скрипт работает напрямую?
   ```bash
   node .claude/hooks/statusline.cjs
   ```
   Должен вывести 6 строк ANSI-output.

Если 3-й пункт fail'ит:

```bash
node .claude/hooks/statusline.cjs 2>&1
```

Покажет stack trace. Скорее всего corrupt JSON или отсутствует `.p-replicator.json`.

### Hooks не auto-commit'ят

```bash
npx @dzhechkov/p-replicator doctor
```

В секции `Prerequisites:` должно быть:

```
✓ git on PATH
```

Если `✗ git NOT on PATH` — установите git, добавьте в PATH.

Также проверьте что `.git` директория существует (вы в репозитории):

```bash
git rev-parse --git-dir
```

### Хуки запускаются но ничего не коммитят

**Cause:** `.git` есть, но нет changes для коммита (что нормально).

**Debug:** напрямую:

```bash
node .claude/hooks/autocommit-roadmap.cjs
echo "Exit: $?"
git log -1 --format="%s"
```

Если файл не в манифесте git, сделайте `git add .claude/feature-roadmap.json`
вручную один раз.

### Statusline показывает «Settings ⚠️ merged» хотя я ничего не менял

Cause: какой-то процесс модифицировал `settings.json` (формат, whitespace,
ordering). Statusline сравнивает через deep-equals по sorted keys.

Fix:

```bash
npx @dzhechkov/p-replicator init --force --reset-settings
```

### Settings.json потерял мои custom hooks после update

**Это БЫЛ bug до v1.4.2.** В v1.4.2+ `update` и `init --force` используют
`mergeSettingsJson` который preserves user customizations.

Если вы на v1.4.1 или раньше:

```bash
npx @dzhechkov/p-replicator@latest update
```

Если потеряли hooks безвозвратно — восстановите вручную из git history:

```bash
git log -p --follow -- .claude/settings.json
```

---

## Roadmap / `--feature-branches`

### `/run --feature-branches` сразу fail'ит «not on main»

Cause: вы на feature-branch'е (не на main).

```bash
git status
git checkout main           # переключиться
/run mvp --feature-branches
```

### `--feature-branches` потерял мои несохранённые changes

Они в stash:

```bash
git stash list                              # список stash'ей
git stash show stash@{0}                    # preview
git stash pop                               # восстановить (или git stash drop для удаления)
```

`p-replicator` auto-stash'ит с message «auto-stash before /run feature-branches».

### Feature branch без `number` в roadmap

Cause: roadmap создан до v1.5.0 (нет `number` field).

`--feature-branches` flag auto-assign'ит `number = max(numbers) + 1` при
первом encounter, persists обратно. Просто прогоните `/run mvp --feature-branches`
ещё раз — numbers заполнятся.

---

## Tests / Snapshot

### `npm test` fail'ит после моих изменений в template

```bash
npm test 2>&1 | head -30                    # увидеть какие тесты упали
```

Типичные причины:

1. **Snapshot test fail** — изменились templates, baseline устарел.
   ```bash
   npm run snapshot:baseline                # перегенерировать
   npm test                                 # должно стать зелёным
   ```

2. **Meta-test fail** — `replicate-pipeline.md` или `replicate.md` упоминают
   pre-shipped command в неправильной секции. Проверьте сами edits.

3. **Unit test fail на COMPONENTS** — нарушили SSOT. Проверьте что добавили
   `kind`, `items`, `label` в новый component group.

### `verify` показывает orphan'ы post-init

Cause: вы upgrade'нулись с старой версии (≤1.4.2) которая не tracked
`shippedDefaults`. Orphan detection skipped на первый upgrade.

Fix:

```bash
npx @dzhechkov/p-replicator init --force    # populate shippedDefaults в manifest
npx @dzhechkov/p-replicator init --force    # второй прогон удалит реальные orphan'ы (если они есть)
```

После этого orphan detection будет работать на каждом subsequent upgrade.

---

## Insights

### Insights не auto-injected в новую сессию

**Проверки:**

1. `.claude/insights/index.md` существует и содержит entries?
   ```bash
   wc -l .claude/insights/index.md
   grep -c "^## " .claude/insights/index.md      # количество entries
   ```
2. Hook `session-insights.cjs` работает?
   ```bash
   node .claude/hooks/session-insights.cjs
   ```
   Должен вывести `## Recent project insights\n\n## ... ## ... ## ...`.
3. SessionStart hook configured?
   ```bash
   cat .claude/settings.json | grep -A 5 SessionStart
   ```

Если все 3 OK, но всё равно не работает — Claude Code может cache'ировать
session context. Перезапустите `claude`.

### `/myinsights recall <query>` ничего не находит

Cause: query не матчит tags. Recall — case-insensitive substring search по
tags + body.

Tip: проверьте tags entries:

```bash
grep "^\*\*Tags:" .claude/insights/index.md | head -10
```

Подберите более специфичный query (e.g., `prisma` вместо `bug`).

---

## MCP servers

### MCP servers не connect'ятся

Это вне scope `p-replicator` — это Claude Code config. Проверьте:

```bash
cat .mcp.json                           # формат правильный?
claude --debug                          # MCP errors в logs?
```

Statusline показывает количество server'ов из `.mcp.json` независимо от их
working state.

---

## Performance

### Statusline тормозит при каждой команде

**Cause:** очень большие docs/ или filesystem-trees.

**Diagnose:**

```bash
time node .claude/hooks/statusline.cjs    # сколько секунд?
```

Должно быть < 100ms. Если > 1s — проверьте размер `docs/`:

```bash
du -sh docs/
find docs/ -type f -name "*.md" | wc -l
```

**Workaround:** временно отключить statusline через удаление `statusLine`
поля в `.claude/settings.json`.

См. `KNOWN_LIMITATIONS.md` пункт L6 — будущий enhancement: env-var
`STATUSLINE_PROFILE=1` для измерения каждой секции.

---

## Версионные несовместимости

### Я на старой версии. Стоит ли upgrading?

| Текущая → Целевая | Что получите | Migration cost |
|---|---|---|
| 1.3.x → 1.5.0 | Все pre-shipped команды + statusline + feature-branches + merge-логика | Запустите `init --force` (preserves customizations) |
| 1.4.0 → 1.4.1 | Cross-platform hooks + sync merge mode | `init --force` |
| 1.4.1 → 1.4.2 | Settings merge (preserve customizations) | `init --force` сразу безопасен (preserves) |
| 1.4.2 → 1.4.3 | Orphan detection | Первый upgrade без baseline — re-run `init --force` для populate |
| 1.4.3 → 1.5.0 | Statusline + --feature-branches | `update` или `init --force` |

Полная история — в [07_changelog.md](./07_changelog.md) или
`CHANGELOG.md` (авторитетный).

---

## Если ничего не помогает

1. Прочитайте `KNOWN_LIMITATIONS.md` — может это известное ограничение
2. Запустите `verify` + `doctor` — соберите exact output
3. Issue: https://github.com/djd1m/dz-harness-hub/issues
   приложите версию, output `verify`, шаги воспроизведения
