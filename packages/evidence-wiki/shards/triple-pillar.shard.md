# Governance Shard: Triple-Pillar Discipline

**Promise tag:** `<promise>TRIPLE_PILLAR_VERIFIED</promise>` / `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>`
**Applies to:** /feature-adr (Steps 3, 5, 7, 8), /casarium (Phase 2, 3, 4), /wiki-generate (Step 8)
**Time budget:** ~5 минут per документ (validation only, не generation)
**Core spec:** этот shard — **пример project-local instantiation** домен-агностичного протокола [`governance/triple-pillar.governance.md`](../governance/triple-pillar.governance.md). Изменения общего протокола вносятся в core (`governance/`); здесь — только project-specific config (paths `adrs/` / `methodologies/` / `researches/`, регулятор-якоря). В составе плагина этот файл — **образец**: скопируйте в `.claude/shards/` целевого проекта и адаптируйте под его структуру.

## Context

Этот проект — мастер-репозиторий, в котором **каждый факт** в любом документе должен опираться на 3 кита:

1. **ADR** (`adrs/*.md`) — архитектурное решение, объясняющее ПОЧЕМУ выбран этот подход
2. **Methodology** (`methodologies/*.md`) — расчётная методика для количественных утверждений
3. **Research** (`researches/*/`) — глубинное исследование с верифицированными источниками

Дисциплина 3 китов сформирована эмпирически в проекте-источнике (ритуал «Inline Source Verification»). Этот shard формализует её как machine-checked gate.

## When This Shard Applies

| Pipeline | Phase / Step | Что проверяется |
|----------|-------------|-----------------|
| `/feature-adr` | Step 3 (ADR creation) | Новый ADR содержит references на supporting research или methodology |
| `/feature-adr` | Step 5 (Architecture) | Архитектурные claims имеют backing ADR + methodology |
| `/feature-adr` | Step 7 (Code) | Документация изменений включает inline ссылки |
| `/feature-adr` | Step 8 (QE) | Полный triple-check на все артефакты `features/<slug>/` |
| `/casarium` | Phase 2 (Research) | Каждый finding имеет Tier A/B/C/D источник |
| `/casarium` | Phase 3 (Solve) | Solution claims имеют research backing |
| `/casarium` | Phase 4 (Architecture) | Триггерит /triple-check на 04_architecture.md |
| `/wiki-generate` | Step 8 (validation) | Каждый concept имеет ≥3 pillars или INCOMPLETE |
| PreCommit hook | (опционально) | Staged .md проверяются автоматически |

## Quality Gates

### Gate 1 — Concept Coverage
Каждый concept в `wiki/concepts/` ДОЛЖЕН иметь в YAML frontmatter:
```yaml
pillars:
  adr: [<min 1 ref>]
  methodology: [<min 1 ref>]
  research: [<min 1 ref>]
```

Если хотя бы один pillar пуст → emit `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` и явный warning в секции "3-pillar gap" страницы.

### Gate 2 — Claim Coverage in QUICKSTART/pitch/research-findings
В файлах с фактическими claims (QUICKSTART.md, *-pitch.md, research-findings-index.md, *.md в researches/):
- 0 MISSING claims → `<promise>TRIPLE_PILLAR_VERIFIED</promise>` ✅
- 0 MISSING + WEAK >0 → `<promise>TRIPLE_PILLAR_WARN</promise>` ⚠️ (proceed but flag)
- MISSING >0 → `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` ❌ (block downstream phase)

### Gate 3 — ADR Backing
Каждый ADR (`adrs/*.md`) ДОЛЖЕН содержать минимум одну ссылку на:
- Internal: `methodologies/*.md` ИЛИ `researches/*/` ИЛИ `wiki/concepts/*.md`
- External: верифицированный Tier A/B источник

ADR на чисто архитектурный выбор (без factual basis) — приемлем, но должен явно указать: "Чисто архитектурное решение, без external factual anchor" в секции `Context`.

### Gate 4 — Methodology Self-Consistency
Каждая methodology (`methodologies/*.md`) ДОЛЖНА содержать:
- ADR-формат с trade-offs
- Формулы с описанием каждой переменной
- Входные данные с inline-ссылками на первоисточники
- Assumptions явно перечислены
- Sensitivity analysis: что меняется при изменении допущений

(Полная спецификация требований к методикам — в `governance/triple-pillar.governance.md` §Quality Gates, Gate 4.)

## Promise Tags

| Tag | Emit when | Downstream behavior |
|-----|-----------|---------------------|
| `<promise>TRIPLE_PILLAR_VERIFIED</promise>` | Все 4 gates passed | ✅ Proceed |
| `<promise>TRIPLE_PILLAR_WARN</promise>` | Gates passed но WEAK > threshold | ⚠️ Proceed + log warning |
| `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` | Хотя бы 1 gate failed | ❌ Block downstream phase |

Downstream pipeline ДОЛЖЕН проверить promise tag перед стартом своей фазы.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|--------------|-----------|-----|
| Голый факт ("DeepSeek доступен бесплатно") | `/triple-check` Step 4 = MISSING | Добавить inline link на [GitHub](https://github.com/deepseek-ai/DeepSeek-V3) |
| Только Tier D источник | `/triple-check` Step 4 = WEAK + Tier D detected | Найти Tier A/B replacement, или пометить `[Tier D — unverified, requires cross-check]` |
| Methodology без формул | Gate 4 fail | Дописать формулы + sensitivity analysis |
| ADR без trade-offs | Gate 3 informal check | Заполнить секцию "Considered Options" с trade-offs |
| Концепт без research | Gate 1 fail (`research: []`) | Создать research artefact или явно emit INCOMPLETE |

## Integration с keysarium-core

Этот shard — кандидат на промотирование в `packages/dz-keysarium-core/governance/` (см. ADR пакета). Сейчас живёт project-local, но domain-agnostic в дизайне.

## Related

- [`../governance/triple-pillar.governance.md`](../governance/triple-pillar.governance.md) — домен-агностичная спецификация протокола
- [`../commands/triple-check.md`](../commands/triple-check.md) — команда-валидатор
- [`../skills/concept-wiki-generator/SKILL.md`](../skills/concept-wiki-generator/SKILL.md) — генератор, который встроенно применяет эти gates
- `wiki/graph.json` `integrity` секция — машинный отчёт о coverage (генерируется в целевом проекте)
