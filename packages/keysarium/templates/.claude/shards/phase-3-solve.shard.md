# Phase 3: Solve — Governance Shard

## Time Budget
15% of total timeline

## Skill
Load: `.claude/skills/problem-solver-enhanced/SKILL.md` (TRIZ + Game Theory)

## Prerequisites
- Phase 2.5 complete: `<promise>CJM_VALIDATED</promise>`
- `{CHOSEN_CJM}` is set
- Files exist: `00_` through `02.5_`

## Mandatory Outputs
- `03_solution_strategy.md`
- `diagrams/process-as-is.mermaid`
- `diagrams/process-to-be.mermaid`

## Content Requirements
- SCQA (Situation-Complication-Question-Answer) for pitch
- Concept + Elevator Pitch + Key Innovation
- Process Design: As-Is → To-Be (using `{CHOSEN_CJM}`)
- User Flow from `{CHOSEN_CJM}`
- AI Pipeline specification
- Human-in-the-Loop design with escalation policy
- Success Metrics with baseline values
- Risks & Mitigation matrix
- Roadmap: PoC → MVP → Scale

## Agent Swarm (2 parallel)
- Agent 1 (opus): SCQA + Concept + Process Design + User Flow + AI Pipeline
- Agent 2 (sonnet): Mermaid Diagrams + HITL + Metrics + Roadmap

## Quality Gates
- SCQA must be concise and compelling
- Metrics must include baseline AND target values
- HITL escalation policy is MANDATORY (no AI-only decisions)
- Mermaid diagrams must be valid syntax
- `{CHOSEN_CJM}` must appear in User Flow section

## Promise
On completion: `<promise>SOLUTION_DESIGNED</promise>`

## Anti-Patterns to Check
- No HITL → BLOCK
- Vague "improve efficiency" without numbers → BLOCK
- Over-engineering (> 10 components in MVP) → FLAG
