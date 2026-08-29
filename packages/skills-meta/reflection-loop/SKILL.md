---
name: reflection-loop
description: >
  Standalone critique-revise cycle extracted as an independent reusable skill. Implements
  DRAFT -> CRITIQUE -> IDENTIFY -> REVISE -> VERIFY -> DECIDE protocol with domain-specific
  criteria for code, text, architecture, and research. Max 3 rounds with anti-patterns
  for infinite loops and cosmetic-only revisions.
  Triggers on: "review and improve", "critique this", "is this good enough", "self-review".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Reflection Loop: Critique-Revise Cycle

Standalone critique-revise cycle for iterative quality improvement. Produces an initial
draft, self-evaluates against domain-specific criteria, identifies actionable improvements,
applies revisions, and verifies nothing was broken. Max 3 rounds.

## When To Activate

Trigger on:
- "review and improve" or "review and revise"
- "critique this"
- "is this good enough"
- "self-review"
- "iterate on this"
- "make this better"

## Protocol

### Step 1: DRAFT

Produce initial output (code, text, design, plan). This is the baseline for improvement.

### Step 2: CRITIQUE

Self-evaluate against domain-specific criteria. Be specific: cite line numbers, section
names, or exact phrases. Do not say "could be improved" without saying how.

**Criteria by domain:**

| Domain | Criteria |
|--------|----------|
| Code | Correctness, tests pass, no security issues, readable, no dead code |
| Text | Accuracy, completeness, audience-appropriate, no contradictions |
| Architecture | Feasibility, scalability, maintainability, cost-awareness |
| Research | Sources verified, claims supported, no hallucination, balanced |

### Step 3: IDENTIFY

List specific improvements. Each item must be actionable with a clear location:
- "Line 42: replace nested if with early return"
- "Section 3: add cost estimate for cloud hosting option"
- "Claim about 50% improvement: needs source citation"

Do NOT list vague items like "improve readability" or "make it better".

### Step 4: REVISE

Apply each identified improvement to the draft. Track what was changed.

### Step 5: VERIFY

Check that revisions did not break other aspects:
- Code: re-run mental model of tests, check for regressions
- Text: re-read for flow, verify no contradictions introduced
- Architecture: verify constraints still satisfied
- Research: verify no claims lost or distorted

### Step 6: DECIDE

- If improvements remain and round < 3: go to Step 2
- If output meets all criteria: accept and finalize
- If round = 3: accept with documented remaining issues

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Infinite reflection loop | Round 4+ or same issues re-appearing | Force accept at round 3 with documented gaps |
| Cosmetic-only revisions | Changes are formatting/wording only, no substance | Stop iterating: cosmetic changes signal completion |
| Losing original intent | Revision drift: output no longer addresses original goal | Re-check against original prompt before each revision |
| Over-critique | Every line flagged, paralysis by perfection | Focus on top 3 highest-impact items only |
| Skipping VERIFY | Revisions applied without checking for regressions | VERIFY is mandatory, never skip |

## Output Format

Each reflection round produces:

```
## Round N

### Critique
- [item 1 with location]
- [item 2 with location]

### Changes Applied
- [change 1: what was done]
- [change 2: what was done]

### Verify
- [regression check result]

### Decision: [iterate | accept]
```

## Dependencies

| Resource | Path | Purpose |
|----------|------|---------|
| schemas/output.json | schemas/output.json | Output validation schema |
| validate-config.json | scripts/validate-config.json | Validation rules |
