# Evals: problem-management

Scenarios validating ITIL Problem Management behavior. Methodology adapted from
@windyroad/itil (MIT).

## Eval 1: Incident → problem promotion
**Input:** A resolved SEV2 ("payment timeouts, fixed by restart") with incident id
INC-204. User asks to open a problem to find the root cause.
**Expected:** A problem record created with status `open`, a one-line problem
statement (symptom, not a guessed cause), `linked_incidents: ["INC-204"]`,
`proactive: false`, severity set. No root cause is fabricated at capture time
(root_cause null or unconfirmed). PM-003 passes via the incident link.

## Eval 2: Known-error with documented workaround
**Input:** Root cause confirmed (missing cache invalidation on delete, with evidence:
commit SHA + reproduction test) and a workaround exists ("manually purge user from Redis").
User transitions the problem to known-error.
**Expected:** status `known-error`, `root_cause.confirmed: true` with non-empty
evidence, `workaround` non-empty. Passes PM-004 and PM-005. The record is now
consumable as an on-call mitigation reference.

## Eval 3: WSJF ranking of 3 problems
**Input:** Three known errors to prioritize:
- P-12: cost_of_delay 20, job_size 2
- P-09: cost_of_delay 12, job_size 3
- P-15: cost_of_delay 8, job_size 8
**Expected:** scores computed as cost_of_delay / job_size → P-12 = 10.0, P-09 = 4.0,
P-15 = 1.0; backlog ranked P-12 > P-09 > P-15. P-12 is worked first despite P-15
having a non-trivial cost. PM-007 confirms each score equals CoD / job_size.

## Eval 4: Proactive problem with no incident
**Input:** A code review surfaces an unbounded retry loop that could melt a
downstream service but has caused no incident yet. User opens a problem for it.
**Expected:** problem created with `proactive: true` and empty `linked_incidents`.
PM-003 passes precisely because `proactive` is true (it would FAIL if proactive
were false with no linked incidents).

## Eval 5: Premature-close rejection
**Input:** User tries to set status `closed` on a problem whose `resolution.verified`
is false and which has no "no-longer-relevant" evidence.
**Expected:** the close is REJECTED by PM-006. The skill explains that closing
requires a verified fix and recommends either verifying the fix first (→ via
`verifying`) or parking the problem with a documented `parked_reason` (PM-009) if
it is being deferred.

## Eval 6: 5 Whys reaches a process root cause
**Input:** "checkout API returned 500s for 12 minutes" — user asks for root-cause analysis.
**Expected:** the skill applies 5 Whys, chains symptom → OOM kill → unbounded heap →
unbounded cache → no review checklist for cache sizing, and identifies the **process
gap** as the root cause (not just the code line). Evidence is cited per item; the
permanent fix targets the root cause, not the symptom (PM-010 warns if evidence is empty).
