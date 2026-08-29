# Phase 2: Research — Governance Shard

## Time Budget
15% of total timeline

## Skill
Load: `.claude/skills/goap-research-ed25519/SKILL.md`

## Prerequisites
- Phase 1 complete: `<promise>CASE_EXPLORED</promise>`
- Files exist: `00_product_discovery.md`, `01_case_brief.md`

## Mandatory Outputs
- `02_research_findings.md`

## PARANOID Mode — ACTIVE
- Every factual claim MUST have a verifiable source
- Zero tolerance for hallucinated citations
- Confidence threshold: 0.99 minimum
- Unverifiable claims: mark as [UNVERIFIED] and flag
- Citation format: `[Claim] — Source: [URL or publication], [Date]`

## Agent Swarm (3 parallel, model: sonnet)
- Agent 1: Analogues + Benchmarks
- Agent 2: Technologies + Anti-patterns
- Agent 3: Regulations + Market Data
- Synthesize results into single document

## Quality Gates
- ALL claims have sources
- No unverified statistics or percentages
- Competitor names verified to exist
- Technology recommendations are for real, available products
- Regulatory references cite actual laws/standards

## Promise
On completion: `<promise>RESEARCH_PARANOID_PASSED</promise>`

## Anti-Patterns to Check
- Bare claims without attribution → BLOCK
- Generic "studies show" without specific study → BLOCK
- Hallucinated product names → BLOCK
