---
slug: {{CONCEPT_SLUG}}
type: concept
title: {{CONCEPT_TITLE}}
pillars:
  adr: ["{{ADR_SLUG}}"]
  methodology: ["{{METHODOLOGY_SLUG}}"]
  research: ["{{RESEARCH_SLUG}}"]
related_concepts: ["{{RELATED_SLUG}}"]
status: active
last_updated: {{YYYY-MM-DD}}
---

# {{CONCEPT_TITLE}}

> {{ONE_LINE_DEFINITION}}

## TL;DR

{{ATOMIC_PARAGRAPH}} — 1 параграф (~3-6 предложений), читается БЕЗ контекста, без отсылок к «выше/ниже». Каждое числовое утверждение имеет inline-ссылку на внешний источник или внутренний pillar.

## Three Pillars

### Architectural Decisions

| ADR | Что решает |
|-----|-----------|
| [{{ADR_ID}}: {{ADR_TITLE}}]({{ADR_PATH}}) | {{ADR_ONE_LINE}} |

### Methodologies

| Methodology | Используется для |
|-------------|------------------|
| [{{METHODOLOGY_TITLE}}]({{METHODOLOGY_PATH}}) | {{METHODOLOGY_ONE_LINE}} |

### Researches

| Research | Что даёт |
|----------|----------|
| [{{RESEARCH_NAME}}]({{RESEARCH_PATH}}) | {{RESEARCH_ONE_LINE}} |

## Related Concepts

- [[{{RELATED_SLUG}}]] — {{RELATION_DESCRIPTION}}

## Context Bundle for LLM

Минимальный bundle:
1. Этот файл
2. [{{ADR_ID}}]({{ADR_PATH}})
3. [{{METHODOLOGY_TITLE}}]({{METHODOLOGY_PATH}})
4. {{ADDITIONAL_ANCHOR}}

## Open Questions

- {{OPEN_QUESTION_1}}
- {{OPEN_QUESTION_2}}

<!--
ЕСЛИ один из pillar пуст:
1. Поставить status: incomplete в frontmatter
2. Добавить секцию "## 3-pillar gap" с `<promise>TRIPLE_PILLAR_INCOMPLETE</promise>`
   и пояснением что/когда закрывается
ОГРАНИЧЕНИЕ: вся страница ≤ 80 строк.
-->
