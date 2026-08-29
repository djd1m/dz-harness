---
name: ddia-replication-topology-choice
description: >
  How COPIES of the SAME data propagate WRITES: single-leader vs multi-leader vs leaderless, sync vs
  async followers, failover, replication-lag anomalies (read-your-writes, monotonic reads), quorum
  w+r>n reads/writes, conflict resolution (LWW vs version vectors). Same-data redundancy ONLY — NOT
  splitting DIFFERENT data across shards (→ ddia-partitioning-strategy), NOT linearizability/consensus
  guarantees (→ ddia-distributed-consistency-consensus). Triggers (RU+EN): "топология репликации",
  "синхронная или асинхронная репликация", "один или несколько лидеров", "кворум w+r>n",
  "single vs multi-leader", "leaderless Dynamo-style", "quorum w+r>n", "read-your-writes",
  "replication lag", "LWW vs version vectors".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
---

# Replication topology choice — pick the write-propagation model, then live with its consistency bill

## Output
A design recommendation for replication: single vs multi-leader vs leaderless, sync/async followers,
failover, log method, read-consistency guarantees, and conflict resolution — the choices made, the
consistency bill accepted, and the гл.5 facts backing it — folded into the ADR or architecture step.

## When to use / NOT
- Use when: choosing between single-leader / multi-leader / leaderless; deciding synchronous
  vs asynchronous vs semi-synchronous followers; planning leader failover; picking a
  replication-log method (statement / WAL / logical / trigger); choosing read-consistency
  guarantees under replication lag; tuning leaderless quorums (n, w, r); or selecting a
  concurrent-write conflict-resolution strategy (LWW vs version vectors / CRDT).
- NOT for: how to split data across nodes for scale (that is sharding —
  **ddia-partitioning-strategy**); transaction isolation levels within one node
  (**ddia-transaction-isolation-choice**); the consensus algorithms behind linearizable
  systems (**ddia-distributed-consistency-consensus**).

## Decision criteria

### 1. Base topology — the load-bearing choice
| Option | Pick when | Cost / risk |
|--------|-----------|-------------|
| **Single-leader** | Default. Simple, no write conflicts; all writes route through one node | No writes while the leader is unreachable; needs failover |
| **Multi-leader** | Multiple datacenters, offline-capable clients, collaborative editing | Write conflicts you MUST resolve; rarely justified inside one DC |
| **Leaderless (Dynamo: Riak/Cassandra/Voldemort)** | Need high write availability + tolerate stale reads; no failover step | Weak guarantees — loses read-your-writes / monotonic / consistent-prefix; needs read-repair + anti-entropy |

Default to single-leader; only move to multi/leaderless when a concrete requirement
(geo-distribution, offline, always-writable) forces it. For multi-leader, prefer routing all
writes for a given entity through one designated leader to avoid conflicts [гл.5, с.204].

### 2. Synchronous vs asynchronous followers (single-leader)
| Mode | Guarantee | When |
|------|-----------|------|
| **Fully synchronous** | Up-to-date copy on the follower before ACK | Almost never all-followers: one stalled follower halts ALL writes |
| **Semi-synchronous** | Exactly one follower sync, rest async → fresh copy on ≥2 nodes | Good durability/availability balance; if the sync one lags, an async takes its role |
| **Fully asynchronous** | Leader ACKs immediately | Many / geographically-spread followers; accept losing un-replicated acked writes on leader loss |

### 3. Failover: manual vs automatic
Automatic failover = (1) detect (heartbeat timeout, e.g. 30s — no reliable detector),
(2) elect a new leader (majority vote / controller, prefer the most up-to-date replica),
(3) reconfigure so the old leader rejoins as a follower [гл.5, с.191-192]. Prefer **manual**
failover when the danger of getting it wrong outweighs downtime, because automatic failover
can: discard un-replicated async writes; hand out already-used auto-increment IDs that
desync external systems (GitHub MySQL↔Redis leak); or split-brain into two leaders (needs
STONITH, which can wrongly kill both) [гл.5, с.192-193]. Timeout is a tradeoff — long =
longer outage, short = spurious failovers under load spikes.

### 4. Replication-log method
| Method | Pick when | Avoid when |
|--------|-----------|------------|
| **Statement-based** | Compact SQL shipping | Nondeterminism (NOW/RAND), auto-increments, triggers, tx-ordering |
| **WAL shipping** | Same engine+version (PostgreSQL, Oracle) | Cross-version / zero-downtime upgrade — couples to storage format, needs downtime |
| **Logical (row-based)** | Cross-version/engine, zero-downtime upgrade, feeding CDC | — (generally the flexible default) |
| **Trigger-based (Databus, Bucardo)** | Need max flexibility / custom routing | It is the most fragile & highest-overhead option |

### 5. Read-consistency guarantees under lag (async read-scaling)
- **Read-your-writes:** read user-mutable data from the leader; for ~1 min after a write read
  everything from the leader; or serve from a replica no older than the write's logical
  timestamp [гл.5, с.197-198].
- **Monotonic reads:** pin each user to one replica (hash of user-id) so time never goes
  backward [гл.5, с.201].
- **Consistent-prefix reads:** put causally-related writes in one partition, or track
  dependencies explicitly, so an answer never appears before its question [гл.5, с.202].

### 6. Leaderless quorum tuning — `w + r > n`
Choose n odd (3/5), then w = r = ⌈(n+1)/2⌉ for the standard read-your-writes-ish quorum;
skew to w=n, r=1 for read-heavy workloads. See formulas below.

### 7. Concurrent-write conflict resolution
| Strategy | Pick when | Cost |
|----------|-----------|------|
| **LWW (last-write-wins by timestamp)** | Keys are write-once / immutable (Cassandra: UUID key per write) | SILENTLY drops data — unsafe if any loss is unacceptable |
| **Version numbers + siblings merge** | Mutable keys, single system | App-code merge of siblings; needs tombstones for deletes |
| **CRDTs** | Want automatic, correct merge | Restricted data types |
| **Version vectors** | Same, but across multiple replicas/leaders | More metadata to track |

## Key facts & formulas
- **Quorum condition:** `w + r > n` — write and read sets overlap in ≥1 node, so a read
  usually sees the latest value [гл.5, с.216-217].
- **Fault tolerance:** with quorums the cluster survives up to `n/2` node failures
  (n=5, w=3, r=3 → up to two unavailable) [гл.5, с.218].
- A quorum is NOT necessarily a majority — what matters is that read and write sets
  intersect [гл.5, с.218].
- **Semi-synchronous** = exactly one synchronous follower guarantees an up-to-date copy on
  at least two nodes [гл.5, с.188-189].
- **happens-before:** A happens-before B if B depends on A; if neither knows of the other
  they are concurrent — physical time is irrelevant [гл.5, с.223-224].
- Named techniques: read-repair + anti-entropy (leaderless convergence) [гл.5, с.206];
  STONITH (split-brain prevention) [гл.5, с.192]; version vectors (multi-replica) [гл.5, с.229].

## Anti-patterns
| Anti-pattern | Why it fails | Source page |
|--------------|--------------|-------------|
| All followers synchronous | One stalled/failed follower halts every write | [гл.5, с.189] |
| Trusting async single-leader for durability | Un-replicated acked writes lost on leader loss | [гл.5, с.189] |
| Automatic failover with reused IDs | Discarded auto-increments desync external stores (GitHub leak) | [гл.5, с.192] |
| Multi-leader inside one datacenter | Adds write conflicts with no benefit | [гл.5, с.204] |
| Statement-based log with nondeterminism | NOW/RAND/auto-inc/triggers replicate divergent state | [гл.5, с.194] |
| WAL shipping for cross-version upgrade | Couples to storage format → requires downtime | [гл.5, с.195] |
| Assuming `w+r>n` ⇒ always fresh | Stale reads still possible: sloppy quorum, concurrent/partial writes, stale-replica recovery — use transactions/consensus | [гл.5, с.218-220] |
| LWW on mutable keys | Silently discards data; Amazon "deleted items resurrect" | [гл.5, с.225, 227] |

## Related decisions
- Chose leaderless / multi-leader here → **ddia-transaction-isolation-choice**: quorums and
  conflict resolution give weaker-than-serializable guarantees; you cannot assume isolation.
- Need real linearizability / leader election / no split-brain → escalate from ad-hoc
  failover to **ddia-distributed-consistency-consensus**.
- Placing causally-related writes in one partition for consistent-prefix reads couples this
  to **ddia-partitioning-strategy** (partitioning is usually combined with replication:
  each partition's copies live on several nodes) [гл.6, с.240].

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 5 (+ врезка гл. 6
про сочетание секционирования с репликацией).
KUs consumed: `ddia-ch05-ku01` (sync-vs-async tradeoff-table), `ddia-ch05-ku02`
(failover decision-framework), `ddia-ch05-ku03` (replication-log method), `ddia-ch05-ku04`
(replication-lag guarantees), `ddia-ch05-ku05` (single/multi/leaderless topology),
`ddia-ch05-ku06` (quorum formula), `ddia-ch05-ku07` (concurrent-write resolution); plus the
cross-listed partitioning definitions `ddia-ch05-ku01`/`ddia-ch05-ku02` for the
Related-decisions link. Deep reference: references/knowledge-units.md.

Anchor quotes (verbatim, for human spot-check):
- «w + r > n» [гл.5, с.216].
- «выигрывает последний» (LWW) незаметно теряет данные [гл.5, с.225].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «проектирую репликацию — single или multi-leader?» → single-leader by default, multi-leader only for geo-distribution / offline / collaborative editing, cites гл.5.
- "choosing conflict resolution for a leaderless Dynamo-style store" → version vectors / CRDTs, warns that LWW-by-timestamp silently drops data.
- «синхронная или асинхронная репликация?» → semi-synchronous for the durability/availability balance; fully-sync halts all writes on one stalled follower.
