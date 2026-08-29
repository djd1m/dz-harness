---
name: ddia-storage-engine-tradeoffs
description: >
  Pick the STORAGE ENGINE and index layout under a given workload: LSM-tree/SSTable vs B-tree for OLTP,
  row-store vs column-store for OLAP analytics, clustered/covering/heap index placement, write- vs
  read-optimized. The physical on-disk engine on ONE node ONLY — NOT the logical data model
  (→ ddia-data-model-selection), NOT sharding the data across nodes (→ ddia-partitioning-strategy).
  Triggers (RU+EN): "выбор подсистемы хранения", "LSM или B-дерево", "какой индекс добавить",
  "строчное или столбцовое хранилище", "OLTP vs OLAP", "LSM-tree vs B-tree", "column store vs row store",
  "which index to add", "write- vs read-optimized engine".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
derived_from: [ddia-ch03-ku01, ddia-ch03-ku02, ddia-ch03-ku03, ddia-ch03-ku04, ddia-ch03-ku05, ddia-ch03-ku06, ddia-ch03-ku07, ddia-ch03-ku08, ddia-ch03-ku09]
---

# Storage engine & index trade-offs — pick the engine and index that fit the read/write profile

## Output
A design recommendation for the storage engine and index layout: LSM vs B-tree vs hash, row vs column,
index placement — the option chosen, the read-vs-write tradeoff accepted, and the гл.3 facts backing it
— folded into the ADR or architecture step.

## When to use / NOT
- **Use when:** you are choosing an on-disk storage engine or index design and need to reason about the
  read-vs-write cost trade-off — whether to add an index at all and on which columns; hash-index vs
  LSM/SSTable vs B-tree for an OLTP store; heap-file vs clustered vs covering index placement; whether a
  workload is OLTP or OLAP and deserves a separate warehouse; row-oriented vs column-oriented storage for
  analytics; star vs snowflake dimensional modeling.
- **NOT for:** choosing the *logical* data model (relational / document / graph) — that is
  **ddia-data-model-selection**. Not for how records are serialized on the wire or schema migration —
  **ddia-encoding-and-schema-evolution**. Not for spreading one engine across nodes —
  **ddia-partitioning-strategy** / **ddia-replication-topology-choice**.

## Decision criteria

### 1. Add an index at all? (ku01)
An index is a derived structure: it speeds reads and **slows every write** (the index must be updated on
each write). Plain append-only is the fastest possible write; any index taxes it. So do **not** index
everything by default — hand-pick indexes from the app's actual query patterns. Baseline without an index
is a full log scan at **O(n)** — double the rows, double the lookup time.

### 2. OLTP engine: LSM/SSTable vs B-tree vs hash index

| Option | Pick when | Key mechanics | Weakness |
|--------|-----------|---------------|----------|
| **Hash index (Bitcask model, ku02)** | Many writes to a **small set of unique keys** (e.g. per-URL view counter); all keys fit in RAM; values may exceed RAM | Append-only log + in-RAM hash map key→offset; segments + background compaction/merge | Keys must fit entirely in RAM; **range queries are inefficient** (each key looked up separately) |
| **LSM-tree / SSTable (ku03)** | Dataset **> RAM**; need **range queries**; **write-heavy** (sequential writes); full-text indexes | In-RAM sorted MemTable → flushed to sorted SSTable segments; sparse in-RAM index; background merge+compaction; WAL for crash recovery | Reads scan several segments (slower); lookups of **missing** keys are slow without a Bloom filter; compaction can spike tail latency |
| **B-tree (ku04)** | **Read-heavy**; predictable latency; strong transactionality with range locks | Fixed-size pages (~4 KB), balanced tree of depth O(log n); update-in-place; WAL/redo log before applying to pages; latches for concurrency | Update-in-place is a risky multi-page op on split; leaves not necessarily sequential on disk → worse large range scans |

**LSM vs B-tree, the core rule (ku05):** *LSM is usually faster at writes, B-tree usually faster at reads.*
- Prefer **LSM** when: write throughput dominates; SSD wear matters (**lower write amplification** — B-tree
  writes each item at least twice, WAL + page, and rewrites a whole page for a few bytes); you want better
  compression / less fragmentation.
- Prefer **B-tree** when: reads and **predictable** tail latency dominate (LSM's background compaction
  competes for disk bandwidth → high-percentile spikes); you need per-key range locks for transaction
  isolation (each key lives in exactly one place).
- LSM caveat: under sustained high write volume, **compaction can fall behind** → segments pile up, reads
  slow, disk can fill — monitor it explicitly.
- **The book's own caveat:** these comparisons are inconclusive and highly workload-dependent — **benchmark
  against your actual workload**, there is no universal rule.

### 3. Where to store the row relative to the index (ku06)

| Placement | Pick when | Cost |
|-----------|-----------|------|
| **Heap file** (index → pointer to row in a heap) | Multiple secondary indexes (all point to one place, no duplication) | Growing a value may force a row move → update all indexes or leave a forwarding pointer |
| **Clustered index** (row stored inside the index) | Frequent reads by that key; e.g. InnoDB PK is always clustered, secondaries reference the PK; SQL Server allows one per table | More space, higher write cost |
| **Covering index** (index carries *some* columns) | Answer hot queries from the index alone ("index covers the query") | Duplication → write overhead + consistency effort; benefit is query-specific |

### 4. OLTP vs OLAP — do they belong in the same database? (ku07)

| | **OLTP** | **OLAP** |
|--|----------|----------|
| Read pattern | Few records per query, by key | Aggregate over many rows (COUNT/SUM/AVG) |
| Write pattern | Low-latency random access from user input | Bulk ETL import or event stream |
| User | End users via a web app | Analysts for decision support |
| Data | Latest state, GB–TB | History of events, TB–PB |
| Bottleneck | **Disk seek time** | **Disk bandwidth** |

Analytics scans are resource-heavy and hurt latency-critical OLTP — since the late 1980s, split analytics
into a separate **data warehouse** (read-only copy of all OLTP data, optimized for analytic patterns).

### 5. Analytics storage: row vs column, star vs snowflake
- **Column store (ku09)** when queries read millions of rows but only a handful of >100 columns: store each
  column in its own file (all columns share row order). Columns compress well — **bitmap encoding** (one
  bitmap per distinct value), sparse bitmaps further compressed with **run-length encoding**;
  `WHERE col IN (...)` = bitwise OR, `a AND b` = bitwise AND. Sort **whole rows**; DBA picks the first sort
  key for hot queries → long RLE runs. **Vectorized processing**: compressed column chunks in L1 cache,
  tight SIMD loops.
- **Dimensional model (ku08):** central **fact table** (one row per event) + **dimension tables** (who/what/
  where/when/how/why). **Star** = flat dimensions (analysts prefer it); **snowflake** = dimensions split into
  sub-dimensions, more normalized but used less.

## Key facts & formulas
- No-index lookup = full log scan, **O(n)** [гл.3, с.99–100].
- B-tree: fixed pages ~**4 КБ**; depth **O(log n)**; a **4-level** tree of 4 KB pages at branching factor
  **500** addresses up to **256 ТБ** [гл.3, с.108–112].
- LSM MemTable flush threshold ~**several MB**; **Bloom filter** cuts reads of missing keys; compaction
  strategies **size-tiered** and **leveled** [гл.3, с.104–108].
- **Write amplification**: one logical write → many physical writes over the DB's life; B-tree writes each
  item at least twice (WAL + page) [гл.3, с.113–115].
- Bitcask = append-only log + in-RAM hash map key→offset; compaction keeps only the latest value per key;
  **tombstone** on delete, checksums for partial writes [гл.3, с.100–104].
- OLTP bottleneck = **seek time**; OLAP bottleneck = **disk bandwidth** [гл.3, с.121–122].
- Bitmap encoding: n distinct values → n bitmaps; sparse → **run-length encoding**; billions of rows on the
  first sort key → kilobytes [гл.3, с.128–133].

## Anti-patterns

| Anti-pattern | Why it fails | Source |
|--------------|--------------|--------|
| Indexing every column by default | Each index taxes every write; pick from real query patterns | ku01 |
| Hash index when keys don't fit in RAM, or for range queries | Hash map must fit entirely in RAM; range scans do one lookup per key | ku02 |
| LSM store without a Bloom filter for missing-key lookups | Every negative lookup scans all segments | ku03 |
| Ignoring LSM compaction under heavy writes | Compaction falls behind → segments pile up, reads slow, disk fills | ku05 |
| Picking LSM vs B-tree from a rule of thumb alone | Comparisons are inconclusive; must benchmark the real workload | ku05 |
| Over-using clustered/covering indexes | Duplication → write overhead + consistency burden; benefit is query-specific | ku06 |
| Running heavy analytics on the OLTP database | Big scans hurt latency-critical transactions → split off a warehouse | ku07 |
| Expecting Bigtable/Cassandra/HBase "column families" to be a column store | Within a family rows are stored row-wise, no column compression | ku09 |

## Related decisions
- Chose an **LSM/column store** here → **ddia-transaction-isolation-choice**: LSM merges + append-only logs
  shape how MVCC snapshots and per-key range locks work (B-tree's one-place-per-key eases range locking).
- Chose a **column-oriented warehouse** here → **ddia-batch-and-stream-processing**: warehouses are fed by
  ETL bulk import / event streams, coupling engine choice to the ingestion pipeline.
- Chose **dataset > RAM / range queries** here → **ddia-partitioning-strategy**: the same sorted-key
  structure that enables range scans is what you partition on.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 3.
KUs: ddia-ch03-ku01, ddia-ch03-ku02, ddia-ch03-ku03, ddia-ch03-ku04, ddia-ch03-ku05, ddia-ch03-ku06,
ddia-ch03-ku07, ddia-ch03-ku08, ddia-ch03-ku09. Deep reference: references/knowledge-units.md.

Anchor quotes (verbatim, for human spot-check):
- "LSM-деревья обычно быстрее при ЗАПИСИ, B-деревья — при ЧТЕНИИ" [гл.3, с.113].
- "узкое место — время позиционирования на диске" (OLTP) [гл.3, с.121].

## Self-check
- [x] Every criterion traces to a listed KU (ku01–ku09).
- [x] Facts carry page anchors [гл.3, с.X].
- [x] trust_tier 0 (machine-distilled, unreviewed).

## Examples
- «LSM или B-дерево для write-heavy OLTP?» → LSM by default (write throughput, low write amplification), B-tree when reads + predictable tail latency dominate, cites гл.3.
- "designing analytics over billions of rows but few columns" → column store with bitmap/RLE encoding and a star schema in a separate warehouse.
- «какой индекс добавить?» → hand-pick from real query patterns; warns every index taxes each write.
