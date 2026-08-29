---
name: ddia-deriving-data-and-integration
description: >
  Keep the SAME data consistent across MANY specialized stores (DB + search index + cache + warehouse +
  ML feature store): systems-of-record vs derived data, change-data-capture (CDC), the end-to-end argument,
  unbundling the database, dual-writes problem, async event-log integration and constraint checking. The
  multi-store INTEGRATION / dataflow-of-record layer ONLY — NOT the batch/stream compute engine itself
  (→ ddia-batch-and-stream-processing), NOT single distributed-txn consensus mechanics
  (→ ddia-distributed-consistency-consensus). Triggers (RU+EN): "синхронизация индекса с БД",
  "система-источник vs производные данные", "CDC vs 2PC", "unbundling the database", "change data capture",
  "systems of record vs derived", "end-to-end argument", "dual writes problem".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
---

# Deriving Data & Integrating Systems — how to keep many stores consistent without distributed transactions

## Output
A design recommendation for cross-store integration: distributed transaction vs log-based derived data,
where to enforce constraints, and how much coordination to pay — with the timeliness-vs-integrity
tradeoff and гл.12 facts backing it — folded into the ADR or architecture step.

## When to use / NOT
- Use when: choosing an integration strategy across heterogeneous stores (DB↔search index↔cache↔warehouse↔ML); deciding between XA/2PC and a log + idempotent consumers; placing the write-path/read-path (precompute) boundary; making a non-idempotent operation exactly-once; enforcing uniqueness / cross-partition constraints at scale; deciding which constraints truly need synchronous coordination vs compensation; designing auditable/tamper-evident dataflow.
- NOT for: choosing single-leader vs multi-leader vs leaderless replication mechanics → `ddia-replication-topology-choice`; choosing an isolation level (snapshot, serializable) inside one store → `ddia-transaction-isolation-choice`; single-object linearizability/consensus internals → `ddia-distributed-consistency-consensus`; how to shard by key/range/hash → `ddia-partitioning-strategy`; the batch-vs-stream compute engine itself → `ddia-batch-and-stream-processing`.

## Decision criteria

### 1. Integration mechanism: distributed transaction vs log-based derived data
When the SAME data must stay consistent across stores maintained by different teams/technologies:

| Axis | Distributed txn (2PC/XA) | Log-based derived data (CDC / event sourcing) |
|------|--------------------------|-----------------------------------------------|
| Ordering of writes | mutual-exclusion locks (2PL) | the ordered event log |
| Exactly-once | atomic commit | deterministic retries + idempotence |
| Read-your-writes | yes (linearizable) | no default timeliness (async) |
| Fault behavior | any participant failure aborts → failures amplify across systems | fault stays local; log buffers, slow consumer catches up without blocking others |
| Geo-distribution | usually single-datacenter only | works across DCs |
| Coupling | tight | loose — components/teams evolve independently |

Default (Kleppmann): absent a widely-supported good distributed-transaction protocol, **log-based derived data is the most promising integration approach** when data crosses a boundary between technologies written by different teams. Keep distributed transactions for INSIDE a single storage/stream-processing system where they are cheap. [гл.12, с.566-567,571]

### 2. Can you assume a single global event order?
A totally-ordered log needs all events through one leader. It BREAKS in four cases — if any apply, do NOT assume a global order:
1. Throughput exceeds one machine → log must be partitioned → cross-partition order undefined.
2. Geographically separate datacenters each run their own leader → cross-DC order undefined.
3. Microservices with separate per-service durable storage → cross-service order undefined.
4. Offline-capable clients apply updates locally → clients and servers see different orders.

Fallbacks: route all updates for one object ID to one log partition (per-object total order); use logical timestamps (receivers must then handle out-of-order events); log the state a user saw, give it an ID, and have later events reference that ID to preserve causality. For concurrent events with no causal link, missing order is harmless. [гл.12, с.567-569]

### 3. Combining tools: federated (unified read) vs unbundled (unified write)
- **Federated / polystore** — one query interface over many engines (e.g. PostgreSQL foreign data wrapper). Relational tradition; solves READING, not write sync; complex implementation.
- **Unbundled database** — unified WRITE: reliably sync writes across stores by unbundling index maintenance (CDC → event log → idempotent consumers). Unix tradition; write sync is the harder problem; the big win is loose coupling.
Prefer an asynchronous event log with idempotent writes over distributed transactions when data crosses technology boundaries. But: if ONE integrated product meets all your needs, it gives better, more predictable performance — unbundling only pays off when no single product suffices (else it's premature optimization). [гл.12, с.576-580]

### 4. Where to put the precompute boundary (write path vs read path)
Indexes, caches, materialized views don't create new work — they SHIFT the write/read boundary:
- Write path = eager: on write, flow through batch/stream processing to update derived datasets, whether or not anyone queries.
- Read path = lazy: extra processing at query time.
- A derived dataset is the meeting point. No index → zero write work, full scan at read. Precompute ALL queries → trivial read, unbounded write (infeasible). Precompute common queries → a materialized view / "standard-query cache" (must be refreshed).
- Boundary can differ per case (Twitter: precompute normal-user timelines, query-time merge for celebrities) and can extend to the end user's device (push via SSE/WebSocket prolongs the write path to the UI; offline client = a cache of server state). [гл.12, с.588-591]

### 5. Exactly-once across network hops (end-to-end argument)
Duplicate suppression can only be implemented correctly with knowledge at the application ENDPOINTS — the network alone (TCP dedup, stream-processor exactly-once) cannot stop a user re-submitting a timed-out POST. Fix: generate a unique operation ID (UUID or hash of the form fields) IN THE CLIENT, carry it end-to-end to the DB, and enforce a UNIQUE constraint on request_id. Relational DBs enforce uniqueness even at weak isolation (unlike app-level check-then-insert, which fails under non-serializable isolation via write skew/phantoms). The requests table doubles as an event-sourcing log — balance updates become derivable/redundant. [гл.12, с.596-600]

### 6. Constraints at scale WITHOUT atomic commit
- **Uniqueness**: partition the log by the value that must be unique (hash of username/request ID) so all conflicting requests land in one partition; a single stream processor consumes it sequentially, keeps a local DB of taken values, emits accept/reject; client watches the output stream. Equivalent to a linearizable store via total order broadcast; scale by adding partitions. Generalizes: route all conflicting writes to one partition, process sequentially with arbitrary logic. [гл.12, с.602-604]
- **Multi-partition (e.g. transfer)**: (1) client gives request a unique ID; log it as ONE atomic message in a partition keyed by that ID (single-object writes are atomic almost everywhere). (2) A stream processor emits a debit (partitioned by payer) + credit (partitioned by payee), each carrying the request ID. (3) Downstream applies changes, deduping by request ID. Crash/reprocess deterministically regenerates identical instructions → downstream dedup keeps it exactly-once. Same correctness as atomic commit, survivable, higher-throughput. [гл.12, с.602-604]

### 7. How much coordination to pay for — timeliness vs integrity
Decompose "consistency" into two separable requirements:
- **Timeliness** — users see the current state; a stale read is temporarily out of order and SELF-HEALS by waiting/retrying. Linearizability (CAP-consistency) or weaker read-your-writes achieve it.
- **Integrity** — no corruption: no lost/contradictory/false data; a derived dataset must correctly reflect its source. Integrity violations are PERMANENT — waiting won't fix a corrupt DB; you need explicit checking and repair.

In most applications integrity matters far more than timeliness (a card transaction invisible for 24h is fine; a wrong balance or money debited-but-not-received is catastrophic). ACID couples both, hiding the distinction; event-based dataflow decouples them — async processing gives no default timeliness but preserves integrity. **Async constraint checking**: use end-to-end operation IDs for idempotence + check constraints asynchronously; the client either waits for the check or proceeds optimistically and apologizes/compensates on violation. [гл.12, с.604-606,627-628]

### 8. When you can AVOID coordination (compensating transactions)
Many real apps tolerate temporarily-violated constraints fixed later by a **compensating transaction** (an after-the-fact apology): two users grab the same seat/username → ask one to repick; oversold stock → reorder + discount; airline/hotel overbooking → refund/upgrade; overdraft → fee + repayment. If the apology's cost (money/reputation, a business decision) is acceptable, checking every constraint before the write is too strict and linearizable constraints are unnecessary → build **coordination-avoiding data systems**: strong integrity, weak timeliness, deployable multi-DC/multi-leader with async cross-region replication, each DC independent. Frame coordination as a tradeoff: it reduces apologies from inconsistency but adds apologies from lost availability — aim for the optimal middle, not zero. [гл.12, с.607-609]

## Key facts & formulas
- Log-based exactly-once = **deterministic retries + idempotence**; XA exactly-once = **atomic commit**. [гл.12, с.566-567]
- Deciding a single total order = **total order broadcast = consensus**; most consensus algorithms assume one node handles full throughput and offer no way to shard ordering — scaling it beyond single-node / for geo-distribution is an **open research problem**. [гл.12, с.567-569]
- **End-to-end argument** (Saltzer, Reed, Clark, 1984): duplicate suppression is correct only with application-endpoint knowledge; lower layers merely reduce the probability of higher-level problems. [гл.12, с.596-600]
- Enforce exactly-once via a **UNIQUE constraint on request_id**, ID generated client-side and carried end-to-end. [гл.12, с.598-599]
- Uniqueness at scale = partition the log by the unique value + one sequential stream processor per partition = a **linearizable store via total order broadcast**. [гл.12, с.602-604]
- Violating timeliness = "consistency sometimes" (self-heals); violating **integrity = "perpetual inconsistency"** (permanent, needs repair). [гл.12, с.604-606]
- Integrity techniques: continuous background read/compare/rewrite against replicas to counter silent bit-rot (HDFS, Amazon S3); periodically restore backups to confirm they aren't corrupt; prefer **end-to-end integrity checks** over per-component (a whole-pipeline check implicitly exercises every disk/network/service on the path). [гл.12, с.611-613]
- **Merkle trees** — trees of hashes proving a record is in a dataset without rehashing the whole set; underpin cryptocurrencies and **certificate transparency** for TLS/SSL certs. Proof-of-work (Bitcoin mining) judged extraordinarily wasteful; the integrity-checking ideas are worth adopting. [гл.12, с.614]

## Anti-patterns

| Anti-pattern | Why it fails | Source |
|--------------|--------------|--------|
| Reaching for XA/2PC to integrate stores across teams/technologies | poor fault-tolerance & performance; aborts on any participant failure so faults amplify; usually single-DC only | ku01 [с.566-567,571] |
| Assuming a single global event order in a partitioned / multi-DC / microservices / offline-client system | no defined cross-partition order → lost causal dependencies (unfriend-then-message bugs) | ku02 [с.567-569] |
| Precomputing results for ALL possible queries | unbounded/infinite write cost; query space grows exponentially with terms | ku04 [с.588-591] |
| Relying on TCP dedup or stream-processor "exactly-once" to stop duplicate user submissions | those only dedup within one connection / at message level — user re-submit still double-executes | ku05 [с.596-600] |
| App-level check-then-insert for uniqueness | fails under non-serializable isolation via write skew/phantoms — use a DB UNIQUE constraint | ku05 [с.598-599] |
| Unbundling into many stores when one product would suffice | operational complexity per product; integrated product gives better, predictable performance — premature optimization | ku03 [с.580] |
| Synchronous constraint checking / linearizable constraints when a cheap apology exists | needless coordination cost & lost availability; compensation is often the right business tradeoff | ku08 [с.607-609] |
| Uniqueness partitioning with async multi-leader replication | concurrent leaders could each accept conflicting writes → constraint broken | ku06 [с.602-604] |
| Treating collected personal data purely as an asset, retaining forever | data is a toxic asset / target; delete when no longer needed; deletion conflicts with immutability — plan expiry | ku06-liability [с.623-626] |
| Blindly trusting ACID/backups; shipping recommender without systems-thinking review | silent corruption propagates undetected; self-reinforcing feedback loops amplify bias/inequity | ku01-audit [с.611-613], ku05-loops [с.617-619] |

## Related decisions
- Chose leaderless/multi-leader + coordination-avoidance here → `ddia-transaction-isolation-choice`: you cannot then assume serializable cross-partition constraints; enforce them via partitioned logs + compensation.
- Partitioned the event log for throughput/uniqueness → `ddia-partitioning-strategy`: the partition key (hash of the unique value / object ID) is the same choice that determines per-object total order.
- Depend on total order broadcast for uniqueness → `ddia-distributed-consistency-consensus`: this IS consensus, and it caps you at single-node ordering throughput.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 12.
KUs: ddia-ch12-ku01, ddia-ch12-ku02, ddia-ch12-ku03, ddia-ch12-ku04, ddia-ch12-ku05, ddia-ch12-ku06, ddia-ch12-ku07, ddia-ch12-ku08. Deep reference: references/knowledge-units.md.
Anchors (verbatim, ≤15 words): "violating timeliness = 'consistency sometimes'; violating integrity = 'perpetual inconsistency'" [гл.12, с.605]; "log-based derived data is the most promising integration approach" [гл.12, с.571].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «CDC vs 2PC для синхронизации DB + search index + cache?» → log-based derived data by default when data crosses team/technology boundaries, cites гл.12.
- "enforcing unique usernames at scale without atomic commit" → partition the log by the unique value + one sequential stream processor per partition.
- «нужна ли синхронная проверка ограничения?» → a compensating transaction if the apology cost is acceptable → coordination-avoiding design.
