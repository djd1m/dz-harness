# Governance Protocol: Triple-Pillar Evidence Discipline

**Module:** `@dzhechkov/keysarium-core/governance/triple-pillar`
**Version:** 0.1.0
**Status:** Initial extraction (cleanroom from `GenAI-Bundle-GTM/.claude/shards/triple-pillar.shard.md`)

## Назначение

Triple-Pillar Evidence Discipline — domain-agnostic governance protocol, который гарантирует, что **каждый factual claim** в проектной документации поддержан **N независимых типов источников** (N=3 по умолчанию). Источники классифицируются по **типу pillar** (decision / quantitative / qualitative) и проверяются на наличие inline-ссылок.

Этот protocol — обобщение паттерна из проекта `GenAI-Bundle-GTM`, где 3 кита были ADR / methodology / research. В core-версии **тип pillar — конфигурируемый** (можно использовать decision / model / experiment / standard / regulation / case-study / ...).

## Configuration Schema

Project, использующий этот protocol, ДОЛЖЕН предоставить config (YAML), описывающий:

```yaml
triple_pillar:
  # Список типов pillar — минимум 2, рекомендуется 3+
  pillar_types:
    - id: "decision"        # архитектурные/проектные решения (e.g., ADR)
      label: "Architectural Decisions"
      path_pattern: "adrs/*.md"
      required_for_concepts: true
    - id: "quantitative"    # расчёты, формулы, methodologies
      label: "Methodologies"
      path_pattern: "methodologies/*.md"
      required_for_concepts: true
    - id: "qualitative"     # глубинные исследования, evidence
      label: "Researches"
      path_pattern: "researches/*/"
      required_for_concepts: true

  # Конфигурация валидации
  min_pillars_per_concept: 3
  external_url_acceptable_for: ["qualitative"]    # для research допустим внешний URL
  marker_open: "<!-- wiki:see-also-start -->"
  marker_close: "<!-- wiki:see-also-end -->"

  # Promise tags (machine-readable phase gates)
  promise_tags:
    success: "TRIPLE_PILLAR_VERIFIED"
    warn: "TRIPLE_PILLAR_WARN"
    fail: "TRIPLE_PILLAR_INCOMPLETE"
```

Полная схема — см. `templates/triple-pillar.config.yaml` в этом пакете.

## When This Protocol Applies

| Pipeline phase | Что проверяется |
|----------------|-----------------|
| Document creation | Новый concept-page / decision-page / methodology имеет ≥ N pillars |
| Claim addition | Новое factual statement в любом документе имеет inline-source |
| Phase gate (pre-deploy / pre-merge / pre-release) | Все concept'ы проходят `<promise>TRIPLE_PILLAR_VERIFIED</promise>` |
| Pre-commit hook | Staged `.md` файлы проходят triple-check (advisory / strict) |
| Wiki regeneration | `concept_pages` имеют все N pillars в `pillars:` frontmatter |

## Quality Gates

### Gate 1 — Concept Coverage
Каждый concept-document ДОЛЖЕН иметь в YAML frontmatter секцию `pillars`, в которой каждый из `pillar_types` представлен ≥1 ссылкой.

Если хотя бы один pillar пуст → emit `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` (project-configurable tag).

### Gate 2 — Claim Coverage in Documents
В документах с factual claims (определение "factual" — см. ниже):
- 0 MISSING claims → `<promise>TRIPLE_PILLAR_VERIFIED</promise>` ✅
- 0 MISSING + WEAK >0 → `<promise>TRIPLE_PILLAR_WARN</promise>` ⚠️
- MISSING >0 → `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` ❌

### Gate 3 — Decision Backing
Каждый "decision document" (e.g., ADR) ДОЛЖЕН содержать ≥1 ссылку на:
- Internal: `quantitative` pillar (methodology) ИЛИ `qualitative` pillar (research)
- External: верифицированный Tier A/B источник

Decision на чисто архитектурный выбор (без factual basis) — приемлем, но должен явно указать `"Чисто архитектурное решение, без external factual anchor"` в Context секции.

### Gate 4 — Quantitative Pillar Self-Consistency
Каждый quantitative document (methodology / calculation / model) ДОЛЖЕН содержать:
- ADR-формат с trade-offs
- Формулы / алгоритм с описанием каждой переменной
- Входные данные с inline-ссылками на первоисточники
- Assumptions явно перечислены
- Sensitivity analysis: что меняется при изменении допущений

## Что такое "factual claim"

Утверждение, требующее источника:

| Считается | Не считается |
|-----------|--------------|
| Числа, проценты, метрики | Описания собственного продукта |
| Заявления о конкурентах / внешних агентах | Personas (явно фиктивные) |
| Market data, бенчмарки | Process descriptions |
| Регуляторные ссылки | Архитектурные диаграммы |
| Технические capability claims | Headings |
| Финансовые проекции | Standalone images |

## Promise Tags

| Tag | Emit when | Downstream behavior |
|-----|-----------|---------------------|
| `<promise>TRIPLE_PILLAR_VERIFIED</promise>` | Все 4 gates passed | ✅ Proceed |
| `<promise>TRIPLE_PILLAR_WARN</promise>` | Gates passed но WEAK > threshold | ⚠️ Proceed + log warning |
| `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` | Хотя бы 1 gate failed | ❌ Block downstream phase |

Project может переопределить эти tag'и через `promise_tags` в config.

## Marker Protocol для Backlinks

Каждый source file (ADR / methodology / research) получает автоматически-управляемую секцию между маркерами:

```markdown
<!-- wiki:see-also-start -->
## Связано с (wiki)

**Концепты:**
- [concept-slug](path/to/concept.md) — 1-line description

**Auto-generated. Edits between these markers will be overwritten.**
<!-- wiki:see-also-end -->
```

Маркеры (`marker_open`, `marker_close`) — configurable. Содержимое регенерируется при каждом запуске wiki-generator'а.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|--------------|-----------|-----|
| Голый числовой факт без source | claim regex match + 0 inline links | Добавить inline link |
| Только source ниже Tier C | Source tier classification | Найти Tier A/B replacement |
| Quantitative pillar без формул | Gate 4 fail | Добавить формулы + sensitivity |
| Decision pillar без trade-offs | Gate 3 informal check | Заполнить "Considered Options" |
| Concept без всех N pillars | Gate 1 fail | Создать недостающий pillar или emit INCOMPLETE |

## Integration

### С pre-commit hook
См. шаблон `templates/pre-commit-triple-check.sh` (bash) и `.ps1` (PowerShell).

### С wiki-generator
Wiki concept-pages используют этот protocol для Quality Gate 1. Если pillar пустой — concept page получает `status: incomplete` в frontmatter и `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>` в body.

### С feature-development pipelines
Pipeline phases (e.g., `/feature-adr`, `/casarium`) ДОЛЖНЫ проверять upstream promises перед стартом своей фазы.

## Migration

Если у проекта уже есть документация, в которой претензии без источников — поэтапная миграция:

1. **Audit phase:** запустить `triple-check` на всех `.md` файлах, получить отчёт `triple-check-report.json`
2. **Soft strict:** включить hook в `advisory` режиме
3. **Fix highest-density violations:** документы с >5 MISSING сначала
4. **Hard strict:** перейти в `strict` режим с threshold=0

Не требуется миграция всей документации сразу. Strict mode можно ввести инкрементально.

## Versioning

Эта спецификация версионируется semver. Breaking changes:
- 0.x → 1.0: Frozen API, добавляется `promise.signature` (HMAC over body) для tamper-evidence

## Related Modules in keysarium-core

- `verification/witness-chain.md` (TBD) — добавляет криптографическую цепочку поверх triple-pillar
- `trust-tiers/source-classifier.md` (TBD) — деталная классификация sources в Tier A/B/C/D
- `memory/protocol.md` (TBD) — как сохранять `<promise>` tags для cross-session memory

## Project-Local Instantiation Example

См. пример instantiation в составе плагина: [`../shards/triple-pillar.shard.md`](../shards/triple-pillar.shard.md) — он инстанциирует этот core protocol с конкретными параметрами (`adrs/`, `methodologies/`, `researches/`). Скопируйте в `.claude/shards/` целевого проекта и адаптируйте.
