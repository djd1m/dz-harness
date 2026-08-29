---
name: ddia-distributed-consistency-consensus
description: >
  Choose a distributed CONSISTENCY MODEL and coordination primitive across nodes: linearizable vs causal
  vs eventual, when you actually need consensus (Raft/Paxos/ZooKeeper/etcd), total-order broadcast, 2PC,
  leader election, distributed locks, and reasoning about unreliable clocks and partial failure. Cross-node
  agreement ONLY — NOT single-DB transaction isolation levels (→ ddia-transaction-isolation-choice), NOT
  replication-topology knobs (→ ddia-replication-topology-choice). Triggers (RU+EN): "модель согласованности",
  "нужна ли линеаризуемость", "выбор консенсуса", "выбор лидера / split-brain", "линеаризуемость vs причинная",
  "linearizable vs causal", "total-order broadcast", "2PC vs consensus", "do I need ZooKeeper", "CAP".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
---

# Distributed Consistency & Consensus — pick the weakest model that still satisfies the requirement, and know when you're actually buying consensus

## Output
A design recommendation for consistency: the weakest model that still holds (eventual / causal /
linearizable), whether the problem truly reduces to consensus, and the failover / lock / clock
primitives — with the гл.8–9 facts backing it — folded into the ADR or architecture step.

## When to use / NOT
- **Use when:** deciding a consistency model (linearizable / causal / eventual); deciding whether a
  feature genuinely needs consensus vs can tolerate staleness; designing leader election, failover, or
  a distributed lock; setting failure-detection timeouts; choosing which clock to trust; sizing a
  consensus/coordination cluster; arguing about CAP or "w+r>n = strong consistency"; choosing between a
  distributed transaction (2PC/XA) and a consensus-based approach.
- **NOT for:** choosing *how* to lay out replicas across leaders (single vs multi vs leaderless
  topology) → **ddia-replication-topology-choice**. Picking a *transaction isolation level* (read
  committed, snapshot, serializable, write-skew) → **ddia-transaction-isolation-choice**. Sharding /
  rebalancing keys → **ddia-partitioning-strategy**.

## Decision criteria

### 1. What consistency model does this operation actually need? (pick the weakest that works)
Weaker = faster + more available under partition. Linearizability is slow **always**, not just during
failures (Attiya–Welch: response time ≥ proportional to network-delay uncertainty [гл.9, с.391–394]).

| Model | Guarantee | Cost | Pick when |
|---|---|---|---|
| **Eventual** | replicas converge *some time* later (a liveness property) | cheapest, always available | staleness is harmless (view counts, timelines, cached discovery) |
| **Causal** | cause-before-effect preserved (partial order); concurrent ops unordered | NOT slowed by network delay, stays available under partition — CAP doesn't bind it | you need "reply after question", "friend-added before post" ordering but not global recency. Often what a team *thinks* needs linearizability really needs only this. |
| **Linearizable** | one-copy illusion, atomic, recency: after a write completes, all reads see it | slow always; unavailable side during partition | locks/leader-election, uniqueness constraints, cross-channel races (see #3) |

Implement causal ordering with **logical clocks**, not physical time. **Lamport timestamps** = (counter,
nodeID); each node keeps the max counter it has seen and bumps to any larger value it observes → total
order consistent with causality [гл.9, с.397–403]. Use **version vectors** instead if you must *detect*
whether two writes were concurrent (Lamport can't tell you that).

### 2. Does this problem reduce to consensus? If yes, use a proven algorithm — don't hand-roll it.
These are all **equivalent to consensus** (solve one → solve all) [гл.9, с.432–434]:
linearizable compare-and-set, atomic commit of a distributed transaction, total order broadcast,
locks/leases, membership services, uniqueness constraints. This is why a **single-leader DB** gives you
all of them cheaply — the leader is the single decision-maker. The catch: when that leader dies you
still need consensus, just *elsewhere and less often*. Three responses to leader failure:

| Response | Correct? | Note |
|---|---|---|
| Wait for leader to recover, block meanwhile | ✗ violates termination | what 2PC/XA coordinators do — can block forever |
| Manual failover (human picks new leader) | ✓ | limited to human speed; common in RDBMS |
| Automatic leader election (a consensus algorithm) | ✓ | use a proven one: Raft, Paxos/Multi-Paxos, VSR, Zab |

Leaderless & multi-leader replication *avoid* global consensus by accepting branching/merging version
histories instead of linearizability — a valid trade if you don't need recency.

### 3. When you DO need linearizability (checklist) [гл.9, с.384–387]
1. **Locks & leader election** — to prevent split-brain (two leaders). The election lock must be
   linearizable. Use ZooKeeper/etcd (Apache Curator wraps ZK).
2. **Uniqueness constraints** — username, e-mail, file path, "don't oversell seats", non-negative
   balance. Each is an atomic CAS on a shared value. (Foreign keys / attribute constraints do NOT need it.)
3. **Cross-channel timing dependencies** — two channels between components (e.g. file store + message
   queue): without linearizability a message can overtake the data replication → race.
   *Escape hatch:* if the constraint can be relaxed (overbook + compensate), you don't need it at all.

### 4. Build vs buy coordination: ZooKeeper/etcd or not?
- Coordination service = small, slow-changing data in memory, replicated by fault-tolerant total order
  broadcast, on a **fixed 3 or 5 voting nodes**, serving many clients [гл.9, с.429–432]. Gives you:
  linearizable atomic CAS (→ locks as leases), monotonic **fencing tokens** (zxid/cversion), heartbeat
  session failure detection (ephemeral nodes auto-release), and watches.
- **Service discovery does NOT need consensus** — DNS is deliberately non-linearizable + cached; stale
  is fine. Route these reads to **read-only replicas** that receive the log asynchronously and don't vote.
- NOT for high-frequency application state (thousands of writes/s) — use e.g. Apache BookKeeper.

### 5. Distributed transaction commit: 2PC/XA vs consensus
2PC (2 phases: prepare → commit; a coordinator) is a **blocking protocol**: if the coordinator crashes
after participants voted "yes" but before broadcasting the decision, participants are **in-doubt** and
**hold locks until the coordinator recovers** — lost coordinator log ⇒ locks held forever, manual
intervention [гл.9, с.411–417]. Consensus is fault-tolerant where 2PC is not because it (a) *elects* the
coordinator, (b) needs only a **quorum** not *every* participant, (c) has a recovery process. Prefer
consensus-based approaches; treat XA as the lowest-common-denominator with real limits (no cross-system
deadlock detection, doesn't work with SSI).

### 6. Failure detection & clocks (the primitives everything above rests on)
- **Timeouts**: no correct fixed value exists. Only under a *bounded* network (max delay `d`, node
  handles in `r`) would `2d + r` be the timeout — real async networks give unbounded delay [гл.8,
  с.328–333]. Too short ⇒ false-kill a slow-but-live node ⇒ duplicate work ⇒ cascading failure. Prefer
  adaptive detection (**Phi Accrual**, used in Akka/Cassandra) over a hard timeout [гл.8, с.334–335].
- **Clocks**: monotonic (`CLOCK_MONOTONIC`/`nanoTime`) for **durations**; time-of-day
  (`CLOCK_REALTIME`) for **timestamps** only, knowing it can jump backward on NTP correction [гл.8,
  с.339–341]. Never order events across nodes by wall-clock (LWW) — it silently drops writes (§Anti-patterns).
- **Distributed locks need fencing** [гл.8, с.349, 355–357]: a paused-then-resumed lease holder (GC
  pause of minutes, VM suspend, SIGSTOP) can corrupt the resource. The lock server hands out a
  monotonic **fencing token**; the **resource itself** (server-side, not the client) rejects any write
  with a stale token.

### 7. Sizing & fault-tolerance bounds
- Consensus needs a **majority quorum** for liveness: **min 3 nodes to tolerate 1 failure, min 5 to
  tolerate 2** [гл.9, с.427–428]. On a partition, only the majority side makes progress.
- Safety (agreement, integrity, validity) holds **always**, even if a majority fails — an outage halts
  progress but can't corrupt into an invalid decision [гл.9, с.424].
- Byzantine tolerance (lying nodes) needs **> 2/3 correct** (fewer than 1/3 faulty); out of scope for
  ordinary datacenter systems — worth it only in aerospace / trustless peer-to-peer (blockchain)
  [гл.8, с.359–363].

## Key facts & formulas
- **w + r > n does NOT guarantee linearizability** — strict quorum still allows a later reader to see
  an older value than an earlier reader (n=3, w=3, r=2 counterexample) [гл.9, с.387–390].
- Bounded-network timeout would be **2d + r** (d = max network delay, r = node processing) — but real
  async networks have unbounded delay, so no correct fixed timeout exists [гл.8, с.328–333].
- Linearizability response time is **≥ proportional to network-delay uncertainty** (Attiya–Welch) —
  it is slow *always*, not only during faults [гл.9, с.391–394].
- **FLP impossibility**: in an asynchronous crash model there is no deterministic consensus algorithm
  — but timeouts/failure-detectors (or even randomness) make consensus achievable in practice [гл.9,
  с.410, 422–423].
- Consensus quorum sizing: **3 nodes tolerate 1 failure, 5 tolerate 2** [гл.9, с.427–428]. Byzantine:
  **> 2/3 correct** [гл.8, с.359–363].
- The four consensus properties: **uniform agreement, integrity, validity** (safety) + **termination**
  (liveness) [гл.9, с.422–423].
- Named techniques: **Lamport timestamps** = (counter, nodeID) [гл.9, с.397–403]; **fencing tokens**
  (ZooKeeper zxid/cversion) [гл.8, с.355–357]; **Phi Accrual** failure detector [гл.8, с.334–335];
  **TrueTime/commit-wait** returns [earliest, latest] and waits out the interval [гл.8, с.345–348];
  **epoch numbers** = ballot (Paxos) / view (VSR) / term (Raft) with **overlapping quorums** [гл.9,
  с.426–427]; **total order broadcast** = repeated consensus (VSR/Paxos/Raft/Zab) [гл.9, с.424–425].
- **CAS** `cas(x, v_old, v_new)` is the atomic primitive behind locks and uniqueness [гл.9, с.381–383].
- Linearizable CAS / increment-and-get and total order broadcast are all **equivalent to consensus**
  [гл.9, с.405–409].

## Anti-patterns

| Anti-pattern | Why it fails | Source |
|---|---|---|
| **LWW by wall-clock** to pick the "newer" write | A ~3 ms clock skew makes a causally-later write lose; the update is **silently dropped**, no error. NTP precision is bounded by RTT — can't be precise enough. | ddia-ch08-ku05 [гл.8, с.343–345] |
| Assuming **w + r > n ⇒ strong/linearizable** | Strict quorum still admits non-linearizable reads (later reader sees older value). | ddia-ch09-ku04 [гл.9, с.387–390] |
| **Client-side** fencing / lease check | A paused client "resurrects" after its lease expired and writes stale data. The *resource* must enforce the token, not the client. | ddia-ch08-ku07 [гл.8, с.355–357] |
| Using **time-of-day clock to measure a duration** | Clock can jump backward on NTP correction → negative/garbage intervals. Use a monotonic clock. | ddia-ch08-ku04 [гл.8, с.339–341] |
| **Too-short failure-detection timeout** | False-kills slow-but-live nodes → duplicate execution + load shifting → cascading failure. | ddia-ch08-ku02 [гл.8, с.328–333] |
| **2PC / XA for cross-service commits** expecting no blocking | Coordinator crash after "yes" votes leaves participants in-doubt holding locks until it recovers — possibly forever. | ddia-ch09-ku08 [гл.9, с.411–417] |
| Reading CAP as **"pick 2 of 3"** | A partition is a fault you don't get to choose; C-vs-A is a choice made only *during* a partition. CP/AP labels are best avoided. | ddia-ch09-ku05 [гл.9, с.391–394] |
| Default reads from ZooKeeper/etcd assumed **fresh** | They're linearizable on *write*; reads may be stale unless you use quorum read (etcd) or `sync()` (ZooKeeper). | ddia-ch09-ku03 [гл.9, с.384–387] |
| Reaching for consensus on **service discovery** | Discovery tolerates staleness (DNS model); consensus here is wasted cost — serve from read-only replicas. | ddia-ch09-ku07 [гл.9, с.430–432] |

## Related decisions
- Chose leaderless/quorum replication for availability → **ddia-transaction-isolation-choice**: quorum
  reads/writes give weaker guarantees; `w+r>n` is not linearizable and doesn't prevent write skew.
- Chose single-leader for linearizable ops here → **ddia-replication-topology-choice**: failover then
  *requires* consensus for leader election (the coupling this skill flags in criterion #2).
- Need serializability *and* recency together → **ddia-transaction-isolation-choice**: strict/strong
  serializability (1SR) = serializability + linearizability, and costs more than either alone.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), главы 8–9.
KUs consumed (27): ddia-ch08-ku01 (×2), ddia-ch08-ku02 (×2), ddia-ch08-ku03, ddia-ch08-ku04,
ddia-ch08-ku05, ddia-ch08-ku06, ddia-ch08-ku07, ddia-ch08-ku08, ddia-ch09-ku01 (×2),
ddia-ch09-ku02 (×2), ddia-ch09-ku03 (×2), ddia-ch09-ku04 (×2), ddia-ch09-ku05 (×2),
ddia-ch09-ku06 (×2), ddia-ch09-ku07 (×2), ddia-ch09-ku08 (×2), ddia-ch09-ku09.
Deep reference: references/knowledge-units.md.

Anchor quotes (verbatim, for human spot-check):
- «разделением интеллекта (split-brain) и часто приводит к потере данных» [гл.8, с.376].
- «Ситуация, когда два узла одновременно считают себя ведущими» [гл.8, с.376].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «нужна ли линеаризуемость для этой операции?» → often only causal ordering is required; reserve linearizable for locks / leader-election / uniqueness, cites гл.9.
- "designing leader election and failover" → use a proven consensus algorithm (Raft / ZooKeeper), never hand-roll; the resource enforces the fencing token, not the client.
- «w+r>n даёт сильную согласованность?» → no — a strict quorum still admits a later reader seeing an older value.
