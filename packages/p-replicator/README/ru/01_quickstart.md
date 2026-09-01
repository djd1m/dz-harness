# 01. Быстрый старт

5 минут от пустой папки до работающего AI-pipeline'а.

## Предусловия

- Node.js ≥ 16.0.0
- Claude Code установлен (CLI или web)
- Git инициализирован в проекте (`git init` если ещё нет)
- Docker + Docker Compose (нужны для `/start` фазы 3)

## Установка

В корне вашего проекта:

```bash
npx @dzhechkov/p-replicator init
```

Это создаст:

- `.claude/skills/` — 10 предустановленных skills
- `.claude/commands/` — 11 slash-команд (`/replicate`, `/run`, `/feature`, ...)
- `.claude/agents/` — 4 пайплайн-агента
- `.claude/rules/` — 9 governance-правил
- `.claude/hooks/` — 6 cross-platform Node-скриптов
- `.claude/settings.json` — конфигурация hooks + statusline
- `.p-replicator.json` — манифест установки

Установка идемпотентна: `init` не перезапишет существующие файлы без флага
`--force`.

## Первый запуск

```bash
claude                                    # открыть Claude Code в проекте
```

В Claude Code выполните:

```
/replicate "Опишите ваш продукт в 1-2 предложениях"
```

Это запустит 5-фазный pipeline:

| Фаза | Что делает | Артефакты |
|------|-----------|-----------|
| **0. Product Discovery** (опционально) | Reverse-engineering похожих компаний | `docs/00_product_discovery.md` |
| **1. Planning** | Генерирует 11 SPARC-документов | `docs/PRD.md`, `Architecture.md`, `Pseudocode.md`, ... |
| **2. Validation** | Swarm из 5 агентов проверяет docs (INVEST/SMART, score ≥70) | `docs/validation-report.md` |
| **3. Toolkit Generation** | Генерирует project-specific агенты, правила, скиллы | `.claude/agents/planner.md`, `architect.md`, ... |
| **4. Finalize** | Scaffolds (Dockerfile, docker-compose.yml, .gitignore) + git commit | Project-готов |

В каждой фазе — checkpoint: вы пишете «ок» для продолжения или даёте feedback.

## Альтернативный вход — у меня уже есть техдокументация

Если у вас на руках уже есть техническая документация (tech spec, архитектура,
API-описания, design docs), можно **пропустить Phase 0** (Product Discovery) и
скормить ваши доки прямо в Phase 1 как pre-filled context.

### Подготовка

```bash
mkdir -p docs/existing
cp your-tech-doc-*.md docs/existing/    # положите свои доки сюда
```

### Запуск (3 sub-пути)

| Путь | Когда подходит | Что вызывается |
|---|---|---|
| **A. /replicate с override** | Полный pipeline + toolkit + scaffold | `/replicate "Use my docs in docs/existing/, skip Phase 0"` |
| **B. Только SPARC docs** | Хочется только 11 SPARC-документов | Прямой вызов skill: «использовать `sparc-prd-mini` в AUTO режиме на `docs/existing/`» |
| **C. Только валидация** | Доки уже SPARC-форматированы | Переименовать в `PRD.md`, `Architecture.md` и т.д., затем «вызвать `requirements-validator`» |

### Что меняется в pipeline

- **Phase 0** — пропускается полностью
- **Phase 1** — `sparc-prd-mini` запускается в AUTO mode (без интерактивных вопросов), читает ваши доки, генерирует 11 SPARC-слотов; недостающее помечается `[GAP: ...]`
- **Phase 2-4** — без изменений (валидация → toolkit → scaffold)

### Caveats

- Не каждая ваша дока ляжет на 11 SPARC-слотов — ожидайте `[GAP: ...]` маркеров
- Validation может пометить user stories «не INVEST» — это сигнал, что ваши доки
  стоит дополнить, а не баг
- Архитектурные ограничения (pattern, containers, infra, deploy, AI) передавайте
  в Phase 1 явно, если их нет в ваших доках

Полный спец см. в `.claude/commands/replicate.md` секция «Alternative entry» и
правило `.claude/rules/replicate-pipeline.md`.

## Добавление фич в существующий проект (Mode 2)

Если у вас **уже есть рабочий проект** (стек определён, PRD/Specification/
CLAUDE.md существуют) и вы хотите добавлять новые фичи с тем же циклом
верификации что в `/replicate` — используйте `/feature`, а не `/replicate`.

### Установка (idempotent)

```bash
cd existing-project
npx @dzhechkov/p-replicator init     # НЕ перезапишет ваш CLAUDE.md
npx @dzhechkov/p-replicator verify   # убедиться что pre-shipped contract цел
```

### Нормализация SPARC-путей (одноразово)

`/feature` читает доки из стандартных слотов:

```bash
mv docs/your-prd.md   docs/PRD.md             # если у вас другие имена
mv docs/your-spec.md  docs/Specification.md
mv docs/your-arch.md  docs/Architecture.md
# Pseudocode / Refinement / Completion — опционально
```

### Запуск фич (3 sub-пути)

| Путь | Когда подходит | Команда |
|---|---|---|
| **A. /feature напрямую** | Одна фича, ≥4 файлов, новая capability | `/feature add-stripe-payments` |
| **B. /go auto-router** | Микс по сложности | `/go add-pagination` (роутит /plan vs /feature) |
| **C. Прямые skill-вызовы** | Только validation-цикл, без полного lifecycle | `requirements-validator` + `brutal-honesty-review` |

### Validation thresholds (тот же swarm, что в /replicate Phase 2)

| Verdict | Score | Действие |
|---|---|---|
| 🟢 READY | ≥ 70 | IMPLEMENT |
| 🟡 CAVEATS | 50-69 | IMPLEMENT + auto-retry один раз |
| 🔴 NEEDS WORK | < 50 / blockers | возврат на PLAN, max 3 retries |

### Что сохраняется при `init`

- `CLAUDE.md` (root) — **не трогается** (только `--force`)
- `docs/PRD.md`, `Specification.md` — **не трогаются**
- `.claude/commands/your-custom.md` — **не трогаются** (init добавляет только pre-shipped 11)
- `.claude/settings.json` — **сливается** через v1.4.2+ merge logic с deep-equals
- `.gitignore`, `package.json` — **не трогаются** init'ом

### Caveats

- `/start` НЕ запускайте в Mode 2 — он для свежих scaffold'ов
- `/feature-ent` недоступна в Mode 2 без ручного добавления DDD/ADR/C4 доков
- Auto-commit hooks (Stop) могут конфликтовать с вашим git-workflow — отредактируйте
  `settings.json` после `init` (merge сохранит ваши правки на следующих апдейтах)
- Нет флага `--prd-path` для нестандартных путей — нужен одноразовый rename/symlink
  (см. KNOWN_LIMITATIONS.md M3)

Полный recipe в `02_user_guide.md` секция «Feature workflow в существующем проекте (Mode 2)».

## Проверка установки

После `/replicate` выполните:

```bash
npx @dzhechkov/p-replicator verify
```

Команда проверит:

- **Pre-shipped contract** (must-have): 10 skills + 11 commands + 4 agents + 13 rules + settings.json
- **Post-/replicate hints** (advisory): CLAUDE.md, project-specific агенты,
  feature-roadmap.json, security-правила и т.д.

Exit code `0` означает что pre-shipped контракт цел; warnings показывают что
из project-specific артефактов ещё не создано.

Альтернатива (для общей health-проверки):

```bash
npx @dzhechkov/p-replicator doctor
```

## Что делать дальше

Сразу после `/replicate` доступны 3 основных пути:

### 1. Bootstrap проекта (`/start`)

```
/start
```

Реализует scaffold по `docs/Architecture.md`: создаёт пакеты в monorepo,
генерирует `package.json`, поднимает Docker, прогоняет migrations.

### 2. Автономная сборка фич (`/run mvp`)

```
/run mvp                                    # только MVP-фичи
/run all                                    # все фичи из roadmap
/run mvp --feature-branches                 # каждая фича в отдельной ветке
/run mvp --feature-branches --auto-merge    # с автомерджем в main
```

Цикл: `/next` → `/go <id>` → пушит коммит → следующая фича. Останавливается
когда roadmap пустой.

### 3. Одна конкретная фича (`/go`)

```
/go auth-jwt                          # auto-роутер /plan vs /feature
/feature auth-jwt                     # явно полный SPARC-mini цикл
/plan add-payment-gateway             # лёгкий плановый файл
```

## Дополнительные команды

| Команда | Когда использовать |
|---|---|
| `/myinsights "описание"` | Зафиксировать «грабли» — error/workaround для будущих сессий |
| `/docs` | Сгенерировать пользовательскую документацию (RU+EN) |
| `/harvest` | Извлечь reusable-паттерны из проекта в knowledge-базу |
| `/deploy staging` | Deployment workflow с per-tier проверками |

## Что в проекте появилось после `init`

```
ваш-проект/
├── .claude/
│   ├── skills/              # 10 skills
│   ├── commands/            # 11 slash-команд
│   ├── agents/              # 4 pipeline-агента
│   ├── rules/               # 13 правил
│   ├── hooks/               # 6 Node-скриптов
│   └── settings.json        # hooks + statusline config
├── .p-replicator.json       # манифест установки
└── (your existing files…)
```

Все файлы в `.claude/` — каноничные шаблоны от пакета. Не редактируйте их
напрямую: на следующем `update` они мерджатся через
`mergeSettingsJson`+`removeOrphanHooks` алгоритм (с сохранением user
customizations).

## Следующие шаги

- Прочитайте [02_user_guide.md](./02_user_guide.md) — детали по каждой команде
- Прочитайте [03_admin_guide.md](./03_admin_guide.md) — настройка hooks/statusline
- Если что-то не работает — [06_troubleshooting.md](./06_troubleshooting.md)
