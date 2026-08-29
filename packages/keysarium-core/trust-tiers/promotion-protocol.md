# Promotion Protocol — Advancing Skills Between Tiers

> How to promote a skill from one trust tier to the next.

## Overview

Skills start at the lowest tier that matches their current evidence level. They can be promoted to higher tiers by meeting the requirements defined in `tier-system.md`. This protocol defines the promotion process.

## Promotion Paths

```
Tier 0 (Advisory)
    ↓ Add references/ or modules/ + complete documentation
Tier 1 (Structured)
    ↓ Pass multi-evaluator panel with score >= 7.0
Tier 2 (Validated)
    ↓ Add deterministic eval tests + score >= 8.5
Tier 3 (Verified)
```

## Promotion: Tier 0 to Tier 1

### Requirements
1. SKILL.md has complete protocol documentation (not just a stub)
2. At least ONE of:
   - `references/` directory with 2+ example files
   - `modules/` directory with sub-components
   - Structured output format documented (JSON schema or template)

### Process
1. Review SKILL.md for completeness
2. Verify supporting materials exist
3. Update skill metadata:
   ```
   trust_tier: 1
   trust_tier_label: "Structured"
   ```

### No formal evaluation needed — this is a structural check.

## Promotion: Tier 1 to Tier 2

### Requirements
1. All Tier 1 requirements met
2. Pass a multi-evaluator panel evaluation
3. Average score >= 7.0 out of 10.0
4. No single judge score below 5.0

### Process
1. Submit the skill for multi-evaluator evaluation
2. Panel of 3 judges independently evaluates the skill:
   - **Domain Expert** (weight: 0.4) — evaluates domain accuracy and depth
   - **Critic** (weight: 0.3) — looks for weaknesses and edge cases
   - **Completeness Auditor** (weight: 0.3) — checks structural coverage
3. Compute weighted average score
4. If score >= 7.0:
   - Update skill metadata:
     ```
     trust_tier: 2
     trust_tier_label: "Validated"
     bto_score: {score}
     bto_date: "{YYYY-MM-DD}"
     ```
   - Record the full evaluation results
5. If score < 7.0:
   - Provide judge feedback for improvement
   - Skill remains at Tier 1
   - May re-evaluate after improvements

### Judge Panel Rules
- Judges operate in strict isolation (see judge-attestation.md)
- Judges MUST be a different model tier than the skill's generation model
- Judge scores are final unless disagreement > 3 points (escalate to meta-judge)

## Promotion: Tier 2 to Tier 3

### Requirements
1. All Tier 2 requirements met
2. Multi-evaluator panel score >= 8.5
3. Deterministic eval test suite exists
4. All eval tests pass consistently

### Process
1. Create eval test suite:
   - Define test cases with known-good inputs and expected outputs
   - Tests must be deterministic (same input always produces the same pass/fail)
   - Minimum 5 test cases covering core functionality
2. Run eval tests and verify all pass
3. Re-evaluate with multi-evaluator panel (or use existing score if >= 8.5)
4. If all conditions met:
   - Update skill metadata:
     ```
     trust_tier: 3
     trust_tier_label: "Verified"
     bto_score: {score}
     bto_date: "{YYYY-MM-DD}"
     eval_tests: {count}
     eval_tests_passing: {count}
     ```

## Demotion

Skills can be demoted if:
- Eval tests start failing (Tier 3 -> Tier 2)
- Re-evaluation score drops below threshold (Tier 2 -> Tier 1)
- Supporting materials are removed (Tier 1 -> Tier 0)

Demotion is logged with reason and date.

## Promotion History

Each skill should maintain a promotion history:

```json
{
  "skill_id": "{name}",
  "current_tier": 2,
  "history": [
    {
      "date": "2026-02-15",
      "from_tier": 0,
      "to_tier": 1,
      "reason": "Added references/ directory with 3 examples"
    },
    {
      "date": "2026-03-01",
      "from_tier": 1,
      "to_tier": 2,
      "reason": "Passed BTO evaluation with score 7.8",
      "score": 7.8,
      "panel": ["domain-expert: 8.2", "critic: 7.5", "auditor: 8.0"]
    }
  ]
}
```

## Cross-Project Tier Transfer

When importing a skill from another project (via brain import):
- The imported tier is treated as a **recommendation**, not a guarantee
- The importing project may choose to:
  1. Accept the tier as-is (trust the source)
  2. Require re-evaluation at the current project (verify locally)
  3. Demote by one tier (conservative approach)
