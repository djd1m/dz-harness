# Trust Tier System

> **BTO evaluation is a SEPARATE package.** Keysarium installs no `/bto*` slash commands — the
> BTO evaluator ships as `@dzhechkov/skills-bto` (`npx @dzhechkov/skills-bto init`). Where this
> file refers to a "BTO evaluation", it means running that package. Tier promotion is therefore
> optional: without it, skills stay at the tier their structure earns (Tier 0/1).

## Tier Definitions

| Tier | Label | Requirements | Promotion Path |
|------|-------|-------------|----------------|
| Tier 3 | Verified | Eval test suites with deterministic validation | — (highest) |
| Tier 2 | Validated | Passed a BTO evaluation with Layer 2 score ≥ 7.0 | Run a BTO evaluation, score ≥ 8.5 on Layer 2 |
| Tier 1 | Structured | SKILL.md + references/ or modules/ | Run a BTO evaluation, score ≥ 7.0 on Layer 2 |
| Tier 0 | Advisory | Basic SKILL.md only | Add references/, examples/, structured output |

## Current Skill Tiers

| Skill | Tier | Label | Evidence |
|-------|------|-------|----------|
| explore | 1 | Structured | SKILL.md + references/ |
| frontend-design | 0 | Advisory | SKILL.md only, no references |
| goap-research-ed25519 | 1 | Structured | SKILL.md + references/ + scripts/ |
| problem-solver-enhanced | 1 | Structured | Comprehensive SKILL.md with TRIZ framework |
| presentation-storyteller | 1 | Structured | SKILL.md + references/ |
| reverse-engineering-unicorn | 1 | Structured | SKILL.md + modules/ + references/ + examples/ |
| knowledge-extractor | 2 | Validated | BTO evaluation Layer 2 score 7.5, optimized 2026-03-03 |
| analyst-manual-full | 0 | Advisory | SKILL.md only (composite orchestrator, depends on explore + goap-research + problem-solver) |
| feature-adr | 1 | Structured | SKILL.md + modules/ + references/ + examples/ |
| edu-site-generator | 1 | Structured | SKILL.md + modules/ + references/ + examples/ |
| transcript-site-generator | 2 | Validated | BTO evaluation Layer 2 score 7.82 |
| ai-factory-mapper | 1 | Structured | SKILL.md + references/ + assets/ + scripts/ (v1.0, апрель 2026) |

## Tier Enforcement

- Tier 0 skills: Flag with warning when loaded in production pipeline
- Tier 1 skills: Standard usage, recommend a BTO evaluation for promotion
- Tier 2 skills: Full confidence, include BTO score in metadata
- Tier 3 skills: Highest confidence, deterministic validation available

## Promotion Protocol

1. Install the evaluator (`npx @dzhechkov/skills-bto init`), then run its BTO test on `.claude/skills/<name>/`
2. If Layer 2 score ≥ 7.0 → promote to Tier 2, record score in SKILL.md
3. If Layer 2 score ≥ 8.5 + deterministic eval tests exist → promote to Tier 3
4. Record promotion date and score in SKILL.md frontmatter
