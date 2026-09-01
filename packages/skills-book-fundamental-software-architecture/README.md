# @dzhechkov/skills-book-fundamental-software-architecture

This public, book-derived pack turns architecture-level design questions into a traceable
decision: context and drivers, boundary, style/topology, distributed interaction, guardrail,
and an explicit downside plus verification condition. It ships the deep-lookup references and a
315-KU lexical slice. It contains original reformulations and decision protocols, not the book's
text or source PDF.

## Install and simplest use

> **Registry status.** Published (first release 2026-09-01, owner-sanctioned at CP5) —
> MEASURED, reproducer `npm view @dzhechkov/skills-book-fundamental-software-architecture version`
> answers a version instead of the pre-release `E404`. The by-name commands below work as written;
> installing by PATH from a monorepo checkout
> (`dz install ./packages/@dzhechkov/skills-book-fundamental-software-architecture --target codex`)
> remains a supported alternative for development trees.

Install the whole pack into Codex:

```bash
dz install @dzhechkov/skills-book-fundamental-software-architecture --target codex
```

Or install the same canonical skill into Claude Code:

```bash
dz install @dzhechkov/skills-book-fundamental-software-architecture --target claude-code
```

Then describe the task normally: “используй набор fundamental-software-architecture-guide для
выбора архитектуры заказов; покажи контекст, драйверы, принятый компромисс и как его проверить”.
The gateway chooses one dominant family and hands the concrete work to the owning skill when one
exists. The communication family is intentionally KB-only and hands off to C4/documentation work;
it is not an automatic skill trigger.

## Usage scenarios

### 1. Audit an existing architecture

Situation: a monolith is slow to change and the team is considering a split.

Prompt (RU): “Проверь, стоит ли разделять наш монолит: выдели архитектурные драйверы, связность,
цену распределённости и критерий возврата к решению.”

Prompt (EN): “Audit whether we should split this monolith. Identify drivers, coupling, the cost of
distribution, and a reversal trigger.”

The gateway routes to boundaries/coupling or style/fit, producing a bounded recommendation rather
than an automatic microservice migration.

### 2. Choose a greenfield style

Situation: a new system must choose between modular, pipeline, microkernel, service-based or other
styles under known operational constraints.

Prompt (RU): “Сравни модульный монолит, pipeline и сервисную архитектуру для нашей команды и среды;
не скрывай худший компромисс и предложи fitness function.”

Prompt (EN): “Compare a modular monolith, pipeline, and service-based design for our team and
environment. State the worst trade-off and propose a fitness function.”

The choice/fit family makes assumptions explicit and records what evidence would change the choice.

### 3. Decide between requests and events

Situation: a workflow may be implemented as a direct request, a domain event, orchestration, or
choreography.

Prompt (RU): “Для оформления заказа реши, где нужны запросы, где доменные события, и как восстановить
доставку при сбое; дай последовательность проверки.”

Prompt (EN): “For order checkout, decide where to use requests versus domain events and how delivery
recovers after failure; give a verification sequence.”

The distributed-interaction family covers payload semantics, delivery recovery and mediator topology.

### 4. Add an architectural guardrail

Situation: a team wants a measurable rule that detects architectural drift.

Prompt (RU): “Сформулируй fitness function для границ платежей и проведи короткий architecture risk
storming: какие риски проверять первыми?”

Prompt (EN): “Define a fitness function for payment boundaries and run a short architecture risk
storming exercise: which risks should we test first?”

The guardrails/risk family returns a measurable condition, scope, and failure response.

### 5. Explain the decision to a team

Situation: the architecture is agreed, but the team needs a shared visual explanation.

Prompt (RU): “Подготовь уровни архитектурной коммуникации для решения выше и передай результат в C4-
совместимый формат; не рисуй диаграмму автоматически, если семантика не определена.”

Prompt (EN): “Prepare architecture communication layers for the decision above and hand them off in
a C4-compatible format; do not draw a diagram when the semantics are undefined.”

The communication material is retained as KB-only reference and explicitly handed to existing
diagram/documentation skills.

## Optional advanced use

The pack’s references are shipped inside the skill, so deep lookup works without the owner's source
corpus. Import the shipped lexical slice into your private brain with:

```bash
dz brain add --from-pack @dzhechkov/skills-book-fundamental-software-architecture
```

This is an explicit local import; it does not copy the source PDF or extracted corpus.

## Provenance and limits

The pack is derived from the Russian edition of *Fundamentals of Software Architecture* by Mark
Richards and Neal Ford (ISBN 978-601-12-6107-4), 315 verified KUs, and a CP3.5-v2 routing gate.
O'Reilly's original edition is copyright © 2020 Mark Richards and Neal Ford; all rights reserved.
This package is unaffiliated with and not endorsed by the authors or publishers. References are
paraphrased decision support, not a replacement for the book. Buy the book for the full argument,
figures, examples, and context. Generic diagramming, REST/OpenAPI/GraphQL/gRPC contract design, ETL,
deployment, incidents, and team ceremonies remain outside this gateway’s scope.

## Copilot note

Copilot-style always-on instruction loading can be expensive; install the subset or use the gateway
only for architecture decisions rather than copying all references into every prompt.
