---
route: fundamental-software-architecture-environment-topology-alignment
title_ru: Согласование архитектуры со средой и физической топологией
derived_from:
  - fundamental-software-architecture-ch26-p503-ku01
  - fundamental-software-architecture-ch26-p503-ku05
  - fundamental-software-architecture-ch26-p503-ku06
  - fundamental-software-architecture-ch26-p503-ku07
  - fundamental-software-architecture-ch26-p503-ku08
  - fundamental-software-architecture-ch26-p503-ku11
  - fundamental-software-architecture-ch26-p503-ku12
  - fundamental-software-architecture-ch26-p503-ku13
related_routes:
  - fundamental-software-architecture-characteristic-driver-sieve
  - fundamental-software-architecture-style-topology-fit
  - fundamental-software-architecture-service-based-domain-service
  - fundamental-software-architecture-space-based-cache-grid
  - fundamental-software-architecture-microservice-granularity-isolation
  - fundamental-software-architecture-pattern-composition-coupling
boundary_skills:
  - database-review
  - kubernetes
  - terraform
  - aiagents-agent-fit-and-model-choice
  - 12factor-dev-prod-parity
source_citations:
  - chapter: 26
    pages: [503, 504, 509, 511, 512, 513, 514, 516, 517, 519, 520]
---

# Согласование архитектуры со средой и физической топологией

## Решающий момент

Применяйте маршрут после выбора архитектурного направления или при его аудите, когда deployment, данные, инженерные практики, команды, интеграции, корпоративные нормы, бизнес или LLM-компонент могут разрушить обещанные свойства.

**NOT:** маршрут выявляет широкую несогласованность архитектуры со средой и выбирает компромисс, но
не пишет Kubernetes/Terraform-конфигурацию, не проводит полный DB review и не выбирает агентную
модель. Узкий разбор dev/staging/prod parity gaps принадлежит `12factor-dev-prod-parity`;
реализацию передавайте остальным `boundary_skills`.

## Протокол

1. **Проведите девятичастный inventory.** Проверьте кодовую реализацию, инфраструктуру/deployment, topology и типы данных, инженерные практики, командную структуру, интеграции, enterprise-нормы, business context и применение генеративного ИИ. Приоритизируйте глубину по бизнес-риску.
2. **Свяжите свойства с инфраструктурой.** Вместе с эксплуатацией для каждого критичного свойства назовите поддерживающий механизм, физическое размещение и failure domain. Не считайте способность стиля доказательством возможности среды.
3. **Проверьте размещение на конфликт.** Разнос по регионам или availability zones может уничтожить выигрыш distributed cache по latency и integrity. Co-location сервисов, контейнеров или Kubernetes-модулей ускоряет связь, но ослабляет scalability, fault tolerance, availability и adaptability.
4. **Выберите DB topology по свойствам.** Монолитная БД сильна в транзакциях и целостности, но ограничивает масштабирование и отказоустойчивость. Domain-распределение изолирует крупные контексты; database-per-service поддерживает строгую микросервисную границу и независимые изменения ценой consistency, integrity и performance.
5. **Отфильтруйте тип БД по данным.** Связанные сущности направляют к relational, JSON events/documents — к document, пары — к key-value. Для write-heavy рассмотрите column store; для read-heavy — key-value, document или graph; при балансе — relational либо NoSQL. При смешанных формах сначала оцените универсальное хранилище.
6. **Совместите engineering practices.** Перечислите требуемые для свойств способы provisioning, testing, integration и deployment. Микросервисы требуют автоматизации; переход стиля лучше проводить короткими итерациями, feedback loops, Strangler и feature toggles.
7. **Сверьте team topology.** Командная граница должна соответствовать потоку и архитектурному разделению. Если изменение регулярно пересекает много команд, проверьте архитектурные и организационные границы вместе.
8. **Аудируйте интеграцию.** Сопоставьте availability, performance и scale обеих сторон, выберите protocol и contract, оцените static/dynamic coupling. Связь не должна незаметно объединить независимые architecture quanta в общий контур отказа или изменения.
9. **Сверьте enterprise и business direction.** Проверьте стандарты безопасности, технологий, решений, документации и диаграмм. При сокращении затрат учитывайте высокую цену микросервисов и space-based architecture; при слияниях — ограниченную адаптивность монолита. Исключения обсуждаются явно.
10. **Проектируйте неизвестное итеративно.** Не детализируйте непредсказуемое будущее. Поддерживайте нужные portability, scalability, evolvability и adaptability, сопоставляя их стоимость с текущим направлением бизнеса.
11. **Изолируйте LLM-компонент.** Поместите модель за заменяемой абстракцией, отделите от domain workflow, соберите representative samples и metrics, сравнивайте модели на одном наборе, добавьте observability и guardrails. Модульность упрощает замену, но не доказывает accuracy или fairness.

## Матрица соответствия

| Пересечение | Вопрос проверки | Типичный конфликт |
|---|---|---|
| Infrastructure | Как механизм и placement поддерживают property? | Latency против fault isolation |
| DB topology | Где нужны transactions/integrity и где autonomy/scale? | Монолитная согласованность против независимости |
| Data type | Совпадают ли shape и read/write profile? | Удобный продукт против структуры нагрузки |
| Engineering practice | Способен ли delivery process реализовать стиль? | Микросервисы с ручным выпуском |
| Team topology | Совпадает ли ownership с change flow? | Одна функция пересекает много команд |
| Integration | Совместимы ли свойства и quantum boundaries? | Сильный потребитель зависит от слабого provider |
| Enterprise | Допустимы ли технологии и процедуры? | Эффективный локальный выбор отклоняется организацией |
| Business | Соответствует ли cost/adaptability направлению? | Дорогой distributed style во время сокращений |
| Generative AI | Можно ли заменить и измерить модель? | Demo-quality без representative evaluation |

Оценка сильной стороны как 4–5 звёзд и слабой как 1–2 используется для сопоставления типа БД и стиля, а не как самостоятельный benchmark продукта.

## Антипаттерны

- Проверять стиль только на логической схеме без физического placement.
- Оптимизировать latency co-location и забывать о failure domain.
- Выбирать database-per-service по названию стиля без анализа consistency.
- Вводить несколько СУБД раньше проверки универсального варианта.
- Называть процесс Agile при ручных, непроверяемых релизах микросервисов.
- Принимать документированный contract за доказательство свойств provider.
- Игнорировать enterprise standard и удивляться отклонению решения.
- Проектировать известный ответ на неизвестные будущие изменения.
- Сравнивать LLM на разных выборках или без метрик остаточного вреда.

## Связанные ограничения

- `characteristic-driver-sieve` задаёт приоритетные свойства для аудита пересечений.
- `style-topology-fit` выбирает логическое направление, которое затем проверяется физической средой.
- `service-based-domain-service`, `space-based-cache-grid` и `microservice-granularity-isolation` уточняют характерные topology/data/team conflicts.
- `pattern-composition-coupling` помогает разрешить инфраструктурную связанность, обнаруженную аудитом.

## Источник и трассировка

Вычисленные ссылки из `derived_from`: гл. 26, с. 503–504, 509–520.

Короткий якорь корпуса: «предметно-архитектурным изоморфизмом» (гл. 26, с. 518).

KB pointer: книга `fundamental-software-architecture`, exact KU IDs из `derived_from`; deep lookup по nine intersections, deployment topology, database topology/type, engineering practice, integration, business alignment и modular LLM evaluation.

## Self-check

- [ ] Все девять пересечений просмотрены, глубина выбрана по риску?
- [ ] Для каждого ключевого свойства есть инфраструктурный механизм и failure domain?
- [ ] Placement проверен одновременно на latency и resilience?
- [ ] DB topology отделена от выбора DB type?
- [ ] Инженерные практики поддерживают способ изменения и выпуска стиля?
- [ ] Интеграция не склеила независимые quanta?
- [ ] Enterprise и business constraints обсуждены явно?
- [ ] LLM заменяема и сравнивается на общем наборе с метриками?

## Примеры активации — агентная адаптация, не из книги

- **RU:** Микросервисы разнесли по регионам, distributed cache стал медленнее, а общий provider не держит наш SLA. Как проверить все пересечения и выбрать компромисс?
- **EN:** “Our microservices span regions, the distributed cache slowed down, and a shared provider cannot meet our SLA. How do we audit the intersections and choose the trade-off?”
