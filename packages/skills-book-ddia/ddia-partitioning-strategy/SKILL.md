---
name: ddia-partitioning-strategy
description: >
  SHARD one dataset across nodes so no single node holds it all: range vs hash partition keys,
  secondary-index partitioning (local/document vs global/term), rebalancing as the cluster grows,
  hot-spot avoidance, request routing to the right node. Splitting DIFFERENT data across shards ONLY —
  NOT copying the SAME data to replicas (→ ddia-replication-topology-choice).
  Triggers (RU+EN): "как секционировать", "выбор ключа секционирования", "range vs hash sharding",
  "горячая точка / hot spot", "ребалансировка партиций", "секционирование вторичных индексов",
  "request routing", "consistent hashing", "partition key choice".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
---

# Partitioning strategy — how to split data across nodes without creating hot spots or a rebalancing nightmare

## Output
A design recommendation for partitioning: range vs hash vs compound key, the secondary-index scheme,
the rebalancing approach, and request routing — with the hot-spot tradeoffs and гл.6 facts backing it
— folded into the ADR or architecture step.

## When to use / NOT
- Use when: choosing a partition key scheme (range vs hash vs hybrid) for a key-value or wide-column store; diagnosing a saturated node while others idle; relieving a single hot key; deciding how to partition a secondary index; picking a rebalancing approach when scaling the cluster; designing how clients route requests to the owning node.
- NOT for: choosing how many copies of the data to keep and where leaders live — that is `ddia-replication-topology-choice`. Partitioning and replication are orthogonal and usually combined; decide replication separately.

## Decision criteria

### 1. Partition key scheme (KU01, KU02)
| Scheme | Pick when | Cost / risk |
|--------|-----------|-------------|
| **Range** (contiguous key ranges, kept sorted) | You need efficient range scans; key acts as concatenated index (Bigtable, HBase, RethinkDB, MongoDB ≤2.4) | Sequential keys (e.g. timestamp-first) create hot spots — all of today's writes hit one partition |
| **Hash** (hash the key, assign hash ranges) | You want uniform load distribution across partitions | Destroys key ordering → range queries become inefficient (scatter to all partitions; Riak/Couchbase/Voldemort drop PK range queries) |
| **Hybrid / compound key** (Cassandra: hash first column, remaining columns sorted) | You want even spread across a high-cardinality first column AND range scans within it | Range scans only work once the first column is pinned to a value |

Rule of thumb: **need range scans → range or compound; need pure even load → hash.** If timestamps are involved, do NOT put the timestamp first — prefix it with another field (e.g. sensor name) so writes spread by prefix first, then time (KU02).

### 2. Hot spots
- A partition with disproportionate load is a **hot spot**; the underlying imbalance is **skew** (KU02).
- Random assignment spreads load but forces every read to fan out to all nodes → rarely acceptable (KU02).
- **Single hot key** (celebrity ID): hashing does NOT help because identical keys hash identically. Manually split by appending a small random number — a two-digit suffix spreads one key over 100 keys / many partitions. Only worth it for a few known-hot keys; the app must track which keys were split and combine them on read (KU03).

### 3. Secondary index partitioning (KU04)
| Approach | Reads | Writes | Use / systems |
|----------|-------|--------|---------------|
| **Document-based (local index)** — each partition indexes only its own docs | Scatter/gather across ALL partitions → inflated tail latency | Touch only the one partition holding the doc | Default choice; MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB |
| **Term-based (global index)** — one index partitioned by the term (or term hash) | Hit only the single partition holding the term → fast | Slower/complex: one doc write may touch several index partitions; updates usually async | Read-heavy filtering; DynamoDB global indexes, Riak search, Oracle DW |

Pick term-based when reads dominate and you can tolerate brief staleness; document-based when writes dominate or you avoid multi-filter queries. Partition the global index **by term for range scans, by term-hash for even load** (KU04).

### 4. Rebalancing (KU05, KU06)
| Strategy | How | Trade-off |
|----------|-----|-----------|
| **hash mod N** | key → hash(key) mod N | ANTI-PATTERN: changing N moves most keys. Avoid. |
| **Fixed number of partitions** | Many more partitions than nodes; move whole partitions on scale (Riak, ES, Couchbase, Voldemort) | Simple; but partition count is fixed at setup and caps max nodes — hard to size under variable dataset size |
| **Dynamic partitioning** | Split above a size threshold (HBase 10 GB), merge below; count adapts (HBase, RethinkDB) | Adapts to volume; but empty DB starts as one partition (cold start) unless pre-split |
| **Proportional to nodes** | Fixed partitions per node (Cassandra 256); new node splits random existing partitions | Partition size stays constant as data+nodes grow; requires hash partitioning |

Any scheme must meet three requirements: (1) even load after rebalancing, (2) DB keeps serving reads/writes during it, (3) move only the necessary data (KU06).

**Automation level:** keep a human in the loop. Fully-automatic rebalancing combined with automatic failure detection is dangerous — a slow overloaded node gets declared dead, rebalancing shifts MORE load onto it and the network, risking cascading failure. Prefer confirmation-gated (Couchbase/Riak/Voldemort auto-generate the plan, admin applies it) (KU06).

### 5. Request routing / service discovery (KU07)
Three approaches: (1) client contacts any node, which forwards if it doesn't own the partition; (2) a partition-aware routing tier forwards; (3) partition-aware clients connect directly. The hard part in all three is learning placement changes — needs consensus or requests misroute. Common: **ZooKeeper** holds the authoritative partition→node map, subscribers get updates (HBase, SolrCloud, Kafka, LinkedIn Espresso/Helix; MongoDB uses config servers + mongos). Alternative: **gossip protocol** among nodes, no external coordinator (Cassandra, Riak) at the cost of more complex nodes.

## Key facts & formulas
- A 32-bit hash maps any string uniformly to `0..2^32-1` [гл.6, с.244]. Cassandra/MongoDB use MD5; Voldemort uses Fowler-Noll-Vo [гл.6, с.244].
- `hash(key) mod N` reassigns most keys when N changes → avoid for node placement [гл.6, с.251].
- HBase splits a partition at a default **10 GB** threshold [гл.6, с.253].
- Cassandra default **256** partitions per node [гл.6, с.254].
- A two-digit decimal suffix splits one hot key across **100** keys [гл.6, с.246].
- Rebalancing requirements: even load, stay available, move minimal data [гл.6, с.250].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|--------------|--------------|--------|
| `hash(key) mod N` for node assignment | Changing N moves most keys, huge data churn | KU05 |
| Language built-in hashes (`Object.hashCode()`, `Object#hash`) | May hash the same key differently across processes | KU01 |
| Timestamp-first partition key | All current writes hit one partition (range hot spot) | KU02 |
| Expecting hashing to fix a single hot key | Identical keys hash identically — still one partition | KU03 |
| Prefix-splitting when only one prefix value is active | Spread only works when many prefixes write concurrently | KU02 |
| Random record assignment | Even load, but every read must fan out to all nodes | KU02 |
| Fully automatic rebalancing + automatic failure detection | Slow node declared dead → rebalancing overloads it → cascading failure | KU06 |
| Dynamic partitioning without pre-split | Empty DB = one partition, one node busy while rest idle | KU05 |

## Related decisions
- Chose leaderless/quorum replication over these partitions → `ddia-replication-topology-choice` (decide replication independently of partitioning).
- Term-based global index updates asynchronously → `ddia-transaction-isolation-choice`: reads shortly after a write may be stale; a distributed transaction across index partitions would be needed for atomicity.
- Coordination via ZooKeeper for routing → `ddia-distributed-consistency-consensus`: the partition→node map is a consensus problem.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 6.
KUs: ddia-ch06-ku01, ddia-ch06-ku02, ddia-ch06-ku03, ddia-ch06-ku04, ddia-ch06-ku05, ddia-ch06-ku06, ddia-ch06-ku07. Deep reference: references/knowledge-units.md.
- Range hot-spot anchor: timestamp key routes all of today's writes to one partition [гл.6, с.242].
- Rebalancing anchor: move only the necessary amount of data between nodes [гл.6, с.250].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «range или hash секционирование для 10-узлового кластера?» → hash for even load, range/compound key when range scans are needed, cites гл.6.
- "a hot spot on a single celebrity key" → append a random suffix to split it across partitions; hashing alone won't help since identical keys hash identically.
- «локальный или глобальный вторичный индекс?» → term-based (global) when reads dominate + brief staleness is OK, document-based (local) when writes dominate.
