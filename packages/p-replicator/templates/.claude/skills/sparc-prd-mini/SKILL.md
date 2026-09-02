---
name: sparc-prd-mini
description: >
  Модульный генератор PRD и SPARC документации (v2). Использует внешние скиллы через view() 
  вместо встроенных копий: explore, goap-research-ed25519, problem-solver-enhanced. Поддерживает
  AUTO и MANUAL режимы. Принимает pre-filled context от родительских скиллов. 
  Создаёт 11 production-ready файлов для AI-assisted разработки (Vibe Coding).
  Триггеры: "sparc-prd-mini", "PRD mini", "документация auto/manual", "vibe coding docs".
---

# SPARC PRD Mini v2: Modular Documentation Generator (AUTO/MANUAL)

Скилл для генерации полного пакета продуктовой документации по методологии SPARC. Модульная архитектура — использует внешние скиллы через `view()` вместо встроенных копий.

## Architecture

`SKILL.md` (оркестратор) + `references/sparc-methodology.md` (SPARC framework) + `templates/prd.md`, `templates/CLAUDE.md`.

## External Dependencies (view at runtime)

| Phase | Skill | Path | What it provides |
|-------|-------|------|------------------|
| Phase 0: Explore | `explore` | `.claude/skills/explore/SKILL.md` | Socratic questioning → Product Brief |
| Phase 1: Research | `goap-research-ed25519` | `.claude/skills/goap-research-ed25519/SKILL.md` | GOAP A* + OODA → Research Findings |
| Phase 2: Solve | `problem-solver-enhanced` | `.claude/skills/problem-solver-enhanced/SKILL.md` | 9 modules + TRIZ → Solution Strategy |

**Принцип:** внешний скилл — Single Source of Truth. **Fallbacks:** explore → встроенные Socratic questions (3-5); goap-research → прямой web_search; problem-solver → First Principles + SCQA.

## When to Use

**Trigger Patterns:** "sparc-prd-mini" / "PRD mini" / "создай PRD" / "SPARC документация" / "PRD auto|manual|с checkpoint" / "документация для разработки".

## Operating Modes

### AUTO Mode (Default) — триггеры "auto", "автоматически", "без остановок": все 8 фаз подряд, без подтверждений.

### MANUAL Mode — триггеры "manual", "пошагово", "с checkpoint": checkpoint после каждой фазы, пользователь подтверждает или корректирует.

**Определение режима:** явный → использовать; простая задача → предложить AUTO; сложная → MANUAL; неясно → спросить.

## Output Documents (11 files)

`/output/[product-name]-sparc/`: PRD.md · Solution_Strategy.md · Specification.md · Pseudocode.md · Architecture.md · Refinement.md · Completion.md · Research_Findings.md · Final_Summary.md · `.claude/CLAUDE.md` (+ каталог) — 11 файлов.

## Document Role Map Contract

The five SPARC documents are addressed by role, never by a caller-specific filename. A caller may
provide `DOCUMENT_ROLE_MAP`; otherwise the project-level default below applies. The active map must
contain exactly these roles: `specification`, `pseudocode`, `architecture`, `refinement`, and
`completion`.

Resolve the active map once before Phase 3. Bind its values as `SPECIFICATION_FILE`,
`PSEUDOCODE_FILE`, `ARCHITECTURE_FILE`, `REFINEMENT_FILE`, and `COMPLETION_FILE`, respectively. Every
phase and traceability gate reads or writes those resolved targets. The literal project-level names
elsewhere in this document describe the default contour; they do not override a supplied map.

### Project-level default

```yaml
DOCUMENT_ROLE_MAP:
  specification: Specification.md
  pseudocode: Pseudocode.md
  architecture: Architecture.md
  refinement: Refinement.md
  completion: Completion.md
```

### Atomic validation

If a caller supplies `DOCUMENT_ROLE_MAP`, validate the complete map before Phase 3. Missing roles,
unknown roles, empty filenames, or a mixture of supplied and default values are an unresolved target
contract: STOP and report the received map plus every missing, unknown, or empty role. Never fill an
individual role from the project-level default. When the caller also supplies `TARGET_CATALOG`, join
that catalog with every filename only after the complete role map passes validation.

### FR/NFR/AC machine-key wire format

Machine keys are exact, case-sensitive joins between the `specification` and `pseudocode` roles:
`FR-<slug>-<n>`, `NFR-<slug>-<n>`, or `AC-<slug>-<n>`. For a feature contour, `<slug>` is the
lowercase hyphenated feature directory name and `<n>` is one or more decimal digits.

Declare each key in `SPECIFICATION_FILE` only as a level-three Markdown heading:

```markdown
### FR-order-refund-1
### NFR-order-refund-2 — bounded latency
### AC-order-refund-3 - accepted result
```

Every `### Algorithm:` block in `PSEUDOCODE_FILE` must carry at least one standalone, exact claim;
repeat the line when one algorithm addresses several keys:

```markdown
### Algorithm: Validate refund

REQUIREMENT: `FR-order-refund-1`
REQUIREMENT: `NFR-order-refund-2`
```

Prose, comments, tables, examples, `REALISES: SC-...`, and nested `SC-FR-*` scenario IDs are not
machine-key declarations. Duplicate declarations on either role are invalid; matching sets prove
cross-document linkage only, not that an algorithm semantically implements the requirement.

## Workflow Architecture

`INPUT → mode (AUTO|MANUAL) → clarity gate → P0? → P1 → P2 → P3 → P4 → P5 → P6 → P7 → SYNTHESIS`.
If the task is clear, skip P0 and notify the user; otherwise run it. MANUAL pauses at CP0–CP7.

P0→`view(explore)`→Product Brief; P1→`view(goap-research-ed25519)`→`Research_Findings.md`;
P2→`view(problem-solver-enhanced)`→`Solution_Strategy.md`; P3→`Specification.md`+`PRD.md`;
P4→`Pseudocode.md`; P5→`Architecture.md`; P6→`Refinement.md`; P7→`Completion.md`+`CLAUDE.md`;
SYNTHESIS→`Final_Summary.md`; final package totals 11 files.

---

## Phase Execution Protocol

### Gate: Task Clarity Assessment

**Задача ЯСНА (пропустить Explore), если:**
- Чётко определён продукт и его назначение
- Понятна целевая аудитория
- Указаны ключевые функции
- Ограничения явны или очевидны

**Задача НЕ ЯСНА (нужен Explore), если:**
- Размытая формулировка ("сделай приложение")
- Неизвестна целевая аудитория
- Непонятны ключевые функции
- Противоречивые требования

**При пропуске Explore:** сообщить «⚡ Фаза Explore пропущена — задача достаточно ясна», показать Product Brief; AUTO → сразу Research, MANUAL → CHECKPOINT 0.

---

### Phase 0: EXPLORE (делегация → explore skill)

```
view(".claude/skills/explore/SKILL.md")
→ Применить Socratic questioning к текущей задаче
→ Scope: уточнить продукт, аудиторию, features, constraints
```

**Output — Product Brief:** `## Product Brief` with Product Name, Problem Statement, Target Users,
Core Value Proposition; `### Key Features (MVP)` numbered Feature 1–3; `### Technical Context` with
Platform `[Web/Mobile/Desktop/API]`, Stack Preferences, Integrations, Constraints; `### Success
Criteria` with Criteria 1–2.

**[MANUAL] CP0:** show Product Brief; `ок` → Research; `уточни X`, `добавь Y`, `измени Z` edit it.

---

### Phase 1: RESEARCH (делегация → goap-research-ed25519 skill)

```
view(".claude/skills/goap-research-ed25519/SKILL.md")
→ Применить GOAP planning к продуктовому research
→ State Assessment → Gap Analysis → Plan → OODA Execution
```

**Research Areas:**
- Market Research (конкуренты, тренды, размер рынка)
- Technology Research (библиотеки, frameworks, best practices)
- User Research (поведенческие паттерны, боли)
- Integration Research (APIs, compatibility)

**Output — `Research_Findings.md`:** `## Research Findings` with Executive Summary (2–3 sentences),
Research Objective, Methodology (GOAP plan + sources), Market Analysis, Competitive Landscape table
`Competitor | Strengths | Weaknesses | Differentiation`, Technology Assessment, User Insights (all
findings use inline citations), Confidence Assessment (High = 3+ sources; Medium = 2; Low = needs
research), numbered Sources with URLs/reliability ratings, and Research Path Log with actions and
replanning decisions.

**[MANUAL] CP1:** show key findings plus source count and average reliability `[X.X]`; `ок` → Solve;
`глубже X`, `добавь источники по Y`, `сравни A и B` refine research.

---

### Phase 2: SOLVE (делегация → problem-solver-enhanced skill)

```
view(".claude/skills/problem-solver-enhanced/SKILL.md")
→ Применить 9-модульный framework к продуктовой проблеме
→ Включая TRIZ для разрешения противоречий
```

**9 Modules (из problem-solver-enhanced):**
1. First Principles — разбор до фундаментальных истин
2. 5 Whys — корневая причина
3. SCQA — Situation, Complication, Question, Answer
4. Game Theory — интересы stakeholders, Nash equilibrium
5. Second-Order Thinking — последствия последствий
6. TRIZ Contradictions — 40 inventive principles
7. Design Thinking — Empathy map, HMW questions
8. OODA Loop — Observe, Orient, Decide, Act
9. Solution Synthesis — интеграция

**Output — `Solution_Strategy.md`:** `## Solution Strategy` with SCQA (Situation, Complication,
Question, Answer); First Principles; Root Cause Analysis (5 Whys: Answers 1–4, then Root Cause at
5); Game Theory (players, interests, Nash equilibrium); Second-Order Effects; TRIZ table
`Contradiction | TRIZ Principle | Resolution`; Recommended Approach; Risk table
`Risk | Probability | Impact | Mitigation`.

**[MANUAL] CP2:** show recommended approach and key TRIZ resolutions; `ок` → Specification;
`альтернатива для X`, `углуби анализ Y`, `добавь stakeholder Z` revise the strategy.

---

### Phase 3: SPECIFICATION (собственная логика)

**Цель:** Трансформировать стратегию в детальные требования.

**Inputs:** Product Brief (Phase 0) + Research (Phase 1) + Solution (Phase 2)

**Output — `SPECIFICATION_FILE` + PRD.md:**
- Executive Summary
- User Stories with Acceptance Criteria (Gherkin)
- Feature Matrix (MVP/v1/v2)
- Non-Functional Requirements (performance, security, scalability)
- Success Metrics (each naming its value SOURCE — closed list, see Final Summary)

**User Story Format:**
```
US-<nnn>: As a [persona],
I want to [action],
So that [benefit].

Acceptance Criteria:
[SC-<story-id>-1]
Given [context]
When [action]
Then [expected result]
```

Every user story carries an ID `US-<nnn>` — three digits, assigned in order, never reused even after
a story is deleted. Every acceptance scenario under it carries `SC-<US-id>-<n>`, numbered from 1
within its story: the scenarios of `US-007` are `SC-US-007-1`, `SC-US-007-2`, and so on. Phase 4
traces algorithms back to these IDs, and there is nothing to trace to if a scenario has no name — nor
anything reliable to trace to if two scenarios can end up with the same name, which is what the
never-reused rule prevents.

**PRD Generation:**
```
view("templates/prd.md")
→ Заполнить шаблон данными из Phase 0-2
```

**[MANUAL] CP3:** show total/MVP story counts and whether Performance, Security, Scalability NFRs
are defined; `ок` → Pseudocode; `добавь user story для X`, `уточни acceptance criteria Y`,
`измени приоритет Z` revise the specification.

---

### Phase 4: PSEUDOCODE (собственная логика)

**Цель:** Определить алгоритмы и data flow.

**Output — `PSEUDOCODE_FILE`:** required blocks are `## Data Structures` (each entity names `id:
UUID`, fields and `created_at: Timestamp`); `## Core Algorithms`, where every block has:
`### Algorithm: [Name]` · `REALISES: [SC-… ids this algorithm implements]` · `INPUT:` · `OUTPUT:` ·
numbered `STEPS` with IF/ELSE and RETURN · `COMPLEXITY: O(n)`; `## API Contracts` (method/path,
Authorization Bearer header, body, Response
`200` data/meta, Response `4xx/5xx` error code/message); `## State Transitions` Mermaid; `## Error
Handling Strategy` categories/responses.

**Шаг 4.9 — ПОКРЫТИЕ СЦЕНАРИЕВ (обязательный, до чекпойнта).**

Resolve role `specification` through `DOCUMENT_ROLE_MAP` as `SPECIFICATION_FILE`; Resolve role `pseudocode` through `DOCUMENT_ROLE_MAP` as `PSEUDOCODE_FILE`. Re-read `SPECIFICATION_FILE` and
collect every `SC-` ID; collect every algorithm's `REALISES` claim from `PSEUDOCODE_FILE`.
Write a `## Scenario Coverage` block into `PSEUDOCODE_FILE` — in every
case, including the one where everything is covered:

```
## Scenario Coverage

Scenarios in [SPECIFICATION_FILE]: [N]  ·  claimed by an algorithm: [M]

Not claimed by any algorithm:
| Scenario | Reason |
|---|---|
| SC-… | ui-only |

Claimed by an algorithm but absent from Specification.md:
| Algorithm | Claimed ID |
|---|---|
| [name] | SC-… |
```

Both tables are required, and both may be the single word `none`; the reverse table catches a dangling
`REALISES: SC-US-009-3`. Blank is not `none`.

**Reasons are a CLOSED list of five**, and nothing else is accepted:

| Reason | Means |
|---|---|
| `ui-only` | realised entirely in the interface, no algorithm to write |
| `external-service` | performed by a third party, see the `architecture` role resolved through `DOCUMENT_ROLE_MAP` → External Dependencies |
| `out-of-mvp-scope` | deliberately not built yet |
| `data-only` | satisfied by a schema or constraint, not by a procedure |
| `config-only` | satisfied by OUR OWN configuration — a server setting, a header, a policy file — with no procedure to write |

Free text is NOT a reason, and `N/A` is NOT a reason. A field that accepts anything records nothing;
anything outside the closed list is a real algorithm gap.

This proves only a mutual naming CLAIM. It does NOT establish that the algorithm's steps actually perform the check:
it catches "nobody wrote anything about this scenario", not a wrong implementation
that merely mentions the ID.

The default label names `Specification.md`; a supplied map substitutes its resolved filename.

**[MANUAL] CP4:** show entity/core-algorithm/API-endpoint counts; `ок` → Architecture;
`оптимизируй алгоритм X`, `добавь edge case Y`, `измени структуру Z` revise pseudocode.

---

### Phase 5: ARCHITECTURE (собственная логика)

**Цель:** Системный дизайн и выбор технологий.

**Reference:**
```
view("references/sparc-methodology.md")
→ Секция Architecture для best practices
```

**Output — `ARCHITECTURE_FILE`:** required blocks are `## Architecture Overview` with style
`[Monolith / Microservices / Serverless / Hybrid]` and a Mermaid high-level diagram covering Client
(Web App, Mobile App), API (API Gateway, Service A, Service B), and Data (Database, Cache); `##
Component Breakdown`; `## Technology Stack` table `Layer | Technology | Rationale` with Frontend,
Backend, Database, Cache, Queue, Infrastructure; `## External Dependencies` as follows.

Record one row per external capability, not vendor: "sends email" and "reports bounces" are two
questions because a provider may do only one.

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| [what the product needs it to DO] | [service] | [link to the provider's own docs naming this capability] · checked [YYYY-MM-DD] | CONFIRMED | [REQ ids] |

Evidence MUST be the PROVIDER'S OWN documentation naming the capability, check date, and a short
verbatim QUOTE. These do NOT count: landing page, marketing page, pricing page, recollection ("the
model knows this API supports it"), or a URL nobody opened. An uncited capability is not confirmed.

**Verdicts — exactly three, because two would hide a difference that matters:**

| Verdict | Means | Consequence in Phase 2 |
|---|---|---|
| CONFIRMED | cited, and the citation names this capability | none |
| UNCONFIRMED | nobody could produce a citation | the REQUIREMENTS in that row's last column cannot enter Phase 3 — defer, remove or replace them. Unrelated work continues; the run is 🟡 CAVEATS at best and the row is NAMED in the report |
| CONTRADICTED | the provider's own docs say it cannot | 🔴 NEEDS WORK — the requirement rests on something that is not there |

`UNCONFIRMED` is the honest no-citation/no-web state: it is neither CONFIRMED nor CONTRADICTED. It
does not pass free: **scope the consequence to the REQUIREMENT, not the run**. Listed requirements
cannot enter Phase 3 until deferred, removed, or rewritten onto confirmable ground; unrelated work
continues. Otherwise an all-UNCONFIRMED inventory would make feasibility optional behind a caveat.

With none, write exactly: *"No external dependencies — this product calls no third-party service."*
An empty section and an absent section are indistinguishable, and only one of them means anything —
that is why the sentence is prescribed verbatim.

Row names are PLACEHOLDERS: NEVER copy a provider/capability from an example; APIs drift.

Then add `## External Dependencies

Every capability this product needs from someone else's service. One row per capability, not one row
per vendor: "sends email" and "reports bounces" are two questions, and a provider can do one without
the other.

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| [what the product needs it to DO] | [service] | [link to the provider's own docs naming this capability] · checked [YYYY-MM-DD] | CONFIRMED | [REQ ids] |

**Evidence — what counts.** A link to the PROVIDER'S OWN documentation naming the capability,
plus the date it was checked, plus **a short verbatim QUOTE from that page stating the capability**. These do NOT count (each a known fake): a landing page or marketing page; a pricing page; recollection ("the model knows"); **a URL nobody opened** — a plausible link
is the cheapest forgery, which is why the quote is required.

**Verdicts — exactly three, because two would hide a difference that matters:**

| Verdict | Means | Consequence in Phase 2 |
|---|---|---|
| CONFIRMED | cited, and the citation names this capability | none |
| UNCONFIRMED | nobody could produce a citation | the REQUIREMENTS in that row's last column cannot enter Phase 3 — defer, remove or replace them. Unrelated work continues; the run is 🟡 CAVEATS at best and the row is NAMED in the report |
| CONTRADICTED | the provider's own docs say it cannot | 🔴 NEEDS WORK — the requirement rests on something that is not there |

`UNCONFIRMED` is the honest offline state — never collapse it into CONFIRMED (overstates) or
CONTRADICTED (invites fake citations; a gate becomes theatre). Nor is it free: **the consequence is
scoped to the REQUIREMENT, not the run** — requirements in an `UNCONFIRMED` row do not enter Phase 3
until deferred, removed, or rewritten onto something confirmable; unrelated work proceeds. Without
this scoping an all-`UNCONFIRMED` inventory would pass with a caveat and the check would be optional
in practice while looking mandatory on paper.

**If this product has no external dependencies**, write exactly that: *"No external dependencies —
this product calls no third-party service."* An empty section and an absent section are
indistinguishable, and only one of them means anything.

Row names are PLACEHOLDERS — never copy a real provider/capability from an example: API facts drift,
and a stale fact recorded as evidence is worse than none.

## Data Architecture` (models, relationships, storage), `## Security Architecture`
(authentication, authorization, encryption), and `## Scalability Considerations`
(horizontal/vertical scaling, bottlenecks).

**Шаг 5.9 — СВЕРКА С ПСЕВДОКОДОМ (обязательный, до чекпойнта).**

Фаза 4 определила логическую модель до выбора хранилища.
Resolve role `pseudocode` through `DOCUMENT_ROLE_MAP` as `PSEUDOCODE_FILE`;
Resolve role `architecture` through `DOCUMENT_ROLE_MAP` as `ARCHITECTURE_FILE`;
re-read ДВЕ секции `PSEUDOCODE_FILE` — `## Data Structures` и
`## Core Algorithms` — then compare with `ARCHITECTURE_FILE`. Algorithms are mandatory: structures alone
cannot expose a read/write of a missing field. This catches boolean→enum drift, a missing algorithm
field, or a status with 3 values in one document and 5 in another. Find all three mismatch kinds:

- **смена типа** — поле объявлено одним типом, а хранилище требует другого (булево против перечисления);
- **отсутствующая колонка** — алгоритм читает или пишет поле, которого в схеме нет;
- **несовпадение набора значений** — у одного и того же поля разное число допустимых значений.

Fix by document ROLE: `PSEUDOCODE_FILE` owns LOGICAL meaning; `ARCHITECTURE_FILE` owns PHYSICAL
storage. A deliberate storage constraint (type/index/length) updates pseudocode; a technology that
BREAKS required semantics is changed HERE. `## Data Architecture` describes mapping/relationships,
NEVER a second field list.

Результат записывается в `ARCHITECTURE_FILE` ВСЕГДА, отдельным блоком:

```markdown
## Reconciliation with Pseudocode

| Сущность.поле | Вид расхождения | Что сделано |
|---|---|---|
| … | смена типа / отсутствующая колонка / несовпадение набора значений | … |
```

If clean, the block is still REQUIRED and MUST say: «Расхождений с `[PSEUDOCODE_FILE]` не найдено.
Сверены сущности: <перечисление>; алгоритмы: <перечисление>.» Bare «расхождений нет» or silence is
not evidence.

Defaults are `Pseudocode.md`/`Architecture.md`; a supplied map changes filenames only.

**CHECKPOINT 5** — **[MANUAL] CP5:** show architecture style, component count, and key technologies; `ок` → Refinement;
`альтернатива для X`, `углуби безопасность`, `добавь диаграмму Y` revise architecture.

---

### Phase 6: REFINEMENT (собственная логика)

**Цель:** Edge cases, тестирование, оптимизация.

**Output — `REFINEMENT_FILE`:** `## Edge Cases Matrix` table `Scenario | Input | Expected | Handling`
with every row: Empty input, Max size, Concurrent access, Network failure; `## Testing Strategy`
with Unit (coverage/critical paths), Integration (interactions/contracts), E2E (journeys/flows),
Performance (load/benchmarks); `## Test Cases` Gherkin Happy path and Error case, each Given/When/Then;
Performance Optimizations (caching/indexing/lazy loading); Security Hardening (input validation/rate
limiting/audit logs); Accessibility (WCAG/keyboard); Technical Debt (shortcuts/refactoring).

**[MANUAL] CP6:** show edge-case/test counts and optimizations; `ок` → Completion;
`добавь тест для X`, `углуби edge case Y`, `оптимизируй Z` revise refinement.

---

### Phase 7: COMPLETION (собственная логика)

**Цель:** Deployment и operational readiness.

**Output — `COMPLETION_FILE` + CLAUDE.md:**

**Completion.md required content:** Deployment Plan with Pre-Deployment checklist (all tests passing,
security audit complete, docs updated, rollback tested), Deployment Sequence Steps 1–3, and Rollback
Procedure; CI/CD stages `test → build → deploy` running `npm test`, `npm run lint`, `npm run build`,
`deploy.sh`; Monitoring table preserving `Response time p99 | > 500ms | PagerDuty`, `Error rate | >
1% | Slack`, `CPU usage | > 80% | Email`; Logging levels/retention/aggregation; Handoff checklists:
Development (repository access, environment setup, review guidelines), QA (test environment, test
data, bug reporting), Operations (production access, runbooks, escalation).

**CLAUDE.md:**
```
view("templates/CLAUDE.md")
→ Заполнить шаблон данными из всех предыдущих фаз
```

**[MANUAL] CP7:** show deployment/rollback readiness, monitoring metric count, and Dev/QA/Ops
handoffs; `ок`/`финиш` → Final Package; `добавь мониторинг X`, `углуби rollback`, `измени CI/CD`
revise completion.

---

### SYNTHESIS: Final Summary

**Output — `Final_Summary.md`:** title `[Product Name] - Executive Summary`; Overview (3–5
sentences); Problem & Solution; primary/secondary Target Users; MVP Features 1–3 with value;
Technical Approach (Architecture, Tech Stack, Key Differentiators); top 3–5 Research Highlights;
Success Metrics table:

| Metric | Target | Timeline | Источник значения |
|--------|--------|----------|-------------------|

**Every metric MUST name where its value comes from**, from a CLOSED list: `наш журнал` · `наша БД`
· `внешний API: <метод>` · `ручное измерение: <как>`. An empty cell and "из аналитики" are BLOCKERS,
not notes — measurability is otherwise decided by the SHAPE OF A NUMBER rather than by our ability to
OBTAIN it, so an unobtainable metric passes completeness, measurability and consistency with
distinction, and the feature gets designed around a promise nobody can keep. Manual measurement is a
legitimate answer; manual measurement presented as instrumented is not. A metric naming an external
API MUST produce a row in `## External Dependencies` — that inventory is the only route by which a
metric ever reaches a lens that looks outside these documents.

Then add Timeline table with MVP, v1.0, v2.0; Risks/Mitigations table; Immediate Next Steps Actions
1–3; Documentation Package mapping every member: `PRD.md` Product Requirements,
`Solution_Strategy.md` Problem Analysis, `Specification.md` Detailed Requirements, `Pseudocode.md`
Algorithms & Data Flow, `Architecture.md` System Design, `Refinement.md` Testing & Edge Cases,
`Completion.md` Deployment & Operations, `Research_Findings.md` Market & Tech Research, `CLAUDE.md`
AI Integration Guide.

---

## Final Package Output

Report `📦 SPARC DOCUMENTATION PACKAGE COMPLETE`, path `/output/[product-name]-sparc/`, and the full
tree from **Output Documents (11 files)** with ✅ descriptions. End with `Total: 11 files`, `🚀 READY
FOR VIBE CODING`, then `[AUTO mode]: Все документы созданы автоматически` or `[MANUAL mode]: Все
документы проверены на checkpoints`.

---

## Accepting External Context (from parent skills)

Если sparc-prd-mini вызывается из композитного скилла (например, vibe-coding-coordinator), родитель может передать готовые артефакты:

```markdown
## Pre-filled Context (optional)

Если получены от parent skill:
- **Product Brief** → пропустить Phase 0, использовать готовый
- **Research Findings** → пропустить Phase 1, использовать готовые
- **Solution Strategy** → пропустить Phase 2, использовать готовую
- **Architecture Constraints** → передать в Phase 5 как обязательные ограничения

Пример вызова с контекстом:
```
sparc-prd-mini MANUAL
  --product-brief: [готовый brief от explore]
  --research: [готовые findings от goap-research-ed25519]
  --constraints: "Distributed Monolith, Docker, VPS"
```

Скилл определяет какие фазы пропустить автоматически по наличию inputs.
```

---

## Checkpoint Commands Reference (MANUAL Mode)

| Команда | Действие | Доступность |
|---------|----------|-------------|
| `ок`, `ok`, `далее` | Следующая фаза | Все checkpoints |
| `уточни X` | Уточнить аспект | Все checkpoints |
| `добавь Y` | Добавить элемент | Все checkpoints |
| `измени Z` | Изменить параметр | Все checkpoints |
| `назад` | Вернуться к предыдущей фазе | Все checkpoints |
| `глубже X` | Исследовать детальнее | CP1 |
| `альтернатива для X` | Другой подход | CP2, CP5 |
| `углуби Y` | Углубить аспект | CP2, CP5, CP6 |
| `финиш` | Создать final package | CP7 |
| `стоп` | Пауза с сохранением | Все checkpoints |

---

## Quality Standards

**Research Quality (via goap-research-ed25519):**
- [ ] Все claims имеют источники с reliability rating
- [ ] Минимум 2 независимых источника на ключевое утверждение
- [ ] Первичные источники где возможно
- [ ] Confidence levels для всех findings

**Documentation Completeness:**
- [ ] Все 8 фаз пройдены (или обоснованно пропущены при pre-filled context)
- [ ] Все 11 документов созданы
- [ ] Mermaid диаграммы включены
- [ ] Acceptance criteria в Gherkin формате

**Actionability:**
- [ ] Каждое действие имеет owner и timeline
- [ ] Метрики успеха измеримы И называют источник значения из закрытого списка
- [ ] Риски идентифицированы с mitigation планами

---

## Anti-Patterns

❌ Пропускать research и сразу давать решение
❌ Делать утверждения без источников
❌ Общие рекомендации без конкретных действий
❌ Игнорировать противоречия вместо их разрешения
❌ Не указывать confidence level для утверждений
❌ Забывать о second-order effects
❌ Не уведомлять о пропуске Explore фазы
❌ В MANUAL режиме — продолжать без подтверждения
❌ Копировать логику внешних скиллов вместо view()

---

## Mode Selection Prompt

При старте, если режим не указан:

Ask: `🎯 SPARC PRD Mini v2 — AUTO` (`auto`/`автоматически`: all 11 documents, no intermediate
stops) or `MANUAL` (`manual`/`пошагово`/`с проверками`: checkpoint each phase, corrections allowed)?

---

## Dependency Version Note

Этот скилл ссылается на внешние зависимости через `view()`. Если поведение изменилось неожиданно, проверь обновления в:
- `.claude/skills/explore/SKILL.md`
- `.claude/skills/goap-research-ed25519/SKILL.md`
- `.claude/skills/problem-solver-enhanced/SKILL.md`

Собственная методология: `references/sparc-methodology.md`
