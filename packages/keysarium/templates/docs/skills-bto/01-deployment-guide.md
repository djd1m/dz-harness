# Руководство по развёртыванию @dzhechkov/skills-bto

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Методы установки](#2-методы-установки)
3. [Установка с помощью npx](#3-установка-с-помощью-npx)
4. [Автономная установка (standalone)](#4-автономная-установка-standalone)
5. [Установка рядом с Keysarium](#5-установка-рядом-с-keysarium)
6. [Проверка установки](#6-проверка-установки)
7. [Первый запуск BTO — пошаговое руководство](#7-первый-запуск-bto--пошаговое-руководство)
8. [Интеграция с @dzhechkov/keysarium](#8-интеграция-с-dzhechkokeysarium)
9. [Обновление и удаление](#9-обновление-и-удаление)
10. [Устранение неполадок](#10-устранение-неполадок)

---

## 1. Предварительные требования

Перед установкой убедитесь, что на вашей машине установлено следующее программное обеспечение.

### 1.1. Node.js 16+

`@dzhechkov/skills-bto` требует Node.js версии 16 или выше. Рекомендуется использовать Node.js 20 LTS.

```bash
# Проверка установленной версии
node --version
# Ожидаемый вывод: v16.x.x или выше (рекомендуется v20+)

npm --version
# Ожидаемый вывод: 8.x.x или выше
```

Если Node.js не установлен или версия ниже требуемой:

```bash
# Установка через nvm (рекомендуемый способ, все платформы)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# Установка на Ubuntu/Debian (через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка на macOS (через Homebrew)
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Установка на Windows (через winget)
winget install OpenJS.NodeJS.LTS
```

### 1.2. Claude Code CLI

`@dzhechkov/skills-bto` устанавливает скиллы и команды в проект Claude Code. Сам Claude Code CLI должен быть установлен и настроен.

```bash
# Установка Claude Code CLI глобально
npm install -g @anthropic-ai/claude-code

# Проверка установки
claude --version
# Ожидаемый вывод: claude/x.x.x

# Если возникает ошибка прав доступа при глобальной установке:
# Способ 1: использование sudo (только для Linux/macOS)
sudo npm install -g @anthropic-ai/claude-code

# Способ 2: настройка npm prefix (рекомендуется, без sudo)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

### 1.3. API-ключ Anthropic

Для работы Claude Code и запуска BTO-пайплайна необходим API-ключ Anthropic.

1. Перейдите на [console.anthropic.com](https://console.anthropic.com)
2. Зарегистрируйте аккаунт или войдите в существующий
3. В разделе **API Keys** нажмите **Create Key**
4. Скопируйте ключ (он начинается с `sk-ant-`) — он показывается только один раз
5. Установите переменную окружения:

```bash
# Временно (для текущей сессии терминала)
export ANTHROPIC_API_KEY="sk-ant-..."

# Постоянно (добавьте в ~/.bashrc или ~/.zshrc)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

> **Токены и стоимость:** Полный BTO-цикл (BUILD + BENCHMARK + TEST + OPTIMIZE) потребляет примерно 100–200K токенов. BENCHMARK (B0-B3) добавляет ~3.5K токенов (B0/B1/B3 детерминистические, B2 consistency probe — 3× haiku). Детальная разбивка: BUILD ~22K, BENCHMARK ~3.5K, TEST Layer 2 ~19K (sonnet×3), OPTIMIZE 3 rounds ~131K. Итого ~175K токенов за полный прогон. Отдельный `/bto-benchmark` потребляет ~3.5K токенов, `/bto-test` с Layer 2 — около 15–20K токенов.

### 1.4. Git (опционально, но рекомендуется)

Git необходим для управления версиями ваших артефактов и бэкапов, создаваемых OPTIMIZE.

```bash
# Проверка установки
git --version

# Установка на Ubuntu/Debian
sudo apt install -y git

# Установка на macOS
brew install git

# Базовая настройка (если git установлен впервые)
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

---

## 2. Методы установки

Пакет `@dzhechkov/skills-bto` можно установить тремя способами в зависимости от вашего сценария использования:

| Метод | Когда использовать | Команда |
|-------|-------------------|---------|
| **npx (разовая установка)** | Быстрый старт без глобальной установки | `npx @dzhechkov/skills-bto init` |
| **Глобальная установка** | Частое использование в нескольких проектах | `npm install -g @dzhechkov/skills-bto` |
| **Рядом с Keysarium** | Уже установлен `@dzhechkov/keysarium` | `npx @dzhechkov/skills-bto init` (определяет keysarium автоматически) |

Во всех случаях команда `init` копирует одни и те же файлы в проект. Разница только в том, как запускается CLI.

---

## 3. Установка с помощью npx

`npx` позволяет запустить пакет без предварительной установки. Это рекомендуемый способ для первого знакомства с пакетом.

### 3.1. Перейдите в директорию проекта

```bash
# Перейдите в корень проекта, куда нужно установить BTO
cd /path/to/your-project

# Убедитесь, что вы в правильной директории
pwd
ls
```

Директория проекта должна содержать файлы вашего проекта Claude Code (или быть пустой, если создаёте новый проект).

### 3.2. Запустите установку

```bash
npx @dzhechkov/skills-bto init
```

CLI отобразит баннер и план установки:

```
╔══════════════════════════════════════════════════════╗
║   DZ-SKILLS-BTO — Build·Test·Optimize for Claude Code  ║
║   Structured BTO workflow with quality gates          ║
╚══════════════════════════════════════════════════════╝

  Installation plan:

  + BTO Skill (.claude/skills/bto/)
  + BTO Commands (.claude/commands/bto*.md)
  + BTO Rules (.claude/rules/bto-*.md)
  + BTO Agent Templates (.claude/agents/bto-*.md)

  [1/4] Installing BTO Skill...
  [2/4] Installing BTO Commands...
  [3/4] Installing BTO Rules...
  [4/4] Installing BTO Agent Templates...

  Created .bto-skills.json manifest

  BTO skill pack installed!

  Installed components:
    ✓ BTO Skill (.claude/skills/bto/)
    ✓ BTO Commands (.claude/commands/bto*.md)
    ✓ BTO Rules (.claude/rules/bto-*.md)
    ✓ BTO Agent Templates (.claude/agents/bto-*.md)

  Next steps:
    1. Open Claude Code in this directory
    2. Run /bto [description] for the full BTO pipeline
    3. Or use individual phases:
       /bto-build — Generate skill or command
       /bto-test  — Multi-agent evaluation
```

### 3.3. Предпросмотр без записи (dry-run)

Если хотите узнать, что именно будет установлено, не записывая файлы:

```bash
npx @dzhechkov/skills-bto init --dry-run
```

Команда покажет план установки и завершится без изменений.

### 3.4. Принудительная перезапись (force)

Если BTO уже установлен и вы хотите заменить файлы свежими из пакета:

```bash
npx @dzhechkov/skills-bto init --force
```

> **Внимание:** `--force` перезапишет существующие файлы BTO. Ваши пользовательские модификации будут утеряны. Сначала сделайте бэкап или зафиксируйте изменения в git.

---

## 4. Автономная установка (standalone)

Если вы планируете использовать BTO регулярно и не хотите каждый раз запускать `npx`, установите пакет глобально.

### 4.1. Глобальная установка

```bash
npm install -g @dzhechkov/skills-bto

# Проверка установки
skills-bto --version
# или
npx @dzhechkov/skills-bto --version
```

### 4.2. Инициализация в проекте

После глобальной установки перейдите в проект и запустите:

```bash
cd /path/to/your-project
skills-bto init
```

Или по-прежнему через npx (будет использована кешированная локальная версия):

```bash
npx @dzhechkov/skills-bto init
```

### 4.3. Структура установленных файлов

После `init` в корне проекта появятся следующие файлы и директории:

```
your-project/
├── .bto-skills.json                      ← Манифест установки BTO
└── .claude/
    ├── skills/
    │   └── bto/
    │       ├── SKILL.md                  ← Основной оркестратор BTO
    │       ├── modules/
    │       │   ├── build.md              ← Протокол генерации артефактов
    │       │   ├── test.md               ← Протокол мульти-агентной оценки
    │       │   └── optimize.md           ← Протокол эволюционной оптимизации
    │       └── references/
    │           ├── judge-rubrics.md      ← Рубрики для судей
    │           ├── eval-patterns.md      ← Паттерны оценки
    │           ├── optimization-methods.md ← Методы оптимизации
    │           └── quality-checklist.md  ← Чеклист качества
    ├── commands/
    │   ├── bto.md                        ← /bto — полный пайплайн
    │   ├── bto-build.md                  ← /bto-build — генерация
    │   ├── bto-test.md                   ← /bto-test — оценка
    │   └── bto-optimize.md               ← /bto-optimize — оптимизация
    ├── rules/
    │   └── bto-quality-gates.md          ← Правила quality gates
    └── agents/
        ├── bto-judge-expert.md           ← Агент: Domain Expert
        ├── bto-judge-critic.md           ← Агент: Critic
        └── bto-judge-auditor.md          ← Агент: Completeness Auditor
```

Манифест `.bto-skills.json` записывает версию, список компонентов и все установленные файлы. Он используется командами `update`, `remove`, `list` и `doctor`.

---

## 5. Установка рядом с Keysarium

`@dzhechkov/skills-bto` разработан для совместной работы с `@dzhechkov/keysarium`. При установке в проект, где уже есть Keysarium, BTO автоматически определяет это и интегрируется.

### 5.1. Определение Keysarium

Команда `init` ищет файл `.keysarium.json` в корне проекта. Если он найден — BTO выводит сообщение об интеграции:

```
  ┌──────────────────────────────────────────────────┐
  │ @dzhechkov/keysarium detected!                    │
  │ Version: 1.0.0                                   │
  │ BTO will integrate with existing Keysarium setup.│
  │ Shared directories: .claude/commands, rules, agents│
  └──────────────────────────────────────────────────┘
```

### 5.2. Порядок установки с Keysarium

Рекомендуемый порядок установки (если оба пакета устанавливаются с нуля):

```bash
# Шаг 1: Установите Keysarium первым
npx @dzhechkov/keysarium init

# Шаг 2: Установите BTO поверх
npx @dzhechkov/skills-bto init
```

BTO добавит свои файлы в уже существующие директории `.claude/commands/`, `.claude/rules/` и `.claude/agents/`, не затрагивая файлы Keysarium.

### 5.3. Разделение файлов (изоляция)

Оба пакета используют соглашение об именовании, чтобы не конфликтовать:

| Пакет | Команды | Правила | Агенты |
|-------|---------|---------|--------|
| Keysarium | `casarium.md`, `discovery.md`, ... | `agent-swarm.md`, `checkpoint-protocol.md`, ... | keysarium-агенты |
| BTO | `bto.md`, `bto-build.md`, `bto-test.md`, `bto-optimize.md` | `bto-quality-gates.md` | `bto-judge-*.md` |

Все файлы BTO в общих директориях начинаются с префикса `bto`. Файлы Keysarium таким префиксом не начинаются. Пересечений нет.

### 5.4. Совместное использование в пайплайне Keysarium

После установки BTO становится доступен непосредственно из пайплайна Keysarium. Типичные сценарии:

```
# После Phase 0: оценить quality discovery-документа
/bto-test researches/my-case/00_product_discovery.md

# После Phase 2: проверить research findings
/bto-test researches/my-case/02_research_findings.md full

# Создать новый скилл для проекта
/bto-build "skill for competitive analysis in retail domain"

# Улучшить существующий скилл Keysarium
/bto-optimize .claude/skills/problem-solver-enhanced/SKILL.md
```

---

## 6. Проверка установки

### 6.1. Команда doctor

Запустите `doctor` для проверки здоровья установки сразу после `init`:

```bash
npx @dzhechkov/skills-bto doctor
```

Пример вывода при здоровой установке:

```
  Running health checks for @dzhechkov/skills-bto v1.0.0...

  ✓ Files exist              — All 18 manifest files present
  ✓ BTO skill pack           — SKILL.md present, 4 file(s) in skill pack
  ✓ BTO commands             — 4 BTO command(s): bto.md, bto-build.md, bto-test.md, bto-optimize.md
  ✓ BTO rules                — 1 BTO rule(s): bto-quality-gates.md
  ✓ BTO agents               — 3 BTO agent(s): bto-judge-auditor.md, bto-judge-critic.md, bto-judge-expert.md
  ✓ Keysarium integration    — Active (Keysarium v1.0.0)

  6/6 checks passed — BTO installation is healthy!
```

### 6.2. Команда list

Для просмотра установленных компонентов с детальным перечнем файлов:

```bash
npx @dzhechkov/skills-bto list
```

### 6.3. Проверка в Claude Code

Откройте Claude Code в директории проекта и убедитесь, что BTO-команды доступны:

```bash
# Откройте Claude Code в директории проекта
claude

# Внутри Claude Code проверьте доступность команд
# (просто введите в чате)
/bto --help
```

---

## 7. Первый запуск BTO — пошаговое руководство

Этот раздел проводит вас через полный BTO-цикл: создание нового скилла, его оценка и оптимизация.

### 7.1. Сценарий

Мы создадим скилл для анализа конкурентов в SaaS-домене, затем протестируем и оптимизируем его.

### 7.2. BUILD — Генерация скилла

В Claude Code введите:

```
/bto-build skill for competitive analysis of SaaS companies: identify pricing models, feature sets, positioning, market segments, and strategic vulnerabilities
```

Claude Code:
1. Загрузит `.claude/skills/bto/SKILL.md` и `.claude/skills/bto/modules/build.md`
2. Определит тип артефакта: `skill`
3. Разберёт требования в QUICK mode (по умолчанию)
4. Сгенерирует полную структуру скилла

Ожидаемый результат:

```
═══════════════════════════════════════════════════════
CHECKPOINT: BUILD Complete
Artifact type: skill
Mode used: QUICK

Files created:
  .claude/skills/saas-competitive-analysis/SKILL.md (8.2 KB)
  .claude/skills/saas-competitive-analysis/modules/analysis.md (4.1 KB)
  .claude/skills/saas-competitive-analysis/references/pricing-models.md (2.3 KB)
  .claude/skills/saas-competitive-analysis/examples/sample-analysis.md (1.8 KB)

Self-review: 12/12 checks passed

Next steps:
  /bto-test .claude/skills/saas-competitive-analysis/ — evaluate quality
  /bto [path]      — test + optimize in one pipeline
• "ок" — done
• "переделай [aspect]" — adjust and regenerate
• "углуби [section]" — expand a specific section
• "добавь пример" — add another example
═══════════════════════════════════════════════════════
```

Ответьте `ок` для продолжения.

> **Совет:** Если требования сложные или неоднозначные, используйте DEEP mode с интерактивным уточнением:
> `/bto-build deep skill for competitive analysis of SaaS companies`

### 7.3. TEST — Мульти-агентная оценка

Переходим к оценке созданного скилла. Продолжите в том же диалоге или запустите отдельно:

```
/bto-test .claude/skills/saas-competitive-analysis/
```

**Layer 0 — детерминированные проверки (бесплатно, мгновенно):**

```
═══════════════════════════════════════════════════════
📋 LAYER 0: Deterministic Pre-checks
Artifact: .claude/skills/saas-competitive-analysis/
Type: skill

Results: 10/10 passed (100%)

✅ CHECK-S1: SKILL.md exists
✅ CHECK-S2: Has title heading
✅ CHECK-S3: Has Overview section
✅ CHECK-S4: Has Anti-Patterns section
✅ CHECK-S5: All modules referenced in SKILL.md
✅ CHECK-S6: All references referenced in SKILL.md
✅ CHECK-S7: No empty sections
✅ CHECK-S8: Size within bounds (8.2KB)
✅ CHECK-S9: Total directory size < 200KB (16.4KB)
✅ CHECK-S10: Has references/ and examples/

Gate: PASS ✅
═══════════════════════════════════════════════════════
```

**Layer 1 — быстрая LLM-оценка (haiku, ~10 сек):**

```
SCORES:
- CLARITY:       7/10 — Instructions are mostly clear but some steps ambiguous
- COMPLETENESS:  8/10 — All required sections present
- ACTIONABILITY: 7/10 — Could produce output but needs clearer output format
- QUALITY:       8/10 — Well-structured, professional formatting
- ANTI-PATTERNS: 7/10 — Anti-patterns section present but could be expanded

AVERAGE: 7.4/10

TOP 3 IMPROVEMENTS:
1. Clarify the exact output format for competitor profiles
2. Add edge case handling for private companies without pricing data
3. Expand anti-patterns with more domain-specific failure modes

VERDICT: PASS (≥7.0)
```

Поскольку Layer 1 показал PASS, Claude Code предложит запустить полную панель судей. Введите `да` для Layer 2:

**Layer 2 — полная панель судей (3 параллельных агента sonnet, ~30 сек):**

Три агента оценивают артефакт независимо друг от друга:

```
📊 BTO EVALUATION REPORT
Artifact: .claude/skills/saas-competitive-analysis/
Type: skill
Level: Layer 0 + Layer 1 + Layer 2

OVERALL SCORE: 7.1 / 10  [PASS]

Per-Dimension:
  METHODOLOGY:  7.2  ███████░░░
  DEPTH:        6.8  ██████░░░░
  CORRECTNESS:  7.6  ████████░░
  USABILITY:    7.0  ███████░░░
  ROBUSTNESS:   6.4  ██████░░░░

Top Improvements:
1. DEPTH: Add structured framework for pricing model classification (freemium, usage-based, tiered, etc.)
2. ROBUSTNESS: Handle failure cases for companies that don't publicly disclose pricing
3. METHODOLOGY: Clarify the sequence when multiple competitors have conflicting positioning
```

Обратите внимание: DEPTH (6.8) и ROBUSTNESS (6.4) ниже порога 7.0 — именно эти измерения станут целями оптимизации.

### 7.4. OPTIMIZE — Эволюционная оптимизация

Запустите оптимизацию, нацелив её на слабые измерения:

```
/bto-optimize .claude/skills/saas-competitive-analysis/ DEPTH
```

**Процесс оптимизации (3 раунда):**

- **Round 1:** 5 параллельных агентов генерируют варианты (Rephrase, Restructure, Add Constraints, Simplify, Specialize). Каждый вариант оценивается haiku-агентом. Выбираются топ-2 по общему баллу.

- **Round 2:** Кроссовер топ-2 вариантов → 3 новых варианта → оценка haiku → топ-2.

- **Round 3:** Финальный кроссовер → 3 варианта → полная панель судей (Layer 2, sonnet) → победитель.

Финальный отчёт:

```
═══════════════════════════════════════════════════════
🔧 BTO OPTIMIZATION REPORT
Artifact: .claude/skills/saas-competitive-analysis/SKILL.md
Rounds: 3
Total evaluations: 15

BEFORE → AFTER:
  METHODOLOGY:  7.2 → 8.0  (+0.8) ⬆️
  DEPTH:        6.8 → 8.2  (+1.4) ⬆️
  CORRECTNESS:  7.6 → 8.1  (+0.5) ⬆️
  USABILITY:    7.0 → 7.8  (+0.8) ⬆️
  ROBUSTNESS:   6.4 → 7.9  (+1.5) ⬆️

  OVERALL:      7.1 → 8.0  (+0.9) ⬆️

Winning Strategy: Specialize + Add Constraints (crossover)

CHANGELOG:
- Added taxonomy of 6 SaaS pricing models with detection signals
- Added explicit handling for companies without public pricing
- Expanded anti-patterns section with 4 new domain-specific failure modes
- Structured competitor profile output format with required fields
- Added edge case protocol for market segment ambiguity

Recommendation: Apply changes — significant improvement

Backup saved: SKILL.md.pre-optimize.bak
═══════════════════════════════════════════════════════
```

Оптимизированный вариант автоматически записан поверх оригинала. Резервная копия сохранена в `.pre-optimize.bak`.

Для отката к исходной версии:

```
откат
```

### 7.5. Полный пайплайн одной командой

Все три фазы можно запустить единой командой `/bto`:

```
/bto "skill for competitive analysis of SaaS companies: pricing, features, positioning, vulnerabilities"
```

`/bto` автоматически:
1. Определяет, что аргумент — описание (не путь), запускает BUILD
2. После BUILD ждёт вашего подтверждения
3. Запускает TEST (Layer 0 → Layer 1, предлагает Layer 2)
4. После TEST ждёт подтверждения
5. Запускает OPTIMIZE (только если score < 8.0)
6. После OPTIMIZE показывает финальный отчёт

---

## 8. Интеграция с @dzhechkov/keysarium

### 8.1. Автоматическое определение

При запуске `npx @dzhechkov/skills-bto init` в директории, где уже установлен Keysarium (есть файл `.keysarium.json`), BTO автоматически выводит сообщение об интеграции и настраивается соответствующим образом.

Проверить интеграцию можно через `doctor`:

```bash
npx @dzhechkov/skills-bto doctor
```

Строка `Keysarium integration` в выводе покажет статус:
- `Active (Keysarium v1.0.0)` — интеграция активна
- `Not installed (standalone BTO mode)` — BTO работает автономно

### 8.2. BTO в пайплайне Keysarium (фазы)

BTO органично встраивается в 7-фазный пайплайн Keysarium. Используйте BTO-команды для оценки и улучшения артефактов каждой фазы:

| Фаза Keysarium | Артефакт | BTO-команда |
|---------------|----------|-------------|
| Phase 0 (Discovery) | `00_product_discovery.md` | `/bto-test researches/<slug>/00_product_discovery.md` |
| Phase 2 (Research) | `02_research_findings.md` | `/bto-test researches/<slug>/02_research_findings.md full` |
| Phase 3 (Solve) | `03_solution_strategy.md` | `/bto-test researches/<slug>/03_solution_strategy.md` |
| Phase 5 (Presentation) | `05_presentation_content.md` | `/bto-test researches/<slug>/05_presentation_content.md` |
| Любой скилл | `.claude/skills/<name>/` | `/bto-optimize .claude/skills/<name>/` |

### 8.3. Создание новых скиллов для Keysarium

Для расширения возможностей пайплайна Keysarium используйте BTO BUILD:

```
/bto-build deep skill for quantitative financial modeling in banking domain: DCF, NPV, IRR calculations with Russian regulatory context
```

DEEP mode запустит интерактивное уточнение требований через `explore` скилл, что особенно полезно для сложных доменных скиллов.

### 8.4. Параллельное использование команд

После установки обоих пакетов в Claude Code доступны команды обоих пайплайнов одновременно:

```
# Keysarium команды
/casarium      /discovery     /explore-case  /research
/cjm-prototype /solve         /architecture-phase /presentation

# BTO команды
/bto           /bto-build     /bto-test      /bto-optimize
```

Конфликтов между командами нет. Используйте их вместе в рамках одного сеанса Claude Code.

---

## 9. Обновление и удаление

### 9.1. Обновление установки

Для обновления BTO до последней версии:

```bash
npx @dzhechkov/skills-bto update
```

Команда `update`:
1. Читает манифест `.bto-skills.json`, определяет установленные компоненты
2. Сравнивает текущие файлы с шаблонами нового пакета
3. Показывает diff по каждому изменённому файлу
4. Запрашивает подтверждение перед обновлением

```bash
# Предпросмотр изменений без записи
npx @dzhechkov/skills-bto update --dry-run
```

> **Рекомендация:** Перед обновлением зафиксируйте текущее состояние в git:
> ```bash
> git add .claude/ .bto-skills.json
> git commit -m "snapshot before skills-bto update"
> ```

### 9.2. Удаление установки

```bash
npx @dzhechkov/skills-bto remove
```

Команда `remove` удаляет только файлы, перечисленные в манифесте. Файлы Keysarium (если они есть в тех же директориях) не затрагиваются. После удаления манифест `.bto-skills.json` также удаляется.

---

## 10. Устранение неполадок

### 10.1. Ошибка: "BTO skill pack is already installed"

```
WARN  BTO skill pack is already installed in this directory.
      Run @dzhechkov/skills-bto update to update, or use --force to overwrite.
```

**Причина:** Файл `.bto-skills.json` уже существует в директории.

**Решение:**
```bash
# Вариант 1: обновить существующую установку
npx @dzhechkov/skills-bto update

# Вариант 2: принудительно перезаписать
npx @dzhechkov/skills-bto init --force
```

### 10.2. Ошибка: "Path not found" при запуске /bto-test

```
Path not found: .claude/skills/my-skill/
```

**Причина:** Передан несуществующий путь.

**Решение:** Проверьте путь и убедитесь, что директория скилла существует:

```bash
ls .claude/skills/
# Убедитесь, что директория скилла присутствует в списке
```

При использовании `/bto-test` путь должен быть либо директорией скилла (`.claude/skills/<name>/`), либо конкретным файлом (`.claude/commands/<name>.md`).

### 10.3. Layer 0 провалился, несмотря на корректный файл

```
❌ CHECK-S7: Empty section found at line 45
```

**Причина:** Секция в SKILL.md содержит заголовок без контента (следующий заголовок идёт сразу).

**Решение:** Откройте указанный файл, перейдите к строке 45 и добавьте содержимое в пустую секцию. Требование: между любыми двумя заголовками должен быть хотя бы один абзац текста или элемент списка.

### 10.4. Команды /bto* не отображаются в Claude Code

**Причина 1:** Вы не в директории проекта, где установлен BTO.

**Решение:**
```bash
# Убедитесь, что Claude Code запущен в правильной директории
ls .bto-skills.json
# Если файл не найден — перейдите в правильную директорию и запустите claude снова
```

**Причина 2:** Claude Code был открыт до установки BTO.

**Решение:** Закройте и снова откройте Claude Code.

### 10.5. Layer 2 работает медленно

Layer 2 запускает 3 параллельных агента sonnet. Время выполнения 30–60 секунд — это нормально. Если выполнение занимает более 3 минут:

- Проверьте лимиты вашего API-аккаунта Anthropic (rate limits)
- Убедитесь, что файл артефакта не слишком большой (> 50KB для SKILL.md — нарушение CHECK-S8)
- При необходимости запустите только Layer 1: удалите слово `full` из аргументов `/bto-test`

### 10.6. OPTIMIZE показывает "Minimal improvement"

```
Optimization produced minimal improvement. Consider original.
```

**Возможные причины:**
- Артефакт уже близок к оптимуму по использованным стратегиям мутации
- Стратегии мутации не направлены на реальные слабые места

**Решение:**
```bash
# Запустите оптимизацию с указанием конкретного слабого измерения
/bto-optimize .claude/skills/my-skill/ ROBUSTNESS
```

Явное указание целевого измерения направляет 3 из 5 мутационных вариантов на стратегии, наиболее релевантные для этого измерения.

### 10.7. Проверка здоровья выдаёт предупреждения

Запустите `doctor` для диагностики:

```bash
npx @dzhechkov/skills-bto doctor
```

Для каждого провалившегося чека будет показана подсказка `Fix:`. Большинство проблем решаются командой `update`:

```bash
npx @dzhechkov/skills-bto update
```

### 10.8. Ошибка прав доступа при записи файлов

```
Error: EACCES: permission denied, mkdir '.claude/skills/bto'
```

**Решение:**
```bash
# Проверьте права на директорию проекта
ls -la .
# Если директория не принадлежит вам:
sudo chown -R $(whoami) .

# Либо создайте директорию вручную с правильными правами
mkdir -p .claude/skills .claude/commands .claude/rules .claude/agents
chmod 755 .claude .claude/skills .claude/commands .claude/rules .claude/agents
npx @dzhechkov/skills-bto init
```

### 10.9. Таблица кодов выхода CLI

| Код | Значение |
|-----|---------|
| `0` | Успешное выполнение |
| `1` | Ошибка (неверные аргументы, файлы не найдены, проверки не пройдены) |

При коде выхода `1` в `doctor` — прочитайте раздел "Fix suggestions" в выводе. При коде `1` в `init` или `update` — прочитайте сообщение об ошибке и следуйте инструкциям.
