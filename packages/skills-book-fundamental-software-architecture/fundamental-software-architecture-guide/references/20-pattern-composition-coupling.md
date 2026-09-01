---
route: fundamental-software-architecture-pattern-composition-coupling
title_ru: Композиция архитектурных паттернов и инфраструктурная связанность
derived_from:
  - fundamental-software-architecture-ch20-p404-ku01
  - fundamental-software-architecture-ch20-p404-ku02
  - fundamental-software-architecture-ch20-p404-ku03
  - fundamental-software-architecture-ch20-p404-ku06
  - fundamental-software-architecture-ch20-p404-ku07
  - fundamental-software-architecture-ch20-p404-ku08
related_routes:
  - fundamental-software-architecture-connascence-refactoring
  - fundamental-software-architecture-modular-monolith-mediator
  - fundamental-software-architecture-microkernel-plugin-lifecycle
  - fundamental-software-architecture-service-based-domain-service
  - fundamental-software-architecture-event-mediator-data-topology
  - fundamental-software-architecture-microservice-granularity-isolation
boundary_skills:
  - backend-patterns
  - database-review
  - ddia-deriving-data-and-integration
  - api-design
source_citations:
  - chapter: 20
    pages: [404, 405, 407, 411, 412, 415, 416]
---

# Композиция архитектурных паттернов и инфраструктурная связанность

## Решающий момент

Применяйте маршрут до реализации, когда одна архитектура должна сочетать ports-and-adapters, CQRS, повторное использование доменных или эксплуатационных функций и одну либо несколько брокерных инфраструктур.

**NOT:** маршрут не каталог шаблонов и не инструкция по реализации адаптера, API, схемы БД или read model. Эти детали передаются `backend-patterns`, `api-design`, `database-review` и DDIA-навыкам после выбора композиции.

## Протокол

1. **Сначала назовите проблему.** Зафиксируйте наблюдаемую силу, которую паттерн должен изменить: направление зависимости, асимметрию чтения/записи, вид reuse или область отказа брокера. Паттерн не равен стилю и не считается универсальной best practice.
2. **Проведите границу ports-and-adapters.** Доменная логика остаётся внутри; внешние технологии подключаются портами и адаптерами. Схема БД не должна стать независимым центром изменений: её эволюция следует бизнес-правилам.
3. **Разделите два вида reuse.** Доменную возможность предпочтительно держать локально либо открывать через слабо связанный контракт. Эксплуатационную обязанность можно централизовать, если координация и единообразие важнее локальной автономии.
4. **Требуйте доказательства для физического CQRS.** Разносите write и read части только при измеримой асимметрии нагрузки, модели или масштабирования. Явно примите задержку асинхронно обновляемой read model.
5. **Выберите область брокера.** Один broker упрощает discovery, logging и monitoring и уменьшает объём инфраструктуры, но создаёт общий отказ и общий предел пропускной способности. Brokers по доменам дают изоляцию и отдельное масштабирование ценой discovery, эксплуатации и денег.
6. **Адаптация для агента, не из книги — проверьте композиционный шов.** Для каждой пары паттернов
   укажите владельца данных, направление зависимостей, путь отказа и место наблюдения. Если два
   паттерна дают противоположные ответы, решение должно выбрать один приоритет.
7. **Сверьте с сервисными границами.** Централизованная инфраструктура не должна скрыто вернуть доменную связанность, от которой архитектура только что избавилась.

## Матрица критериев

| Решение | Выбирать, когда | Неизбежная цена |
|---|---|---|
| Ports-and-adapters | Домен нужно защитить от смены внешних технологий | Дополнительные интерфейсы и mapping |
| Локальное domain reuse | Автономия изменения важнее идеальной дедупликации | Дублирование небольшой логики |
| Контракт доменного сервиса | Нужен единый владелец поведения | Runtime-зависимость потребителей |
| Централизованное operational reuse | Нужны согласованность и единая эксплуатация | Координационная связанность |
| Физический CQRS | Read/write действительно различаются по модели или нагрузке | Eventual consistency read side |
| Один broker | Простота и общие инструменты важнее изоляции | Общий failure/bandwidth domain |
| Brokers по доменам | Нужны изоляция и независимое масштабирование | Больше discovery, infra и cost |

## Антипаттерны

- Начинать с любимого паттерна и придумывать ему проблему задним числом.
- Называть паттерн архитектурным стилем или обязательной практикой.
- Прятать бизнес-правила в адаптерах или схеме БД.
- Вводить CQRS только ради разных классов команд и запросов.
- Делить broker по командам без анализа доменных границ и отказов.
- Считать единую эксплуатационную платформу бесплатной для автономии.
- **Адаптация для агента, не из книги:** складывать паттерны без явного правила разрешения их конфликтов.

## Связанные ограничения

- `connascence-refactoring` помогает обнаружить силу связи, которую должен ослабить паттерн.
- `modular-monolith-mediator`, `microkernel-plugin-lifecycle` и `service-based-domain-service` дают конкретные топологии для выбранной проблемы.
- `event-mediator-data-topology` уточняет брокер и ownership долгоживущего процесса.
- `microservice-granularity-isolation` проверяет, не разрушает ли общая инфраструктура автономию сервиса.

## Источник и трассировка

Вычисленные ссылки из `derived_from`: гл. 20, с. 404–407 и 411–416.

Короткий якорь корпуса: «Сосредоточьтесь на поиске наиболее подходящего паттерна» (гл. 20, с. 404).

KB pointer: книга `fundamental-software-architecture`, exact KU IDs из `derived_from`; deep lookup по pattern choice, ports-and-adapters, reuse, CQRS и broker granularity.

## Self-check

- [ ] Для каждого паттерна сформулирована конкретная проблема?
- [ ] Доменная логика защищена от внешних деталей?
- [ ] Domain reuse отделено от operational reuse?
- [ ] CQRS опирается на наблюдаемую асимметрию?
- [ ] Для broker topology записаны failure и bandwidth domains?
- [ ] Конфликтующие силы композиции разрешены явно?

## Примеры активации — агентная адаптация, не из книги

- **RU:** Нам предлагают CQRS и отдельный broker на домен. Какие силы это должно закрыть и как проверить, что композиция не дороже проблемы?
- **EN:** “The proposal combines CQRS with one broker per domain. Which forces justify it, and how do we test whether the composition costs more than the problem?”
