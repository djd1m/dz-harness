# `governance/` — Governance Protocols

Domain-agnostic governance модуль из `@dzhechkov/keysarium-core`. Реализует phase gates, evidence discipline, semantic promises для multi-agent pipelines.

## Содержимое

| File | Описание |
|------|----------|
| [triple-pillar.governance.md](triple-pillar.governance.md) | Triple-Pillar Evidence Discipline — каждый factual claim должен иметь N независимых источников (configurable). Включает promise tags, quality gates, anti-patterns. |

## Что планируется (roadmap)

| Module | Status | Source (project-local) |
|--------|--------|----------------------|
| `constitution.md` | TBD | `.claude/rules/*` aggregated |
| `shard-protocol.md` | TBD | `.claude/shards/feature-adr.shard.md` |
| `checkpoint-promise-protocol.md` | TBD | `.claude/rules/checkpoint-protocol.md` |

## Использование

### В новом проекте

1. Установить core: `npm install @dzhechkov/keysarium-core` (или скопировать вручную)
2. Создать project-local shard, который **импортирует** governance из core и добавляет project-specific конфигурацию (paths, source tiers, threshold)
3. Зарегистрировать shard в `.claude/shards/` и связать с pipeline phases через `.claude/commands/*.md`

Пример project-local shard:

```markdown
# Governance Shard: My Project Triple-Pillar

**Inherits from:** `@dzhechkov/keysarium-core/governance/triple-pillar`

## Project-specific Configuration

| Param | Value |
|-------|-------|
| `pillar_types` | `["adr", "methodology", "research"]` |
| `pillar_paths.adr` | `adrs/*.md` |
| `pillar_paths.methodology` | `methodologies/*.md` |
| `pillar_paths.research` | `researches/*/` |
| `min_pillars_per_concept` | 3 |
| `external_url_acceptable_for` | `["methodology", "research"]` |

(Остальное — наследуется из core.)
```

### В существующем проекте

См. [migration guide в triple-pillar.governance.md §Migration](triple-pillar.governance.md#migration).

## Принципы дизайна

1. **Domain-agnostic.** Никаких упоминаний конкретного проекта, отрасли, или regulator'а.
2. **Configurable.** Все project-specific параметры — через YAML config, не hardcoded.
3. **Backward-compatible.** Project-local shards могут расширять core, не заменяя.
4. **Composable.** Можно использовать только triple-pillar без других модулей core.
5. **Promise-driven.** Каждый governance gate emit'ит machine-readable `<promise>` tag для downstream pipeline.

## Связано

- [Plugin README](../README.md)
- [`../shards/triple-pillar.shard.md`](../shards/triple-pillar.shard.md) — пример project-local instantiation
- Провенанс: извлечено из проекта GenAI-Bundle-GTM (ADR-020 «Promote Triple-Pillar to Keysarium-Core»)
