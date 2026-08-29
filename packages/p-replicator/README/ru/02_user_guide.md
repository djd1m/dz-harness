# 02. Руководство пользователя

Подробный обзор всех 11 команд и их workflow.

## Таблица команд

| Команда | Назначение | Когда использовать |
|---|---|---|
| `/replicate` | Полный pipeline: идея → SPARC docs → toolkit | В начале нового проекта |
| `/start` | Bootstrap скаффолда из SPARC docs | После `/replicate`, перед сборкой фич |
| `/run` | Автономный цикл сборки фич из roadmap | Регулярная разработка |
| `/go` | Router: выбирает /plan, /feature или /feature-ent | Одна конкретная фича |
| `/next` | Покажет следующую фичу из roadmap | Навигация по sprint'у |
| `/plan` | Лёгкий план в `docs/plans/<id>.md` | Маленькая задача (≤3 файла) |
| `/feature` | Полный SPARC-mini цикл (PLAN → VALIDATE → IMPLEMENT → REVIEW) | Большая фича (4+ файлов) |
| `/myinsights` | Зафиксировать или recall insights | После каждой нетривиальной отладки |
| `/docs` | Генерация bilingual-документации (RU+EN) | В конце проекта или фичи |
| `/harvest` | Извлечение reusable-паттернов | После завершённого проекта |
| `/deploy` | Deployment workflow (dev/staging/prod) | Деплой |

---

## /replicate — главный pipeline

**Назначение:** превратить идею продукта в полностью документированный, валидированный, toolkit-готовый проект.

**Использование:**

```
/replicate "Маркетплейс хендмейд-товаров с AI-рекомендациями"
/replicate "название компании"     # для reverse-engineering режима
```

**Фазы:**

### Phase 0 — Product Discovery (опционально)

Активируется автоматически для SaaS, стартапов, новых продуктов. Скипается для
internal tools и экспериментов.

- Reverse-engineering похожих компаний (`reverse-engineering-unicorn` skill)
- JTBD анализ + конкуренты + Blue Ocean
- Output: `docs/00_product_discovery.md`

### Phase 1 — Planning (SPARC docs)

Генерирует 11 документов в `docs/`:

| Документ | Содержание |
|---|---|
| `PRD.md` | Vision, personas, user stories |
| `Solution_Strategy.md` | Подход к решению |
| `Specification.md` | Acceptance criteria, NFRs |
| `Pseudocode.md` | Алгоритмы и data flow |
| `Architecture.md` | C4 diagrams, tech stack |
| `Refinement.md` | Edge cases, testing strategy |
| `Completion.md` | Deploy, CI/CD, monitoring |
| `Research_Findings.md` | Market+tech research |
| `Final_Summary.md` | Executive summary |
| `C4_Diagrams.md` | Контекст / контейнеры / компоненты |
| `ADR.md` | Architecture Decision Records |

Использует `sparc-prd-mini` skill (включает explore + research + solve фазы).

### Phase 2 — Validation

Swarm из 5 параллельных агентов:

| Агент | Что валидирует |
|---|---|
| `validator-stories` | INVEST criteria для user stories |
| `validator-acceptance` | SMART criteria для AC |
| `validator-architecture` | Consistency архитектуры |
| `validator-pseudocode` | Cohesion алгоритмов |
| `validator-coherence` | Cross-document consistency |

**Verdict:**
- 🟢 READY (score ≥70) → Phase 3
- 🟡 CAVEATS (50-69) → Phase 3 с заметками
- 🔴 NEEDS WORK (<50 или blockers) → возврат на Phase 1 (max 3 retries)

### Phase 3 — Toolkit Generation

**Не генерирует pre-shipped команды** (они уже установлены через init). Генерирует
**только project-specific** артефакты:

- `.claude/agents/planner.md`, `code-reviewer.md`, `architect.md` (project-aware)
- `.claude/rules/security.md`, `coding-style.md`, `testing.md`
- `.claude/skills/project-context/`, `coding-standards/`
- `CLAUDE.md` enhanced с project-specific содержимым
- `.claude/feature-roadmap.json` (генерируется из PRD MVP scope)
- `DEVELOPMENT_GUIDE.md`, `README.md`

### Phase 4 — Finalize

- `docker-compose.yml`, `Dockerfile`, `.gitignore` (scaffold-файлы)
- Git commit «chore: initial project setup»
- Final summary

### Альтернативный вход — у вас уже есть техдокументация

Pipeline официально поддерживает старт **с уже существующей техдокументации** —
без прохождения Phase 0 (Product Discovery). Полезно когда:

- Вы переносите существующий проект под Claude Code workflow
- У вас есть tech spec / архитектура / API-доки от предыдущего этапа
- Вы хотите только сгенерировать SPARC-документы и/или провалидировать их

#### Триггеры (любой из вариантов)

`/replicate` switch'ит на этот режим, когда видит в input одно из:

- Path-указание: «используй мои доки в `docs/existing/`», «my tech specs in `<path>`»
- Явный skip: «skip discovery», «skip Phase 0»
- Утверждение: «у меня уже есть техническая документация»
- Семантический флаг: `/replicate --from-docs <path>` или `--skip-discovery`

#### Подготовка

Положите ваши доки в локальный подкаталог проекта (рекомендуется `docs/existing/`
или `docs/source/`) — они должны быть видны pipeline'у, но отделены от
сгенерированных SPARC-выходов.

```bash
mkdir -p docs/existing
cp your-tech-doc-*.md docs/existing/
```

#### Что меняется в каждой фазе

| Фаза | Стандартный режим | Существующие-docs режим |
|---|---|---|
| **Phase 0** | reverse-engineering-unicorn (опц.) | **SKIPPED** |
| **Phase 1** | sparc-prd-mini interactive | sparc-prd-mini **AUTO mode** + ваши доки как контекст |
| Phase 1 sub-phases | Explore + Research + Solve | **SKIPPED** (ответы уже у вас в доках) |
| **Phase 2** | Validation (5 агентов) | без изменений |
| **Phase 3** | Toolkit Generation | без изменений |
| **Phase 4** | Finalize + scaffolds | без изменений |

#### Три sub-пути

##### Path A — полный pipeline (рекомендуемый)

```
/replicate "Use my docs in docs/existing/, skip Phase 0"
```

Получите все 11 SPARC-документов + validation report + project-specific toolkit
+ Docker scaffold. Лучший выбор когда нужен полный generated-проект.

##### Path B — только SPARC docs

```
В Claude Code: «Используй skill sparc-prd-mini в AUTO режиме, читай контекст из
docs/existing/, сгенерируй 11 SPARC-документов в docs/. Не запускай Phase 2/3/4.»
```

Только 11 файлов в `docs/`. Без validation, без toolkit, без scaffold. Полезно
когда нужна только стандартизация документации.

##### Path C — только валидация

Если ваши доки уже SPARC-форматированы (есть `PRD.md`, `Architecture.md` и т.д.):

```bash
# 1. Переместите/переименуйте доки в стандартные имена
mv docs/existing/PRD.md docs/PRD.md
# ... остальные 10 SPARC-имен

# 2. В Claude Code:
«Вызови skill requirements-validator на docs/. Сгенерируй validation-report.md.»
```

Получите только `docs/validation-report.md` + `docs/test-scenarios.md`. Без
re-генерации SPARC.

#### Caveats (важно знать)

- **`[GAP: ...]` маркеры** — если в ваших доках нет покрытия для какого-то из
  11 SPARC-слотов, sparc-prd-mini поставит placeholder. Это нормально, но
  потребует ручного дополнения перед Phase 3.
- **Validation может пометить «не INVEST»** — если user stories в ваших доках
  не следуют INVEST/SMART, swarm выдаст 🟡 CAVEATS или 🔴 NEEDS WORK. Это
  сигнал, что доки стоит расширить, а не баг.
- **Архитектурные ограничения** — pattern, containers, infrastructure, deploy,
  AI integration — должны быть в ваших доках или явно переданы в input. По
  умолчанию sparc-prd-mini использует target-architecture из этой репы:
  Distributed Monolith / Docker / VPS / MCP.

#### Verification

После `/replicate` запустите:

```bash
npx @dzhechkov/p-replicator verify
```

`verify` сообщит:
- ✅ Pre-shipped contract intact
- ✅ Post-/replicate hints: SPARC docs, validation-report, опционально toolkit-артефакты

#### Future enhancement (M2 в KNOWN_LIMITATIONS)

Семантический флаг `--from-docs <path>` сейчас работает через natural-language
override в input'е `/replicate`. Формальный CLI-флаг с парсингом на уровне
команды — в roadmap'е (см. KNOWN_LIMITATIONS.md M2).

---

## /start — bootstrap проекта

**Назначение:** превратить SPARC-документацию в работающий monorepo с
`docker compose up`.

**Использование:**

```
/start                                  # с тестами + миграциями
/start --skip-tests                     # без тестов (быстрее)
/start --skip-seed                      # без DB seeding
/start --dry-run                        # preview без записи
```

**4 фазы (sequential → parallel → sequential → finalize):**

1. **Foundation** — root configs (`package.json`, `docker-compose.yml`, `.env.example`)
2. **Packages** (⚡ parallel via `Task` tool) — один Task на пакет из Architecture.md
3. **Integration** — `docker compose build/up`, миграции, health-check
4. **Finalize** — README + git tag `v0.1.0-scaffold`

**Critical rule:** каждый Task в Phase 2 ОБЯЗАН ссылаться на конкретные SPARC
docs (e.g., `docs/Specification.md` → ORM schema), не генерировать из памяти.

---

## /run — автономная сборка фич

**Назначение:** прокрутить весь roadmap (или MVP-подмножество) автоматически.

**Использование:**

```
/run mvp                                          # только priority=mvp
/run all                                          # всё что в `next`/`planned`
/run mvp --feature-branches                       # каждая фича в отдельной ветке
/run mvp --feature-branches --auto-merge          # с автомерджем
```

**Workflow одной итерации:**

```
while есть фичи в scope:
    feature_id = /next                       # выбрать highest-priority
    if no feature: break
    /go feature_id                           # complexity router
    verify (tests green, code committed)
    mark roadmap entry: status=done
    git commit + git push
```

**При `--feature-branches`** добавляются шаги:
1. Verify on `main` (else fail)
2. Auto-stash dirty working tree
3. `git checkout -b feature/{NNN}-{id}` (NNN = zero-padded 3-digit)
4. После реализации: `git push origin feature/{NNN}-{id}`
5. Update roadmap с `branch` field
6. `git checkout main`
7. (если `--auto-merge`) `git merge --no-ff feature/{NNN}-{id}`

**Use case:** для обучения / демо. Инструктор checkout'ит `feature/003-payment`
для конкретной демонстрации.

---

## /go — intelligent router

**Назначение:** автоматически выбрать `/plan`, `/feature` или `/feature-ent`
по complexity score.

**Использование:**

```
/go auth-jwt                       # фича из roadmap по id
/go "Add Stripe integration"       # свободное описание
/go auth-jwt --feature-branches    # с branch workflow (см. /run)
```

**Complexity scoring matrix:**

| Сигнал | Очки |
|---|---|
| Touches ≤ 3 files | -2 |
| Touches > 10 files | +3 |
| External API integration | +2 |
| New DB entities | +2 |
| Cross-bounded-context dependencies | +3 |
| Hotfix | -3 |
| > 2 hours implementation | +3 |

**Decision:**
- ≤ -2 → `/plan`
- -1 to +4 → `/feature`
- ≥ +5 + `/feature-ent` доступен → `/feature-ent` (DDD pipeline)
- ≥ +5 без `/feature-ent` → `/feature` с extra architecture care

---

## /next — навигатор по roadmap

**Использование:**

```
/next                          # default: top 3 next/planned features
/next update                   # сканирует код, suggest status updates
/next auth-jwt                 # mark done + cascade unblock
```

**Default output:**

```
1. [mvp] auth-jwt — JWT login (medium, 2-4h)
2. [mvp] user-profile — Profile CRUD (simple, 1-2h)
3. [high] payment-webhook — Stripe handler (complex, 4-6h)

In progress: <id>
Done: 5/12
Blocked: 1
```

**Roadmap schema** см. в `04_api_reference.md`.

---

## /plan — лёгкий план

**Когда:** ≤3 файла, < 30 мин implementation, без новой архитектуры.

**Использование:**

```
/plan add-validation-helper
/plan "fix race condition in cart"
```

**Output:** `docs/plans/<slug>.md` с секциями:
- Goal (1-2 предложения)
- Tasks (numbered checklist)
- Files Touched (table)
- Dependencies + Risks
- Verification

Auto-commit через Stop hook.

---

## /feature — полный SPARC-mini цикл

**Когда:** ≥4 файла, новая capability, новая архитектура.

**4 фазы с checkpoints:**

### Phase 1 — PLAN (sparc-prd-mini)
Генерирует 5 SPARC docs в `docs/features/<feature>/`:
- `01_specification.md`, `02_pseudocode.md`, `03_architecture.md`,
  `04_refinement.md`, `05_completion.md`

### Phase 2 — VALIDATE (requirements-validator)
Score ≥ 70 → Phase 3. Auto-retry на 🟡 (caveats), max 3 retry на 🔴.

### Phase 3 — IMPLEMENT (parallel agents)
`Task` tool spawns параллельные tasks по independent units из Architecture.

### Phase 4 — REVIEW (brutal-honesty-review)
Findings по severity: blocker (must fix) / high / medium / low.

**AUTO mode** (вызвано из `/go` или `/run`): без per-phase confirmations.

### Feature workflow в существующем проекте (Mode 2)

`/feature` официально поддерживает **два режима** входа — оба используют
идентичный 4-фазный pipeline (PLAN → VALIDATE → IMPLEMENT → REVIEW), те же
validation thresholds, ту же retry-логику.

| Mode | Когда | Pre-conditions |
|---|---|---|
| **Mode 1: Post-/replicate** | Проект bootstrap'нут через `/replicate` | CLAUDE.md, docs/, scaffold всё сгенерено /replicate |
| **Mode 2: Existing project** | Проект уже работает, добавляем фичи с верификацией | `init` запущен поверх существующего проекта; CLAUDE.md уже существует |

#### Когда использовать Mode 2

- У вас уже есть стек, PRD, Specification, Architecture, CLAUDE.md
- Вы хотите добавлять фичи с **тем же циклом валидации** что в `/replicate`
- Вы НЕ хотите перегенерировать существующий CLAUDE.md и scaffold

#### Шаги для Mode 2

```bash
# 1. Установка (idempotent — НЕ трогает CLAUDE.md и существующие .claude/ файлы)
cd existing-project
npx @dzhechkov/p-replicator init
npx @dzhechkov/p-replicator verify     # pre-shipped contract OK

# 2. Нормализация SPARC-путей (одноразово)
#    /feature ожидает docs/PRD.md, docs/Specification.md, docs/Architecture.md
mv docs/your-prd.md   docs/PRD.md
mv docs/your-spec.md  docs/Specification.md
mv docs/your-arch.md  docs/Architecture.md

# 3. (Опционально) feature-roadmap для batch-режима через /run
cat > .claude/feature-roadmap.json << 'EOF'
{
  "features": [
    {"id": "stripe-payments", "title": "Stripe", "priority": "mvp", "status": "planned"},
    {"id": "user-2fa",        "title": "2FA TOTP", "priority": "mvp", "status": "planned"}
  ]
}
EOF

# 4. Запуск
claude
/feature stripe-payments                    # одна фича
/run mvp --feature-branches --auto-merge    # batch с git-веткованием
```

#### Три sub-пути для Mode 2

##### Path A — `/feature` напрямую (рекомендуемый)

Одна фича, полный 4-фазный lifecycle. Подходит когда фича ≥4 файлов или
вводит новую capability/архитектуру.

```
/feature add-stripe-payments
```

##### Path B — `/go` auto-router

Сам решает между `/plan` (≤3 файла) и `/feature` (≥4 файла) по эвристикам.

```
/go add-pagination          # → /plan (мелкая)
/go add-stripe-payments     # → /feature (крупная)
```

##### Path C — прямой вызов skills (только validation-цикл)

Если у вас своя реализация-флоу и нужен **только** validation-cycle:

```
В Claude Code:
«Вызови skill requirements-validator на docs/features/my-feature/.
 Сгенерируй validation-report.md с verdict 🟢/🟡/🔴.»

После реализации:
«Вызови skill brutal-honesty-review на изменённые файлы.»
```

#### Что сохраняется при `init` в существующем проекте

| Артефакт | Поведение |
|---|---|
| `CLAUDE.md` (root) | **Сохраняется** (только `--force` перезапишет) |
| `docs/PRD.md`, `Specification.md`, ваши доки | **Сохраняются** |
| `.claude/commands/your-custom.md` | **Сохраняются** |
| `.claude/settings.json` | **Сливается** (v1.4.2+ deep-equals merge с `shippedDefaults` baseline для orphan-detection) |
| `.gitignore`, `package.json` | **Не трогаются** |
| `.p-replicator.json` | Создаётся новый (manifest) |

#### Validation thresholds (идентичны Phase 2 of /replicate)

`requirements-validator` оценивает по INVEST (user stories) + SMART (acceptance
criteria). Тот же swarm-of-5 что в `/replicate`:

- 🟢 **READY** (score ≥ 70) — IMPLEMENT
- 🟡 **CAVEATS** (50-69, нет blockers) — IMPLEMENT + auto-retry один раз
- 🔴 **NEEDS WORK** (< 50 OR blockers) — возврат на PLAN, max 3 retries → halt

После `IMPLEMENT` — `brutal-honesty-review` с severity:
`blocker` (must fix) / `high` (fix unless deferred) / `medium` (follow-up issue) / `low` (logged only).

#### Caveats Mode 2 (важно знать)

1. **`/start` НЕ запускайте** — он для свежих scaffold'ов под `Architecture.md`,
   не для добавления к существующему проекту.
2. **`/feature-ent` недоступна** в Mode 2 если нет DDD/ADR/C4-доков — `/replicate`
   Phase 3 нормально генерит её условно. Используйте `/feature` или `/go`.
3. **Auto-commit hooks** (`Stop` → `autocommit-roadmap.cjs` / `-insights.cjs` /
   `-plans.cjs`) могут конфликтовать с custom git-workflow. Решение: после `init`
   отредактируйте `.claude/settings.json` — удалите ненужные matchers. v1.4.2+
   merge logic сохранит правки на следующих `update` командах благодаря
   `shippedDefaults` baseline.
4. **Нестандартные пути доков** — нет флагов `--prd-path` / `--spec-path`.
   Решение: одноразовый rename или symlink. См. KNOWN_LIMITATIONS.md M3 —
   формальный config-flag в roadmap (Tier S effort).

#### Verification

После `/feature` (или `/run`) запустите:

```bash
npx @dzhechkov/p-replicator verify
```

Должен показать:
- ✅ Pre-shipped contract intact (10 skills + 11 commands + 4 agents + 6 rules + settings.json)
- ✅ Post-/replicate hints — для Mode 2 многие будут отсутствовать (это нормально)
- 📊 Per-feature artifacts: `docs/features/<id>/01_specification.md`...`05_completion.md`,
  `validation-report.md`, `review-report.md`

#### Future enhancement (M3 в KNOWN_LIMITATIONS)

`docPaths` config в `.p-replicator.json` для нестандартных путей доков —
в roadmap'е. Tier S effort, чисто config + spec-read изменения, без
изменений CLI-кода.

---

## /myinsights — knowledge capture

**Назначение:** строить project-local knowledge base «грабли» (rakes), которые
auto-injected'ятся в каждую сессию через `SessionStart` hook.

**Использование:**

```
/myinsights                                 # interactive prompt
/myinsights "Prisma migrate dev fails silently if shadow DB unreachable. Workaround: set DATABASE_URL_SHADOW explicitly."
/myinsights recall prisma                  # search by keyword
```

**Структура entry:**

```markdown
## 2026-05-07 — Prisma shadow DB requirement

**Tags:** prisma-migration, postgres-shadow

**Problem:**
Migrate dev fails silently when shadow DB unreachable (no error message).

**Solution:**
Set DATABASE_URL_SHADOW env var explicitly to a separate database.

**References:** packages/backend/prisma/schema.prisma:12, commit a3f4...
```

**Auto-injection:** `SessionStart` hook (`.claude/hooks/session-insights.cjs`)
читает `.claude/insights/index.md`, выводит 3 свежих entries в stdout, Claude
Code инжектит в initial context.

---

## /docs — генератор документации

**Это команда, которая создала эти файлы.** Bilingual (RU + EN) по умолчанию.

**Использование:**

```
/docs                       # RU + EN, create or replace
/docs ru                    # только русский
/docs eng                   # только английский
/docs update                # обновить только изменённые секции
```

**Output:** `README/{ru,eng}/` с 8 файлами per language (этот файл — один из них).

---

## /harvest — извлечение знаний

**Назначение:** в конце проекта извлечь reusable-паттерны (skills, commands,
rules, templates, snippets) для использования в новых проектах.

**Использование:**

```
/harvest quick               # быстро, без checkpoints (~15 мин)
/harvest full                # полный 4-фазный pipeline (~45 мин)
/harvest marker              # пометить артефакт для extraction
/harvest audit               # ревью toolkit-зрелости
```

**4 фазы (full):**
1. AGENT REVIEW — 5 параллельных scanner-агентов
2. CLASSIFY — 7 категорий (skills/commands/rules/templates/...)
3. DECONTEXTUALIZE — убрать project-specific имена
4. INTEGRATE — записать в toolkit, обновить index

---

## /deploy — deployment workflow

**Использование:**

```
/deploy dev          # auto, минимум checks
/deploy staging      # gate checks + smoke tests + health
/deploy prod         # explicit `yes` confirmation + rollback plan
```

**Per-tier gate checks:**
- ALL: tests pass, build OK, lint clean
- STAGING+PROD: env vars set, external services reachable, images tagged
- PROD: staging successful in 24h, no critical issues, on-call notified

**Auto-rollback** на staging/prod при failed health-check.

---

## Связи между командами

```
/replicate ─┬─ /start ──────── (один раз для bootstrap'а)
            │
            └─ /run mvp/all ──┬─ /next (выбор)
                              ├─ /go ──┬─ /plan (simple)
                              │       └─ /feature (standard)
                              │           └─ AUTO mode внутри /run
                              └─ git push + roadmap update

В любой момент:
  /myinsights — фиксация знаний
  /docs — обновление документации
  /verify, /doctor — health checks (CLI)

В конце:
  /harvest — извлечение паттернов
  /deploy — деплой в production
```

Подробности по конфигурации hooks/statusline/insights см. в
[03_admin_guide.md](./03_admin_guide.md).
