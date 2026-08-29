# Руководство по развёртыванию @dzhechkov/skills-feature-adr

Пакет `@dzhechkov/skills-feature-adr` устанавливает 9-шаговый пайплайн адаптивной разработки фич с Complexity Router (S/M/L/XL), ADR-driven архитектурой и мульти-агентным QE.

---

## 1. Предварительные требования

| Компонент | Версия | Обязательность |
|-----------|--------|----------------|
| Node.js | >= 16.0.0 | Обязательно |
| npm или yarn | Любая актуальная | Обязательно |
| Claude Code CLI | Последняя версия | Рекомендуется |
| @dzhechkov/keysarium-core | ^1.0.0 | Опционально |

**Node.js** — необходим для работы CLI-утилиты установки, обновления и диагностики.

**Claude Code CLI** — рекомендуемая платформа для запуска `/feature-adr`. Пакет также совместим с Cursor, OpenCode и GitHub Copilot (см. раздел 10).

**@dzhechkov/keysarium-core** — опциональная peer-зависимость. Без неё пакет работает полностью автономно. С ней активируется расширенный governance: constitution, checkpoint promises, witness chain.

Проверка окружения:

```bash
node --version    # Должно быть >= 16.0.0
npm --version     # Любая актуальная версия
```

---

## 2. Способы установки

### Способ A — Одной командой (npx)

Самый быстрый способ. Не требует глобальной установки:

```bash
npx @dzhechkov/skills-feature-adr
```

По умолчанию выполняется команда `init` — все компоненты устанавливаются в текущую директорию проекта.

### Способ B — Глобальная установка

Удобно, если вы используете пакет в нескольких проектах:

```bash
npm install -g @dzhechkov/skills-feature-adr
```

После глобальной установки CLI доступен напрямую:

```bash
cd /path/to/your/project
skills-feature-adr init
```

### Способ C — В существующий проект Keysarium

Если в директории уже есть `.keysarium.json`, установщик автоматически определит интеграцию:

```bash
cd /path/to/keysarium-project
npx @dzhechkov/skills-feature-adr init
```

Вывод покажет баннер интеграции:

```
  @dzhechkov/keysarium detected!
  Version: 1.0.0
  Feature ADR integrates with existing Keysarium.
  Shared: .claude/commands, rules, skills
```

Компоненты Feature ADR устанавливаются рядом с существующими файлами Keysarium. Общие директории (`.claude/commands/`, `.claude/rules/`, `.claude/shards/`) используются совместно — конфликтов не возникает благодаря префиксной фильтрации `feature-adr*`.

### Способ D — Из git-репозитория

Для разработки и модификации:

```bash
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub/packages/@dzhechkov/skills-feature-adr
npm link
```

После этого команда `skills-feature-adr` доступна глобально и указывает на локальную копию.

---

## 3. Что устанавливается

Команда `init` копирует следующие компоненты из шаблонов в ваш проект:

### Skill Pack (основа)

| Файл | Назначение |
|------|-----------|
| `.claude/skills/feature-adr/SKILL.md` | Оркестратор — главный файл скилла |
| `.claude/skills/feature-adr/modules/00-complexity-router.md` | Step 0: Классификация сложности |
| `.claude/skills/feature-adr/modules/01-requirements.md` | Step 1: Требования |
| `.claude/skills/feature-adr/modules/02-research.md` | Step 2: Исследование |
| `.claude/skills/feature-adr/modules/03-adr.md` | Step 3: Architecture Decision Record |
| `.claude/skills/feature-adr/modules/04-ddd.md` | Step 4: Domain-Driven Design |
| `.claude/skills/feature-adr/modules/05-architecture.md` | Step 5: Архитектура (C4) |
| `.claude/skills/feature-adr/modules/06-implementation-plan.md` | Step 6: План реализации |
| `.claude/skills/feature-adr/modules/07-code.md` | Step 7: Генерация кода |
| `.claude/skills/feature-adr/modules/08-qe.md` | Step 8: Quality Engineering |

### Справочные материалы

| Файл | Назначение |
|------|-----------|
| `.claude/skills/feature-adr/references/adr-template.md` | Шаблон ADR |
| `.claude/skills/feature-adr/references/c4-template.md` | Шаблон C4-диаграмм |
| `.claude/skills/feature-adr/references/complexity-matrix.md` | Матрица сложности S/M/L/XL |
| `.claude/skills/feature-adr/references/qe-checklist.md` | Чек-лист Quality Engineering |

### Примеры

| Файл | Назначение |
|------|-----------|
| `.claude/skills/feature-adr/examples/sample-feature-output.md` | Пример выходных артефактов |

### Интеграционные файлы

| Файл | Назначение |
|------|-----------|
| `.claude/commands/feature-adr.md` | Slash-команда `/feature-adr` |
| `.claude/shards/feature-adr.shard.md` | Governance shard (правила для фазы) |
| `.claude/rules/feature-adr-conventions.md` | Конвенции именования и структуры |

### Манифест

| Файл | Назначение |
|------|-----------|
| `.skills-feature-adr.json` | Манифест установки (версия, список файлов, дата) |

---

## 4. Конфигурация

### Обязательная конфигурация

Отсутствует. Пакет работает сразу после установки без дополнительных настроек.

### Опциональная конфигурация

**Интеграция с keysarium-core.** Если установлен `@dzhechkov/keysarium-core`, автоматически активируются:
- Расширенный governance (constitution + shards + checkpoint protocol)
- Memory protocol (reward-calibrated learning)
- Witness chain (SHA-256 аудит)
- Trust tiers (классификация скиллов)

**Выходная директория.** Артефакты всегда создаются в `features/<feature-slug>/`. Директория создаётся автоматически при запуске пайплайна. Slug генерируется в kebab-case (латиница, максимум 40 символов).

**Пример структуры артефактов:**

```
features/add-user-auth/
  00_complexity_assessment.md
  01_requirements.md
  03_adr/001-auth-strategy.md
  06_implementation_plan.md
  07_code_changes/change_manifest.md
  08_qe_report.md
```

Набор файлов зависит от tier сложности (S/M/L/XL). Для tier S создаётся минимальный набор, для XL — полный.

---

## 5. Первый запуск

### Пошаговая инструкция

**Шаг 1.** Установите пакет (если ещё не установлен):

```bash
npx @dzhechkov/skills-feature-adr init
```

**Шаг 2.** Откройте Claude Code в директории вашего проекта:

```bash
claude
```

**Шаг 3.** Запустите пайплайн, описав фичу:

```
/feature-adr Добавить авторизацию через OAuth2 с поддержкой Google и GitHub
```

**Шаг 4.** Step 0 (Complexity Router) автоматически классифицирует сложность фичи:

```
CHECKPOINT 0: Complexity Assessment
Tier: M (4-10 файлов, 1-2 домена)
Active steps: 0 -> 1 -> 3 -> 5 -> 6 -> 7 -> 8

* "ок" — подтвердить tier и продолжить
* "L" — повысить до Large
* "S" — понизить до Small
```

**Шаг 5.** Подтвердите tier или скорректируйте. Далее выполняются шаги согласно tier:

| Tier | Активные шаги | Время |
|------|--------------|-------|
| **S** | 0, 1, 6, 7, 8 | ~15 мин |
| **M** | 0, 1, 3, 5, 6, 7, 8 | ~45 мин |
| **L** | 0, 1, 2, 3, 4, 5, 6, 7, 8 (полный) | ~2 часа |
| **XL** | 0-8 (полный DAG + мульти-агентный swarm) | ~4+ часа |

**Шаг 6.** После каждого шага отображается checkpoint. Отвечайте:
- `ок` — перейти к следующему шагу
- `углуби [секция]` — доработать конкретную часть
- Конкретная правка — внести изменения

**Шаг 7.** По завершении проверьте артефакты в `features/<slug>/` и изменения кода в репозитории.

---

## 6. CLI-команды

### init — Установка компонентов

```bash
npx @dzhechkov/skills-feature-adr init
npx @dzhechkov/skills-feature-adr init --force
npx @dzhechkov/skills-feature-adr init --dry-run
```

| Флаг | Описание |
|------|----------|
| (без флагов) | Стандартная установка. Прерывается, если уже установлено. |
| `--force` | Перезаписать существующие файлы без подтверждения. |
| `--dry-run` | Показать план установки без записи файлов. |

### update — Обновление до новой версии

```bash
npx @dzhechkov/skills-feature-adr update
npx @dzhechkov/skills-feature-adr update --dry-run
```

Сравнивает установленные файлы с шаблонами новой версии. Выводит:
- Количество новых файлов для добавления
- Количество изменённых файлов для обновления
- Количество файлов без изменений

Пользовательские модификации отображаются как `modified`. Манифест обновляется автоматически.

### remove — Удаление

```bash
npx @dzhechkov/skills-feature-adr remove
npx @dzhechkov/skills-feature-adr remove --force
npx @dzhechkov/skills-feature-adr remove --dry-run
```

| Флаг | Описание |
|------|----------|
| (без флагов) | Запрашивает подтверждение перед удалением. |
| `--force` | Удалить без подтверждения. |
| `--dry-run` | Показать, что будет удалено, без фактического удаления. |

Директория `features/` сохраняется — ваши артефакты не удаляются. Пустые директории удаляются автоматически.

### list — Список установленных компонентов

```bash
npx @dzhechkov/skills-feature-adr list
```

Показывает все установленные компоненты и файлы из манифеста `.skills-feature-adr.json`.

### doctor — Проверка здоровья

```bash
npx @dzhechkov/skills-feature-adr doctor
```

Подробности о `doctor` см. в разделе 7.

### Дополнительные опции

```bash
npx @dzhechkov/skills-feature-adr --version    # Версия пакета
npx @dzhechkov/skills-feature-adr --help        # Справка по командам
```

---

## 7. Doctor — проверка здоровья

Команда `doctor` выполняет комплексную диагностику установки.

### Запуск

```bash
npx @dzhechkov/skills-feature-adr doctor
```

### Категории проверок

**1. Files exist** — проверяет наличие всех файлов из манифеста:
- Читает `.skills-feature-adr.json`
- Сверяет каждый файл из списка `files` с файловой системой
- Сообщает количество недостающих файлов (до 5 имён)

**2. Feature ADR skill pack** — проверяет целостность скилла:
- Наличие директории `.claude/skills/feature-adr/`
- Наличие `SKILL.md` (оркестратор)
- Подсчёт модулей в `modules/`
- Подсчёт справочных файлов в `references/`

**3. Pipeline modules (9 steps)** — проверяет все 9 модулей пайплайна:
- `00-complexity-router.md`
- `01-requirements.md`
- `02-research.md`
- `03-adr.md`
- `04-ddd.md`
- `05-architecture.md`
- `06-implementation-plan.md`
- `07-code.md`
- `08-qe.md`

**4. Feature ADR command** — проверяет slash-команду:
- Наличие `.claude/commands/` директории
- Наличие файлов `feature-adr*.md` в ней

**5. Feature ADR rules** — проверяет конвенции:
- Наличие `.claude/rules/` директории
- Наличие файлов `feature-adr*.md` в ней

**6. Keysarium integration** — определяет интеграцию:
- Ищет `.keysarium.json` в корне проекта
- Если найден — показывает версию Keysarium
- Если не найден — сообщает: standalone-режим (это нормально)

### Пример вывода

```
Running health checks for @dzhechkov/skills-feature-adr v1.0.0...

  [OK] Files exist — All 18 manifest files present
  [OK] Feature ADR skill pack — SKILL.md present, 9 modules, 4 references
  [OK] Pipeline modules (9 steps) — All 9 pipeline modules present
  [OK] Feature ADR command — 1 command(s): feature-adr.md
  [OK] Feature ADR rules — 1 rule(s): feature-adr-conventions.md
  [OK] Keysarium integration — Not installed (standalone Feature ADR mode)

6/6 checks passed — Feature ADR installation is healthy!
```

### При обнаружении проблем

Doctor выводит конкретные рекомендации по исправлению:

```
  [FAIL] Pipeline modules (9 steps) — 2 module(s) missing: 03-adr.md, 04-ddd.md
    Fix: Run @dzhechkov/skills-feature-adr update to restore modules.
```

---

## 8. Обновление

### Стандартное обновление

```bash
npx @dzhechkov/skills-feature-adr update
```

Процесс обновления:
1. Считывает текущую версию из `.skills-feature-adr.json`
2. Сравнивает с версией в пакете
3. Для каждого компонента побайтово сравнивает файлы
4. Копирует только новые и изменённые файлы
5. Обновляет манифест (версия, дата, список файлов)

### Предварительный просмотр

```bash
npx @dzhechkov/skills-feature-adr update --dry-run
```

Пример вывода:

```
Current version: 1.0.0
Available version: 1.1.0

Update summary:
  + 1 file(s) to add
  ~ 3 file(s) to update
  = 14 file(s) unchanged

Files to be changed:
  + ADD  .claude/skills/feature-adr/modules/09-monitoring.md
  ~ MOD  .claude/skills/feature-adr/SKILL.md
  ~ MOD  .claude/skills/feature-adr/modules/07-code.md
  ~ MOD  .claude/commands/feature-adr.md

Dry run — no files were written.
```

### Сохранение пользовательских изменений

Если вы модифицировали файлы скилла, `update` перезапишет их шаблонными версиями. Рекомендации:
- Перед обновлением выполните `update --dry-run`, чтобы увидеть, какие файлы затронуты
- Если вы кастомизировали модули, сохраните копию изменённых файлов
- После обновления перенесите свои правки обратно

---

## 9. Удаление

### Стандартное удаление

```bash
npx @dzhechkov/skills-feature-adr remove
```

CLI запросит подтверждение:

```
The following Feature ADR components will be removed:

  - skill
  - commands
  - rules
  - shards

  18 file(s) total
  + .skills-feature-adr.json manifest

This will remove all Feature ADR skill pack files. Continue? (y/N)
```

### Удаление без подтверждения

```bash
npx @dzhechkov/skills-feature-adr remove --force
```

### Что удаляется, а что сохраняется

**Удаляется:**
- Все файлы из манифеста `.skills-feature-adr.json`
- Сам манифест `.skills-feature-adr.json`
- Пустые директории после удаления файлов

**Сохраняется:**
- `features/` — все ваши артефакты фич
- Файлы других пакетов в `.claude/` (Keysarium, BTO)
- Любые файлы, не входящие в манифест

### Переустановка после удаления

```bash
npx @dzhechkov/skills-feature-adr init
```

---

## 10. Интеграция с другими платформами

Feature ADR разработан для Claude Code, но может быть адаптирован для других AI-платформ с помощью команды `/init-platform`.

### Cursor

```bash
npx @dzhechkov/skills-feature-adr init
```

Затем в Claude Code:

```
/init-platform --platform cursor
```

Генерирует файл `.cursorrules` с инструкциями Feature ADR, адаптированными для формата Cursor.

### OpenCode

```
/init-platform --platform opencode
```

Генерирует директорию `.opencode/` с конфигурацией для OpenCode.

### GitHub Copilot

```
/init-platform --platform copilot
```

Генерирует файл `.github/copilot-instructions.md` с инструкциями для Copilot.

### Совместная работа с другими пакетами

Feature ADR работает рядом с другими skill pack:

```bash
npx @dzhechkov/keysarium init           # Исследовательский пайплайн
npx @dzhechkov/skills-bto init          # Build-Test-Optimize
npx @dzhechkov/skills-feature-adr init  # Adaptive Feature Development
```

Все три пакета используют общие директории `.claude/commands/`, `.claude/rules/`, `.claude/shards/` без конфликтов благодаря префиксной фильтрации.

---

## 11. Устранение проблем

### "Command not found" при запуске /feature-adr

**Причина:** Файл `.claude/commands/feature-adr.md` отсутствует или повреждён.

**Решение:**

```bash
npx @dzhechkov/skills-feature-adr doctor
```

Если doctor подтвердит проблему:

```bash
npx @dzhechkov/skills-feature-adr update
```

### "SKILL.md missing" или "modules/ not found"

**Причина:** Неполная установка или случайное удаление файлов.

**Решение:**

```bash
npx @dzhechkov/skills-feature-adr init --force
```

Флаг `--force` перезапишет все файлы, восстановив целостность установки.

### "Keysarium not detected"

**Не является ошибкой.** Feature ADR работает полностью автономно. Сообщение `Not installed (standalone Feature ADR mode)` в выводе `doctor` означает, что @dzhechkov/keysarium не установлен в проекте. Это нормальный режим работы.

Если интеграция с Keysarium нужна:

```bash
npx @dzhechkov/keysarium init
npx @dzhechkov/skills-feature-adr init
```

### "Permission denied" при установке

**Причина:** Недостаточные права на запись в директорию проекта.

**Решение:**

```bash
# Проверить права на директорию
ls -la .claude/

# Если директория принадлежит другому пользователю
sudo chown -R $(whoami) .claude/

# Повторить установку
npx @dzhechkov/skills-feature-adr init
```

### Манифест .skills-feature-adr.json повреждён

**Симптомы:** `doctor` или `update` выдают ошибку `Failed to read .skills-feature-adr.json`.

**Решение:**

```bash
# Удалить повреждённый манифест
rm .skills-feature-adr.json

# Переустановить
npx @dzhechkov/skills-feature-adr init
```

### Конфликт версий Node.js

**Симптомы:** Ошибки синтаксиса или `SyntaxError: Unexpected token`.

**Решение:**

```bash
node --version
```

Если версия ниже 16.0.0, обновите Node.js:

```bash
# Через nvm
nvm install 18
nvm use 18

# Или через системный пакетный менеджер
```

### Файлы features/ не создаются

**Причина:** Пайплайн создаёт директорию `features/<slug>/` автоматически при запуске `/feature-adr`. Если директория не появилась, пайплайн не был запущен или прерван до создания артефактов.

**Решение:** Убедитесь, что вы прошли хотя бы Step 0 (Complexity Router) и подтвердили checkpoint.
