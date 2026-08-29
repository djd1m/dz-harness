---
name: triple-check
description: Verify a document or directory satisfies the 3-pillar discipline (ADR + Methodology + Research) for every factual claim. Reports gaps as actionable list.
trust_tier: 1
---

# /triple-check

Проверяет, что каждый фактический claim в документе(ах) поддержан минимум одним из:
- **ADR** (inline ссылка на `adrs/*.md` или `ADR-NNN`)
- **Methodology** (inline ссылка на `methodologies/*.md` или `(см. Методика: ...)`)
- **Research** (inline ссылка на `researches/*/` или внешний Tier A/B/C источник)

Реализует governance из `governance/triple-pillar.governance.md` и `shards/triple-pillar.shard.md`.

## Usage

```
/triple-check <path>
```

`<path>` может быть:
- Конкретный файл: `/triple-check QUICKSTART.md`
- Директория: `/triple-check wiki/concepts/`
- Glob: `/triple-check "wiki/**/*.md"`
- Без аргумента: проверяет staged-файлы из `git diff --cached --name-only -- '*.md'`

## Что такое factual claim

Утверждение, требующее источника (см. `governance/triple-pillar.governance.md`):

| Считается | Не считается |
|-----------|--------------|
| Числа, проценты, метрики | Описания собственного продукта |
| Заявления о конкурентах | User personas (явно фиктивные) |
| Market data, бенчмарки | Process descriptions |
| Регуляторные ссылки | Архитектурные диаграммы |
| Технические capability claims | Headings |
| ROI / TCO / финансовые проекции | Standalone images |

## Pipeline (5 шагов)

### Step 1 — Parse markdown
Разобрать файл на параграфы и предложения. Игнорировать code blocks (` ``` `), HTML-комментарии, YAML frontmatter, секции между `<!-- wiki:see-also-start -->` и `<!-- wiki:see-also-end -->`.

### Step 2 — Claim detection (haiku)
Каждое предложение пропустить через детектор:
- Содержит ли число / процент / метрику?
- Содержит ли название компании / конкурента?
- Содержит ли capability claim (поддерживает/не поддерживает X)?
- Содержит ли regulatory reference?

Помечает каждое предложение как `claim` / `non-claim`.

### Step 3 — Source detection
Для каждого `claim` ищет в том же параграфе ИЛИ в `(см. ...)` после предложения:
- Markdown link на `adrs/*.md` или `ADR-NNN`
- Markdown link на `methodologies/*.md` или `(см. Методика: ...)`
- Markdown link на `researches/*/`
- Внешний URL (http/https)

Каждый claim получает 4 boolean: `has_adr`, `has_methodology`, `has_research`, `has_external_url`.

### Step 4 — Verdict per claim

| has_adr | has_methodology | has_research | has_external_url | Verdict |
|---------|----------------|--------------|------------------|---------|
| ✓ | ✓ | ✓ | * | **GOLD** (полный 3-pillar) |
| ✓ | * | ✓ | * | OK (ADR + Research) |
| * | ✓ | * | ✓ | OK (Methodology + external) |
| * | * | * | ✓ | WEAK (только external; Tier C/D рискованны) |
| * | * | * | * | **MISSING** (голый факт) |
| * | * | ✓ | * | OK (Research) |

### Step 5 — Report
Сгенерировать markdown-отчёт:

```
═══════════════════════════════════════════════════════
🔍 TRIPLE-CHECK Report — {path}
═══════════════════════════════════════════════════════

Файлов проверено: N
Claims найдено: M
  ├─ GOLD (3-pillar):     X (Y%)
  ├─ OK:                  X (Y%)
  ├─ WEAK (только ext):   X (Y%)
  └─ MISSING:             X (Y%)  ← ⚠️ требует действия

═══ Gaps (ТОП-10 MISSING) ═══

{file}:{line} — "{snippet}"
  Suggested: добавить inline-ссылку на ADR-NNN / methodologies/X.md / external URL

...

═══ Verdict ═══

<promise>TRIPLE_CHECK_PASSED</promise>      (0 MISSING + 0 WEAK)
ИЛИ
<promise>TRIPLE_CHECK_WARN</promise>        (0 MISSING, >0 WEAK)
ИЛИ
<promise>TRIPLE_CHECK_FAILED</promise>      (>0 MISSING)

═══════════════════════════════════════════════════════
```

## Rules

1. **НЕ модифицировать файлы** — это read-only validator, никаких автоматических правок
2. **НЕ блокировать на WEAK** — только predicting / informational warn
3. **MISSING = блок** для /feature-adr step 8 (QE) и /casarium Phase 4 checkpoint
4. **Code blocks игнорируются** — там могут быть числа, не являющиеся claims
5. **YAML frontmatter игнорируется** — это metadata, не текст для пользователя
6. **Wiki backlink-секции игнорируются** — они auto-generated, не human content

## Integration с другими командами

- `/wiki-generate` запускает `/triple-check` в Step 8 для всех новых концептов
- `/feature-adr` step 7 (Code) и step 8 (QE) запускают `/triple-check` на ADR и сгенерированных артефактах
- `/casarium` Phase 4 (Architecture) запускает `/triple-check 04_architecture.md`
- PreCommit hook (`hooks/pre-commit-triple-check.sh`) запускает для staged .md

## Model Routing

| Step | Model | Rationale |
|------|-------|-----------|
| 1 (parse) | (deterministic) | regex / markdown parser |
| 2 (claim detect) | haiku | бинарная классификация per предложение |
| 3 (source detect) | (deterministic) | regex для links |
| 4 (verdict) | (deterministic) | таблица решений |
| 5 (report) | haiku | форматирование |

Никогда не использовать sonnet/opus для этой команды — она deterministic + classification, не creative.

## Failure Modes

| Failure | Cause | Recovery |
|---------|-------|----------|
| Файл не найден | Опечатка в path | Re-check path argument |
| 100% claims MISSING | Документ не markdown / экзотический формат | Check парсер настроен на правильный формат |
| Timeout | Гигантский файл (>50KB) | Разбить на части или повысить timeout |
| False positives на claims | Художественный текст | Опционально skip через `<!-- triple-check:ignore -->` маркер |

## Related

- `governance/triple-pillar.governance.md` — спецификация требований к источникам
- `shards/triple-pillar.shard.md` — где обязателен 3-pillar (phase gates)
- `skills/concept-wiki-generator/SKILL.md` — генератор, который вызывает /triple-check на выходе
