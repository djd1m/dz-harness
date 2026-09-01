---
route: fundamental-software-architecture-space-based-cache-grid
title_ru: Space-based — сетка памяти, кэши и асинхронная фиксация
derived_from:
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
related_routes:
  - fundamental-software-architecture-style-topology-fit
  - fundamental-software-architecture-distributed-fallacy-audit
  - fundamental-software-architecture-event-mediator-data-topology
  - fundamental-software-architecture-microservice-granularity-isolation
  - fundamental-software-architecture-environment-topology-alignment
boundary_skills:
  - redis-patterns
  - ddia-partitioning-strategy
  - ddia-replication-topology-choice
  - database-review
source_citations:
  - chapter: 16
    pages: [313, 314, 315, 316, 317, 318, 321, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 334, 335, 338, 339, 340, 341, 344, 345]
---

# Space-based: сетка памяти, кэши и асинхронная фиксация

## Решающий момент

Применяйте маршрут, когда центральная БД остаётся синхронным пределом очень высокой конкурентной нагрузки или резких пиков и рассматривается перенос рабочего состояния в memory grid с асинхронной записью.

**NOT:** не используйте его для выбора Redis data structures, обычного cache-aside, настройки Kubernetes, observability stack, schema review или детального протокола репликации. Route выбирает всю space-based topology и её cache model.

## Протокол

1. **Докажите исходный предел.** Проследите перемещение bottleneck от web к application и затем БД. Рассматривайте стиль, только если БД участвует в обычном пути каждой транзакции, нагрузка экстремальна или резко меняется, а предметная область допускает память, асинхронную фиксацию и eventual consistency.
2. **Соберите полный контур ролей.** Processing units исполняют логику; messaging/data/processing grids маршрутизируют, синхронизируют и координируют; deployment manager меняет число экземпляров; data pump, writer и reader обеспечивают запись и восстановление.
3. **Определите processing-unit boundary.** Начните с бизнес-возможности, которую можно запускать и масштабировать как целое. В блок поместите обработчики, логику, только нужные именованные кэши и механизм репликации.
4. **Выберите message-grid algorithm.** `round-robin` подходит сходной стоимости запросов; `next-available` — заметно различающейся занятости. Свободная маршрутизация требует приемлемо синхронизированного состояния.
5. **Выберите cache model отдельно для каждого контекста.** Репликация — для чтений, небольшого относительно статичного набора и высокой доступности. Распределённый кэш — для крупных, динамичных, часто записываемых данных и более актуальной версии. Диапазон 100–500 Мбайт и смешанная нагрузка требуют замеров.
6. **Откажитесь от near-cache при требовании равноправных экземпляров.** Front copies согласуются с back cache, но не друг с другом; разная hit rate делает latency экземпляров неодинаковой.
7. **Спроектируйте масштабирование с ценой прогрева.** Наблюдайте нагрузку и response time; добавляйте/завершайте нужный класс блоков. Известный пик допускает предварительный запуск и синхронизацию кэшей, поскольку реактивный запуск может запоздать.
8. **Зафиксируйте изменения асинхронно.** Блок-владелец обновления публикует действие, ID и необходимую дельту в гарантированную FIFO queue. Data writer применяет изменение позже; очереди можно разделять по области, её части или имени кэша.
9. **Выберите writer и recovery granularity.** Общий domain writer централизует policy; writer на pump даёт автономный scale. При полном восстановлении один временный владелец загружает кэш через reader, затем остальные синхронизируются с ним.
10. **Отделите cache contract от DB schema.** Reader/writer преобразуют между независимыми форматами, чтобы изменения хранилища и памяти выпускались поэтапно. Резервную БД выбирайте по analytics, write throughput и downstream systems, а не по online reads.
11. **Проверьте риски данных.** Массовые reads означают непомещающийся working set или нестабильные экземпляры. Измерьте sync lag, обеспечьте durable pump с client ACK и рассчитайте память полного cache на экземпляр и пул.
12. **Измерьте конфликт и эксплуатационные сигналы.** Для репликации оцените collisions при минимальной, обычной и пиковой нагрузке; формулу со с. 336 не восстанавливайте из text corpus. Контролируйте memory × instance count, sync time, queue depth, reader frequency и основные свойства.
13. **Проверьте организационную и экономическую цену.** Стиль дорог, сложен и плохо тестируется; он оправдан сильной потребностью в scalability, adaptability и performance. Умеренная предсказуемая нагрузка требует более простой альтернативы.

## Матрица решения

| Критерий | Выбор | Цена / ограничение |
|---|---|---|
| БД — последний синхронный bottleneck, резкие пики | Рассмотреть space-based | Высокая стоимость, сложность и eventual consistency |
| Чтения доминируют, данные редки и малы (`<100 MB` как ориентир) | Replicated cache | Полная копия на экземпляр, окно расхождения и collisions |
| Частые записи, большой набор (`>500 MB` как ориентир) | Distributed cache | Network latency и центральная зависимость; нужно зеркало |
| Смешанная нагрузка или 100–500 MB | Измерение конкретного контекста | Не интерполировать пороги автоматически |
| Равноправные processing units | Не применять near-cache | Иначе неодинаковые hit rate и responsiveness |
| Несколько потоков одной области | Domain writer | Возможен writer bottleneck |
| Горячие потоки масштабируются независимо | Writer на data pump | Больше компонентов и координации общей DB schema |
| Полный cold start | Один временный cache owner + reader | Lock recovery и задержка готовности |
| Analytics/downstream требуют единого хранилища | Монолитная backup DB | Write bottleneck и общая интеграционная точка |
| Области данных чётко разделены | Domain backup DBs | Сложнее сквозная аналитика и интеграция |

## Антипаттерны

- Выбирать стиль только из-за большой БД без доказанного synchronous bottleneck.
- Принимать один cache model для всех предметных данных.
- Игнорировать полную память реплики при автоскейлинге.
- Использовать near-cache при требовании одинаковой latency экземпляров.
- Масштабировать после начала известного пика без времени на cache sync.
- Считать durable queue устранением всех рисков потери.
- Восстанавливать отсутствующую формулу коллизий по памяти или аналогии.
- Относить БД к отдельному кванту, если блоки синхронно ждут друг друга через другой путь.

## Связанные маршруты

- `style-topology-fit`: подтверждает необходимость специализированного стиля.
- `distributed-fallacy-audit`: проверяет сеть, latency и стоимость grid dependencies.
- `fitness-function-guardrail`: оформляет memory, sync lag, queue depth и reader rate как governance signals.
- `event-delivery-recovery`: уточняет сквозные гарантии data-pump очереди.
- `event-mediator-data-topology`: выбирает orchestration для процессов через несколько processing units.
- `environment-topology-alignment`: сверяет cache products, deployment, backup DB и команды с архитектурой.

## Источник и трассировка

Вычисленные ссылки из `derived_from`: гл. 16, с. 313–332 и 334–345.

Короткие якоря корпуса: «Архитектура на основе пространства»; «Диспетчер развертывания».

KB pointer: книга `fundamental-software-architecture`, exact KU IDs из `derived_from`; deep lookup по processing units, replicated/distributed cache, data pump, recovery и fitness functions.

## Self-check

- [ ] Центральный synchronous DB bottleneck подтверждён измерениями?
- [ ] Предметная область допускает memory state и eventual consistency?
- [ ] Все роли полного space-based контура назначены?
- [ ] Cache model выбран отдельно для каждого контекста?
- [ ] Memory × instances, collisions и sync lag рассчитаны или измеримы?
- [ ] Data pump, writer, reader и cold-start recovery согласованы?
- [ ] Экономическая и командная сложность сравнена с более простым стилем?

## Примеры активации — агентная адаптация, не из книги

- **RU:** «Продажа билетов даёт краткий пик в десятки тысяч запросов, а БД упирается первой. Подходит ли space-based и какие кэши реплицировать?»
- **EN:** “Ticket sales create a short spike of tens of thousands of requests, and the database saturates first. Is space-based architecture appropriate, and which caches should be replicated?”
