# Knowledge Units — Deriving Data & Integrating Systems (DDIA гл. 12)

Deep-lookup reference for `ddia-deriving-data-and-integration`. 14 verified KUs from chapter 12
of «Высоконагруженные приложения» (M. Kleppmann). Each entry preserves the source KU fields.

---

## ku01 · tradeoff-table — Log-based derived data vs distributed transactions for integrating heterogeneous systems
**Pages:** 566, 567, 571 · skill_worthiness: high

**Problem:** You must keep copies of the same data consistent across multiple specialized stores (DB, search index, cache, analytics, ML). How do you choose between distributed transactions and async log-based derivation?

**Content:** Two approaches reach similar goals differently. Distributed transactions (2PC/XA): order writes via mutual-exclusion locks (2PL); guarantee exactly-once via atomic commit; provide linearizability, giving read-your-writes. But XA has poor fault-tolerance and performance, aborts on any participant failure so failures amplify across systems, and usually requires a single datacenter (no geo-distribution). Log-based derived data (CDC or event sourcing): order events via the log; achieve exactly-once via deterministic retries + idempotence; updates are async, so no default timeliness guarantee. Because it is asynchronous, a local fault stays local (log buffers messages, slow/failed consumer catches up without blocking others). Kleppmann's recommendation: absent a widely-supported good distributed-transaction protocol, log-based derived data is the most promising integration approach; use an ordered event log with idempotent consumers when data crosses a boundary between technologies written by different teams.

**Applicability:** Choosing an integration strategy across storage systems maintained by different teams; deciding whether to reach for XA/2PC or a Kafka-style log + idempotent consumers.

**Limits:** Distributed transactions still win inside a single storage/stream-processing system where they are cheap; log-based systems sacrifice timeliness (read-your-writes) unless you explicitly add a consumer that waits for the output message.

---

## ku01 · heuristic — Trust-but-verify: continuous end-to-end integrity auditing
**Pages:** 611, 612, 613 · skill_worthiness: high

**Problem:** Hardware and software eventually corrupt data silently; ACID/transaction guarantees are treated as absolute, so rare corruption goes undetected until it has propagated and become expensive to trace.

**Content:** Do not blindly trust that storage, transactions, or backups work — assume corruption will eventually happen and build in checking. Concrete practices: (1) run background processes that continuously read data, compare it against other replicas, and rewrite blocks to counter silent ('bit rot') corruption — as HDFS and Amazon S3 do [67]; (2) periodically restore from backups to confirm the backup is not itself corrupt before you actually need it; (3) prefer end-to-end integrity checks over per-component checks — the more systems a check spans, the less chance corruption slips through undetected, and a correct check of the whole pipeline implicitly exercises every disk, network, service, and algorithm on the path. Continuous auditing raises confidence and, like automated testing, lets you move faster because regressions from a changed storage technology surface quickly.

**Applicability:** Designing durable storage, data pipelines, backup strategies, or any system where undetected corruption is costly.

**Limits:** Verification costs read bandwidth/compute; the book notes few systems actually do this and treats it as an aspirational 'culture of verification' rather than standard practice.

---

## ku02 · checklist — When a single totally-ordered event log breaks down
**Pages:** 567, 568, 569 · skill_worthiness: high

**Problem:** Total order broadcast (equivalent to consensus) works for small systems but becomes impossible as systems scale. When can you NOT assume a single global event order?

**Content:** A totally-ordered log requires all events to pass through one leader. It breaks in four situations: (1) Throughput exceeds one machine, forcing log partitioning across machines -> order across partitions is undefined. (2) Geographically separated datacenters each run their own leader (sync cross-DC coordination is too slow), so events in different DCs have no defined order. (3) Microservices with separate per-service durable storage (no shared store) -> events from different services have no defined order. (4) Offline-capable clients update local state immediately -> clients and servers see events in different orders. Deciding a single total order = total order broadcast = consensus; most consensus algorithms assume one node can handle the full event throughput and offer no mechanism to shard ordering across nodes. Scaling consensus beyond single-node throughput / for geo-distribution is still an open research problem. Practical fallbacks: route all updates for one object ID to one log partition (per-object total order); use logical timestamps for total order without coordination (but receivers must handle out-of-order events with extra metadata); log the state a user saw before deciding, give it an ID, and have subsequent events reference that ID to preserve causality.

**Applicability:** Deciding whether your architecture can rely on a global event order; diagnosing lost causal dependencies (e.g. unfriend-then-message ordering bugs) in event-driven systems.

**Limits:** For concurrent events with no causal link, missing total order is harmless — order them arbitrarily. There is no simple general solution for capturing subtle causal dependencies.

---

## ku02 · methodology — Auditable architecture via deterministic event derivation
**Pages:** 612, 613 · skill_worthiness: high

**Problem:** With transaction-based systems that lock and mutate multiple tables, it is hard to reconstruct after the fact what a transaction did or why; the application logic that issued it is transient and non-reproducible, making audit and debugging difficult.

**Content:** Make systems auditable by structuring them around immutable events instead of mutating state in place. Each user input is captured as a single immutable event, and all resulting state updates are derived from it. Make the derivation deterministic and repeatable so that re-running the event log through the same derivation code produces the same state. This gives explicit data provenance and enables integrity verification: for any derived state you can re-run the batch/stream processors that produced it and check you get the same result, or run a redundant parallel derivation, and you can validate the event store itself. The clear, deterministic dataflow also enables 'time-travel' debugging — reproducing the exact circumstances that led to an event.

**Applicability:** Event-sourced / CDC-based architectures, derived data (indexes, materialized views, caches, ML models) where auditability and reproducibility matter.

**Limits:** Requires strict determinism of derivation code; guaranteeing integrity of both the audit log and the state DB is still hard — signing the log (e.g. via an HSM) protects against tampering but not against wrong transactions entering it in the first place.

---

## ku03 · decision-framework — Unbundling the database: federated (unified read) vs unbundled (unified write)
**Pages:** 576, 577, 578, 580 · skill_worthiness: medium

**Problem:** No single data model or storage format suits all access patterns. How do you combine multiple specialized storage/processing tools into one coherent system?

**Content:** Treat the whole organization's dataflow as one big database whose indexes and materialized views are maintained by batch/stream/ETL processes (acting like triggers, stored procedures, and view maintenance). Two complementary ways to combine tools: (1) Federated database / polystore — provide a unified read/query interface over many underlying engines (e.g. PostgreSQL foreign data wrapper). Follows the relational tradition (one high-level query language, elegant semantics) but has a complex implementation; solves reading, not write synchronization. (2) Unbundled database — provide unified write: reliably sync writes across storage systems by unbundling the index-maintenance function, e.g. change data capture producing event logs consumed idempotently. Follows the Unix tradition (small tools doing one thing, composed via a low-level uniform API). Write synchronization is the harder engineering problem; prefer an asynchronous event log with idempotent writes over distributed transactions when data crosses technology boundaries. Big win of log-based integration: loose coupling — no dependencies between components, so components/teams evolve independently.

**Applicability:** Architecting a multi-store data platform; deciding how to wire a DB to a search index, cache, warehouse, and ML pipeline while keeping them consistent.

**Limits:** Unbundling adds operational complexity (each product has its own learning curve); if one integrated product meets all your needs it will give better, more predictable performance — unbundling pays off only when no single product suffices. Building for scale you don't need is premature optimization.

---

## ku03 · definition — Merkle trees for cryptographic integrity proofs
**Pages:** 614 · skill_worthiness: medium

**Problem:** Verifying that a specific record genuinely belongs to a dataset, and proving dataset integrity, in a way that resists a broad range of hardware/software faults and even malicious tampering.

**Content:** Cryptographic audit and integrity checking commonly rely on Merkle trees [74] — trees of hashes that let you efficiently prove that a given record appears in a dataset without revealing or rehashing the whole set. Beyond cryptocurrencies (Bitcoin, Ethereum, Ripple, Stellar), the same structure underpins certificate transparency [75,76], which uses Merkle trees to audit TLS/SSL certificates. Distributed-ledger systems are, from a data-systems view, distributed databases where mutually-distrusting parties host replicas that continuously check each other's integrity and use a consensus protocol to confirm transactions. The author is skeptical of the Byzantine-fault-tolerance value and calls proof-of-work (Bitcoin mining) extraordinarily wasteful, but considers the integrity-checking ideas (Merkle trees, certificate transparency) worth adopting more broadly in data systems.

**Applicability:** Designing tamper-evident logs, certificate/audit systems, or evaluating blockchain/distributed-ledger tech for its integrity properties.

**Limits:** Making these algorithms scale as well as non-cryptographic systems and minimizing compute cost is still open work; proof-of-work specifically is judged wasteful and low-throughput.

---

## ku04 · decision-framework — Write path vs read path: where to place the precompute boundary
**Pages:** 588, 589, 590, 591 · skill_worthiness: high

**Problem:** Caches, indexes, and materialized views all trade write-time work for read-time work. How do you reason about where to put that boundary?

**Content:** The write path is the eager part: when data is written it flows through batch/stream processing to update derived datasets (indexes, materialized views), regardless of whether anyone will query it. The read path is the lazy part: run only when a query arrives, doing extra processing on the derived data to produce the answer. A derived dataset is the meeting point of the two paths — a tradeoff between how much work happens at write vs read. Full-text search example: no index = zero write work but a full grep-style scan at read time (expensive at scale); precomputing results for ALL possible queries = trivial read but infinite/unbounded write cost (impossible). Precomputing only the common queries = a 'standard-query cache', which is really a materialized view (must be refreshed as new documents arrive). Indexes, caches, and materialized views do not create new work — they shift the write/read boundary. The boundary can differ per case (e.g. Twitter fan-out: precompute timelines for normal users, query-time merge for celebrity posts). The boundary can even extend to the end user's device: pushing state changes to clients (via server-sent events / WebSocket) prolongs the write path all the way to the UI.

**Applicability:** Deciding whether to add/remove an index, cache, or materialized view; tuning latency vs write amplification; designing offline-capable stateful clients as caches of server state.

**Limits:** Precomputing everything is infeasible when the query space is unbounded; the set of queries with non-empty results is finite but grows exponentially with the number of terms.

---

## ku04 · methodology — Async constraint checking instead of distributed transactions
**Pages:** 627, 628 · skill_worthiness: high

**Problem:** Enforcing integrity constraints across a distributed, geographically spread system traditionally requires distributed transactions and coordination, which scale poorly and hurt availability under faults.

**Content:** Reliable integrity can be achieved with scalability by processing events asynchronously and: (1) using end-to-end operation identifiers to make operations idempotent (safe to retry without duplication), and (2) checking constraints asynchronously rather than synchronously within a coordinating transaction. Clients then have two options — either wait for the constraint check to complete, or proceed optimistically without waiting and, if a constraint turns out to be violated, apologize/compensate afterward. Structuring the application around dataflow with asynchronous constraint checking avoids most coordination, preserves integrity, and keeps working under faults and across geo-distributed deployments. This is more scalable and robust than the traditional distributed-transaction approach, and mirrors how many real business processes actually operate.

**Applicability:** Designing high-throughput, geo-distributed systems that need integrity guarantees (uniqueness, balances, inventory) without the availability cost of distributed transactions.

**Limits:** The 'proceed and apologize' path requires a compensation/apology mechanism and tolerance for temporary constraint violations; not suitable where a violation is truly unrecoverable.

---

## ku05 · methodology — End-to-end argument: exactly-once via idempotent operation IDs
**Pages:** 596, 597, 598, 599, 600 · skill_worthiness: high

**Problem:** Retrying a failed request can execute it twice (e.g. transfer money twice). Low-level dedup (TCP, stream-processor exactly-once) doesn't stop duplicate submissions from the end user.

**Content:** The end-to-end argument (Saltzer, Reed, Clark, 1984): a function like duplicate suppression can only be implemented correctly with knowledge at the application endpoints — it cannot be provided by the communication system alone (lower layers only reduce the probability of higher-level problems). TCP suppresses duplicate packets only within one connection; a stream processor's exactly-once is only at the message-processing level; neither prevents a user from re-submitting a timed-out POST. Fix: generate a unique operation ID (e.g. a UUID, or a hash of the form fields) in the client, carry it end-to-end from client to DB, and enforce a UNIQUE constraint on request_id. If the browser sends the POST twice, both carry the same ID; the second INSERT fails and the transaction aborts, so the operation runs once. Relational DBs enforce uniqueness constraints even at weak isolation levels (unlike an app-level check-then-insert, which can fail under non-serializable isolation due to write skew/phantoms). The requests table also doubles as an event-sourcing log — the balance updates are redundant and can be derived from the request event by a downstream idempotent consumer. Same argument applies to integrity checks (end-to-end checksums beat Ethernet/TCP/TLS checksums) and encryption (end-to-end beats hop-by-hop TLS/Wi-Fi).

**Applicability:** Making money transfers, form submissions, and any non-idempotent operation safe across multiple network hops; designing retry-safe APIs.

**Limits:** Making a naturally non-idempotent operation idempotent costs extra metadata (set of operation IDs) and fencing across node handovers. Low-level reliability (TCP, checksums) is still useful but insufficient alone for end-to-end correctness.

---

## ku05 · heuristic — Watch for self-reinforcing feedback loops via systems thinking
**Pages:** 617, 618, 619 · skill_worthiness: medium

**Problem:** Predictive/recommendation systems that act on people can create self-reinforcing feedback loops that amplify existing inequities or distort behavior, often invisibly and framed as rigorous data-driven decisions.

**Content:** When a data system's output influences the inputs it later learns from, harmful self-reinforcing loops can form: e.g. a low credit score reduces employability, which worsens finances, which further lowers the score. Recommendation engines that show people only agreeable content create echo chambers, misinformation, and polarization. Machine learning trained on biased data will learn and amplify that bias — 'laundering' prejudice into seemingly objective output; predictive systems extrapolate the past, codifying past discrimination. Mitigation: apply systems thinking — analyze the whole system, including the humans interacting with it, not just the computerized parts — and explicitly ask whether the system reinforces existing disparities (rich richer, poor poorer) or counteracts injustice. Note that many outputs are probabilistic: a correct aggregate distribution still produces wrong individual predictions, so individual decisions need accountability, transparency, and an appeal path.

**Applicability:** Designing or reviewing recommendation, scoring, ranking, or automated-decision systems that affect people.

**Limits:** Not all loops are predictable in advance; this is an ethical/systems-design heuristic, not a formal algorithm — it guides review, not automatic detection.

---

## ku06 · methodology — Enforcing uniqueness and multi-partition constraints via partitioned event logs (no atomic commit)
**Pages:** 602, 603, 604 · skill_worthiness: high

**Problem:** Uniqueness constraints require consistency; distributed atomic constraints across partitions normally need atomic commit, which kills throughput. Can you get correctness without 2PC?

**Content:** Uniqueness enforcement in a partitioned log: partition the log by the value that must be unique (e.g. hash of username / request ID), so all potentially-conflicting requests land in the same partition. A single stream processor consumes that partition's messages sequentially in one thread, keeps a local DB of taken values, and for each request emits accept (if free) or reject (if taken) to an output stream; the client watches the output stream for its result. This is equivalent to implementing a linearizable store via total order broadcast, and scales by adding partitions (each processed independently). The core principle generalizes to many constraints: route all conflicting writes to one partition and process them sequentially with arbitrary application logic. Multi-partition operation without atomic commit (e.g. transfer between accounts in different partitions): (1) client gives the request a unique ID; log it as ONE atomic message in a partition keyed by that ID (single-object writes are atomic almost everywhere). (2) A stream processor reads the request and emits two messages — a debit instruction (partitioned by payer) and a credit instruction (partitioned by payee), each carrying the request ID. (3) Downstream processors apply the changes, deduplicating by request ID. If step-2 processor crashes and reprocesses, it deterministically regenerates identical instructions, so downstream dedup keeps it exactly-once — same correctness as atomic commit, but survivable and higher-throughput.

**Applicability:** Enforcing unique usernames/emails/seat bookings at scale; splitting a cross-partition transaction into idempotent stages without XA/2PC.

**Limits:** Requires the conflicting values to be partitionable and all routed to one partition; async multi-leader replication is excluded (concurrent leaders could each accept conflicting writes). Immediate rejection of violating writes still needs synchronous coordination within the partition.

---

## ku06 · heuristic — Treat personal data as a liability, not just an asset
**Pages:** 623, 624, 625, 626 · skill_worthiness: medium

**Problem:** Behavioral data is often framed as free 'data exhaust' / valuable capital, encouraging maximal collection and indefinite retention — which creates large, under-appreciated risk.

**Content:** Reframe collected personal data as a 'toxic asset' / hazardous material [101,103], not only capital: every dataset is a target for hackers, hostile intelligence services, insider leaks, unethical future owners, or a future government that could compel its disclosure ('using technology that could one day help a police state is poor civic hygiene' [104]). Design-time guidance: (1) at each collection point, weigh the benefit against the risk of the data ending up in the wrong hands — including future governments, not just today's; (2) do not retain data forever — delete it as soon as it is no longer needed [111,112]; (3) enforce access control not only via policy but via cryptographic protocols [113,114]; (4) note that data-deletion requirements conflict with immutability/event-sourcing designs, so plan for expiry/erasure explicitly. Privacy is not secrecy but the right to choose what to disclose and to whom; collecting via surveillance transfers that right from the individual to the company.

**Applicability:** Data-retention policy, privacy-by-design, threat modeling of stored PII, GDPR-style compliance ('collected for specified, explicit, legitimate purposes', 'adequate, relevant, not excessive').

**Limits:** Ethical/policy guidance rather than a mechanism; over-regulation/over-deletion can also block legitimate value (e.g. medical research), so balance is required.

---

## ku07 · definition — Timeliness vs integrity: decomposing 'consistency'
**Pages:** 604, 605, 606 · skill_worthiness: high

**Problem:** 'Consistency' conflates two distinct requirements. Which one matters more, and what does violating each actually mean?

**Content:** Consistency bundles two separable requirements. Timeliness: users see the system in its current (up-to-date) state; a stale read is temporarily out of order but self-heals by waiting/retrying. Linearizability (the CAP sense of consistency) is a strong way to achieve timeliness; weaker forms like read-your-writes also help. Integrity: absence of corruption — no lost, contradictory, or false data; a derived dataset must correctly reflect its source (an index missing records is useless). Integrity violations are permanent: waiting/retrying will not fix a corrupt DB — you need explicit checking and repair. Memorable framing: violating timeliness = 'consistency sometimes'; violating integrity = 'perpetual inconsistency'. In most applications integrity matters far more than timeliness: a credit-card transaction not yet visible for 24h is fine (banks reconcile asynchronously), but a balance not equal to prior balance plus transactions, or money debited but not received, is catastrophic. ACID couples both — linearizability provides timeliness, atomic commit provides integrity — which is why the distinction is easy to miss under ACID. Event-based dataflow systems decouple them: async stream processing gives no timeliness guarantee by default, but integrity is preserved and is a required condition.

**Applicability:** Prioritizing correctness requirements when relaxing consistency for performance; deciding what to guarantee synchronously vs eventually.

**Limits:** Some operations genuinely need timeliness/linearizability (e.g. strict constraints before irreversible actions) and there you must pay for synchronous coordination.

---

## ku08 · decision-framework — Coordination-avoiding systems, weak constraints, and compensating transactions
**Pages:** 607, 608, 609 · skill_worthiness: high

**Problem:** Strict uniqueness constraints require synchronous coordination (hurts performance/availability across regions). When can you avoid coordination?

**Content:** Two observations combine into a design strategy: (1) Dataflow systems can guarantee integrity of derived data WITHOUT atomic commit, linearizability, or synchronous cross-partition coordination — via representing each write as a single atomically-loggable message, deriving all state updates deterministically (like a stored procedure), carrying a client-generated request ID end-to-end for dedup/idempotence, and using immutable events that can be re-derived to recover from bugs. (2) Many real applications tolerate constraints that are temporarily violated and fixed later via a compensating transaction — an after-the-fact apology. Examples: two users grab the same username/seat -> apologize and ask one to pick another; overselling stock -> reorder, apologize, offer a discount; airlines overbook and hotels overbook deliberately, using refunds/upgrades to compensate; overdraft -> charge a fee and demand repayment. The apology's cost (money/reputation) is usually low and is a business decision. If acceptable, checking every constraint before writing is too strict and linearizable constraints are unnecessary. Result: coordination-avoiding data systems — strong integrity with only weak timeliness, deployable multi-datacenter/multi-leader with async cross-region replication, each DC operating independently. Frame coordination as a tradeoff: it reduces apologies from inconsistency but adds apologies from lost availability — aim for the optimal middle, not zero.

**Applicability:** Deciding which constraints truly need synchronous coordination vs which can be enforced loosely with compensation; designing geo-distributed multi-leader systems that stay available.

**Limits:** Genuinely irreversible actions (or where the apology cost is unacceptably high) still require synchronous coordination / strict constraints before the write. Weak-constraint apps still require integrity — you must not lose the booking or the money.

---

*14 KUs · chapter 12 · trust_tier 0 (machine-distilled, unreviewed).*
