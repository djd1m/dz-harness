---
name: requirements-validator
description: >
  Validate requirements for testability, completeness, and clarity using INVEST and SMART criteria.
  Generate BDD scenarios and acceptance criteria from user stories. Use when: (1) Validating user stories
  or requirements before development, (2) Checking acceptance criteria quality, (3) Generating Gherkin/BDD
  scenarios, (4) Analyzing requirements testability, (5) User says "validate requirements", "check user story",
  "generate BDD", "testability analysis", "INVEST check", "SMART criteria". Blocks requirements with score <50
  from proceeding to development.
---

# Requirements Validator

Validate requirements using INVEST + SMART criteria. Generate BDD scenarios. Block untestable requirements.

## Workflow

1. **Analyze** → Apply INVEST to user stories, SMART to acceptance criteria
2. **Score** → Calculate testability score (0-100)
3. **Generate** → Create BDD scenarios (happy path, errors, edge cases)
4. **Report** → Output validation results with actionable fixes

## Quick Reference

### INVEST Criteria (User Stories) — 50% weight

| Criterion | Question | Red Flags |
|-----------|----------|-----------|
| **I**ndependent | Can develop separately? | "after X is done", "depends on" |
| **N**egotiable | Open to discussion? | "must be exactly", rigid specs |
| **V**aluable | Clear user benefit? | No "so that" clause |
| **E**stimable | Can estimate effort? | "system should be fast" |
| **S**mall | Fits in one sprint? | "entire module", "all users" |
| **T**estable | Has pass/fail criteria? | No acceptance criteria |

### SMART Criteria (Acceptance Criteria) — 30% weight

| Criterion | Question | Red Flags |
|-----------|----------|-----------|
| **S**pecific | Clear, unambiguous? | "fast", "easy", "user-friendly" |
| **M**easurable | Has metrics? | No numbers/thresholds |
| **A**chievable | Technically feasible? | "100% uptime", "instant" |
| **R**elevant | Supports story goal? | Unrelated to user value |
| **T**ime-bound | Has timing context? | No response times |

### Vague Terms to Flag

Always flag these terms and suggest specific replacements:
- "fast" → "<200ms p95 response time"
- "easy" → "completed in <3 clicks"
- "user-friendly" → "passes usability test with >80% task completion"
- "secure" → "passes OWASP Top 10 security scan"
- "scalable" → "handles 10,000 concurrent users"
- "reliable" → "99.9% uptime SLA"

## Scoring System

| Score | Rating | Action | INVEST | SMART |
|-------|--------|--------|--------|-------|
| 90-100 | Excellent | Ready for dev | 6/6 ✓ | 5/5 ✓ |
| 70-89 | Good | Minor fixes | 5+/6 | 4+/5 |
| 50-69 | Fair | Needs work | 4/6 | 3/5 |
| **0-49** | **Poor** | **BLOCKED** | <4/6 | <3/5 |

**Score <50 = BLOCKED from development.** Provide rewrite suggestions.

**Blocking floor — the weakest link decides, never the average.** Independently of the score, a
requirement is BLOCKED if `Testable = 0` (no acceptance criteria), `Completeness = 0` (rubric "No
AC"), or `Traceability = 0` (no AC has a named scenario in the Criterion scenarios table). A story can
total 72/100 with no acceptance criteria, and 72 reads as "minor fixes" in the table above. A
non-zero `Testable` or `Completeness` REQUIRES quoting the acceptance criteria it scores; a non-zero
`Traceability` REQUIRES quoting the Criterion scenarios table or referencing its document and heading.
No artifact means 0, because the agent that scores is the agent the floor binds. The floor is closed
at those three; `Measurable` is deliberately excluded — see `references/scoring-system.md` →
"Blocking floor" for the worked cases and the reason.

## Output Format

### Requirements Analysis Report

```markdown
# Requirements Testability Analysis
Spec revision: sha256:<digest of 01_specification.md>

## Summary
- Stories analyzed: X
- Average score: XX/100
- Blocked: X (score <50)

## Results

| Story | Title | Score | INVEST | SMART | Status |
|-------|-------|-------|--------|-------|--------|
| US-001 | ... | 92/100 | 6/6 ✓ | 5/5 ✓ | READY |
| US-002 | ... | 45/100 | 3/6 ✗ | 2/5 ✗ | BLOCKED |

## Criterion scenarios
| Criterion | Scenario |
|-----------|----------|
| AC-example-1 | Successful example flow |

## Detailed Analysis: US-002 (BLOCKED)

### INVEST Analysis
| Criterion | Pass | Issue |
|-----------|------|-------|
| Independent | ✓ | - |
| Valuable | ✗ | No user benefit stated |
| Testable | ✗ | No measurable criteria |

### SMART Analysis
| Criterion | Pass | Issue |
|-----------|------|-------|
| Specific | ✗ | "fast" is vague |
| Measurable | ✗ | No metrics |

### Suggestions
- Rewrite: "As a [user], I want [specific action] within [time], so that [benefit]"
- Add AC: "Given X, when Y, then Z within 200ms"
```

Compute the revision line from the specification bytes with
`sha256sum docs/features/<f>/01_specification.md`. The `## Criterion scenarios` table is the artifact
the Traceability score keys on: it maps each AC id to a named scenario.

### Security Acceptance Criteria (scoring: +5 present / -10 missing, see Scoring Bonus below)

When requirements involve authentication, data storage, external APIs, or multi-tenancy,
apply additional security validation:

| Criterion | Check | Red Flags |
|-----------|-------|-----------|
| Input Validation | All user inputs sanitized? | No validation mentioned, "trust client" |
| Authentication | Auth mechanism specified? | "users can access", no auth context |
| Authorization | Access control defined? | No role/permission model |
| Data Protection | Sensitive data handling specified? | PII without encryption rules |
| Multi-Tenant Isolation | Tenant boundary enforced? | Shared queries, no tenant context |
| Secret Management | Secrets externalized? | Hardcoded keys, fallback defaults |
| Webhook Security | Signature verification? | "Accept POST", no HMAC |

**Scoring Bonus:** +5 points if security criteria present and specific, +0 if not applicable,
-10 if security-relevant requirement lacks any security criteria (BLOCKED if score drops below 50).

**Security BDD Scenarios:** For security-relevant requirements, ALWAYS generate:
- Auth bypass attempt scenario
- Input injection scenario (SQL, XSS, command)
- Cross-tenant access attempt (if multi-tenant)
- Rate limiting / brute force scenario (if auth endpoint)

### Growth Traceability (scoring: +5 present / +0 not applicable / -10 applicable but absent)

Phase 0's M5 module analyses how a competitor grows and emits a `Growth Requirements Seed` table of
`FR-GROWTH-<nnn>` draft obligations into `docs/product-discovery-brief.md`. This criterion asks one
question: **did those obligations survive into `docs/Specification.md`, or were they analysed and
dropped?**

**APPLICABILITY — decide this FIRST, and it is not about project type.** The criterion applies when
**acquisition or adoption is in scope** — the same condition `/replicate` already gates M5 on
("If acquisition/adoption in scope (incl. B2B)"). Concretely:

| Situation | Applicable? | Score |
|---|:---:|---|
| `docs/product-discovery-brief.md` exists and its seed table has ≥1 `FR-GROWTH-nnn` row | YES | +5 traced · -10 not traced |
| The brief exists and its seed table says `нет` / is empty | no | +0 |
| No acquisition or adoption objective (internal tool, on-prem, replacement of an existing internal system) | no | +0 |
| `docs/product-discovery-brief.md` is ABSENT | no | +0 — see below |

**An absent brief is +0, never -10.** Absence means Phase 0 did not run (the `--from-docs` entry
skips it). Penalising a project for not running an optional phase would send every `--from-docs`
project into a permanent NEEDS WORK loop, which is the exact trap already closed for the Measurable
criterion. "Phase 0 did not run" is not "the growth requirements are missing".

**What TRACED means.** For each `FR-GROWTH-nnn` row in the brief, one of two things is true in
`docs/Specification.md`:

- the id `FR-GROWTH-nnn` appears (case-sensitive, the exact token — not a title, not a paraphrase), **or**
- the requirement was consciously rejected, and the rejection is written down with its reason.

A silently dropped row is the defect. A row rejected on the record is not.

| Check | Red Flags |
|-------|-----------|
| Every non-SPECULATIVE seed row is traced or rejected on the record | ids present in the brief, absent from the Specification, no rejection noted |
| Rejections carry a reason | "не берём" with no reason — indistinguishable from forgetting |
| `SPECULATIVE` rows were not promoted silently | a `[H]`-sourced row promoted to a firm requirement with no human decision recorded |

**Scoring Bonus:** +5 if every applicable seed row is traced or rejected on the record, +0 if not
applicable per the table above, -10 if the seed table carries rows and the Specification traces none
of them (BLOCKED if the score drops below 50).

**This criterion scores OUTSIDE the 100-point INVEST/SMART table**, exactly like Security. It adds no
weight to any existing criterion — the weight table and everything derived from it are unchanged.

**Honest limit.** This proves an obligation was CARRIED FORWARD, not that it was built, and not that
copying the competitor's growth move is lawful. Legality is not assessed anywhere in this pipeline.

**Deterministic counterpart.** `node .claude/hooks/check-growth-trace.cjs .` answers the same
question mechanically (0 traced · 1 rows present and none traced · 2 the check did not run). This
section is a prose gate read by a model; the utility is the deterministic one. Run it when the answer
has to be more than a judgement.

### BDD Scenario Generation

For each requirement, generate scenarios covering:
1. **Happy path** (1-2 scenarios) — Primary success flow
2. **Error handling** (2-3 scenarios) — Validation, network, server errors
3. **Edge cases** (1-2 scenarios) — Boundaries, concurrent access
4. **Security** (generate ALL applicable from the mandatory Security BDD list above) — Auth bypass, injection, cross-tenant, rate limiting

See `references/bdd-patterns.md` for Gherkin templates and examples.

## Detailed References

- **INVEST deep dive**: See `references/invest-criteria.md`
- **SMART deep dive**: See `references/smart-criteria.md`
- **BDD patterns**: See `references/bdd-patterns.md`
- **Scoring formula**: See `references/scoring-system.md`
