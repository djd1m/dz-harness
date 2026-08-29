# 06. Пользовательские и административные flow

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Содержание

1. [User Flow: Полный пайплайн (/casarium)](#user-flow-полный-пайплайн)
2. [User Flow: Quick Mode (< 2 часов)](#user-flow-quick-mode)
3. [User Flow: Параллельные исследования](#user-flow-параллельные-исследования)
4. [User Flow: Отдельная фаза](#user-flow-отдельная-фаза)
5. [User Flow: Harvest знаний](#user-flow-harvest-знаний)
6. [Admin Flow: Добавление нового скилла](#admin-flow-добавление-нового-скилла)
7. [Admin Flow: Создание новой команды](#admin-flow-создание-новой-команды)
8. [Admin Flow: Настройка доменных правил](#admin-flow-настройка-доменных-правил)
9. [Admin Flow: Расширение пайплайна новой фазой](#admin-flow-расширение-пайплайна-новой-фазой)
10. [Admin Flow: Массовый harvest](#admin-flow-массовый-harvest)
11. [Error Flows](#error-flows)
12. [User Flow: BTO — Build-Test-Optimize](#user-flow-bto--build-test-optimize)
13. [User Flow: Feature ADR](#user-flow-feature-adr)
14. [User Flow: Background Workers](#user-flow-background-workers)
15. [User Flow: Dream Cycles](#user-flow-dream-cycles)
16. [User Flow: Brain Export/Import](#user-flow-brain-exportimport)

---

## User Flow: Полный пайплайн

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/casarium)
    participant FS as File System
    participant A as Agent Swarm

    U->>C: /casarium [текст кейса]
    C->>C: Определить CASE_NAME, тайминг, домен
    C->>FS: mkdir researches/<slug>/
    C->>FS: mkdir researches/<slug>/prototype/
    C->>FS: mkdir researches/<slug>/diagrams/
    C-->>U: Инициализация: 7 фаз, распределение времени

    Note over C: ═══ Phase 0: Product Discovery ═══
    C->>FS: Read .claude/skills/reverse-engineering-unicorn/SKILL.md
    C->>A: Spawn 2 агента
    A->>A: Agent 1: JTBD + Voice of Customer
    A->>A: Agent 2: Конкуренты + Business Case
    A-->>C: Результаты обоих агентов
    C->>C: Синтез результатов
    C->>FS: Write 00_product_discovery.md
    C-->>U: Checkpoint 0: Discovery Complete
    U->>C: "ок"

    Note over C: ═══ Phase 1: Explore ═══
    C->>FS: Read .claude/skills/explore/SKILL.md
    C->>FS: Read 00_product_discovery.md
    C->>C: 5 Whys, ограничения, success criteria
    C->>FS: Write 01_case_brief.md
    C-->>U: Checkpoint 1: Explore Complete
    U->>C: "ок"

    Note over C: ═══ Phase 2: Research ═══
    C->>FS: Read .claude/skills/goap-research-ed25519/SKILL.md
    C->>A: Spawn 3 агента (PARANOID mode)
    A->>A: Agent 1: Аналоги + метрики
    A->>A: Agent 2: Технологии + Anti-patterns
    A->>A: Agent 3: Регуляторика + market data
    A-->>C: Результаты трёх агентов
    C->>C: Синтез + верификация
    C->>FS: Write 02_research_findings.md
    C-->>U: Checkpoint 2: Research Complete
    U->>C: "ок"

    Note over C: ═══ Phase 2.5: CJM Prototype ═══
    C->>FS: Read .claude/skills/reverse-engineering-unicorn/SKILL.md
    C->>FS: Read .claude/skills/frontend-design/SKILL.md
    C->>A: Spawn 3 агента
    A->>A: Agent 1: CJM Variant A
    A->>A: Agent 2: CJM Variant B + C
    A->>A: Agent 3: Trend Research (Variant D)
    A-->>C: 4 варианта CJM
    C->>FS: Write 02.5_trend_brief.md
    C->>FS: Write prototype/cjm-prototype.jsx
    C-->>U: Checkpoint 2.5: Выберите CJM (A/B/C/D)
    U->>C: "выбираю B"
    C->>C: Зафиксировать {CHOSEN_CJM} = Variant B

    Note over C: ═══ Phase 3: Solve ═══
    C->>FS: Read .claude/skills/problem-solver-enhanced/SKILL.md
    C->>C: SCQA, Process Design, AI Pipeline (используя {CHOSEN_CJM})
    C->>FS: Write 03_solution_strategy.md
    C->>FS: Write diagrams/process-as-is.mermaid
    C->>FS: Write diagrams/process-to-be.mermaid
    C-->>U: Checkpoint 3: Solve Complete
    U->>C: "ок"

    Note over C: ═══ Phase 4: Architecture ═══
    C->>C: C4 Architecture, AI Models, Data, Security (используя {CHOSEN_CJM})
    C->>FS: Write 04_architecture.md
    C->>FS: Write diagrams/architecture-c4.mermaid
    C->>FS: Write diagrams/sequence-main-flow.mermaid
    C-->>U: Checkpoint 4: Architecture Complete
    U->>C: "ок"

    Note over C: ═══ Phase 5: Presentation ═══
    C->>FS: Read .claude/skills/presentation-storyteller/SKILL.md
    C->>A: Spawn 3 агента (используя {CHOSEN_CJM})
    A->>A: Agent 1: Контент презентации
    A->>A: Agent 2: Speaker Script
    A->>A: Agent 3: Q&A + Executive Summary
    A-->>C: Результаты трёх агентов
    C->>FS: Write 05_presentation_content.md
    C->>FS: Write 06_speaker_script.md
    C->>FS: Write 07_qa_preparation.md
    C->>FS: Write 08_executive_summary.md
    C-->>U: Checkpoint 5: Presentation Complete
    U->>C: "ок"

    Note over C: ═══ Phase 6: Packaging ═══
    C->>C: Проверка всех артефактов
    C->>FS: Write README.md
    C-->>U: Полный архив исследования
```

### Step by Step

**Шаг 1. Запуск пайплайна**
```
User: /casarium Кейс: Автоматизация контакт-центра банка с помощью AI.
      Тайминг: 4 часа. Домен: Банковский.
```

**Шаг 2. Инициализация**
- Claude определяет `CASE_NAME = bank_kc_automation`
- Создает `researches/bank_kc_automation/` со структурой
- Распределяет время: Phase 0 (36 мин) | Phase 1 (12 мин) | Phase 2 (36 мин) | Phase 2.5 (24 мин) | Phase 3 (36 мин) | Phase 4 (36 мин) | Phase 5 (48 мин) | Buffer (12 мин)
- Применяет доменные правила: банковский домен (on-premise LLM, ФЗ-152, HITL)

**Шаг 3. Phase 0 -- Product Discovery**
- Загружается скилл `reverse-engineering-unicorn`
- 2 агента параллельно: JTBD-анализ и конкурентный анализ
- Результат: `00_product_discovery.md`
- Checkpoint 0 -> пользователь подтверждает "ок"

**Шаг 4. Phase 1 -- Explore**
- Загружается скилл `explore`
- Декомпозиция проблемы, карта ограничений, success criteria
- Результат: `01_case_brief.md`
- Checkpoint 1 -> пользователь подтверждает "ок"

**Шаг 5. Phase 2 -- Research**
- Загружается скилл `goap-research-ed25519` в PARANOID mode
- 3 агента параллельно: аналоги, технологии, регуляторика
- Синтез с верификацией каждого утверждения
- Результат: `02_research_findings.md`
- Checkpoint 2 -> пользователь подтверждает "ок"

**Шаг 6. Phase 2.5 -- CJM Prototype (MANDATORY)**
- Загружаются скиллы `reverse-engineering-unicorn` + `frontend-design`
- 3 агента параллельно: Variant A, Variant B+C, Trend Research (D)
- Генерируется React-прототип с 4 вариантами CJM
- Результат: `02.5_trend_brief.md` + `prototype/cjm-prototype.jsx`
- Checkpoint 2.5 -> пользователь выбирает: "выбираю B"
- Фиксируется `{CHOSEN_CJM} = Variant B`

**Шаг 7. Phase 3 -- Solve**
- Загружается скилл `problem-solver-enhanced`
- Используется `{CHOSEN_CJM}` для проектирования решения
- SCQA, Process Design (As-Is -> To-Be), AI Pipeline, HITL, метрики, roadmap
- Результат: `03_solution_strategy.md` + Mermaid-диаграммы
- Checkpoint 3 -> пользователь подтверждает "ок"

**Шаг 8. Phase 4 -- Architecture**
- Встроенные шаблоны архитектуры + контекст Phase 0-3
- C4 Architecture, AI Models & Pipeline, Data Architecture, Security
- Результат: `04_architecture.md` + Mermaid-диаграммы
- Checkpoint 4 -> пользователь подтверждает "ок"

**Шаг 9. Phase 5 -- Presentation**
- Загружается скилл `presentation-storyteller`
- 3 агента параллельно: презентация, speaker script, Q&A + executive summary
- Результат: `05-08_*.md` (4 файла)
- Checkpoint 5 -> пользователь подтверждает "ок"

**Шаг 10. Phase 6 -- Packaging**
- Проверка наличия всех артефактов
- Генерация `README.md` с метаданными и оглавлением
- Финальный архив исследования готов

### Команды пользователя во время пайплайна

| Команда | Действие | Когда доступна |
|---------|----------|----------------|
| `ок` | Переход к следующей фазе | На любом checkpoint |
| `углуби [раздел]` | Доработать конкретный раздел | На любом checkpoint |
| `превью [X]` | Посмотреть созданный документ | В любой момент |
| `время [N]` | Изменить тайминг | В начале или на checkpoint |
| `ускорь` | Quick Mode текущей фазы | На checkpoint |
| `wow` | Добавить нестандартный элемент | На checkpoint |
| `выбираю A/B/C/D` | Зафиксировать CJM | Только на Checkpoint 2.5 |
| `объедини A+D` | Создать гибрид CJM | Только на Checkpoint 2.5 |

---

## User Flow: Quick Mode

Quick Mode предназначен для ситуаций, когда тайминг кейса составляет менее 2 часов. Фазы выполняются в сокращенном формате.

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude

    U->>C: /casarium [кейс] время 1.5
    C->>C: Quick Mode активирован (< 2ч)
    C-->>U: Quick Mode: сокращенные фазы

    Note over C: Phase 0+1 объединены (15 мин)
    C->>C: Сокращенный Discovery + Explore
    C-->>U: Checkpoint 0+1
    U->>C: "ок"

    Note over C: Phase 2 сокращена (10 мин)
    C->>C: Только ключевые аналоги и технологии
    C-->>U: Checkpoint 2
    U->>C: "ок"

    Note over C: Phase 2.5 упрощена (10 мин)
    C->>C: 2 варианта CJM (вместо 4), базовый UI
    C-->>U: Checkpoint 2.5
    U->>C: "выбираю A"

    Note over C: Phase 3+4 объединены (20 мин)
    C->>C: Сокращенная стратегия + архитектура
    C-->>U: Checkpoint 3+4
    U->>C: "ок"

    Note over C: Phase 5 сокращена (25 мин)
    C->>C: 8 слайдов, краткий script, key Q&A
    C-->>U: Checkpoint 5
    U->>C: "ок"

    C-->>U: Phase 6: Packaging
```

### Отличия от полного пайплайна

| Аспект | Полный (4ч) | Quick (< 2ч) |
|--------|-------------|--------------|
| Phase 0+1 | Раздельные | Объединены |
| Phase 2 | 3 агента, глубокий research | 1 агент, ключевые факты |
| Phase 2.5 | 4 варианта CJM | 2 варианта, базовый UI |
| Phase 3+4 | Раздельные | Объединены |
| Phase 5 | 10-12 слайдов, полный script | 8 слайдов, краткий script |
| Диаграммы | 4+ Mermaid | 2 Mermaid (минимум) |
| Executive Summary | Полная страница | Половина страницы |

### Правила Quick Mode

- Phase 2.5 (CJM) все равно **не пропускается** -- упрощается до 2 вариантов
- `08_executive_summary.md` все равно **обязателен**
- PARANOID mode для research **сохраняется** (лучше меньше утверждений, но верифицированных)
- Checkpoints **сохраняются** (но можно пройти быстрее)

---

## User Flow: Параллельные исследования

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/parallel-research)
    participant FS as File System
    participant A1 as Agent 1
    participant A2 as Agent 2
    participant A3 as Agent 3

    U->>C: /parallel-research case1: Описание | case2: Описание | case3: Описание
    C->>C: Парсинг: разделить по "|"

    C->>FS: mkdir researches/case1/
    C->>FS: mkdir researches/case2/
    C->>FS: mkdir researches/case3/

    par Параллельное выполнение Phase 0
        C->>A1: Phase 0 для case1
        A1->>FS: Read reverse-engineering-unicorn SKILL.md
        A1->>A1: JTBD, конкуренты, ROI
        A1->>FS: Write researches/case1/00_product_discovery.md

        C->>A2: Phase 0 для case2
        A2->>FS: Read reverse-engineering-unicorn SKILL.md
        A2->>A2: JTBD, конкуренты, ROI
        A2->>FS: Write researches/case2/00_product_discovery.md

        C->>A3: Phase 0 для case3
        A3->>FS: Read reverse-engineering-unicorn SKILL.md
        A3->>A3: JTBD, конкуренты, ROI
        A3->>FS: Write researches/case3/00_product_discovery.md
    end

    A1-->>C: case1 Phase 0 complete
    A2-->>C: case2 Phase 0 complete
    A3-->>C: case3 Phase 0 complete

    C->>C: Синтез: сводная таблица

    C-->>U: Сводка результатов Phase 0 для всех кейсов
    Note over U: Таблица: Кейс | Директория | Статус | Ключевые находки

    U->>C: Продолжаю с case2
    C-->>U: /casarium researches/case2/
```

### Step by Step

**Шаг 1. Запуск параллельных исследований**
```
User: /parallel-research
  AI для контакт-центра банка |
  Персонализация в e-commerce |
  Автоматизация документооборота
```

**Шаг 2. Парсинг и инициализация**
- Claude разделяет аргумент по `|`
- Определяет slug для каждого: `bank_kc_ai`, `ecommerce_personalization`, `doc_automation`
- Создает 3 изолированные директории в `researches/`
- Инициализирует README.md в каждой

**Шаг 3. Параллельное выполнение Phase 0**
- Запускаются 3 агента одновременно
- Каждый агент загружает `reverse-engineering-unicorn` и выполняет Product Discovery
- Агенты работают изолированно -- каждый только в своей директории

**Шаг 4. Сводка результатов**
```
═══════════════════════════════════════════════════════
Параллельные исследования: Phase 0 Complete

| # | Кейс                    | Директория                      | Статус |
|---|-------------------------|---------------------------------|--------|
| 1 | AI для контакт-центра   | researches/bank_kc_ai/          | Done   |
| 2 | Персонализация e-com    | researches/ecommerce_personal/  | Done   |
| 3 | Автоматизация документов| researches/doc_automation/       | Done   |

Для продолжения:
  /casarium researches/bank_kc_ai/
  /casarium researches/ecommerce_personal/
  /casarium researches/doc_automation/
═══════════════════════════════════════════════════════
```

**Шаг 5. Пользователь выбирает кейс для продолжения**
- Можно продолжить один кейс через `/casarium`
- Можно продолжить несколько последовательно
- Phase 0 уже выполнена -- пайплайн продолжится с Phase 1

### Ограничения

- Рекомендуется не более 3-4 параллельных исследований
- Phase 0 выполняется параллельно, остальные фазы -- последовательно для каждого кейса
- Каждый агент строго изолирован в своей директории

---

## User Flow: Отдельная фаза

Пользователь может запустить любую фазу отдельно, если уже есть подготовленная директория исследования с артефактами предыдущих фаз.

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude
    participant FS as File System

    U->>C: /research researches/bank_kc_ai/
    C->>FS: Read researches/bank_kc_ai/00_product_discovery.md
    C->>FS: Read researches/bank_kc_ai/01_case_brief.md
    alt Файлы предыдущих фаз найдены
        C->>FS: Read .claude/skills/goap-research-ed25519/SKILL.md
        C->>C: Выполнить Phase 2 (Research)
        C->>FS: Write researches/bank_kc_ai/02_research_findings.md
        C-->>U: Checkpoint 2: Research Complete
    else Файлы предыдущих фаз НЕ найдены
        C-->>U: Предупреждение: необходимо сначала выполнить Phase 0 и Phase 1
    end
```

### Step by Step

**Шаг 1. Запуск отдельной фазы**
```
User: /research researches/bank_kc_ai/
```

**Шаг 2. Проверка контекста**
- Claude проверяет наличие артефактов предыдущих фаз
- Если Phase 0 (`00_product_discovery.md`) и Phase 1 (`01_case_brief.md`) существуют -- продолжает
- Если нет -- предупреждает и предлагает сначала выполнить пропущенные фазы

**Шаг 3. Выполнение фазы**
- Загружается соответствующий скилл
- Фаза выполняется с учетом контекста предыдущих артефактов
- Создается артефакт в директории исследования

**Шаг 4. Checkpoint**
- Отображается checkpoint с результатами
- Пользователь может скорректировать или подтвердить

### Таблица зависимостей фаз

| Фаза | Команда | Требует артефактов от |
|------|---------|----------------------|
| Phase 0 | `/discovery` | -- (начальная) |
| Phase 1 | `/explore-case` | Phase 0 |
| Phase 2 | `/research` | Phase 0, Phase 1 |
| Phase 2.5 | `/cjm-prototype` | Phase 0, Phase 1, Phase 2 |
| Phase 3 | `/solve` | Phase 0-2.5 + {CHOSEN_CJM} |
| Phase 4 | `/architecture-phase` | Phase 0-3 |
| Phase 5 | `/presentation` | Phase 0-4 |

---

## User Flow: Harvest знаний

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/harvest)
    participant FS as File System

    U->>C: /harvest researches/bank_kc_ai/

    C->>FS: Read всех файлов в researches/bank_kc_ai/
    C->>FS: Read TOOLKIT_HARVEST.md

    Note over C: Шаг 1: Ревью проекта
    C->>C: Поиск универсальных паттернов
    C->>C: Поиск переиспользуемых скиллов/команд
    C->>C: Поиск ошибок и workaround-ов
    C->>C: Поиск удачных формулировок
    C->>C: Поиск доменных инсайтов

    Note over C: Шаг 2: Классификация
    C->>C: skills/ | commands/ | rules/ | templates/ | patterns/ | snippets/

    Note over C: Шаг 3: Деконтекстуализация
    C->>C: Убрать привязки к конкретному проекту
    C->>C: Добавить: когда использовать, предусловия
    C->>C: Пометить Maturity + Changelog

    Note over C: Шаг 4: Обновление трекера
    C->>FS: Update TOOLKIT_HARVEST.md
    C-->>U: Отчёт: N находок извлечено и классифицировано
```

### Step by Step

**Шаг 1. Запуск harvest**
```
User: /harvest researches/bank_kc_ai/
```

**Шаг 2. Ревью исследования**
- Claude читает все артефакты в указанной директории
- Читает текущий `TOOLKIT_HARVEST.md`
- Ищет паттерны, которые можно обобщить за пределами конкретного кейса

**Шаг 3. Классификация находок**
Каждая находка распределяется по категориям:

| Категория | Примеры находок |
|-----------|----------------|
| skills/ | Улучшенный подход к CJM-анализу для банков |
| commands/ | Новая фаза "Compliance Review" |
| rules/ | "В банковском домене всегда проверяй ФЗ-152" |
| templates/ | Обновленный шаблон executive summary |
| patterns/ | Event sourcing для AI pipeline в банках |
| snippets/ | Универсальный CJM renderer для React |

**Шаг 4. Деконтекстуализация**
- Убираются привязки к конкретному банку/кейсу
- Добавляется документация: когда применять, предусловия, ограничения
- Маркируется зрелость: Beta / Stable
- Добавляется changelog

**Шаг 5. Обновление TOOLKIT_HARVEST.md**
- Новые находки добавляются в трекер
- Указывается проект-источник и дата извлечения

### Что НЕ извлекается

- Код, работающий только в контексте конкретного домена
- Паттерны, использованные один раз без уверенности в качестве
- Workaround-ы для конкретных багов библиотек (быстро устаревают)

---

## Admin Flow: Добавление нового скилла

### Sequence Diagram

```mermaid
flowchart TD
    A["1. Создать директорию<br/>.claude/skills/new-skill/"] --> B["2. Создать SKILL.md<br/>(точка входа скилла)"]
    B --> C["3. Добавить references/<br/>(справочные материалы)"]
    C --> D{"Скилл сложный?"}
    D -->|Да| E["4a. Добавить modules/<br/>(подмодули)"]
    D -->|Нет| F["4b. Пропустить modules/"]
    E --> G["5. Добавить examples/<br/>(примеры применения)"]
    F --> G
    G --> H["6. Протестировать:<br/>Read SKILL.md и проверить работу"]
    H --> I["7. Обновить CLAUDE.md:<br/>добавить скилл в таблицу"]
    I --> J["8. Обновить граф<br/>зависимостей скиллов"]
```

### Step by Step

**Шаг 1.** Создать директорию скилла:
```bash
mkdir -p .claude/skills/new-skill/references/
```

**Шаг 2.** Создать `SKILL.md` -- основной файл скилла. Обязательные секции:
```markdown
# Название скилла

## Роль
Описание, что делает скилл.

## Когда использовать
Условия и контекст применения.

## Инструкции
Пошаговый алгоритм работы.

## Формат вывода
Ожидаемый формат результата.

## Примеры
Ссылки на примеры или встроенные примеры.
```

**Шаг 3.** Добавить справочные материалы в `references/` -- техники, шаблоны, best practices, которые скилл использует.

**Шаг 4.** Для сложных скиллов -- добавить `modules/` с нумерованными подмодулями.

**Шаг 5.** Добавить `examples/` с конкретными примерами применения скилла.

**Шаг 6.** Протестировать: в Claude Code выполнить `Read(".claude/skills/new-skill/SKILL.md")` и проверить, что скилл выдает ожидаемые результаты.

**Шаг 7.** Обновить CLAUDE.md: добавить скилл в таблицу скиллов и граф зависимостей.

**Шаг 8.** Если скилл используется другими скиллами или командами -- обновить граф зависимостей.

### Принципы хорошего скилла

- **Domain-agnostic** -- скилл не должен быть привязан к конкретному домену
- **Самодостаточный** -- все необходимое содержится внутри директории скилла
- **Документированный** -- SKILL.md содержит полные инструкции для использования
- **Тестируемый** -- можно проверить работу скилла изолированно

---

## Admin Flow: Создание новой команды

### Sequence Diagram

```mermaid
flowchart TD
    A["1. Определить назначение<br/>команды в пайплайне"] --> B["2. Создать файл<br/>.claude/commands/new-command.md"]
    B --> C["3. Определить структуру:<br/>аргументы, действия, скиллы"]
    C --> D["4. Привязать скилл(ы)<br/>через инструкцию Read SKILL.md"]
    D --> E["5. Определить артефакт:<br/>какой файл создает команда"]
    E --> F["6. Добавить формат<br/>checkpoint"]
    F --> G{"Команда параллелизируема?"}
    G -->|Да| H["7a. Определить Agent Swarm:<br/>сколько агентов, какие задачи"]
    G -->|Нет| I["7b. Последовательное<br/>выполнение"]
    H --> J["8. Обновить CLAUDE.md:<br/>таблица фаз и команд"]
    I --> J
    J --> K["9. Протестировать:<br/>/new-command [тестовый аргумент]"]
```

### Step by Step

**Шаг 1.** Определить место команды в пайплайне -- какая фаза, какие входные данные, какой результат.

**Шаг 2.** Создать файл `.claude/commands/new-command.md`. Обязательные секции:
```markdown
# Название команды

## Использование
/new-command [аргументы]

## Аргумент
$ARGUMENTS

## Действия
1. Загрузи скилл: Read(".claude/skills/<skill>/SKILL.md")
2. Прочитай контекст предыдущих фаз
3. Выполни [описание действий]
4. Создай файл [артефакт]
5. Покажи Checkpoint N

## Параллелизация (Agent Swarm)
[Если применимо]
```

**Шаг 3.** Привязать скилл -- указать, какой SKILL.md загружать перед выполнением.

**Шаг 4.** Определить формат артефакта и имя файла в соответствии с `file-conventions` правилом.

**Шаг 5.** Добавить checkpoint в формате из `checkpoint-protocol` правила.

**Шаг 6.** Если команда поддерживает параллелизацию -- описать Agent Swarm: количество агентов, распределение задач, формат синтеза.

**Шаг 7.** Обновить CLAUDE.md: таблицу фаз и список команд.

**Шаг 8.** Протестировать команду с тестовым аргументом.

---

## Admin Flow: Настройка доменных правил

### Sequence Diagram

```mermaid
flowchart TD
    A["1. Идентифицировать домен<br/>(банки, ритейл, healthcare, ...)"] --> B["2. Определить ограничения<br/>(регуляторика, compliance, SLA)"]
    B --> C["3. Определить технические<br/>требования (on-premise, latency)"]
    C --> D["4. Определить палитру<br/>и тон презентации"]
    D --> E["5. Добавить в .claude/rules/<br/>domain-specific.md"]
    E --> F["6. Определить сигналы<br/>автодетекции домена"]
    F --> G["7. Обновить CLAUDE.md:<br/>секция Domain Templates"]
    G --> H["8. Протестировать:<br/>запустить кейс в новом домене"]
```

### Step by Step

**Шаг 1.** Идентифицировать домен и его специфику.

**Шаг 2.** Определить ключевые ограничения домена:
```markdown
## Новый Домен
- Регуляторные требования: [ФЗ-..., стандарты]
- Compliance: [что обязательно]
- Технические ограничения: [latency, deployment model]
```

**Шаг 3.** Добавить секцию в `.claude/rules/domain-specific.md`:
```markdown
## Новый Домен
- ALWAYS [обязательное действие]
- ALWAYS reference: [список нормативов]
- HITL [обязателен / рекомендован]
- Palette: [цвета]
- Tone: [стиль]
```

**Шаг 4.** Определить ключевые слова для автодетекции домена (в секции "Detection").

**Шаг 5.** Обновить CLAUDE.md в секции "Domain Templates".

**Шаг 6.** Протестировать: запустить `/casarium` с кейсом в новом домене и проверить, что правила применяются.

### Текущие доменные правила

| Домен | Ключевые правила | Палитра |
|-------|-----------------|---------|
| Банковский / FinTech | On-premise LLM, ФЗ-152, ЦБ, ФСТЭК, HITL обязателен | Blue/Navy/Silver |
| Ритейл / E-commerce | Latency < 200ms, A/B тестирование, privacy | Amber/Orange |
| Enterprise / B2B | Change Management, Legacy интеграции, SLA, ROI в FTE | Teal/Indigo |
| Healthcare | HITL для клинических решений, ФЗ-323, explainability | -- |

---

## Admin Flow: Расширение пайплайна новой фазой

### Sequence Diagram

```mermaid
flowchart TD
    A["1. Определить место<br/>новой фазы в пайплайне"] --> B["2. Создать команду<br/>.claude/commands/new-phase.md"]
    B --> C{"Нужен новый скилл?"}
    C -->|Да| D["3a. Создать скилл<br/>.claude/skills/new-skill/"]
    C -->|Нет| E["3b. Привязать<br/>существующий скилл"]
    D --> F["4. Определить артефакт<br/>и его номер"]
    E --> F
    F --> G{"Фаза параллелизируема?"}
    G -->|Да| H["5a. Добавить шаблон агента<br/>.claude/agents/"]
    G -->|Нет| I["5b. Последовательное<br/>выполнение"]
    H --> J["6. Обновить правила<br/>.claude/rules/"]
    I --> J
    J --> K["7. Обновить CLAUDE.md:<br/>пайплайн, таблица, проценты"]
    K --> L["8. Обновить file-conventions:<br/>новый артефакт"]
    L --> M["9. Обновить casarium.md:<br/>добавить фазу в pipeline"]
    M --> N["10. Обновить docs/"]
    N --> O["11. Протестировать полный<br/>пайплайн с новой фазой"]
```

### Step by Step

**Шаг 1.** Определить, где новая фаза находится в pipeline:
```
Phase 0 → Phase 1 → Phase 2 → Phase 2.5 → [НОВАЯ ФАЗА] → Phase 3 → ...
```

**Шаг 2.** Создать файл команды `.claude/commands/new-phase.md` (см. [Admin Flow: Создание новой команды](#admin-flow-создание-новой-команды)).

**Шаг 3.** Создать или привязать скилл.

**Шаг 4.** Определить артефакт: имя файла (с числовым префиксом) и его содержание.

**Шаг 5.** Если фаза поддерживает параллелизацию -- создать шаблон агентов.

**Шаг 6.** Обновить правила в `.claude/rules/`:
- `agent-swarm.md` -- если новая фаза параллелизируема
- `file-conventions.md` -- добавить новый артефакт в структуру
- `checkpoint-protocol.md` -- если нужен особый формат checkpoint

**Шаг 7.** Обновить CLAUDE.md:
- Таблицу фаз
- Pipeline-диаграмму
- Распределение процентов времени
- Tracker артефактов

**Шаг 8.** Обновить `/casarium` команду:
- Добавить новую фазу в pipeline
- Добавить артефакт в tracker

**Шаг 9.** Обновить документацию.

**Шаг 10.** Протестировать полный пайплайн с новой фазой.

### Чеклист расширения

- [ ] Файл команды создан в `.claude/commands/`
- [ ] Скилл создан или привязан
- [ ] Артефакт определен и добавлен в file-conventions
- [ ] Agent Swarm настроен (если нужно)
- [ ] CLAUDE.md обновлен
- [ ] casarium.md обновлен
- [ ] Checkpoint формат определен
- [ ] Полный пайплайн протестирован

---

## Admin Flow: Массовый harvest

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/harvest)
    participant FS as File System
    participant A1 as Agent 1
    participant A2 as Agent 2
    participant A3 as Agent 3

    U->>C: /harvest all
    C->>FS: ls researches/
    Note over C: Найдено: case1/, case2/, case3/

    par Параллельный harvest
        C->>A1: Harvest researches/case1/
        A1->>FS: Read все артефакты case1
        A1->>A1: Ревью, классификация, деконтекстуализация
        A1-->>C: Находки из case1

        C->>A2: Harvest researches/case2/
        A2->>FS: Read все артефакты case2
        A2->>A2: Ревью, классификация, деконтекстуализация
        A2-->>C: Находки из case2

        C->>A3: Harvest researches/case3/
        A3->>FS: Read все артефакты case3
        A3->>A3: Ревью, классификация, деконтекстуализация
        A3-->>C: Находки из case3
    end

    C->>C: Синтез: объединить все находки
    C->>C: Дедупликация: убрать повторяющиеся паттерны
    C->>C: Приоритизация: Stable > Beta

    C->>FS: Update TOOLKIT_HARVEST.md
    C-->>U: Отчёт: N находок из M исследований
```

### Step by Step

**Шаг 1.** Запуск массового harvest:
```
User: /harvest all
```

**Шаг 2.** Claude сканирует `researches/` и находит все директории исследований.

**Шаг 3.** Для каждой директории запускается параллельный агент harvest:
- Каждый агент ревьюит своё исследование
- Ищет универсальные паттерны, скиллы, правила, шаблоны
- Классифицирует и деконтекстуализирует находки

**Шаг 4.** Оркестратор синтезирует результаты:
- Объединяет находки из всех исследований
- Дедуплицирует повторяющиеся паттерны
- Приоритизирует: если паттерн встречается в нескольких исследованиях -- повышает maturity

**Шаг 5.** Обновляет `TOOLKIT_HARVEST.md` с полным набором находок.

**Шаг 6.** Выводит отчет пользователю:
```
═══════════════════════════════════════════════════════
Harvest Complete: 3 исследования обработаны

| Категория  | Найдено | Новых | Обновлено |
|-----------|---------|-------|-----------|
| skills/    | 2       | 1     | 1         |
| commands/  | 1       | 1     | 0         |
| rules/     | 3       | 2     | 1         |
| templates/ | 2       | 0     | 2         |
| patterns/  | 4       | 3     | 1         |
| snippets/  | 1       | 1     | 0         |

TOOLKIT_HARVEST.md обновлён
═══════════════════════════════════════════════════════
```

---

## Error Flows

### Error Flow 1: Research не находит данных

```mermaid
flowchart TD
    A["Phase 2: Research запущена"] --> B["Agent выполняет поиск"]
    B --> C{"Данные найдены?"}
    C -->|Да| D["Нормальный flow:<br/>верификация, синтез"]
    C -->|Частично| E["Маркировать пробелы<br/>как [DATA_GAP]"]
    C -->|Нет| F["Расширить поисковый запрос"]
    F --> G{"Данные найдены<br/>после расширения?"}
    G -->|Да| D
    G -->|Нет| H["Зафиксировать в артефакте:<br/>[NO_DATA] + объяснение"]
    E --> I["Checkpoint 2:<br/>показать найденное + пробелы"]
    H --> I
    D --> I
    I --> J["User решает:"]
    J --> K["'ок' — продолжить<br/>с имеющимися данными"]
    J --> L["'углуби [тему]' —<br/>доисследовать конкретную область"]
    J --> M["'пропусти' — НЕЛЬЗЯ<br/>пропустить research"]
```

**Принципы обработки:**
- Research **никогда не пропускается** -- даже при отсутствии данных фиксируется сам факт отсутствия
- PARANOID mode: лучше `[NO_DATA]`, чем непроверенное утверждение
- Пробелы маркируются явно -- это ценная информация для последующих фаз
- Пользователь всегда информируется о состоянии данных на checkpoint

---

### Error Flow 2: Пользователь пропускает CJM (блокировка)

```mermaid
flowchart TD
    A["Пайплайн достиг Phase 2.5"] --> B{"User пытается<br/>пропустить CJM?"}
    B -->|Нет| C["Нормальный flow:<br/>CJM Prototype"]
    B -->|Да: 'пропусти'| D["БЛОКИРОВКА"]
    D --> E["Сообщение:<br/>'Phase 2.5 CJM Prototype<br/>ОБЯЗАТЕЛЬНА и не может<br/>быть пропущена'"]
    E --> F{"Мало времени?"}
    F -->|Да| G["Предложить Quick Mode:<br/>2 варианта CJM, базовый UI"]
    F -->|Нет| H["Предложить выполнить<br/>полную Phase 2.5"]
    G --> I["Упрощённый CJM<br/>(но НЕ пропуск)"]
    H --> C
    I --> J["Checkpoint 2.5:<br/>выбор CJM"]
```

**Принципы обработки:**
- Phase 2.5 (CJM Prototype) -- **абсолютно обязательна**
- Правило `anti-patterns.md` автоматически блокирует попытку пропуска
- При нехватке времени предлагается Quick Mode: 2 варианта вместо 4, базовый UI
- `{CHOSEN_CJM}` **должен быть зафиксирован** перед Phase 3 -- без него последующие фазы не могут выполниться корректно

---

### Error Flow 3: Agent timeout

```mermaid
flowchart TD
    A["Orchestrator запускает<br/>N агентов параллельно"] --> B["Агенты работают..."]
    B --> C{"Все завершились<br/>в пределах timeout?"}
    C -->|Да| D["Нормальный flow:<br/>синтез результатов"]
    C -->|Нет: timeout| E["Определить, какие<br/>агенты не завершились"]
    E --> F{"Есть частичные<br/>результаты?"}
    F -->|Да| G["Собрать частичные<br/>результаты"]
    F -->|Нет| H["Зафиксировать<br/>[AGENT_TIMEOUT]"]
    G --> I["Синтез из завершённых<br/>+ частичных результатов"]
    H --> I
    I --> J["Checkpoint: показать<br/>что получено + что пропущено"]
    J --> K["User решает:"]
    K --> L["'ок' — продолжить<br/>с имеющимися данными"]
    K --> M["'повтори [агент]' —<br/>перезапустить упавшего агента"]
    K --> N["'углуби [тему]' —<br/>доработать вручную"]
```

**Принципы обработки:**
- Timeout одного агента **не блокирует** остальных -- завершившиеся агенты возвращают результаты
- Частичные результаты **используются** -- лучше часть данных, чем ничего
- Пользователь информируется, какие данные получены, а какие пропущены
- Возможен перезапуск конкретного упавшего агента
- Timeout маркируется в артефакте как `[AGENT_TIMEOUT: <описание>]`

### Сводная таблица обработки ошибок

| Ошибка | Блокирует ли пайплайн | Действие |
|--------|----------------------|----------|
| Research не нашёл данных | Нет | `[NO_DATA]` + продолжить |
| Пропуск Phase 2.5 | Да | Блокировка, предложить Quick Mode |
| Пропуск Executive Summary | Да | Блокировка, обязательно создать |
| Agent timeout | Нет | Частичные результаты + уведомление |
| Нет артефактов предыдущих фаз | Да | Предложить выполнить пропущенные фазы |
| Anti-pattern обнаружен | Нет (предупреждение) | Флаг + автоматическое исправление |
| "Just add GPT" в решении | Нет (предупреждение) | Запросить конкретные модели + pipeline |
| Непроверенное утверждение | Нет (маркировка) | `[UNVERIFIED]` + флаг |

---

## User Flow: BTO — Build-Test-Optimize

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/bto)
    participant FS as File System
    participant J1 as Judge 1 (Expert)
    participant J2 as Judge 2 (Critic)
    participant J3 as Judge 3 (Auditor)

    U->>C: /bto .claude/skills/my-skill/

    Note over C: ═══ BUILD ═══
    C->>FS: Read SKILL.md
    C->>C: Генерация/улучшение артефакта
    C->>FS: Write улучшенный SKILL.md
    C-->>U: BUILD complete

    Note over C: ═══ TEST (Layer 0) ═══
    C->>C: 71 deterministic checks (haiku)
    alt Layer 0 PASS
        Note over C: ═══ TEST (Layer 1) ═══
        C->>C: Semantic baseline (haiku)
    else Layer 0 FAIL
        C->>C: Auto-retry (до 3 раз)
    end

    Note over C: ═══ TEST (Layer 2) ═══
    par 3 judges parallel (sonnet)
        C->>J1: Domain Expert evaluation
        C->>J2: Critic evaluation
        C->>J3: Completeness Auditor
    end
    J1-->>C: Score + rationale
    J2-->>C: Score + rationale
    J3-->>C: Score + rationale
    C->>C: Weighted average (0.4 / 0.3 / 0.3)
    C-->>U: TEST score: X.X/10

    Note over C: ═══ OPTIMIZE ═══
    loop 3 rounds
        C->>C: Mutation + evaluation
        C->>C: Check delta > 0.5
    end
    C-->>U: OPTIMIZE complete, final score: Y.Y/10
```

### Step by Step

**Шаг 1.** Запуск BTO:
```
/bto .claude/skills/my-skill/
```

**Шаг 2.** BUILD — генерация или улучшение артефакта.

**Шаг 3.** TEST — 3-уровневая оценка:
- Layer 0: структурные проверки (haiku)
- Layer 1: семантический базовый уровень (haiku)
- Layer 2: панель из 3 судей (sonnet), работают изолированно

**Шаг 4.** OPTIMIZE — эволюционная оптимизация за 3 раунда. Останавливается при delta ≤ 0.5 три раза подряд.

---

## User Flow: Feature ADR

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/feature-adr)
    participant FS as File System

    U->>C: /feature-adr Add user authentication

    Note over C: Step 0: Complexity Router (haiku)
    C->>C: Classify: S / M / L / XL
    C-->>U: Checkpoint 0: Tier = M (4-10 files)
    U->>C: "ок"

    Note over C: Step 1: Requirements (sonnet)
    C->>FS: Write features/add-user-auth/01_requirements.md
    C-->>U: Checkpoint 1
    U->>C: "ок"

    Note over C: Step 3: ADR (opus) [M tier — skip Step 2]
    C->>FS: Write features/add-user-auth/03_adr/001-auth-strategy.md
    C-->>U: Checkpoint 3
    U->>C: "ок"

    Note over C: Step 5: Architecture (opus)
    C->>FS: Write features/add-user-auth/05_architecture.md
    C-->>U: Checkpoint 5
    U->>C: "ок"

    Note over C: Step 6: Implementation Plan (sonnet)
    C->>FS: Write features/add-user-auth/06_implementation_plan.md

    Note over C: Step 7: Code (opus)
    C->>C: Implement code changes in codebase
    C->>FS: Write features/add-user-auth/07_code_changes/change_manifest.md

    Note over C: Step 8: QE (sonnet)
    C->>FS: Write features/add-user-auth/08_qe_report.md
    C-->>U: Feature complete!
```

### Complexity Tiers

| Tier | Scope | Шаги |
|------|-------|------|
| **S** | 1-3 файла, 1 домен | 0→1→6→7→8 |
| **M** | 4-10 файлов, 1-2 домена | 0→1→3→5→6→7→8 |
| **L** | 11-30 файлов, 2-4 домена | Полный pipeline |
| **XL** | 30+ файлов, cross-cutting | Full DAG + multi-agent |

---

## User Flow: Background Workers

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/workers)
    participant FS as File System
    participant W as Background Worker

    U->>C: /workers start consolidate
    C->>FS: Check registry (max 3 workers)
    C->>FS: Create .keysarium/workers/{id}/
    C->>W: Spawn agent (model=sonnet)
    W->>FS: Read researches/*
    W->>W: Pattern consolidation
    W->>FS: Write .keysarium/workers/{id}/output.json
    W->>FS: Update status.json
    C-->>U: Worker started: wkr-20260301-143022-consolidate

    U->>C: /workers status
    C->>FS: Read registry.json + status files
    C-->>U: 1 active, 0 completed, 2 slots available

    U->>C: /workers stop wkr-20260301-143022-consolidate
    C->>FS: Update registry
    C-->>U: Worker stopped
```

### Типы воркеров

| Тип | Модель | Назначение |
|-----|--------|-----------|
| `consolidate` | sonnet | Консолидация паттернов из исследований |
| `health-check` | haiku | Проверка здоровья системы |
| `export-brain` | haiku | Фоновый экспорт знаний |
| `dream-cycle` | sonnet | Dream cycle (concept graph + insights) |

---

## User Flow: Dream Cycles

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/dream)
    participant FS as File System

    U->>C: /dream run
    C->>FS: Read .keysarium/memory/**
    C->>C: Build concept graph
    C->>C: Cross-domain pattern analysis
    C->>C: Generate insights (4 types)
    C->>FS: Write .keysarium/insights/dream-20260301-143022.json
    C->>FS: Update trigger-state.json (reset counters)
    C-->>U: Dream complete: 5 insights generated

    U->>C: /dream insights
    C->>FS: Read .keysarium/insights/dream-*.json
    C-->>U: Insights list (sorted by recency)

    U->>C: /dream status
    C->>FS: Read trigger-state.json
    C-->>U: Records since last dream: 15/20, Time: 45/60 min
```

### Типы инсайтов

| Тип | Пример |
|-----|--------|
| Performance | "Phase 2 takes 2x longer for banking domain" |
| Effectiveness | "TRIZ produces higher scores than Game Theory for retail" |
| Preference | "CJM Variant B selected in 70% of enterprise cases" |
| Anti-pattern | "Phase 5 consistently gets rework when HITL skipped in Phase 3" |

---

## User Flow: Brain Export/Import

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude
    participant FS as File System

    Note over U,C: === EXPORT ===
    U->>C: /brain-export all
    C->>FS: Read researches/*, .keysarium/memory/*, TOOLKIT_HARVEST.md
    C->>C: Assemble: skills + patterns + research summaries + metrics
    C->>FS: Write keysarium-brain.json
    C-->>U: Brain exported: 15 patterns, 3 domain profiles

    Note over U,C: === IMPORT (другой проект) ===
    U->>C: /brain-import keysarium-brain.json
    C->>FS: Read keysarium-brain.json
    C->>C: Selective merge (merge-not-overwrite)
    C->>FS: Merge into .keysarium/memory/
    C-->>U: Imported: 12 patterns merged, 3 skipped (duplicates)
```
