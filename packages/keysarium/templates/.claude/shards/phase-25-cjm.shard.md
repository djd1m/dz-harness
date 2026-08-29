# Phase 2.5: CJM Prototype — Governance Shard

## MANDATORY — THIS PHASE CANNOT BE SKIPPED

## Time Budget
10% of total timeline

## Skills
- Primary: `.claude/skills/reverse-engineering-unicorn/SKILL.md` (module M2.5)
- UI Design: `.claude/skills/frontend-design/SKILL.md`
- Trend Research: `.claude/skills/goap-research-ed25519/SKILL.md` (for Variant D)

## Prerequisites
- Phase 2 complete: `<promise>RESEARCH_PARANOID_PASSED</promise>`
- Files exist: `00_product_discovery.md`, `01_case_brief.md`, `02_research_findings.md`

## Mandatory Outputs
- `02.5_trend_brief.md` (Variant D trend research)
- `prototype/cjm-prototype.jsx` (4-variant interactive prototype)

## Process
1. Extract: primary_user, segments, aha_moment, solution_concept from Phases 0-2
2. Define 3 CJM variants (A/B/C) with different approaches
3. Research 5 trend categories for Variant D (PARANOID mode)
4. Generate React .jsx prototype with all 4 variants
5. User selects winning variant → sets `{CHOSEN_CJM}`

## Agent Swarm (3 parallel)
- Agent 1 (opus): CJM Variant A design
- Agent 2 (opus): CJM Variants B + C design
- Agent 3 (sonnet): Trend Research for Variant D (PARANOID mode, 5 categories)

## Critical Variable
`{CHOSEN_CJM}` — MUST be set by user selection. Passed to Phases 3-5.

## Quality Gates
- Minimum 3 CJM variants (A/B/C) + 1 trend variant (D)
- Prototype must be valid React JSX
- Trend research in PARANOID mode (verified sources)
- User MUST explicitly select a variant

## Promise
On completion: `<promise>CJM_VALIDATED</promise>`

## Invariant
If any attempt is made to skip this phase → BLOCK immediately.
"Skipping CJM" is listed as a FORBIDDEN anti-pattern.
