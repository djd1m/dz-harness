---
name: ddia-transaction-isolation-choice
description: >
  Pick a TRANSACTION ISOLATION level and concurrency control on a single database: read-committed vs
  snapshot vs serializable, which anomalies to prevent (dirty read, lost update, write skew, phantom),
  MVCC vs 2PL vs SSI. Single-node/single-DB concurrency ONLY — NOT cross-node linearizability or
  distributed consensus (→ ddia-distributed-consistency-consensus).
  Triggers (RU+EN): "какой уровень изоляции", "нужны ли транзакции", "read committed или serializable",
  "потерянное обновление / write skew", "isolation level choice", "snapshot vs serializable",
  "lost update", "write skew", "MVCC vs 2PL vs SSI", "serializable or not".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
derived_from:
  - ddia-ch07-ku01
  - ddia-ch07-ku02
  - ddia-ch07-ku03
  - ddia-ch07-ku04
  - ddia-ch07-ku05
  - ddia-ch07-ku06
  - ddia-ch07-ku07
  - ddia-ch07-ku08
  - ddia-ch07-ku09
---

# Transaction Isolation Choice — pick the weakest isolation level that still forbids every anomaly your invariants can't survive

## Output
A design recommendation for isolation: the weakest level that forbids every anomaly your invariants
can't survive, plus the concurrency-safety mechanism for the read-modify-write path — with the
tradeoffs and гл.7 facts backing it — folded into the ADR or architecture step.

## When to use / NOT
- Use when: deciding whether an app even needs multi-object transactions; setting or auditing a database's default isolation level; diagnosing a concurrency bug (a value vanished, a counter under-counted, two rows both "won", a uniqueness rule was violated); choosing a concurrency-safety mechanism for a read-modify-write path; deciding whether serializability is mandatory or a cheaper guard suffices; writing transaction-retry / idempotency logic.
- NOT for: agreement across nodes, linearizability, leader election, or exactly-once cross-node commit — that is `ddia-distributed-consistency-consensus`. Choosing single- vs multi-leader vs leaderless replication is `ddia-replication-topology-choice` (isolation here assumes a single up-to-date copy; leaderless breaks that assumption).

## Decision criteria

### Step 0 — do you need multi-object transactions at all?
Single-object atomic ops (atomic increment, compare-and-set) protect ONE key and are not transactions. Reach for multi-object transactions when any of these hold (KU02):
- rows reference each other by foreign key and inserts must keep references valid;
- denormalized data must update together across documents (e.g. an email plus its unread-counter);
- secondary indexes exist (index entries are separate objects from the base row, so without isolation a record can appear in one index but not another).
Simple insert-only / append-one-record patterns often need no transactions.

### Step 1 — map your invariant to the anomaly that would break it, then pick the weakest level that stops it
This is the load-bearing lookup (KU09). Pick the leftmost column that covers every anomaly your app can suffer.

| Anomaly | What goes wrong | Weakest level that prevents it |
|---|---|---|
| Dirty read | you read another txn's uncommitted write | Read Committed |
| Dirty write | you overwrite another txn's uncommitted write | ~all transaction implementations |
| Read skew / nonrepeatable read | you see different parts of the DB at different times (e.g. $100 seems to vanish across two account reads) | Snapshot Isolation (via MVCC) |
| Lost update | two read-modify-write cycles, one overwrites the other | some SI impls auto-detect; else manual `SELECT FOR UPDATE` |
| Write skew | read → decide → write different rows, but the premise no longer holds at commit | ONLY serializability |
| Phantom | a write changes the result of another txn's search query | SI prevents in read-only queries; write-skew phantoms need index-range locks or serializability |

Rule of thumb: default (Read Committed) is fine for independent single-object writes; move to Snapshot Isolation for long reads/backups/analytics; move to Serializable when a check-then-act path guards a multi-object invariant.

### Step 2 — if the anomaly is lost update, choose a mechanism (KU06, best-to-fallback)
| Technique | Use when | Watch out |
|---|---|---|
| Atomic write op (`SET value = value + 1`, Mongo/Redis ops) | the update is expressible in one DB op | ORMs make it easy to write an unsafe read-modify-write instead |
| Explicit `SELECT ... FOR UPDATE` | app-level logic must run between read and write (game move, validation) | forgetting a lock on one code path |
| Automatic lost-update detection | you want SI + no special app code | PostgreSQL repeatable read / Oracle serializable / SQL Server snapshot detect it; MySQL/InnoDB repeatable read does NOT |
| Compare-and-set (`UPDATE ... WHERE content='old'`) | single-object CAS | unsafe if the WHERE may read from an old snapshot — verify |
| CRDTs / commutative ops (Riak 2.0 datatypes) | replicated / multi-leader / leaderless — no single up-to-date copy | only fits genuinely commutative ops; avoid Last-Write-Wins, which silently loses updates |

### Step 3 — if you need serializability, pick an implementation by workload shape (KU08)
| Implementation | Pick when | Cost / limit |
|---|---|---|
| Actual serial execution (VoltDB, Redis, Datomic) | working set fits in RAM, write throughput fits one CPU core, txns can be stored procedures | cross-partition txns are orders of magnitude slower (VoltDB ~1000 writes/sec multi-partition); caps at one core |
| Two-phase locking (2PL/SS2PL) (MySQL InnoDB & SQL Server serializable, DB2 repeatable read) | you need a proven, general serializable engine | low throughput, high tail latency, frequent deadlocks; one slow/large txn stalls everything |
| Serializable Snapshot Isolation (SSI) (PostgreSQL ≥9.1, FoundationDB) | contention is low, spare CPU capacity, read-write txns are short | degrades and aborts heavily under high contention or long read-write txns |

## Key facts & formulas
- ACID = Atomicity, Consistency, Isolation, Durability (term coined 1983, Härder & Reuter). Atomicity = abort/rollback ("abortability"), NOT concurrency; Consistency (invariants) is an APPLICATION property, not the DB's; BASE just means "not ACID" [гл.7, с.268–271].
- Read Committed gives exactly two guarantees: no dirty reads, no dirty writes. Default in Oracle 11g, PostgreSQL, SQL Server 2012, MemSQL. Dirty writes blocked by row-level locks held to commit; dirty reads avoided by returning the old committed value (not by read locks, which would let one long writer block all readers) [гл.7, с.279–282].
- Snapshot Isolation = read from a consistent snapshot of all data committed as of txn start; implemented with MVCC. Reads never block writes and writes never block reads. Naming: Oracle calls it "serializable"; PostgreSQL/MySQL call it "repeatable read" [гл.7, с.282–287].
- MVCC mechanics: monotonic txid (32-bit in PostgreSQL, overflows ~4 billion txns, handled by vacuum); each row carries created_by / deleted_by txids; update = delete + create. Visible iff creating txid committed before read-txn start AND not deleted by a txn committed before that start [гл.7, с.284–287].
- Write skew = generalization of lost update: read overlapping data, write DIFFERENT rows. NOT auto-detected by PostgreSQL/MySQL repeatable read, Oracle serializable, or SQL Server snapshot isolation — only true serializability stops it [гл.7, с.293–298].
- Phantom = a write matching another txn's search condition; `SELECT FOR UPDATE` can't lock rows that don't yet exist. Materializing conflicts (pre-creating lockable rows) is a last-resort remedy [гл.7, с.294–297].
- Serial execution became feasible ~2007 (RAM cheap enough for working set; OLTP txns short). 2PL was the standard for ~30 years; 2PL is NOT 2PC. SSI first described 2008 (Cahill PhD) [гл.7, с.299, 304–314].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Trusting the "ACID-compliant" / isolation-level label | real ACID impls differ; vendor level names are inconsistent (e.g. "repeatable read" semantics vary widely) — verify what the engine actually guarantees | KU01, KU09 |
| Relying on MySQL/InnoDB "repeatable read" to catch lost updates | it does not auto-detect them (unlike PostgreSQL repeatable read / Oracle serializable / SQL Server snapshot) | KU06 |
| Assuming snapshot isolation / "repeatable read" prevents write skew | it doesn't — check-then-act on multi-object invariants needs serializability | KU07 |
| Read-modify-write via an ORM object instead of an atomic op | silently reintroduces lost updates | KU06 |
| Last-Write-Wins as a default conflict resolution | silently discards concurrent updates | KU06 |
| Blind retry of aborted transactions | double-applies if the commit ack was lost; amplifies overload; wastes effort on permanent errors; may resend external side effects (email). Retry only transient errors, cap + backoff, dedup. ActiveRecord/Django do NOT auto-retry | KU03 |
| Assuming locks/CAS work on replicated/multi-leader/leaderless data | they assume one up-to-date copy; use commutative ops/CRDTs instead | KU06 |

## Related decisions
- chose leaderless / multi-leader replication in `ddia-replication-topology-choice` → locks and compare-and-set no longer apply here; you must use commutative atomic ops or CRDTs, and Last-Write-Wins loses updates.
- need cross-node exactly-once commit or agreement (2PC, consensus) → `ddia-distributed-consistency-consensus` (note: 2PL here is NOT 2PC).
- external side effects inside a transaction (email, payment) → coordinate with `ddia-distributed-consistency-consensus` (two-phase commit) rather than relying on single-DB atomicity.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 7.
KUs: ddia-ch07-ku01, ku02, ku03, ku04, ku05, ku06, ku07, ku08, ku09. Deep reference: references/knowledge-units.md.
Anchor quotes for human spot-check: "Consistency… is a property of the application, not the database" [гл.7, с.271]; "only serializable isolation prevents them all" [гл.7, с.316].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «read committed, snapshot или serializable?» → the weakest level that stops your anomaly; serializable only when a check-then-act guards a multi-object invariant, cites гл.7.
- "a counter under-counts under concurrent writes (lost update)" → atomic write op or SELECT FOR UPDATE; MySQL/InnoDB repeatable read won't auto-detect it.
- «snapshot isolation защитит от write skew?» → no — only true serializability stops write skew.
