# Feature ADR — Governance Shard

## Skill
Load: `.claude/skills/feature-adr/SKILL.md`

## Prerequisites
- None (standalone command, not part of casarium pipeline)

## Mandatory Outputs by Tier

### Tier S
- `features/<slug>/00_complexity_assessment.md`
- `features/<slug>/06_implementation_plan.md` (or inline)
- `features/<slug>/08_qe_report.md`
- `features/<slug>/README.md`
- Actual code changes in repository

### Tier M
All of S, plus:
- `features/<slug>/01_requirements.md`
- `features/<slug>/03_adr/001-*.md`
- `features/<slug>/03.5_ideation_report.md` (QCSD quality swarm)
- `features/<slug>/05_architecture.md`
- `features/<slug>/07_code_changes/change_manifest.md`
- `features/<slug>/diagrams/` (component diagram)

### Tier L
All of M, plus:
- `features/<slug>/02_research.md`
- `features/<slug>/04_domain_model.md`
- `features/<slug>/09_fleet_qe_assessment.md` (fleet QE)
- `features/<slug>/diagrams/domain-model.mermaid`
- `features/<slug>/diagrams/architecture-c4.mermaid`
- `features/<slug>/diagrams/sequence-*.mermaid`

### Tier XL
All of L (full depth on every artifact)

## Step-Level Quality Gates

| Step | Gate |
|------|------|
| 0 | Tier classification justified with dimension scores |
| 1 | All requirements have acceptance criteria (M+) |
| 2 | Research findings verified, not hallucinated (L/XL) |
| 3 | Every ADR has ≥2 alternatives + shift-left testability check (M+) |
| 3.5 | QCSD ideation: 3 core agents + GO/CONDITIONAL/NO-GO verdict (M+) |
| 4 | Domain model compatible with existing codebase (L/XL) |
| 5 | Mermaid diagrams valid syntax (M+) |
| 6 | Task dependencies form valid DAG + SPARC-GOAP goal state defined |
| 7 | Code follows existing codebase conventions |
| 8 | Brutal-honesty review complete, gap loop closed, all MUST requirements pass |
| 9 | Fleet QE: 4 agents, traceability matrix complete (L/XL) |

## Agentic QE Integration

Skills from [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) loaded from `references/agentic-qe/`.

### Three Modes

| Mode | Flag | `{AGENTIC_QE_MODE}` | Skills | Requires install |
|------|------|---------------------|--------|-----------------|
| Reference | (none) | `reference` | 9 core (condensed) | No |
| Direct | `--full-qe` | `direct` | 9 core (full protocols) | `npm i -g agentic-qe` |
| Direct Extended | `--full-qe-extended` | `direct-extended` | 15 (9 core + 6 extended) | `npm i -g agentic-qe` |

### Core Skills (all modes)

| Step | Skill | Protocol |
|------|-------|----------|
| 3 | shift-left-testing | Level 4: Risk Analysis in Design — testability questions + BDD scenarios per ADR |
| 3.5 | qcsd-ideation-swarm | 3 core agents (HTSM + SFDIPOT + Testability) + conditional agents per flags |
| 6 | code-goal-planner | SPARC-GOAP: Specification → Pseudocode → Architecture → Refinement → Completion |
| 8 | brutal-honesty-review | Linus mode (code) + Ramsay mode (tests) + gap detection loop |
| 9 (Agent 1) | qe-requirements-validation | SMART validation + traceability matrix + orphan test detection |
| 9 (Agent 2) | risk-based-testing | Probability×Impact 5×5 + 4-tier effort allocation |
| 9 (Agent 3) | enterprise-integration-testing | Contract testing + E2E flow validation + data consistency |
| 9 (Agent 4) | regression-testing | Change-based test selection + impact analysis + regression pyramid |
| 9 (shared) | qe-coverage-analysis | Risk-weighted coverage scoring + differential coverage |

### Extended Skills (`--full-qe-extended` only)

| Step | Skill | Condition |
|------|-------|-----------|
| 7 | tdd-london-chicago | Always — guides test-first coding |
| 8 | mutation-testing | If test suite exists |
| 8, 9 | security-testing | If `HAS_AUTH` or `HAS_EXTERNAL_API` |
| 8, 9 | performance-testing | If `HAS_PERFORMANCE_SLA` |
| 9 | chaos-engineering-resilience | If `HAS_INFRASTRUCTURE_CHANGE` |
| Post-9 | qcsd-production-swarm | Advisory — feedback loops for future runs |

## Agent Swarm

### S/M tier
Sequential execution. Step 3.5 spawns 3 core agents for M tier.

### L tier
- Steps 2+3: 2 parallel agents (sonnet + opus)
- Step 3.5: 3-9 parallel agents (core + conditional)
- Step 8: 3 parallel agents (brutal-honesty review panel)
- Step 9: 4 parallel agents (fleet QE); 4-7 with `--full-qe-extended`

### XL tier
- Steps 2+3: 2 parallel agents
- Step 3.5: 3-9 parallel agents (core + conditional)
- Steps 4+5: 2 parallel agents (if Step 3.5 done)
- Step 7: N parallel agents (per module)
- Step 8: 3 parallel agents (review panel)
- Step 9: 4 parallel agents (fleet QE); 4-7 with `--full-qe-extended`

## Model Routing

| Step | Model | Rationale |
|------|-------|-----------|
| 0 | haiku | Simple classification |
| 1 | sonnet | Analytical requirements |
| 2 | sonnet | Research synthesis |
| 3 | opus | Complex trade-off reasoning + shift-left |
| 3.5 | sonnet | QCSD swarm (multiple parallel agents) |
| 4 | opus | Domain modeling |
| 5 | opus | System design |
| 6 | sonnet | SPARC-GOAP task decomposition |
| 7 | opus | Code generation |
| 8 | sonnet | Brutal-honesty review + gap loop |
| 9 | sonnet | Fleet QE assessment (4 parallel agents) |

## Promise Tags

| Step | Promise |
|------|---------|
| 0 | `<promise>FEATURE_ADR_ROUTED</promise>` |
| 1 | `<promise>FEATURE_ADR_REQUIREMENTS_GATHERED</promise>` |
| 2-3 | `<promise>FEATURE_ADR_DESIGNED</promise>` |
| 3.5 | `<promise>FEATURE_ADR_QUALITY_ASSESSED</promise>` |
| 4-5 | `<promise>FEATURE_ADR_ARCHITECTED</promise>` |
| 6 | `<promise>FEATURE_ADR_PLANNED</promise>` |
| 7 | `<promise>FEATURE_ADR_IMPLEMENTED</promise>` |
| 8 | `<promise>FEATURE_ADR_VERIFIED</promise>` |
| 9 | `<promise>FEATURE_ADR_FLEET_VERIFIED</promise>` |

## Anti-Patterns to Check

- Skip Step 0 → BLOCK
- Code without plan (skip Step 6) → BLOCK
- No QE (skip Step 8) → BLOCK
- Skip QCSD ideation (skip Step 3.5 for M+) → BLOCK
- Ignore NO-GO verdict from Step 3.5 → BLOCK
- Skip fleet QE for L/XL (skip Step 9) → BLOCK
- Over-engineer S-tier (run full pipeline for trivial change) → FLAG
- Under-engineer XL-tier (skip ADR/DDD) → FLAG
- ADR with only 1 alternative → FLAG
- Gap loop skipped in Step 8 → FLAG
