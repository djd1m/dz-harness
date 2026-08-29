---
name: idea2prd-manual
description: >
  Полный цикл от проблемы/идеи до документации для Vibe Coding с контрольными точками.
  Автоматически определяет тип входа: проблема → Analyst pipeline → идея → PRD pipeline.
  Использует внешние скиллы explore, goap-research-ed25519, problem-solver-enhanced (полностью).
  Включает Pseudocode generation, Test Scenarios, Completion Checklist.
  Режим MANUAL — запрашивает подтверждение между каждой фазой (9 checkpoints).
  Триггеры: "сделай PRD пошагово", "idea to prd manual", "prd with checkpoints".
trust_tier: 1
---

# Idea2PRD Manual: Full-Cycle Documentation with Checkpoints

Скилл полного цикла: от проблемы или идеи до готовой документации с **Pseudocode** и **Completion Checklist**. **С контрольными точками (9 checkpoints)** — пользователь подтверждает каждую фазу.

## What's New in v2

| Feature | Benefit |
|---------|---------|
| **Phase 4.5: Pseudocode** | Algorithm logic fixed before code, so codegen implements a decided design rather than inventing one (see `references/pseudocode-style.md`) |
| **Phase 5: Test Scenarios** | TDD-ready Gherkin specs |
| **Phase 6: Completion** | CI/CD, deployment, monitoring |
| **9 Checkpoints** | Full control over each phase |

## What's New in v3 (honesty + memory layer)

| Feature | Benefit |
|---------|---------|
| **Claim Discipline** | Every accuracy/count/percentage claim in an emitted doc carries an honest tag (MEASURED / CLAIMED / ESTIMATED) — no unsourced numbers |
| **ADR Confirmation stanza** | Every generated ADR names its load-bearing property + the fitness function / Gherkin test that would falsify it (Phase 3 → Phase 5 wired) |
| **Brain memory (Step 0 recall → closing teach)** | Recalls prior PRD/ADR lessons into the brief and teaches new ones at the end — idea2prd stops being write-once |

---

## Authoring Discipline (applies to EVERY emitted doc)

### Claim Discipline (MEASURED / CLAIMED / ESTIMATED) — mandatory

The docs this skill emits (PRD, ADRs, fitness targets, executive summary) **must not carry untagged
accuracy, count, percentage, or performance claims.** Whenever you write a metric term next to a number
(`%`, `x faster`, coverage, latency, "N of M", "reduces … by …"), the same paragraph MUST carry one of
these honest tags, else do not write the number:

| Tag | Use when |
|-----|----------|
| `(MEASURED — <reproducer / source>)` | You actually ran/observed it — cite the command, file, or source |
| `(CLAIMED — <who/where>)` | Repeating an external/vendor claim you did not verify — attribute it |
| `(ESTIMATED — <basis>)` | A projection or target, not an observation — name the basis |

**Rule:** an untagged number that looks like a result is a defect. Prefer deleting a fabricated number
over dressing it up. This applies to **fitness-function targets and count tables too** — a target cell or
a count cell is a claim: template it as a `[placeholder]` and tag the real value MEASURED (an observed
baseline, naming its reproducer) or ESTIMATED (a chosen target, naming its basis) when it is filled in.

**Perfect-score prohibition:** a bare `100%` / `0 defects` / `never fails` / `always` cell is always a
HIGH finding — `dz claim-check` flags such a literal even when tagged, because perfection is almost never
observed. State the real value against a baseline (tag it MEASURED, name the reproducer), or express a
target as ESTIMATED with its basis (for example `target >= 95 (ESTIMATED from NFR-P01)`).

(This mirrors the harness Integrity Rule; a `dz claim-check` scan over the emitted `docs/` should pass —
run it if `dz` is available: `dz claim-check docs/ --fail-on medium`. Use `medium`, not `high`: `high`
lets ordinary untagged medium claims through — the false-green this discipline exists to stop.)

### Brain memory — recall at Step 0, teach at the end (pin ONE canonical store)

If the `dz` CLI is available, idea2prd **learns across runs**. The learned-pattern store is pinned to
**ONE canonical brain store** — the project root as an ABSOLUTE path (the directory that will hold
`docs/`) — via `--project`, so lessons land in one store instead of fragmenting across sub-directories
(a recall from one store and a teach to another cannot reinforce each other):

- **Step 0 (before Gate 0):** recall prior PRD/ADR lessons and fold the top ones into the brief.
- **Closing (after Phase 6):** teach the genuinely new lessons from this run.

Both are guarded by "if `dz` present" — absent `dz`, skip silently and run the pipeline unchanged.

---

## Step 0: Brain Recall (run BEFORE Gate 0)

**Action (only if `dz` is on PATH — else skip silently):** resolve `<BRAIN>` to the **ABSOLUTE** path of
the project root (the directory that will hold `docs/`, e.g. via `pwd`) and use that SAME absolute path in
Step 0 recall and the closing teach. Via Bash run VERBATIM (`<BRAIN>` shell-quoted so a path with spaces
does not break the command):

```bash
cd "<BRAIN>" && dz recall "<key domain terms of this idea/problem> PRD ADR bounded-context" --project "<BRAIN>"
```

> `<BRAIN>` MUST be absolute. A relative `<BRAIN>` makes `cd "<BRAIN>"` then `--project "<BRAIN>"` resolve
> against the new working directory (a nested `<BRAIN>/<BRAIN>`), pinning the store to the wrong place.

- Log the number of patterns loaded.
- Fold the top 3 applicable patterns into the Task Brief / Requirements as a `{LEARNED_PATTERNS}` note,
  and **preserve their text** so the closing teach step can compare candidate lessons against them.
- No patterns (first run) → proceed normally.

## Bundled Components

```
idea2prd-manual/
├── SKILL.md                              # Этот файл (оркестратор)
├── scripts/
│   ├── c4_generator.py                   # Генератор C4 диаграмм
│   ├── fitness_validator.py              # Валидатор Fitness Functions
│   ├── pseudocode_generator.py           # [NEW] Генератор pseudocode
│   └── ai_context_builder.py             # Сборщик .ai-context/
└── references/
    ├── ddd-patterns.md                   # DDD patterns
    ├── adr-catalog.md                    # ADR templates
    ├── c4-model.md                       # C4 guidelines
    ├── fitness-functions-catalog.md      # Fitness Functions
    ├── pseudocode-style.md               # [NEW] Pseudocode conventions
    └── completion-checklist-template.md  # [NEW] Completion template
```

## External Skills Dependencies

**Для Analyst Pipeline используются внешние скиллы (full execution):**

| Phase | External Skill | Path | Mode |
|-------|----------------|------|------|
| Phase A | `explore` | `.claude/skills/explore/SKILL.md` | Full with questions |
| Phase B | `goap-research-ed25519` | `.claude/skills/goap-research-ed25519/SKILL.md` | Full research |
| Phase C | `problem-solver-enhanced` | `.claude/skills/problem-solver-enhanced/SKILL.md` | All 9 modules |

## When to Use AUTO vs MANUAL

| Use AUTO when | Use MANUAL when |
|---------------|-----------------|
| Проблема/идея ясна | Много неизвестных |
| Нужен быстрый результат | Критически важный продукт |
| Готовы к defaults | Нужен контроль |
| MVP / прототип | Production system |

## Full Pipeline with Checkpoints

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT: Проблема ИЛИ Идея                                       │
│                         ↓                                       │
│  GATE 0: Problem or Idea? (auto-detect)                         │
│  → Проблема? → ANALYST PIPELINE (full)                          │
│  → Идея? → Skip to PRD PIPELINE                                 │
│                         ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ANALYST PIPELINE (external skills, with checkpoints)   │    │
│  │                                                         │    │
│  │  Phase A: view(explore) → questions → Task Brief        │    │
│  │  ⏸️ CHECKPOINT A: Confirm Task Brief                    │    │
│  │                                                         │    │
│  │  Phase B: view(goap-research) → research → Findings     │    │
│  │  ⏸️ CHECKPOINT B: Confirm Research                      │    │
│  │                                                         │    │
│  │  Phase C: view(problem-solver) → ALL 9 modules → Idea   │    │
│  │  ⏸️ CHECKPOINT C: Confirm Product Idea                  │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  PRD PIPELINE (embedded, with checkpoints)              │    │
│  │                                                         │    │
│  │  Phase 1: Requirements → PRD.md                         │    │
│  │  ⏸️ CHECKPOINT 1: Confirm Requirements                  │    │
│  │                                                         │    │
│  │  Phase 2: DDD Strategic → bounded-contexts              │    │
│  │  ⏸️ CHECKPOINT 2: Confirm DDD Strategic                 │    │
│  │                                                         │    │
│  │  Phase 3: ADR + C4 → 10+ ADRs, diagrams                 │    │
│  │  ⏸️ CHECKPOINT 3: Confirm Architecture                  │    │
│  │                                                         │    │
│  │  Phase 4: DDD Tactical → aggregates, schema             │    │
│  │  ⏸️ CHECKPOINT 4: Confirm Tactical Design               │    │
│  │                                                         │    │
│  │  Phase 4.5: Pseudocode → algorithm logic [NEW]          │    │
│  │  ⏸️ CHECKPOINT 4.5: Confirm Pseudocode                  │    │
│  │                                                         │    │
│  │  Phase 5: Validation → fitness, tests, .ai-context/     │    │
│  │  ⏸️ CHECKPOINT 5: Confirm Tests & Validation            │    │
│  │                                                         │    │
│  │  Phase 6: Completion → deploy, CI/CD [NEW]              │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         ↓                                       │
│  OUTPUT: Complete docs/ + .ai-context/ + Executive Summary      │
└─────────────────────────────────────────────────────────────────┘
```

**Total Checkpoints: 9** (3 Analyst + 6 PRD)

---

## Gate 0: Auto-Detection

**Автоматически определяет тип входа:**

| Тип | Индикаторы | Action |
|-----|------------|--------|
| **ПРОБЛЕМА** | Боль, негатив, "как?", нет решения | → Analyst Pipeline |
| **ИДЕЯ** | Конкретный продукт, функции, аудитория | → PRD Pipeline |

**При неясности — max 1 вопрос:**
```
Уточни: это проблема для решения или готовая идея продукта?
```

---

## ANALYST PIPELINE (Full Execution with Checkpoints)

**ВАЖНО:** Claude загружает внешние скиллы через `view` tool и выполняет ПОЛНОСТЬЮ, с контрольными точками.

### Phase A: Explore

**Действие Claude:**
```
1. view(".claude/skills/explore/SKILL.md")
2. Выполнить explore полностью:
   - Задать необходимые вопросы
   - Получить ответы от пользователя
3. Сформировать Task Brief
4. ⏸️ CHECKPOINT A
```

**Checkpoint A Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE A COMPLETE: Task Brief
═══════════════════════════════════════════════════════════

## Task Brief

**Проблема:** [описание]
**Контекст:** [детали]
**Цели:** [что хотим достичь]
**Ограничения:** [если есть]

───────────────────────────────────────────────────────────
⏸️ Подтвердите Task Brief для продолжения к Research.
   Ответьте "ok" или внесите корректировки.
═══════════════════════════════════════════════════════════
```

### Phase B: Research

**Действие Claude:**
```
1. view(".claude/skills/goap-research-ed25519/SKILL.md")
2. Выполнить research:
   - Web searches
   - Competitor analysis
   - Technology options
3. Сформировать Research Findings
4. ⏸️ CHECKPOINT B
```

**Checkpoint B Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE B COMPLETE: Research Findings
═══════════════════════════════════════════════════════════

## Research Findings

**Competitors:** [список]
**Market Insights:** [ключевые находки]
**Technology Options:** [рекомендации]
**Gaps Identified:** [возможности]

───────────────────────────────────────────────────────────
⏸️ Подтвердите Research для продолжения к Problem-Solver.
   Ответьте "ok" или запросите дополнительное исследование.
═══════════════════════════════════════════════════════════
```

### Phase C: Solve (Full Problem-Solver)

**Действие Claude:**
```
1. view(".claude/skills/problem-solver-enhanced/SKILL.md")
2. Выполнить ВСЕ 9 модулей:
   - First Principles
   - Root Cause (5 Whys)
   - Constraint Analysis
   - SCQA
   - Game Theory
   - Second-Order Effects
   - TRIZ
   - Devil's Advocate
   - Synthesis
3. Сформировать Product Idea
4. ⏸️ CHECKPOINT C
```

**Checkpoint C Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE C COMPLETE: Product Idea
═══════════════════════════════════════════════════════════

## Product Idea

**Название:** [название]
**Описание:** [что это]
**Target Audience:** [для кого]
**Core Features:** [ключевые функции]
**Differentiation:** [чем отличается]

## Problem Analysis Highlights

| Module | Key Insight |
|--------|-------------|
| Root Cause | [finding] |
| Game Theory | [finding] |
| TRIZ | [finding] |

───────────────────────────────────────────────────────────
⏸️ Подтвердите Product Idea для продолжения к PRD Pipeline.
   Ответьте "ok" или скорректируйте направление.
═══════════════════════════════════════════════════════════
```

---

## PRD PIPELINE (with Checkpoints)

### Phase 1: Requirements

**Генерирует:**
- 10+ Functional Requirements (MoSCoW)
- 5+ Non-Functional Requirements
- 5+ User Stories
- 2+ User Journeys
- Constraints & Assumptions

**Checkpoint 1 Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE 1 COMPLETE: Requirements
═══════════════════════════════════════════════════════════

## Summary

| Type | Count |
|------|-------|
| Functional Requirements | [N] |
| Non-Functional Requirements | [N] |
| User Stories | [N] |
| User Journeys | [N] |

## Key Requirements

**Must Have:**
- [FR-001] [description]
- [FR-002] [description]
...

**User Stories Preview:**
- US-001: As a [user], I want [action], so that [benefit]
...

───────────────────────────────────────────────────────────
⏸️ Подтвердите Requirements для продолжения к DDD Strategic.
   Ответьте "ok" или внесите корректировки.
═══════════════════════════════════════════════════════════
```

### Phase 2: DDD Strategic

**Генерирует:**
- 3+ Bounded Contexts
- Ubiquitous Language per context
- Context Map with relationships
- Subdomains (Core/Supporting/Generic)
- 5+ Strategic Domain Events

**Checkpoint 2 Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE 2 COMPLETE: DDD Strategic Design
═══════════════════════════════════════════════════════════

## Bounded Contexts

| Context | Type | Responsibility |
|---------|------|----------------|
| [Context1] | Core | [what it does] |
| [Context2] | Supporting | [what it does] |
...

## Context Map

[Mermaid diagram]

───────────────────────────────────────────────────────────
⏸️ Подтвердите DDD Strategic для продолжения к Architecture.
   Ответьте "ok" или пересмотрите границы контекстов.
═══════════════════════════════════════════════════════════
```

### Phase 3: ADR + C4

**Reference:** `references/adr-catalog.md` (ADR template — the `## Confirmation` stanza is REQUIRED).

**Генерирует:**
- 10+ ADRs — **every ADR MUST carry a `## Confirmation` stanza** (Method / Monitoring / Success metric /
  Owner / **Load-bearing property** / **Required automated check: `<fitness function or Gherkin test>`**).
  The named check MUST be a real Phase-5 artifact (a `FF-NNN` fitness function or a `.feature` Gherkin
  scenario) — this is what wires Phase 3 → Phase 5 and turns each ADR from prose into a *checkable*
  decision. An ADR whose Confirmation names no falsifying test is incomplete.
- C4 Level 1: System Context
- C4 Level 2: Container
- C4 Level 3: Component

**Checkpoint 3 Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE 3 COMPLETE: Architecture
═══════════════════════════════════════════════════════════

## ADRs Summary

| ADR | Decision | Status | Load-bearing property | Falsifying test |
|-----|----------|--------|-----------------------|-----------------|
| ADR-001 | [Architecture]: [choice] | Accepted | [property] | FF-NNN / [feature].feature |
| ADR-002 | [Database]: [choice] | Accepted | [property] | FF-NNN / [feature].feature |
...

> **Confirmation check:** every row above MUST name a load-bearing property and a real falsifying test —
> a `FF-NNN` fitness function id (3-digit, matching `references/fitness-functions-catalog.md`) or a Gherkin
> `.feature` scenario. A blank = an incomplete ADR — go back. **Phase 5 re-checks this table** (see the
> Phase-5 "ADR Confirmation reconciliation" step): every id named here must EXIST in the Phase-5 output.

## C4 Diagrams

- Level 1: System Context ✅
- Level 2: Container ✅
- Level 3: Component ✅

───────────────────────────────────────────────────────────
⏸️ Подтвердите Architecture для продолжения к DDD Tactical.
   Ответьте "ok" или оспорьте ADRs.
═══════════════════════════════════════════════════════════
```

### Phase 4: DDD Tactical

**Per Bounded Context генерирует:**
- 1-3 Aggregates
- Entities with identity
- Value Objects
- Domain Events (detailed)
- Repository interfaces
- Services
- Database Schema (SQL)

**Checkpoint 4 Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE 4 COMPLETE: DDD Tactical Design
═══════════════════════════════════════════════════════════

## Aggregates

| Context | Aggregate | Entities | Events |
|---------|-----------|----------|--------|
| [Ctx1] | [Agg1] | [N] | [N] |
...

## Key Aggregate Methods

**[AggregateName]:**
- create(...): [description]
- [method](...): [description]
...

───────────────────────────────────────────────────────────
⏸️ Подтвердите Tactical Design для продолжения к Pseudocode.
   Ответьте "ok" или скорректируйте агрегаты.
═══════════════════════════════════════════════════════════
```

---

### Phase 4.5: Pseudocode Generation [NEW]

**Reference:** `references/pseudocode-style.md`

**Псевдокод фиксирует алгоритмическую логику ДО кодогенерации — кодоген реализует уже принятый дизайн, а не изобретает его по ходу.** (Никаких неподтверждённых процентов: любые метрики качества эмитятся только с честным тегом — см. раздел «Claim Discipline».)

**Действие Claude:**
```
1. Для каждого Aggregate из Phase 4:
   - Для каждого public метода → сгенерировать pseudocode
   
2. Для каждого Domain Service:
   - Для каждого метода → сгенерировать pseudocode
   
3. Output: docs/pseudocode/{AggregateName}.pseudo
4. ⏸️ CHECKPOINT 4.5
```

**Pseudocode Style:**

```pseudocode
FUNCTION methodName(param1: Type, param2: Type) -> ReturnType:
    // Pre-conditions
    VALIDATE param1 is not empty
    
    // Main logic
    FOR each item IN collection:
        IF condition THEN
            DO action
        END IF
    END FOR
    
    // Side effects
    EMIT DomainEvent(data)
    
    RETURN result
END FUNCTION
```

**Checkpoint 4.5 Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE 4.5 COMPLETE: Pseudocode
═══════════════════════════════════════════════════════════

## Pseudocode Files Generated

| File | Aggregate/Service | Methods |
|------|-------------------|---------|
| OrderAggregate.pseudo | Order | 5 |
| PaymentService.pseudo | PaymentService | 3 |
...

## Sample: OrderAggregate.placeOrder

```pseudocode
FUNCTION placeOrder(items, customer) -> OrderId:
    VALIDATE items not empty
    VALIDATE customer.isVerified
    
    FOR each item IN items:
        CHECK inventory.hasStock(item)
    END FOR
    
    total = CALCULATE subtotal + tax
    order = CREATE Order(customer, items, total)
    
    EMIT OrderPlacedEvent(order.id, total)
    RETURN order.id
END FUNCTION
```

───────────────────────────────────────────────────────────
⏸️ Подтвердите Pseudocode для продолжения к Tests.
   Ответьте "ok" или скорректируйте алгоритмы.
═══════════════════════════════════════════════════════════
```

---

### Phase 5: Validation, Tests & AI Context [ENHANCED]

**Генерирует:**
- 5+ Fitness Functions (ids in the canonical `FF-NNN` 3-digit form — see `references/fitness-functions-catalog.md`)
- 5+ Gherkin Test Scenarios
- 8 .ai-context/ files

**ADR Confirmation reconciliation (REQUIRED — consumes the Phase-3 ADR table):**

Phase 5 is where each ADR's Confirmation stops being a promise. Before the Phase-5 checkpoint, iterate the
Checkpoint-3 **ADRs Summary** table and, for EVERY ADR, verify:

1. Its `Falsifying test` names a concrete artifact — a `FF-NNN` id or a `<feature>.feature` scenario — not
   a placeholder (`FF-NNN`, `[feature]`, `TBD`, blank).
2. That artifact ACTUALLY EXISTS in this Phase-5 output: the `FF-NNN` id appears in the Fitness Functions
   table (and `references/fitness-functions-catalog.md` / `scripts/fitness_validator.py`), or the `.feature`
   file is in `docs/tests/`.
3. The named test is tied to the ADR's **load-bearing property** — it would go RED if that property were
   violated (not merely a generic happy-path scenario).

A missing, placeholder, or property-mismatched test is an **incomplete ADR ⇒ Phase 5 is NOT signed off**:
go back and add the fitness function / Gherkin scenario (or correct the ADR). Emit the result as the "ADR
Confirmation Coverage" block below (every ADR row must read `✅ mapped`; any `🔴 unmapped` blocks sign-off).

**Test Scenarios (Gherkin):**

```gherkin
Feature: Order Placement
  Scenario: Successfully place order
    Given I am a verified customer
    And all items are in stock
    When I place the order
    Then the order should be created
    And I should receive confirmation
```

**Checkpoint 5 Output:**
```
═══════════════════════════════════════════════════════════
✅ PHASE 5 COMPLETE: Validation & Tests
═══════════════════════════════════════════════════════════

## Fitness Functions

| ID | Rule | Target |
|----|------|--------|
| FF-001 | BC Independence | [target — tag MEASURED baseline or ESTIMATED from an NFR] |
| FF-002 | Aggregate Size | [threshold — e.g. entity cap, tag ESTIMATED with its basis] |
...

> Targets are claims: fill each with a tagged value (MEASURED baseline / ESTIMATED target), never a naked
> perfect score. See "Authoring Discipline → Claim Discipline".

## ADR Confirmation Coverage

| ADR | Load-bearing property | Named test | Exists in Phase 5? |
|-----|-----------------------|------------|--------------------|
| ADR-001 | [property] | FF-NNN / [feature].feature | ✅ mapped |
| ADR-002 | [property] | FF-NNN / [feature].feature | ✅ mapped |
...

> Any `🔴 unmapped` row blocks Phase-5 sign-off (the ADR named a test that does not exist here).

## Test Scenarios

| Feature | Scenarios | Coverage |
|---------|-----------|----------|
| Order Placement | 3 | Happy + 2 Error |
| Payment | 2 | Happy + 1 Error |
...

## .ai-context/ Files

✅ 8 files generated:
- README.md
- architecture-summary.md
- key-decisions.md
- domain-glossary.md
- bounded-contexts.md
- coding-standards.md
- fitness-rules.md
- pseudocode-index.md

───────────────────────────────────────────────────────────
⏸️ Подтвердите Tests & Validation для продолжения к Completion.
   Ответьте "ok" или добавьте test scenarios.
═══════════════════════════════════════════════════════════
```

---

### Phase 6: Completion Checklist [NEW]

**Генерирует deployment-ready документацию:**
- Development environment setup
- CI/CD pipeline templates
- Docker/K8s manifests
- Monitoring configuration
- Security checklist
- Pre-launch checklist

**Output file:** `docs/completion/COMPLETION_CHECKLIST.md`

**После Phase 6 — Brain Teach, затем финальный Executive Summary (без checkpoint).**

---

## Closing: Brain Teach (run AFTER Phase 6, only if `dz` present — else skip silently)

Close the learning loop: teach the genuinely NEW lessons from this run to the SAME canonical brain store
that Step 0 recalled from — the SAME ABSOLUTE `<BRAIN>` path (the project root), pinned with `--project`
so nothing fragments.

**Action:**
1. Compare the run's candidate lessons (a reusable PRD/ADR/DDD decision, a domain constraint that bit, a
   fitness-function pattern) against the `{LEARNED_PATTERNS}` text recalled in Step 0.
2. For a lesson ALREADY covered by a recalled pattern → do NOT re-teach it (it is already in the store).
3. For each genuinely NEW lesson, via Bash run VERBATIM (one call per lesson):

```bash
cd "<BRAIN>" && dz teach "<one-line reusable lesson>" --reward 0.7 --domain idea2prd --project "<BRAIN>"
```

4. Log how many lessons were taught (0 is a valid, honest result on a run that surfaced nothing new).

> **Pin discipline:** Step 0 recall and this teach MUST hit the SAME absolute `<BRAIN>` (project root) via
> `--project`, shell-quoted — if recall reads one store and teach writes another, the two stores stay
> separate and the loop does not accumulate in a single place. This mirrors the feature-adr `args.brain` rule.

---

## Executive Summary Template

После генерации выводится:

```
═══════════════════════════════════════════════════════════════
✅ DOCUMENTATION COMPLETE: [Product Name]
═══════════════════════════════════════════════════════════════

## Input Processing

**Input Type:** [Problem | Idea]
**Analyst Pipeline:** [Executed | Skipped]
**Checkpoints Passed:** [N]/9

## Summary

| Category | Count |
|----------|-------|
| Functional Requirements | [N] |
| Non-Functional Requirements | [N] |
| User Stories | [N] |
| Bounded Contexts | [N] |
| ADRs | [N] |
| C4 Diagrams | [N] |
| Aggregates | [N] |
| Domain Events | [N] |
| **Pseudocode Files** | [N] |
| **Test Scenarios** | [N] |
| Fitness Functions | [N] |
| .ai-context/ files | 8 |

## Files Generated

docs/
├── prd/PRD.md
├── ddd/strategic/[files]
├── ddd/tactical/[files]
├── adr/[10+ files]
├── c4/[files]
├── pseudocode/[files]           # [NEW]
├── tests/[feature files]        # [NEW]
├── fitness/[files]
├── completion/COMPLETION_CHECKLIST.md  # [NEW]
└── INDEX.md

.ai-context/
└── [8 files]

## Vibe Coding Quick Start

\`\`\`bash
# Implement with pseudocode guidance
claude "Implement OrderAggregate using docs/pseudocode/OrderAggregate.pseudo"

# Generate tests
claude "Generate tests from docs/tests/*.feature"

# Deploy
claude "Follow docs/completion/COMPLETION_CHECKLIST.md"
\`\`\`

═══════════════════════════════════════════════════════════════
```

---

## Output Structure

```
project-root/
├── docs/
│   ├── prd/PRD.md
│   ├── ddd/
│   │   ├── strategic/
│   │   └── tactical/
│   ├── adr/
│   ├── c4/
│   ├── pseudocode/              # [NEW]
│   │   ├── {Aggregate1}.pseudo
│   │   └── {Service1}.pseudo
│   ├── tests/                   # [NEW]
│   │   └── {feature}.feature
│   ├── fitness/
│   ├── completion/              # [NEW]
│   │   └── COMPLETION_CHECKLIST.md
│   └── INDEX.md
├── .ai-context/
│   └── [8 files]
└── README.md
```

## Quality Minimums (Enforced)

| Artifact | Minimum |
|----------|---------|
| Functional Requirements | 10 |
| Non-Functional Requirements | 5 |
| User Stories | 5 |
| Bounded Contexts | 3 |
| ADRs | 10 |
| C4 Diagrams | 3 |
| Aggregates | 5 |
| Domain Events | 5 |
| **Pseudocode Files** | 3 |
| **Test Scenarios** | 5 |
| Fitness Functions | 5 |
| .ai-context/ files | 8 |

## Checkpoint Commands

| Command | Action |
|---------|--------|
| `ok` / `продолжай` | Proceed to next phase |
| `скорректируй X` | Modify specific element |
| `добавь Y` | Add missing element |
| `пересмотри Z` | Reconsider decision |
| `стоп` | Pause and save progress |

## Comparison: Auto vs Manual

| Aspect | idea2prd-auto | idea2prd-manual |
|--------|---------------|-----------------|
| **Time** | 20-40 min | 60-120 min |
| **User input** | 0-4 questions | **9 checkpoints** |
| **Control** | Low | **High** |
| **External skills** | Full execution | Full execution |
| **Pseudocode** | ✅ Auto | ✅ With review |
| **Test Scenarios** | ✅ Auto | ✅ With review |
| **Completion** | ✅ Auto | ✅ With review |
| **Best for** | MVPs, clear ideas | **Critical systems** |

## Dependencies

- External skills: explore, goap-research-ed25519, problem-solver-enhanced
- Mermaid (C4 diagrams)
- web_search (for Research phase)
