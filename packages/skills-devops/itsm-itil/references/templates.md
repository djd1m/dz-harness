# Ticket templates (Markdown)

Copy a template into the right `docs/<type>/` directory, name it `<NNN>-<slug>.<state>.md`, and fill it
in. Keep the YAML front-matter — it's what makes the lifecycle graph navigable and WSJF-rankable.

## Incident

```markdown
---
id: 012
type: incident
state: open            # open | mitigated | resolved | closed
title: "Checkout 500s under load"
severity: high         # critical | high | medium | low
problem: 042           # link once recognized as recurring (optional)
opened: 2026-06-24
---
## Impact
Who/what is affected, since when, blast radius.
## Timeline
- HH:MM detected … - HH:MM mitigated …
## Mitigation
What restored service (the workaround, not the root-cause fix).
## Follow-up
Link to the problem if recurring/unexplained.
```

## Problem (incl. known-error)

```markdown
---
id: 042
type: problem
state: open            # open | known-error | verifying | parked | closed
title: "N+1 query storm under cart load"
severity: high
incidents: [012, 019]  # the incidents this explains
change: null           # the corrective RFC, once raised
workaround: ""         # REQUIRED once state = known-error
wsjf: { value: 13, time: 8, risk: 5, size: 5 }
opened: 2026-06-24
---
## Symptoms
Observable behaviour + which incidents it caused.
## Root cause
The confirmed underlying defect (5-whys / RCA → see problem-management).
## Workaround
Interim mitigation while the fix is unreleased (fills the `workaround` field).
## Fix
The change that removes the root cause → link the RFC.
```

## Change (RFC)

```markdown
---
id: 007
type: change
state: proposed        # proposed | approved | released | closed | rejected
title: "Add DataLoader batching to cart queries"
problem: 042           # what this change resolves
risk: medium           # from risk-assessment
opened: 2026-06-24
---
## Proposed change
What will change and why.
## Risk & rollback
Assessment (risk-assessment) + rollback plan.
## Validation
How we'll confirm it fixed problem 042 (moves it known-error → verifying → closed).
```
