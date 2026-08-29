# Руководство администратора Product Keysarium 2026

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


Это руководство описывает настройку, кастомизацию и обслуживание системы Product Keysarium 2026. Предназначено для администраторов, которые управляют скиллами, командами, правилами, хуками и пайплайном исследований.

---

## Содержание

1. [Управление скиллами](#1-управление-скиллами)
2. [Управление командами (slash commands)](#2-управление-командами-slash-commands)
3. [Управление правилами](#3-управление-правилами)
4. [Управление хуками](#4-управление-хуками)
5. [Управление шаблонами агентов](#5-управление-шаблонами-агентов)
6. [Мониторинг](#6-мониторинг)
7. [Кастомизация пайплайна](#7-кастомизация-пайплайна)
8. [Бэкап и восстановление](#8-бэкап-и-восстановление)
9. [Governance Shards](#9-governance-shards)
10. [Trust Tiers](#10-trust-tiers)

---

## 1. Управление скиллами

Скиллы -- это самодостаточные наборы инструкций, которые загружаются фазами пайплайна. Каждый скилл располагается в отдельной директории внутри `.claude/skills/`.

### 1.1. Текущие скиллы

| Скилл | Директория | Назначение | Используется в фазах |
|-------|-----------|------------|---------------------|
| explore | `.claude/skills/explore/` | Адаптивная кларификация задач | Phase 1 |
| frontend-design | `.claude/skills/frontend-design/` | Дизайн фронтенда для прототипов | Phase 2.5 |
| goap-research-ed25519 | `.claude/skills/goap-research-ed25519/` | GOAP research + crypto verification | Phase 2, Phase 2.5 |
| presentation-storyteller | `.claude/skills/presentation-storyteller/` | Презентации со storytelling | Phase 5 |
| problem-solver-enhanced | `.claude/skills/problem-solver-enhanced/` | Решение проблем (TRIZ + Game Theory) | Phase 3 |
| reverse-engineering-unicorn | `.claude/skills/reverse-engineering-unicorn/` | Reverse engineering компаний | Phase 0, Phase 2.5 |
| bto | `.claude/skills/bto/` | Build-Test-Optimize: мульти-агентная оценка | BTO pipeline |
| feature-adr | `.claude/skills/feature-adr/` | Adaptive Feature Development (9 шагов) | /feature-adr |

### 1.2. Структура директории скилла

Минимальная структура:

```
.claude/skills/<skill-name>/
└── SKILL.md              ← Обязательный файл с инструкциями
```

Расширенная структура (рекомендуется для сложных скиллов):

```
.claude/skills/<skill-name>/
├── SKILL.md              ← Главный файл инструкций (обязательный)
├── references/           ← Справочные материалы, шаблоны, примеры
│   ├── template-a.md
│   └── benchmarks.md
├── modules/              ← Модульные инструкции (для крупных скиллов)
│   ├── 01-module-a.md
│   └── 02-module-b.md
├── examples/             ← Few-shot примеры для качества
│   └── example-output.md
├── scripts/              ← Вспомогательные скрипты
│   └── verify.sh
└── LICENSE.txt           ← Лицензия (если применимо)
```

### 1.3. Добавление нового скилла

**Шаг 1.** Создайте директорию:

```bash
mkdir -p .claude/skills/my-new-skill/
```

**Шаг 2.** Создайте файл `SKILL.md` с обязательной структурой:

```markdown
---
name: my-new-skill
description: >
  Краткое описание скилла: когда активируется, что делает,
  на какие триггеры реагирует.
---

# My New Skill

Подробное описание назначения скилла.

## When To Activate

Trigger on:
- "ключевая фраза 1"
- "ключевая фраза 2"

## Architecture

Описание файловой структуры скилла (если есть модули/references).

## Core Logic

Основные инструкции, алгоритмы, шаблоны.

## Output Format

Описание ожидаемого формата вывода.
```

**Шаг 3.** Добавьте справочные материалы (опционально):

```bash
mkdir -p .claude/skills/my-new-skill/references/
# Добавьте файлы-шаблоны, примеры, бенчмарки
```

**Шаг 4.** Зарегистрируйте скилл в команде, которая его использует (см. раздел [Управление командами](#2-управление-командами-slash-commands)):

```markdown
# В файле .claude/commands/my-phase.md
1. **Загрузи скилл:** Прочитай `.claude/skills/my-new-skill/SKILL.md`
```

**Шаг 5.** Обновите `CLAUDE.md`:
- Добавьте скилл в таблицу фаз
- Обновите граф зависимостей скиллов

### 1.4. Обновление существующего скилла

**Безопасное обновление:**

1. Создайте ветку для изменений:
   ```bash
   git checkout -b update-skill/explore-v2
   ```

2. Отредактируйте `SKILL.md` скилла:
   ```bash
   # Редактируйте .claude/skills/explore/SKILL.md
   ```

3. Если добавляете новые модули, создайте файлы в `modules/`:
   ```bash
   touch .claude/skills/explore/modules/new-module.md
   ```

4. Протестируйте изолированно (см. раздел 1.6).

5. Закоммитьте и смёрджите после тестирования.

**Версионирование скиллов:**

Рекомендуется добавлять версию в заголовок SKILL.md:

```markdown
# Explore v2.1

## Changelog
- v2.1: Добавлен модуль Deep Clarification
- v2.0: Переработана система классификации задач
- v1.0: Начальная версия
```

### 1.5. Удаление скилла

1. Убедитесь, что скилл не используется ни одной командой:
   ```bash
   # Поиск упоминаний скилла во всех командах
   grep -r "my-skill" .claude/commands/
   grep -r "my-skill" CLAUDE.md
   ```

2. Удалите директорию:
   ```bash
   rm -rf .claude/skills/my-skill/
   ```

3. Обновите `CLAUDE.md`:
   - Удалите из таблицы скиллов
   - Обновите граф зависимостей

4. Обновите все команды, которые ссылались на скилл.

### 1.6. Тестирование скилла изолированно

**Способ 1: Прямой вызов через Claude Code.**

Попросите Claude Code загрузить и выполнить скилл напрямую:

```
Прочитай .claude/skills/my-new-skill/SKILL.md и выполни его
для следующего тестового input: [тестовый кейс]
```

**Способ 2: Минимальный тестовый кейс.**

Создайте временную директорию для тестирования:

```bash
mkdir -p researches/_test_skill/
```

Запустите фазу, которая использует скилл:

```
/discovery researches/_test_skill/
```

Проверьте артефакты:

```bash
ls researches/_test_skill/
cat researches/_test_skill/00_product_discovery.md
```

Удалите тестовую директорию:

```bash
rm -rf researches/_test_skill/
```

**Способ 3: Dry Run с валидацией.**

Попросите Claude Code выполнить скилл, но вместо записи файлов -- вывести результат в чат:

```
Загрузи .claude/skills/my-new-skill/SKILL.md и покажи, что получится
для тестового кейса "Автоматизация КЦ банка". НЕ создавай файлы, только покажи.
```

---

## 2. Управление командами (slash commands)

Команды -- это slash-команды, которые пользователь вызывает в Claude Code. Каждая команда -- это markdown-файл в `.claude/commands/`.

### 2.1. Текущие команды

| Команда | Файл | Назначение |
|---------|------|------------|
| `/casarium` | `casarium.md` | Полный пайплайн (7 фаз) |
| `/new-research` | `new-research.md` | Создать новое исследование |
| `/parallel-research` | `parallel-research.md` | Запустить несколько кейсов параллельно |
| `/discovery` | `discovery.md` | Phase 0: Product Discovery |
| `/explore-case` | `explore-case.md` | Phase 1: Explore |
| `/research` | `research.md` | Phase 2: Research |
| `/cjm-prototype` | `cjm-prototype.md` | Phase 2.5: CJM Prototype |
| `/solve` | `solve.md` | Phase 3: Solve |
| `/architecture-phase` | `architecture-phase.md` | Phase 4: Architecture |
| `/presentation` | `presentation.md` | Phase 5: Presentation |
| `/harvest` | `harvest.md` | Извлечение знаний |
| `/brain-export` | `brain-export.md` | Экспорт портативных знаний |
| `/brain-import` | `brain-import.md` | Импорт знаний из другого проекта |
| `/init-platform` | `init-platform.md` | Генерация конфигов для Cursor/OpenCode/Copilot |
| `/workers` | `workers.md` | Управление фоновыми воркерами |
| `/dream` | `dream.md` | Dream Cycles (анализ паттернов) |
| `/learning-stats` | `learning-stats.md` | Reward learning аналитика |
| `/verify-chain` | `verify-chain.md` | Верификация witness chain |
| `/feature-adr` | `feature-adr.md` | Adaptive Feature Development pipeline |
| `/bto` | `bto.md` | Полный BTO цикл (Build-Test-Optimize) |
| `/bto-build` | `bto-build.md` | Генерация скиллов/команд |
| `/bto-test` | `bto-test.md` | Мульти-агентная оценка |
| `/bto-optimize` | `bto-optimize.md` | Эволюционная оптимизация |

### 2.2. Формат файла команды

Каждый файл команды в `.claude/commands/` -- это markdown-документ, который Claude Code интерпретирует как инструкцию. Формат:

```markdown
# Название команды — краткое описание

## Использование
​```
/command-name [аргументы]
​```

## Аргумент
$ARGUMENTS

## Действия

1. **Шаг 1:** Описание первого действия
2. **Шаг 2:** Описание второго действия
   - Подробности
   - Подробности
3. **Шаг 3:** Описание третьего действия

## Формат вывода

Описание ожидаемого формата, шаблоны.

## Параллелизация (Agent Swarm)
Описание стратегии параллелизации (опционально).
```

**Ключевые элементы:**

| Элемент | Описание |
|---------|----------|
| `$ARGUMENTS` | Специальная переменная -- содержит всё, что пользователь ввёл после `/command-name`. Используйте для получения входных данных. |
| `## Использование` | Показывает формат вызова. Используется для самодокументации. |
| `## Действия` | Пошаговые инструкции, которые Claude Code выполнит. |
| Загрузка скилла | Строка `Прочитай .claude/skills/<name>/SKILL.md` заставляет Claude загрузить и применить скилл. |

### 2.3. Создание новой команды

**Шаг 1.** Создайте файл:

```bash
touch .claude/commands/my-command.md
```

**Шаг 2.** Заполните по шаблону:

```markdown
# My Command — описание назначения

## Использование
​```
/my-command [входные данные]
​```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/relevant-skill/SKILL.md`
2. **Определи рабочую директорию:**
   - Если аргумент содержит путь к `researches/...`, работай там
   - Иначе создай через `/new-research`
3. **Выполни основную логику:**
   - Шаг A
   - Шаг B
   - Шаг C
4. **Создай артефакт:** `XX_artifact_name.md`
5. **Покажи Checkpoint X**

## Checkpoint формат
​```
═══════════════════════════════════════════════════════
CHECKPOINT X: [Phase Name] Complete
[Краткая сводка результатов]
Файл: [filename]
​```
```

**Шаг 3.** Зарегистрируйте в `CLAUDE.md`:
- Добавьте в таблицу фаз (если это фаза пайплайна)
- Обновите структуру проекта

### 2.4. Тестирование команды

Запустите команду с тестовым аргументом:

```
/my-command Тестовый кейс: автоматизация обработки заявок в банке
```

Проверьте:
- Создан ли файл-артефакт в правильной директории
- Соответствует ли формат артефакта ожидаемому
- Отображается ли checkpoint
- Загружается ли нужный скилл
- Корректно ли обрабатывается `$ARGUMENTS`

### 2.5. Переменная $ARGUMENTS: подробности

`$ARGUMENTS` подставляется автоматически. Содержимое -- всё, что пользователь написал после имени команды.

| Вызов пользователя | Значение $ARGUMENTS |
|--------------------|---------------------|
| `/casarium Автоматизация КЦ для Альфа-Банка` | `Автоматизация КЦ для Альфа-Банка` |
| `/discovery researches/bank_kc/` | `researches/bank_kc/` |
| `/parallel-research кейс1: банк \| кейс2: ритейл` | `кейс1: банк \| кейс2: ритейл` |
| `/harvest all` | `all` |
| `/casarium` (без аргументов) | пустая строка |

Обрабатывайте пустой аргумент в команде:

```markdown
Если аргумент пустой — спроси текст кейса у пользователя.
```

---

## 3. Управление правилами

Правила -- это файлы в `.claude/rules/`, содержащие инструкции, которые Claude Code применяет автоматически ко всем запросам в контексте проекта.

### 3.1. Текущие правила

| Файл | Назначение |
|------|------------|
| `agent-swarm.md` | Правила параллелизации: когда и как запускать агентов |
| `anti-patterns.md` | Обнаружение и блокировка антипаттернов |
| `checkpoint-protocol.md` | Протокол checkpoint-ов после каждой фазы |
| `domain-specific.md` | Доменные правила (банк, ритейл, enterprise, healthcare) |
| `file-conventions.md` | Конвенции именования файлов и директорий |
| `modular-reuse.md` | Правила модульного переиспользования скиллов и команд |
| `research-quality.md` | Требования к качеству research (PARANOID mode) |
| `witness-chain.md` | Witness chain integration: SHA-256 хеширование артефактов |
| `reward-learning.md` | Reward-calibrated learning: memory_query/memory_store протокол |
| `background-workers.md` | Background workers: isolation, model routing, concurrency limits |
| `dream-cycles.md` | Dream cycles: auto-triggers, insight application, retention |
| `model-routing.md` | 3-tier model routing enforcement (haiku/sonnet/opus) |
| `trust-tiers.md` | Trust tier system для скиллов (Tier 0-3) |
| `bto-quality-gates.md` | BTO quality gates: layer architecture, judge panel, optimization delta |
| `feedback-loops.md` | Cross-phase feedback loops and variable registry |
| `feature-adr-conventions.md` | Feature ADR conventions: output directory, slugs, tiers |

### 3.2. Добавление нового правила

**Шаг 1.** Создайте файл в `.claude/rules/`:

```bash
touch .claude/rules/my-rule.md
```

**Шаг 2.** Заполните правило. Формат:

```markdown
# Название правила

## Когда применять
Описание условий применения.

## Правила
- Правило 1
- Правило 2
- Правило 3

## Примеры
| Ситуация | Правильно | Неправильно |
|----------|-----------|-------------|
| ... | ... | ... |
```

**Пример: добавление доменного правила для телекоммуникаций:**

```markdown
# Telecom Domain Rules

## Когда применять
Если кейс связан с телекоммуникациями, мобильными операторами,
сетевой инфраструктурой.

## Детектирование домена
Ключевые слова: телеком, оператор, абонент, SIM, тарифный план,
роуминг, базовая станция, OSS/BSS, CDR.

## Правила
- Latency budget для real-time систем: < 50ms
- Обязательно учитывать ФЗ-126 (О связи) и требования Роскомнадзора
- Данные CDR (Call Detail Records) -- персональные данные (ФЗ-152)
- Модели оттока: использовать survival analysis + feature engineering на CDR
- Palette: Deep Purple / Electric Blue
```

### 3.3. Приоритет правил

Правила применяются в следующем порядке приоритета (от высшего к низшему):

| Приоритет | Источник | Описание |
|-----------|----------|----------|
| 1 (высший) | `CLAUDE.md` | Мастер-инструкции проекта |
| 2 | `.claude/rules/*.md` | Правила из директории rules |
| 3 | `SKILL.md` конкретного скилла | Инструкции скилла, загруженного в рамках фазы |
| 4 | Команда `.claude/commands/*.md` | Инструкции конкретной команды |

**Разрешение конфликтов:**

- Если правило из `CLAUDE.md` противоречит правилу из `rules/`, приоритет у `CLAUDE.md`.
- Если доменное правило из `domain-specific.md` уточняет общее правило -- применяется доменное.
- Скилл не может отменить checkpoint protocol или anti-pattern rules.

### 3.4. Доменные правила: подробности

Файл `domain-specific.md` содержит правила для конкретных доменов. Домен определяется автоматически по ключевым словам в тексте кейса.

Для добавления нового домена дополните файл `.claude/rules/domain-specific.md`:

```markdown
## Новый домен
- Правило 1
- Правило 2
- Palette: [цвета]
- Tone: [тон]
```

---

## 4. Управление хуками

Хуки позволяют выполнять дополнительные действия до или после определённых событий в Claude Code.

### 4.1. Настройка hooks в .claude/settings.json

Файл `.claude/settings.json` (если отсутствует -- создайте) поддерживает настройку хуков:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Bash tool invoked' >> /tmp/keysarium-audit.log"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"File written: $(date)\" >> /tmp/keysarium-audit.log"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Keysarium' 'Task notification received'"
          }
        ]
      }
    ]
  }
}
```

### 4.2. Типы хуков

| Тип хука | Когда срабатывает | Применение |
|----------|-------------------|------------|
| `PreToolUse` | Перед вызовом инструмента | Валидация, логирование, запрет операций |
| `PostToolUse` | После вызова инструмента | Аудит, пост-обработка, уведомления |
| `Notification` | При уведомлениях от Claude Code | Внешние алерты, интеграция со Slack/Telegram |
| `Stop` | При завершении задачи | Финальная валидация, очистка |

### 4.3. Примеры полезных хуков

**Аудит-лог всех файловых операций:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date '+%Y-%m-%d %H:%M:%S')] File operation completed\" >> .claude/audit.log"
          }
        ]
      }
    ]
  }
}
```

**Автоматический git add после создания артефактов:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "cd /home/user/dz-harness-hub && git add researches/"
          }
        ]
      }
    ]
  }
}
```

**Уведомление о завершении фазы (Linux):**

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Keysarium' 'Phase completed - checkpoint ready'"
          }
        ]
      }
    ]
  }
}
```

**Блокировка записи вне researches/ (защита корня):**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo '$TOOL_INPUT' | grep -q 'researches/' || (echo 'BLOCKED: Write outside researches/' && exit 1)"
          }
        ]
      }
    ]
  }
}
```

---

## 5. Управление шаблонами агентов

Шаблоны агентов определяют конфигурации для параллельных задач. Хранятся в `.claude/agents/`.

### 5.1. Создание шаблона агента

Создайте файл в `.claude/agents/`:

```bash
touch .claude/agents/research-agent.md
```

Формат шаблона:

```markdown
# Research Agent Template

## Role
Специализированный агент для выполнения research-задач в рамках
Phase 2 пайплайна.

## Model Recommendation
- haiku: для простых файловых операций и форматирования
- sonnet: для research synthesis и анализа
- opus: для сложной креативной работы (CJM design, storytelling)

## Instructions
1. Получить задачу и scope (директория, тема)
2. Загрузить соответствующий скилл
3. Выполнить research строго в пределах scope
4. Записать результаты в указанный файл
5. НЕ модифицировать файлы за пределами scope

## Isolation Rules
- Работать ТОЛЬКО в назначенной директории
- НЕ читать и НЕ модифицировать файлы других агентов
- Результаты сохранять в промежуточный файл для синтеза

## Output Format
Markdown-документ с чёткой структурой:
- Заголовки по разделам
- Источники для каждого утверждения
- Тег [UNVERIFIED] для непроверенных данных
```

### 5.2. Пример: шаблон для Phase 2.5 (CJM параллелизация)

```markdown
# CJM Variant Agent

## Role
Агент для разработки одного варианта CJM в рамках Phase 2.5.

## Inputs
- variant: A | B | C | D
- research_dir: путь к researches/<slug>/
- context: данные из Phase 0-2

## Instructions (Variant A/B/C)
1. Прочитать Phase 0-2 артефакты
2. Спроектировать CJM variant по шаблону из SKILL.md
3. Определить: entry point, touchpoints, pain points, AI moments
4. Записать в промежуточный файл: _variant_X_draft.md

## Instructions (Variant D — Trend Research)
1. Загрузить goap-research-ed25519 SKILL.md
2. Исследовать 5 категорий трендов (PARANOID mode)
3. Синтезировать Future-Ready CJM
4. Записать в промежуточный файл: _variant_d_draft.md

## Synthesis (Orchestrator)
После завершения всех агентов:
1. Объединить варианты в единый прототип
2. Создать cjm-prototype.jsx с 4 вкладками
3. Создать 02.5_trend_brief.md
```

### 5.3. Настройка параллелизации

Параллелизация определяется в правилах (`agent-swarm.md`) и в командах отдельных фаз.

**Стратегия выбора модели для агентов:**

| Задача | Рекомендуемая модель | Обоснование |
|--------|---------------------|-------------|
| Форматирование, копирование файлов | haiku | Дёшево, быстро, достаточно для простых операций |
| Research synthesis, анализ | sonnet | Хороший баланс цены и качества для аналитики |
| CJM design, storytelling, креатив | opus | Максимальное качество для сложных творческих задач |

**Ограничения параллелизации:**

- Максимум 3-4 параллельных агента одновременно
- Каждый агент строго изолирован в своём scope
- После параллельного этапа обязателен синтез результатов оркестратором
- Результаты агентов не должны конфликтовать (каждый пишет в свой файл)

---

## 6. Мониторинг

### 6.1. Отслеживание прогресса исследований

**Способ 1: README.md исследования.**

Каждое исследование имеет `README.md` с чеклистом артефактов:

```bash
cat researches/<slug>/README.md
```

Пример содержимого:

```markdown
## Артефакты
- [x] Phase 0: Product Discovery
- [x] Phase 1: Case Brief
- [x] Phase 2: Research Findings
- [ ] Phase 2.5: CJM Prototype
- [ ] Phase 3: Solution Strategy
- [ ] Phase 4: Architecture
- [ ] Phase 5: Presentation
- [ ] Phase 6: Packaging
```

**Способ 2: Проверка файловой структуры.**

```bash
# Список всех артефактов исследования
ls -la researches/<slug>/

# Список всех исследований
ls researches/

# Проверка наличия обязательных файлов
for f in 00_product_discovery.md 01_case_brief.md 02_research_findings.md \
         02.5_trend_brief.md 03_solution_strategy.md 04_architecture.md \
         05_presentation_content.md 06_speaker_script.md \
         07_qa_preparation.md 08_executive_summary.md; do
  if [ -f "researches/<slug>/$f" ]; then
    echo "[OK] $f"
  else
    echo "[MISSING] $f"
  fi
done
```

**Способ 3: Запросить у Claude Code.**

```
Покажи статус всех исследований в researches/
```

### 6.2. Проверка качества артефактов

**Чеклист качества по фазам:**

| Фаза | Артефакт | Критерии качества |
|------|----------|-------------------|
| Phase 0 | `00_product_discovery.md` | Есть JTBD, конкуренты, ROI, Adoption Strategy |
| Phase 1 | `01_case_brief.md` | Есть 5 Whys, ограничения, Success Criteria |
| Phase 2 | `02_research_findings.md` | ВСЕ утверждения с источниками, нет [UNVERIFIED] |
| Phase 2.5 | `02.5_trend_brief.md` + `prototype/cjm-prototype.jsx` | 4 варианта CJM, Trend Brief с источниками |
| Phase 3 | `03_solution_strategy.md` + diagrams | SCQA, Process As-Is/To-Be, HITL, метрики |
| Phase 4 | `04_architecture.md` + diagrams | C4 diagram, Sequence diagram, доменные правила |
| Phase 5 | `05-08_*.md` | 10-12 слайдов, Speaker Script, Q&A (7+), Executive Summary |

**Автоматическая валидация (через Claude Code):**

```
Проверь качество исследования researches/<slug>/:
1. Все ли обязательные файлы созданы?
2. Есть ли непроверенные утверждения [UNVERIFIED] в research?
3. Содержит ли 08_executive_summary.md все обязательные разделы?
4. Есть ли mermaid-диаграммы в diagrams/?
5. Создан ли prototype/cjm-prototype.jsx?
```

### 6.3. Harvest: извлечение знаний

После завершения исследования запустите harvest:

```
/harvest researches/<slug>/
```

Для массового harvest всех исследований:

```
/harvest all
```

**Что проверить после harvest:**

1. Обновлён ли `TOOLKIT_HARVEST.md`
2. Какие паттерны извлечены
3. Предложены ли обновления скиллов или команд

**Мониторинг TOOLKIT_HARVEST.md:**

```bash
cat TOOLKIT_HARVEST.md
```

Обратите внимание на таблицу обработанных проектов:

```markdown
## Обработанные проекты

| Проект | Дата harvest | Извлечено артефактов |
|--------|-------------|---------------------|
| bank_kc_automation | 2026-03-01 | 5 |
| retail_recommendations | 2026-03-02 | 3 |
```

---

## 7. Кастомизация пайплайна

### 7.1. Текущий пайплайн

```
Phase 0     Phase 1     Phase 2     Phase 2.5      Phase 3     Phase 4         Phase 5       Phase 6
DISCOVERY → EXPLORE  → RESEARCH → CJM PROTO    → SOLVE    → ARCHITECTURE → PRESENTATION → PACKAGING
   15%        5%         15%         10%            15%         15%              20%          Buffer 5%
```

### 7.2. Добавление новой фазы

**Пример: добавление Phase 3.5 "Usability Testing".**

**Шаг 1.** Создайте команду:

```bash
touch .claude/commands/usability-testing.md
```

Содержимое:

```markdown
# Phase 3.5: Usability Testing

## Использование
​```
/usability-testing [путь к директории исследования]
​```

## Аргумент
$ARGUMENTS

## Действия

1. Прочитай Phase 0-3 для контекста
2. На основе {CHOSEN_CJM} и prototype/cjm-prototype.jsx:
   - Определи 5 user scenarios для тестирования
   - Создай тестовые сценарии (task + expected outcome + metrics)
   - Спроектируй think-aloud протокол
   - Определи success/failure criteria
3. Создай файл `03.5_usability_test_plan.md`
4. Покажи Checkpoint 3.5
```

**Шаг 2.** Создайте или переиспользуйте скилл:

Если подходящего скилла нет -- создайте новый (см. раздел 1.3). Если подходит существующий -- укажите его в команде.

**Шаг 3.** Обновите `CLAUDE.md`:

- Добавьте фазу в таблицу пайплайна
- Обновите процентное распределение времени
- Добавьте артефакт в tracker

**Шаг 4.** Обновите `/casarium`:

В файле `.claude/commands/casarium.md` добавьте новую фазу между Phase 3 и Phase 4.

**Шаг 5.** Обновите правило `file-conventions.md`:

Добавьте `03.5_usability_test_plan.md` в структуру директории.

### 7.3. Изменение порядка фаз

Порядок фаз определяется в двух местах:

1. **`CLAUDE.md`** -- описание пайплайна (справочная информация)
2. **`.claude/commands/casarium.md`** -- исполняемый порядок фаз

Для изменения порядка:

1. Отредактируйте `.claude/commands/casarium.md` -- переставьте шаги в секции Pipeline и Execution
2. Обновите `CLAUDE.md` -- синхронизируйте описание
3. Убедитесь, что зависимости между фазами соблюдены:

**Граф зависимостей фаз:**

```
Phase 0 (Discovery)
  └── Phase 1 (Explore) — зависит от 0
       └── Phase 2 (Research) — зависит от 0, 1
            └── Phase 2.5 (CJM Prototype) — зависит от 0, 1, 2
                 └── Phase 3 (Solve) — зависит от 0-2.5 + {CHOSEN_CJM}
                      └── Phase 4 (Architecture) — зависит от 0-3
                           └── Phase 5 (Presentation) — зависит от 0-4
                                └── Phase 6 (Packaging) — зависит от всех
```

Каждая фаза читает артефакты предыдущих фаз. Переставлять фазы можно только если зависимости не нарушены.

### 7.4. Создание domain-specific пайплайнов

Для создания пайплайна, заточенного под конкретный домен, рекомендуется:

**Способ 1: Кастомная команда-обёртка.**

Создайте `.claude/commands/casarium-fintech.md`:

```markdown
# Casarium FinTech — пайплайн для финансового домена

## Использование
​```
/casarium-fintech [текст кейса]
​```

## Аргумент
$ARGUMENTS

## Особенности домена
- Домен: Banking/FinTech (автоматическое применение)
- On-premise LLM обязателен
- ФЗ-152, ЦБ, ФСТЭК
- HITL для ВСЕХ решений
- Palette: Blue/Navy/Silver

## Дополнительные фазы
- Phase 3.5: Compliance Review (после Solve)
  - Анализ каждого компонента на соответствие ФЗ-152
  - Формирование compliance matrix

## Пайплайн
Phase 0 → Phase 1 → Phase 2 → Phase 2.5 → Phase 3 → Phase 3.5 → Phase 4 → Phase 5 → Phase 6

## Execution
Выполняй как стандартный /casarium, но с дополнительной фазой 3.5
и автоматическим применением доменных правил FinTech.
```

**Способ 2: Доменное правило + стандартный пайплайн.**

Добавьте расширенное правило в `.claude/rules/domain-specific.md` -- стандартный `/casarium` автоматически применит доменные особенности, обнаружив ключевые слова домена.

### 7.5. Quick Mode (сокращённый пайплайн)

Для кейсов с таймингом менее 2 часов доступен Quick Mode. Активируется командой `ускорь` на любом checkpoint-е или указанием тайминга < 2 часов.

В Quick Mode:
- Phase 0 и Phase 1 объединяются
- Phase 2.5 создаёт 2 варианта CJM вместо 4 (но не пропускается)
- Phase 4 сокращается до минимальной архитектуры
- Phase 5 создаёт сокращённую презентацию (7-8 слайдов)
- 08_executive_summary.md остаётся обязательным

---

## 8. Бэкап и восстановление

### 8.1. Git-based workflow

Проект использует Git для версионирования. Все исследования и конфигурации хранятся в репозитории.

**Базовый workflow:**

```bash
# Коммит после завершения фазы
git add researches/<slug>/
git commit -m "Phase N complete: <slug> - <описание>"

# Коммит после завершения исследования
git add researches/<slug>/
git commit -m "Research complete: <slug>"

# Коммит изменений в конфигурации
git add .claude/ CLAUDE.md
git commit -m "Config update: <описание изменения>"
```

**Автоматический коммит через хук (опционально):**

Настройте хук PostToolUse для автоматического коммита после каждой фазы (см. раздел 4.3).

### 8.2. Branching strategy для исследований

**Рекомендуемая стратегия:**

```
main
├── research/<slug-1>     ← ветка для первого исследования
├── research/<slug-2>     ← ветка для второго исследования
├── feature/new-skill     ← ветка для нового скилла
└── feature/pipeline-v2   ← ветка для обновления пайплайна
```

**Создание ветки для исследования:**

```bash
# Перед началом исследования
git checkout -b research/bank-kc-automation main

# Работа с исследованием...
# Коммиты по ходу фаз

# После завершения -- мёрдж в main
git checkout main
git merge research/bank-kc-automation
```

**Параллельные исследования:**

При запуске `/parallel-research` каждое исследование можно вести в отдельной ветке:

```bash
git checkout -b research/case-1 main
# ... работа с case-1 ...

git checkout -b research/case-2 main
# ... работа с case-2 ...

# Мёрдж обоих в main
git checkout main
git merge research/case-1
git merge research/case-2
```

**Конфигурационные изменения:**

```bash
# Новый скилл или правило
git checkout -b feature/add-telecom-rules main
# ... добавление правил ...
git checkout main
git merge feature/add-telecom-rules
```

### 8.3. Восстановление после сбоя

**Если Claude Code прервался посреди фазы:**

1. Проверьте, какие артефакты уже созданы:
   ```bash
   ls researches/<slug>/
   ```

2. Определите последнюю завершённую фазу (по наличию файлов).

3. Запустите следующую фазу вручную:
   ```
   /solve researches/<slug>/
   ```

**Если файл артефакта повреждён:**

```bash
# Восстановление из последнего коммита
git checkout HEAD -- researches/<slug>/03_solution_strategy.md
```

**Если нужно откатить фазу:**

```bash
# Просмотр истории изменений файла
git log --oneline researches/<slug>/03_solution_strategy.md

# Откат к конкретному коммиту
git checkout <commit-hash> -- researches/<slug>/03_solution_strategy.md
```

**Если нужно перезапустить исследование с нуля:**

```bash
# Удаление директории
rm -rf researches/<slug>/

# Пересоздание через команду
/new-research [название кейса]
```

### 8.4. Рекомендации по бэкапу

| Действие | Частота | Команда |
|----------|---------|---------|
| Коммит артефактов фазы | После каждого checkpoint-а | `git add researches/<slug>/ && git commit` |
| Push в remote | После завершения исследования | `git push origin main` |
| Бэкап конфигурации | После изменений в `.claude/` | `git add .claude/ && git commit && git push` |
| Полный бэкап | Еженедельно | `git push origin --all` |

---

## 9. Governance Shards

### 9.1. Что такое shards

Governance shards -- это специализированные файлы конфигурации для каждой фазы пайплайна. Они хранятся в `.claude/shards/` и решают проблему контекстного дрейфа (context drift) при длинных сессиях: агент перечитывает shard перед началом каждой фазы, получая актуальные правила именно для этой фазы.

Каждый shard содержит:
- **time budget** -- отведённый процент времени на фазу
- **skill to load** -- скилл, который нужно загрузить
- **prerequisites** -- какие артефакты и promises должны существовать
- **quality gates** -- критерии качества для прохождения checkpoint
- **promise tag** -- тег семантического завершения фазы

### 9.2. Текущие shards

| Файл | Фаза | Promise Tag |
|------|------|-------------|
| `phase-0-discovery.shard.md` | Phase 0: Product Discovery | `DISCOVERY_COMPLETE` |
| `phase-1-explore.shard.md` | Phase 1: Explore | `CASE_EXPLORED` |
| `phase-2-research.shard.md` | Phase 2: Research | `RESEARCH_PARANOID_PASSED` |
| `phase-25-cjm.shard.md` | Phase 2.5: CJM Prototype | `CJM_VALIDATED` |
| `phase-3-solve.shard.md` | Phase 3: Solve | `SOLUTION_DESIGNED` |
| `phase-4-architecture.shard.md` | Phase 4: Architecture | `ARCHITECTURE_DEFINED` |
| `phase-5-presentation.shard.md` | Phase 5: Presentation | `PRESENTATION_READY` |
| `bto-evaluation.shard.md` | BTO: оценка скилла/артефакта | `BTO_LAYER2_SCORED` |
| `feature-adr.shard.md` | Feature ADR: адаптивная разработка | (per-step promises) |

### 9.3. Добавление нового shard

При создании новой фазы пайплайна создайте соответствующий shard:

```bash
touch .claude/shards/phase-35-usability.shard.md
```

Минимальная структура shard:

```markdown
# Phase 3.5: Usability Testing — Governance Shard

## Time Budget
5% от общего времени кейса

## Skill to Load
Прочитай `.claude/skills/explore/SKILL.md`

## Prerequisites
- [ ] `researches/<slug>/03_solution_strategy.md` существует
- [ ] Promise `SOLUTION_DESIGNED` эмитирован
- [ ] `{CHOSEN_CJM}` передан из Phase 2.5

## Quality Gates
- Определены 5 user scenarios
- Задан think-aloud протокол
- Указаны success/failure criteria

## Promise Tag
`<promise>USABILITY_PLAN_READY</promise>`
```

### 9.4. Протокол загрузки shard

При старте каждой фазы командный файл явно загружает соответствующий shard:

```markdown
1. **Загрузи shard:** Прочитай `.claude/shards/phase-3-solve.shard.md`
2. **Проверь prerequisites:** Убедись, что все условия shard выполнены
3. **Загрузи скилл:** Прочитай скилл, указанный в shard
```

Это обеспечивает актуальность правил даже в очень длинных сессиях с большим контекстом.

---

## 10. Trust Tiers

### 10.1. Система уровней доверия

Trust Tier System -- это четырёхуровневая классификация скиллов по уровню проверенности и надёжности. Уровень доверия определяет, насколько можно полагаться на скилл в продуктивных исследованиях.

| Tier | Метка | Требования | Признак надёжности |
|------|-------|-----------|-------------------|
| **Tier 3** | Verified | Eval test suites + детерминистическая валидация | Наивысший уровень, автоматическое тестирование |
| **Tier 2** | Validated | Пройден `/bto-test` с Layer 2 score >= 7.0 | Проверен мульти-агентной панелью судей |
| **Tier 1** | Structured | `SKILL.md` + `references/` или `modules/` | Структурирован, задокументирован |
| **Tier 0** | Advisory | Только `SKILL.md` | Базовая документация, требует проверки |

### 10.2. Текущие уровни скиллов

| Скилл | Tier | Метка | Основание |
|-------|------|-------|-----------|
| explore | 1 | Structured | `SKILL.md` + `references/` |
| frontend-design | 0 | Advisory | Только `SKILL.md`, нет references |
| goap-research-ed25519 | 1 | Structured | `SKILL.md` + `references/` + `scripts/` |
| problem-solver-enhanced | 1 | Structured | Расширенный `SKILL.md` с фреймворком TRIZ |
| presentation-storyteller | 1 | Structured | `SKILL.md` + `references/` |
| reverse-engineering-unicorn | 1 | Structured | `SKILL.md` + `modules/` + `references/` + `examples/` |
| bto | 1 | Structured | `SKILL.md` + `modules/` + `references/` + `examples/` |
| feature-adr | 1 | Structured | `SKILL.md` + `modules/` + `references/` |

### 10.3. Применение уровней при загрузке скиллов

| Tier | Поведение при загрузке |
|------|----------------------|
| Tier 0 | Предупреждение при использовании в продуктивном пайплайне: рекомендуется провести `/bto-test` |
| Tier 1 | Стандартное использование; рекомендуется `/bto-test` для повышения |
| Tier 2 | Полная уверенность; BTO-score указан в `SKILL.md` |
| Tier 3 | Наивысшая уверенность; детерминистическая валидация доступна |

### 10.4. Протокол повышения уровня

Для повышения скилла с Tier 1 до Tier 2 или с Tier 2 до Tier 3:

**Шаг 1.** Запустите оценку через BTO:

```
/bto-test .claude/skills/<name>/
```

**Шаг 2.** Проверьте результат Layer 2:

- Layer 2 score >= 7.0 -- повышение до **Tier 2**
- Layer 2 score >= 8.5 + существуют детерминистические eval tests -- повышение до **Tier 3**

**Шаг 3.** Обновите `SKILL.md` скилла, добавив запись о повышении:

```markdown
---
name: my-skill
tier: 2
bto_score: 7.8
promoted_at: 2026-03-02
---
```

**Шаг 4.** Обновите таблицу в разделе 10.2 данного руководства и в `CLAUDE.md`.

### 10.5. Понижение уровня

Если скилл был изменён после получения Tier 2/3, его уровень возвращается на Tier 1 (Structured) до повторного прохождения `/bto-test`. Это предотвращает ложное ощущение надёжности для изменённых, но не переоценённых скиллов.

---

## Приложение A: Чеклист администратора

### При добавлении нового скилла
- [ ] Создана директория `.claude/skills/<name>/`
- [ ] Создан `SKILL.md` с frontmatter (name, description)
- [ ] Добавлены references (если нужны)
- [ ] Скилл зарегистрирован в команде
- [ ] `CLAUDE.md` обновлён (таблица скиллов, граф зависимостей)
- [ ] Скилл протестирован изолированно

### При добавлении новой команды
- [ ] Создан файл `.claude/commands/<name>.md`
- [ ] Указана переменная `$ARGUMENTS`
- [ ] Описаны действия пошагово
- [ ] Указана загрузка скилла (если используется)
- [ ] Определён формат checkpoint
- [ ] Команда протестирована с тестовым вводом
- [ ] `CLAUDE.md` обновлён

### При добавлении новой фазы пайплайна
- [ ] Создана команда (`.claude/commands/`)
- [ ] Создан или переиспользован скилл
- [ ] Обновлён `/casarium` (добавлена фаза)
- [ ] Обновлён `CLAUDE.md` (таблица фаз, пайплайн, артефакты)
- [ ] Обновлён `file-conventions.md` (новый артефакт)
- [ ] Пересчитано распределение времени
- [ ] Проверены зависимости фаз

### При обновлении доменных правил
- [ ] Обновлён `.claude/rules/domain-specific.md`
- [ ] Добавлены ключевые слова для автодетектирования
- [ ] Указаны палитра и тон
- [ ] Указаны регуляторные требования
- [ ] Протестировано на тестовом кейсе

## Приложение B: Структура файлов конфигурации

```
.claude/
├── commands/                   ← Slash-команды
│   ├── casarium.md             ← /casarium (полный пайплайн)
│   ├── new-research.md         ← /new-research
│   ├── parallel-research.md    ← /parallel-research
│   ├── discovery.md            ← /discovery (Phase 0)
│   ├── explore-case.md         ← /explore-case (Phase 1)
│   ├── research.md             ← /research (Phase 2)
│   ├── cjm-prototype.md        ← /cjm-prototype (Phase 2.5)
│   ├── solve.md                ← /solve (Phase 3)
│   ├── architecture-phase.md   ← /architecture-phase (Phase 4)
│   ├── presentation.md         ← /presentation (Phase 5)
│   ├── harvest.md              ← /harvest
│   ├── brain-export.md         ← /brain-export
│   ├── brain-import.md         ← /brain-import
│   ├── init-platform.md        ← /init-platform
│   ├── workers.md              ← /workers
│   ├── dream.md                ← /dream
│   ├── learning-stats.md       ← /learning-stats
│   ├── verify-chain.md         ← /verify-chain
│   ├── feature-adr.md          ← /feature-adr
│   ├── bto.md                  ← /bto
│   ├── bto-build.md            ← /bto-build
│   ├── bto-test.md             ← /bto-test
│   └── bto-optimize.md         ← /bto-optimize
├── rules/                      ← Правила (автоматические)
│   ├── agent-swarm.md
│   ├── anti-patterns.md
│   ├── checkpoint-protocol.md
│   ├── domain-specific.md
│   ├── file-conventions.md
│   ├── modular-reuse.md
│   ├── research-quality.md
│   ├── witness-chain.md
│   ├── reward-learning.md
│   ├── background-workers.md
│   ├── dream-cycles.md
│   ├── model-routing.md
│   ├── trust-tiers.md
│   ├── bto-quality-gates.md
│   ├── feedback-loops.md
│   └── feature-adr-conventions.md
├── shards/                     ← Governance shards (per-phase rules)
│   ├── phase-0-discovery.shard.md
│   ├── phase-1-explore.shard.md
│   ├── phase-2-research.shard.md
│   ├── phase-25-cjm.shard.md
│   ├── phase-3-solve.shard.md
│   ├── phase-4-architecture.shard.md
│   ├── phase-5-presentation.shard.md
│   ├── bto-evaluation.shard.md
│   └── feature-adr.shard.md
├── skills/                     ← Скиллы (загружаемые навыки)
│   ├── explore/
│   ├── frontend-design/
│   ├── goap-research-ed25519/
│   ├── presentation-storyteller/
│   ├── problem-solver-enhanced/
│   ├── reverse-engineering-unicorn/
│   ├── bto/
│   └── feature-adr/
└── agents/                     ← Шаблоны агентов
    └── (создаются по необходимости)
```
