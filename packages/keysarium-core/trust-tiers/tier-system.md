# Trust Tier System — 4-Tier Classification

> Classify skills and artifacts by their validation evidence level.

## Overview

Not all skills and artifacts have the same level of validation. The Trust Tier system provides a 4-level classification that communicates how much confidence to place in a skill's output.

## Tier Definitions

| Tier | Label | Requirements | Confidence Level |
|------|-------|-------------|-----------------|
| **Tier 3** | Verified | Eval test suites with deterministic validation | Highest — production-ready |
| **Tier 2** | Validated | Passed multi-evaluator panel with score >= 7.0 | High — tested and scored |
| **Tier 1** | Structured | Documented protocol + references or modules | Medium — well-organized |
| **Tier 0** | Advisory | Basic documentation only | Low — use with caution |

## Tier Criteria (Detailed)

### Tier 0 — Advisory

**Minimum requirements:**
- A SKILL.md (or equivalent) file exists
- Basic instructions are documented

**What it means:** The skill exists and has instructions, but has not been tested or validated. Output quality is unpredictable.

**Flag in pipeline:** Display a warning when a Tier 0 skill is loaded:
```
WARNING: Skill '{name}' is Tier 0 (Advisory). Output may need extra review.
```

### Tier 1 — Structured

**Minimum requirements:**
- SKILL.md with complete protocol documentation
- At least ONE of:
  - `references/` directory with example inputs/outputs
  - `modules/` directory with sub-components
  - Structured output format (JSON schema, template)

**What it means:** The skill is well-organized and has supporting materials, but has not been formally evaluated.

### Tier 2 — Validated

**Minimum requirements:**
- All Tier 1 requirements
- Passed a multi-evaluator panel (3+ judges) with average score >= 7.0 out of 10.0
- Evaluation results recorded (date, scores, panel composition)

**What it means:** The skill has been formally tested by multiple evaluators and scored above the quality threshold.

**Recording:** Add to the skill's metadata:
```
trust_tier: 2
trust_tier_label: "Validated"
bto_score: 7.8
bto_date: "2026-03-01"
bto_panel: "domain-expert (8.2), critic (7.5), completeness-auditor (8.0)"
```

### Tier 3 — Verified

**Minimum requirements:**
- All Tier 2 requirements
- Deterministic eval test suite exists
- Tests pass consistently (reproducible results)
- Score >= 8.5 on the multi-evaluator panel

**What it means:** The skill has both human evaluation AND automated testing. This is the highest confidence level.

## Classification Checklist

Use this checklist to determine a skill's current tier:

```
[ ] SKILL.md exists                                          → Tier 0 minimum
[ ] SKILL.md has complete protocol documentation             → Tier 0
[ ] references/ OR modules/ OR structured output exists      → Tier 1
[ ] Multi-evaluator panel score >= 7.0 recorded              → Tier 2
[ ] Deterministic eval test suite exists and passes          → Tier 3
[ ] Multi-evaluator panel score >= 8.5                       → Tier 3
```

## Tier Display Format

When displaying skill tiers (e.g., in a health check):

```
Skills Health Check:
  skill-name-1                  Tier 2 — Validated (score: 7.8)
  skill-name-2                  Tier 1 — Structured
  skill-name-3                  Tier 0 — Advisory (missing: references/)
  skill-name-4                  Tier 3 — Verified (score: 8.9, tests: 12/12)
```

## Enforcement Rules

| Context | Rule |
|---------|------|
| Production pipeline | Warn on Tier 0 skills, recommend alternatives |
| Critical decisions | Require Tier 2+ skills for decision-making stages |
| Evaluation panels | Judges should be Tier 1+ (Tier 0 judges produce unreliable scores) |
| Knowledge export | Include tier metadata in brain export |

## Integration

The tier system integrates with:
- **Memory Protocol:** Tier affects reward weight (higher tier = more trusted outcomes)
- **Model Routing:** Tier can influence model selection (Tier 0 skills may need Tier 3 model to compensate)
- **Brain Export:** Tier metadata is included in portable brain containers
