# `hooks/` — Pre-Commit Triple-Check

Cross-platform git hooks, реализующие governance из `shards/triple-pillar.shard.md`.

## pre-commit-triple-check

Pre-commit hook, который запускается при `git commit` и сканирует staged `.md` файлы на наличие factual claims без inline-источников.

| File | Platform |
|------|----------|
| `pre-commit-triple-check.sh` | bash (Linux / macOS / Git Bash on Windows) |
| `pre-commit-triple-check.ps1` | PowerShell (Windows native) |

> ⚠️ **Кодировка `pre-commit-triple-check.ps1`:** файл сохранён в **UTF-8 с BOM**. Windows PowerShell 5.1 читает UTF-8 без BOM как ANSI, что ломает кириллицу в regex и парсер. При редактировании сохраняйте BOM (`Out-File -Encoding utf8` в PS 5.1 добавляет BOM; в редакторе — "UTF-8 with BOM"). Bash-версия — обычный UTF-8 без BOM.

> Оба хука принимают `--advisory-single <file>` — проверка одного файла в advisory-режиме (используется Claude Code PostToolUse hook из `hooks.json`).

### Что проверяет

Для каждого staged `.md` файла:
1. Игнорирует YAML frontmatter, code blocks, `<!-- wiki:see-also-* -->` блоки, headings
2. Находит строки с числами / процентами / денежными суммами / x-ratios → это **claim'ы**
3. Для каждого claim проверяет наличие inline-ссылки на `adrs/`, `methodologies/`, `researches/`, или внешнего `http(s)://` URL
4. Считает MISSING (claim без источника) → выдаёт предупреждение

### Игнорируется

- `*/wiki-backlinks.md` (auto-generated)
- `wiki/concepts/*.md` (auto-generated)
- `.claude/**` (внутренний harness целевого проекта)
- YAML frontmatter, code blocks, wiki:see-also marker-блоки

### Режимы

| Env | Значение | Поведение |
|-----|----------|-----------|
| `TRIPLE_CHECK_MODE` | `advisory` (default) | Печатает warning, не блокирует commit |
| `TRIPLE_CHECK_MODE` | `strict` | Блокирует commit при MISSING > threshold |
| `TRIPLE_CHECK_MISSING_THRESHOLD` | `3` (default) | Порог для strict mode |

### Установка в целевой проект

Hook ставится в `.git/hooks/pre-commit` целевого проекта. Канонические команды — в секции `git_hooks` файла `hooks.json`. Кратко (`<plugin>` = корень установленного плагина, напр. `~/.claude/plugins/evidence-wiki` или `${CLAUDE_PLUGIN_ROOT}`):

**Linux / macOS / Git Bash** — симлинк:

```bash
ln -s "<plugin>/hooks/pre-commit-triple-check.sh" .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Windows PowerShell** — копия:

```powershell
Copy-Item "<plugin>\hooks\pre-commit-triple-check.ps1" .git\hooks\pre-commit
```

> `core.hooksPath` напрямую на `hooks/` не работает: git ищет файл с именем `pre-commit`, а в каталоге — `pre-commit-triple-check.*`. Поэтому ставим симлинк/копию под именем `pre-commit`.

### Одноразовый запуск (без установки)

```bash
bash <plugin>/hooks/pre-commit-triple-check.sh
```

```powershell
pwsh <plugin>\hooks\pre-commit-triple-check.ps1
```

### Pre-commit поведение

Если в commit'е содержательно НЕТ числовых claims без источника (всё подкреплено) — hook молчит и пропускает commit.

Если есть MISSING:
- **advisory mode**: печатает список проблемных мест, commit проходит
- **strict mode** + MISSING > threshold: commit блокируется

### Bypass (только для emergency!)

```bash
# Pre-commit hook можно обойти --no-verify, но это нарушает governance.
# Используй ТОЛЬКО когда понимаешь причину пропуска.
git commit --no-verify -m "..."
```

### Связано

- `commands/triple-check.md` — полная спецификация валидатора
- `shards/triple-pillar.shard.md` — governance shard, описывающий 3-pillar discipline
- `governance/triple-pillar.governance.md` — домен-агностичная спецификация протокола + правила inline-ссылок
- `hooks.json` — Claude Code PostToolUse hook + install-команды git-хука
