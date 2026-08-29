# Basic Evaluation: Reflection Loop

## Eval 1: Code Domain — Improve a Function

**Input:** Provide a working but suboptimal function (e.g., nested loops where a hash map would work, missing edge case handling, no input validation).

**Expected behavior:**
- DRAFT: accepts the function as-is
- CRITIQUE: identifies nested loop inefficiency, missing edge cases, no validation
- IDENTIFY: lists specific improvements with line numbers
- REVISE: replaces nested loop with hash map, adds edge case handling, adds validation
- VERIFY: checks that refactored version handles all original test cases
- DECIDE: accept (all criteria met in 1-2 rounds)

**Pass criteria:**
- Domain declared as "code"
- Critique items are specific (line numbers, not "improve performance")
- Each revision tracked (what was changed and why)
- VERIFY step confirms no regressions
- Rounds completed <= 3

---

## Eval 2: Text Domain — Improve Documentation

**Input:** Provide a README with inaccurate claims, missing sections, and audience mismatch (too technical for stated audience of non-developers).

**Expected behavior:**
- CRITIQUE: flags inaccurate claims (with quotes), missing sections, audience mismatch
- IDENTIFY: "Line 5: claim about 10x performance needs source", "Missing: installation section", "Section 3: replace jargon with plain language"
- REVISE: fixes claims, adds sections, adjusts tone
- VERIFY: re-reads for flow, checks no contradictions introduced

**Pass criteria:**
- All 3 issue categories identified in critique
- Improvements are actionable (not "make it clearer")
- Revised text verified for internal consistency
- Final decision is "accepted" after 1-2 rounds

---

## Eval 3: Anti-Pattern Detection — Cosmetic Loop

**Input:** Provide output that is already good quality, trigger "self-review".

**Expected behavior:**
- CRITIQUE: finds only minor formatting/wording issues
- Detects cosmetic-only revision pattern
- DECIDE: accept (cosmetic changes signal completion, do not iterate)

**Pass criteria:**
- Correctly identifies that issues are cosmetic only
- Does NOT enter a second round for formatting-only changes
- Final decision is "accepted" with rounds_completed = 1
