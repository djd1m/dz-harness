# 06. Пользовательские и административные flow @dzhechkov/skills-bto

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Содержание

1. [Flow: Полный BTO пайплайн (/bto)](#flow-полный-bto-пайплайн)
2. [Flow: Build-only (/bto-build)](#flow-build-only)
3. [Flow: Test-only (/bto-test)](#flow-test-only)
4. [Flow: Optimize-only (/bto-optimize)](#flow-optimize-only)
5. [Flow: Панель судей (Layer 2)](#flow-панель-судей-layer-2)
6. [Flow: Раунд оптимизации (мутация → fast-eval → отбор → full panel)](#flow-раунд-оптимизации)
7. [Flow: Ошибки и rejection](#flow-ошибки-и-rejection)
8. [Flow: Human Checkpoint](#flow-human-checkpoint)
9. [Flow: Интеграция BTO в Keysarium пайплайн](#flow-интеграция-bto-в-keysarium-пайплайн)

---

## Flow: Полный BTO пайплайн

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/bto)
    participant FS as File System
    participant A as Agent Swarm

    U->>C: /bto .claude/skills/my-skill/

    Note over C: ═══ MODULE: BUILD (только если новый артефакт) ═══

    alt Путь существует (оценка + оптимизация)
        C->>FS: Проверить артефакт
        C-->>U: Артефакт найден → запускаем TEST
    else Описание нового артефакта
        C->>C: Определить тип артефакта
        C->>FS: Read .claude/skills/bto/modules/build.md
        C->>C: Сгенерировать артефакт
        C->>FS: Записать новый артефакт
        C-->>U: BUILD Complete ✅
    end

    Note over C: ═══ MODULE: TEST ═══

    C->>FS: Read .claude/skills/bto/modules/test.md
    C->>C: Layer 0 — детерминистические проверки
    C-->>U: Layer 0: X/Y passed

    alt Layer 0 FAIL (< 80%)
        C-->>U: FAIL: конкретные ошибки + рекомендации
        C-->>U: Checkpoint: исправьте и повторите
    else Layer 0 PASS
        C->>A: Spawn haiku agent (Layer 1)
        A-->>C: Layer 1 score: X.X / 10
        alt Layer 1 FAIL (< 5.0)
            C-->>U: FAIL: серьёзные проблемы, Layer 2 не запускается
        else Layer 1 PASS/NEEDS WORK
            C->>A: Spawn 3 judge agents (Layer 2) параллельно
            A->>FS: judge-1.md (Domain Expert)
            A->>FS: judge-2.md (Critic)
            A->>FS: judge-3.md (Completeness Auditor)
            A-->>C: Все 3 оценки готовы
            C->>C: Агрегация: weighted average + disagreement check
            alt Disagreement > 3 (Layer 3)
                C->>A: Spawn Meta-Judge (opus)
                A-->>C: Reconciled score
            end
            C->>FS: Записать panel-verdict.md
            C-->>U: TEST Complete: X.X/10 [PASS/NEEDS WORK/FAIL]
        end
    end

    Note over C: ═══ MODULE: OPTIMIZE ═══

    alt Baseline >= 8.0
        C-->>U: Артефакт высокого качества. Minor tweaks only.
    else Baseline < 8.0
        C->>FS: Read .claude/skills/bto/modules/optimize.md
        C->>C: Определить target dimensions (score < 7.0)

        loop 3 Rounds
            C->>A: Spawn mutation workers (sonnet) параллельно
            A->>FS: variant-N-*.md + mutation-log-N.md
            A-->>C: Варианты готовы

            C->>A: Spawn haiku fast-eval agents параллельно
            A->>FS: scores/score-*.txt
            A-->>C: Оценки готовы

            C->>C: Ранжирование → выбор Top-2
            C->>A: Spawn Crossover agent (opus)
            A-->>C: Crossover вариант готов
        end

        C->>A: Spawn Layer 2 panel на 3 финальных варианта
        A-->>C: Финальные оценки
        C->>C: Выбор победителя
        C->>FS: Записать optimization-report.md
        C-->>U: OPTIMIZE Complete: before X.X → after X.X (+delta)
    end

    Note over C: ═══ HUMAN CHECKPOINT ═══

    C-->>U: Checkpoint: применить изменения? (да/нет/углубить)
    U->>C: "да"
    C->>FS: Применить победивший вариант → перезаписать артефакт
    C-->>U: BTO Complete ✅
```

### Step by Step

**Шаг 1. Запуск пайплайна**
```
User: /bto .claude/skills/my-skill/SKILL.md
```

**Шаг 2. TEST — Layer 0**
- Claude читает `modules/test.md`
- Детерминистические проверки: 10-15 чеков за ~1 сек
- Например: SKILL.md существует, есть ## Overview, есть ## Anti-Patterns, все referenced modules существуют
- Если < 80% чеков прошло → вывод отчёта с конкретными ошибками, остановка

**Шаг 3. TEST — Layer 1 (haiku)**
- Один haiku агент оценивает по 5 измерениям
- Ввод: содержимое артефакта + evaluation prompt
- Вывод: CLARITY:8, COMPLETENESS:7, ACTIONABILITY:7, QUALITY:8, ANTI-PATTERNS:9
- Average: 7.8 → PASS

**Шаг 4. TEST — Layer 2 (3 × sonnet)**
- Три sonnet агента спавнятся параллельно
- Каждый читает тот же артефакт, пишет в отдельный файл
- После завершения всех трёх: агрегация с весами 0.4/0.3/0.3
- Проверка разногласий

**Шаг 5. OPTIMIZE — 3 раунда**
- Round 1: 5 направленных мутаций → 5 haiku оценок → Top-2
- Round 2: crossover → 3 haiku оценок → Top-2
- Round 3: crossover → 3 × Layer 2 → победитель

**Шаг 6. Human Checkpoint**
- Вывод отчёта: before/after delta по каждому измерению + changelog
- Пользователь подтверждает применение изменений

---

## Flow: Build-only

### Flowchart

```mermaid
flowchart TD
    START(["/bto-build [описание]"]) --> LOAD
    LOAD["Загрузить modules/build.md"] --> DETECT

    DETECT{"Определить тип\nартефакта"} --> TYPE_CHECK{"Тип явно\nуказан?"}
    TYPE_CHECK -->|"Нет"| AUTO_DETECT["Авто-определение\nпо ключевым словам"]
    TYPE_CHECK -->|"Да"| MODE_CHECK

    AUTO_DETECT --> MODE_CHECK{"Режим?"}

    MODE_CHECK -->|"Чёткие требования\n→ QUICK"| QUICK["QUICK mode:\nПрямая генерация"]
    MODE_CHECK -->|"Нечёткие требования\n→ DEEP"| DEEP["DEEP mode:\nЗагрузить explore skill"]

    DEEP --> EXPLORE["Кларификация требований:\n• Что именно нужно?\n• Для кого?\n• Input/Output формат?\n• Edge cases?"]
    EXPLORE --> BRIEF["Requirements Brief"]
    BRIEF --> CONFIRM{"Подтвердить\nс пользователем"}
    CONFIRM -->|"ок"| TEMPLATE
    CONFIRM -->|"правки"| EXPLORE

    QUICK --> TEMPLATE["Выбрать шаблон\nпо типу артефакта"]

    TEMPLATE --> GEN["Генерация артефакта\n(все обязательные секции)"]

    GEN --> SELF_REVIEW["Self-Review (Layer 0 inline):\n1. Structure check\n2. Content check\n3. Convention check\n4. Size check"]

    SELF_REVIEW --> REVIEW_PASS{"Все проверки\nпрошли?"}
    REVIEW_PASS -->|"Нет"| FIX["Исправить\nнайденные проблемы"]
    FIX --> SELF_REVIEW
    REVIEW_PASS -->|"Да"| SAVE

    SAVE["Сохранить артефакт\n(создать файловую структуру)"]

    SAVE --> OUTPUT["OUTPUT:\n✅ BUILD Complete\nArtifact: .claude/skills/<name>/\nFiles created: [список]\n\nNext: /bto-test .claude/skills/<name>/"]
```

### Пример: QUICK mode

**Вход:**
```
User: /bto-build skill for processing CSV files with pandas validation
```

**Поток исполнения:**
1. Тип: `skill` (ключевое слово "skill")
2. Режим: QUICK (чёткое описание)
3. Шаблон: SKILL.md + modules/ + references/ + examples/
4. Генерация: структурированный скилл
5. Self-review: проверка 8 критериев
6. Вывод: созданные файлы

**Пример: DEEP mode**

**Вход:**
```
User: /bto-build something for analyzing customer behavior
```

**Поток исполнения:**
1. Тип: `skill` (можно предположить)
2. Режим: DEEP (нечёткие требования)
3. Загрузка `explore` скилла
4. Кларификационные вопросы:
   - "Что является входными данными: логи, транзакции, сессии?"
   - "Какой формат выхода: отчёт, JSON, диаграммы?"
   - "Какой домен: e-commerce, SaaS, mobile?"
5. Requirements brief → подтверждение → генерация

---

## Flow: Test-only

### Sequence Diagram с Layer 0 → 1 → 2 → 3 прогрессией

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/bto-test)
    participant FS as File System
    participant H as haiku agent
    participant S1 as Sonnet (Expert)
    participant S2 as Sonnet (Critic)
    participant S3 as Sonnet (Auditor)
    participant O as Opus (Meta-Judge)

    U->>C: /bto-test .claude/skills/my-skill/

    Note over C: ─── Layer 0: Deterministic ───

    C->>FS: Прочитать SKILL.md и директорию
    C->>C: CHECK-U1..U5 (универсальные)
    C->>C: CHECK-S1..S10 (skill-специфичные)
    C-->>U: Layer 0: 9/10 passed (90%) ✅

    alt Layer 0 FAIL (< 80%)
        C-->>U: Layer 0 FAIL: конкретные ошибки
        C-->>U: ❌ CHECK-S4: Anti-Patterns section missing
        C-->>U: Остановка. Исправьте и повторите.
        Note over C: STOP
    end

    Note over C: ─── Layer 1: Quick (haiku) ───

    C->>H: Evaluate artifact (5 dimensions)
    H-->>C: CLARITY:8, COMPLETENESS:7, ACTIONABILITY:8,<br/>QUALITY:7, ANTI-PATTERNS:9
    H-->>C: Average: 7.8 — PASS ✅
    H-->>C: Top 3 improvements: [список]

    alt Layer 1 FAIL (< 5.0)
        C-->>U: Layer 1 FAIL: серьёзные структурные проблемы
        C-->>U: Layer 2 не запускается. Исправьте сначала.
        Note over C: STOP
    end

    Note over C: ─── Layer 2: Full Panel (параллельно) ───

    par Parallel judge execution
        C->>S1: Evaluate as Domain Expert
    and
        C->>S2: Evaluate as Critic
    and
        C->>S3: Evaluate as Completeness Auditor
    end

    S1->>FS: Записать judge-1.md
    S2->>FS: Записать judge-2.md
    S3->>FS: Записать judge-3.md

    Note over C: ─── Aggregation ───

    C->>FS: Прочитать judge-1.md, judge-2.md, judge-3.md
    C->>C: Compute: weighted average (0.4/0.3/0.3)
    C->>C: Disagreement check: max - min per dimension

    alt Disagreement > 3 (Layer 3)
        Note over C: ─── Layer 3: Meta-Judge ───
        C->>O: Reconcile disagreement on [DIMENSION]
        O-->>C: Reconciled score: 7.5 (Expert had most valid point)
    end

    C->>FS: Записать panel-verdict.md
    C-->>U: Evaluation Report (полный отчёт)
    C-->>U: Checkpoint: результаты оценки
```

### Пример отчёта TEST

```
═══════════════════════════════════════════════════════
📊 BTO EVALUATION REPORT
Artifact: .claude/skills/my-skill/SKILL.md
Type: skill
Level: Layer 0 + Layer 1 + Layer 2

OVERALL SCORE: 7.4 / 10  [PASS]

Per-Dimension:
  METHODOLOGY:  7.8  ████████░░░░
  DEPTH:        6.9  ███████░░░░░  ← ниже 7.0, target для OPTIMIZE
  CORRECTNESS:  8.1  █████████░░░
  USABILITY:    7.2  ████████░░░░
  ROBUSTNESS:   6.8  ███████░░░░░  ← ниже 7.0, target для OPTIMIZE

Flagged: DEPTH (Expert:7, Critic:4, Auditor:6 — disagreement=3, Meta-Judge applied)

Top Improvements:
1. [Critic] Добавить конкретные примеры для каждого шага протокола
2. [Auditor] Раздел edge cases отсутствует в modules/core.md
3. [Expert] Стратегия не описывает поведение при недоступном API
═══════════════════════════════════════════════════════
```

### Level параметр

`/bto-test [path] level=[layer0|layer1|layer2|full]`

| Level | Запускает | Стоимость | Когда использовать |
|-------|-----------|-----------|-------------------|
| `layer0` | Только детерминистические проверки | $0 | CI/CD pre-check, быстрая валидация |
| `layer1` | Layer 0 + haiku | ~$0.001 | Быстрая итерация при разработке |
| `layer2` | Layer 0 + Layer 1 + полная панель | ~$0.01 | Тщательная оценка |
| `full` (default) | Всё включая Meta-Judge при необходимости | ~$0.05 | Финальная оценка перед поставкой |

---

## Flow: Optimize-only

### Flowchart полного цикла оптимизации

```mermaid
flowchart TD
    START(["/bto-optimize [path]"]) --> PREREQ

    PREREQ["Проверить предусловия:\n• Артефакт прошёл Layer 0\n• Baseline Layer 2 установлен"] --> BASELINE_CHECK

    BASELINE_CHECK{"Baseline\n>= 8.0?"} -->|"Да"| ALREADY_GOOD

    ALREADY_GOOD["Артефакт уже высокого качества.\nПредложить только minor tweaks."]

    BASELINE_CHECK -->|"Нет (< 8.0)"| FIND_TARGETS

    FIND_TARGETS["Определить target dimensions\n(score < 7.0 из baseline)"] --> ROUND1

    subgraph ROUND1 ["Round 1: Mutation + Fast Eval"]
        R1_WORKERS["Spawn 3 mutation workers\n(sonnet, параллельно):\n• Worker 1: expand-depth → 2 варианта\n• Worker 2: add-metrics → 1 вариант\n• Worker 3: invert-critic → 2 варианта"]
        R1_L0["Каждый воркер:\nLayer 0 self-check на своих вариантах"]
        R1_HAIKU["Spawn 5 haiku fast-eval agents\n(параллельно, по 1 на вариант)"]
        R1_RANK["Ранжирование вариантов\nround-1-ranking.md"]
        R1_TOP2["Отбор Top-2 вариантов"]

        R1_WORKERS --> R1_L0
        R1_L0 --> R1_HAIKU
        R1_HAIKU --> R1_RANK
        R1_RANK --> R1_TOP2
    end

    FIND_TARGETS --> ROUND1
    R1_TOP2 --> ROUND2

    subgraph ROUND2 ["Round 2: Crossover + Fast Eval"]
        R2_CROSS["Spawn Crossover agent (opus):\nСинтез Top-2 → 3 варианта"]
        R2_L0_2["Crossover агент:\nLayer 0 self-check"]
        R2_HAIKU2["Spawn 3 haiku fast-eval agents\n(параллельно)"]
        R2_RANK2["Ранжирование\nround-2-ranking.md"]
        R2_TOP2_2["Отбор Top-2"]

        R2_CROSS --> R2_L0_2
        R2_L0_2 --> R2_HAIKU2
        R2_HAIKU2 --> R2_RANK2
        R2_RANK2 --> R2_TOP2_2
    end

    R1_TOP2 --> ROUND2
    R2_TOP2_2 --> ROUND3

    subgraph ROUND3 ["Round 3 (Final): Full Panel"]
        R3_CROSS["Spawn Crossover agent (opus):\n3 финальных варианта"]
        R3_L0_3["Layer 0 self-check"]
        R3_PANEL["Spawn Judge Panel:\n3 варианта × 3 судьи\n(9 параллельных sonnet агентов)"]
        R3_AGG["Агрегация всех 9 оценок\nВыбор победителя"]

        R3_CROSS --> R3_L0_3
        R3_L0_3 --> R3_PANEL
        R3_PANEL --> R3_AGG
    end

    R2_TOP2_2 --> ROUND3
    R3_AGG --> CONV_CHECK

    CONV_CHECK{"Delta > 0.5\nот baseline?"}
    CONV_CHECK -->|"Нет (< 0.5)"| CONVERGED["Сходимость.\nМинимальное улучшение.\nРекомендация: оставить оригинал."]
    CONV_CHECK -->|"Да"| REPORT

    REPORT["Генерация отчёта:\noptimization-report.md\n• Before/After delta\n• Winning strategy\n• Changelog"] --> CHECKPOINT

    CHECKPOINT["Human Checkpoint:\nПоказать отчёт пользователю"] --> DECISION

    DECISION{"Применить\nизменения?"} -->|"да"| APPLY
    DECISION -->|"нет"| DISCARD
    DECISION -->|"углубить [dim]"| EXTRA_ROUND

    APPLY["Применить победивший вариант\n→ перезаписать артефакт"]
    DISCARD["Оставить оригинал.\nОтчёт сохранён для референса."]
    EXTRA_ROUND["Запустить доп. раунд\nс фокусом на [dim]"]
```

### Пример отчёта OPTIMIZE

```
═══════════════════════════════════════════════════════
🔧 BTO OPTIMIZATION REPORT
Artifact: .claude/skills/my-skill/SKILL.md
Rounds: 3
Total evaluations: 15 (5×haiku + 3×haiku + 3×sonnet×3)

BEFORE → AFTER:
  METHODOLOGY:  7.8 → 8.2  (+0.4)
  DEPTH:        6.9 → 8.0  (+1.1) ⬆️
  CORRECTNESS:  8.1 → 8.3  (+0.2)
  USABILITY:    7.2 → 7.9  (+0.7) ⬆️
  ROBUSTNESS:   6.8 → 7.8  (+1.0) ⬆️

  OVERALL:      7.4 → 8.0  (+0.6) ⬆️

Winning Strategy: expand-depth + invert-critic (crossover)

CHANGELOG:
- Добавлены конкретные примеры для каждого шага протокола
- Раздел edge cases добавлен в modules/core.md
- Задокументировано поведение при недоступном API
- Убрана избыточность в разделе Quick Start
═══════════════════════════════════════════════════════
```

---

## Flow: Панель судей (Layer 2)

### Детальный Sequence Diagram

```mermaid
sequenceDiagram
    participant ORCH as Оркестратор
    participant J1 as Judge 1<br/>(Domain Expert, sonnet)
    participant J2 as Judge 2<br/>(Critic, sonnet)
    participant J3 as Judge 3<br/>(Auditor, sonnet)
    participant META as Meta-Judge<br/>(opus)
    participant FS as File System

    Note over ORCH: Все три агента спавнятся ОДНОВРЕМЕННО

    par Параллельное исполнение
        ORCH->>J1: Read artifact + rubric<br/>(NO communication with J2/J3)
    and
        ORCH->>J2: Read artifact + rubric<br/>(NO communication with J1/J3)
    and
        ORCH->>J3: Read artifact + structure-spec<br/>(NO communication with J1/J2)
    end

    J1->>FS: Записать judge-1.md<br/>(domain accuracy, tech depth, practicality)
    J2->>FS: Записать judge-2.md<br/>(logical consistency, verifiability, anti-patterns)
    J3->>FS: Записать judge-3.md<br/>(section coverage, depth per section, edge cases)

    Note over ORCH: Агрегация начинается только после получения ВСЕХ трёх оценок

    ORCH->>FS: Прочитать judge-1.md, judge-2.md, judge-3.md
    ORCH->>ORCH: Извлечь weighted subtotals<br/>S1 = Judge1_avg × 0.4<br/>S2 = Judge2_avg × 0.3<br/>S3 = Judge3_avg × 0.3
    ORCH->>ORCH: panel_score = S1 + S2 + S3
    ORCH->>ORCH: Проверка разногласий:<br/>Для каждого dimension:<br/>max(J1,J2,J3) - min(J1,J2,J3) > 3?

    alt Disagreement обнаружен (хотя бы в одном dimension)
        ORCH->>META: Read judge-1.md, judge-2.md, judge-3.md<br/>Read artifact + rubric<br/>Reconcile flagged dimensions
        META-->>ORCH: Reconciled score<br/>+ обоснование<br/>+ нужен ли human review?
        alt Meta-Judge требует human review
            ORCH-->>U: ESCALATE: человеческая проверка необходима
        else Разрешено
            ORCH->>ORCH: Применить reconciled score для flagged dimensions
        end
    end

    ORCH->>FS: Записать panel-verdict.md
    ORCH-->>U: Итоговый вердикт + Top improvements
```

### Калибровка судей

Ключевой момент архитектуры: три судьи намеренно имеют разную строгость.

```
Judge 1 (Expert, Weight 0.4):
  Calibration: Reserve 9-10 for genuinely exceptional work
  Expected average: 7-8 for solid artifacts

Judge 2 (Critic, Weight 0.3):
  Calibration: "If in doubt, score lower"
  Anti-pattern cap: if anti-pattern detected → cap criterion at 5
  Expected average: 5-6 (deliberately strict)

Judge 3 (Auditor, Weight 0.3):
  Calibration: -2 per missing required section
              -1 per stub section (< 3 substantive sentences)
  Expected average: 6-8 for well-structured artifacts
```

Такая асимметрия предотвращает **conformity collapse** — феномен, при котором все судьи без особой причины дают похожие оценки.

### Разрешение разногласий (Meta-Judge)

Meta-Judge вызывается при разногласии > 3 очков по любому измерению:

```
Пример: DEPTH dimension
  Expert:  8 (глубина достаточна для задачи)
  Critic:  4 (не хватает edge cases, вагое в нескольких местах)
  Auditor: 7 (структурно полно)
  Разногласие: 8 - 4 = 4 → > 3 → ESCALATE

Meta-Judge получает:
  • Все три оценки с обоснованиями
  • Сам артефакт
  • Запрос: "Кто прав и почему?"

Meta-Judge выводит:
  • Примирённую оценку (например: 6.5)
  • Обоснование: "Critic выявил реальные gaps в edge cases.
    Expert оценил base content, но не edge coverage.
    Reconciled: 6.5, с рекомендацией добавить 2 edge cases."
  • Human review: NO (разрешено)
```

### panel-verdict.md формат

```markdown
## Panel Verdict — my-skill/SKILL.md

**Panel score:** 7.4 / 10
**Judge scores:** Expert=7.8, Critic=6.5, Auditor=7.2
**Disagreement flag:** YES (DEPTH: Expert=8, Critic=4, Auditor=7)
**Meta-Judge applied:** YES → Reconciled DEPTH: 6.5
**Decision:** PASS
**Pass threshold:** 7.0

**Top improvement areas:**
- [Critic] Недостаточно edge cases в Protocol section
- [Auditor] modules/advanced.md — stub section (2 предложения)
```

---

## Flow: Раунд оптимизации

### Детальный Sequence Diagram

```mermaid
sequenceDiagram
    participant ORCH as Оркестратор
    participant W1 as Worker 1<br/>(expand-depth, sonnet)
    participant W2 as Worker 2<br/>(add-metrics, sonnet)
    participant W3 as Worker 3<br/>(invert-critic, sonnet)
    participant H1 as haiku eval 1
    participant H2 as haiku eval 2
    participant H3 as haiku eval 3
    participant H4 as haiku eval 4
    participant H5 as haiku eval 5
    participant CROSS as Crossover<br/>(opus)
    participant FS as File System

    Note over ORCH: ─── Round 1: Mutation ───

    par 3 Mutation Workers параллельно
        ORCH->>W1: Base artifact + strategy: expand-depth<br/>Target: DEPTH, ROBUSTNESS
    and
        ORCH->>W2: Base artifact + strategy: add-metrics<br/>Target: DEPTH
    and
        ORCH->>W3: Base artifact + strategy: invert-critic<br/>Target: адресовать blocking issues
    end

    W1->>W1: Layer 0 self-check на каждом варианте
    W2->>W2: Layer 0 self-check
    W3->>W3: Layer 0 self-check

    W1->>FS: variant-1-A.md, variant-1-B.md
    W1->>FS: mutation-log-1.md
    W2->>FS: variant-2-A.md
    W2->>FS: mutation-log-2.md
    W3->>FS: variant-3-A.md, variant-3-B.md
    W3->>FS: mutation-log-3.md

    Note over ORCH: ─── Fast Eval: 5 haiku параллельно ───

    par 5 haiku агентов параллельно
        ORCH->>H1: Eval variant-1-A
    and
        ORCH->>H2: Eval variant-1-B
    and
        ORCH->>H3: Eval variant-2-A
    and
        ORCH->>H4: Eval variant-3-A
    and
        ORCH->>H5: Eval variant-3-B
    end

    H1->>FS: score-1-A.txt
    H2->>FS: score-1-B.txt
    H3->>FS: score-2-A.txt
    H4->>FS: score-3-A.txt
    H5->>FS: score-3-B.txt

    ORCH->>FS: Прочитать все score-*.txt
    ORCH->>ORCH: Ранжирование по average score
    ORCH->>FS: Записать round-1-ranking.md

    Note over ORCH: Пример: variant-3-A (7.7) и variant-1-B (7.3) → Top-2

    Note over ORCH: ─── Round 2: Crossover ───

    ORCH->>CROSS: variant-3-A (Domain score best)<br/>variant-1-B (Completeness score best)<br/>Оценки обоих вариантов
    CROSS->>CROSS: Layer 0 self-check на crossover
    CROSS->>FS: variant-crossover.md + доп. варианты

    Note over ORCH: ─── Round 3: Full Panel (3 финальных варианта × 3 судьи) ───

    par 9 агентов параллельно (3 варианта × 3 судьи)
        Note over ORCH: Каждый из 3 финальных вариантов<br/>оценивается полной панелью судей
    end

    ORCH->>ORCH: Выбор победителя по highest overall score
    ORCH->>FS: Записать optimization-report.md
```

### round-ranking.md формат

```markdown
## Optimization Round 1 — Ranking

| Rank | Variant | R1 | R2 | R3 | Avg | Strategy |
|------|---------|----|----|----|----|---------|
| 1 | variant-3-A | 8 | 8 | 7 | 7.7 | invert-critic |
| 2 | variant-1-B | 7 | 8 | 7 | 7.3 | expand-depth |
| 3 | variant-2-A | 7 | 7 | 7 | 7.0 | add-metrics |
| 4 | variant-3-B | 6 | 7 | 7 | 6.7 | invert-critic |
| 5 | variant-1-A | 6 | 7 | 6 | 6.3 | expand-depth |

**Selected for Round 2:** variant-3-A, variant-1-B
**Discarded:** variant-2-A (avg 7.0, not top-2), variant-3-B (Layer 0: stub section), variant-1-A (low coherence)
```

### mutation-log формат

```markdown
## Mutation Log — Worker 3 — Round 1

**Strategy:** invert-critic
**Variants attempted:** 2
**Variants passed Layer 0:** 2
**Layer 0 failures:** none

**Substantive changes made:**
- Добавлены 3 edge cases в Protocol section (адресует "missing edge cases" из Critic)
- Формализована секция Failure Modes с конкретными сценариями
- Убраны вагые формулировки типа "может быть улучшено" → конкретные инструкции
```

---

## Flow: Ошибки и rejection

### Layer 0 Failure Flow

```mermaid
flowchart TD
    L0_FAIL["Layer 0 FAIL\n(< 80% проверок прошло)"] --> AUTO_RETRY{"Auto-retry:\nпопытка N/3"}

    AUTO_RETRY -->|"Попытка 1"| ATTEMPT1["Попытка исправления"]
    ATTEMPT1 --> L0_RECHECK["Повторный Layer 0"]
    L0_RECHECK -->|"PASS"| CONTINUE["Продолжить в Layer 1"]
    L0_RECHECK -->|"FAIL"| AUTO_RETRY

    AUTO_RETRY -->|"Попытка 2"| ATTEMPT2["Попытка исправления"]
    ATTEMPT2 --> L0_RECHECK2["Повторный Layer 0"]
    L0_RECHECK2 -->|"PASS"| CONTINUE
    L0_RECHECK2 -->|"FAIL"| AUTO_RETRY

    AUTO_RETRY -->|"Попытка 3 (последняя)"| ATTEMPT3["Попытка исправления"]
    ATTEMPT3 --> L0_RECHECK3["Повторный Layer 0"]
    L0_RECHECK3 -->|"PASS"| CONTINUE
    L0_RECHECK3 -->|"FAIL"| HUMAN_ESC["Эскалация на человека:\nLayer 0 не прошёл 3 попытки\nRequires manual fix"]

    HUMAN_ESC --> REPORT_L0["Отчёт с конкретными ошибками:\n❌ CHECK-S4: Anti-Patterns section missing (line 0)\n❌ CHECK-S7: Empty section: '## Dependencies' (line 45)\n✅ CHECK-S1..S3: passed\n✅ CHECK-S5..S6: passed\n..."]
```

### Rejection logging (обязательно)

Каждый rejected артефакт ДОЛЖЕН быть залогирован. Это правило из `bto-quality-gates.md`:

```
Причины rejection в Worker:
→ Записать в mutation-log-[WORKER_ID].md:
  • variant-1-A: REJECTED — Layer 0 failure: no Anti-Patterns section
  • variant-2-A: REJECTED — Length below minimum (200 tokens < 300 min)
  • variant-1-B: PASSED

НИКОГДА не отбрасывать молча.
```

### Anti-Pattern Detection Flow

```mermaid
flowchart TD
    CONTENT["Генерируемый контент"] --> CHECK_AP{"Auto-detection\nanti-patterns"}

    CHECK_AP -->|"Score inflation\n(все > 8.5 с 1-й попытки)"| FIX_INFLATION["Добавить calibration prompt\nк Critic судье"]

    CHECK_AP -->|"Overfitting to rubric\n(формулировки буквально\nпод рубрику)"| FIX_OVERFIT["Blind evaluation:\nскрыть рубрику от генератора"]

    CHECK_AP -->|"Conformity collapse\n(все судьи → одни оценки)"| FIX_CONFORM["Enforce isolation,\nрандомизировать порядок судей"]

    CHECK_AP -->|"Runaway optimization\n(> 10 итераций)"| FIX_RUNAWAY["ABORT:\nсдать best-so-far,\nlог + human review"]

    CHECK_AP -->|"Phantom improvement\n(delta > 0.5, но контент не изменился)"| FIX_PHANTOM["Diff-check контента,\nне только score"]

    CHECK_AP -->|"Judge-generator collusion\n(одна модель для генерации и оценки)"| FIX_COLLUSION["BLOCK:\nгенератор и судьи ДОЛЖНЫ\nиспользовать разные модели"]

    CHECK_AP -->|"Missing rejection log\n(отказы не логируются)"| FIX_LOG["Каждый отказ → mutation-log\nс причиной"]

    FIX_INFLATION & FIX_OVERFIT & FIX_CONFORM & FIX_RUNAWAY & FIX_PHANTOM & FIX_COLLUSION & FIX_LOG --> FLAG["Флагировать:\nWARNING label\nОстановить BTO loop\nОжидать human review"]
```

### Regression Rollback Flow

```mermaid
flowchart TD
    ROUND_N["Score раунда N"] --> REG_CHECK{"Score regression\n> 1.0 от baseline?"}

    REG_CHECK -->|"Да"| ROLLBACK["ROLLBACK:\nвернуть к предыдущему best\nЗалогировать regression"]
    REG_CHECK -->|"Нет"| DELTA_CHECK{"Delta ≤ 0.5\nуже 3 раунда?"}

    DELTA_CHECK -->|"Да"| CONVERGED["CONVERGENCE:\nМаксимальное улучшение достигнуто.\nОстановка."]
    DELTA_CHECK -->|"Нет"| CONTINUE["Продолжить следующий раунд"]

    ROLLBACK --> REPORT_REG["Отчёт:\n⚠️ REGRESSION DETECTED\nRound 3 score: 6.8 (was 7.4 baseline)\nRolled back to: variant-round2-B\nFinal score: 7.4"]

    CONVERGED --> REPORT_CONV["Отчёт:\n✅ CONVERGENCE\nRound 3 delta: 0.3 (< 0.5)\nRound 2 delta: 0.4 (< 0.5)\nRound 1 delta: 0.2 (< 0.5)\nBest found: X.X / 10"]
```

---

## Flow: Human Checkpoint

### Checkpoint после TEST

```mermaid
flowchart TD
    TEST_COMPLETE["TEST завершён"] --> DISPLAY_REPORT["Отобразить Evaluation Report"]

    DISPLAY_REPORT --> CHECKPOINT_BANNER["═══════════════════════════════════════════
⏸️ CHECKPOINT: BTO TEST Complete
Artifact: .claude/skills/my-skill/SKILL.md
Score: 7.4/10 — PASS

Per-dimension: METHODOLOGY 7.8 | DEPTH 6.9 | CORRECTNESS 8.1
               USABILITY 7.2 | ROBUSTNESS 6.8

Files created: panel-verdict.md ✅
• «ок» — запустить OPTIMIZE
• «стоп» — завершить, оставить как есть
• «углубить [dimension]» — детальный анализ
═══════════════════════════════════════════"]

    CHECKPOINT_BANNER --> USER_RESPONSE{"Ответ\nпользователя"}

    USER_RESPONSE -->|"ок"| RUN_OPTIMIZE["Запустить /bto-optimize"]
    USER_RESPONSE -->|"стоп"| DONE["Завершено.\nРезультат сохранён."]
    USER_RESPONSE -->|"углубить ROBUSTNESS"| DRILL_DOWN["Детальный анализ ROBUSTNESS:\nВзять judge-2.md (Critic)\nЭкстракт всех ROBUSTNESS-специфичных issues"]
    USER_RESPONSE -->|"[конкретный feedback]"| ADJUST["Адаптировать,\nзатем снова TEST"]
```

### Checkpoint после OPTIMIZE

```mermaid
flowchart TD
    OPT_COMPLETE["OPTIMIZE завершён"] --> DISPLAY_OPT_REPORT["Отобразить Optimization Report"]

    DISPLAY_OPT_REPORT --> OPT_CHECKPOINT["═══════════════════════════════════════════
🔧 CHECKPOINT: BTO OPTIMIZE Complete
Artifact: .claude/skills/my-skill/SKILL.md
Rounds: 3 | Evaluations: 15

BEFORE → AFTER:
  DEPTH:      6.9 → 8.0  (+1.1) ⬆️
  ROBUSTNESS: 6.8 → 7.8  (+1.0) ⬆️
  OVERALL:    7.4 → 8.0  (+0.6) ⬆️

Winning strategy: expand-depth + invert-critic (crossover)

Files created: optimization-report.md, winner.md ✅
• «да» — применить изменения к оригиналу
• «нет» — оставить оригинал
• «ещё раунд» — дополнительный раунд оптимизации
═══════════════════════════════════════════"]

    OPT_CHECKPOINT --> USER_OPT_RESPONSE{"Ответ\nпользователя"}

    USER_OPT_RESPONSE -->|"да"| APPLY_WINNER["Перезаписать артефакт\nпобедившим вариантом"]
    USER_OPT_RESPONSE -->|"нет"| KEEP_ORIG["Оставить оригинал.\noptimization-report.md сохранён."]
    USER_OPT_RESPONSE -->|"ещё раунд"| EXTRA_ROUND["Дополнительный раунд:\nфокус на оставшихся слабых dimension"]

    APPLY_WINNER --> FINAL_CHECKPOINT["Финальный checkpoint:\nBTO Complete ✅"]
```

### Обязательные checkpoints (из bto-quality-gates.md)

```
НИКОГДА не авто-одобрять без human checkpoint:
  ✓ После Layer 2 evaluation
  ✓ После финального раунда оптимизации
  ✓ Перед packaging/delivery артефакта

Исключение: Layer 0 rejections могут авто-ретраиться до 3 раз
             перед эскалацией на человека.
```

---

## Flow: Интеграция BTO в Keysarium пайплайн

### Sequence Diagram: Keysarium + BTO

```mermaid
sequenceDiagram
    actor U as User
    participant K as Claude (Keysarium)
    participant BTO as Claude (BTO)
    participant FS as File System

    Note over K: ═══ Keysarium: Phase 0 ═══
    K->>FS: Write researches/slug/00_product_discovery.md
    K-->>U: Checkpoint 0: Discovery Complete

    U->>K: "bto test"
    K->>BTO: /bto-test researches/slug/00_product_discovery.md
    BTO->>FS: Layer 0 checks
    BTO->>BTO: Layer 2: панель судей (research artifact rubric)
    BTO-->>K: Score: 7.2/10 — Top issues: [список]
    BTO-->>U: TEST Report

    U->>K: "ок, продолжаем"

    Note over K: ═══ Keysarium: Phase 2 ═══
    K->>FS: Write researches/slug/02_research_findings.md
    K-->>U: Checkpoint 2: Research Complete

    Note over K: ═══ Keysarium: Phase 5 ═══
    K->>FS: Write 05..08_*.md
    K-->>U: Checkpoint 5: Presentation Complete

    U->>K: "bto optimize presentation"
    K->>BTO: /bto-optimize researches/slug/05_presentation_content.md
    BTO->>BTO: Baseline Layer 2: 6.8/10
    BTO->>BTO: 3 раунда оптимизации
    BTO-->>K: 7.6/10 (+0.8) — winner.md готов
    BTO-->>U: OPTIMIZE Report
    U->>BTO: "да"
    BTO->>FS: Перезаписать 05_presentation_content.md

    Note over K: ═══ Keysarium: Phase 6 ═══
    K->>FS: Write README.md
    K-->>U: Полный архив исследования
```

### Создание нового скилла через BTO в контексте Keysarium

```mermaid
sequenceDiagram
    actor DEV as Разработчик
    participant BTO as Claude (BTO)
    participant FS as File System

    DEV->>BTO: /bto-build "skill for domain-specific task"

    BTO->>BTO: BUILD DEEP mode (нечёткие требования)
    BTO->>BTO: Загрузить explore skill
    BTO-->>DEV: Кларификационные вопросы (5 вопросов)
    DEV->>BTO: Ответы
    BTO->>BTO: Requirements brief
    BTO-->>DEV: Подтвердить requirements?
    DEV->>BTO: "ок"

    BTO->>FS: Создать .claude/skills/new-skill/SKILL.md
    BTO->>FS: Создать modules/*.md, references/*.md, examples/*.md
    BTO->>BTO: Self-review (Layer 0 inline)
    BTO-->>DEV: BUILD Complete ✅

    BTO->>BTO: Automatic /bto-test .claude/skills/new-skill/
    BTO->>BTO: Layer 0 + Layer 1 + Layer 2
    BTO-->>DEV: Score: 8.1/10 [PASS]
    BTO-->>DEV: Checkpoint: применить / оптимизировать?

    DEV->>BTO: "ок, применить"
    BTO-->>DEV: BTO Complete ✅ — скилл готов к использованию в Keysarium

    Note over DEV: Скилл теперь доступен в .claude/skills/new-skill/<br/>Использовать в /casarium через фазы
```

### BTO в CI/CD (только Layer 0)

Для автоматических проверок при коммите или в pipeline — использовать только Layer 0 (бесплатно):

```
# Пример: проверка всех skills при изменении
/bto-test .claude/skills/ level=layer0

Вывод:
  .claude/skills/bto/SKILL.md:         9/10 ✅
  .claude/skills/explore/SKILL.md:     10/10 ✅
  .claude/skills/my-new-skill/SKILL.md: 7/10 ❌ (CHECK-S4, CHECK-S10 failed)

  Total: 2/3 passed
```

### Использование BTO для Harvest знаний

После завершения Keysarium исследования BTO помогает валидировать извлечённые паттерны:

```mermaid
flowchart LR
    RESEARCH["researches/slug/"] --> HARVEST["/harvest researches/slug/"]
    HARVEST --> NEW_SKILL["Новый скилл в .claude/skills/new-pattern/"]
    NEW_SKILL --> BTO_BUILD["/bto-build (refinement)"]
    BTO_BUILD --> BTO_TEST["/bto-test"]
    BTO_TEST --> BTO_OPT["/bto-optimize (если score < 8.0)"]
    BTO_OPT --> TOOLKIT_UPDATE["Обновить TOOLKIT_HARVEST.md\n(скилл прошёл BTO = проверен)"]
```

---

## Быстрый справочник команд

| Команда | Назначение | Минимальный вход | Стоимость |
|---------|-----------|-----------------|-----------|
| `/bto [path]` | Полный пайплайн BUILD→BENCHMARK→TEST→OPTIMIZE | Путь или описание | ~$0.16 |
| `/bto-build [description]` | Только генерация | Текстовое описание | ~$0.01 |
| `/bto-benchmark [path]` | Детерминистический бенчмаркинг | Путь к артефакту | ~$0.001 |
| `/bto-test [path]` | Только оценка (full) | Путь к артефакту | ~$0.01 |
| `/bto-test [path] level=layer0` | Только Layer 0 | Путь к артефакту | $0 |
| `/bto-test [path] level=layer1` | Layer 0 + haiku | Путь к артефакту | ~$0.001 |
| `/bto-optimize [path]` | Только оптимизация | Путь + baseline eval | ~$0.13 |

## Частые сценарии использования

```
# Быстрая проверка нового артефакта
/bto-test .claude/skills/new-skill/ level=layer1

# Полный цикл для нового скилла
/bto-build "создать skill для [задача]"

# Улучшение существующего слабого артефакта
/bto-optimize .claude/skills/weak-skill/SKILL.md

# Валидация research документа в Keysarium
/bto-test researches/my-case/02_research_findings.md

# Проверка всех skills (только структура, бесплатно)
/bto-test .claude/skills/ level=layer0

# Полный цикл для критического артефакта перед сдачей
/bto .claude/skills/important-skill/SKILL.md
```
