---
name: ddia-batch-and-stream-processing
description: >
  Choose a DATA-PIPELINE processing paradigm and its compute internals: batch (MapReduce/dataflow engines,
  Spark) vs stream (event logs, windowing, exactly-once), the join/aggregation algorithm, and the
  message-broker model (log vs queue). The processing-ENGINE / compute choice ONLY — NOT the org-level job
  of keeping many stores in sync via CDC (→ ddia-deriving-data-and-integration).
  Triggers (RU+EN): "пакетная или потоковая обработка", "batch vs stream", "какой join в Spark/Hadoop",
  "MapReduce или dataflow-движок", "лог-брокер или очередь", "временные окна / windowing",
  "exactly-once в потоке", "stream join", "Kafka vs RabbitMQ".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
---

# Batch & Stream Processing — pick the paradigm, the join, the engine, and the sync mechanism

## Output
A design recommendation for the pipeline: batch vs stream, the join algorithm, execution engine, broker
model, and derived-system sync mechanism — the options chosen, the tradeoffs accepted, and the гл.10–11
facts backing them — folded into the ADR or architecture step.

## When to use / NOT
- Use when: choosing **batch vs streaming**; picking a **batch join** (reduce-side vs map-side); choosing an **execution engine** (MapReduce vs Spark/Flink/Tez); deciding between an **MPP database and a Hadoop/data-lake** stack; running **offline graph algorithms**; classifying/choosing a **message broker** (log-based vs AMQP/JMS); keeping **derived systems in sync** (dual-write vs CDC vs event sourcing); choosing **time semantics and window types**; and delivering **exactly-once** under failure.
- NOT for: replication topology or read-your-writes staleness → `ddia-replication-topology-choice`; how to partition a keyspace for online serving → `ddia-partitioning-strategy`; the atomic-commit / isolation guarantees a stream sink needs → `ddia-transaction-isolation-choice`; consensus/fencing tokens for zombie writers → `ddia-distributed-consistency-consensus`; the umbrella "unbundle the database / dataflow" architecture → `ddia-deriving-data-and-integration`.

## Decision criteria

### 1. Batch vs stream (the root fork)
Batch assumes **bounded input**: size is known and finite, so the job can tell when reading is done — load-bearing for sort/shuffle, because the last record read could carry the smallest key and become the first output, so nothing can be emitted until all input is consumed [гл.10, с.505]. Real data is usually unbounded, so batch artificially slices it into fixed windows (per-day, per-hour). Tradeoff: a daily run reflects an input change a day later. Reduce that latency → run more often, or drop fixed windows and process events as they arrive → **stream processing** [гл.10, с.506].

| If… | Choose |
|-----|--------|
| Input is finite, latency of hours/day acceptable, need reprocessing of whole dataset | Batch |
| Input is continuous, need low end-to-end latency, want incremental output | Stream |

### 2. Batch aggregation: hash table vs sort
Working set = RAM for random access, depends only on **distinct keys**, not record count (a URL with a million hits is one entry) [гл.10, с.454].

| Condition | Strategy |
|-----------|----------|
| Distinct keys fit in RAM (Kleppmann: small/medium site ≈ 1 GB of URLs+counters) | In-memory **hash aggregation** — fast even on a laptop |
| Working set exceeds memory | **Sort**: sort chunks in RAM, spill sorted runs to disk, merge — sequential I/O (SSTable/LSM principle). GNU `sort` auto-spills and parallelizes; bottleneck = source read speed. This is why MapReduce always sorts between map and reduce |

### 3. Batch join algorithm (MapReduce/Hive/Pig/Spark) — no index, full scan
| Algorithm | Use when | Cost |
|-----------|----------|------|
| **Reduce-side sort-merge join** | No assumptions available about inputs; use secondary sort so the dimension record precedes events | Heavy sort + shuffle + possible disk spills |
| **Map-side broadcast hash join** | One input fits in memory; each mapper loads the whole small side into a hash table (or OS-page-cached on-disk index) | No reduce/sort. (Pig replicated join, Hive MapJoin, Impala) |
| **Map-side partitioned (bucketed) hash join** | Both inputs partitioned the same way (same key, hash fn, partition count) | Each mapper loads one partition of small side; needs prior jobs to co-partition |
| **Map-side merge join** | Inputs partitioned **and** sorted on the join key | Merge-scan both sides, no in-memory requirement |

Getting partitioning/sort wrong **silently breaks** map-side joins — the optimizer needs metadata (HCatalog/Hive metastore) [гл.10, с.467-473].

### 4. Skew / hot keys in batch
A job finishes only when its slowest reducer finishes, so one hot key = a straggler. Techniques: Pig **skewed join** (samples input, spreads a hot key across several random reducers, replicates the other side to all of them); Crunch **sharded join** (same, hot keys specified explicitly); Hive **skew join** (hot keys declared, joined map-side); **two-stage grouping** (stage 1 partial-aggregate on random reducers, stage 2 combine partials) [гл.10, с.469-470].

### 5. Execution engine: MapReduce materialization vs dataflow (Spark/Flink/Tez)
| Dimension | MapReduce chain | Dataflow engine |
|-----------|-----------------|-----------------|
| Intermediate state | Materialized to HDFS (replicated) between every job | Kept in memory / local disk; passed via shared buffers |
| Start timing | Next job starts only after ALL predecessor tasks finish | Operators start as inputs become ready |
| Redundant work | Mappers often just re-read+repartition reducer output | Sort only where needed; no redundant map stages |
| Fault recovery | Re-read durable HDFS input, restart failed task | **Recompute** lost state from lineage/checkpoints → requires **deterministic** operators |
| Best when | Preemption common; intermediate ≪ recompute cost | Multi-stage pipelines (50-100 jobs); low latency |

Recompute-on-failure is not always cheaper: if intermediates are much smaller than source or compute is CPU-heavy, materializing to files wins [гл.10, с.483-487].

### 6. Hadoop/data-lake vs MPP database
- **MPP DB**: schema-on-write, up-front modeling, proprietary storage, excellent for its SQL query types + BI tools; slower ingestion.
- **Hadoop/HDFS**: schema-on-read ("data lake", "raw is better than cooked"), storage + processing-model diversity (SQL, ML, image, arbitrary code), one cluster many engines; interpretation cost pushed to consumers. Hadoop often the ETL feeding an MPP warehouse. Categories are converging [гл.10, с.478-480].

### 7. Offline graph processing
| Situation | Choose |
|-----------|--------|
| Graph fits in one machine's memory | Single-machine (even single-threaded) — usually beats distributed |
| Fits on one machine's disk | Single-machine engine (GraphChi) |
| Exceeds one machine | Distributed **Pregel/BSP** (Giraph, GraphX, Gelly) — vertices keep state across iterations, idle regions do no work |

Plain MapReduce can't "repeat until converged" — you wrap it in an external scheduler loop that re-reads and rewrites the whole graph every iteration (inefficient). Distributed graph jobs suffer heavy cross-machine message traffic (messages often larger than the graph) [гл.10, с.488-491].

### 8. Message broker: log-based vs traditional
| | AMQP/JMS (RabbitMQ/ActiveMQ) | Log-based (Kafka/Kinesis/DistributedLog) |
|--|------------------------------|-------------------------------------------|
| Delivery | Broker hands out individual messages; ack → destructive delete | Partitioned log; consumer assigned whole partitions; monotonic **offset** |
| Ordering | Load-balancing + redelivery breaks order | Ordered within a partition |
| Parallelism | One message → one consumer (great for heavy per-message work) | Consumers per topic ≤ partitions; slow message = head-of-line blocking |
| Replay | No (consumed = gone) | Yes — non-destructive reads |
| **Pick when** | Expensive per-message processing, order unimportant | High throughput, fast processing, order matters, need history replay |

Consumer offset ≈ transaction log sequence number in single-leader replication (broker = leader, consumer = follower) [гл.11, с.515-517].

Classify any broker by two questions: **(a) overflow** → drop / buffer / backpressure (Unix pipes & TCP use backpressure); **(b) node failure** → messages lost? Durability via disk/replication costs throughput+latency. Loss tolerance is app-specific — a dropped sensor sample is fine, a dropped counter event corrupts the count [гл.11, с.508].

### 9. Keeping derived systems in sync
**Dual-write is an anti-pattern**: (1) race condition — concurrent X=A / X=B land in different final order in DB vs index, silent divergence; (2) partial failure — one write succeeds, the other fails, needing costly 2PC for atomicity. **Solution — one leader + extract the change stream**:
- **CDC (Change Data Capture)**: watch the source DB's writes, stream them to derived systems (index, cache, warehouse) as followers. Implement via triggers (fragile, costly) or **replication-log/WAL parsing** (robust; schema-change tracking is the hard part). Asynchronous → replication lag. Recover from a snapshot tied to a log offset, then apply changes. **Log compaction** keeps only the latest record per key (nil = tombstone) → log size tracks current DB content, giving a full copy without a separate snapshot [гл.11, с.520-524].
- **Event sourcing**: store state changes as immutable, append-only **events at the application/action level** (preserves intent, e.g. "student cancelled enrolment") vs CDC's low-level row deltas. No compaction (later events don't overwrite earlier). A **command** may be rejected on integrity violation (validation must be synchronous, often a serializable txn); once accepted it becomes an immutable **event** a consumer cannot reject. Undo = compensating event. "Truth is the log; the DB is a cache of a subset" (Helland). Splitting write-log from read-views = **CQRS** [гл.11, с.525-530].

### 10. Stream time semantics
Prefer **event time** (timestamp in the event) over **processing time** (local clock): after a consumer restart, backlogged events processed at once look like a bogus traffic spike though the real rate never changed [гл.11, с.539]. With untrusted device clocks (offline buffering), log **three timestamps**: (1) event time by device clock, (2) send time by device clock, (3) receive time by server clock; offset = (3)−(2), apply to (1) to estimate true event time [гл.11, с.542]. Stragglers after a window closes: ignore them (track dropped fraction as a metric) or publish a correction.

**Window types:**
| Window | Shape |
|--------|-------|
| Tumbling (падающее) | Fixed length, each event in exactly one window (round timestamp to boundary) |
| Hopping (прыгающее) | Fixed length, overlapping (union of tumbling windows) — smoothing |
| Sliding (скользящее) | All events within an interval of each other; buffer sorted by time, drop expired |
| Session (сессионное) | No fixed length; groups one user's nearby events, closes after inactivity (e.g. 30 min) |

### 11. Stream joins (order matters, not guaranteed → non-deterministic)
| Join | Inputs | Mechanism |
|------|--------|-----------|
| **Stream-stream** (window join) | Two event streams | Stateful index of events per key within a window; each event probes both indexes |
| **Stream-table** (enrichment) | Activity stream + DB changelog | Local copy (in-mem hash / on-disk index) kept fresh by subscribing to CDC; local lookup per event (remote lookups too slow) |
| **Table-table** (materialized view) | Two DB changelogs | Each change joined to the other table's current state; output = changelog of the view (e.g. Twitter feed cache) |

**Slowly changing dimension (SCD)**: joins against changing state are non-deterministic on replay; give each record version a **unique version ID** (e.g. the tax-rate ID at sale time) to make joins deterministic — but this forbids log compaction (must keep all versions) [гл.11, с.543-547].

### 12. Exactly-once ("appears exactly once") under failure
Batch's "discard failed output and rerun" doesn't apply to an infinite stream. Mechanisms:
- **Micro-batching** (Spark Streaming): split into ~1 s blocks, each a mini-batch (implicit tumbling window). Smaller = more scheduling overhead, larger = more latency.
- **Checkpointing** (Flink): periodic state snapshots to durable storage, triggered by barriers; restart from last checkpoint.
- Both give exactly-once **inside** the processor but not for external side effects (DB write, email, broker message) — those repeat on restart.
- **Atomic commit**: fold all effects (downstream messages, DB writes, state changes, offset increment) into one all-or-nothing commit (in-system, no heterogeneous XA — Dataflow, VoltDB, planned Kafka).
- **Idempotence**: fixed-value-by-key write is idempotent, counter increment is not; make non-idempotent ops idempotent by storing the last processed **offset** externally. Requires replay of the same messages in the same order (log broker), deterministic processing, no concurrent writer of the same value; suspected zombie → needs **fencing** [гл.11, с.548-550].

## Key facts & formulas
- **Working set = f(distinct keys)**, not total record count [гл.10, с.454].
- In-memory aggregation feasible ≈ up to **1 GB** working set on modest hardware (illustrative for small/medium sites) [гл.10, с.454].
- **# map tasks = # input blocks; # reduce tasks = chosen by job author** [гл.10, с.463].
- The map→reduce **shuffle** = partition-by-reducer + sort + copy to reducers [гл.10, с.463].
- Google: a 1-hour MapReduce task has ≈ **5% chance of preemption** — >10× the hardware/reboot failure rate; a job of 100 tasks × 10 min has **>50%** chance at least one is preempted [гл.10, с.482].
- Dataflow recompute-on-failure **requires deterministic operators** (fix random seeds; avoid hash-iteration order, system clocks, external sources) [гл.10, с.487].
- **Consumers per Kafka topic ≤ number of partitions** [гл.11, с.516].
- Three-timestamp clock-skew correction: **offset = server_receive − device_send; true_event ≈ device_event + offset** [гл.11, с.542].
- **State = integral of the event stream over time; change stream = derivative of state** [гл.11, с.529].
- **Log compaction** keeps only the latest value per key (nil = tombstone) → log size ∝ current DB content, not write history [гл.11, с.524].

## Anti-patterns
| Anti-pattern | Failure mode | Source KU |
|--------------|--------------|-----------|
| In-memory aggregation with high-cardinality keys | Working set blows RAM even on small data | ch10-ku01 |
| Emitting batch output before full input read (sort jobs) | Last record may carry smallest key → wrong first output | ch10-ku01 |
| Map-side join with mismatched partitioning/sort | **Silently** wrong results, no error | ch10-ku03 |
| Ignoring hot keys in a join/group-by | One straggler reducer stalls the whole job | ch10-ku04 |
| MapReduce materialization when preemption is rare | Replicated HDFS intermediates = wasted I/O; dataflow faster | ch10-ku05, ch10-ku06 |
| Non-deterministic operators in a recompute engine | Cascading recomputation forces restarting downstream operators | ch10-ku06 |
| Distributed graph job when graph fits one machine | Cross-machine messages larger than the graph; single-machine wins | ch10-ku08 |
| Dual-write across systems | Race condition + partial-failure divergence, undetectable without version vectors/2PC | ch11-ku03 |
| CDC via triggers, or parsing a log across schema migrations | Fragile/costly; migration breaks the parser | ch11-ku03 |
| Log compaction on event-sourced / versioned data | Overwrites needed history — event sourcing & SCD forbid it | ch11-ku04, ch11-ku07 |
| Processing time for windowed metrics | Consumer restart → phantom traffic spike | ch11-ku05 |
| Assuming external side effects are exactly-once | DB write/email/message duplicated on restart | ch11-ku08 |
| Idempotence without fencing under a zombie node | Concurrent writer corrupts the "idempotent" value | ch11-ku08 |

## Related decisions
- Chose a **stream sink that writes to a DB and needs all effects atomic** → `ddia-transaction-isolation-choice`: exactly-once here leans on atomic commit / serializable command validation.
- Chose **idempotence + offsets against a suspected zombie** → `ddia-distributed-consistency-consensus`: needs a fencing token, which is a consensus/lease problem, not a stream problem.
- Chose **CDC/event-sourcing to sync derived systems** → `ddia-deriving-data-and-integration`: this is the local decision; the system-wide "unbundled database / dataflow" architecture lives there.
- Chose **log-based broker with partition ordering** → `ddia-partitioning-strategy`: consumer parallelism is capped by your partition count and hot partitions become head-of-line blockers.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), главы 10–11.
KUs: ddia-ch10-ku01 (×2), ddia-ch10-ku02, ddia-ch10-ku03, ddia-ch10-ku04, ddia-ch10-ku05, ddia-ch10-ku06, ddia-ch10-ku07, ddia-ch10-ku08, ddia-ch11-ku01, ddia-ch11-ku02, ddia-ch11-ku03, ddia-ch11-ku04, ddia-ch11-ku05, ddia-ch11-ku06, ddia-ch11-ku07, ddia-ch11-ku08. Deep reference: references/knowledge-units.md.
- "raw data is better than cooked" (schema-on-read, data lake) [гл.10, с.479].
- "truth is the log; the database is a cache of a subset of the log" [гл.11, с.529].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «batch или stream для near-real-time метрик?» → stream when low end-to-end latency + incremental output are needed, batch for bounded whole-dataset reprocessing, cites гл.10.
- "Kafka vs RabbitMQ for the event bus" → log-based broker when ordering + replay matter, AMQP/JMS for expensive unordered per-message work.
- «CDC или двойная запись для синка индекса с БД?» → CDC (one leader + change stream), flags dual-write's race + partial-failure divergence.
