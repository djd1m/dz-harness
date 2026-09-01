---
name: fundamental-software-architecture-guide
description: >
  Choose or challenge an ARCHITECTURE-LEVEL system decision before implementation, using the
  book's concrete protocols for drivers, boundaries, styles, distributed tradeoffs, application
  request-vs-domain-event flow, event-driven application orchestration-vs-choreography, decision
  governance and environment fit. Use when a coding agent must state the accepted downside,
  verification condition and reconsideration trigger of a costly SYSTEM-STRUCTURE choice. The
  gateway selects one dominant routing family, then one protocol, and hands the resulting artifact or implementation to its
  owning skill. NOT for generic reasoning, feature implementation, code refactoring/review, writing
  an ADR, drawing a generic Mermaid/PlantUML diagram, designing REST/OpenAPI/GraphQL/gRPC contracts,
  building ETL/data pipelines, orchestrating LLM agents, deployment configuration, telemetry,
  Redis implementation, chaos execution, incidents or team ceremonies. Triggers (RU+EN): "какой
  архитектурный стиль выбрать", "разрезать монолит или оставить модули", "architecture
  characteristics and tradeoffs", "request or domain event", "event-driven application
  orchestration vs choreography", "границы микросервисов", "fitness function for architecture",
  "architecture risk storming", "кто принимает архитектурное решение", "does this topology fit
  our environment".
trust_tier: 1
trust_tier_label: "Structured — reference faithfulness reviewed and CP3.5 routing-gated"
trust_tier_path: "Re-run the pack routing gate after materially changing the family manifest"
derived_from:
  - fundamental-software-architecture-ch01-p026-ku01
  - fundamental-software-architecture-ch01-p026-ku02
  - fundamental-software-architecture-ch01-p026-ku04
  - fundamental-software-architecture-ch02-p040-ku01
  - fundamental-software-architecture-merged-ku04
  - fundamental-software-architecture-merged-ku06
  - fundamental-software-architecture-ch27-p522-ku02
  - fundamental-software-architecture-ch27-p522-ku03
  - fundamental-software-architecture-ch27-p522-ku05
  - fundamental-software-architecture-ch27-p522-ku06
  - fundamental-software-architecture-ch27-p522-ku08
  - fundamental-software-architecture-ch27-p522-ku10
  - fundamental-software-architecture-ch27-p522-ku11
  - fundamental-software-architecture-ch02-p040-ku08
  - fundamental-software-architecture-ch04-p079-ku01
  - fundamental-software-architecture-ch04-p079-ku02
  - fundamental-software-architecture-ch04-p079-ku03
  - fundamental-software-architecture-ch04-p079-ku04
  - fundamental-software-architecture-ch04-p079-ku05
  - fundamental-software-architecture-ch04-p079-ku06
  - fundamental-software-architecture-ch04-p079-ku07
  - fundamental-software-architecture-merged-ku09
  - fundamental-software-architecture-ch05-p092-ku01
  - fundamental-software-architecture-ch05-p092-ku02
  - fundamental-software-architecture-ch05-p092-ku03
  - fundamental-software-architecture-ch05-p092-ku05
  - fundamental-software-architecture-merged-ku11
  - fundamental-software-architecture-ch05-p092-ku08
  - fundamental-software-architecture-ch05-p092-ku11
  - fundamental-software-architecture-ch01-p026-ku03
  - fundamental-software-architecture-ch01-p026-ku06
  - fundamental-software-architecture-merged-ku01
  - fundamental-software-architecture-merged-ku02
  - fundamental-software-architecture-ch06-p106-ku02
  - fundamental-software-architecture-ch06-p106-ku03
  - fundamental-software-architecture-ch06-p106-ku04
  - fundamental-software-architecture-ch06-p106-ku05
  - fundamental-software-architecture-ch06-p106-ku07
  - fundamental-software-architecture-ch06-p106-ku08
  - fundamental-software-architecture-ch06-p106-ku09
  - fundamental-software-architecture-ch06-p106-ku10
  - fundamental-software-architecture-merged-ku07
  - fundamental-software-architecture-ch03-p060-ku02
  - fundamental-software-architecture-ch03-p060-ku03
  - fundamental-software-architecture-ch03-p060-ku04
  - fundamental-software-architecture-merged-ku08
  - fundamental-software-architecture-ch03-p060-ku06
  - fundamental-software-architecture-ch03-p060-ku08
  - fundamental-software-architecture-ch03-p060-ku09
  - fundamental-software-architecture-ch07-p120-ku01
  - fundamental-software-architecture-ch07-p120-ku02
  - fundamental-software-architecture-ch07-p120-ku03
  - fundamental-software-architecture-merged-ku12
  - fundamental-software-architecture-ch07-p120-ku08
  - fundamental-software-architecture-ch08-p132-ku03
  - fundamental-software-architecture-ch08-p132-ku05
  - fundamental-software-architecture-ch08-p132-ku06
  - fundamental-software-architecture-ch08-p132-ku07
  - fundamental-software-architecture-ch08-p132-ku09
  - fundamental-software-architecture-ch08-p132-ku10
  - fundamental-software-architecture-ch08-p132-ku11
  - fundamental-software-architecture-ch08-p132-ku15
  - fundamental-software-architecture-ch08-p132-ku16
  - fundamental-software-architecture-ch08-p132-ku18
  - fundamental-software-architecture-merged-ku13
  - fundamental-software-architecture-ch09-p154-ku01
  - fundamental-software-architecture-ch09-p154-ku02
  - fundamental-software-architecture-ch09-p154-ku04
  - fundamental-software-architecture-ch09-p154-ku05
  - fundamental-software-architecture-ch19-p391-ku03
  - fundamental-software-architecture-ch19-p391-ku04
  - fundamental-software-architecture-ch19-p391-ku05
  - fundamental-software-architecture-ch19-p391-ku08
  - fundamental-software-architecture-ch09-p154-ku06
  - fundamental-software-architecture-ch09-p154-ku07
  - fundamental-software-architecture-ch09-p154-ku08
  - fundamental-software-architecture-ch09-p154-ku09
  - fundamental-software-architecture-ch09-p154-ku10
  - fundamental-software-architecture-ch09-p154-ku11
  - fundamental-software-architecture-ch09-p154-ku12
  - fundamental-software-architecture-ch09-p154-ku14
  - fundamental-software-architecture-ch09-p154-ku15
  - fundamental-software-architecture-ch10-p177-ku02
  - fundamental-software-architecture-ch10-p177-ku03
  - fundamental-software-architecture-ch10-p177-ku04
  - fundamental-software-architecture-ch10-p177-ku05
  - fundamental-software-architecture-ch10-p177-ku06
  - fundamental-software-architecture-ch11-p190-ku01
  - fundamental-software-architecture-ch11-p190-ku02
  - fundamental-software-architecture-ch11-p190-ku03
  - fundamental-software-architecture-ch11-p190-ku04
  - fundamental-software-architecture-ch11-p190-ku05
  - fundamental-software-architecture-ch11-p190-ku08
  - fundamental-software-architecture-ch11-p190-ku09
  - fundamental-software-architecture-merged-ku15
  - fundamental-software-architecture-merged-ku16
  - fundamental-software-architecture-ch12-p205-ku01
  - fundamental-software-architecture-ch12-p205-ku02
  - fundamental-software-architecture-ch12-p205-ku03
  - fundamental-software-architecture-ch12-p205-ku04
  - fundamental-software-architecture-ch12-p205-ku05
  - fundamental-software-architecture-ch12-p205-ku07
  - fundamental-software-architecture-ch13-p218-ku01
  - fundamental-software-architecture-ch13-p218-ku02
  - fundamental-software-architecture-ch13-p218-ku03
  - fundamental-software-architecture-ch13-p218-ku04
  - fundamental-software-architecture-ch13-p218-ku05
  - fundamental-software-architecture-ch13-p218-ku06
  - fundamental-software-architecture-ch13-p218-ku07
  - fundamental-software-architecture-ch13-p218-ku08
  - fundamental-software-architecture-ch13-p218-ku09
  - fundamental-software-architecture-ch14-p235-ku01
  - fundamental-software-architecture-ch14-p235-ku02
  - fundamental-software-architecture-ch14-p235-ku03
  - fundamental-software-architecture-ch14-p235-ku04
  - fundamental-software-architecture-ch14-p235-ku05
  - fundamental-software-architecture-ch14-p235-ku06
  - fundamental-software-architecture-ch14-p235-ku08
  - fundamental-software-architecture-ch14-p235-ku10
  - fundamental-software-architecture-merged-ku17
  - fundamental-software-architecture-ch15-p254-ku04
  - fundamental-software-architecture-ch15-p254-ku05
  - fundamental-software-architecture-ch15-p254-ku07
  - fundamental-software-architecture-ch15-p254-ku08
  - fundamental-software-architecture-ch15-p254-ku09
  - fundamental-software-architecture-ch15-p254-ku10
  - fundamental-software-architecture-ch15-p254-ku11
  - fundamental-software-architecture-ch15-p254-ku13
  - fundamental-software-architecture-ch15-p254-ku14
  - fundamental-software-architecture-ch15-p254-ku15
  - fundamental-software-architecture-ch15-p254-ku16
  - fundamental-software-architecture-ch15-p254-ku17
  - fundamental-software-architecture-ch15-p254-ku18
  - fundamental-software-architecture-ch15-p254-ku20
  - fundamental-software-architecture-ch15-p254-ku21
  - fundamental-software-architecture-ch15-p254-ku22
  - fundamental-software-architecture-ch15-p254-ku23
  - fundamental-software-architecture-ch15-p254-ku24
  - fundamental-software-architecture-ch15-p254-ku25
  - fundamental-software-architecture-ch15-p254-ku26
  - fundamental-software-architecture-merged-ku19
  - fundamental-software-architecture-merged-ku05
  - fundamental-software-architecture-merged-ku18
  - fundamental-software-architecture-ch15-p254-ku02
  - fundamental-software-architecture-ch15-p254-ku27
  - fundamental-software-architecture-ch15-p254-ku28
  - fundamental-software-architecture-ch15-p254-ku31
  - fundamental-software-architecture-ch15-p254-ku32
  - fundamental-software-architecture-ch15-p254-ku33
  - fundamental-software-architecture-ch15-p254-ku34
  - fundamental-software-architecture-ch15-p254-ku35
  - fundamental-software-architecture-ch15-p254-ku37
  - fundamental-software-architecture-ch15-p254-ku38
  - fundamental-software-architecture-ch16-p313-ku01
  - fundamental-software-architecture-ch16-p313-ku02
  - fundamental-software-architecture-ch16-p313-ku03
  - fundamental-software-architecture-ch16-p313-ku04
  - fundamental-software-architecture-ch16-p313-ku05
  - fundamental-software-architecture-ch16-p313-ku06
  - fundamental-software-architecture-merged-ku20
  - fundamental-software-architecture-ch16-p313-ku09
  - fundamental-software-architecture-ch16-p313-ku10
  - fundamental-software-architecture-ch16-p313-ku11
  - fundamental-software-architecture-ch16-p313-ku12
  - fundamental-software-architecture-ch16-p313-ku13
  - fundamental-software-architecture-ch16-p313-ku14
  - fundamental-software-architecture-ch16-p313-ku15
  - fundamental-software-architecture-ch16-p313-ku16
  - fundamental-software-architecture-ch16-p313-ku17
  - fundamental-software-architecture-ch16-p313-ku19
  - fundamental-software-architecture-ch16-p313-ku20
  - fundamental-software-architecture-ch16-p313-ku21
  - fundamental-software-architecture-ch16-p313-ku22
  - fundamental-software-architecture-ch16-p313-ku23
  - fundamental-software-architecture-ch17-p346-ku01
  - fundamental-software-architecture-ch17-p346-ku02
  - fundamental-software-architecture-ch17-p346-ku05
  - fundamental-software-architecture-ch17-p346-ku07
  - fundamental-software-architecture-ch17-p346-ku08
  - fundamental-software-architecture-ch17-p346-ku09
  - fundamental-software-architecture-ch17-p346-ku10
  - fundamental-software-architecture-merged-ku21
  - fundamental-software-architecture-ch18-p362-ku01
  - fundamental-software-architecture-ch18-p362-ku02
  - fundamental-software-architecture-ch18-p362-ku03
  - fundamental-software-architecture-ch18-p362-ku04
  - fundamental-software-architecture-ch18-p362-ku06
  - fundamental-software-architecture-ch18-p362-ku07
  - fundamental-software-architecture-ch18-p362-ku09
  - fundamental-software-architecture-ch18-p362-ku10
  - fundamental-software-architecture-ch18-p362-ku12
  - fundamental-software-architecture-ch18-p362-ku15
  - fundamental-software-architecture-merged-ku22
  - fundamental-software-architecture-ch20-p404-ku01
  - fundamental-software-architecture-ch20-p404-ku02
  - fundamental-software-architecture-ch20-p404-ku03
  - fundamental-software-architecture-ch20-p404-ku06
  - fundamental-software-architecture-ch20-p404-ku07
  - fundamental-software-architecture-ch20-p404-ku08
  - fundamental-software-architecture-ch21-p418-ku01
  - fundamental-software-architecture-ch21-p418-ku02
  - fundamental-software-architecture-ch21-p418-ku03
  - fundamental-software-architecture-ch21-p418-ku06
  - fundamental-software-architecture-ch21-p418-ku07
  - fundamental-software-architecture-ch21-p418-ku11
  - fundamental-software-architecture-ch21-p418-ku12
  - fundamental-software-architecture-ch21-p418-ku13
  - fundamental-software-architecture-merged-ku23
  - fundamental-software-architecture-merged-ku24
  - fundamental-software-architecture-ch22-p437-ku01
  - fundamental-software-architecture-ch22-p437-ku02
  - fundamental-software-architecture-ch22-p437-ku04
  - fundamental-software-architecture-ch22-p437-ku06
  - fundamental-software-architecture-ch22-p437-ku08
  - fundamental-software-architecture-ch22-p437-ku09
  - fundamental-software-architecture-merged-ku25
  - fundamental-software-architecture-ch23-p455-ku01
  - fundamental-software-architecture-ch23-p455-ku03
  - fundamental-software-architecture-ch23-p455-ku04
  - fundamental-software-architecture-ch23-p455-ku05
  - fundamental-software-architecture-ch23-p455-ku06
  - fundamental-software-architecture-ch23-p455-ku07
  - fundamental-software-architecture-ch23-p455-ku09
  - fundamental-software-architecture-merged-ku03
  - fundamental-software-architecture-merged-ku10
  - fundamental-software-architecture-merged-ku14
  - fundamental-software-architecture-ch02-p040-ku05
  - fundamental-software-architecture-ch02-p040-ku11
  - fundamental-software-architecture-ch24-p464-ku01
  - fundamental-software-architecture-ch24-p464-ku02
  - fundamental-software-architecture-ch24-p464-ku03
  - fundamental-software-architecture-ch24-p464-ku04
  - fundamental-software-architecture-ch24-p464-ku05
  - fundamental-software-architecture-ch24-p464-ku06
  - fundamental-software-architecture-ch24-p464-ku07
  - fundamental-software-architecture-ch24-p464-ku09
  - fundamental-software-architecture-ch24-p464-ku10
  - fundamental-software-architecture-ch24-p464-ku11
  - fundamental-software-architecture-ch24-p464-ku12
  - fundamental-software-architecture-ch24-p464-ku13
  - fundamental-software-architecture-ch24-p464-ku14
  - fundamental-software-architecture-ch25-p485-ku01
  - fundamental-software-architecture-ch25-p485-ku02
  - fundamental-software-architecture-ch25-p485-ku03
  - fundamental-software-architecture-ch25-p485-ku07
  - fundamental-software-architecture-ch25-p485-ku08
  - fundamental-software-architecture-ch25-p485-ku09
  - fundamental-software-architecture-ch25-p485-ku10
  - fundamental-software-architecture-ch25-p485-ku11
  - fundamental-software-architecture-ch25-p485-ku12
  - fundamental-software-architecture-ch25-p485-ku15
  - fundamental-software-architecture-ch25-p485-ku16
  - fundamental-software-architecture-ch25-p485-ku17
  - fundamental-software-architecture-ch25-p485-ku18
  - fundamental-software-architecture-merged-ku26
  - fundamental-software-architecture-ch26-p503-ku01
  - fundamental-software-architecture-ch26-p503-ku05
  - fundamental-software-architecture-ch26-p503-ku06
  - fundamental-software-architecture-ch26-p503-ku07
  - fundamental-software-architecture-ch26-p503-ku08
  - fundamental-software-architecture-ch26-p503-ku11
  - fundamental-software-architecture-ch26-p503-ku12
  - fundamental-software-architecture-ch26-p503-ku13
---

# Fundamental Software Architecture Guide

Один вход в методы книги для реального архитектурного решения. Этот gateway не выдаёт обзор всех
стилей: он определяет доминирующий момент решения, открывает один reference и возвращает
проверяемый выбор с принятой ценой.

## When to use

Use this gateway for an architecture-level system-structure decision; do not use it for generic
diagramming, implementation, deployment, incidents, or team ceremonies.

## Protocol

Read the request, exclude out-of-scope artifacts, choose one routing family and one reference,
then produce the decision record and handoff described below.

## Gateway orchestration policy — агентная адаптация, не метод книги

Выбор ровно одного стартового route, единый формат записки ниже, порядок разрешения пограничных
запросов и передача результата другому skill добавлены для работы AI-агента. Книга является
источником методов внутри `references/`, но не описывает этот gateway-протокол как целое.

## Output

## Результат

Return a decision record with `decision`, `dominant_family`, `accepted_downside`,
`verification_condition`, `reconsideration_trigger`, and `handoff`. Keep source KU ids and page
anchors in the handoff when a reference was used; do not invent evidence.


Краткая архитектурная записка:

1. контекст и требуемые свойства;
2. выбранный decision-протокол;
3. проверенные варианты и наблюдаемые данные;
4. рекомендуемый вариант и его отрицательные последствия;
5. риск, постусловие проверки и момент пересмотра;
6. следующий профильный skill для оформления или реализации.

Если фактов недостаточно, выполните способ получения доказательств из выбранного reference:
измерения, инвентаризацию, сессию с участниками или POC там, где протокол его действительно требует.

## Маршрутизация

### 1. Сначала исключите чужой артефакт

Перед выбором book-протокола проверьте, не просит ли пользователь уже известный артефакт:

| Запрос на артефакт или реализацию | Передать в |
|---|---|
| Записать принятое решение как ADR | `architecture-decision-records` или `capture-adr` |
| Провести полный feature-to-ADR workflow | `feature-adr` |
| Нарисовать или проверить C4, включая вывод в Mermaid/PlantUML/Structurizr | `c4-architecture` |
| Нарисовать произвольную Mermaid/PlantUML-схему не в нотации C4 | Точного владельца в каталоге нет; не активировать gateway только из-за формата |
| Проверить риск commit/PR, безопасность или инцидент | `risk-assessment`, `security-audit`, `incident-response` |
| Спроектировать REST/OpenAPI contract | `api-design` |
| Спроектировать GraphQL schema | `graphql-schema` |
| Спроектировать gRPC/protobuf contract | Точного владельца в каталоге нет; запросить разрешённый fallback |
| Проверить/изменить schema, DDL, index, migration | `database-review`, `database-migration` или профильный `ddia-*` |
| Сначала определить reliability/scalability/SLO и p95/p99 baseline | `ddia-reliability-scalability-foundations` |
| Реализовать ETL/streaming data pipeline | `data-pipeline` |
| Оркестрировать LLM/AI-агентов, ReAct или planner/executor | `aiagents-orchestration-and-planning` |
| Проверить узкий dev/staging/prod parity | `12factor-dev-prod-parity` |
| Выполнить обычный code refactoring или review | `solid` или профильный review-skill |
| Настроить OTel, dashboard, SLO или alert | `observability` |
| Реализовать Redis structure/cache-aside/lock/rate limit | `redis-patterns` |
| Провести chaos experiment | `qe-chaos-resilience` |
| Спланировать sprint, stakeholder communication или retro | `sprint-plan`, `stakeholder-map`, `retrospective` |

Book-протокол может сформулировать архитектурный критерий для такого артефакта, но не присваивает
себе его реализацию.

### 2. Сначала выберите ровно одно routing family

Выбирайте семейство по доминирующему вопросу. Это внешний контракт gateway; конкретный reference
выбирается вторым шагом внутри выбранной строки. Узкие handoff-сценарии передавайте существующему
skill из `handoffs`, даже если в запросе встречается архитектурное слово.

| Главный вопрос | Family | Внутри family |
|---|---|---|
| Что именно выбираем, какую цену принимаем, какой style/topology подходит и когда пересматриваем? | `fsa-family-choice-and-fit` | drivers → trade-off → style/topology → environment |
| Где проходят границы ответственности, coupling, данных и независимого изменения? | `fsa-family-boundaries-and-coupling` | actors/actions → connascence → quantum → module/service boundary |
| Как распределённые части обмениваются событиями и восстанавливаются? | `fsa-family-distributed-interaction` | distributed cost → payload → coordination → delivery/recovery |
| Как сделать архитектурное правило или риск проверяемым? | `fsa-family-guardrails-and-risk` | fitness function → risk storming |
| Какую смысловую модель архитектуры показать конкретной аудитории? | `fsa-family-architecture-communication` | semantic layer; C4 artifact handoff |
| Кто и как должен участвовать в архитектурном решении? | `fsa-family-organization-and-participation` | elastic architect participation |

Не активируйте gateway для handoff-владельцев: REST/OpenAPI → `api-design`, GraphQL →
`graphql-schema`, C4 artifact → `c4-architecture`, DDIA reliability/data/streaming → профильный
`ddia-*`, ETL → `data-pipeline`, LLM-agent orchestration → `aiagents-*`, SOLID/code review →
`solid`/review-skill, Terraform/Kubernetes → профильный infrastructure skill.

### 2a. Затем выберите ровно один reference внутри family

#### Основа решения

| Если главный вопрос звучит как… | Открыть |
|---|---|
| Какой вариант наименее плох в этом контексте; что проверить POC | [01 least-worst tradeoff](references/01-least-worst-tradeoff.md) |
| Какие характеристики действительно управляют структурой | [02 characteristic driver sieve](references/02-characteristic-driver-sieve.md) |
| Как превратить правило в исполняемый guardrail | [03 fitness-function guardrail](references/03-fitness-function-guardrail.md) |
| Где разрезать код по LCOM, instability и connascence | [04 connascence refactoring](references/04-connascence-refactoring.md) |
| Где проходит independently changeable architecture quantum | [05 architecture-quantum boundary](references/05-architecture-quantum-boundary.md) |
| Как получить компоненты из actors/actions/workflows | [06 actor-action decomposition](references/06-actor-action-component-decomposition.md) |
| Какой architecture style соответствует форме домена и свойствам | [07 style-topology fit](references/07-style-topology-fit.md) |
| Стоит ли вообще распределять систему | [08 distributed-fallacy audit](references/08-distributed-fallacy-audit.md) |

#### Стиль, взаимодействие и данные

| Если главный вопрос звучит как… | Открыть |
|---|---|
| Открыть ли слой; не появился ли sinkhole | [09 open-layer sinkhole](references/09-open-layer-sinkhole.md) |
| Как сохранить модульность в одном deployable unit | [10 modular-monolith mediator](references/10-modular-monolith-mediator.md) |
| Подходит ли pipes-and-filters и как разместить стадии | [11 pipeline-filter topology](references/11-pipeline-filter-topology.md) |
| Что оставить в core, а что вынести в plugin lifecycle | [12 microkernel plugin lifecycle](references/12-microkernel-plugin-lifecycle.md) |
| Нужны ли крупные domain services вместо микросервисов | [13 service-based domain service](references/13-service-based-domain-service.md) |
| Какова семантика event/message и payload | [14 event-payload semantics](references/14-event-payload-semantics.md) |
| Как закрыть окна потери, порядок и async reply | [15 event-delivery recovery](references/15-event-delivery-recovery.md) |
| Где координация и данные в event-driven приложении: orchestration/choreography/mediator | [16 event-mediator data topology](references/16-event-mediator-data-topology.md) |
| Нужна ли space-based architecture и какая cache grid | [17 space-based cache grid](references/17-space-based-cache-grid.md) |
| Оправдана ли SOA/ESB и не возникла ли accidental SOA | [18 SOA service taxonomy](references/18-soa-service-taxonomy.md) |
| Как выбрать microservice granularity и isolation | [19 microservice granularity isolation](references/19-microservice-granularity-isolation.md) |
| Как сочетать patterns без скрытой связанности | [20 pattern-composition coupling](references/20-pattern-composition-coupling.md) |

#### Управление архитектурой

| Если главный вопрос звучит как… | Открыть |
|---|---|
| Когда решать, кто утверждает и как живёт решение | [21 decision governance](references/21-decision-governance-last-moment.md) |
| Как провести коллективный architectural risk storming | [22 architecture risk storming](references/22-architecture-risk-storming.md) |
| Как выбрать аудиторию, масштаб и semantic layers схемы | [23 diagram semantic layers](references/23-diagram-semantic-layers.md) |
| Как откалибровать участие архитектора, ownership и team topology | [24 architect elastic participation](references/24-architect-elastic-participation.md) |
| Как сузить и защитить спорное NFR/ограничение | [25 constraint negotiation](references/25-constraint-negotiation-availability.md) |
| Соответствует ли topology окружению, данным, командам и бизнесу | [26 environment-topology alignment](references/26-environment-topology-alignment.md) |

Следующие правила разрешения швов — агентная адаптация: начните с более раннего необратимого
решения; проверьте цену распределения (08) до границ микросервисов (19); определите семантику
payload (14) до delivery-механизма (15), если неизвестно значение сообщения, но начните с delivery,
если проблема уже сформулирована как потеря или порядок; примите архитектурное решение до создания
ADR, C4 или implementation artifact. Следующий route разрешён только как явно названный follow-up.

### 3. Выполните выбранный протокол без подмены источника

Последовательность выполнения и handoff ниже — агентная адаптация; сами проверки берите из
выбранного reference.

1. Откройте соответствующий файл в `references/` полностью.
2. Заполните входные данные и критерии; неизвестное пометьте как неизвестное.
3. Примените decision table и проверки из протокола.
4. Укажите принятый trade-off и условие пересмотра.
5. Отделите методы книги от блока «адаптация для агента».
6. Сошлитесь только на страницы, вычисленные из `derived_from`; для подробностей используйте
   project-local KB с source `fundamental-software-architecture`.
7. Передайте оформление или реализацию в профильный skill из boundary-таблицы.

## Общие анти-паттерны

| Анти-паттерн | Почему это ошибка |
|---|---|
| Выбрать стиль по популярности или стеку | Свойства и цена решения остаются неявными. |
| Сразу открыть несколько reference-протоколов | Контекст раздувается, а владелец решения теряется. |
| Превратить пример книги в универсальное правило | Пример подтверждает метод только в своём контексте. |
| Додумать отсутствующее число, формулу или рисунок | В корпусе есть явно отмеченные невосстановимые элементы. |
| Назвать любой технический выбор архитектурным | Архитектурный выбор имеет широкий радиус влияния и дорог в изменении. |
| Описать компромисс без принятой отрицательной стороны | Получается список плюсов, а не решение. |
| Самостоятельно выполнить чужой artifact-skill | Gateway начинает конкурировать с ADR/C4/API/database/ops навыками. |

## Источник и доверие

Методы получены из книги «Фундаментальный подход к программной архитектуре»
(ISBN 978-601-12-6107-4). Точные KU и вычисленные chapter/page citations находятся в каждом
reference-протоколе. Полная поисковая база остаётся project-local; deep lookup выполняется по slug
`fundamental-software-architecture`.

До прохождения CP3.5 это `trust_tier: 0`: структура и KU проверены, но способность gateway стабильно
активироваться и различать 6 routing families, а затем выбирать reference, ещё должна быть измерена
LLM-судьёй.

## Self-check

- [ ] Запрос действительно про архитектурное решение, а не про готовый артефакт другого skill?
- [ ] Выбрано ровно одно family и затем ровно одно reference?
- [ ] Все критерии и предупреждения трассируются к `derived_from` выбранного reference?
- [ ] Неизвестные данные не заменены предположениями?
- [ ] Названы отрицательная сторона выбора и условие пересмотра?
- [ ] Следующая реализация передана профильному skill?

## Примеры

- «Резать модульный монолит на микросервисы или пока оставить?» → 08 для проверки цены
  распределения; при положительном результате follow-up 19, затем ADR оформляет отдельный skill.
- “Our event flow loses messages between DB commit and publish” → 15; протокол локализует окно
  потери и recovery policy, но не выдаёт себя за broker-configuration tutorial.
- «Сделай C4-диаграмму текущей системы» → не активировать gateway; передать в `c4-architecture`.
- «Нужно договориться, действительно ли нам требуется 99.99%» → 25; сузить критическую область,
  выразить бюджет и последствие, затем зафиксировать решение через ADR skill.
