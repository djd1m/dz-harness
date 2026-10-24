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

## Research mode and evidence
- Follow `.claude/rules/research-quality.md`: default GOAP `moderate` for ordinary sources.
- Use `strict`/`paranoid` only if both issuer-key and signed-delivery capabilities are
  confirmed for the selected source class. Do not infer signature verification from a URL.
- Cite material factual claims; label unsupported claims `[UNVERIFIED]` and keep them out of
  decisive conclusions. Invented citations are never acceptable.
- Citation format: `[Claim] — Source: [URL or publication], [Date]`.
- A `GOAL_UNREACHABLE` result blocks the checkpoint and transition to Phase 2.5.

## Agent Swarm (3 parallel, model: sonnet)
- Agent 1: Analogues + Benchmarks
- Agent 2: Technologies + Anti-patterns
- Agent 3: Regulations + Market Data
- Synthesize results into single document

## Quality Gates
- ALL claims have sources
- No unverified statistics or percentages presented as established facts
- Competitor names verified to exist
- Technology recommendations are for real, available products
- Regulatory references cite actual laws/standards

## Promise
On successful evidence review in the selected mode: `<promise>RESEARCH_PARANOID_PASSED</promise>`.
The tag name is retained for downstream compatibility; it does not assert GOAP paranoid mode or
cryptographic issuer verification. On failure, emit the incomplete marker and do not advance.

## Anti-Patterns to Check
- Bare claims without attribution → BLOCK
- Generic "studies show" without specific study → BLOCK
- Hallucinated product names → BLOCK
