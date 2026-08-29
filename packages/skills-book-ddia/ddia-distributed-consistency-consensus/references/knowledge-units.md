# Knowledge Units — ddia-distributed-consistency-consensus

Source: «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), главы 8–9.
Machine-distilled, unreviewed. Facts/formulas/technique-names preserved with page anchors;
prose paraphrased. Deep-lookup backing for `../SKILL.md`.

---

## Глава 8 — Проблемы распределённых систем

### ddia-ch08-ku01 — Частичные отказы: HPC-эскалация vs облачная отказоустойчивость
- **Type:** tradeoff-table
- **Problem:** Как система должна реагировать на сбой отдельного узла в кластере из многих машин?
- **Content:** Определяющая черта распределённых систем — частичный отказ (partial failure): часть
  узлов выходит из строя недетерминированно, пока остальные работают, и часто нельзя даже узнать,
  выполнилась ли операция (время движения сообщения по сети недетерминированно). Два полюса:
  - **HPC/суперкомпьютеры:** надёжное оборудование; частичный отказ ЭСКАЛИРУЕТСЯ до полного — при
    сбое любой части весь кластер останавливается и продолжает с последней контрольной точки
    (checkpoint). Ведёт себя как одноузловая машина. Приемлемо для офлайн/пакетных заданий.
  - **Облако/интернет-сервисы:** серийные машины (выше частота отказов, ниже цена), топология
    Клоза; недоступность неприемлема. Нужно строить надёжную систему из ненадёжных компонентов и
    встраивать отказоустойчивость в архитектуру ПО.
  Ключевой принцип: надёжность из ненадёжных частей возможна (коды коррекции ошибок; TCP поверх
  ненадёжного IP), но у неё всегда есть фундаментальный предел. В больших системах всегда что-то
  сломано; стратегия «отключить всё при любой ошибке» заставит систему тратить почти всё время на
  восстановление.
- **Applicability:** Выбор стратегии обработки сбоев при проектировании кластера; обоснование, почему
  онлайн-сервису нужна отказоустойчивость на уровне отдельных узлов.
- **Limits:** Абсолютной надёжности не существует. HPC-подход подходит только там, где остановка
  сервиса дёшева.
- **Pages:** [гл.8, с.325–328]

### ddia-ch08-ku01 — Отказоустойчивость через абстракции с гарантиями
- **Type:** heuristic
- **Problem:** Как строить отказоустойчивую распределённую систему, не заставляя каждое приложение
  вручную обрабатывать потерю пакетов, рассинхронизацию часов и остановки узлов?
- **Content:** Разумнее один раз выделить переиспользуемые абстракции, дающие полезные гарантии, и реализовать их единожды —
  раз, и позволить приложениям на них полагаться. Аналогия — транзакции (гл.7): дают иллюзию
  отсутствия сбоев (атомарность), конкурентного доступа (изоляция), абсолютной надёжности хранилища
  (долговечность). Тот же принцип для распределённых систем: искать абстракции, позволяющие
  приложению игнорировать отдельные проблемы (потеря/дублирование/задержка пакетов, приблизительные
  часы, паузы GC, отказ узлов).
- **Applicability:** Проектирование отказоустойчивых сервисов; решить — обрабатывать сбои в каждом
  компоненте или инкапсулировать в переиспользуемый слой гарантий.
- **Limits:** Некоторые гарантии принципиально недостижимы; границы доказаны теоретически (гл.9).
  Простейшая альтернатива — отключить сервис и показать ошибку.
- **Pages:** [гл.8, с.375–376]

### ddia-ch08-ku02 — Выбор времени ожидания в асинхронной сети (2d+r и неограниченные задержки)
- **Type:** decision-framework
- **Problem:** Насколько коротким должно быть время ожидания (timeout) для обнаружения сбоя узла?
- **Content:** При запросе без ответа шесть исходов неразличимы: (1) запрос потерян, (2) в очереди,
  (3) узел отказал, (4) узел временно завис (пауза GC) но ответит позже, (5) ответ потерян,
  (6) ответ задержан. Если бы сеть гарантировала макс. задержку `d`, а несбойный узел — обработку за
  `r`, любой успешный запрос вернулся бы за **2d + r** — это и есть разумный таймаут. Но реальные
  асинхронные сети НЕ дают верхней границы задержки → неограниченные задержки. Компромисс:
  - Длинный таймаут: медленное обнаружение сбоя, пользователи ждут.
  - Короткий: быстрое обнаружение, но риск ложно объявить живой-но-медленный узел мёртвым → двойное
    выполнение задания + переброс нагрузки → в худшем случае КАСКАДНЫЙ сбой.
  Причина переменных задержек — очереди: на коммутаторе, в ОС при занятых CPU, у гипервизора при
  паузе VM, в TCP (flow control). Правильного значения нет — подбирают экспериментально по
  распределению RTT.
- **Applicability:** Настройка таймаутов балансировщиков, детекторов сбоев, клиентов БД; объяснение
  каскадных отказов под нагрузкой.
- **Limits:** 2d+r применим лишь к гипотетической сети с ограниченной задержкой; в мультиарендных
  облаках «шумный сосед» делает задержку принципиально непредсказуемой.
- **Pages:** [гл.8, с.328–333]

### ddia-ch08-ku02 — Консенсус и разделение интеллекта (split-brain) при выборе ведущего узла
- **Type:** definition
- **Problem:** Как гарантировать, что при отказе ведущего узла будет выбран ровно один новый лидер?
- **Content:** Консенсус — единое мнение всех узлов по какому-то вопросу; одна из важнейших
  абстракций. Надёжное достижение консенсуса вопреки сетевым сбоям и отказам процессов — удивительно
  сложная задача. При отказе лидера остальные узлы применяют консенсус для выбора нового. Критично,
  чтобы ведущий был ровно один. Ситуация, когда два узла считают себя ведущими — разделение
  интеллекта (split-brain), часто приводит к потере данных. Корректный консенсус его предотвращает.
- **Applicability:** Failover в системах с одним лидером, распределённые блокировки, выбор
  координатора.
- **Limits:** Определение и мотивация; алгоритмы и их ограничения — далее (раздел 9.4). Консенсус
  дорог и сложен в надёжной реализации.
- **Pages:** [гл.8, с.376]

### ddia-ch08-ku03 — Адаптивное обнаружение отказов (Phi Accrual)
- **Type:** methodology
- **Problem:** Как задать таймаут детектора сбоев, если сетевые задержки сильно варьируются?
- **Content:** Вместо фиксированного таймаута система непрерывно измеряет время отклика и его разброс
  (jitter) и автоматически подстраивает порог под наблюдаемое распределение. Готовый механизм —
  **детектор отказов Phi Accrual**, применяемый в Akka и Cassandra. TCP определяет таймаут повторной
  передачи схоже — по наблюдаемому RTT. Правило: оценивать распределение циклов отправка-отклик за
  большой период и на многих машинах, затем искать компромисс между задержкой обнаружения и риском
  преждевременного объявления узла мёртвым.
- **Applicability:** Проектирование failure detector; когда фиксированный таймаут даёт много ложных
  срабатываний.
- **Limits:** Не устраняет неразличимость «мёртв» vs «медленный»; только статистически снижает
  вероятность ошибки.
- **Pages:** [гл.8, с.334–335]

### ddia-ch08-ku04 — Монотонные часы vs часы истинного времени
- **Type:** decision-framework
- **Problem:** Какие часы использовать для измерения интервала, а какие — для меток момента времени?
- **Content:**
  - **Часы истинного времени** (time-of-day, `CLOCK_REALTIME` / `System.currentTimeMillis`):
    дата/время по календарю. Синхронизируются NTP. ОПАСНОСТЬ: при большом расхождении могут быть
    сброшены и ПЕРЕПРЫГНУТЬ назад; игнорируют секунды координации. Непригодны для измерения интервала.
  - **Монотонные часы** (`CLOCK_MONOTONIC` / `System.nanoTime`): гарантированно движутся только
    вперёд. Годятся для измерения длительности. Абсолютное значение бессмысленно; сравнивать с разных
    машин НЕЛЬЗЯ. NTP может лишь «подкручивать» (slewing) частоту — по умолчанию не более 0,05%.
  - **ПРАВИЛО:** для длительности → монотонные; для момента/меток → часы истинного времени (с
    осознанием погрешности).
- **Applicability:** Таймауты, замер latency, аренды/lease, любое «сколько прошло времени».
- **Limits:** Монотонность гарантируется ОС не абсолютно (разные таймеры CPU).
- **Pages:** [гл.8, с.339–341]

### ddia-ch08-ku05 — Опасность упорядочения по настенным часам (LWW теряет записи)
- **Type:** case-pattern
- **Problem:** Можно ли метками истинного времени определять, чья запись новее в multi-leader/leaderless БД?
- **Content:** Стратегия «выигрывает последний» (last write wins, LWW), применяемая в Cassandra и
  Riak, сравнивает метки часов истинного времени. Провал: запись `x=1` получила метку 42,004 с, а
  причинно-более-поздняя `x=2` — метку 42,003 с (расхождение узлов ~3 мс), поэтому получатель отбросил
  `x=2` → инкремент клиента B ТИХО потерян, без ошибки приложению. Даже при NTP пакет может «прибыть
  до отправки». Причина: точность NTP ограничена RTT сети, а источник времени должен быть существенно
  точнее измеряемой величины — недостижимо. РЕШЕНИЕ: **логические часы** (счётчик, а не генератор);
  для причинности — **векторы версий** (version vectors).
- **Applicability:** Разрешение конфликтов в распределённых БД; любое «кто записал первым»; аудит без
  тихой потери.
- **Limits:** LWW принципиально не различает последовательные и конкурентные записи.
- **Pages:** [гл.8, с.343–345]

### ddia-ch08-ku06 — Доверительный интервал часов и commit-wait (TrueTime/Spanner)
- **Type:** methodology
- **Problem:** Как безопасно упорядочивать транзакции между ЦОДами по синхронизированным часам?
- **Content:** Показание часов — не момент, а ПРОМЕЖУТОК в доверительном интервале (напр. 95% уверены,
  что время между 10,3 и 10,5 с). Границу вычисляют как: расхождение кварца с последней синхронизации
  + погрешность NTP-сервера + RTT. Большинство API (`clock_gettime`) погрешность НЕ возвращают.
  Исключение — **TrueTime в Google Spanner**: возвращает пару [earliest, latest]. Если два интервала
  не пересекаются (Amin<Amax<Bmin<Bmax), B точно произошло после A. Spanner делает **commit-wait** —
  умышленно ждёт длительность интервала перед фиксацией, чтобы интервалы не пересеклись. Google ставит
  GPS-приёмник или атомные часы в каждом ЦОДе → синхронизация в пределах ~7 мс.
- **Applicability:** Распределённые снимки (snapshot isolation) на нескольких ЦОДах; монотонные ID
  транзакций без узкого места согласования.
- **Limits:** Требует спец-оборудования; вне баз Google не вошло; commit-wait добавляет задержку.
- **Pages:** [гл.8, с.345–348]

### ddia-ch08-ku07 — Ограждающие маркеры (fencing tokens) для распределённых блокировок
- **Type:** methodology
- **Problem:** Как не дать узлу, чья аренда истекла во время паузы, испортить защищённый ресурс?
- **Content:** Проблема: узел получает lease на ресурс, затем приостанавливается надолго (пауза GC —
  иногда минуты; suspend VM/live-migration; закрытие крышки ноутбука; steal time; своп; SIGSTOP;
  синхронный дисковый I/O). Аренда истекает, ресурс отдают другому, но «воскресший» узел продолжает
  писать → порча данных (реальный баг в HBase). РЕШЕНИЕ — **ограждение (fencing)**: сервер блокировок
  при каждой выдаче возвращает монотонно возрастающий **fencing token**. Клиент включает маркер в
  каждый запрос на запись. Ресурс ОТКЛОНЯЕТ любую запись с маркером меньше уже обработанного.
  КЛЮЧЕВОЕ: проверку выполняет САМ РЕСУРС (server-side) — проверки на клиенте недостаточно. В ZooKeeper
  роль маркера играет **zxid** или **cversion**.
- **Applicability:** Любая распределённая блокировка/аренда: единственный ведущий узел секции,
  эксклюзивная запись в файловое хранилище.
- **Limits:** Защищает только от НЕПРЕДНАМЕРЕННЫХ ошибок; злонамеренный узел может подделать маркер —
  нужны византийские протоколы. Требует, чтобы ресурс умел проверять маркеры.
- **Pages:** [гл.8, с.349, 355–357]

### ddia-ch08-ku08 — Модели системы: хронометраж, отказы узлов, safety vs liveness
- **Type:** decision-framework
- **Problem:** Какие допущения формализовать при проектировании распределённого алгоритма?
- **Content:**
  - **По хронометражу:** Синхронная (границы фиксированы; нереалистична) / Частично синхронная
    (обычно синхронна, иногда границы рассыпаются; реалистична) / Асинхронная (нет часов/таймаутов;
    очень ограничивает).
  - **По отказам узлов:** Отказ-остановка (crash-stop, падает навсегда) / Отказ-восстановление
    (crash-recovery, возвращается; есть энергонезависимое хранилище; ОЗУ теряется) / Византийские
    (произвольные, узел может лгать).
  - **ЛУЧШИЙ выбор:** частично синхронная + отказ-восстановление.
  - **Свойства корректности:** Безопасность (safety, «ничего плохого»; при нарушении ущерб
    необратим; требуется ВСЕГДА) / Живучесть (liveness, «со временем случится хорошее»; признак —
    «в конце концов»; конечная согласованность = liveness; допускает оговорки, напр. кворум жив).
  - **Византийская устойчивость:** обычно требует > 2/3 исправных узлов (из 4 может отказать 1).
    Оправдана в авиакосмосе и одноранговых сетях (Bitcoin); в обычных серверах слишком дорога.
- **Applicability:** Формальный анализ корректности алгоритмов; решение, нужна ли византийская
  устойчивость.
- **Limits:** Модель — упрощение; реальность (порча диска, «амнезия», баги прошивки) может нарушать
  допущения. Доказанная корректность не гарантирует корректной реализации.
- **Pages:** [гл.8, с.359–363]

---

## Глава 9 — Согласованность и консенсус

### ddia-ch09-ku01 — Линеаризуемость (linearizability) как гарантия актуальности
- **Type:** definition
- **Problem:** Что именно обещает система, ведущая себя как одна копия данных?
- **Content:** Линеаризуемость (atomic/strong/immediate/external consistency) — гарантия актуальности:
  система внешне выглядит так, будто существует ровно ОДНА копия данных и все операции атомарны.
  Следствия: (1) сразу после успешной записи любое чтение видит новое значение; (2) как только ОДНО
  чтение вернуло новое значение, ВСЕ последующие (у любого клиента) тоже обязаны — значение не может
  «мигать» старое↔новое. Каждая операция вступает в силу в атомарный момент между запросом и ответом;
  маркеры выстраиваются в допустимую последовательность, всегда двигаясь вперёд. **CAS** (compare-and-set,
  `cas(x, v_old, v_new)`) — часть модели линеаризуемого реестра.
- **Applicability:** Решаете, нужна ли гарантия «прочитаю последнее записанное»; выбор
  координационного сервиса, блокировок, ограничений уникальности.
- **Limits:** Не то же, что сериализуемость (не группирует операции в транзакции). Глобальные часы —
  лишь аналитическая фикция.
- **Pages:** [гл.9, с.379, 381–383]

### ddia-ch09-ku01 — Fault-tolerance bounds of consensus algorithms
- **Type:** heuristic
- **Problem:** How many node failures can a consensus system tolerate, and what breaks beyond it?
- **Content:** Any consensus algorithm needs a **majority of nodes functioning** to guarantee LIVENESS
  (termination) — this majority forms a quorum. Safety properties (agreement, integrity, validity)
  hold ALWAYS, even if a majority fails or a severe partition occurs. Consequence: a large outage can
  halt progress but cannot corrupt into invalid decisions. Termination assumes fewer than half the
  nodes are down; an algorithm that waits for a crashed node (like 2PC) cannot satisfy termination.
  Most consensus algorithms assume NO Byzantine faults; Byzantine tolerance possible only if fewer
  than **one-third** of nodes are affected.
- **Applicability:** Sizing consensus clusters, reasoning about availability vs correctness during
  partitions, deciding whether Byzantine tolerance is needed.
- **Limits:** Byzantine-tolerant algorithms out of DDIA scope; majority-liveness assumes crash-stop.
- **Pages:** [гл.9, с.424]

### ddia-ch09-ku02 — Линеаризуемость vs сериализуемость (не путать)
- **Type:** tradeoff-table
- **Problem:** Оба слова похожи на «упорядочить в последовательность» — чем различаются?
- **Content:** **Сериализуемость** — свойство ИЗОЛЯЦИИ ТРАНЗАКЦИЙ: транзакции (много объектов) ведут
  себя как выполнявшиеся в некой последовательности; фактический порядок может отличаться.
  **Линеаризуемость** — гарантия актуальности при чтении/записи ОДНОГО объекта; не объединяет
  операции в транзакции, поэтому сама по себе НЕ предотвращает write skew без доп. мер. Комбинация
  обоих = строгая сериализуемость (1SR-strong). Практика: 2PL и последовательное выполнение обычно
  линеаризуемы; а **SSI** (сериализуемая изоляция снимков) НЕлинеаризуема по устройству — читает из
  согласованного снимка без записей свежее самого снимка.
- **Applicability:** Выбор уровня изоляции + модели согласованности; понимание, почему snapshot-БД
  может быть сериализуемой, но не линеаризуемой.
- **Limits:** 1SR обычно дороже по производительности/доступности, чем каждая гарантия по отдельности.
- **Pages:** [гл.9, с.383–384]

### ddia-ch09-ku02 — Total order broadcast as repeated consensus (VSR/Paxos/Raft/Zab)
- **Type:** definition
- **Problem:** How do the well-known fault-tolerant consensus algorithms relate to ordered delivery?
- **Content:** The best-known fault-tolerant consensus algorithms are **Viewstamped Replication (VSR),
  Paxos, Raft, and Zab**. Rather than deciding a single value, they decide a SEQUENCE of values,
  making them total-order-broadcast algorithms. Total order broadcast = messages delivered to all
  nodes exactly once, in the same order — equivalent to multiple rounds of consensus. Mapping of the
  four properties: agreement = same messages same order; integrity = no duplicates; validity = not
  corrupted/fabricated; termination = not lost. VSR, Raft and Zab implement total order broadcast
  directly; in Paxos this optimization is **Multi-Paxos**.
- **Applicability:** Choosing/understanding a consensus library; state-machine replication and
  consensus are the same problem.
- **Limits:** Names an equivalence, not implementation details; algorithms differ in leader election.
- **Pages:** [гл.9, с.424–425]

### ddia-ch09-ku03 — Когда действительно нужна линеаризуемость
- **Type:** checklist
- **Problem:** В каких сценариях слабой согласованности недостаточно и нужна именно линеаризуемость?
- **Content:** Обязательна в классах задач: (1) **Блокировки и выбор ведущего узла** — против
  split-brain; блокировка выбора лидера должна быть линеаризуемой. Реализуют через **ZooKeeper и
  etcd**; **Apache Curator** — обёртка. Замечание: ZK/etcd линеаризуемы на ЗАПИСЬ, а чтение по
  умолчанию может быть устаревшим — нужен явный линеаризуемый режим (в etcd — чтение кворума, в
  ZooKeeper — вызов `sync()` перед чтением). (2) **Ограничения уникальности** (username, e-mail, путь
  файла, «не продать больше мест», неотрицательный баланс) — по сути атомарный CAS. Внешние ключи и
  ограничения атрибутов линеаризуемости НЕ требуют. (3) **Межканальные синхронизационные
  зависимости** — когда между компонентами два канала (хранилище файлов + очередь), без
  линеаризуемости возникает гонка: сообщение обгоняет репликацию данных.
- **Applicability:** Аудит требований к согласованности новой фичи; тащить ли ZooKeeper/etcd.
- **Limits:** Иногда ограничение можно ослабить (овербукинг с компенсацией) — тогда линеаризуемость не
  нужна.
- **Pages:** [гл.9, с.384–387]

### ddia-ch09-ku03 — Epoch numbering + overlapping-quorum voting for a unique leader
- **Type:** methodology
- **Problem:** Electing a leader itself seems to need consensus — how is the chicken-and-egg broken?
- **Content:** Consensus protocols guarantee a unique leader PER EPOCH, not forever. Each defines an
  epoch number — **ballot number (Paxos), view number (VSR), term number (Raft)** — totally ordered
  and monotonically increasing. When the leader is believed dead, a vote starts a new epoch with a
  higher number; on conflict the higher epoch wins. Before deciding, a leader must confirm no
  higher-epoch leader exists by collecting votes from a quorum. TWO rounds of voting: elect the
  leader, then approve each proposal. Key invariant: the quorums must **OVERLAP** — at least one node
  voting for a proposal also participated in the latest election. So if a proposal vote reveals no
  higher epoch, the leader may safely commit. A node votes for a proposal only if unaware of any
  higher-epoch leader.
- **Applicability:** Understanding Raft/Paxos leader election, debugging split-brain, why stale leaders
  can't commit.
- **Limits:** Quorum usually but not always a majority; assumes static membership in the base algorithm.
- **Pages:** [гл.9, с.426–427]

### ddia-ch09-ku04 — Линеаризуемость методов репликации (включая ловушку кворума)
- **Type:** tradeoff-table
- **Problem:** Какие схемы репликации дают линеаризуемость и почему строгий кворум её не гарантирует?
- **Content:**
  - **Один ведущий узел** — потенциально линеаризуема (если читать с лидера или синхронных ведомых),
    ломается при ложном лидере или асинхронной репликации.
  - **Консенсусные алгоритмы** — линеаризуемы (защита от split-brain и устаревших реплик); так
    работают ZooKeeper и etcd.
  - **Несколько ведущих** — НЕлинеаризуема (конкурентные записи + конфликты).
  - **Без ведущего (Dynamo)** — чаще нет.
  Ключевая ловушка: даже строгий кворум **w + r > n** НЕ гарантирует линеаризуемость. Контрпример
  (n=3, w=3, r=2): пишущий обновляет 0→1 на всех репликах; клиент A читает кворум из 2 и видит 1,
  конкурентный клиент B стартует ПОЗЖЕ, читает другой кворум из 2 и видит старое 0 — условие кворума
  выполнено, но результат нелинеаризуем. Линеаризуемости можно достичь ценой производительности
  (синхронное разрешение конфликта при чтении + чтение последнего состояния перед записью), но LWW по
  физическим часам почти наверняка нелинеаризуемо, а линеаризуемый CAS без консенсуса недостижим.
- **Applicability:** Оценка гарантий существующей БД; проектирование кворумных систем; аргумент против
  «w+r>n = strong consistency».
- **Limits:** Секционирование БД с одним лидером на раздел не влияет на линеаризуемость одного объекта;
  кросс-раздельные транзакции — отдельная тема (9.4).
- **Pages:** [гл.9, с.387–390]

### ddia-ch09-ku04 — Fault-tolerant consensus vs two-phase commit (2PC)
- **Type:** tradeoff-table
- **Problem:** How does the quorum voting of consensus differ from 2PC, which it resembles?
- **Content:** Both use a proposal/voting flow, but three differences make consensus fault-tolerant
  where 2PC is not: (1) In 2PC the coordinator is NOT elected (fixed, single point); consensus elects
  a leader. (2) 2PC requires a 'yes' from EVERY participant; consensus requires only a
  majority/quorum. (3) Consensus includes a RECOVERY process to reach a consistent state after a new
  leader is elected, preserving safety. Because 2PC waits on all participants and a static
  coordinator, a failed coordinator can block it indefinitely (violating termination).
- **Applicability:** Choosing between distributed-transaction commit and a consensus-based approach;
  explaining why 2PC blocks.
- **Limits:** High-level comparison; ignores 3PC and non-blocking atomic commit variants.
- **Pages:** [гл.9, с.427]

### ddia-ch09-ku05 — CAP правильно + цена линеаризуемости (Attiya–Welch)
- **Type:** heuristic
- **Problem:** Как корректно применять CAP и почему линеаризуемость медленна даже без сбоев?
- **Content:** Компромисс: если приложение требует линеаризуемости, а реплики отрезаны сетью — они
  должны либо ждать, либо возвращать ошибку (недоступны). Если линеаризуемость не нужна — каждая
  реплика обслуживает запросы независимо и остаётся доступной, но нелинеаризуемо. Это CAP (Брюер,
  2000). Правильная расшифровка — НЕ «pick 2 of 3»: раздел сети — это сбой, а не выбор, он случится в
  любом случае. Точнее: «either Consistent or Available when Partitioned» — выбор C/A делается ТОЛЬКО
  во время раздела. CAP как формальная теорема узка (одна модель, один вид сбоя), молчит про задержки
  и мёртвые узлы; на практике малоприменима. Цена линеаризуемости (важнее CAP): она медленна ВСЕГДА,
  не только при сбоях. Даже RAM многоядерного CPU нелинеаризуема (кэши+буферы). Доказательство
  **Аттии и Уэлч**: время отклика линеаризуемых чтения/записи не меньше, чем пропорционально
  неопределённости сетевых задержек. Более быстрого алгоритма не существует.
- **Applicability:** Разговор про «CP vs AP»; обоснование выбора более слабой модели ради латентности
  в геораспределённой системе.
- **Limits:** Классификация CP/AP имеет недостатки — избегать.
- **Pages:** [гл.9, с.391–394]

### ddia-ch09-ku05 — Costs and limitations of consensus systems
- **Type:** checklist
- **Problem:** Why isn't consensus used everywhere despite bringing safety to unreliable systems?
- **Content:** Price paid: (1) Proposal voting is a form of SYNCHRONOUS replication — many DBs prefer
  async (risk losing data on failover) for performance. (2) Requires a strict majority: **minimum 3
  nodes to tolerate 1 failure, minimum 5 to tolerate 2**; on a split only the majority partition
  proceeds. (3) Most algorithms assume a FIXED set of voting nodes — dynamic-membership extensions
  exist but are far less understood. (4) Failure detection relies on TIMEOUTS; in geo-distributed /
  variable-latency networks a node may wrongly think the leader failed, and frequent leader elections
  give terrible performance — harms performance but not safety. (5) Sensitivity to network faults:
  e.g. Raft has edge cases where one unreliable link makes leadership bounce endlessly.
- **Applicability:** Deciding whether a workload needs consensus, capacity planning, diagnosing
  election storms.
- **Limits:** Some limits (fixed membership, timeout detection) being addressed by newer variants.
- **Pages:** [гл.9, с.427–428]

### ddia-ch09-ku06 — Причинная согласованность и временные метки Лампорта
- **Type:** methodology
- **Problem:** Как сохранить порядок «причина раньше следствия» без дорогой линеаризуемости?
- **Content:** Причинность задаёт ЧАСТИЧНУЮ упорядоченность (у линеаризуемости — полная): причинно
  связанные операции упорядочены, конкурентные — несравнимы. Линеаризуемость сильнее и подразумевает
  причинность, но причинная согласованность — самая сильная модель, которая НЕ замедляется из-за
  сетевых задержек и остаётся доступной при разделах (CAP её не касается). Часто система, «требующая
  линеаризуемости», нуждается лишь в причинной согласованности. Реализация: логические часы. Наивные
  генераторы (чётные/нечётные счётчики, метки физ. часов, преднарезанные диапазоны) дают полный
  порядок, но НЕсовместимы с причинностью. **Временные метки Лампорта** (Leslie Lamport, 1978): метка
  = пара (счётчик, ID узла); при равном счётчике больше та, у кого больше ID. Каждый узел/клиент
  хранит максимум встреченного счётчика и включает его в каждый запрос; получив большее значение,
  немедленно поднимает свой счётчик. Отличие от векторов версий: векторы определяют, конкурентны ли
  операции; метки Лампорта этого не показывают, зато компактнее.
- **Applicability:** Геораспределённые БД с высокой доступностью; упорядоченные ID без единого лидера.
- **Limits:** Меток Лампорта НЕДОСТАТОЧНО для решений «прямо сейчас» (напр. уникальность имени): полный
  порядок известен лишь ПОСЛЕ сбора всех операций.
- **Pages:** [гл.9, с.397–403]

### ddia-ch09-ku06 — ZooKeeper/etcd feature set for distributed coordination
- **Type:** definition
- **Problem:** What does ZooKeeper provide beyond a small key-value store, and which parts need consensus?
- **Content:** ZooKeeper (modeled on Google's Chubby) and etcd hold small data in memory (persisted to
  disk), replicated via fault-tolerant total order broadcast. Feature set: (1) **Linearizable atomic
  operations** — atomic compare-and-set implements a lock; exactly one racing node succeeds; atomic
  and linearizable even across crashes. Locks are usually leases with expiry. (2) **Total ordering of
  operations** — monotonically increasing fencing token via transaction id (**zxid**) and version
  number (**cversion**). (3) **Failure detection** — clients keep long-lived sessions with heartbeats;
  on session timeout, ephemeral nodes (and locks) auto-release. (4) **Change notifications (watches)**
  — subscribe to changes without polling. Of these, ONLY the linearizable atomic operations truly
  require consensus.
- **Applicability:** Leader election, distributed locks with fencing, cluster membership, config
  coordination.
- **Limits:** Small slow-changing data only — not high-frequency application state; use e.g. Apache
  BookKeeper for that.
- **Pages:** [гл.9, с.429–430]

### ddia-ch09-ku07 — Рассылка общей последовательности (total order broadcast)
- **Type:** methodology
- **Problem:** Как всем узлам согласованно доставлять операции в одном порядке и почему это = консенсус?
- **Content:** Рассылка общей последовательности (total order / atomic broadcast) — два свойства
  безопасности: (1) Надёжная доставка — если сообщение дошло до одного узла, дойдёт до всех;
  (2) Полностью упорядоченная доставка — все узлы получают сообщения в ОДНОМ порядке. Порядок
  фиксируется в момент доставки — нельзя вставить сообщение задним числом. Применения: репликация
  конечных автоматов; сериализуемые транзакции как детерминированные хранимые процедуры; ограждающие
  маркеры (в ZooKeeper — zxid). Связь с линеаризуемостью: из TOB строится линеаризуемый CAS через
  журнал только-на-дополнение, но это даёт лишь линеаризуемую ЗАПИСЬ; чтение из асинхронного хранилища
  даёт последовательную (sequential) согласованность — слабее. Обратно: из линеаризуемого реестра с
  атомарным increment-and-get строится TOB. Итог: линеаризуемый CAS/increment-and-get и TOB
  ЭКВИВАЛЕНТНЫ консенсусу.
- **Applicability:** Реплицируемые логи/БД; ZooKeeper/etcd; fencing-токены и уникальность через журнал.
- **Limits:** TOB асинхронна — не гарантирует ВРЕМЯ доставки. Консенсус не имеет детерминированного
  решения в асинхронной модели с аварийной остановкой (FLP).
- **Pages:** [гл.9, с.405–409]

### ddia-ch09-ku07 — When coordination needs consensus vs when it doesn't (service discovery)
- **Type:** heuristic
- **Problem:** Does every coordination task require a consensus system?
- **Content:** ZooKeeper runs on a small FIXED number of voting nodes (typically **3 or 5**) and
  outsources coordination for many clients (voting across thousands of clients would be hopelessly
  inefficient). Suits slow-changing data like 'node X is leader for partition 7'. **Service
  DISCOVERY**, however, does NOT require consensus: DNS is deliberately non-linearizable and cached,
  and slightly stale results are usually fine. Discovery needs leader ELECTION but not consensus
  itself, so a consensus system that already knows the leader can expose **read-only caching
  replicas**: these asynchronously receive the log, don't vote, and serve non-linearizable reads.
  Membership services combine failure detection with consensus so nodes agree on who is alive.
- **Applicability:** Deciding whether to route reads to read-only replicas, avoiding consensus for
  discovery, sizing coordination ensembles vs client count.
- **Limits:** Agreed membership can still misclassify a live node as failed; discovery assumes
  staleness is acceptable.
- **Pages:** [гл.9, с.430–432]

### ddia-ch09-ku08 — Двухфазная фиксация (2PC) и её опасность блокировки
- **Type:** methodology
- **Problem:** Как атомарно зафиксировать транзакцию на нескольких узлах и в чём риск при отказе координатора?
- **Content:** 2PC (two-phase commit) — классический алгоритм атомарной фиксации по нескольким узлам
  (внутри БД, либо XA-транзакции/JTA, WS-AtomicTransaction). Вводит **координатор** (диспетчер
  транзакций; Narayana, JOTM, BTM, MSDTC). Протокол: приложение берёт глобально уникальный ID, ведёт
  одноузловые транзакции у участников. **Фаза 1 (prepare):** координатор спрашивает всех «можете
  зафиксировать?»; ответив «да», участник ДАЁТ ОБЕЩАНИЕ — записывает данные на диск, проверяет
  отсутствие конфликтов и теряет право на односторонний откат. **Фаза 2:** если ВСЕ «да» — координатор
  записывает решение в свой журнал (точка фиксации) и рассылает commit; если хоть один «нет» — abort.
  Две точки невозврата: участник сказал «да» и координатор записал решение. НЕ путать с 2PL. Смертельный
  изъян: если координатор падает ПОСЛЕ ответов «да», но до рассылки решения — транзакция участника
  «сомнительная» (in-doubt); участник ДЕРЖИТ БЛОКИРОВКИ, пока координатор не восстановится. Потеря
  журнала → блокировки навсегда → ручное вмешательство. 2PC — блокирующий протокол.
- **Applicability:** Проектирование распределённых транзакций; оценка рисков XA; почему облачные
  сервисы избегают distributed transactions.
- **Limits:** 3PC (неблокирующий) требует идеального детектора отказов и ограниченных задержек —
  в реальных сетях не гарантирует атомарность. Координатор — единая точка отказа; XA не делает
  кросс-системного детекта дедлоков, не работает с SSI.
- **Pages:** [гл.9, с.411, 413–417]

### ddia-ch09-ku08 — Problems reducible to consensus + three responses to leader failure
- **Type:** decision-framework
- **Problem:** Which problems are secretly consensus, and what are the options when the leader fails?
- **Content:** A wide range of problems are EQUIVALENT to consensus (solving one yields the rest):
  linearizable compare-and-set registers; atomic commit of a distributed transaction; total order
  broadcast; locks and leases; membership/coordination services; uniqueness constraints. All are
  trivial with a SINGLE decision-maker — which is why a single-leader database offers linearizable
  ops, uniqueness constraints, and a totally ordered replication log. When that leader fails/partitions,
  three responses: (1) **Wait for recovery, stay blocked** — chosen by many XA/JTA coordinators; does
  NOT solve consensus (violates termination). (2) **Fail over manually** — a human picks a new leader;
  correct but human-speed. (3) **Automatic leader-election** — requires a consensus algorithm; use a
  proven one. Thus even a single-leader DB still needs consensus for leadership/failover. Leaderless
  and multi-leader replication generally avoid global consensus, accepting branching/merging version
  histories instead of linearizability.
- **Applicability:** Recognizing a problem reduces to consensus, choosing a failover strategy, deciding
  whether to adopt a consensus tool or accept conflict-merging.
- **Limits:** Equivalence is theoretical; practical systems add optimizations.
- **Pages:** [гл.9, с.432–434]

### ddia-ch09-ku09 — Формальные требования к консенсусу + невозможность FLP
- **Type:** definition
- **Problem:** Что должен гарантировать консенсусный алгоритм и что говорит теория о достижимости?
- **Content:** Консенсус: узлы предлагают значения, алгоритм выбирает одно. Четыре требования:
  (1) **Единое решение** (uniform agreement) — никакие два узла не решают по-разному; (2) **Целостность**
  (integrity) — ни один узел не решает дважды; (3) **Действительность** (validity) — если узел выбрал
  v, то v было предложено (исключает тривиальный «всегда 0»); (4) **Завершённость** (termination) —
  каждый не отказавший узел в итоге выбирает значение. Первые три — безопасность, завершённость —
  живучесть (формализует отказоустойчивость: нельзя застыть, как 2PC при мёртвом координаторе). Модель
  предполагает fail-stop. Результат **FLP (Fischer, Lynch, Paterson)**: в асинхронной модели с
  возможным сбоем узла НЕТ детерминированного алгоритма, всегда достигающего консенсуса. Но модель
  узкая: разрешить таймауты/детекторы отказов или даже случайные числа — и консенсус на практике
  достижим. Атомарная фиксация — частный случай консенсуса, но неблокирующая атомарная фиксация сложнее
  консенсуса.
- **Applicability:** Оценка корректности координационных алгоритмов; словарь для Raft/Zab/Paxos;
  аргумент «почему нельзя гарантировать консенсус без таймаутов».
- **Limits:** FLP-невозможность теоретична — на практике консенсус обычно достижим.
- **Pages:** [гл.9, с.410, 422–423]
