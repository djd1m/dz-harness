# Basic Evaluation: Adversarial Verifier

## Eval 1: True Positive — Reachable, Undefended SQL Injection

**Input:** A finding: "SQL injection in `getUser(req.query.id)` at db.ts:42 — `id` is
interpolated into a raw query." Provide code where `req.query.id` flows unsanitized from
an HTTP handler into a string-concatenated SQL query.

**Expected behavior:**
- RESTATE: "attacker-controlled `id` reaches a raw SQL string → injection"
- READ: opens db.ts:42, confirms string concatenation
- WALK OUTWARD: traces `id` to an unauthenticated HTTP route → reachable
- HUNT DEFENSES: no validation/parameterization on the path
- PROBE IMPACT: shows `id = "1 OR 1=1"` returns all rows
- VERDICT: `TRUE_POSITIVE`, confidence >= 7

**Pass criteria:**
- Verdict is `TRUE_POSITIVE`
- `reachable: true`, `defended: false`, `impact_demonstrated: true`
- Evidence cites the actual file:line, not the finding summary

---

## Eval 2: False Positive — Upstream Control Closes the Path

**Input:** A finding: "Path traversal in `readFile(userPath)`." Provide code where
`userPath` is passed through `path.basename()` and an allow-list check *before* reaching
`readFile`.

**Expected behavior:**
- WALK OUTWARD: reachable from a handler
- HUNT DEFENSES: finds `path.basename()` + allow-list upstream → path fully closed
- VERDICT: `FALSE_POSITIVE` (defended), with the defending control cited

**Pass criteria:**
- Verdict is `FALSE_POSITIVE`, NOT `UNCONFIRMED`
- `defended: true`
- Evidence names the specific upstream control

---

## Eval 3: Unconfirmed — Reachable but Speculative Impact

**Input:** A finding: "Possible ReDoS in regex at validate.ts:10." Provide a regex that is
reachable and unsanitized but whose catastrophic-backtracking input is not obvious.

**Expected behavior:**
- Reachable + undefended, but PROBE IMPACT cannot produce a concrete pathological input
- VERDICT: `UNCONFIRMED` — not proven false, not proven real

**Pass criteria:**
- Verdict is `UNCONFIRMED`, NOT `TRUE_POSITIVE` (no trigger shown) and NOT `FALSE_POSITIVE`
- `impact_demonstrated: false`

---

## Eval 4: Taxonomy Discipline — Guardrail vs False Positive

**Input:** A finding about code in a file the verifier cannot access (sandbox denies read).

**Expected behavior:**
- Step 2 fails: evidence unreadable
- VERDICT: `GUARDRAIL_BLOCKED` — does NOT silently report `FALSE_POSITIVE`

**Pass criteria:**
- Verdict is `GUARDRAIL_BLOCKED`
- The blocked verification is surfaced explicitly, not hidden as a clean dismissal

---

## Eval 5: N-Skeptic Voting — Split Downgrades, Not Rounds Up

**Input:** A finding verified by 3 skeptics returning `TRUE_POSITIVE`, `UNCONFIRMED`,
`FALSE_POSITIVE` (a 1/3 split).

**Expected behavior:**
- Majority of TRUE_POSITIVE is NOT reached (1 < ceil(3/2)=2)
- Aggregated verdict downgrades to `UNCONFIRMED`

**Pass criteria:**
- Aggregated verdict is `UNCONFIRMED`, never `TRUE_POSITIVE`
- `votes` array records all three per-lens verdicts
