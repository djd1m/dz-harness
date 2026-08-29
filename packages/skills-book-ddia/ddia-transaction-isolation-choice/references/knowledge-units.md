# Knowledge Units — Transaction Isolation Choice (DDIA гл. 7)

Deep-lookup reference for `ddia-transaction-isolation-choice`. Machine-distilled from
«Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), chapter 7. trust_tier 0 — unreviewed.

---

## ddia-ch07-ku01 — ACID semantics and the C caveat
**Type:** definition · **Pages:** 268–271 · **Skill-worthiness:** high

**Problem:** "ACID-compliant" is used as marketing and gives no precise guarantee; engineers need to know what each letter actually promises and who is responsible for it.

**Content:** ACID = Atomicity, Consistency, Isolation, Durability (coined 1983 by Härder & Reuter). Precise meanings: Atomicity — NOT about concurrency; it is the abort/rollback ability: if a multi-write transaction fails partway (crash, network drop, disk full, constraint violation) the DB discards ALL its writes, giving all-or-nothing so the app can safely retry (a better name would be 'abortability'). Isolation — concurrently running transactions do not step on each other; the textbook ideal is serializability (result equals some serial order). Durability — committed data survives crashes: single node = write to non-volatile storage + write-ahead log; replicated = data copied to N nodes before reporting commit. Consistency (invariants like credit=debit) is a property of the APPLICATION, not the database — the app must write transactions that preserve invariants; the DB only enforces narrow constraints (foreign keys, uniqueness). So the C arguably does not belong in ACID. Contrast: BASE (Basically Available, Soft state, Eventual consistency) effectively just means 'not ACID'.

**Applicability:** Reading vendor claims, choosing a datastore, reasoning about failure behavior, or debating whether an app needs transactional guarantees.

**Limits:** Real ACID implementations differ substantially, especially in the meaning of 'isolation'; the label alone tells you little.

---

## ddia-ch07-ku02 — When you actually need multi-object transactions
**Type:** heuristic · **Pages:** 275–276 · **Skill-worthiness:** medium

**Problem:** Many distributed stores dropped multi-object transactions; deciding whether single-object operations suffice for your app.

**Content:** Single-object atomic operations (atomic increment, compare-and-set) protect one key but are NOT transactions and cannot keep multiple objects consistent. Reach for multi-object transactions when: (1) rows reference each other via foreign keys — inserts referencing each other must keep references valid; (2) denormalized data must be updated together across documents (e.g. an email plus its unread-counter, Fig 7.2) — document stores without joins force this; (3) secondary indexes exist (almost every DB except pure key-value) — index entries are separate objects from the base row, so without isolation a record can appear in one index but not yet another. You can build such apps without transactions, but without atomicity error handling gets much harder and without isolation you hit concurrency bugs.

**Applicability:** Choosing between a single-object KV model and a transactional model; assessing risk of a NoSQL store that lacks multi-object grouping.

**Limits:** Simple insert/append-only or append-one-record access patterns often need no transactions at all.

---

## ddia-ch07-ku03 — Safe retry of aborted transactions
**Type:** checklist · **Pages:** 276–277 · **Skill-worthiness:** high

**Problem:** The whole point of abort is safe retry, but naive retry logic (or ORMs that just throw) introduces new bugs.

**Content:** Retrying aborted transactions is simple but imperfect; guard against: (1) Duplicate side effects — if the transaction actually committed but the commit ack was lost on the network, retry runs it TWICE unless you add app-level deduplication. (2) Overload amplification — if the abort cause was overload, blind retry worsens it; cap retry count, use exponential backoff, and treat overload errors differently. (3) Retry only TRANSIENT errors (deadlock, isolation violation, transient network, crash recovery) — retrying a permanent error (e.g. constraint violation) is pointless. (4) External side effects — a transaction that sent an email may have sent it even though it aborted; use two-phase commit (2PC) to make multiple systems commit/abort together. (5) Client crash during retry loses any in-flight data. Note: ActiveRecord (Rails) and Django do NOT auto-retry aborted transactions — they bubble the exception, losing user input.

**Applicability:** Writing transaction retry wrappers, reviewing ORM error handling, designing idempotency/dedup layers.

**Limits:** Leaderless (best-effort) stores do not roll back on error, so recovery is entirely the application's responsibility.

---

## ddia-ch07-ku04 — Read Committed isolation: two guarantees
**Type:** definition · **Pages:** 279–282 · **Skill-worthiness:** high

**Problem:** Understanding the most basic (and very common default) isolation level and exactly which race conditions it does and does not stop.

**Content:** Read Committed gives exactly two guarantees: (1) No dirty reads — a transaction sees only committed data; another transaction's writes become visible only after it commits (and then all at once). (2) No dirty writes — you can overwrite only committed data; a second writer to the same object is delayed until the first writer commits or aborts, preventing interleaved multi-object writes (Fig 7.5 used-car sale where listing and invoice get mismatched). Default in Oracle 11g, PostgreSQL, SQL Server 2012, MemSQL and many others. Implementation: dirty writes are prevented with row-level locks held until commit/abort; dirty reads are NOT prevented with read locks (one long writer would block all readers, causing latency cascades) — instead the DB keeps both the old committed value and the new uncommitted value and returns the old value to readers until commit. Weaker still: Read Uncommitted prevents dirty writes but not dirty reads.

**Applicability:** Setting or auditing the default isolation level; explaining why some anomalies still occur under a 'safe-sounding' level.

**Limits:** Does NOT prevent read skew (nonrepeatable read), lost updates, write skew, or phantoms.

---

## ddia-ch07-ku05 — Snapshot isolation and MVCC
**Type:** methodology · **Pages:** 282–287 · **Skill-worthiness:** high

**Problem:** Read Committed still allows read skew (e.g. a transfer makes $100 appear to vanish across two account reads); long-running reads/backups/analytics need a consistent view.

**Content:** Snapshot isolation: each transaction reads from a consistent snapshot = all data committed as of the transaction's start time; later changes by others are invisible to it. Ideal for long read-only queries (backups that take hours, analytics, integrity checks) since reads never block writes and writes never block reads. Supported by PostgreSQL, MySQL/InnoDB, Oracle, SQL Server. Naming confusion: Oracle calls it 'serializable'; PostgreSQL and MySQL call it 'repeatable read' (the SQL standard predates snapshot isolation and its definitions are ambiguous). Implementation = MVCC (multiversion concurrency control): writes still take row locks to block dirty writes, but reads are lock-free. Each transaction gets a monotonically increasing txid (32-bit in PostgreSQL, overflows after ~4 billion txns, handled by vacuum). Each row carries created_by and deleted_by txids; an update = delete + create. Visibility rules: at transaction start, snapshot the set of in-flight txids; ignore writes from (a) transactions in that in-flight set, (b) aborted transactions, and (c) transactions with a later txid. An object is visible iff its creating txid was already committed at read-transaction start AND it is not marked deleted by a txn committed before that start.

**Applicability:** Configuring isolation for reporting/backup workloads; understanding MVCC storage growth and vacuum/GC behavior.

**Limits:** Does not prevent lost updates (unless the DB adds detection) or write skew/phantoms; append-only/copy-on-write B-tree variants (CouchDB, Datomic, LMDB) implement snapshots differently and need background compaction.

---

## ddia-ch07-ku06 — Preventing lost updates: five techniques
**Type:** tradeoff-table · **Pages:** 288–292 · **Skill-worthiness:** high

**Problem:** Concurrent read-modify-write cycles (counters, balances, JSON edits, wiki page saves) lose one update when two transactions overwrite each other.

**Content:** Options, roughly best-to-fallback: (1) Atomic write operations — e.g. `UPDATE counters SET value = value + 1 WHERE key='foo'`; MongoDB atomic JSON ops, Redis structure ops. Best when expressible; usually implemented via cursor stability (exclusive lock on read) or single-threaded execution. Watch out: ORMs make it easy to accidentally write an unsafe read-modify-write instead. (2) Explicit locking — `SELECT ... FOR UPDATE` locks the returned rows so app-level logic (e.g. game move validation) can run safely; risk = forgetting a lock somewhere. (3) Automatic lost-update detection — let transactions run concurrently, detect the lost update and force retry; works with snapshot isolation and is less error-prone since the app needs no special code. Provided by PostgreSQL repeatable read, Oracle serializable, SQL Server snapshot isolation; NOT by MySQL/InnoDB repeatable read. (4) Compare-and-set — `UPDATE ... WHERE id=X AND content='old'`; update applies only if value unchanged. Unsafe if the DB lets the WHERE read from an old snapshot — verify. (5) Replicated / multi-leader / leaderless — locks and CAS assume one up-to-date copy and do not apply; use commutative atomic ops or CRDTs (Riak 2.0 datatypes auto-merge). Avoid Last-Write-Wins (LWW), which loses updates and is a common default.

**Applicability:** Choosing a concurrency-safety mechanism for counters, balances, collaborative edits, or any read-modify-write path.

**Limits:** None of these handle write skew across different objects; commutative/CRDT approaches only fit operations that are actually commutative.

---

## ddia-ch07-ku07 — Write skew and phantoms
**Type:** case-pattern · **Pages:** 293–298 · **Skill-worthiness:** high

**Problem:** Two transactions read the same objects, make decisions, then write DIFFERENT objects — no dirty write, no lost update, yet an invariant is violated (e.g. on-call doctors both take leave, dropping coverage to zero).

**Content:** Write skew = generalization of lost update: two transactions read overlapping data and update different rows; had they run serially the second would have been blocked, but concurrency + snapshot isolation lets both proceed. It is NOT auto-detected by PostgreSQL/MySQL repeatable read, Oracle serializable, or SQL Server snapshot isolation. The general pattern: (1) SELECT checks a precondition (>=2 doctors on call, no conflicting booking, username free, balance sufficient); (2) app decides based on the result; (3) app writes (INSERT/UPDATE/DELETE) — and that write changes what step-1's query would now return. When the write inserts a row matching another transaction's search condition, that is a phantom: `SELECT FOR UPDATE` cannot lock rows that do not yet exist. Remedies in order of preference: (a) true serializable isolation — the only thing that automatically prevents write skew; (b) unique / multi-row constraints where they fit (username uniqueness solves that case); (c) explicit `SELECT FOR UPDATE` locking when step-3 modifies rows returned by step-1; (d) materializing conflicts — pre-create rows (e.g. a room×time-slot table) purely to lock against phantoms — error-prone, leaks concurrency control into the data model, use only as a last resort. Examples: meeting-room double-booking, multiplayer moves, username claims, double-spending.

**Applicability:** Auditing check-then-act code paths under snapshot isolation; deciding when a constraint suffices vs. when serializability is mandatory.

**Limits:** Constraints only cover single-object or expressible invariants; multi-object invariants (>=1 doctor) usually need serializability or triggers/materialized views.

---

## ddia-ch07-ku08 — Three ways to implement serializability
**Type:** tradeoff-table · **Pages:** 299, 303–309, 313–314 · **Skill-worthiness:** high

**Problem:** Serializability prevents ALL race conditions but is not used everywhere due to performance; which implementation fits your workload?

**Content:** (1) Actual serial execution — run one transaction at a time on a single thread (VoltDB/H-Store, Redis, Datomic). Feasible since ~2007 because RAM is cheap enough to hold the working set and OLTP transactions are short. Requires: transactions submitted as stored procedures (no interactive multi-statement round-trips), whole dataset in memory, write throughput low enough for one CPU core. Scale via partitioning (per-core partition) — but cross-partition transactions need lock-step coordination and are orders of magnitude slower (VoltDB reports ~1000 writes/sec for multi-partition). (2) Two-phase locking (2PL / SS2PL) — the standard for ~30 years (MySQL InnoDB & SQL Server serializable, DB2 repeatable read). Shared locks for reads, exclusive for writes, held until commit (phase 1 acquire, phase 2 release); readers block writers and vice versa. Prevents phantoms via predicate locks, in practice approximated by cheaper index-range locks (a.k.a. next-key locking). Downsides: low throughput, high tail latencies, frequent deadlocks (DB auto-detects and aborts one) — one slow/large transaction can stall everything. NOTE: 2PL is NOT 2PC. (3) Serializable Snapshot Isolation (SSI) — optimistic; first described 2008 (Cahill PhD). Runs on top of snapshot isolation lock-free, then at commit checks for serialization conflicts and aborts if the outcome was non-serializable. Detects two cases: reads of stale MVCC versions, and writes affecting prior reads (SSI 'tripwires' that mark read data as stale rather than blocking). Used in PostgreSQL SERIALIZABLE (>=9.1) and FoundationDB (distributes conflict detection across machines, scaling beyond one core). Good when contention is low and there is spare capacity; requires read-write transactions to be short (long read-only transactions are fine).

**Applicability:** Selecting an isolation implementation given workload shape (memory footprint, write rate, contention, latency sensitivity, need to scale beyond one core).

**Limits:** Serial execution caps at one core's throughput and needs in-memory data; 2PL has poor and unstable performance under contention; SSI degrades and aborts heavily under high contention or long read-write transactions.

---

## ddia-ch07-ku09 — Anomaly-to-isolation-level matrix
**Type:** tradeoff-table · **Pages:** 314–316 · **Skill-worthiness:** high

**Problem:** Given a race condition, which isolation level is the weakest one that prevents it?

**Content:** Race conditions and the level that stops them: Dirty read (reading another client's uncommitted write) — prevented by Read Committed and above. Dirty write (overwriting another client's uncommitted write) — prevented by virtually all transaction implementations. Read skew / nonrepeatable read (seeing different parts of the DB at different points in time) — prevented by Snapshot Isolation, typically via MVCC. Lost update (two concurrent read-modify-write cycles, one overwrites the other) — some snapshot-isolation implementations detect it automatically; others require manual `SELECT FOR UPDATE`. Write skew (read, decide, write, but the premise no longer holds at commit) — prevented ONLY by serializability. Phantom (a write changes the result of another transaction's search query) — snapshot isolation prevents phantoms in read-only queries, but phantoms feeding write skew need extra handling such as index-range locks. Weak isolation levels stop some anomalies; the rest are the application developer's responsibility (e.g. explicit locking). Only serializable isolation prevents them all.

**Applicability:** Quick lookup when diagnosing a concurrency bug or choosing the minimum isolation level for a given invariant.

**Limits:** Vendor level names are inconsistent (e.g. 'repeatable read' semantics vary widely), so verify what a given engine's named level actually guarantees.
