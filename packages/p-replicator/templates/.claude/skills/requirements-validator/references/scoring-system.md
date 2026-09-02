# Testability Scoring System

## Score Calculation Formula

```
Total Score = INVEST Score (50%) + SMART Score (30%) + Quality Score (20%)
```

## INVEST Score Breakdown (50 points max)

| Criterion | Weight | Points | Calculation |
|-----------|--------|--------|-------------|
| Independent | 8% | 0-8 | Binary: 8 if pass, 0 if fail |
| Negotiable | 8% | 0-8 | Binary: 8 if pass, 0 if fail |
| Valuable | 10% | 0-10 | 10 if clear benefit, 5 if vague, 0 if missing |
| Estimable | 8% | 0-8 | 8 if estimable, 4 if partially, 0 if not |
| Small | 8% | 0-8 | 8 if sprint-sized, 4 if 2 sprints, 0 if larger |
| Testable | 8% | 0-8 | 8 if AC exist and clear, 4 if vague AC, 0 if none |

## SMART Score Breakdown (30 points max)

| Criterion | Weight | Points | Calculation |
|-----------|--------|--------|-------------|
| Specific | 6% | 0-6 | -2 per vague term found |
| Measurable | 8% | 0-8 | 8 if metrics exist, 4 if partial, 0 if none |
| Achievable | 6% | 0-6 | 6 if realistic, 3 if stretch, 0 if impossible |
| Relevant | 5% | 0-5 | 5 if connected to value, 0 if disconnected |
| Time-bound | 5% | 0-5 | 5 if timing specified, 0 if missing |

## Quality Score Breakdown (20 points max)

| Criterion | Weight | Points | Calculation |
|-----------|--------|--------|-------------|
| Traceability | 10% | 0-10 | 10 if every AC id has a named scenario in the Criterion scenarios table; 5 if some do (the uncovered AC ids MUST be listed by name); 0 if none do, or the block is absent ⇒ the floor applies |
| Completeness | 10% | 0-10 | See completeness rubric below |

### Completeness Rubric

| AC Coverage | Points |
|-------------|--------|
| Happy path + errors + edges | 10 |
| Happy path + errors | 7 |
| Happy path only | 4 |
| Incomplete happy path | 2 |
| No AC | 0 |

## Score Interpretation

| Score | Rating | Status | Action |
|-------|--------|--------|--------|
| 90-100 | Excellent | ✅ READY | Proceed to development |
| 70-89 | Good | ⚠️ REVIEW | Fix minor issues, then proceed |
| 50-69 | Fair | 🔶 REWORK | Significant clarification needed |
| **0-49** | **Poor** | **🚫 BLOCKED** | **Requires complete rewrite** |

### Blocking floor (overrides the total, both directions)

**The weakest link decides, never the average.** A requirement is BLOCKED — whatever its total says —
if any of these is zero:

| Criterion | Zero means | Why it vetoes |
|-----------|-----------|---------------|
| `Testable` (INVEST, 8) | no acceptance criteria exist | the gate exists to block untestable requirements |
| `Completeness` (Quality, 10) | "No AC" on the rubric above | nothing states what "done" is |
| `Traceability` (Quality, 10) | no AC has a named scenario in the Criterion scenarios table | a story can otherwise pass validation with no scenario or test on any criterion |

Without this floor the total alone lets an untestable requirement through. Worked case: a story with
NO acceptance criteria and NO test links loses `Testable` 8, `Completeness` 10 and `Traceability` 10,
keeps everything else, and totals **72/100** — above the 70 line, filed as "fix minor issues, then
proceed". The floor blocks it on `Testable = 0` and `Completeness = 0`.

**The floor keys on the artifact, not on the number you wrote.** The same agent scores these
criteria AND is bound by the floor, so a score is not evidence of anything — reporting `Testable = 4`
("vague AC") on a story with no AC at all evades the veto without lying about the rubric. Therefore:

> A non-zero `Testable` or `Completeness` REQUIRES quoting the acceptance criteria being scored —
> the actual text, with its document and heading. `Testable = 4` means the AC exist and are vague:
> quote them. **No quote ⇒ the score is 0 ⇒ the floor applies.**

> A non-zero `Traceability` REQUIRES the Criterion scenarios table (AC id → named scenario) quoted,
> or referenced by document and heading. **No table ⇒ the score is 0 ⇒ the floor applies.**

Measured worked case: story FR-009 had 27 criteria with no IDs, more than 10 of them uncovered by
any scenario, and passed validation. Its validation report 3.1 was written against document revision
2; only a human noticed. With no named AC-id → scenario artifact, `Traceability = 0` and the floor
blocks that contour instead of letting its total hide the missing coverage.

**The floor is CLOSED at these three.** `Measurable` is deliberately NOT on it: a requirement with no
number is often correct ("the user can export the report as PDF" is specific, testable and
unmeasurable), so vetoing on `Measurable` would turn a false pass into a false block. Widening this
list needs the same kind of worked case as the ones above.

## Quality Gate Rules

### BLOCKED (Score < 50)

Requirements scoring below 50 are **automatically blocked** from development.

**Mandatory actions**:
1. Identify all failing criteria
2. Provide specific rewrite suggestions
3. Generate improved AC examples
4. Require re-validation after fixes

### REVIEW (Score 50-69)

**Recommended actions**:
1. List all issues clearly
2. Suggest specific improvements
3. Allow development if product owner accepts risk

### READY (Score 70+)

**Actions**:
1. Generate BDD scenarios
2. Create traceability links
3. Proceed to development

## Example Score Calculation

**User Story**: "As a user, I want the system to be fast so I can work efficiently"

### INVEST Analysis

| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Independent | 8 | No dependencies stated |
| Negotiable | 8 | Implementation open |
| Valuable | 5 | Benefit is vague ("efficiently") |
| Estimable | 0 | Cannot estimate "fast" |
| Small | 0 | "System" scope undefined |
| Testable | 0 | No measurable criteria |
| **Subtotal** | **21/50** | |

### SMART Analysis (for "System responds fast")

| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Specific | 0 | "fast" is vague (-6) |
| Measurable | 0 | No metrics |
| Achievable | 3 | Probably possible |
| Relevant | 5 | Performance matters |
| Time-bound | 0 | No timing specified |
| **Subtotal** | **8/30** | |

### Quality Analysis

| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Traceability | 0 | No test links |
| Completeness | 2 | Incomplete happy path |
| **Subtotal** | **2/20** | |

### Final Score

```
Total = 21 + 8 + 2 = 31/100
Status: 🚫 BLOCKED
```

**Rewrite suggestion**:
"As a customer, I want the product search to return results within 200ms at p95, so I can quickly find items without waiting."

**Improved AC**:
```gherkin
Given 1000 concurrent users
And 100,000 products in the catalog
When a user searches for "laptop"
Then 95% of responses complete in <200ms
And all responses complete in <500ms
```
