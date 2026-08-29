---
name: ddia-reliability-scalability-foundations
description: >
  Project-START non-functional axes: reliability, scalability, maintainability — decide which quality
  attributes to optimize and how to quantify them (load parameters, throughput vs response time,
  p95/p99 tail-latency SLOs, fault vs failure, redundancy vs fault-prevention). This is the requirements/SLO
  layer ONLY — NOT which data model or DB family (→ ddia-data-model-selection), NOT which storage engine
  or index (→ ddia-storage-engine-tradeoffs). Triggers (RU+EN): "нефункциональные требования",
  "надёжность масштабируемость сопровождаемость", "параметры нагрузки", "перцентиль p99 хвостовая задержка",
  "отказ vs сбой", "reliability scalability maintainability", "load parameters", "p99 tail latency SLO",
  "fault vs failure", "scale up vs scale out".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
derived_from: [ddia-ch01-ku01, ddia-ch01-ku02, ddia-ch01-ku03, ddia-ch01-ku04, ddia-ch01-ku05, ddia-ch01-ku06, ddia-ch01-ku07, ddia-ch01-ku08]
---

# Reliability, Scalability & Maintainability Foundations — pick which non-functional axes to optimize, and how to measure them

## Output
A framing recommendation for the non-functional axes: which fault types to tolerate vs prevent,
scale-up vs scale-out, and how to specify latency as percentiles — with the гл.1 facts backing it —
folded into the ADR or the opening of an architecture review.

## When to use / NOT
- Use when: starting an architecture RFC, SLO/SLA definition, or reliability review and you need to
  (a) frame the three design axes concretely, (b) decide whether to prevent or tolerate faults,
  (c) choose scale-up vs scale-out and elastic vs manual, (d) size hardware-failure expectations,
  (e) specify and aggregate latency as percentiles, or (f) pick a feed/fan-out strategy by read/write ratio.
- NOT for: choosing a data model (→ ddia-data-model-selection), storage-engine internals
  (→ ddia-storage-engine-tradeoffs), or replication topology and consistency guarantees
  (→ ddia-replication-topology-choice, ddia-distributed-consistency-consensus). This skill sets the
  *goals*; those siblings make the mechanism decisions that satisfy them.

## Decision criteria

### 1. Which axis are you optimizing? Make each concrete [гл.1, с.27]
- **Reliability** — keeps working correctly under adversity. Make concrete by naming *which fault types*
  you tolerate (hardware / software / human).
- **Scalability** — reasonable strategies to cope with growth. Make concrete by naming *which load
  parameter grows* (reads, writes, data volume, complexity, fan-out).
- **Maintainability** — many people stay productive over time. Make concrete via operability,
  simplicity, evolvability.
- These are non-functional requirements — distinct from functional (store/retrieve/search/process).

### 2. Prevent the fault or tolerate it?
| Situation | Strategy | Why |
|-----------|----------|-----|
| Recoverable faults (hardware crash, process death, bad node) | **Tolerate** — build fault-tolerance so a *fault* never escalates to a *failure*; deliberately inject faults (Chaos Monkey) to exercise recovery paths | Fault probability can't be driven to zero; most big outages come from untested error-handling code [гл.1, с.28-29] |
| Security breach / confidential-data exfiltration | **Prevent** — there is no cure once data has leaked | Nothing can undo exfiltration [гл.1, с.29] |
Only ever claim tolerance to *specific* fault types — "tolerate all faults" is impossible.

### 3. Which fault class dominates? Size and mitigate accordingly
| Fault class | Correlation across nodes | Frequency signal | Primary mitigation |
|-------------|--------------------------|------------------|--------------------|
| Hardware | Largely independent | Disk MTTF ~10–50 yr → ~1 failure/day per 10,000 disks | Redundancy → shift to system-level multi-node fault tolerance as fleet grows / cloud VMs vanish [гл.1, с.28-29] |
| Software (systematic) | Correlated → causes more failures | Triggered by bad input/state (e.g. leap-second bug), resource exhaustion, cascades | Check assumptions, process isolation, restart-after-crash, monitor invariants [гл.1, с.29-30] |
| Human | — | Leading outage cause; hardware only 10–25% of cases | Make right thing easy (good APIs), sandbox with real data, test edge cases, fast rollback/gradual rollout, telemetry, training [гл.1, с.30-31] |

### 4. Scale up or scale out? [гл.1, с.42-43]
| Choose | When |
|--------|------|
| **Vertical (scale up)** — bigger machine | Simpler; fine until cost curve or HA needs bite. Default for stateful DBs — keep single-node as long as feasible |
| **Horizontal (scale out / shared-nothing)** | Heavy workloads, high availability, cost of big iron. Stateless services distribute easily; distributed *stateful* data is much harder |
| **Elastic (auto-add on load)** | Highly unpredictable load |
| **Manual scaling** | Predictable load; fewer operational surprises |
Good architecture is a pragmatic mix. There is no "magic scaling sauce" — the right design depends on
*which load parameter dominates*, so it rests on assumptions about common operations. Don't scale
prematurely for hypothetical load over shipping features.

### 5. Precompute-on-write vs compute-on-read (feeds / fan-out) [гл.1, с.32-36]
| Approach | Pick when | Cost |
|----------|-----------|------|
| **Read-time merge** (global collection + JOIN at read) | Write rate ≈ or > read rate; heavy fan-out on rare accounts | Expensive reads |
| **Write-time fan-out** (per-user precomputed cache/mailbox) | Read rate ≫ write rate (Twitter: ~300k reads/s vs ~4.6k posts/s → do work at write time) | Write amplification (~75× avg; celebrity >30M writes/tweet) |
| **Hybrid** (fan-out most users at write; merge outliers at read) | Fan-out is skewed by a few extreme accounts | Extra implementation complexity — but consistent performance |
The reusable move: **split by the outlier and treat it the opposite way**.

### 6. Specify performance as a percentile distribution, never a mean [гл.1, с.37-40]
- Report p50 (median), p95, p99, p999 — upper percentiles are *tail latencies* and shape UX.
- Amazon targets p99.9 internally: slowest requests often belong to the most valuable (most-data) customers.
- Measure **client-side** (captures queueing / head-of-line blocking); load generators must send
  requests independently of response time or they shrink queues artificially.
- Beware **tail-latency amplification**: one user request fanning out to many backends makes a larger
  fraction of end-user requests slow.

## Key facts & formulas
- Three core concerns: **reliability, scalability, maintainability** = non-functional requirements [гл.1, с.27].
- **fault ≠ failure**: fault = one component off-spec; failure = whole system stops serving users [гл.1, с.27].
- Disk **MTTF ≈ 10–50 years**; heuristic: **10,000 disks → ~1 failure/day** [гл.1, с.28].
- Human config error is the **leading** outage cause; hardware faults implicated in only **10–25%** of cases [гл.1, с.30].
- Twitter (Nov 2012): posts **~4,600 req/s** (peak >12,000), home-timeline reads **~300,000 req/s**; avg fan-out **~75 followers**; celebrities **>30M followers** [гл.1, с.32-34].
- Business impact: **+100 ms → ~1% sales drop** (Amazon); **1 s slowdown → ~16% satisfaction drop** [гл.1, с.38].
- **latency** = wait before service; **response time** = client-observed (service + network + queueing) [гл.1, с.37].
- **Never average percentiles** — aggregate by **adding histograms**; rolling-window percentiles via forward decay, t-digest, HdrHistogram [гл.1, с.40].
- Maintainability principles: **operability, simplicity** (remove accidental complexity via abstraction), **evolvability** [гл.1, с.44-46].

## Anti-patterns
| Anti-pattern | Why it fails | Source KU |
|--------------|--------------|-----------|
| Treating definitions as a design method | Each axis must be made concrete per system (which fault types / which load parameter) | ku01 |
| Fault injection without recovery mechanisms or a bounded blast radius | You test nothing and risk a real outage; and no tolerance applies to confidentiality breaches | ku02 |
| Assuming independent hardware failures always | Common-cause events (shared rack temperature, power) break independence; MTTF is a population average | ku03 |
| Over-constraining admin interfaces to prevent human error | People route around rigid tools; balance ease-of-right-thing with flexibility | ku04 |
| Using one fan-out strategy for all accounts | Celebrity fan-out (>30M writes/tweet) blows the latency target — split outliers out | ku05 |
| Specifying performance with the mean | Hides how many users saw a delay; optimizing p99.99 is usually too costly for the benefit | ku06 |
| Averaging p99s across machines/time; server-side-only measurement | Mathematically meaningless; misses queueing / head-of-line blocking | ku07 |
| Premature scale-out for hypothetical load | Wrong load-parameter assumptions waste or backfire the effort; ship features first | ku08 |

## Related decisions
- Chose multi-node system-level fault tolerance here → **ddia-replication-topology-choice**: replication
  is the mechanism that survives whole-machine loss and enables rolling upgrades.
- Chose horizontal / shared-nothing scale-out here → **ddia-partitioning-strategy**: partitioning is how
  you actually distribute stateful data across nodes.
- Set availability/consistency goals here → **ddia-distributed-consistency-consensus**: those goals
  constrain which consensus/consistency guarantees you can afford.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 1.
KUs: ddia-ch01-ku01, ddia-ch01-ku02, ddia-ch01-ku03, ddia-ch01-ku04, ddia-ch01-ku05, ddia-ch01-ku06,
ddia-ch01-ku07, ddia-ch01-ku08. Deep reference: references/knowledge-units.md.
Anchor quotes for spot-check: "fault ... one component deviating from spec; failure ... whole system stops" [гл.1, с.27]; "10,000 disks should expect about one disk failure per day" [гл.1, с.28].

## Self-check
- [x] Every criterion traces to a listed KU (ku01–ku08 all cited in sections/anti-patterns).
- [x] Facts carry page anchors [гл.1, с.X].
- [x] trust_tier 0 (machine-distilled, unreviewed).

## Examples
- «vertical или horizontal scaling?» → scale up by default for stateful DBs, scale out when a specific load parameter forces it, cites гл.1.
- "how should we specify the latency SLO?" → a percentile distribution (p95/p99/p999) measured client-side, never a mean.
- «предотвращать сбой или терпеть его?» → tolerate recoverable faults (Chaos Monkey exercises recovery), prevent confidentiality breaches (no cure once leaked).
