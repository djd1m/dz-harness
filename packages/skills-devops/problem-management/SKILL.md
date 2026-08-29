---
name: problem-management
description: >-
  ITIL Problem Management — eliminate the ROOT CAUSES behind recurring incidents
  and run a prioritized known-error backlog. Distinct from incident-response
  (which restores service); this skill finds and removes the underlying defect.
  Triggers on "problem management", "root cause", "RCA", "known error",
  "post-incident analysis", "recurring incidents", "RCA backlog", "5 whys",
  "fishbone", "WSJF", "problem record", "why does this keep happening".
trust_tier: 1
trust_tier_label: "Structured"
source: "@windyroad/itil (MIT) — adapted, not verbatim"
tags: [devops, itil, problem-management, root-cause, known-error, wsjf, rca, reliability]
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# problem-management

Problem Management is the ITIL practice of reducing the **likelihood and impact**
of incidents by identifying and eliminating their **root causes**, and by managing
the **known errors** and workarounds that come out of that analysis.

Incident Management asks *"How fast can we restore service?"*
Problem Management asks *"Why did this happen, and how do we stop it forever?"*

A **problem** is the unknown (or now-known) underlying cause of one or more
incidents. Restarting a pod ends an incident; figuring out *why the pod ran out
of memory and ensuring it never does again* is problem management.

This skill is **self-contained and tool-agnostic**. Keep problem records as plain
markdown, issues, rows in a tracker — anywhere. No specific directory layout, no
scripts, and no external service are required.

> Methodology credit: adapted from the **@windyroad/itil** plugin (MIT license).
> Concepts (problem lifecycle, known-error records, WSJF prioritization,
> incident→problem linkage) are reproduced and adapted here, not copied verbatim.
> ITIL® is a registered trademark of AXELOS Limited.

## When to Use

- An incident has been resolved and you need to find and remove the underlying cause
- The same class of incident keeps recurring (third 5xx spike this month)
- A post-incident review (post-mortem) surfaces action items that need owners and tracking
- You have a backlog of known defects and need to decide what to fix first (prioritization)
- You found a latent defect proactively — before it ever caused an incident
- You need to record a workaround so on-call can mitigate the same incident faster next time
- You need to track a defect from "we don't know why" → "fixed and verified"

## When NOT to Use

- **A system is down or degrading RIGHT NOW** → use **incident-response**. Restore
  service first; do root-cause work afterward. Firefighting and root-cause analysis
  are different jobs done at different times.
- **Routing a single ad-hoc bug** through normal development with no recurrence risk
  and no incident history — just file a ticket.
- **General retrospectives** about team process (not a technical defect) → use **retrospective**.
- **Risk identification before anything has happened** → use **risk-assessment** to find
  risks; promote a confirmed latent defect into a *proactive problem* here.

## Overview

### Incident vs. Problem

| | Incident | Problem |
|---|---|---|
| Question | How do we restore service? | Why did this happen? |
| Goal | Minimize downtime | Eliminate root cause |
| Time pressure | Now, real-time | Deliberate, backlog-paced |
| Output | Service restored, timeline | Known-error record, permanent fix |
| Owner | Incident Commander | Problem owner |
| Many-to-one | Many incidents... | ...can share one problem |

One problem can be the root cause of *many* incidents. Linking incidents to a
single problem is what reveals that "five separate outages" were actually "one
unfixed defect firing repeatedly."

### Problem Lifecycle

Every problem record moves through these states:

| Status | Meaning | Entry criteria |
|---|---|---|
| **open** | Suspected cause not yet confirmed; investigation needed | Created from an incident, post-mortem, or proactive finding |
| **under-investigation** | Actively running root-cause analysis | Someone owns it and is gathering evidence |
| **known-error** | Root cause **confirmed** AND a workaround is **documented**; permanent fix not yet shipped | Root cause documented with evidence + workaround written down |
| **verifying** | Permanent fix has shipped; awaiting confirmation it actually worked | Fix released to the affected environment |
| **closed** | Fix verified to resolve the problem, OR the problem is provably no longer relevant | Verification confirmed, or evidence the cause no longer exists |
| **parked** | Deliberately suspended (blocked upstream, out of appetite, deferred) | A documented reason; excluded from the active backlog ranking |

A **known error** is the load-bearing artifact: a record of a problem whose root
cause is understood and for which a workaround exists. It lets on-call mitigate
fast while the permanent fix is still being built. **Never** mark something a
known error without both (a) a confirmed root cause and (b) a documented workaround.

## Procedure

The flow is: **capture → investigate → known-error → fix/verify → close**.

### Step 1 — Capture

Create a problem record the moment a root cause is worth pursuing. Capture should
be cheap — a title, a one-line statement, and the link to the triggering incident(s).

- Give it a stable **id** and a human-readable **title**.
- Write a one-sentence **problem statement** (the symptom, not a guessed cause).
- **Link the triggering incident(s)** under `linked_incidents`. If there is no
  incident — you found this proactively — explicitly mark it `proactive: true`.
- Set initial **severity** and status `open`.
- Do *not* guess the root cause yet. Capture the symptom; investigate later.

### Step 2 — Investigate (root-cause analysis)

Move the record to `under-investigation` and assign an owner. Apply the
root-cause discipline below (5 Whys / Ishikawa). The output is a **confirmed,
evidence-backed root cause** — not a hypothesis.

- Read source, logs, metrics, recent changes; reproduce the failure if you can.
- Record **evidence**, not opinions. Every causal claim cites a log line, a
  commit, a metric, or a reproduction.
- A failing test that reproduces the defect is the gold standard of evidence.

### Step 3 — Known-error (root cause + workaround)

Once the root cause is confirmed **and** a workaround is documented, transition to
`known-error`. This is a hard gate:

- **Root cause** field is populated with evidence.
- **Workaround** field describes how on-call mitigates the incident now (even
  "delete and re-enter the record" counts as a workaround).
- The known-error record is now consumable by incident-response: next time the
  same incident fires, the workaround is already written down.

### Step 4 — Fix & verify

Propose and ship the **permanent fix** that removes the root cause (not the
workaround). When the fix is released, transition to `verifying`.

- Re-enable / write the reproduction test; it should now pass.
- Record what shipped (version, commit, deploy) in `resolution`.
- Do not skip straight to `closed` — verification is a distinct state.

### Step 5 — Close

When the fix is **verified** to have resolved the problem, transition to `closed`.

- Closing requires a *verified* fix (or documented evidence the cause no longer
  exists, e.g. the affected component was deleted).
- **Premature close is an anti-pattern**: a problem with no verified fix and no
  "no-longer-relevant" evidence must NOT be closed. Park it instead if it is
  being deferred.

At any point a problem may be moved to `parked` with a documented reason
(blocked upstream, no appetite this quarter). Parked problems are excluded from
backlog ranking until un-parked.

## WSJF Prioritization

The known-error/problem backlog is ranked with **Weighted Shortest Job First
(WSJF)** — fix the things that deliver the most value per unit of effort first.

The canonical WSJF formula:

```
WSJF = Cost of Delay / Job Size
```

- **Cost of Delay (CoD)** — what it costs the business to leave this problem
  unfixed. For problems, derive it from **severity = impact × likelihood**:
  - *Impact*: how bad is each incident this problem causes? (data loss, revenue,
    user count, reputation)
  - *Likelihood*: how often does it fire? (recurrence frequency)
  - Higher impact and higher recurrence ⇒ higher cost of delay.
- **Job Size** — the estimated effort to ship the permanent fix
  (e.g. XS=1, S=2, M=3, L=5, XL=8). Smaller jobs rank higher for the same CoD.
- **Score** = `cost_of_delay / job_size`. Rank the backlog by descending score.

Scoring guidance:
1. Score **cost of delay** on a relative scale (e.g. 1–25 from an impact×likelihood
   matrix). Use the same scale across all problems so they compare.
2. Score **job size** as a relative effort estimate; default to M when unknown.
3. **Known errors** can be treated as cheaper-per-value than open problems — the
   diagnostic uncertainty is already gone — so a team may weight CoD up (or job
   size down) once a problem reaches `known-error`. Keep the weighting consistent.
4. Effort is a **live estimate**. Re-score when root cause narrows or widens scope.
5. `verifying` and `parked` problems are **excluded** from the ranked backlog —
   their remaining work is verification or is suspended, not dev effort.

Worked example (rank these three):

| Problem | Impact×Likelihood (CoD) | Job Size | WSJF | Rank |
|---|---|---|---|---|
| P-12 known-error, 5xx on checkout | 20 | 2 (S) | 10.0 | 1 |
| P-09 nightly job OOM | 12 | 3 (M) | 4.0 | 2 |
| P-15 rare log-rotation race | 8 | 8 (XL) | 1.0 | 3 |

P-12 wins despite P-15 having a real cost — small job + high CoD beats high
effort. Fix P-12 first.

## Root-Cause Analysis

The discipline that separates problem management from guesswork. ITIL v4 is
technique-agnostic — it does not mandate a specific RCA method but lists several
as examples. Two of the most widely used industry techniques:

### 5 Whys

Ask "why" repeatedly until you reach a cause you can actually fix.

```
Incident: checkout API returned 500s for 12 minutes.
Why? — The pod was OOM-killed.
Why? — Heap grew unbounded under load.
Why? — Response objects were cached without an eviction policy.
Why? — The cache was added for a demo and never bounded.
Why? — No review checklist item for cache sizing.   ← root cause (process)
```

Stop when the next "why" leaves your span of control. Often the real root cause
is a *process* gap, not just the code line.

### Ishikawa (Fishbone)

For incidents with many contributing factors, group candidate causes by category
(People, Process, Technology, Data, Environment, External). Useful when 5 Whys
branches — a fishbone holds multiple causal threads at once and prevents tunnel
vision on the first plausible cause.

### Evidence discipline

- **No causal claim without evidence.** Cite the log line, commit SHA, metric, or
  reproduction. "Probably the deploy" is a hypothesis, not a root cause.
- **Reproduce before you conclude.** A failing test that reproduces the defect is
  proof; it also becomes the verification gate for the fix.
- **Distinguish root cause from contributing factors.** Fix the root cause; note
  the contributing factors as separate (possibly proactive) problems.
- **Confirmation, not the first plausible story.** Stop only when removing the
  identified cause would actually prevent recurrence.

## Examples

**Incident → problem promotion.** A SEV2 (payment timeouts) is resolved by a
restart. You open problem `P-21` ("Payment service times out under burst load"),
link the incident, set status `open`. Investigation (5 Whys) finds a connection
pool that is never drained → confirmed root cause. You document a workaround
("scale to 4 replicas to dilute pool exhaustion") and move to `known-error`. The
permanent fix (bounded pool + drain on shutdown) ships → `verifying` → after a
week of clean burst traffic → `closed`.

**Known error with workaround.** `P-07` ("Stale cache serves deleted users")
has confirmed root cause (missing cache invalidation on delete) but the fix is a
2-week refactor. You record the workaround "manually purge the user from Redis"
in the known-error so on-call mitigates in seconds. WSJF keeps it in the backlog.

**WSJF ranking.** Three known errors compete for next sprint. You score CoD
(impact×likelihood) and job size for each, compute `CoD/job_size`, and the
highest score is worked first — even though it is not the scariest-sounding one.

**Proactive problem.** A code review spots an unbounded retry loop that *could*
melt a downstream service but hasn't yet. You open `P-30` with `proactive: true`,
no `linked_incidents`, and let WSJF decide when to fix it before it bites.

## Anti-Patterns

- **Doing problem management during an incident.** Restore service first
  (incident-response), then analyze. Root-cause work on a live fire is slow and dangerous.
- **Marking known-error without a workaround.** A known error *is* a documented
  workaround. No workaround ⇒ it is still `under-investigation`.
- **Closing without a verified fix.** No verification, no `closed`. Park it if deferring.
- **Guessing the root cause.** "Probably the network" with no evidence is not a
  root cause. Investigate or stay `open`.
- **Treating symptoms.** Fixing the symptom (bigger pod) without the cause
  (unbounded cache) guarantees the incident returns. The workaround buys time; the
  fix removes the cause.
- **No incident linkage and not flagged proactive.** Every problem either traces
  to ≥1 triggering incident or is explicitly marked `proactive`.
- **Prioritizing by loudest voice.** Use WSJF, not whoever escalated hardest.

## Self-check

Before claiming a problem record is well-formed, confirm:

- [ ] The record has a stable **id**, **title**, **severity**, and a valid **status**.
- [ ] It links ≥1 triggering incident, **or** is explicitly `proactive`.
- [ ] If status is `known-error`: root cause is **confirmed with evidence** AND a
      **workaround** is documented.
- [ ] If status is `closed`: the fix is **verified** (or there is documented
      "no-longer-relevant" evidence). No premature closes.
- [ ] WSJF is computed as `cost_of_delay / job_size`, with both scored on
      consistent scales; `parked`/`verifying` excluded from the ranked backlog.
- [ ] The root cause is backed by evidence (log/commit/metric/reproduction), not a guess.
- [ ] The permanent fix targets the **root cause**, not the symptom or the workaround.
