# Product Keysarium 2026 — Мастер-репозиторий для AI-исследований

## Назначение

Этот репозиторий — мастер-хаб для проведения исследований AI-кейсов на Кейсариумах и хакатонах. Содержит пайплайн из 7 фаз для полной проработки кейса от анализа проблемы до финальной презентации.

## Быстрый старт

```
/casarium [текст кейса]            — Полный пайплайн (7 фаз)
/casarium --ai-factory [текст]      — Пайплайн + маппинг на Cloud.ru AI Factory (все фазы)
/new-research [название]            — Создать новое исследование
/parallel-research кейс1 | кейс2   — Запустить несколько параллельно
/harvest [путь или "all"]           — Извлечь знания после проекта
/brain-export [путь или "all"]      — Экспорт знаний в portable JSON
/brain-import [путь к JSON]         — Импорт знаний из другого проекта

/init-platform --platform <name>    — Генерация конфигов для Cursor/OpenCode/Copilot

/workers start <type>              — Запуск фонового воркера (consolidate, export-brain, health-check, dream-cycle)
/workers status                    — Статус активных воркеров
/workers stop <id>                 — Остановка воркера
/workers list                      — Список доступных типов воркеров

/dream run                         — Запуск dream cycle (анализ паттернов)
/dream insights                    — Показать последние инсайты
/dream status                      — Состояние триггеров dream cycle
/dream clear                       — Очистить старые инсайты (оставить 10)

/feature-adr [описание фичи]       — Adaptive Feature Development (9 шагов, S/M/L/XL)

/analyst-manual [тема/задача]       — Стратегический анализ с checkpoint'ами (explore → research → solve)

/learning-stats [--domain X] [--phase N] — Reward learning аналитика
```

> Это ВСЕ команды, которые ставит этот пакет (19 файлов в `.claude/commands/`).
> Оценка и оптимизация скиллов (BTO) — отдельный пакет, слэш-команд здесь нет:
> `npx @dzhechkov/skills-bto init`

## Структура проекта

```
<ваш-проект>/
├── CLAUDE.md                       ← Этот файл (мастер-инструкции)
├── TOOLKIT_HARVEST.md              ← Трекер знаний для извлечения
├── .claude/
│   ├── commands/                   ← Slash-команды (пайплайн)
│   │   ├── casarium.md             ← /casarium — полный пайплайн (+ --ai-factory флаг)
│   │   ├── new-research.md         ← /new-research — новое исследование
│   │   ├── parallel-research.md    ← /parallel-research — параллельные кейсы
│   │   ├── discovery.md            ← /discovery — Phase 0
│   │   ├── explore-case.md         ← /explore-case — Phase 1
│   │   ├── research.md             ← /research — Phase 2
│   │   ├── cjm-prototype.md        ← /cjm-prototype — Phase 2.5 ⭐
│   │   ├── solve.md                ← /solve — Phase 3
│   │   ├── architecture-phase.md   ← /architecture-phase — Phase 4
│   │   ├── presentation.md         ← /presentation — Phase 5
│   │   ├── harvest.md              ← /harvest — извлечение знаний
│   │   ├── brain-export.md         ← /brain-export — экспорт portable brain
│   │   ├── brain-import.md         ← /brain-import — импорт знаний
│   │   ├── feature-adr.md          ← /feature-adr — adaptive feature development
│   │   ├── analyst-manual.md       ← /analyst-manual — стратегический анализ
│   │   ├── init-platform.md        ← /init-platform — мульти-платформенная генерация
│   │   ├── learning-stats.md       ← /learning-stats — reward learning аналитика
│   │   ├── workers.md              ← /workers — управление фоновыми воркерами
│   │   └── dream.md                ← /dream — dream cycles (анализ паттернов)
│   ├── shards/                     ← Governance shards (per-phase rules)
│   │   ├── phase-0-discovery.shard.md
│   │   ├── phase-1-explore.shard.md
│   │   ├── phase-2-research.shard.md
│   │   ├── phase-25-cjm.shard.md
│   │   ├── phase-3-solve.shard.md
│   │   ├── phase-4-architecture.shard.md
│   │   ├── phase-5-presentation.shard.md
│   │   ├── phase-ai-factory.shard.md  ← AI Factory mode (только при --ai-factory)
│   │   └── feature-adr.shard.md
│   └── skills/                     ← Навыки (building blocks)
│       ├── explore/                ← Адаптивная кларификация задач
│       ├── frontend-design/        ← Дизайн фронтенда
│       ├── goap-research-ed25519/  ← GOAP research + crypto verification
│       ├── presentation-storyteller/ ← Презентации со storytelling
│       ├── problem-solver-enhanced/  ← Решение проблем (TRIZ + Game Theory)
│       ├── reverse-engineering-unicorn/ ← Reverse engineering компаний
│       ├── feature-adr/            ← Adaptive feature development (9 steps, S/M/L/XL)
│       ├── knowledge-extractor/   ← Knowledge harvesting (5 agents, 7 categories, 8 gates)
│       ├── analyst-manual-full/  ← Композитный аналитик (explore + research + solve, manual checkpoints)
│       ├── edu-site-generator/   ← Gamified educational SPA из документации
│       ├── transcript-site-generator/ ← Транскрипт → интерактивный static site
│       └── ai-factory-mapper/    ← Маппинг сценариев на Cloud.ru Evolution AI Factory (v1.0)
├── lib/                            ← Библиотечные модули
│   ├── phase-utils.md              ← Утилиты фаз
│   ├── agent-patterns.md           ← Паттерны agent swarm
│   ├── skill-loader.md             ← Загрузка скиллов
│   ├── domain-templates.md         ← Доменные шаблоны
│   ├── background-workers.md       ← Протокол фоновых воркеров
│   ├── memory-protocol.md          ← Протокол memory_query / memory_store
│   ├── reward-tracker.md           ← Аналитика и обнаружение паттернов
│   ├── dream-engine.md             ← DreamEngine: concept graph + insight generation
│   ├── witness-chain.md            ← Witness chain (tamper-evidence)
│   ├── judge-attestation.md        ← Аттестация судей
│   ├── platform-adapters.md        ← Реестр платформенных адаптеров
│   ├── platform-templates/         ← Шаблоны для генерации конфигов
│   │   ├── cursor.md               ← Cursor (.cursorrules)
│   │   ├── opencode.md             ← OpenCode (.opencode/)
│   │   └── copilot.md              ← GitHub Copilot (.github/copilot-instructions.md)
│   └── worker-templates/           ← Шаблоны инструкций для воркеров
│       ├── consolidate.md           ← Консолидация паттернов
│       ├── health-check.md          ← Проверка здоровья системы
│       ├── brain-export.md          ← Фоновый экспорт brain
│       └── dream-cycle.md           ← Dream cycle воркер (concept graph + insights)
├── features/                       ← Директории фич (/feature-adr output)
│   └── [feature-slug]/             ← Каждая фича изолирована
└── researches/                     ← Директории исследований
    └── [case-slug]/                ← Каждое исследование изолировано
```

## Пайплайн фаз

```
Phase 0     Phase 1     Phase 2     Phase 2.5 ⭐    Phase 3     Phase 4         Phase 5       Phase 6
DISCOVERY → EXPLORE  → RESEARCH → CJM PROTO    → SOLVE    → ARCHITECTURE → PRESENTATION → PACKAGING
   15%        5%         15%         10%            15%         15%              20%          Buffer 5%
```

| Фаза | Команда | Скилл | Артефакт |
|------|---------|-------|----------|
| Phase 0 | `/discovery` | reverse-engineering-unicorn | 00_product_discovery.md |
| Phase 1 | `/explore-case` | explore | 01_case_brief.md |
| Phase 2 | `/research` | goap-research-ed25519 | 02_research_findings.md |
| Phase 2.5 | `/cjm-prototype` | reverse-engineering-unicorn + frontend-design | 02.5_trend_brief.md, prototype/cjm-prototype.jsx |
| Phase 3 | `/solve` | problem-solver-enhanced | 03_solution_strategy.md, diagrams/process-*.mermaid |
| Phase 4 | `/architecture-phase` | (встроенный) | 04_architecture.md, diagrams/*.mermaid |
| Phase 5 | `/presentation` | presentation-storyteller | 05-08_*.md |
| Phase 6 | (автоматически) | — | README.md, zip-архив |

## Agent Swarm Strategy

Для ускорения работы используй Agent tool для параллелизации:

### Внутри фаз (micro-parallelism):
- **Phase 0:** 2 агента — JTBD анализ || Конкуренты + ROI
- **Phase 2:** 3 агента — Аналоги || Технологии || Регуляторика
- **Phase 2.5:** 3 агента — Variant A || Variant B+C || Trend Research (D)
- **Phase 5:** 3 агента — Презентация || Speaker Script || Q&A + Executive Summary

### Между исследованиями (macro-parallelism):
- `/parallel-research` запускает Phase 0 для нескольких кейсов параллельно
- Каждое исследование изолировано в `researches/<slug>/`

## Критические правила

1. **Файлы создаются в момент фазы**, не в Phase 6
2. **Phase 2.5 (CJM Prototype) — НИКОГДА НЕ ПРОПУСКАТЬ**
3. **08_executive_summary.md — ОБЯЗАТЕЛЕН**
4. **Research в PARANOID mode** — ноль непроверенных утверждений
5. **{CHOSEN_CJM} передаётся** из Phase 2.5 в Phase 3-5
6. **Checkpoint после каждой фазы** — ждём "ок" от пользователя + `<promise>` тег
7. **Всё в researches/<slug>/** — не засоряем корень
8. **Governance shards** — каждая фаза загружает свой shard из `.claude/shards/`
9. **Model routing** — haiku для Layer 0-1, sonnet для research/judges, opus для creative work
10. **Trust tiers** — скиллы классифицированы (Tier 0-3); повышение требует оценки из отдельного пакета `@dzhechkov/skills-bto` (в этом пакете команд `/bto*` нет)
11. **`--ai-factory` флаг полностью аддитивен** — без флага поведение идентично предыдущим версиям; с флагом — маппинг на Cloud.ru AI Factory интегрируется во все фазы через `phase-ai-factory.shard.md`

## Governance System

### Shards
Каждая фаза загружает свой governance shard из `.claude/shards/`:
- Shard содержит: time budget, skill to load, prerequisites, quality gates, promise tag
- Решает проблему context drift при длинных сессиях
- Агент перечитывает shard перед началом работы фазы

### Semantic Completion Promises
Каждый checkpoint включает `<promise>` тег:
- `DISCOVERY_COMPLETE`, `CASE_EXPLORED`, `RESEARCH_PARANOID_PASSED`
- `CJM_VALIDATED`, `SOLUTION_DESIGNED`, `ARCHITECTURE_DEFINED`, `PRESENTATION_READY`
- Downstream фазы проверяют upstream promises перед стартом

### Trust Tiers
| Tier | Label | Требования |
|------|-------|-----------|
| 3 | Verified | Eval test suites + deterministic validation |
| 2 | Validated | BTO-оценка (пакет `@dzhechkov/skills-bto`): Layer 2 score >= 7.0 |
| 1 | Structured | SKILL.md + references/ or modules/ |
| 0 | Advisory | Только SKILL.md |

### Cross-Phase Feedback Loops
6 именованных loops формализуют передачу данных между фазами.
См. `.claude/rules/feedback-loops.md` для Variable Registry.

## Portable Brain (v1.1)

```
/brain-export [путь или "all"]               — Экспорт знаний в JSON контейнер (v1.1 с manifest)
/brain-export --delta <parent-brain.json>     — Дельта-экспорт (COW, JSON Patch RFC 6902)
/brain-import [файл.json]                     — Импорт знаний из другого проекта
```

Brain container v1.1 включает: SHA-256 manifest с checksum, skill metadata, domain patterns,
research summaries, harvest patterns, pipeline metrics, reward data.
Selective import с merge-not-overwrite стратегией. Backward compatible с v1.0.

**v1.1 features:** Integrity manifest, delta exports (COW branching), 2-tier memory index,
HOT/WARM/COLD/PURGE record lifecycle.

## keysarium-core — Shared Framework Package

`@dzhechkov/keysarium-core` — домен-агностичный фреймворк для multi-agent пайплайнов. Содержит протоколы, которые используются и в Keysarium, и в BTO, и могут быть использованы любой командой для создания собственного пайплайна.

### Архитектура 4 пакетов

```
            @dzhechkov/keysarium-core              ← Общий фреймворк
                ^         ^         ^
                |         |         |
           peerDep    peerDep   peerDep
                |         |         |
@dzhechkov/keysarium  skills-bto  skills-feature-adr
  (исследования)       (оценка)    (фичи)
```

### Модули core

| Модуль | Файлы | Назначение |
|--------|-------|-----------|
| governance/ | 3 | Constitution, shard protocol, checkpoint/promise protocol |
| memory/ (v1.1) | 3 | memory_query/store, reward tracking, dream engine, **2-tier index, COW branching, record lifecycle** |
| orchestration/ | 4 | Queen protocol, 6 topologies, workers, model routing |
| verification/ | 3 | Witness chain, judge attestation, audit trail |
| trust-tiers/ | 2 | 4-tier classification, promotion protocol |
| platform/ | 4 | Adapter registry + templates (Cursor, OpenCode, Copilot) |

### Связь с существующими файлами

Core — это cleanroom-экстракция из `lib/` и `.claude/rules/`. Оригинальные файлы остаются как Keysarium-специфичные референсы. Core-версии обобщены и не содержат Keysarium-специфичной терминологии.

## Domain Templates

### Банковский домен
- ФЗ-152, ЦБ, ФСТЭК → on-premise LLM (GigaChat, YandexGPT, open-source)
- HITL обязателен (регуляторные риски)
- Палитра: Blue/Navy/Silver

### Ритейл / E-commerce
- Latency < 200ms, A/B тестирование, персонализация vs Privacy
- Палитра: Amber/Orange

### Enterprise / B2B
- Change Management, Legacy интеграции, SLA, ROI в FTE/часах
- Палитра: Teal/Indigo

## Ритуал извлечения знаний (Harvest)

После завершения каждого исследования:
1. Запусти `/harvest researches/<slug>/`
2. 5 параллельных агентов-экстракторов сканируют проект через разные линзы
3. Классифицирует: skills / commands / hooks / rules / templates / patterns / snippets (7 категорий)
4. Пользователь ревьюит нумерованный список находок с гранулярным контролем (#N команды)
5. 8 блокирующих quality gates (2-pass: deterministic + semantic)
6. Автоматическое размещение артефактов + обновление TOOLKIT_HARVEST.md

Для массового harvest: `/harvest all`
Для фильтрации: `/harvest path/ only patterns,rules`

## Скиллы: как они работают

Скиллы хранятся в `.claude/skills/` и загружаются фазами через чтение SKILL.md. Каждый скилл — self-contained набор инструкций и reference-материалов.

### Граф зависимостей скиллов

```
reverse-engineering-unicorn (оркестратор)
  ├── explore (кларификация)
  ├── goap-research-ed25519 (research + verification)
  ├── problem-solver-enhanced (TRIZ + Game Theory)
  ├── frontend-design (UI прототипов)
  └── presentation-storyteller
        ├── explore
        └── goap-research-ed25519

feature-adr (Adaptive Feature Development)
  ├── explore (кларификация требований)
  ├── problem-solver-enhanced (trade-off анализ для ADR)
  ├── frontend-design (UI реализация, если есть)
  ├── modules/00-08 (9 шагов pipeline)
  └── references/ (ADR template, C4 template, QE checklist)

knowledge-extractor (извлечение знаний)
  ├── modules/01-extract (5 parallel extractor agents, sonnet)
  ├── modules/02-classify (7-category classification + dedup)
  ├── modules/03-gate (8 quality gates, 2-pass: deterministic + haiku)
  ├── modules/04-integrate (auto-placement + harvest report)
  ├── references/ (quality-gates, artifact-categories, maturity-model)
  └── templates/ (artifact-card, harvest-report)
```

## BTO — Build-Benchmark-Test-Optimize (ОТДЕЛЬНЫЙ ПАКЕТ)

Система мульти-агентной оценки и оптимизации скиллов/команд (4-module pipeline).

**Этот пакет её НЕ ставит.** Ни скилла `bto/`, ни команд `/bto*` в установке Keysarium нет —
их поставляет `@dzhechkov/skills-bto`. Раздел ниже оставлен как справка: он описывает, что вы
получите, если поставите тот пакет (см. «Standalone пакет» в конце раздела).

### Архитектура оценки (TEST)

| Layer | Агенты | Модель | Назначение |
|-------|--------|--------|------------|
| Layer 0 | 0 | — | Детерминистические пре-чеки (71 проверка) |
| Benchmark | 3 (B2) | haiku | Golden samples + тесты + consistency + performance |
| Layer 1 | 1 | haiku | Быстрая оценка по 5 измерениям |
| Layer 2 | 3 | sonnet | Полная панель: Expert + Critic + Auditor |
| Meta | 1 | opus | Разрешение разногласий (если delta > 3) |

### Standalone пакет

```bash
npx @dzhechkov/skills-bto init    # Установить BTO в любой проект
npx @dzhechkov/skills-bto doctor  # Проверить здоровье установки
```

## Feature ADR — Adaptive Feature Development

9-шаговый pipeline для разработки фич любой сложности с Complexity Router.

```
/feature-adr [описание фичи]  — Полный адаптивный pipeline (9 шагов)
```

### Complexity Tiers

| Tier | Scope | Active Steps |
|------|-------|-------------|
| **S** | 1-3 файла, 1 домен | 0→1→6→7→8 |
| **M** | 4-10 файлов, 1-2 домена | 0→1→3→5→6→7→8 |
| **L** | 11-30 файлов, 2-4 домена | Полный pipeline с параллелизмом |
| **XL** | 30+ файлов, cross-cutting | Полный DAG + multi-agent swarm |

### Pipeline шагов

| Step | Name | Tiers | Модель |
|------|------|-------|--------|
| 0 | Complexity Router | All | haiku |
| 1 | Requirements | All | sonnet |
| 2 | Research | L/XL | sonnet |
| 3 | ADR | M+ | opus |
| 4 | DDD | L/XL | opus |
| 5 | Architecture | M+ | opus |
| 6 | Implementation Plan | All | sonnet |
| 7 | Code | All | opus |
| 8 | QE | All | sonnet |

Артефакты: `features/<feature-slug>/` (не в корне, не в researches/)

## Anti-Patterns

| Anti-Pattern | Что делать |
|-------------|------------|
| «Засунем GPT и всё заработает» | Конкретные модели + pipeline |
| Игнорировать ограничения | Явно адресовать каждое |
| Слишком сложная архитектура | MVP-first |
| Нет метрик | Конкретные KPI + baseline |
| Читать со слайдов | Storytelling + визуалы |
| Нет Human-in-the-Loop | Чёткая escalation policy |
| Общие фразы без цифр | «Сократим с 4 ч до 15 мин» |
