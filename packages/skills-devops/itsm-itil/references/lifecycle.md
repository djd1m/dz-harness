# ITSM lifecycle — state machines & linkage

## State machines

**Incident** (goal: restore service fast)
```
open ──▶ mitigated ──▶ resolved ──▶ closed
  └────────────────────────────────▶ closed (duplicate / not-an-incident)
```

**Problem** (goal: remove the root cause)
```
open ──▶ known-error ──▶ verifying ──▶ closed
  │          │              ▲
  │          └──────────────┘ (fix released → awaiting confirmation)
  └──▶ parked (blocked on upstream / suspended)  ─┐
        ▲──────────────────────────────────────────┘ (unblock → open)
```
- **open** — under investigation, root cause not yet confirmed.
- **known-error** — root cause confirmed, workaround documented, fix NOT yet released.
- **verifying** — fix released, awaiting user/operational confirmation (WSJF weight 0).
- **parked** — blocked on upstream or deliberately suspended (WSJF weight 0).
- **closed** — fix confirmed effective (or won't-fix with rationale).

**Change / RFC** (goal: make the corrective change safely)
```
proposed ──▶ approved ──▶ released ──▶ closed
   └──────────────────────────────────▶ rejected
```

## Linkage (the ITIL graph)

- An **incident** may link to a **problem** (`problem: NNN`) when it's recurring/unexplained.
- A **problem** links the incidents it explains (`incidents: [012, 019]`) and, once fixed, the **change** that resolves it (`change: 007`).
- A **known-error** is just a problem in the `known-error` state — it carries a **workaround** field.
- A **change** links back to the problem(s)/incident(s) it addresses.

Front-matter on every ticket:
```yaml
---
id: 042
type: problem            # incident | problem | change
state: known-error
title: "N+1 query storm under cart load"
severity: high           # incidents/problems
incidents: [012, 019]    # problems link their incidents
change: 007              # the corrective RFC, once raised
workaround: "cap concurrent cart sessions at 200 via feature flag"
---
```

## Routing heuristic

| Symptom | Record |
|---------|--------|
| Something is broken right now | **Incident** (restore first) |
| The same thing breaks repeatedly | **Problem** (link the incidents) |
| We know why but haven't shipped the fix | **Known-error** (state of a problem) + workaround |
| We're going to change something to fix it | **Change / RFC** |
