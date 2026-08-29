---
description: Bootstrap project from SPARC documentation. Generates monorepo skeleton, packages, Docker configs, database schema, core modules, and basic tests in 4 phases (Foundation → Packages parallel → Integration → Finalize). Reads `docs/` as source of truth.
argument-hint: '[--skip-tests | --skip-seed | --dry-run]'
---

# /start $ARGUMENTS

## Purpose

One-command project generation from SPARC documentation → working monorepo
with `docker compose up`. Reads `docs/` (NOT memory), maximizes parallelism
via `Task` tool, commits per logical change for safe error recovery.

## Prerequisites

- SPARC documents in `docs/` (output of `/replicate` Phase 1)
- `CLAUDE.md` at project root
- Docker + Docker Compose installed
- Git initialized

## Phases

### Phase 1: Foundation (sequential)

1. **Read all SPARC docs** to build full context:
   - `docs/Architecture.md` → monorepo structure, Docker Compose, tech stack
   - `docs/Specification.md` → data model, API endpoints, NFRs
   - `docs/Pseudocode.md` → core algorithms
   - `docs/Completion.md` → env config, deployment
   - `docs/PRD.md` → features (for README)
   - `docs/Refinement.md` → edge cases, testing strategy

2. **Generate root configs:** `package.json` (monorepo workspaces),
   `docker-compose.yml`, `.env.example`, `.gitignore`, `tsconfig.base.json`.

   **Два из них `/replicate` уже мог записать.** Штатная последовательность — `/replicate`, затем
   `/start`, а Phase 4 команды `/replicate` создаёт `docker-compose.yml` и `.gitignore` из того же
   `Architecture.md`. Значит это не два разных файла, а один, выведенный дважды, и слепая
   перегенерация молча выбросит всё, что между двумя запусками правили руками.

   Для `docker-compose.yml`, `.gitignore` и `README.md` действует правило `if not exists`:
   - файла НЕТ → создать, как обычно;
   - файл ЕСТЬ → **не перегенерировать**. Прочитать его и оставить; внести только МИНИМАЛЬНУЮ
     точечную правку, которой требует названное требование из документов (появился пакет, которого
     в файле нет; порт из `Architecture.md` не проброшен). Всё, что к этому требованию не относится,
     сохраняется без изменений.
   - Перед коммитом ПОСМОТРЕТЬ ДИФ и НАЗВАТЬ каждый изменённый фрагмент и его причину. «Добавил
     недостающий порт», под которым лежит переписанный целиком файл, — это и есть та потеря,
     которую правило предотвращает; диф отличает одно от другого, а обещание не отличает.

3. **Git commit:** `chore: project root configuration`. Если на шаге 2 менялся уже существовавший
   `docker-compose.yml`, `.gitignore` или `README.md` — тело коммита перечисляет каждый изменённый
   фрагмент и причину. Фиксированный заголовок не отменяет этого перечня: заголовок говорит, ЧТО за
   шаг, тело — что именно он тронул в чужом файле.

### Phase 2: Packages (PARALLEL via Task tool ⚡)

For EACH package in Architecture.md, spawn an independent Task referencing
SOURCE DOCS (not memory):

```
### Task <X>: packages/<name> ⚡
Read and use as source:
- docs/Specification.md → data model → ORM schema
- docs/Architecture.md → API endpoints → routes
- docs/Pseudocode.md → algorithms → service layer

Generate: src/<files>, tests/<files>, package.json, README.md
Commits: one per logical group.
```

### Phase 3: Integration (sequential)

1. Verify cross-package imports
2. `docker compose build`
3. `docker compose up -d`
4. Database migration (if applicable): `npx prisma migrate dev` (or equivalent)
5. Health check: `curl localhost:<port>/health`
6. Run tests
7. Git commit: `chore: verify docker integration`

### Phase 4: Finalize

1. Generate/update `README.md` with quick start
2. `git tag v0.1.0-scaffold`
3. Report summary

## Flags

- `--skip-tests` — don't generate test files (NOT recommended)
- `--skip-seed` — skip DB seeding
- `--dry-run` — show plan without executing

## Critical Rules

1. **Docs as source of truth** — every file references specific docs, never memory
2. **Maximize parallelism** — independent packages run as parallel Tasks
3. **Atomic commits** — one commit per logical change
4. **Full integration** — Phase 3 includes build + start + health check
5. **Project-specific** — adapt all examples to actual tech stack

## Related

- `/replicate` — generates the SPARC docs that `/start` reads
- `/run mvp` — builds features after scaffold is up
- `/feature <name>` — implement individual features
