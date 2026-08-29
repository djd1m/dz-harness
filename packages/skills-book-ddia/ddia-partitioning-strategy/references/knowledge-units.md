# Knowledge Units — ddia-partitioning-strategy

Source: «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 6.
Machine-distilled, unreviewed (trust_tier 0). 7 KUs.

---

## KU01 — Range partitioning vs hash partitioning of a key-value dataset
- **type:** tradeoff-table
- **pages:** 242, 243, 244, 245

**Problem:** Choosing how to assign key-value records to partitions so data and query load spread evenly while still supporting the query patterns you need.

**Content:** Two primary schemes.
- **RANGE PARTITIONING:** each partition owns a contiguous range of key values (min..max), like volumes of a paper encyclopedia; boundaries need not be equal-sized and must be chosen to fit the data distribution so partitions stay balanced. Keys can be kept sorted within a partition (SSTables/LSM-trees), enabling efficient range scans and treating the key as a concatenated index. Used by Bigtable, HBase, RethinkDB, and MongoDB up to 2.4. Weakness: sequential access patterns cause hot spots — e.g. a timestamp key routes all of today's writes to a single partition.
- **HASH PARTITIONING:** apply a hash function to the key and assign each partition a range of hash values; a good hash turns skewed input into a uniform distribution (e.g. a 32-bit hash maps any string to 0..2^32-1). Hash need not be cryptographic — Cassandra and MongoDB use MD5, Voldemort uses Fowler-Noll-Vo. Distributes load evenly but destroys key ordering, so range queries become inefficient (MongoDB hash sharding sends range queries to all partitions; Riak, Couchbase, Voldemort don't support primary-key range queries).
- **HYBRID (Cassandra compound primary key):** hash only the first column to pick the partition, use the remaining columns as a sorted concatenated index — enables efficient range scans over later columns once the first column is pinned to a value.

**Applicability:** Deciding partition scheme for a distributed key-value or wide-column store; especially when weighing whether you need efficient range scans vs uniform load.

**Limits:** Language built-in hash functions (Java Object.hashCode(), Ruby Object#hash) are unsafe — may hash the same key differently across processes. Neither pure scheme handles a single very hot key.

---

## KU02 — Skew, hot spots, and the monotonic-key hot-spot fix
- **type:** definition
- **pages:** 241, 242, 243

**Problem:** Understanding why some partitions get overloaded and how a key design choice avoids concentrating write load.

**Content:** SKEW (asymmetry): when some partitions hold disproportionately more data or requests than others, sharply reducing partitioning effectiveness; in the extreme all load lands on one partition. A partition with disproportionately high load is a HOT SPOT. Assigning records to nodes at random spreads load evenly but forces reads to query all nodes in parallel (you no longer know where a record lives), so it's rarely acceptable. Range-partition hot-spot pattern: if the partition key is a timestamp, partitions map to time ranges and all incoming writes hit the current (today's) partition while others idle. FIX: don't put the timestamp first in the key — prefix it with another field (e.g. sensor name) so writes spread across partitions by sensor first, then by time. Cost: retrieving a time range across multiple sensors now needs a separate range query per sensor name.

**Applicability:** Designing partition/primary keys for time-series or append-heavy workloads; diagnosing why one node is saturated while others idle.

**Limits:** Prefixing helps only when many prefix values are active concurrently (e.g. many sensors writing at once).

---

## KU03 — Splitting a single hot key across partitions
- **type:** heuristic
- **pages:** 245, 246

**Problem:** A single key (e.g. a celebrity's user/action ID) receives a burst of reads/writes that no hashing can spread, since identical keys hash identically.

**Content:** Hashing the key does not help a single hot key because two identical keys produce the same hash, so all traffic still lands on one partition. Most systems can't auto-balance a highly skewed single-key load, so mitigation is the application's responsibility. Technique: append (or prepend) a small random number to the known-hot key — a two-digit decimal splits writes across 100 distinct keys, distributing them over partitions. Costs and bookkeeping: reads must now query and combine all the split keys; this overhead is only worth it for a small number of hot keys (adding randomness to the low-volume majority would be wasteful), so the application must track which keys were split.

**Applicability:** When a specific key is known to be very hot and you must relieve a single-partition bottleneck manually.

**Limits:** Adds read amplification and tracking overhead; requires detecting hotness (systems don't auto-detect); pick the split factor to match expected write volume.

---

## KU04 — Partitioning secondary indexes: document-based (local) vs term-based (global)
- **type:** tradeoff-table
- **pages:** 247, 248, 249, 250

**Problem:** Secondary indexes don't map cleanly to primary-key partitions; you must decide how to partition the index itself.

**Content:**
- **DOCUMENT-BASED PARTITIONING (local index):** each partition keeps its own secondary index covering only its own documents. Writes touch only the one partition holding the document's ID — simple, self-contained. But reads must query every partition and merge results (scatter/gather), because matching documents for a given index value can live in any partition; scatter/gather inflates tail latency even when run in parallel. Used by MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB.
- **TERM-BASED PARTITIONING (global index):** build one global index covering all partitions, then partition that index by the indexed term itself (or by the term's hash — term for range scans, hash for even load distribution). Reads hit only the single partition holding the term (fast). But writes are slower and more complex: one document write can touch several index partitions (its terms may live on different partitions/nodes), which would ideally need a distributed transaction across those partitions; in practice global-index updates are usually asynchronous — e.g. Amazon DynamoDB global indexes normally update within a fraction of a second but can lag longer during infrastructure faults. Also used by Riak search and Oracle data warehouse (offers a local/global choice).

**Applicability:** Choosing an index partitioning strategy when queries filter on non-primary-key attributes in a partitioned database or search cluster.

**Limits:** Document-based reads get expensive with multiple secondary-index filters in one query; term-based writes may expose stale reads shortly after a write due to async updates.

---

## KU05 — Rebalancing strategies for partition-to-node assignment
- **type:** decision-framework
- **pages:** 250, 251, 252, 253, 254

**Problem:** As nodes are added/removed or fail, you must move partitions between nodes while minimizing data movement.

**Content:**
- **ANTI-PATTERN — hash mod N:** assigning key to node via hash(key) mod N breaks badly when N changes, because most keys move (hash 123456 → node 6 at N=10, node 3 at N=11, node 0 at N=12). Avoid.
- **FIXED NUMBER OF PARTITIONS:** create many more partitions than nodes (e.g. 1000 partitions, 100 per node on a 10-node cluster) and assign several per node; adding a node borrows whole partitions from existing nodes, removing does the reverse — key→partition mapping never changes, only partition→node placement moves. Used by Riak, Elasticsearch, Couchbase, Voldemort. Downside: partition count is fixed at setup and caps the max node count, so must be chosen large but not so large that per-partition overhead hurts; hard to pick when dataset size varies widely.
- **DYNAMIC PARTITIONING:** split a partition when it exceeds a size threshold (HBase default 10 GB) and merge when it shrinks below a threshold, like a B-tree top level; partition count adapts to data volume. Used by HBase, RethinkDB. Caveat: an empty DB starts with one partition (one node busy, rest idle) unless you pre-split (HBase, MongoDB support pre-splitting). Works for both range- and hash-partitioned data.
- **PROPORTIONAL TO NODES:** fixed number of partitions per node (Cassandra default 256), so partition size stays roughly constant as data and nodes grow together; a new node randomly picks existing partitions to split, taking half of each. Requires hash partitioning to pick random boundaries; matches the original consistent-hashing definition. Cassandra 3.0 added an algorithm to avoid uneven splits.

**Applicability:** Selecting or evaluating a rebalancing approach when scaling a partitioned database cluster.

**Limits:** Fixed-count is inflexible under large dataset-size variance; dynamic needs pre-splitting to avoid a cold-start single-partition bottleneck; proportional-to-nodes requires hash partitioning.

---

## KU06 — Rebalancing requirements and automatic vs manual rebalancing
- **type:** checklist
- **pages:** 250, 254, 255

**Problem:** Deciding what a good rebalancing process must guarantee and whether to let it run fully automatically.

**Content:** Regardless of scheme, rebalancing should meet minimum requirements: (1) after rebalancing, load (storage, reads, writes) is spread evenly across nodes; (2) the database keeps serving reads and writes during rebalancing; (3) only the necessary amount of data moves between nodes, to speed rebalancing and minimize network/disk I/O. AUTO vs MANUAL: there is a spectrum. Fully automatic reduces ops work but its results can be surprising — rebalancing is expensive (reroutes requests, moves large data) and can overload network/nodes and degrade other queries. Fully automatic rebalancing is dangerous combined with automatic failure detection: an overloaded, slow node may be declared dead, triggering rebalancing that shifts load onto the already-struggling node and the network, worsening things and risking cascading failure. Keeping a human in the loop (e.g. Couchbase, Riak, Voldemort auto-generate the assignment but apply it only after admin confirmation) is slower but prevents operational surprises.

**Applicability:** Configuring or reviewing a rebalancing policy; deciding automation level for a production cluster.

**Limits:** Manual/confirmation-gated rebalancing is slower to react to real load changes.

---

## KU07 — Request routing / service discovery in a partitioned cluster
- **type:** decision-framework
- **pages:** 255, 256, 257, 258

**Problem:** Because rebalancing changes partition→node placement, a client needs to know which node to contact for a given key.

**Content:** This is an instance of service discovery. Three routing approaches: (1) let the client contact any node (e.g. round-robin LB); if that node owns the partition it answers, else it forwards to the right node and relays the reply. (2) Send all requests to a routing tier (partition-aware load balancer) that forwards to the correct node but processes nothing itself. (3) Make clients partition-aware so they connect directly to the owning node with no intermediary. The core problem in all three: how does the routing component learn placement changes — it needs consensus among participants, or requests go to the wrong node. Common implementation: a separate coordination service like ZooKeeper holds the authoritative partition→node map; nodes register there and routing tiers/clients subscribe to updates (used by HBase, SolrCloud, Kafka; LinkedIn Espresso via Helix over ZooKeeper; MongoDB uses its own config servers + mongos router). Alternative: Cassandra and Riak use a gossip protocol among nodes to propagate cluster-state changes (approach 1), avoiding an external coordinator at the cost of more complex nodes. IP addresses (which change less often than partition placement) can typically be resolved via DNS. Separately, MPP analytic databases parallelize complex multi-join/filter/aggregate queries across many nodes and stages.

**Applicability:** Designing how clients locate the right node in a sharded database or any partition-aware distributed service.

**Limits:** Consensus/coordination protocols are hard to implement correctly; gossip complicates node logic; async metadata propagation can briefly misroute during changes.
