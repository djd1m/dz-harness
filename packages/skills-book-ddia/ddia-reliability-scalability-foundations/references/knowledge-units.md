# Knowledge Units — ddia-reliability-scalability-foundations

Deep-lookup reference for the SKILL.md in this directory. Source: «Высоконагруженные приложения»
(M. Kleppmann, DDIA рус.), глава 1 — надёжность / масштабируемость / сопровождаемость.

Trust tier 0: machine-distilled from a copyrighted source, unreviewed. Prose paraphrased; facts,
formulas, technique names, and page anchors preserved.

---

## ddia-ch01-ku01 — Three core concerns: reliability, scalability, maintainability
- **Type:** definition
- **Problem:** What non-functional properties should you prioritize when designing a data system, and what does each precisely mean?
- **Content:** The chapter frames three properties that matter in most software systems. Reliability (надежность): the system keeps working correctly — performing required functions at the required performance — even under adversity (hardware/software faults, human error). Scalability (масштабируемость): there are reasonable strategies to cope with growth in data volume, traffic, or complexity. Maintainability (удобство сопровождения): many different people (developers and ops) can work productively over time — keeping it running and adapting it to new use cases. These are non-functional requirements, distinct from functional requirements (what the app does — store, retrieve, search, process data).
- **Applicability:** Use as the checklist of design axes when starting architecture reviews, RFCs, or SLO definitions for any backend/data system.
- **Limits:** Definitions are deliberately broad; each must be made concrete per system (reliability = which fault types tolerated; scalability = which load parameter grows). Not a design method by itself.
- **Pages:** 27, 47

---

## ddia-ch01-ku02 — Fault vs failure and the fault-tolerance strategy
- **Type:** decision-framework
- **Problem:** How should you think about building reliable systems from unreliable parts, and should you prevent faults or tolerate them?
- **Content:** Distinguish fault (сбой) — one component deviating from spec — from failure (отказ) — the whole system stopping delivery of service to users. You cannot drive fault probability to zero, so the general strategy is to design fault-tolerance mechanisms that stop faults escalating into failures; only speak of tolerance to specific fault types (tolerating "all" faults is impossible). Counterintuitively, deliberately inducing faults (e.g. randomly killing processes without warning) continuously exercises the fault-handling paths, since many critical outages stem from poor error handling; Netflix's Chaos Monkey is the canonical example. Exception: prefer prevention over cure when there is no cure — notably security breaches, where once an attacker has exfiltrated confidential data nothing can undo it.
- **Applicability:** Use when deciding resilience strategy, justifying chaos-engineering practice, or writing reliability requirements. Frame outage postmortems around whether a fault was allowed to become a failure.
- **Limits:** Fault injection assumes you have recovery mechanisms worth testing and a safe blast radius. Security/data-confidentiality faults are the explicit exception where tolerance does not apply.
- **Pages:** 27, 28, 29

---

## ddia-ch01-ku03 — Hardware fault rates: disk MTTF and the redundancy-to-fault-tolerance shift
- **Type:** heuristic
- **Problem:** How often should you expect hardware to fail at scale, and when does component redundancy stop being enough?
- **Content:** Hard-disk mean time to failure (MTTF) is cited at roughly 10 to 50 years. Concrete heuristic: a storage cluster of 10,000 disks should expect on average about one disk failure per day. Hardware faults are usually random and largely independent across machines (weak correlations exist, e.g. shared rack temperature), so simultaneous mass hardware failure is unlikely. Traditional response is per-component redundancy (RAID, dual power supplies, hot-swap CPUs, batteries + diesel generators). But as systems use more machines and cloud VMs (e.g. AWS instances) can vanish without warning, the field shifts toward system-level fault tolerance that survives loss of whole machines — which also enables rolling upgrades (patch node-by-node without full-system downtime; see ch. 4) instead of planned single-server downtime.
- **Applicability:** Use for capacity/reliability planning, sizing spare/replacement rates, and justifying a move from single-node redundancy to multi-node fault tolerance for high-availability or large fleets.
- **Limits:** MTTF figures are population averages, not per-drive guarantees, and vary by model/vintage; the 1-failure/day figure is illustrative for a 10k-disk fleet. Independence assumption breaks under common-cause events.
- **Pages:** 28, 29

---

## ddia-ch01-ku04 — Mitigating software (systematic) and human faults
- **Type:** checklist
- **Problem:** How do you reduce correlated software bugs and operator mistakes, which cause more outages than random hardware faults?
- **Content:** Software faults are systematic and correlated across nodes, so they cause far more system failures than uncorrelated hardware faults (examples: a bad-input crash such as the 30 June 2012 leap-second Linux kernel bug, runaway resource exhaustion, a slow/corrupt dependency, cascading failures). No quick fix exists; helpful practices: carefully examine assumptions and interactions, thorough testing, process isolation, allowing processes to restart after crashes, and measuring/monitoring/analyzing production behavior — including continuous self-checks that alert on invariant violations. For human error, operator config mistakes were the leading cause of outages in one large-internet-services study, with hardware faults implicated in only 10–25% of cases. Combine several approaches: (1) design abstractions/APIs/admin interfaces that make the right thing easy and the wrong thing hard (without over-constraining, or people route around them); (2) decouple error-prone spots from where errors cause failure — provide a full-featured non-production sandbox with real data; (3) test thoroughly at all levels, unit to whole-system and manual, especially edge cases; (4) enable fast, easy recovery — quick config rollback, gradual code rollout, data-recomputation tools; (5) set up detailed, clear monitoring (telemetry) of performance metrics and error rates; (6) invest in management practices and training.
- **Applicability:** Use as a reliability-engineering checklist when hardening a service, designing admin tooling, planning rollout/rollback, or writing an incident-prevention plan.
- **Limits:** Practices are advisory, not guarantees; the 10–25% hardware-role figure comes from a specific study and era. Over-constrained interfaces backfire — balance is the hard part.
- **Pages:** 29, 30, 31

---

## ddia-ch01-ku05 — Twitter timeline fan-out: read-time merge vs write-time fan-out vs hybrid
- **Type:** case-pattern
- **Problem:** How do you scale a feed/timeline when the bottleneck is fan-out (each write must reach many readers), not raw write volume?
- **Content:** Twitter's load parameters (Nov 2012): tweet posts ~4,600 req/s (peak >12,000 req/s), home-timeline reads ~300,000 req/s. The bottleneck is the fan-out ratio, not tweet count. Approach 1 (read-time merge): store each tweet in a global collection; a timeline read joins the user's follows, gathers their tweets and merges by time (a SQL JOIN across tweets/users/follows). Approach 2 (write-time fan-out): maintain a per-user home-timeline cache (like a mailbox); on post, look up all followers and insert the tweet into every follower's cache, making reads cheap because results are precomputed. Twitter moved from approach 1 to approach 2 because read rate exceeds write rate by ~two orders of magnitude — so do more work at write time. Cost of approach 2: average tweet fans out to ~75 followers, so 4,600 tweets/s means ~345,000 writes/s into timeline caches, and celebrity accounts (>30M followers) can trigger >30M writes for a single tweet, hard to deliver within Twitter's ~5-second target. Final design is hybrid: fan out most users' tweets at write time, but exclude celebrities and merge their tweets in at read time (approach-1 style), giving consistently good performance in all cases.
- **Applicability:** Reach for this when choosing between precompute-on-write vs compute-on-read for feeds, notifications, aggregations; the read/write ratio and fan-out skew drive the decision. The hybrid split by outlier accounts is the reusable move.
- **Limits:** Numbers are Twitter's 2012 figures and illustrative; the right load parameter (here follower-count distribution weighted by tweet frequency) is app-specific. Hybrid adds implementation complexity.
- **Pages:** 32, 33, 34, 35, 36

---

## ddia-ch01-ku06 — Describe response time as a percentile distribution, not an average
- **Type:** methodology
- **Problem:** How should you measure and specify service performance so it reflects real user experience?
- **Content:** Treat response time as a distribution, not a single number. Distinguish latency (время ожидания — the duration a request waits before being serviced) from response time (время отклика — what the client sees: service time plus network delays and queueing). Avoid the arithmetic mean: it hides how many users actually saw a given delay. Use percentiles: median = p50 (half of requests faster); higher percentiles p95, p99, p999 are thresholds under which 95%/99%/99.9% of requests complete. Upper percentiles are "tail latencies" and directly shape user experience — e.g. Amazon specifies internal-service response times at the 99.9th percentile even though it affects only 1 in 1,000 requests, because the slowest requests often belong to the most valuable customers (most data). Business impact cited: +100 ms response time cut Amazon sales ~1%; a 1 s slowdown dropped user satisfaction ~16%. Optimizing p99.99 (slowest 1 in 10,000) is usually too costly for too little benefit. Percentiles are used in SLOs and SLAs (e.g. "median <200 ms and p99 <1 s, normal ≥99.9% of the time"). Tail latency compounds: when one user request triggers multiple backend calls, even a small fraction of slow calls makes a larger fraction of end-user requests slow ("tail latency amplification"); head-of-line blocking means a few slow requests delay those queued behind them, so measure response time on the client side, and load generators must send requests independently of response time or they artificially shrink queues.
- **Applicability:** Use when defining SLO/SLA targets, building latency dashboards, load-testing, or debugging tail latency in fan-out microservice calls.
- **Limits:** Choosing which percentile to target is a cost/benefit call; very high percentiles are dominated by uncontrollable random events. Server-side-only measurement misses queueing/HOL blocking.
- **Pages:** 37, 38, 39, 40, 41

---

## ddia-ch01-ku07 — Never average percentiles; aggregate via histograms
- **Type:** heuristic
- **Problem:** How do you compute and combine response-time percentiles across time windows and machines correctly and cheaply?
- **Content:** Averaging percentiles — to lower time resolution or to combine data from several machines — is mathematically meaningless; the correct way to aggregate response-time data is to add histograms. For efficient ongoing monitoring, compute percentiles over a rolling window (e.g. response times of the last 10 minutes, recomputed each minute). A naive implementation keeps a sorted list per window; if that is too expensive, use approximate-percentile algorithms with low CPU/memory cost: forward decay, t-digest, and HdrHistogram.
- **Applicability:** Use when implementing latency metrics pipelines, combining per-node p99s into a fleet-wide figure, or picking a percentile-estimation library.
- **Limits:** Approximate algorithms trade exactness for cost; still need per-node histograms retained to aggregate correctly.
- **Pages:** 40

---

## ddia-ch01-ku08 — Scaling approaches and maintainability principles
- **Type:** tradeoff-table
- **Problem:** How do you choose between scaling up and scaling out, and what design principles reduce long-term maintenance cost?
- **Content:** Scaling axes: vertical scaling (переход на более мощную машину — scale up) vs horizontal scaling (распределение нагрузки по нескольким машинам — scale out), the latter also called a shared-nothing architecture. Single-machine systems are simpler but high-end machines get expensive fast, so heavy workloads usually force some horizontal scaling; good architecture is a pragmatic mix. Systems may be elastic (automatically add resources on detecting load) vs manually scaled (a human decides) — elastic suits unpredictable load, manual is simpler with fewer operational surprises. Stateless services distribute easily; making stateful data systems distributed is much harder, so historically you kept a database on one node (scale up) until cost or high-availability needs forced distribution. There is no one-size-fits-all "magic scaling sauce" — the right architecture depends on which load parameter dominates (reads, writes, data volume, complexity, response-time, access patterns), so it rests on assumptions about which operations are common; wrong assumptions waste or backfire the scaling effort. On maintainability, three design principles: operability (make it easy for ops to keep the system running smoothly — good monitoring, automation support, no dependence on individual machines, good docs and predictable behavior), simplicity (manage complexity so new engineers can understand it — remove accidental complexity, per Moseley & Marks accidental complexity arises from the implementation not the problem itself, the main tool being good abstraction), and evolvability / extensibility / modifiability (make future change easy — tied to simplicity; Agile practices like TDD and refactoring help at the small scale).
- **Applicability:** Use when deciding scale-up vs scale-out, choosing elastic vs manual capacity, sequencing when to distribute a database, and when arguing for simplicity/abstraction work in maintainability reviews.
- **Limits:** Scaling architecture is highly app-specific; premature scaling for hypothetical future load is discouraged over shipping working features early. Maintainability principles are guiding aims, not concrete algorithms.
- **Pages:** 42, 43, 44, 45, 46, 47
