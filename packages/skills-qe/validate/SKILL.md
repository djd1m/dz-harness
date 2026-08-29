---
name: validate
description: Use before saying "done", "fixed", "all tests pass", before git commit, before creating PRs, or before moving to the next task. Requires running verification commands and confirming output before any success claims.
---

# Verification Before Completion

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

Claiming work is complete without verification is dishonesty, not efficiency.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = unverified claim
```

## What "Done" Actually Means

| Claim | Requires | NOT Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Build succeeds | Build command: exit 0 | Linter passing, "looks good" |
| Bug fixed | Original symptom verified gone | "Code changed, should be fixed" |
| Feature works | Live demonstration or test proof | "Implementation matches spec" |
| Regression test works | Red-green cycle: fail → fix → pass | Test passes once |

**Live proof is the gold standard.** If you can demonstrate the fix working against a running system (curl, browser, REPL) — that's stronger than any unit test. Not always possible, but always preferred.

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit/push without running tests
- Trusting subagent success reports without independent check
- Relying on partial verification (linter passed != build passed)
- Thinking "just this once"
- Presenting partial completion as full ("Frontend works, haven't tested the API" → "Done")
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence != evidence |
| "Linter passed" | Linter != compiler != runtime |
| "Agent said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |
| "Tests pass, feature complete" | Tests passing != requirements met. Re-read the spec. |

## Key Patterns

**Tests:**
```
CORRECT:  [Run test command] → [See the pass/fail counts] → "All tests pass"
WRONG:    "Should pass now" / "Looks correct"
```

**Regression tests (Red-Green):**
```
CORRECT:  Write test → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
WRONG:    "I've written a regression test" (without red-green)
```

**Requirements:**
```
CORRECT:  Re-read plan → Create checklist → Verify each item → Report gaps or completion
WRONG:    "Tests pass, phase complete"
```

**Multi-service changes:**
```
CORRECT:  Build and test EACH affected service → Verify contracts between them
WRONG:    "Changed service A, tests pass" (without checking B and C)
```

## Subagent Validation

After your own checks pass, launch subagent validators for an independent review. You developed blind spots while implementing — fresh eyes catch what you can't.

**Scale effort to task size:**

| Task size | Validators | Focus |
|-----------|-----------|-------|
| Small (single-file fix, config change) | 1 subagent | Correctness + no obvious regressions |
| Medium (multi-file, single service) | 2 subagents | One on correctness/edge cases, one on regression and spec compliance |
| Large (multi-service, architecture change) | 3 subagents | Correctness, regressions/contracts, and adversarial review |

**How to brief them:**
- Describe the task, what was changed, and why
- Point them to specific files and the plan/spec
- Tell them to READ the code independently — not just confirm your summary
- Validators are **read-only**: they report issues, they don't fix
- Ask for structured output: what's correct, what's wrong, what's missing

**Limit: 2 rounds.** Fix issues from round 1, re-validate once. If round 2 still has problems, list remaining issues honestly rather than looping.

## Completion Checklist

Before saying "done":
- [ ] All affected services/modules compile
- [ ] All tests pass (ran fresh, not cached)
- [ ] Live verification done where feasible
- [ ] Changes match the original spec/plan (re-read it)
- [ ] Subagent validation passed (scaled to task size)
- [ ] No unrelated changes bundled in
- [ ] Explicitly list what was NOT verified (if anything)

## When Validation Fails

If verification shows the work is NOT done:
1. State the actual status with evidence
2. Use the `systematic-debugging` skill to diagnose and fix
3. Re-run the full Gate Function after the fix
4. Do not claim done until all checks pass fresh

---

*Canonicalized into dz-harness-hub as a vendor-neutral engineering-discipline skill. Based on [obra/superpowers](https://github.com/obra/superpowers) verification-before-completion.*
