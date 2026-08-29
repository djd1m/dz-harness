# Quality Gates Reference

Gates applied to every candidate finding during the harvest process.
All 8 gates must be evaluated before a finding can be accepted into the toolkit.
A gate failure is a hard block unless overridden by the user (see Override Protocol).

## Gate Definitions

| Gate | Name | Check | Type | Pass Criteria | Failure Message |
|------|------|-------|------|---------------|-----------------|
| G1 | When-To-Use | Finding has a "When to use" section or equivalent guidance | deterministic | Section exists and is non-empty | Missing "When to use" guidance |
| G2 | When-Not-To-Use | Finding has a "When NOT to use" section or equivalent anti-guidance | deterministic | Section exists and is non-empty | Missing "When NOT to use" guidance |
| G3 | Decontextualized | No project-specific names, paths, slugs, dates, or hardcoded values remain | semantic | Haiku confirms no project-specific references | Project-specific references remain: {details} |
| G4 | Concrete Example | At least one concrete usage example is provided | semantic | Haiku confirms example is concrete and actionable | No concrete example provided |
| G5 | Reusability Threshold | Reusability confidence score meets minimum | deterministic | confidence >= 0.5 | Confidence {score} < 0.5 threshold |
| G6 | Not Duplicate | Finding is not a duplicate of an existing toolkit entry | deterministic | No existing entry with content similarity > 0.85 | Duplicate of existing entry: {existing_name} |
| G7 | Maturity Label | Finding has a maturity level assigned | deterministic | maturity field is one of: alpha, beta, stable | Missing maturity label |
| G8 | Brutal Honesty | Finding survives self-critical review — is it genuinely useful or just noise? | semantic | Haiku confirms finding has genuine reuse value beyond the source project | Fails brutal-honesty review: {reason} |

## Gate Types

**Deterministic gates** (G1, G2, G5, G6, G7) are checked by the orchestrator without LLM calls.
They operate on the structured finding JSON: presence of fields, numeric thresholds, set membership.

**Semantic gates** (G3, G4, G8) require a haiku LLM call with a focused single-question prompt.
The prompt must ask for a binary YES/NO answer plus a short explanation (1-2 sentences max).
Use haiku — these are high-frequency, pattern-matching evaluations that do not require deep reasoning.

## Pass Assignment (which pass each gate belongs to)

Gates are evaluated in two passes to minimize unnecessary LLM cost.

### Pass 1 — Deterministic (zero LLM cost)

Run all deterministic gates first. If any deterministic gate fails, reject immediately.
Do NOT proceed to Pass 2 for a rejected finding.

Gates in Pass 1 (in evaluation order):
1. G7 — Maturity Label (cheapest check: field presence)
2. G5 — Reusability Threshold (numeric comparison)
3. G1 — When-To-Use (section presence)
4. G2 — When-Not-To-Use (section presence)
5. G6 — Not Duplicate (similarity comparison against existing entries)

### Pass 2 — Semantic (haiku LLM calls, parallelizable)

Run only after all Pass 1 gates pass.
Gates G3, G4, G8 may be evaluated in parallel (3 concurrent haiku calls).

Gates in Pass 2:
- G3 — Decontextualized
- G4 — Concrete Example
- G8 — Brutal Honesty

## Override Protocol

A user may override a gate for a specific finding using the syntax:

```
пропусти G3 для #X
```

Where `#X` is the finding number (1-indexed, matching the extraction output list).

### Override Rules

- Multiple gates may be overridden in a single command using comma-separated syntax: `"пропусти G3,G4 для #14"`.
- G8 (Brutal Honesty) cannot be overridden. If a finding fails G8, it must be revised or dropped.
- G6 (Not Duplicate) cannot be overridden. If a finding is a duplicate, either update the existing entry or drop the new one.
- G5 (Reusability Threshold) can be overridden only if the user provides a rationale explaining why low-confidence is acceptable for this finding.
- All overrides are logged in the harvest output with the gate ID, finding number, and user rationale.

### Override Log Format

When an override is applied, append to the harvest session log:

```
OVERRIDE: G{N} skipped for finding #{X} — user rationale: "{rationale}"
```

## Scoring

After all gates are evaluated for a finding:

```
gate_pass_rate = gates_passed / 8
```

This score is recorded in the finding's metadata alongside the per-gate pass/fail results.

| gate_pass_rate | Interpretation |
|----------------|----------------|
| 1.0 | Clean pass — add to toolkit |
| 0.875 (7/8) | One gate overridden — add with override note |
| < 0.875 | Rejected — do not add to toolkit |

The gate_pass_rate is surfaced in the harvest summary table for each finding.
It is not used as a quality score for ranking — a finding either passes all required gates or it does not.
