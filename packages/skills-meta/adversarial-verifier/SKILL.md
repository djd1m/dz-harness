---
name: adversarial-verifier
description: >
  False-positive killer for findings (bugs, vulnerabilities, claims, design assertions).
  Inspired by Visa's vulnerability-agentic-harness Stage 6 — a fresh, skeptical session
  tries to REFUTE each finding rather than confirm it, then classifies it into an explicit
  dismissal taxonomy: TRUE_POSITIVE / FALSE_POSITIVE / UNCONFIRMED / GUARDRAIL_BLOCKED /
  VERIFY_ERROR. Supports N independent skeptics with majority voting. Default verdict is
  refuted unless reachability + impact are both proven.
  Triggers on: "verify this finding", "is this a real bug", "refute this", "false positive
  check", "adversarial review", "prove the exploit", "confirm the vulnerability".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Adversarial Verifier: No Exploit, No Report

A finding produced by a scanner, an LLM, or a teammate is a **candidate**, not a fact.
This skill takes one finding and runs a fresh, adversarial verification pass whose job is
to **disprove** it. A finding survives only when an external entry point is reachable AND
real impact is demonstrated AND no upstream control closes the path. Everything else is
dismissed — but dismissed into a precise category, so "wrong" is never confused with
"unproven" or "tooling broke".

Default to refuted when uncertain. A plausible-but-unverified finding that survives is
worse than a real one that gets a second look.

## When To Activate

Trigger on:
- "verify this finding" / "is this a real bug?"
- "refute this" / "false positive check"
- "adversarial review" / "red-team this finding"
- "prove the exploit" / "confirm the vulnerability"
- A SAST/DAST/lint/LLM finding that needs triage before it reaches a human
- Any claim where a confident-but-wrong answer is expensive

## Core Principle (from VVAH S6)

> A finding is `TRUE_POSITIVE` **only** when *(B)* an external or lower-privileged entry
> point reaches the code, AND *(C/D)* no defense fully neutralizes the path, AND the
> impact is real. Otherwise it is dismissed.

The verifier is a **separate** reasoning pass from whoever produced the finding. It does
not trust the finding's own justification — it re-derives reachability and impact from
primary evidence (the cited file/line, the call chain, the actual inputs).

## Protocol

### Step 1: RESTATE

Restate the finding in falsifiable terms. What exactly is claimed to be true? What would
have to hold for it to be real? If you cannot state a refutable claim, the verdict is
`VERIFY_ERROR` (the finding is too vague to verify).

### Step 2: READ THE EVIDENCE

Go to the cited primary source (file:line, the diff, the data, the reproduction). Do not
verify from the finding's summary — read what it points at. If the citation is missing,
unreadable, or doesn't say what the finding claims → `VERIFY_ERROR`.

### Step 3: WALK OUTWARD (reachability)

Trace the call chain *outward* from the cited code toward entry points. The question is:
can an external or lower-privileged actor actually reach this code with attacker-influenced
input?

- No external/lower-privileged caller reaches it → `FALSE_POSITIVE` (not reachable).
- Reachable only via already-trusted/privileged callers → usually `FALSE_POSITIVE`,
  unless the finding is specifically about privilege escalation.

### Step 4: HUNT DEFENSES

Look *upstream* for controls that neutralize the path: input validation, sanitization,
auth gates, type constraints, framework guarantees, allow-lists.

- An upstream control fully closes the path → `FALSE_POSITIVE`.
- A control narrows but does not close it → keep going; note the residual.

### Step 5: PROBE IMPACT

If reachable and undefended, demonstrate the actual impact. What does an attacker/user
gain? Can you sketch a concrete trigger (input → sink → effect)?

- Real, demonstrable impact → eligible for `TRUE_POSITIVE`.
- Reachable + undefended but impact is speculative or you can't show a trigger →
  `UNCONFIRMED` (not proven false, but not proven real).

### Step 6: GUARDRAIL CHECK

If verification itself was blocked — sandbox refused, you lack access to the code, policy
prevented running the probe, the target is out of scope → `GUARDRAIL_BLOCKED`. Do not
silently downgrade a blocked check to `FALSE_POSITIVE`.

### Step 7: VERDICT

Emit exactly one verdict from the taxonomy, with the evidence that drove it.

## Dismissal Taxonomy (the whole point)

| Verdict | Meaning | When |
|---------|---------|------|
| `TRUE_POSITIVE` | Real and exploitable/valid | Reachable AND undefended AND demonstrable impact |
| `FALSE_POSITIVE` | Genuinely wrong | Not reachable, OR an upstream control closes it, OR the scanner mis-read the code |
| `UNCONFIRMED` | Plausible, not proven | Reachable + undefended but impact is speculative / no trigger shown |
| `GUARDRAIL_BLOCKED` | Couldn't check | Sandbox/policy/access prevented verification — surfaces flaky verification instead of hiding it |
| `VERIFY_ERROR` | Unverifiable as stated | Finding too vague, citation missing/wrong, or verdict unparseable |

**Never collapse these.** `UNCONFIRMED` ≠ `FALSE_POSITIVE` (one is "we don't know", the
other is "we know it's wrong). `GUARDRAIL_BLOCKED` and `VERIFY_ERROR` keep tooling
failures visible rather than masquerading as clean dismissals.

## N-Skeptic Voting (optional, for high-stakes findings)

For findings where a single verifier's error is costly, run N independent skeptics (default
3), each prompted to refute, each blind to the others. Aggregate:

```
survives = count(verdict == TRUE_POSITIVE) >= ceil(N / 2)
```

- Diverse lenses beat redundancy: give each skeptic a distinct angle (reachability /
  upstream-defense / impact-realism) rather than three identical refuters.
- Ties or a split (e.g. 1 TP, 1 UNCONFIRMED, 1 FP) → downgrade to `UNCONFIRMED`, never
  round up to `TRUE_POSITIVE`.
- This composes with a Workflow: fan out the skeptics in parallel, collect verdicts, vote.

## Confidence Floor

Each verdict carries a 1–10 confidence. A `TRUE_POSITIVE` below the floor (default 7) is
downgraded to `UNCONFIRMED` — "we lean real but can't stand behind it". The floor is the
last gate before a finding reaches a human.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Confirmation, not refutation | Verifier restates the finding's own reasoning and agrees | The verifier's job is to REFUTE; default to refuted on uncertainty |
| Collapsing the taxonomy | Everything dismissed becomes "false positive" | Use UNCONFIRMED / GUARDRAIL_BLOCKED / VERIFY_ERROR where they apply |
| Trusting the summary | Verdict derived from the finding's description, not the cited code | Step 2 is mandatory: read the primary evidence |
| Silent guardrail downgrade | A blocked check reported as FALSE_POSITIVE | Blocked verification is GUARDRAIL_BLOCKED, full stop |
| Rounding split votes up | 1 TP + 2 non-TP reported as TRUE_POSITIVE | Majority required; ties → UNCONFIRMED |
| Reachability assumed | "Looks dangerous" without tracing to an entry point | Step 3 must reach an external/lower-privileged caller |

## Output Format

```
## Verdict: <TRUE_POSITIVE | FALSE_POSITIVE | UNCONFIRMED | GUARDRAIL_BLOCKED | VERIFY_ERROR>
Confidence: N/10

### Reachability
[entry point traced, or why it isn't reachable]

### Defenses
[upstream controls found, or "none on the path"]

### Impact
[concrete trigger + effect, or why impact is speculative]

### Evidence
- [file:line or artifact the verdict rests on]
```

When voting:

```
## Aggregated Verdict: <...>  (M/N skeptics agreed)
- Skeptic 1 (reachability lens): <verdict> N/10
- Skeptic 2 (defense lens): <verdict> N/10
- Skeptic 3 (impact lens): <verdict> N/10
```

## Examples

**Single finding (no vote):**
> "Verify this finding: SQL injection in `getUser(req.query.id)` at db.ts:42."

→ Reads db.ts:42, traces `req.query.id` to an unauthenticated route (reachable), finds no
parameterization (undefended), shows `id = "1 OR 1=1"` dumps all rows (impact) →
`TRUE_POSITIVE`, confidence 9.

**Taxonomy discipline:**
> "Is this a real bug? Path traversal in `readFile(userPath)`."

→ Finds `path.basename()` + allow-list upstream → path closed → `FALSE_POSITIVE` (defended),
not `UNCONFIRMED`.

**3-skeptic vote on a high-stakes finding (composes with a Workflow):**
> Fan out reachability/defense/impact lenses → 1 `TRUE_POSITIVE` + 2 `UNCONFIRMED` →
> aggregated `UNCONFIRMED` (majority TP not reached; never round up).

## Dependencies

| Resource | Path | Purpose |
|----------|------|---------|
| schemas/output.json | schemas/output.json | Output validation schema |
| validate-config.json | scripts/validate-config.json | Validation rules |

## Related

- [[pentest-validation]] — full 4-phase pentest pipeline; this skill is the verification stage as a standalone primitive
- [[reflection-loop]] — improves an artifact; this skill judges whether a finding is real
- [[structured-reasoning]] — pick a reasoning strategy; pair with this for the refutation step
- [[brutal-honesty-review]] — harsh critique; this skill formalizes the verdict + taxonomy
