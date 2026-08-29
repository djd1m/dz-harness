# Keysarium — AI-исследовательский тулкит

**7-фазный pipeline** для проведения AI-исследований на кейсариумах, хакатонах и в продуктовой аналитике. Содержит 12 скиллов, 19 slash-команд, 14 правил, 9 governance shards и систему самообучения.

```bash
npx @dzhechkov/keysarium init
```

## Содержание

- [Быстрый старт](#быстрый-старт)
- [7-фазный pipeline](#7-фазный-pipeline)
- [Скиллы — внутреннее устройство](#скиллы--внутреннее-устройство)
- [Reverse Engineering Unicorn — подробно](#reverse-engineering-unicorn--подробно)
- [Slash-команды](#slash-команды)
- [Правила (Rules)](#правила-rules)
- [Governance Shards](#governance-shards)
- [Система самообучения](#система-самообучения)
- [Фоновые воркеры и Dream Cycles](#фоновые-воркеры-и-dream-cycles)
- [Портативный мозг (Brain)](#портативный-мозг-brain)
- [Мульти-платформенная поддержка](#мульти-платформенная-поддержка)

---

## Быстрый старт

```bash
# Установить в проект
npx @dzhechkov/keysarium init

# Запустить полный pipeline по кейсу
/casarium "Автоматизация кредитного скоринга для банка"

# С маппингом на Cloud.ru AI Factory
/casarium --ai-factory "Чат-бот поддержки для ритейла"

# Параллельно несколько кейсов
/parallel-research "Кейс 1" | "Кейс 2" | "Кейс 3"
```

## 7-фазный pipeline

```
Phase 0 (15%)  →  Phase 1 (5%)  →  Phase 2 (15%)  →  Phase 2.5 ⭐ (10%)  →  Phase 3 (15%)  →  Phase 4 (15%)  →  Phase 5 (20%)
DISCOVERY         EXPLORE           RESEARCH           CJM ПРОТОТИП           SOLVE               ARCHITECTURE       PRESENTATION
```

| Фаза | Команда | Скилл | Что делает | Артефакт |
|------|---------|-------|-----------|----------|
| **0** | `/discovery` | reverse-engineering-unicorn | JTBD + конкуренты + ROI + бизнес-кейс | `00_product_discovery.md` |
| **1** | `/explore-case` | explore | Глубокое понимание кейса, 5 Whys, критерии успеха | `01_case_brief.md` |
| **2** | `/research` | goap-research-ed25519 | PARANOID research: аналоги, технологии, регуляторика (3 параллельных агента) | `02_research_findings.md` |
| **2.5** ⭐ | `/cjm-prototype` | reverse-eng + frontend-design | 3 варианта CJM → кликабельный React прототип → выбор | `prototype/cjm-prototype.jsx` |
| **3** | `/solve` | problem-solver-enhanced | Стратегия решения: SCQA, Process Design, AI Pipeline, HITL | `03_solution_strategy.md` |
| **4** | `/architecture-phase` | (встроенный) | C4 диаграммы, компоненты, безопасность, MVP scope | `04_architecture.md` |
| **5** | `/presentation` | presentation-storyteller | 10-12 слайдов + speaker script + Q&A + Executive Summary | `05-08_*.md` |

**Ключевые правила:**
- Phase 2.5 (CJM) — **ОБЯЗАТЕЛЬНА, нельзя пропустить**
- `08_executive_summary.md` — **ОБЯЗАТЕЛЕН**
- Checkpoint после каждой фазы — ждёт `"ок"` от пользователя
- Research в PARANOID mode — ноль непроверенных утверждений
- `{CHOSEN_CJM}` передаётся из Phase 2.5 в Phase 3-5

---

## Скиллы — внутреннее устройство

### Граф зависимостей

```
reverse-engineering-unicorn (оркестратор pipeline)
  ├── explore (Socratic кларификация)
  ├── goap-research-ed25519 (GOAP + Ed25519 верификация)
  ├── problem-solver-enhanced (TRIZ + Game Theory + 5 Whys)
  ├── frontend-design (UI для CJM прототипа)
  └── presentation-storyteller (слайды + speaker script)
        ├── explore
        └── goap-research-ed25519
```

### 1. explore — адаптивная кларификация

**Что делает:** Превращает расплывчатые запросы в чёткие спецификации через Socratic questioning.

**Протокол:**
1. Классифицирует задачу: Product / Problem / Decision / Creative / Research / Process
2. Выбирает 3-5 измерений для исследования (цель, ограничения, ресурсы, timeline, критерии успеха)
3. Задаёт таргетированные вопросы (не шаблонные — адаптивные)
4. Формирует **Task Brief** с objective, constraints, success criteria, out-of-scope

**Когда вызывается:** Phase 1, а также как зависимость в reverse-engineering-unicorn, presentation-storyteller, analyst-manual, feature-adr, ai-factory-mapper.

### 2. goap-research-ed25519 — верифицированный research

**Что делает:** GOAP (Goal-Oriented Action Planning) + OODA loop + Ed25519 криптографические подписи для антигаллюцинации.

**Протокол:**
1. Оценивает текущее состояние (что знаем / не знаем)
2. Строит план исследования через A* алгоритм с учётом стоимости верификации
3. Выполняет OODA цикл (Observe → Orient → Decide → Act) с checkpoint'ами подписей
4. Каждый факт подписывается Ed25519 → цепочка доверия (citation chain)
5. Генерирует подписанный research report

**3 уровня строгости:** moderate (0.85), strict (0.95), paranoid (0.99)

**Когда вызывается:** Phase 2 (основной), а также все DEEP/VERIFIED режимы в других скиллах.

### 3. problem-solver-enhanced — решатель проблем

**Что делает:** 9-модульная система решения сложных проблем.

**9 модулей:**
1. **First Principles** — декомпозиция до фундаментальных истин
2. **5 Whys** — корневой анализ причин
3. **SCQA** — Situation, Complication, Question, Answer
4. **Game Theory** — анализ стратегических взаимодействий
5. **Second-Order Thinking** — последствия 2-го и 3-го порядка
6. **TRIZ** — разрешение противоречий без компромисса + Идеальный Конечный Результат
7. **Design Thinking** — Empathize → Define → Ideate → Prototype → Test
8. **OODA Loop** — Observe → Orient → Decide → Act (для динамичных ситуаций)
9. **Solution Synthesis** — объединение находок в actionable решение

**Когда вызывается:** Phase 3, а также при разрешении сложных trade-off'ов в feature-adr, ai-factory-mapper.

### 4. frontend-design — дизайн интерфейсов

**Что делает:** Создаёт production-grade UI с bold aesthetic direction. Антитеза "generic AI slop".

**Протокол:**
1. Выбирает контекст и обязывается к эстетическому направлению (minimal / maximalist / retro-futuristic / etc.)
2. Применяет: distinctive typography, committed color palette, micro-animations, unexpected spatial composition
3. Генерирует рабочий HTML/CSS/JS или React код

**Когда вызывается:** Phase 2.5 (CJM прототип), а также в feature-adr Step 7 для UI-фич.

### 5. presentation-storyteller — презентации со storytelling

**Что делает:** 3 файла за один запуск: outline → full presentation → speaker script.

**Фреймворки:** AIDA, Hero's Journey, Problem-Solution.

**Протокол:**
1. Кларификация (explore) → цель, аудитория, ограничения
2. Research (goap-research-ed25519) → верифицированные данные и источники
3. Структура (storytelling arc + outline с тезисами)
4. Полная презентация в Markdown со ссылками на источники
5. Speaker script «Как рассказывать?» — связная история для каждого слайда

**Когда вызывается:** Phase 5.

### 6. knowledge-extractor — извлечение знаний (Trust Tier 2)

**Что делает:** 5 параллельных агентов-экстракторов → 7 категорий → 8 blocking quality gates.

**4 модуля:**
1. **Extract** — 5 агентов сканируют проект через разные линзы (patterns / commands / rules / templates / snippets)
2. **Classify** — 7-категорная классификация + cross-dedup
3. **Gate** — 8 quality gates в 2 прохода (deterministic G1-G2/G5-G7 + semantic G3-G4/G8 через haiku)
4. **Integrate** — auto-placement в `.claude/` + обновление TOOLKIT_HARVEST.md

**Когда вызывается:** `/harvest` после завершения любого проекта.

### 7. ai-factory-mapper — маппинг на Cloud.ru AI Factory

**Что делает:** Декомпозирует ЛЮБУЮ бизнес-задачу на pipeline из сервисов Cloud.ru Evolution AI Factory.

**Протокол:**
1. Clarity gate → уточнение через explore
2. Каталог sync (catalog.md + web search для обновлений)
3. Декомпозиция через problem-solver-enhanced (7-12 шагов)
4. Маппинг: шаг → сервис → ✅/⚠️/❌
5. Gap identification + Coverage scoring
6. Synthesis: report + Mermaid + DOCX

**Когда вызывается:** `/casarium --ai-factory` (аддитивно на всех фазах).

### 8. analyst-manual-full — стратегический аналитик

**Что делает:** Композитный оркестратор: explore → goap-research → problem-solver с ручными checkpoint'ами.

**3 фазы с подтверждением:**
1. Explore → Task Brief → **CHECKPOINT** (выбор verification mode: moderate/strict/paranoid)
2. Verified Research (Ed25519) → **CHECKPOINT**
3. Solve (9-module framework) → **CHECKPOINT**
4. Синтез: 4 документа × 2 формата (md + docx)

**Когда вызывается:** `/analyst-manual` для стратегических задач (ценообразование, GTM, конкурентный анализ).

### 9-10. edu-site-generator + transcript-site-generator

**edu-site-generator:** Генерирует gamified educational SPA из документации. 6 типов упражнений, Vite + TailwindCSS, GitHub Pages deploy.

**transcript-site-generator (Trust Tier 2):** Превращает транскрипт / YouTube ссылку в интерактивный static site. Full-text search, YouTube timestamp sync, dark/light mode, speaker labels.

### 11-12. feature-adr + reverse-engineering-unicorn

**feature-adr:** 11-шаговый pipeline разработки фич с Complexity Router (S/M/L/XL). Независим от casarium pipeline — артефакты в `features/<slug>/`.

**reverse-engineering-unicorn:** Обратная разработка продукта/компании — JTBD, конкурентный ландшафт, ROI. Подробности ниже, в разделе «Reverse Engineering Unicorn».

> **BTO (Build-Benchmark-Test-Optimize) в этот пакет НЕ входит.** Скилл `bto` и команды
> `/bto*` поставляются отдельным пакетом — установите его, если нужна оценка и оптимизация скиллов:
> `npx @dzhechkov/skills-bto init`

---

## Reverse Engineering Unicorn — подробно

Главный оркестратор pipeline. Декомпозирует любую компанию в actionable launch playbook за 7 модулей.

### 3 режима

| Режим | Research | Анализ | Время |
|-------|---------|--------|-------|
| 🟢 **QUICK** | Статические запросы | Шаблоны | ~70 мин |
| 🔵 **DEEP** | GOAP A* + OODA | + Game Theory, TRIZ, CJM прототип, BS-check | ~140 мин |
| 🟣 **VERIFIED** | GOAP + Ed25519 | + Криптоподписи, audit trail, trusted issuers | ~170 мин |

### 7 модулей

#### Module 0: PRE-FLIGHT
Если входные данные неясны → вызывает `explore` для кларификации.
Определяет: `{COMPANY}`, `{URL}`, `{INDUSTRY}`, `{GEOGRAPHY}`, `{MODE}`.

#### Module 1: INTELLIGENCE → Verified Fact Sheet
- Год основания, штаб-квартира, команда, финансирование
- Ключевые метрики: выручка, MAU, NPS
- Каждый факт верифицирован (DEEP → GOAP, VERIFIED → Ed25519)
- **Артефакт:** Fact Sheet с confidence scores

#### Module 2: PRODUCT & CUSTOMERS → JTBD + Segments + Voice of Customer
- [JTBD Canvas](references/jtbd-canvas.md) для каждого сегмента
- Сегментация (STP): демография, поведение, потребности
- Voice of Customer: реальные цитаты из отзывов, App Store, Product Hunt
- **Артефакт:** JTBD карты + VoC матрица

#### Module 2.5: CJM PROTOTYPE → Кликабельный React прототип ⭐
Это **ключевой** модуль — обязателен, нельзя пропустить.

1. Генерирует **3 варианта CJM** (Variant A, B, C) — каждый с разным фокусом
2. Параллельно запускает **Trend Research** → Variant D (на базе трендов)
3. Вызывает `frontend-design` → генерирует **кликабельный React JSX** прототип
4. Пользователь **интерактивно** сравнивает варианты:
   - ⚖️ Сравнение бок о бок
   - 🔧 Кастомный микс (шаги из разных вариантов)
   - 👁 Предпросмотр с данными
5. Пользователь **фиксирует** выбранный CJM → `{CHOSEN_CJM}`

**{CHOSEN_CJM} передаётся во все последующие фазы:**
- Phase 3: user flow строится на базе выбранного CJM
- Phase 4: MVP scope = экраны из CJM
- Phase 5: слайд с CJM в презентации

#### Module 3: MARKET & COMPETITION → TAM/SAM + Game Theory + TRIZ
- TAM/SAM/SOM оценка рынка
- Game Theory: матрица стратегий конкурентов, Nash equilibrium
- TRIZ: противоречия в рынке → изобретательские решения
- Competitive Aha: сравнение aha-момента конкурента vs `{CHOSEN_CJM}`
- **Артефакт:** Market analysis + competition matrix

#### Module 4: BUSINESS & FINANCE → Unit Economics + P&L
- Unit economics: LTV, CAC, LTV/CAC ratio (с бенчмарками из [industry-benchmarks.md](references/industry-benchmarks.md))
- P&L модель на 3 года
- Sensitivity analysis: что если CAC ×2? что если retention −20%?
- Revenue model привязан к paywall timing из `{CHOSEN_CJM}`
- **Артефакт:** Financial model + sensitivity table

#### Module 5: GROWTH ENGINE → Loop + Channels + Moats
- Growth Loop: вирусный цикл из CJM
- Channel scoring: organic vs paid vs partnership
- Moats: network effects, data, brand, switching costs
- Second-Order Thinking: "что произойдёт через 3 года?"
- **Артефакт:** Growth strategy + moat analysis

#### Module 6: PLAYBOOK SYNTHESIS → 90-Day Plan + BS-check
- 90-Day Launch Plan: Week 1-4 → 5-8 → 9-12 с конкретными задачами
- MVP scope = экраны из `{CHOSEN_CJM}`
- BS-check (DEEP mode): вызывает `brutal-honesty-review` — безжалостная проверка на bullsh*t
- **Артефакт:** Launch playbook + BS-check report

### Параллелизм внутри модулей

```
Module 2.5:  Agent 1 (opus) → Variant A
             Agent 2 (opus) → Variant B + C
             Agent 3 (sonnet) → Trend Research → Variant D
```

### Пример использования

```
"Проанализируй Notion в режиме DEEP"
→ Module 0: Pre-flight (Notion, notion.so, Productivity, Global, DEEP)
→ Module 1: Fact Sheet (2016, SF, $10B valuation, 100M users)
→ Module 2: JTBD (3 сегмента: students, teams, enterprise) + VoC
→ Module 2.5: 3 CJM варианта → React прототип → пользователь выбирает Variant B
→ Module 3: TAM $40B, конкуренты (Obsidian, Coda, ClickUp), TRIZ
→ Module 4: LTV/CAC=4.2, P&L breakeven Year 2
→ Module 5: Growth via templates (viral loop), moat = integrations + community
→ Module 6: 90-Day Plan + BS-check ✅
```

---

## Slash-команды

### Pipeline-команды (7 фаз)

| Команда | Фаза | Что делает |
|---------|------|-----------|
| `/casarium [текст]` | Все | Полный 7-фазный pipeline |
| `/casarium --ai-factory [текст]` | Все | + маппинг на Cloud.ru AI Factory |
| `/discovery` | 0 | Product Discovery |
| `/explore-case` | 1 | Глубокое понимание кейса |
| `/research` | 2 | PARANOID research (3 агента) |
| `/cjm-prototype` | 2.5 | CJM → React прототип |
| `/solve` | 3 | Стратегия решения |
| `/architecture-phase` | 4 | Техническая архитектура |
| `/presentation` | 5 | Презентация + speaker script |

### Управление исследованиями

| Команда | Что делает |
|---------|-----------|
| `/new-research [название]` | Создать новую директорию исследования |
| `/parallel-research кейс1 \| кейс2` | Параллельный запуск Phase 0 для нескольких кейсов |
| `/harvest [путь]` | Извлечение знаний (5 агентов → 7 категорий → 8 gates) |
| `/brain-export` | Экспорт знаний в portable JSON (v1.1, SHA-256 manifest) |
| `/brain-import [файл]` | Импорт знаний из другого проекта |

### Инструменты разработки

| Команда | Что делает |
|---------|-----------|
| `/feature-adr [описание]` | 11-шаговый pipeline разработки фич (S/M/L/XL) |
| `/analyst-manual [тема]` | Стратегический анализ с checkpoint'ами |
| `/init-platform --platform X` | Генерация конфигов для Cursor/OpenCode/Copilot |

### Самообучение

| Команда | Что делает |
|---------|-----------|
| `/learning-stats` | Dashboard аналитики reward learning |
| `/dream run` | Запуск dream cycle (анализ паттернов) |
| `/dream insights` | Показать последние инсайты |
| `/workers start <тип>` | Запуск фонового воркера |
| `/workers status` | Статус воркеров |

---

## Правила (Rules)

14 правил в `.claude/rules/` — всегда активны, применяются автоматически.

| Правило | Назначение |
|---------|-----------|
| `research-quality` | PARANOID mode: каждый факт должен иметь источник, confidence ≥ 0.99 |
| `checkpoint-protocol` | Формат checkpoint'ов, promise tags, запрет авто-продвижения |
| `agent-swarm` | Когда и как запускать параллельных агентов, модели, изоляция |
| `domain-specific` | Авто-детекция домена → доменные правила (Banking, Retail, Enterprise, Healthcare) |
| `anti-patterns` | 9 запрещённых паттернов с авто-детекцией и fix'ами |
| `file-conventions` | Всё в `researches/<slug>/`, нумерация, timing |
| `modular-reuse` | Скиллы domain-agnostic, команды pipeline-specific |
| `feedback-loops` | 7 именованных cross-phase feedback loops с контрактами |
| `model-routing` | 3-tier маршрутизация: haiku (1x) / sonnet (15x) / opus (75x) |
| `trust-tiers` | 4-tier классификация скиллов (Advisory → Structured → Validated → Verified) |
| `background-workers` | Авто-запуск, изоляция, concurrency limit (max 3) |
| `dream-cycles` | Триггеры dream cycles, интеграция с memory, retention |
| `reward-learning` | Когда вызывать memory_query/store, reward scores (1.0/0.7/0.3/0.0) |
| `feature-adr-conventions` | Когда /feature-adr vs /casarium, output directory, slug naming |

---

## Governance Shards

9 shards в `.claude/shards/` — загружаются перед каждой фазой для предотвращения context drift.

Каждый shard содержит:
- **Time budget** — % от общего времени
- **Skill to load** — какой скилл загрузить
- **Prerequisites** — upstream promise tags
- **Quality gates** — что проверить перед выходом
- **Agent swarm config** — параллельные агенты
- **Promise tag** — что эмитировать в checkpoint

| Shard | Фаза | Обязательные upstream |
|-------|------|---------------------|
| `phase-0-discovery` | Discovery | — |
| `phase-1-explore` | Explore | `DISCOVERY_COMPLETE` |
| `phase-2-research` | Research | `CASE_EXPLORED` |
| `phase-25-cjm` | CJM Prototype ⭐ | `RESEARCH_PARANOID_PASSED` |
| `phase-3-solve` | Solve | `CJM_VALIDATED` + `{CHOSEN_CJM}` |
| `phase-4-architecture` | Architecture | `SOLUTION_DESIGNED` |
| `phase-5-presentation` | Presentation | `ARCHITECTURE_DEFINED` |
| `phase-ai-factory` | AI Factory (все фазы) | Только при `--ai-factory` |
| `feature-adr` | Feature Development | Независим от casarium |

---

## Система самообучения

### Reward-Calibrated Learning

На каждом checkpoint:
1. `memory_query()` — загружает исторические паттерны для текущего домена/фазы
2. Пользователь отвечает → reward score:

| Ответ | Reward | Метка |
|-------|--------|-------|
| "ок" | 1.0 | excellent |
| "углуби X" | 0.7 | good |
| "переделай" (3+ замечаний) | 0.3 | needs_work |
| "заново" | 0.0 | failed |

3. `memory_store()` — сохраняет результат с promise tag и контекстом
4. Данные хранятся в `.keysarium/memory/` (90 дней retention)

### Аналитика

```
/learning-stats                    # общий dashboard
/learning-stats --domain banking   # по домену
/learning-stats --phase 2          # по фазе
```

---

## Фоновые воркеры и Dream Cycles

### 4 типа воркеров (max 3 одновременно)

| Тип | Модель | Что делает |
|-----|--------|-----------|
| `consolidate` | sonnet | Анализирует завершённые исследования, обновляет TOOLKIT_HARVEST.md |
| `export-brain` | haiku | Фоновый экспорт brain в JSON |
| `health-check` | haiku | Проверка trust tiers, поиск устаревших данных |
| `pattern-analysis` | sonnet | Анализ трендов в reward data |

### Dream Cycles

Background sonnet-агент анализирует накопленные reward данные → генерирует инсайты.

**Триггеры:** 20+ новых записей, 7+ дней с последнего dream, quality gate failure, завершение кейса.

**Инсайты применяются в:**
- Phase 0: фильтрация по домену, предупреждения
- Phase 2: warning о проблемных фазах для текущего домена

```
/dream run        # Запустить dream cycle
/dream insights   # Показать инсайты
/dream status     # Состояние триггеров
/dream clear      # Очистить старые (оставить 10)
```

---

## Портативный мозг (Brain)

Brain v1.1 — JSON контейнер с SHA-256 manifest для переноса знаний между проектами.

```bash
/brain-export                              # Полный экспорт
/brain-export --delta <parent-brain.json>   # Дельта (COW, JSON Patch RFC 6902)
/brain-import <brain.json>                  # Импорт с merge-not-overwrite
```

**Содержит:** skill metadata, domain patterns, research summaries, harvest patterns, pipeline metrics, reward data.

**Lifecycle записей:** HOT → WARM → COLD → PURGE.

---

## Мульти-платформенная поддержка

```bash
/init-platform --platform cursor     # → .cursorrules
/init-platform --platform opencode   # → .opencode/
/init-platform --platform copilot    # → .github/copilot-instructions.md
```

Транслирует содержимое `.claude/` в формат целевой платформы.

---

## Доменная поддержка

Домен авто-детектируется из описания кейса и активирует специфичные правила:

| Домен | Ключевые ограничения | Палитра |
|-------|---------------------|---------|
| **Banking/FinTech** | On-premise LLM (GigaChat/YandexGPT), ФЗ-152, ЦБ, ФСТЭК, HITL обязателен | Blue/Navy/Silver |
| **Retail/E-commerce** | Latency < 200ms, A/B testing, GDPR/ФЗ-152, персонализация vs privacy | Amber/Orange |
| **Enterprise/B2B** | Change Management, Legacy integration, SLA, ROI в FTE/часах | Teal/Indigo |
| **Healthcare** | HITL для ВСЕХ клинических решений, ФЗ-323, explainability, изоляция данных | — |

---

## Антипаттерны

| Паттерн | Исправление |
|---------|------------|
| «Засунем GPT и всё заработает» | Конкретные модели + pipeline |
| Игнорировать ограничения | Явно адресовать каждое |
| Слишком сложная архитектура | MVP-first |
| Нет метрик | Конкретные KPI + baseline |
| Читать со слайдов | Storytelling + визуалы |
| Нет Human-in-the-Loop | Чёткая escalation policy |
| «Улучшим эффективность» без цифр | «Сократим с 4 часов до 15 минут» |
| Пропустить Phase 2.5 (CJM) | БЛОКИРОВКА — CJM обязательна |
| Нет Executive Summary | БЛОКИРОВКА — `08_executive_summary.md` обязателен |

---

## Структура проекта

```
.claude/
├── commands/     ← 19 slash-команд (/casarium, /discovery, /harvest, ...)
├── shards/       ← 9 governance shards (per-phase правила)
├── skills/       ← 12 скиллов (building blocks)
└── rules/        ← 14 правил (всегда активны)
lib/              ← Библиотеки (memory, dream, workers, platform adapters)
researches/       ← Результаты исследований (по кейсам)
features/         ← Результаты feature-adr (по фичам)
.keysarium/       ← Runtime данные (memory, insights, exports, workers)
```

---

## Связанные пакеты

| Пакет | Что делает |
|-------|-----------|
| [@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium) | Этот тулкит (research pipeline) |
| [@dzhechkov/keysarium-core](https://www.npmjs.com/package/@dzhechkov/keysarium-core) | Shared framework (governance, memory, orchestration) |
| [@dzhechkov/skills-bto](https://www.npmjs.com/package/@dzhechkov/skills-bto) | Build-Benchmark-Test-Optimize |
| [@dzhechkov/skills-feature-adr](https://www.npmjs.com/package/@dzhechkov/skills-feature-adr) | 11-step feature pipeline |
| [@dzhechkov/harness-cli](https://www.npmjs.com/package/@dzhechkov/harness-cli) | `dz` CLI — единая точка входа |

---

*Версия 1.5.0 · MIT License · [GitHub](https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/keysarium)*
