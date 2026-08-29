# Руководство администратора @dzhechkov/skills-bto

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


Это руководство описывает управление, настройку и обслуживание BTO skill pack. Предназначено для администраторов, которые управляют компонентами BTO, настраивают quality gates, конфигурируют панели судей и контролируют качество оценки.

---

## Содержание

1. [Управление компонентами BTO](#1-управление-компонентами-bto)
2. [Конфигурация quality gates (Layer 0–3)](#2-конфигурация-quality-gates-layer-03)
3. [Настройка панели судей](#3-настройка-панели-судей)
4. [Параметры оптимизации](#4-параметры-оптимизации)
5. [Управление модельным бюджетом](#5-управление-модельным-бюджетом)
6. [Создание пользовательских рубрик](#6-создание-пользовательских-рубрик)
7. [Мониторинг качества оценки](#7-мониторинг-качества-оценки)
8. [Обнаружение и устранение анти-паттернов](#8-обнаружение-и-устранение-анти-паттернов)
9. [Бэкап и восстановление](#9-бэкап-и-восстановление)

---

## 1. Управление компонентами BTO

### 1.1. Текущие компоненты

После установки BTO включает следующие компоненты:

| Компонент | Путь | Назначение |
|-----------|------|------------|
| BTO Skill | `.claude/skills/bto/` | Основной оркестратор: загружается командами |
| SKILL.md | `.claude/skills/bto/SKILL.md` | Точка входа, документирует все четыре модуля |
| Модуль BUILD | `.claude/skills/bto/modules/build.md` | Протокол генерации артефактов |
| Модуль BENCHMARK | `.claude/skills/bto/modules/benchmark.md` | Детерминистический бенчмаркинг (B0-B3) |
| Модуль TEST | `.claude/skills/bto/modules/test.md` | Протокол мульти-агентной оценки |
| Модуль OPTIMIZE | `.claude/skills/bto/modules/optimize.md` | Протокол эволюционной оптимизации |
| Рубрики судей | `.claude/skills/bto/references/judge-rubrics.md` | Якорные точки для scoring |
| Паттерны оценки | `.claude/skills/bto/references/eval-patterns.md` | Паттерны мульти-агентной оценки |
| Методы оптимизации | `.claude/skills/bto/references/optimization-methods.md` | Методология оптимизации |
| Чеклист качества | `.claude/skills/bto/references/quality-checklist.md` | Детерминистические проверки Layer 0 |
| Golden samples | `.claude/skills/bto/references/golden-samples.md` | Эталонные структуры для бенчмаркинга |
| Команда /bto | `.claude/commands/bto.md` | Полный пайплайн |
| Команда /bto-build | `.claude/commands/bto-build.md` | BUILD-фаза отдельно |
| Команда /bto-benchmark | `.claude/commands/bto-benchmark.md` | BENCHMARK-фаза отдельно |
| Команда /bto-test | `.claude/commands/bto-test.md` | TEST-фаза отдельно |
| Команда /bto-optimize | `.claude/commands/bto-optimize.md` | OPTIMIZE-фаза отдельно |
| Правила quality gates | `.claude/rules/bto-quality-gates.md` | Автоматически применяемые правила |
| Агент Domain Expert | `.claude/agents/bto-judge-expert.md` | Judge 1 конфиг |
| Агент Critic | `.claude/agents/bto-judge-critic.md` | Judge 2 конфиг |
| Агент Auditor | `.claude/agents/bto-judge-auditor.md` | Judge 3 конфиг |

### 1.2. Проверка компонентов

```bash
# Полная диагностика установки
npx @dzhechkov/skills-bto doctor

# Листинг установленных файлов
npx @dzhechkov/skills-bto list
```

### 1.3. Обновление отдельных компонентов

Команда `update` обновляет все компоненты из последней версии пакета. На данный момент нет механизма обновления одного конкретного файла через CLI. Для обновления отдельного файла:

```bash
# Шаг 1: просмотрите diff без применения
npx @dzhechkov/skills-bto update --dry-run

# Шаг 2: при необходимости обновите один файл вручную из шаблона пакета
# Шаблоны доступны в локальном кеше пакета:
node -e "console.log(require.resolve('@dzhechkov/skills-bto/package.json').replace('package.json', 'templates/'))"

# Шаг 3: скопируйте нужный файл из templates/ в .claude/
```

### 1.4. Добавление пользовательских расширений

Для добавления собственных ссылочных материалов без изменения базовых файлов пакета создайте файлы с префиксом, отличным от стандартных имён:

```
.claude/skills/bto/references/
├── judge-rubrics.md            ← базовый (не изменять)
├── eval-patterns.md            ← базовый
├── optimization-methods.md     ← базовый
├── quality-checklist.md        ← базовый
└── custom-domain-rubrics.md    ← ваш пользовательский файл (не перезапишется при update)
```

Ссылайтесь на пользовательские файлы явно в командах или при ручном запуске BTO-фаз.

### 1.5. Структура скилл-директории

Полная структура скилла BTO:

```
.claude/skills/bto/
├── SKILL.md                          ← Документирует модули, зависимости, quick start
├── modules/
│   ├── build.md                      ← Протокол BUILD: type detection, templates, self-review
│   ├── test.md                       ← Протокол TEST: Layer 0-2, judge prompts, aggregation
│   └── optimize.md                   ← Протокол OPTIMIZE: mutation strategies, convergence
└── references/
    ├── judge-rubrics.md              ← Anchoring для judge scores (1-10 шкала)
    ├── eval-patterns.md              ← Паттерны эффективной мульти-агентной оценки
    ├── optimization-methods.md       ← Эволюционные стратегии, crossover паттерны
    └── quality-checklist.md          ← 71 детерминистическая проверка Layer 0
```

---

## 2. Конфигурация quality gates (Layer 0–3)

### 2.1. Архитектура слоёв

BTO использует четырёхуровневую систему quality gates. Каждый слой является шлюзом для следующего:

```
Layer 0  →  Layer 1  →  Layer 2  →  Layer 3
(haiku)     (haiku)    (sonnet)     (opus)
Структура   Семантика  Глубина      Синтез
Бесплатно   Дёшево     Умеренно     Дорого
Мгновенно   ~10 сек    ~30 сек      ~60 сек
```

**Ключевое правило:** Артефакт продвигается в следующий слой только при прохождении текущего. Провал Layer 0 немедленно останавливает оценку — LLM-вызовы не делаются.

### 2.2. Layer 0: Детерминистические проверки

Layer 0 выполняется для всех типов артефактов. Проверки бесплатны и мгновенны.

**Универсальные проверки (все типы, CHECK-U1–U5):**

| Проверка | Описание |
|---------|---------|
| CHECK-U1 | Файл существует и не пуст |
| CHECK-U2 | Файл является валидным UTF-8 |
| CHECK-U3 | Содержит хотя бы один markdown-заголовок (`#`) |
| CHECK-U4 | Не более 2 последовательных пустых строк |
| CHECK-U5 | Размер файла в допустимых пределах (тип-зависимо) |

**Проверки для скиллов (CHECK-S1–S10):**

| Проверка | Описание |
|---------|---------|
| CHECK-S1 | `SKILL.md` существует в директории скилла |
| CHECK-S2 | `# Title` — первый заголовок файла |
| CHECK-S3 | Есть секция `## Overview` или `## Purpose` |
| CHECK-S4 | Есть секция `## Anti-Patterns` |
| CHECK-S5 | Все файлы в `modules/` упомянуты в `SKILL.md` |
| CHECK-S6 | Все файлы в `references/` упомянуты в `SKILL.md` |
| CHECK-S7 | Нет пустых секций (заголовок сразу за заголовком без контента) |
| CHECK-S8 | Размер `SKILL.md`: 1KB < размер < 50KB |
| CHECK-S9 | Общий размер директории скилла < 200KB |
| CHECK-S10 | Есть хотя бы один файл в `references/` или `examples/` |

**Проверки для команд (CHECK-C1–C5):**

| Проверка | Описание |
|---------|---------|
| CHECK-C1 | Файл содержит `$ARGUMENTS` или явную ссылку на параметр |
| CHECK-C2 | Есть checkpoint-баннер или checkpoint-протокол |
| CHECK-C3 | Есть инструкция загрузки скилла (`Read .claude/skills/...`) |
| CHECK-C4 | Размер: 500B < файл < 20KB |
| CHECK-C5 | Есть секция `## Usage` или `## Protocol` |

**Проверки для правил (CHECK-R1–R4):**

| Проверка | Описание |
|---------|---------|
| CHECK-R1 | Есть таблица или структурированный список паттернов |
| CHECK-R2 | Каждый паттерн имеет сигнал обнаружения и предписанное исправление |
| CHECK-R3 | Размер: 200B < файл < 10KB |
| CHECK-R4 | Есть секция `Auto-Detection` или аналогичная |

**Проверки для агент-шаблонов (CHECK-A1–A4):**

| Проверка | Описание |
|---------|---------|
| CHECK-A1 | Явно указана модель (haiku / sonnet / opus) |
| CHECK-A2 | Указана область изоляции (что читает и что пишет) |
| CHECK-A3 | Есть шаблон промпта или инструкции |
| CHECK-A4 | Размер: 200B < файл < 10KB |

### 2.3. Порог прохождения Layer 0

```
score = passed_checks / total_checks
Gate: score ≥ 0.80 (80%)
```

При `score < 0.80` Layer 0 FAIL: выводится отчёт с конкретными провалившимися проверками, LLM-слои не запускаются.

**Исключение:** Layer 0 может автоматически повторить генерацию до 3 раз при незначительных структурных нарушениях (в контексте BUILD), прежде чем эскалировать к человеку.

### 2.4. Layer 1: Быстрая LLM-оценка

**Модель по умолчанию:** claude-haiku (cost-optimized)

**5 измерений (шкала 1–10):**

| Измерение | Что оценивается |
|-----------|----------------|
| CLARITY | Насколько инструкции однозначны? Может ли LLM точно им следовать? |
| COMPLETENESS | Все ли необходимые секции присутствуют? |
| ACTIONABILITY | Может ли Claude произвести конкретный вывод на основе этих инструкций? |
| QUALITY | Структурированность, профессионализм, форматирование |
| ANTI-PATTERNS | Избегает ли артефакт известных проблемных паттернов? |

**Пороги Layer 1:**

| Средний балл | Решение |
|-------------|---------|
| ≥ 7.0 | PASS — предложить Layer 2 по желанию |
| 5.0–6.9 | NEEDS WORK — автоматически предложить Layer 2 |
| < 5.0 | FAIL — рекомендовать исправление перед продолжением |

### 2.5. Layer 2: Полная панель судей

**Архитектура:** 3 параллельных агента, каждый с уникальным углом зрения. Изоляция: агенты не видят оценки друг друга до сдачи своей.

**5 измерений (шкала 1–10, другие, чем в Layer 1):**

| Измерение | Что оценивается |
|-----------|----------------|
| METHODOLOGY | Качество подхода, структура, обоснованность |
| DEPTH | Достаточная детализация для задачи |
| CORRECTNESS | Точность утверждений и инструкций |
| USABILITY | Эффективность использования пользователем/агентом |
| ROBUSTNESS | Обработка граничных случаев и режимов отказа |

**Агрегация баллов:**

```
dim_score = expert[dim] * 0.40 + critic[dim] * 0.30 + auditor[dim] * 0.30
overall   = mean(all dimension_scores)
```

**Обнаружение разногласий:**

Если по любому измерению `max(scores) - min(scores) > 3` → флаг для мета-судьи.

### 2.6. Layer 3 / Мета-судья

Layer 3 (opus) запускается только в двух сценариях:

1. **Разрешение разногласий:** Любое измерение с разбросом > 3 баллов между судьями Layer 2
2. **Кроссовер при оптимизации:** Генерация новых вариантов при эволюционной оптимизации (opus используется для kreativной работы)

**Мета-судья никогда не запускается автоматически для рутинных оценок.** Только при флагированных разногласиях.

---

## 3. Настройка панели судей

### 3.1. Три роли судей

| Судья | Роль | Установка калибровки | Ожидаемый средний балл |
|-------|------|---------------------|----------------------|
| Domain Expert | Оценивает техническое качество и методологическую корректность | Нейтральная, фокус на сильных сторонах | 7–8 |
| Critic | Ищет проблемы, пробелы, анти-паттерны | Строгая — "err on the side of strict" | 5–6 |
| Completeness Auditor | Проверяет структурную полноту и перекрёстные ссылки | Нейтральная, фокус на покрытии | 6–7 |

### 3.2. Файлы конфигурации агентов

Каждый судья имеет свой конфигурационный файл в `.claude/agents/`:

**`.claude/agents/bto-judge-expert.md`** — Domain Expert

```markdown
# BTO Judge — Domain Expert

## Purpose
Evaluate Claude Code artifacts for technical quality, methodology soundness,
and domain appropriateness.

## Configuration
- Model: sonnet
- Isolation: reads artifact + judge-rubrics.md, writes to evaluation output
- Role: constructive, domain-focused, strengths and improvements

## Scoring Calibration
- Score 8-10: Exemplary artifact, production-ready
- Score 6-7: Good quality, minor improvements needed
- Score 4-5: Mediocre, significant gaps present
- Score 1-3: Poor, major structural or content issues
```

**`.claude/agents/bto-judge-critic.md`** — Critic

```markdown
# BTO Judge — Critic

## Purpose
Find weaknesses, gaps, anti-patterns, and failure modes in Claude Code artifacts.

## Configuration
- Model: sonnet
- Isolation: reads artifact + judge-rubrics.md, writes to evaluation output
- Role: adversarial, strict — err on the side of low scores

## Scoring Calibration
- Score 8-10: Exceptionally robust, genuinely hard to criticize
- Score 5-7: Average with notable weaknesses
- Score 2-4: Multiple problems, unclear instructions, missing edge cases
- Score 1: Fundamentally broken or misleading
```

**`.claude/agents/bto-judge-auditor.md`** — Completeness Auditor

```markdown
# BTO Judge — Completeness Auditor

## Purpose
Audit structural completeness: all required sections, working cross-references,
no coverage gaps.

## Configuration
- Model: sonnet
- Isolation: reads artifact + quality-checklist.md, writes to evaluation output
- Role: systematic, coverage-focused, structural integrity

## Scoring Calibration
- 10/10: All sections present, all references resolve, no gaps
- 7-9: Minor missing elements, non-critical
- 4-6: Several sections missing or incomplete
- 1-3: Fundamental structural problems
```

### 3.3. Изменение весов судей

Стандартные веса: Domain Expert 0.40 / Critic 0.30 / Auditor 0.30

Для изменения весов под конкретные нужды отредактируйте секцию агрегации в `.claude/skills/bto/modules/test.md`:

```markdown
### Score Aggregation

**Weights:**
- Domain Expert: 0.40   ← изменить здесь
- Critic: 0.30          ← изменить здесь
- Completeness Auditor: 0.30  ← изменить здесь
```

**Требования к весам:**
- Сумма весов должна быть равна 1.0
- Количество судей должно быть нечётным (3 или 5) — для отсутствия ничьей
- Не рекомендуется устанавливать вес Critic < 0.20 — это снизит чувствительность к проблемам

**Пример для проектов с высоким требованием к надёжности** (сдвиг в сторону Critic и Auditor):

```markdown
**Weights:**
- Domain Expert: 0.30
- Critic: 0.40
- Completeness Auditor: 0.30
```

**Пример для быстрой оценки качества контента** (приоритет Domain Expert):

```markdown
**Weights:**
- Domain Expert: 0.50
- Critic: 0.25
- Completeness Auditor: 0.25
```

### 3.4. Расширенная панель 5 судей (high-stakes)

Для критических артефактов (например, скиллы, используемые в продакшн-пайплайнах) используйте панель из 5 судей. Добавьте два дополнительных агента:

**Судья 4: Consistency Checker** — проверяет внутреннюю согласованность артефакта. Убеждается, что секции не противоречат друг другу.

**Судья 5: Practical Validator** — моделирует реальное использование артефакта. Проверяет, что инструкции работоспособны на конкретных примерах.

Создайте конфиги агентов:

```
.claude/agents/bto-judge-consistency.md
.claude/agents/bto-judge-practical.md
```

Обновите секцию агрегации в `test.md`:

```markdown
**Weights (5-judge panel):**
- Domain Expert: 0.30
- Critic: 0.25
- Completeness Auditor: 0.20
- Consistency Checker: 0.15
- Practical Validator: 0.10
```

### 3.5. Порог эскалации к мета-судье

Стандартный порог: если `max - min > 3` по любому измерению.

Для более строгой эскалации (уменьшить порог до 2):

В `.claude/skills/bto/modules/test.md` найдите:

```markdown
**Disagreement Detection:**
For each dimension, if `max(scores) - min(scores) > 3` → FLAG for meta-judge.
```

И измените `> 3` на `> 2`.

Для более мягкой эскалации (только при критическом расхождении):

Измените `> 3` на `> 4`.

---

## 4. Параметры оптимизации

### 4.1. Стратегии мутации

OPTIMIZE Module использует 5 стратегий мутации. Каждая целенаправленно улучшает определённые измерения:

| Стратегия | Применять когда | Целевые измерения |
|-----------|----------------|-------------------|
| **Rephrase** | Инструкции расплывчаты или допускают двусмысленность | CLARITY, USABILITY |
| **Restructure** | Плохой поток, неудачная организация секций | METHODOLOGY, USABILITY |
| **Add Constraints** | Слабая обработка граничных случаев | ROBUSTNESS, CORRECTNESS |
| **Simplify** | Артефакт слишком многословен или перенасыщен | USABILITY, CLARITY |
| **Specialize** | Мало доменного контекста и примеров | DEPTH, CORRECTNESS |

Соответствие слабых измерений стратегиям:

```
Слабое измерение    Первичная стратегия    Вторичная стратегия
───────────────────────────────────────────────────────────────
METHODOLOGY       → Restructure            Add Constraints
DEPTH             → Specialize             Add Constraints
CORRECTNESS       → Add Constraints        Rephrase
USABILITY         → Rephrase               Restructure
ROBUSTNESS        → Add Constraints        Specialize
```

### 4.2. Структура раундов

Стандартный пайплайн оптимизации (3 раунда):

```
Round 1: 5 вариантов × Layer 1 eval (haiku) → выбор топ-2
Round 2: crossover топ-2 → 3 новых варианта × Layer 1 eval → выбор топ-2
Round 3: crossover → 3 финальных варианта × Layer 2 eval (sonnet×3) → победитель
```

Итого: до 15 оценок + 1 baseline.

### 4.3. Delta Gate (условие принятия улучшения)

```
delta_gate = new_score - prev_score > 0.5
```

Итерация принимается только если улучшение превышает 0.5 балла.

| Сценарий | Действие |
|---------|---------|
| delta > 0.5 | Принять улучшение, продолжить |
| delta 0–0.5 | Отклонить (слишком мало), продолжить с другими стратегиями |
| delta ≤ 0 и регрессия > 1.0 | Откат к лучшей предыдущей версии, логировать регрессию |
| 3 последовательных итерации с delta ≤ 0.5 | Объявить сходимость, остановиться |

### 4.4. Условия раннего выхода

**OPTIMIZE не запускается** если baseline score ≥ 8.0. Вместо этого выводятся конкретные предложения по незначительным улучшениям без полного эволюционного цикла. Для принудительной оптимизации всё равно требуется явное подтверждение пользователя.

**OPTIMIZE прерывается** досрочно при:
- Регрессии > 0.5 от baseline в любом раунде
- Критическом провале Layer 0 на любом из вариантов
- Семантическом дрейфе — если оптимизированная версия принципиально меняет назначение
- Явной команде пользователя остановить процесс

### 4.5. Изменение числа раундов

По умолчанию: 3 раунда. Диапазон: 1–5 раундов.

Через аргументы команды (без изменения конфигурации):

```
/bto-optimize .claude/skills/my-skill/ rounds 5
```

Для изменения числа раундов по умолчанию отредактируйте `.claude/skills/bto/modules/optimize.md`:

```markdown
## Input
- **Rounds:** Number of optimization rounds (default: 3, max: 5)
```

Измените значение `default: 3` на нужное.

### 4.6. Фокусировка на конкретном измерении

При явном указании целевого измерения три из пяти вариантов Round 1 нацелены на соответствующие стратегии:

```
/bto-optimize .claude/skills/my-skill/ ROBUSTNESS
```

Распределение вариантов при фокусе на ROBUSTNESS:
- Variant 1: Add Constraints (primary strategy)
- Variant 2: Specialize (secondary strategy)
- Variant 3: Add Constraints (repeat with different approach)
- Variant 4: Rephrase (general improvement)
- Variant 5: Restructure (general improvement)

### 4.7. Бэкап перед оптимизацией

OPTIMIZE автоматически создаёт резервную копию перед перезаписью:

```
.claude/skills/my-skill/SKILL.md                  ← обновлённая версия
.claude/skills/my-skill/SKILL.md.pre-optimize.bak ← резервная копия
```

Для отката используйте команду `откат` в checkpoint или восстановите вручную:

```bash
cp .claude/skills/my-skill/SKILL.md.pre-optimize.bak .claude/skills/my-skill/SKILL.md
```

---

## 5. Управление модельным бюджетом

### 5.1. Стандартное распределение моделей

BTO использует три модели с чёткой иерархией применения:

| Модель | Использование | Обоснование |
|--------|--------------|-------------|
| **haiku** | Layer 0 pre-checks, Layer 1 quick eval, Round 1-2 variant evaluation | Высокочастотные операции; достаточная точность для ранжирования |
| **sonnet** | Layer 2 judge panel (все 3 судьи), mutation workers, meta-judge (escalation) | Требует рассуждений и доменной экспертизы |
| **opus** | Crossover/creative synthesis, variant generation, DEEP mode clarification | Creативная работа; используется только на топ-N кандидатах |

**Правило эскалации:** Никогда не использовать более дорогую модель там, где менее дорогая справляется достаточно хорошо. Haiku не подходит для судейства Layer 2 — требует nuanced reasoning. Opus не нужен для strukturных проверок.

### 5.2. Бюджет токенов по операциям

| Операция | Модель | Est. токены | Количество вызовов |
|----------|--------|-------------|-------------------|
| Baseline Layer 2 eval | sonnet | ~5K/судья | 3 |
| Variant generation (Round 1) | opus | ~5K/вариант | 5 |
| Round 1 evaluation | haiku | ~2K/вариант | 5 |
| Crossover generation | opus | ~5K/вариант | 3 |
| Round 2 evaluation | haiku | ~2K/вариант | 3 |
| Crossover generation | opus | ~5K/вариант | 3 |
| Round 3 evaluation | sonnet | ~5K/вариант | 9 |
| **Итого полный OPTIMIZE** | | **~131K** | |

Для отдельного `/bto-test` Layer 2: ~15–20K токенов (3 вызова sonnet).

### 5.3. Стратегии снижения затрат

**Стратегия 1: Layer 1 вместо Layer 2 для итерационной разработки**

При активной разработке скилла запускайте только Layer 1 (haiku) для быстрой обратной связи. Layer 2 используйте только при финальной оценке перед деплоем.

```
/bto-test .claude/skills/my-skill/     ← Layer 0 + Layer 1, предложит Layer 2
/bto-test .claude/skills/my-skill/ full ← принудительно Layer 0 + Layer 1 + Layer 2
```

**Стратегия 2: Оптимизация только при необходимости**

OPTIMIZE запускается автоматически только если baseline < 8.0. Если ваши артефакты стабильно получают 7.5+, рассмотрите повышение порога до 7.5 в `bto-optimize.md`:

```markdown
**Early exit condition:**
If `BASELINE_SCORE` ≥ 8.0 → report "Artifact already high quality"
```

Измените `≥ 8.0` на `≥ 7.5`.

**Стратегия 3: Сокращение числа раундов оптимизации**

Для большинства артефактов 2 раунда дают 80% от прироста качества 3 раундов:

```
/bto-optimize .claude/skills/my-skill/ rounds 2
```

**Стратегия 4: Batch-оценка через Layer 1**

При оценке большого числа артефактов (например, все скиллы проекта) используйте только Layer 1 для ранжирования, затем проводите Layer 2 только для топ-3:

```
# Оценить все скиллы через Layer 1
/bto-test .claude/skills/skill-a/
/bto-test .claude/skills/skill-b/
/bto-test .claude/skills/skill-c/

# Layer 2 только для самого важного
/bto-test .claude/skills/skill-a/ full
```

### 5.4. Мониторинг потребления токенов

Claude Code не предоставляет прямой API для просмотра потребления токенов в сессии. Для оценки:

1. Используйте [console.anthropic.com](https://console.anthropic.com) → Usage
2. Фильтруйте по дате и сравнивайте с запусками BTO
3. Для детального трекинга введите соглашение по именованию сессий в вашем workflow

---

## 6. Создание пользовательских рубрик

### 6.1. Зачем нужны пользовательские рубрики

Стандартные рубрики BTO (`judge-rubrics.md`) универсальны и работают для любых артефактов. Пользовательские рубрики добавляют доменную специфику: например, для банковского домена важна соответствие ФЗ-152 и ЦБ, для ритейла — latency-требования и A/B тестирование.

### 6.2. Создание рубрики

Создайте файл в `.claude/skills/bto/references/`:

```
.claude/skills/bto/references/custom-banking-rubrics.md
```

Структура рубрики:

```markdown
# Рубрика оценки: Банковский домен

## Назначение

Дополнительные критерии оценки для артефактов банковского и финтех домена.
Используется судьями Layer 2 совместно с базовыми рубриками.

## Дополнительные критерии по измерению CORRECTNESS

При оценке CORRECTNESS для банковских артефактов снижайте балл если:
- Нет упоминания ФЗ-152 (персональные данные)
- Нет требования on-premise развёртывания LLM
- Нет HITL для решений, влияющих на клиента
- Нет упоминания ФСТЭК при работе с критической инфраструктурой

## Дополнительные критерии по измерению ROBUSTNESS

Снижайте балл ROBUSTNESS если:
- Нет описания fallback при недоступности LLM
- Нет SLA-требований
- Нет упоминания аудит-лога для регуляторной отчётности

## Якорные точки (anchor points) для банковского домена

- 9-10: Полное соответствие регуляторным требованиям, HITL, on-premise, аудит-лог
- 7-8: Базовое соответствие, указание на ключевые требования
- 5-6: Упоминает регулирование, но без конкретики
- 3-4: Игнорирует регуляторный контекст
- 1-2: Предлагает облачные решения без обоснования для критических данных
```

### 6.3. Подключение рубрики к судьям

Для применения пользовательской рубрики в конкретной оценке добавьте ссылку в агент-конфиг или явно укажите в промпте команды:

**Временно (в конкретном вызове):**

```
/bto-test .claude/skills/my-banking-skill/ full
```

Добавьте в свой запрос контекст: "Используй рубрики из .claude/skills/bto/references/custom-banking-rubrics.md при оценке."

**Постоянно (для всех оценок скиллов банковского домена):**

Создайте специализированный агент-конфиг:

```
.claude/agents/bto-judge-banking-expert.md
```

```markdown
# BTO Judge — Banking Domain Expert

## Purpose
Evaluate Claude Code artifacts for banking/fintech domain quality,
including regulatory compliance (ФЗ-152, ЦБ, ФСТЭК) and security requirements.

## Configuration
- Model: sonnet
- Isolation: reads artifact + judge-rubrics.md + custom-banking-rubrics.md
- Role: domain expert with regulatory focus

## Additional References
Read .claude/skills/bto/references/custom-banking-rubrics.md
Apply banking-specific criteria in addition to standard rubrics.
```

### 6.4. Рубрики по домену: шаблоны

**Шаблон для ритейл/e-commerce:**

```markdown
# Рубрика оценки: Ритейл / E-commerce домен

## CORRECTNESS (снижать если):
- Latency не упомянута для real-time операций (< 200ms)
- Нет механизма A/B тестирования для рекомендаций
- Персонализация без адресации privacy/GDPR

## ROBUSTNESS (снижать если):
- Нет обработки cold-start проблемы
- Нет сезонного контекста (пиковые нагрузки)
- Нет деградированного режима при отказе рекомендательной системы
```

**Шаблон для enterprise/B2B:**

```markdown
# Рубрика оценки: Enterprise / B2B домен

## CORRECTNESS (снижать если):
- Нет плана Change Management (люди сопротивляются AI)
- ROI выражен в процентах, а не в FTE/часах
- Нет стратегии интеграции с legacy-системами

## METHODOLOGY (снижать если):
- Нет SLA и fault tolerance требований
- Нет плана поэтапного rollout
```

---

## 7. Мониторинг качества оценки

### 7.1. Признаки здоровой оценки

Здоровый BTO-процесс характеризуется:

| Метрика | Здоровое значение | Тревожный сигнал |
|---------|------------------|------------------|
| Layer 0 pass rate | > 90% для зрелых артефактов | < 70% — системная проблема с генерацией |
| Layer 1 средний балл | 6.5–8.5 | > 9.0 — score inflation; < 5.0 — generation failure |
| Разброс судей Layer 2 | max-min < 2 для большинства | > 3 на > 2 измерениях — калибровка нужна |
| OPTIMIZE delta per round | 0.5–1.5 | > 2.0 — подозрительный скачок; < 0.3 — преждевременная сходимость |
| Частота активации мета-судьи | < 20% оценок | > 40% — системное расхождение судей |

### 7.2. Ведение журнала оценок

Для отслеживания качества оценок во времени рекомендуется сохранять результаты оценок:

```bash
# Создайте директорию для логов оценок
mkdir -p .bto-logs/

# После каждого /bto-test сохраняйте вывод
# (Можно делать вручную или через Claude Code в конце сессии)
```

Структура лога оценки:

```markdown
## Evaluation Log Entry

Date: 2026-03-01
Artifact: .claude/skills/my-skill/SKILL.md
Layer: 2
Overall: 7.4

Dimension Scores:
  Expert: METHODOLOGY 7, DEPTH 6, CORRECTNESS 8, USABILITY 7, ROBUSTNESS 6
  Critic: METHODOLOGY 6, DEPTH 5, CORRECTNESS 7, USABILITY 6, ROBUSTNESS 5
  Auditor: METHODOLOGY 8, DEPTH 7, CORRECTNESS 8, USABILITY 7, ROBUSTNESS 6

Disagreements: DEPTH (range: 2), ROBUSTNESS (range: 1)
Meta-judge triggered: No

Action taken: Ran /bto-optimize with focus DEPTH
Post-optimize score: 8.1
```

### 7.3. Паттерны деградации оценки

**Score inflation (раздувание баллов):**

Все судьи стабильно выдают > 8.5 с первой попытки. Особенно характерно при оценке haiku (Layer 1) артефактов, содержащих знакомые паттерны.

Диагностика:
- Запустите Layer 2 на заведомо среднем артефакте — ожидаемый балл Critic: 5-6
- Если Critic выдаёт 8-9 — нужна перекалибровка

Исправление:
- Добавьте в промпт Critic явную инструкцию: "Your average score across all dimensions should be in the 5-6 range. Score 8+ only for genuinely exceptional quality."
- Отредактируйте `.claude/agents/bto-judge-critic.md`, усилив секцию Scoring Calibration

**Конформизм (conformity collapse):**

Судьи сходятся к идентичным баллам уже после 1 раунда. Теряется ценность разнообразных перспектив.

Диагностика:
- Standard deviation баллов судей < 0.5 на всех измерениях

Исправление:
- Убедитесь, что агенты запущены в полной изоляции (никакого контекста других судей)
- Рандомизируйте порядок запуска агентов
- Добавьте в промпт каждого судьи: "Do not converge to a consensus — your independent perspective is the entire point."

### 7.4. Калибровочный тест

Для проверки корректности работы панели судей используйте эталонный артефакт — заведомо хороший и заведомо плохой:

**Эталон "хорошего" артефакта** — это сам BTO SKILL.md. Ожидаемые баллы Layer 2:
- Domain Expert: 8.0–9.0
- Critic: 7.0–8.0
- Auditor: 8.5–9.5

**Эталон "плохого" артефакта** — создайте специальный тест-файл:

```bash
cat > /tmp/bad-artifact-test.md << 'EOF'
# Skill

## Overview
This skill does things.

## Protocol
Do the thing.
EOF
```

Ожидаемые баллы Layer 2 для этого артефакта:
- Domain Expert: 2.0–3.0
- Critic: 1.0–2.0
- Auditor: 2.0–3.0

Если реальные баллы значительно отклоняются от ожидаемых — калибровка судей нужна.

---

## 8. Обнаружение и устранение анти-паттернов

### 8.1. Полный реестр BTO анти-паттернов

| Анти-паттерн | Сигнал обнаружения | Требуемое исправление |
|-------------|-------------------|-----------------------|
| **Score inflation** | Все судьи выставляют > 8.5 при первой попытке | Добавить калибровочный промпт в критиков |
| **Overfitting to rubric** | Артефакт содержит почти дословные фразы из рубрики | Blind evaluation: скрыть рубрику от генератора |
| **Conformity collapse** | Судьи сходятся к идентичным баллам | Принудить изоляцию, рандомизировать порядок |
| **Runaway optimization** | > 10 итераций без сходимости | Прервать, залогировать, human review |
| **Phantom improvement** | Delta > 0.5, но содержательных изменений нет | Diff-проверка контента, не только баллов |
| **Judge-generator collusion** | Одна модель используется для генерации и для оценки | BLOCK — модели генератора и судьи должны отличаться |
| **Missing rejection log** | Провалившиеся артефакты молча отбрасываются | Каждый rejection логировать с причиной |

### 8.2. Judge-generator collusion (наиболее критичный)

Этот анти-паттерн возникает, когда одна и та же модель генерирует артефакт и оценивает его. Модель будет систематически завышать оценки своих собственных генераций.

**Стандартное разделение BTO:**

| Операция | Модель |
|---------|--------|
| BUILD generation | opus |
| Layer 1 judge | haiku |
| Layer 2 judges | sonnet |
| OPTIMIZE variant generation | opus |
| OPTIMIZE Layer 1 eval | haiku |
| OPTIMIZE Layer 2 final eval | sonnet |

Генератор (opus) никогда не является судьёй. Судьи (haiku, sonnet) никогда не генерируют артефакты.

Если вы изменяете модели для экономии токенов — убедитесь, что это разделение сохраняется.

### 8.3. Overfitting to rubric

**Симптом:** Артефакт высоко оценивается судьями, но не работает как задумано в реальном использовании. Контент выглядит "написанным для оценщика", а не для реального потребителя.

**Выявление:**
- Сравните артефакт с реальным user journey — помогает ли он на каждом шаге?
- Проведите "слепую" оценку: уберите рубрику из контекста судьи при одном из раундов

**Исправление:**

Добавьте в промпт судьи секцию:

```
IMPORTANT: Do not score based on whether the artifact MENTIONS concepts from
evaluation rubrics. Score based on whether a real user could successfully
accomplish their goal using this artifact as their sole guide.
```

### 8.4. Phantom improvement

**Симптом:** Раунд оптимизации показывает delta > 0.5, но при ручном сравнении артефактов изменения косметические (перефразирование без добавления смысла).

**Выявление через diff:**

```bash
diff .claude/skills/my-skill/SKILL.md .claude/skills/my-skill/SKILL.md.pre-optimize.bak
```

Если diff показывает только пересловение без новых секций, примеров или ограничений — это phantom improvement.

**Исправление:**

Добавьте в промпт мутации:

```
Changes MUST be substantive — add new content, examples, constraints, or restructure
meaningfully. Do not merely rephrase existing sentences.
Minimum: add at least one concrete example or one new edge case.
```

### 8.5. Автоматическое обнаружение (self-check)

Правило `bto-quality-gates.md` загружается Claude Code автоматически из `.claude/rules/`. Это означает, что Claude Code будет применять BTO anti-pattern checks ко ВСЕМ генерируемым артефактам — не только при явном вызове BTO команд.

Для проверки, что правило загружено:

Файл `.claude/rules/bto-quality-gates.md` должен существовать (проверяется через `doctor`). При обнаружении анти-паттерна Claude Code автоматически флагирует его и останавливает процесс.

---

## 9. Бэкап и восстановление

### 9.1. Автоматические бэкапы OPTIMIZE

Каждый запуск `/bto-optimize` автоматически создаёт резервную копию перед перезаписью:

```
Оригинал:   .claude/skills/my-skill/SKILL.md
Резервная:  .claude/skills/my-skill/SKILL.md.pre-optimize.bak
```

Для восстановления вручную:

```bash
cp .claude/skills/my-skill/SKILL.md.pre-optimize.bak .claude/skills/my-skill/SKILL.md
```

Или через Claude Code:

```
откат
```

(эта команда доступна в checkpoint после OPTIMIZE)

### 9.2. Ручной бэкап перед массовыми изменениями

Перед операциями, которые изменяют несколько файлов (update, force-init, массовая оптимизация):

```bash
# Зафиксировать текущее состояние в git
git add .claude/ .bto-skills.json
git commit -m "snapshot before bto update $(date +%Y-%m-%d)"

# Или создать архив
tar -czf bto-backup-$(date +%Y%m%d).tar.gz .claude/skills/bto/ .claude/commands/bto*.md .claude/rules/bto-*.md .claude/agents/bto-*.md .bto-skills.json
```

### 9.3. Восстановление через update

Если какие-либо файлы BTO были случайно изменены или удалены:

```bash
# Вариант 1: обновление вернёт файлы из последней версии пакета
npx @dzhechkov/skills-bto update

# Вариант 2: принудительная переустановка
npx @dzhechkov/skills-bto init --force
```

`update` обновляет только файлы BTO, не затрагивая Keysarium-файлы в тех же директориях.

### 9.4. Восстановление из git

При наличии git-репозитория:

```bash
# Проверить историю изменений конкретного файла
git log --oneline -- .claude/skills/bto/SKILL.md

# Восстановить версию на конкретную дату
git checkout "2026-02-15" -- .claude/skills/bto/SKILL.md

# Или из конкретного коммита
git checkout abc1234 -- .claude/skills/bto/

# Проверить, что восстановлено корректно
npx @dzhechkov/skills-bto doctor
```

### 9.5. Манифест как инвентаризация

Файл `.bto-skills.json` является полным списком файлов BTO. Используйте его для аудита:

```bash
# Просмотр манифеста
cat .bto-skills.json

# Проверить наличие всех файлов из манифеста
npx @dzhechkov/skills-bto doctor
```

Структура манифеста:

```json
{
  "version": "1.0.0",
  "installedAt": "2026-03-01T12:00:00.000Z",
  "components": ["skill", "commands", "rules", "agents"],
  "files": [
    ".claude/skills/bto/SKILL.md",
    ".claude/skills/bto/modules/build.md",
    ".claude/skills/bto/modules/test.md",
    ".claude/skills/bto/modules/optimize.md",
    ".claude/skills/bto/references/judge-rubrics.md",
    ".claude/commands/bto.md",
    ".claude/commands/bto-build.md",
    ".claude/commands/bto-test.md",
    ".claude/commands/bto-optimize.md",
    ".claude/rules/bto-quality-gates.md",
    ".claude/agents/bto-judge-expert.md",
    ".claude/agents/bto-judge-critic.md",
    ".claude/agents/bto-judge-auditor.md"
  ]
}
```

### 9.6. Многопользовательская среда

При работе нескольких разработчиков с одним репозиторием:

**Рекомендуемый подход:** Зафиксируйте все файлы `.claude/` в git, включая BTO-компоненты. Это гарантирует, что все разработчики работают с одинаковыми версиями скиллов и правил.

```bash
# Добавьте .claude/ в отслеживаемые файлы
echo "!.claude/" >> .gitignore  # убрать из исключений, если он там

# Зафиксировать базовую установку
git add .claude/ .bto-skills.json
git commit -m "add @dzhechkov/skills-bto v1.0.0"
```

**Обновление в команде:**

При обновлении пакета один разработчик запускает `update`, фиксирует изменения и пушит. Остальные делают `git pull`:

```bash
# Администратор:
npx @dzhechkov/skills-bto update
git add .claude/ .bto-skills.json
git commit -m "update @dzhechkov/skills-bto to v1.x.x"
git push

# Остальные разработчики:
git pull
npx @dzhechkov/skills-bto doctor  # проверить здоровье после pull
```
