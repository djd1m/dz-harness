---
name: wiki-generate
description: Generate or regenerate the LLM-Wiki layer — atomic concept pages, INDEX, JSON graph, and backlinks in all source files. Triggers on /wiki-generate.
trust_tier: 1
---

# /wiki-generate

Точка входа для генерации LLM-Wiki слоя. Запускает skill `concept-wiki-generator` (8-шаговый pipeline) и применяет governance из `triple-pillar.shard.md`.

## Usage

```
/wiki-generate                 # полная регенерация wiki/
/wiki-generate <concept-slug>  # добавить/обновить один концепт
/wiki-generate --check         # только валидация (без генерации) — алиас /triple-check wiki/concepts/
```

## Что делает

Загружает `skills/concept-wiki-generator/SKILL.md` и исполняет его 8-шаговый pipeline:

1. **Source scan** — сканирует источники (по `config.pillar_paths`)
2. **Concept candidate ranking** — ранжирует кандидаты по inbound-ссылкам
3. **Pillar mapping** — для каждого концепта находит ADR / methodology / research
4. **Atomic page synthesis** — генерирует `wiki/concepts/{slug}.md` (≤80 строк, YAML frontmatter, TL;DR, Three Pillars, Related Concepts, Context Bundle, Open Questions)
5. **Cross-link insertion** — заполняет `[[wikilinks]]` между концептами
6. **Backlinks** — вставляет секции между `marker_open` / `marker_close` в каждый source-файл
7. **Index + graph regeneration** — перегенерирует `wiki/INDEX.md` и `wiki/graph.json`
8. **Validation** — запускает `/triple-check` на новых страницах; emit `<promise>WIKI_GENERATED</promise>` или `WIKI_GENERATED_INCOMPLETE`

## Configuration

Параметры берутся из `.claude-plugin/plugin.json` секции `config`:

| Param | Default | Назначение |
|-------|---------|-----------|
| `wiki_dir` | `wiki` | Корень wiki-слоя |
| `concept_dir` | `wiki/concepts` | Где лежат концепт-страницы |
| `pillar_types` | `["adr","methodology","research"]` | Типы китов |
| `pillar_paths` | см. plugin.json | Glob-паттерны источников |
| `min_pillars_per_concept` | `3` | Минимум pillar'ов на концепт |
| `marker_open` / `marker_close` | `<!-- wiki:see-also-* -->` | Маркеры backlink-секций |

## Promise Tags

| Tag | Когда |
|-----|-------|
| `<promise>WIKI_GENERATED</promise>` | Все концепты ≥ `min_pillars_per_concept` |
| `<promise>WIKI_GENERATED_INCOMPLETE</promise>` | Есть концепты с неполным покрытием |

## Rules

1. НЕ дублировать контент источников — концепт-страница только ссылается + 1-предложение summary
2. Маркеры backlink-секций регенерируются 1:1 с graph.json
3. TL;DR должен быть atomic (читается без контекста)
4. Концепт без полного pillar-покрытия → `status: incomplete` + явный warning, не скрывается

## Related

- `skills/concept-wiki-generator/SKILL.md` — полный pipeline
- `commands/triple-check.md` — валидатор, вызывается в Step 8
- `shards/triple-pillar.shard.md` — governance gate
