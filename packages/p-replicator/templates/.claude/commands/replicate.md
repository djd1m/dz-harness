---
description: >
  Replicate pipeline — полный цикл подготовки проекта к Vibe Coding.
  Генерирует SPARC документацию, валидирует, создаёт project-specific toolkit.
  $ARGUMENTS: описание продукта/идеи или название компании для reverse engineering.
---

# /replicate $ARGUMENTS

## Role

Координатор подготовки к Vibe Coding. Генерируешь всё для старта проекта
в Claude Code — прямо в текущем репозитории, без zip-архивов.

## Target Architecture (Constraints)

Все проекты создаются под эту целевую архитектуру:

| Аспект | Решение |
|--------|---------|
| **Архитектура** | Distributed Monolith в Monorepo |
| **Контейнеризация** | Docker + Docker Compose |
| **Инфраструктура** | VPS (AdminVPS/HOSTKEY) |
| **Деплой** | Docker Compose на VPS (direct deploy) |
| **AI Integration** | MCP серверы |

## Skills (loaded from .claude/skills/)

All skills are available locally. Read their SKILL.md when needed:

| Skill | Path | Phase |
|-------|------|-------|
| reverse-engineering-unicorn | `.claude/skills/reverse-engineering-unicorn/SKILL.md` | Phase 0 |
| sparc-prd-mini | `.claude/skills/sparc-prd-mini/SKILL.md` | Phase 1 |
| explore | `.claude/skills/explore/SKILL.md` | Phase 1 (dependency) |
| goap-research-ed25519 | `.claude/skills/goap-research-ed25519/SKILL.md` | Phase 1 (dependency) |
| problem-solver-enhanced | `.claude/skills/problem-solver-enhanced/SKILL.md` | Phase 1 (dependency) |
| requirements-validator | `.claude/skills/requirements-validator/SKILL.md` | Phase 2 |
| cc-toolkit-generator-enhanced | `.claude/skills/cc-toolkit-generator-enhanced/SKILL.md` | Phase 3 |
| brutal-honesty-review | `.claude/skills/brutal-honesty-review/SKILL.md` | Phase 4 (/feature) |

**IMPORTANT (Claude Code adaptation):**
- Skills reference `view("/mnt/skills/user/...")` paths from claude.ai
- In Claude Code, replace ALL such references with `.claude/skills/[name]/SKILL.md`
- When sparc-prd-mini calls `view("/mnt/skills/user/explore/SKILL.md")`, read `.claude/skills/explore/SKILL.md` instead
- When sparc-prd-mini calls `view("/mnt/skills/user/goap-research/SKILL.md")`, read `.claude/skills/goap-research-ed25519/SKILL.md` instead

## Pipeline

```
INPUT → [PRODUCT DISCOVERY] → PLANNING → VALIDATION → TOOLKIT → FINALIZE
         (optional)            sparc-prd   requirements  cc-toolkit  commit
                               -mini       -validator    -generator  & report
```

**Note:** sparc-prd-mini v2 already includes Explore, Research, and Solve phases
internally via skill references. The coordinator does NOT duplicate these phases.

## Alternative entry: starting from existing technical documentation

If the user already has technical documentation for the project (tech spec,
architecture docs, API spec, design docs, etc.), the pipeline supports
**skipping Phase 0 entirely** and feeding the user's existing docs into
Phase 1 as pre-filled context.

### Trigger detection (any of these in user input)

Switch to this alternative flow when the user input contains:
- A path reference: "use my docs in `docs/existing/`", "my tech specs are in `<path>`"
- An explicit skip request: "skip discovery", "skip Phase 0"
- A statement of available docs: "I already have technical documentation"
- The semantic flag: `/replicate --from-docs <path>` (or `--skip-discovery`)

### Recommended setup

The user should place their existing docs in a project-local subfolder
(conventionally `docs/existing/` or `docs/source/`) so they're discoverable
but distinct from generated SPARC outputs.

### Modified pipeline flow when triggered

- **Phase 0** (Product Discovery): SKIPPED entirely (no reverse-engineering-unicorn invocation)
- **Phase 1** (sparc-prd-mini): MODIFIED
  - Run in **AUTO mode** — do NOT ask interactive clarification questions
  - SKIP internal sub-phases Explore / Research / Solve (their job is to
    generate the answers that already exist in user docs)
  - READ all files in user-provided path as pre-filled context
  - Generate the 11 standardized SPARC documents in `docs/`, mapping content
    from existing docs to appropriate slots (PRD, Solution_Strategy,
    Specification, Pseudocode, Architecture, Refinement, Completion,
    Research_Findings, Final_Summary, C4_Diagrams, ADR)
  - For SPARC slots without source content in existing docs, mark with a
    `[GAP: needs <description>]` placeholder rather than asking the user
- **Phase 2** (validation): runs UNCHANGED (validates the generated SPARC docs)
- **Phase 3** (toolkit generation): runs UNCHANGED
- **Phase 4** (finalize): runs UNCHANGED

### Three sub-paths the user may prefer

| Sub-path | When | Skills invoked |
|---|---|---|
| **A. Full /replicate with override directives** | Have tech docs, want full pipeline + toolkit + scaffold | sparc-prd-mini (AUTO) → requirements-validator → cc-toolkit-generator-enhanced |
| **B. Invoke sparc-prd-mini skill directly** | Want only the 11 SPARC docs, no toolkit/scaffold | sparc-prd-mini (AUTO) only |
| **C. Rename existing docs to SPARC slot names + invoke validator only** | Existing docs already SPARC-shaped | requirements-validator only |

### Caveats (always surface to the user)

- Existing docs may not cover all 11 SPARC slots — expect `[GAP: ...]` markers
- Validation may flag user stories as "not negotiable/testable" if existing
  docs aren't INVEST/SMART-shaped — this is a real signal, not a bug
- Architectural constraints (pattern, containers, infra, deploy, AI integration)
  must be passed explicitly if not present in existing docs (use the constraints
  block from "Phase 1: PLANNING" below)

### Verification after completion

```bash
npx @dzhechkov/p-replicator verify
```
Should report pre-shipped contract OK + post-/replicate hints showing the
generated SPARC docs and (if Phase 3+4 ran) the project-specific artifacts.

### See also: existing-project feature workflow (Mode 2)

If the user already has a working project (stack, PRD, CLAUDE.md, etc. all
defined) and just wants to **add new features** with the same SPARC-mini
validation cycle — they should use `/feature` (NOT `/replicate`):

```bash
cd existing-project
npx @dzhechkov/p-replicator init      # idempotent — preserves CLAUDE.md
claude
/feature add-stripe-payments          # 4-phase: PLAN → VALIDATE → IMPLEMENT → REVIEW
```

See `.claude/commands/feature.md` ("Use case: existing project") and
`.claude/rules/feature-lifecycle.md` ("Entry modes" → "Mode 2") for the full
spec. This Mode 2 workflow is parallel to /replicate's "Alternative entry"
above, but applies to ad-hoc feature additions rather than full project bootstrap.

## Execution

### Start

1. Briefly explain the phases (4 main + 1 optional)
2. Mention the target architecture (distributed monolith + Docker на VPS)
3. Determine project type → is Product Discovery needed?
4. Begin with the relevant phase

### Phase 0: PRODUCT DISCOVERY (optional)

**Gate — when to activate:**
- New product / startup / SaaS → **activate**
- Competitors to analyze → **activate**
- Internal tool / experiment → **skip**
- **Existing technical documentation provided** → **skip** (see "Alternative entry" below)

Read the skill: `.claude/skills/reverse-engineering-unicorn/SKILL.md`

**Mode:** QUICK (sufficient for informing PRD)

**Selected modules:**

| Module | When needed | Output for PRD |
|--------|------------|----------------|
| M2: Product & Customers | Always | JTBD, Value Prop, segments |
| M3: Market & Competition | Always | TAM/SAM, competitors, Blue Ocean |
| M4: Business & Finance | If monetization | Unit economics |
| M5: Growth Engine | If acquisition/adoption in scope (incl. B2B) | Channels, integrations |

M5 is no longer gated on PRODUCT TYPE. The module branches on type itself — *«Если B2B → sales-led
growth, не product-led»* — so gating it outside disabled the one branch it declares, and every B2B
project got an empty `### Growth Channels` slot.

The condition is APPLICABILITY, not type, and the difference matters in both directions: `Always`
would over-promise, because M5's outputs are CAC, channels and loops, and an internal tool with no
acquisition objective has nothing to put in them. So: run it whenever acquisition or adoption is in
scope — which includes B2B — and skip it when neither is. The cost is visible rather than
discovered: a B2B run now spends M5's time.

Honest limit: line 62 of the module says to *switch* to a sales-led framework; it does not define
one. A B2B run gets the type-appropriate instruction, not a type-appropriate playbook.

**Output — WRITE FIRST, then hand off. Both, in this order:**

1. **Write** the full Product Discovery Brief to `docs/product-discovery-brief.md`.
2. **Then** pass it to Phase 1 as pre-filled context, exactly as before.

The hand-off is unchanged; the file is an ADDITION. Until this was added the brief existed only in
the conversation — it made Phase 1 skip its own Phase 0 (`sparc-prd-mini/SKILL.md:993-999`) and then
vanished, so the M5 growth analysis had no artifact any later step could read. Nothing downstream was
ignoring it: there was nothing to ignore.

The file MUST include M5's `Growth Requirements Seed` table verbatim when M5 ran — that table is the
only place `FR-GROWTH-nnn` obligations exist before Phase 1 promotes them.

**When this file is absent it means Phase 0 did not run** — the `--from-docs` / `--skip-discovery`
entry skips Phase 0 entirely (see the alternative-entry section). Absence is NOT evidence that the
project has no growth requirements, and no consumer may read it that way.

**Checkpoint:**
```
═══════════════════════════════════════════════════════════════
✅ PHASE 0: PRODUCT DISCOVERY
[Summary from brief]
⏸️ "ок" — next | "превью discovery" — show brief
═══════════════════════════════════════════════════════════════
```

### Phase 1: PLANNING

Read the skill: `.claude/skills/sparc-prd-mini/SKILL.md`

**sparc-prd-mini v2 runs 8 internal phases:**
- Phase 0: Explore → explore skill (read from `.claude/skills/explore/SKILL.md`)
- Phase 1: Research → goap-research-ed25519 skill (read from `.claude/skills/goap-research-ed25519/SKILL.md`)
- Phase 2: Solve → problem-solver-enhanced skill (read from `.claude/skills/problem-solver-enhanced/SKILL.md`)
- Phases 3-7: Specification, Pseudocode, Architecture, Refinement, Completion

**Pass context to the skill:**

```yaml
Architecture Constraints:
  pattern: "Distributed Monolith (Monorepo)"
  containers: "Docker + Docker Compose"
  infrastructure: "VPS (AdminVPS/HOSTKEY)"
  deploy: "Docker Compose direct deploy (SSH / CI pipeline)"
  ai_integration: "MCP servers"

Product Context: # From Phase 0 (if applicable)
  target_segments: [from JTBD]
  key_competitors: [from competitive matrix]
  differentiation: [from Blue Ocean]
  monetization: [from Unit Economics]

Security Pattern: # If external integrations
  api_keys_input: "UI Settings > Integrations"
  storage: "Encrypted IndexedDB (AES-GCM 256-bit)"
  key_derivation: "PBKDF2 from user password"
  server_side: "No key storage on backend"
```

**Mode:** MANUAL (checkpoint at each phase inside sparc-prd-mini)

**Output location:** `docs/` directory (NOT `/output/` — write directly into the project)

Write all 11 documents to `docs/`:
- `docs/PRD.md`
- `docs/Solution_Strategy.md`
- `docs/Specification.md`
- `docs/Pseudocode.md`
- `docs/Architecture.md`
- `docs/Refinement.md`
- `docs/Completion.md`
- `docs/Research_Findings.md`
- `docs/Final_Summary.md`
- `docs/C4_Diagrams.md` (if applicable)
- `docs/ADR.md` (if applicable)

Git commit: `docs: SPARC documentation for [project-name]`

**Checkpoint:**
```
═══════════════════════════════════════════════════════════════
✅ PHASE 1: PLANNING (SPARC DOCUMENTATION)
Created [N] documents in docs/
⏸️ "ок" — next to validation | "превью [filename]" — show file
═══════════════════════════════════════════════════════════════
```

### Прерванный прогон: как продолжить с того места

`/replicate` — интерактивный конвейер с четырьмя чекпоинтами, и продолжить его можно **уже сейчас,
без всякой новой машинерии**. Три сигнала, каждый существует независимо от этого раздела:

| Вопрос | Чем отвечается |
|---|---|
| До какой фазы дошли? | `git log --oneline` — после КАЖДОЙ фазы делается свой коммит (`docs: SPARC…`, `docs: validation report…`, `feat: Claude Code toolkit…`, `chore: initial project setup…`) |
| Документы Фазы 1 дописаны? | `node .claude/hooks/check-docs-complete.cjs .` — `0` дописаны, `1` названо, чего не хватает, `2` Фаза 1 не запускалась |
| Тулкит Фазы 3 сгенерирован? | `npx @dzhechkov/p-replicator verify` — раздел «Post-/replicate» |

**Как продолжить:** посмотрите последний коммит фазы, затем скажите `/replicate` прямым текстом:
*«продолжай с Фазы 3, Фазы 0-2 уже сделаны»*. Конвейер интерактивный — человек на чекпоинте и есть
механизм возобновления.

**Почему здесь нет автоматического определения фазы.** Оно рассматривалось (бэклог `58575b07`) и
сознательно НЕ реализовано: три сигнала выше уже дают ответ, а свежая логика ветвления в
интерактивном конвейере — это то, что может сработать неверно ровно тогда, когда прогон и так пошёл
не по плану. Запись решения важнее самого решения: если вы вернётесь к этому вопросу, начинайте с
того, что перечисленного выше оказалось недостаточно.

### Phase 2: VALIDATION

**Шаг 2.0 — ДЕТЕРМИНИРОВАННАЯ ПРОВЕРКА ПОЛНОТЫ. Выполняется ПЕРВОЙ, до запуска роя.**

```bash
node .claude/hooks/check-docs-complete.cjs .
```

| Код | Что делать |
|:---:|---|
| `0` | продолжайте — рой валидации запускается |
| `1` | **НЕ запускайте рой.** Вернитесь в Фазу 1 и допишите названные документы |
| `2` | проверка не выполнена — почините вызов и повторите; это НЕ «всё в порядке» |

Причина, по которой шаг стоит здесь, а не внутри роя: существование файла, его пустота и
незаполненный шаблон решаются сорока строками кода. Отправлять на этот вопрос рой агентов — значит
платить вероятностной проверкой за то, что решается детерминированно. Рою остаётся то, ради чего он
и нужен: тестируемость, полнота требований, реализуемость.

Ограничение, которое проверка печатает сама: она доказывает, что документы НАПИСАНЫ, а не что они
верны. Верность — работа роя.

Read the skill: `.claude/skills/requirements-validator/SKILL.md`

**Goal:** Verify all documentation for completeness, testability, and implementation readiness.

**Strategy: Swarm of Validation Agents**

| Agent | Scope | Criteria |
|-------|-------|----------|
| `validator-stories` | PRD → User Stories | INVEST criteria, score ≥70 |
| `validator-acceptance` | Stories → AC | SMART criteria, testability |
| `validator-architecture` | Architecture.md | Target constraints, completeness |
| `validator-pseudocode` | Pseudocode.md | Story coverage, implementability |
| `validator-coherence` | Cross-document | Consistency, no contradictions |
| `validator-dependencies` | `Architecture.md` → `## External Dependencies` | Every external capability a requirement relies on has a verdict and, where CONFIRMED, evidence that names that capability |

The sixth lens is the only one that looks OUTSIDE the documents. The other five compare our own
output with our own output, which cannot discover that a service does not do what we assumed.

**Process (iterative, max 3 iterations):**

```
1. ANALYZE — parallel validator agents (use Task tool)
2. AGGREGATE — Gap Register + Blocked/Warning items
3. FIX — resolve gaps in documentation
4. RE-VALIDATE — re-check fixes
↻ Until: no BLOCKED (≥50), average ≥70, no contradictions
```

**BDD Scenarios Generation:**
- Happy path (1-2), Error handling (2-3), Edge cases (1-2), Security
- Save as `docs/test-scenarios.md`

**Save validation report:** `docs/validation-report.md`. Its **first line** must be exactly one of

```
**Verdict:** 🟢 READY
**Verdict:** 🟡 CAVEATS
**Verdict:** 🔴 NEEDS WORK
```

and no other line in the file may begin with `**Verdict:**`. Phase 3 reads that one line and nothing
else — an unanchored verdict is a verdict Phase 3 can find in an example or a quoted history.

Git commit: `docs: validation report and BDD scenarios`

**Exit Criteria:**

| Verdict | Conditions | Action |
|---------|-----------|--------|
| 🟢 READY | All scores ≥50, average ≥70, no contradictions, **no item on the blocking floor**, **no external dependency `UNCONFIRMED` or `CONTRADICTED`** | → Phase 3 |
| 🟡 CAVEATS | Warnings exist, no blocked, limitations described, **every `UNCONFIRMED` dependency NAMED row by row** | → Phase 3 with notes |
| 🔴 NEEDS WORK | Blocked items exist, **or any item has `Testable = 0` or `Completeness = 0`**, **or any external dependency is `CONTRADICTED`** | → Return to Phase 1 |

**The blocking floor** (`skills/requirements-validator/references/scoring-system.md` → "Blocking
floor"): the weakest link decides, never the average. An item with no acceptance criteria totals
72/100 and would otherwise read as READY.

**Шаг 2.9 — ПОКРЫТИЕ РЕШЕНИЙ (обязательный, до чекпойнта).**

Every decision in `docs/ADR.md` carries an id `ADR-<nnn>` — three digits, assigned in order, never
reused even after a decision is superseded.

**Where to look, named file by file.** «Across the docs» is not an instruction. Search EXACTLY these,
and no others:

```
docs/PRD.md · docs/Solution_Strategy.md · docs/Specification.md · docs/Pseudocode.md
docs/Architecture.md · docs/Refinement.md · docs/Completion.md · docs/C4_Diagrams.md
```

**Two files are EXCLUDED, and the first exclusion is the one that makes this check work at all:**

- `docs/ADR.md` itself. Its own headings contain every id, so counting them would make every decision
  appear named and the check would pass by construction — always, on any project.
- `docs/validation-report.md`. This step WRITES into it. Counting it would let the previous run's
  output satisfy the next run: the check would start proving itself.

**What counts as a mention.** The exact token `ADR-<nnn>`, case-sensitive, in one of the files above.
Not a title, not a paraphrase, not a link whose text merely resembles it. One occurrence is enough;
repeats are not counted twice.

**A superseded decision needs no current mention.** If a decision's own entry says it is superseded,
list it in a third column rather than as a gap — it was replaced, not forgotten.

Write a `## Decision Coverage` block into `docs/validation-report.md` — **in every case**, including
the one where everything is covered, because an absent block and a block saying "all covered" are
indistinguishable to the next reader:

```
## Decision Coverage

Decisions in docs/ADR.md: [N]  ·  named downstream: [M]  ·  superseded: [S]

Recorded but named nowhere:
| Decision | Title |
|---|---|
| ADR-… | … |

Named downstream but absent from docs/ADR.md:
| Reference | Where |
|---|---|
| ADR-… | docs/… |
```

**Both tables are required, and both may be the single word `none`.** A one-way check is half a
check: without the second table, a document referring to `ADR-009` that nobody ever wrote reads
exactly like coverage. `none` is written out rather than left blank, because an empty table and a
forgotten table look identical.

**Three states of the ADR file, and each has its own line — the block is written in all three:**

| State | What to write in the block |
|---|---|
| `docs/ADR.md` absent | *"docs/ADR.md is absent, so no decision ids were collected from it. The second table below still applies."* |
| present but containing no `ADR-<nnn>` id | *"docs/ADR.md exists but records no decision ids."* |
| present with ids | the counts and the two tables above |

Note what the first line does NOT say. It says the FILE is absent — not that the project recorded no
architectural decisions. Decisions may live somewhere this pipeline does not look, and claiming
otherwise would be asserting something this step cannot see. **In all three states the second table
still runs**: a downstream reference to a decision that does not exist is a defect whether or not an
ADR file was ever written.

**What this establishes, and what it does not.** It establishes that a decision is NAMED somewhere
downstream. It does NOT establish that the decision was implemented — no comparison of identifiers
can. So it catches *"the decision was written down and then forgotten"*; it does not catch *"someone
mentioned it in a sentence and built something else"*. Say so here rather than letting a later reader
assume the stronger thing.

**Checkpoint:**
```
═══════════════════════════════════════════════════════════════
✅ PHASE 2: VALIDATION COMPLETE
Verdict: [🟢/🟡/🔴]
Average Score: XX/100
Iterations: N/3
⏸️ "ок" — generate toolkit | "превью validation" — show report
═══════════════════════════════════════════════════════════════
```

### Phase 3: TOOLKIT GENERATION

**Precondition — check it before reading anything else. The toolkit is built ON the validated docs,
so an unvalidated input is not a smaller toolkit, it is a wrong one:**

1. `docs/validation-report.md` must EXIST. If it is absent, Phase 2 did not run or did not finish —
   do NOT generate anything; return to Phase 2 and say so.
2. Its **first line** must be `**Verdict:**` followed by 🟢 READY or 🟡 CAVEATS. Read ONLY that
   line: a verdict word anywhere else in the document — an example, a quoted history, a summary —
   is NOT the verdict. On 🔴 NEEDS WORK, on no such first line, or on more than one line starting
   with `**Verdict:**`, do NOT generate anything; return to Phase 2 and say which of the four it was.
3. On 🟡, carry the report's stated limitations into the toolkit's own notes — a caveat that stops at
   the phase boundary was never recorded.

Read the skill: `.claude/skills/cc-toolkit-generator-enhanced/SKILL.md`

**Goal:** Generate project-specific Claude Code instruments IN-PLACE.

**IMPORTANT (Claude Code adaptation, post v1.4):**
- Scan `docs/` directory for SPARC documents (NOT `/mnt/user-data/uploads/`)
- Generate files IN-PLACE into the project (NOT into output directory)
- **Pre-shipped by `npx p-replicator init` — do NOT overwrite or regenerate:**
  - All 10 skills in `.claude/skills/`
  - All 11 commands: `/replicate`, `/harvest`, `/start`, `/plan`, `/feature`, `/go`, `/run`, `/next`, `/myinsights`, `/docs`, `/deploy`
  - All 6 rules: `replicate-pipeline`, `skill-interface-protocol`, `git-workflow`, `insights-capture`, `feature-lifecycle`, `docker-ports`
  - All 4 pipeline agents: `replicate-coordinator`, `product-discoverer`, `doc-validator`, `harvest-coordinator`
  - `.claude/settings.json` + cross-platform Node hook scripts in `.claude/hooks/`
- Phase 3 generates ONLY project-specific artifacts derived from SPARC docs (see below).

**Generate these project-specific files:**

**1. Enhance CLAUDE.md** (root) with project-specific content:
- Project overview from PRD.md
- Architecture from Architecture.md
- Tech stack decisions
- Parallel execution strategy
- Available agents/skills/commands list (reference pre-shipped + project-generated)
- Development insights section
- Feature lifecycle section

**2. Project-specific Agents (`.claude/agents/`):**
- `planner.md` — feature planning with algorithm templates from Pseudocode.md
- `code-reviewer.md` — quality review with edge cases from Refinement.md
- `architect.md` — system design from Architecture.md + Solution_Strategy.md
- Additional agents based on project characteristics

**3. Project-specific Rules (`.claude/rules/`):**
- `security.md` — from Specification.md NFRs
- `coding-style.md` — from Architecture.md tech stack
- `secrets-management.md` — IF external APIs detected
- `testing.md` — from Refinement.md test strategy

**4. Project-specific Skills (`.claude/skills/`):**
- `project-context/` — domain knowledge from Research_Findings.md
- `coding-standards/` — tech-specific patterns from Architecture.md
- `security-patterns/` — IF external APIs (encrypted storage pattern)

**5. Project state:**
- `.claude/feature-roadmap.json` — generated from PRD.md MVP scope
- `.mcp.json` — IF external integrations
- `DEVELOPMENT_GUIDE.md` — step-by-step development lifecycle
- `README.md` — enhanced with project info

**6. Conditional command (only if DDD docs present):**
- `.claude/commands/feature-ent.md` — enterprise feature lifecycle with DDD/ADR/C4

**Verify after Phase 3:**
- Run `npx @dzhechkov/p-replicator verify` to confirm both pre-shipped contract AND post-/replicate artifacts are in place.

Git commit: `feat: Claude Code toolkit for [project-name]`

**Checkpoint:**
```
═══════════════════════════════════════════════════════════════
✅ PHASE 3: TOOLKIT GENERATED
- CLAUDE.md enhanced with project context
- [N] agents + [N] commands + [N] rules generated
- DEVELOPMENT_GUIDE.md created
⏸️ "ок" — finalize | "превью toolkit" — show structure
═══════════════════════════════════════════════════════════════
```

### Phase 4: FINALIZE

**Goal:** Generate scaffold files, commit everything, show summary.

**Generate scaffold files:**

1. `docker-compose.yml` — from Architecture.md services, **if not exists** (a run over a tree that already has one must not discard it either — the guard is symmetric)
2. `Dockerfile` — from Architecture.md tech stack
3. `.gitignore` — if not exists
4. `docs/features/` — create empty directory for future features

> `docker-compose.yml`, `.gitignore` и `README.md` позже читает `/start` (Phase 1). Он обязан их СОХРАНИТЬ и
> менять только по названной причине — правило `if not exists` записано на его стороне. Оба конца
> рекомендованной последовательности договорены в тексте, а не совпадают по случайности.

**Git operations:**
```bash
git add .
git commit -m "chore: initial project setup from SPARC documentation"
```

**Show final summary:**
```
═══════════════════════════════════════════════════════════════
✅ REPLICATE COMPLETE: [project-name]

📁 Project structure:
├── CLAUDE.md                     # Project context
├── DEVELOPMENT_GUIDE.md          # Dev lifecycle guide
├── README.md                     # Quick start
├── docs/                         # [N] SPARC documents
│   ├── validation-report.md      # Validation results
│   ├── test-scenarios.md         # BDD scenarios
│   └── features/                 # For future features
├── .claude/
│   ├── commands/                 # /start, /feature, /plan, /go, /run, /deploy, /myinsights
│   ├── agents/                   # planner, code-reviewer, architect
│   ├── skills/                   # 8 shared + project-specific skills
│   ├── rules/                    # git-workflow, security, coding-style, ...
│   └── settings.json             # Hooks (insights auto-commit)
├── docker-compose.yml            # Scaffold
└── Dockerfile                    # Scaffold

🚀 Next steps:
1. Run /start to bootstrap the project
2. First feature: [recommended from PRD MVP]

💡 Available commands:
- /start         — bootstrap project from docs
- /feature [name] — full feature lifecycle
- /plan [feature] — plan implementation
- /go [feature]   — smart pipeline router (auto-dispatch)
- /run [mode]     — autonomous build loop
- /next           — pick the next feature from roadmap
- /deploy [env]   — deploy to environment
- /myinsights     — capture development insights
═══════════════════════════════════════════════════════════════
```

## Development Practices (embedded in toolkit)

### 1. Swarm of Agents & Parallel Execution

Include in CLAUDE.md:
```markdown
## Parallel Execution Strategy
- Use `Task` tool for independent subtasks
- Run tests, linting, type-checking in parallel
- For complex features: spawn specialized agents
```

### 2. Client-Side Secrets Management (if external APIs)

**Mandatory pattern for apps with external integrations:**

```
PRINCIPLE: User enters keys via UI → stored encrypted in browser → NEVER sent to backend
```

**Security Implementation:**
- Encryption at Rest: AES-GCM 256-bit (Web Crypto API)
- Key derivation: PBKDF2 from user password (100k+ iterations)
- Storage: IndexedDB for encrypted data, master key only in memory
- Auto-lock after inactivity timeout
- Never: transmit to backend, log, store in plaintext

## Checkpoint Commands

| Command | Action |
|---------|--------|
| `ок` | Next phase |
| `превью [filename]` | View generated file |
| `превью discovery` | Show Product Discovery Brief |
| `превью validation` | Show Validation Report |
| `превью toolkit` | Show toolkit structure |

## Critical Rules

### ALWAYS
- Read skill SKILL.md before executing its logic
- Checkpoint after each phase
- Pass Architecture Constraints to sparc-prd-mini
- Write docs to `docs/` directory (not `/output/`)
- Generate toolkit IN-PLACE (not into separate directory)
- Use existing generic commands/rules (don't regenerate /feature, /myinsights, etc.)

### NEVER
- Don't duplicate explore/research phases — sparc-prd-mini does this internally
- Never skip validation — toolkit is built on validated docs. The enforcing check is Phase 3's precondition, which reads the first `**Verdict:**` line of `docs/validation-report.md`
- Never use base cc-toolkit-generator — only enhanced version
- Don't overwrite template files (generic commands, rules, settings.json)

### CONDITIONAL
- If external APIs → include security-patterns/ skill + secrets-management.md rule
- If new product → start with Phase 0 (Product Discovery)
- If B2B/Enterprise → strengthen security patterns in validation
