# Agentic QE Skills Integration

Skills from [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) integrated into the feature-adr pipeline.

## Installation (for Direct Mode)

```bash
# Install agentic-qe globally
npm install -g agentic-qe

# Initialize in your project (auto-detects tech stack, configures MCP)
cd your-project && aqe init --auto
```

Then use with explicit flags:
```
/feature-adr --full-qe [описание фичи]            # Full protocols, same 9 core skills
/feature-adr --full-qe-extended [описание фичи]    # Full protocols + 6 extra skills
```

Without installation, all core skills work in Reference Mode (no setup needed).

## Skill Mapping to Feature-ADR Steps

### Core Skills (always available, Reference Mode)

| Feature-ADR Step | Agentic QE Skill | Purpose |
|-----------------|------------------|---------|
| Step 3 (ADR) → validation | shift-left-testing | Validate ADR testability (Level 4: Risk Analysis in Design) |
| Step 3.5 | qcsd-ideation-swarm | Quality criteria swarm on refined ADR (HTSM, Risk Storming, testability) |
| Step 6 (Impl Plan) | code-goal-planner | SPARC-GOAP milestone decomposition |
| Step 8 (QE) → review | brutal-honesty-review | Linus/Ramsay/Bach modes for code + test review |
| Step 8 → gap loop | requirements-validator (via shift-left) | Find gaps in implementation, iterate until fixed |
| Step 9 → Agent 1 | qe-requirements-validation | Traceability matrix, SMART validation, orphan test detection |
| Step 9 → Agent 2 | risk-based-testing | Probability×Impact 5×5 scoring, 4-tier test allocation |
| Step 9 → Agent 3 | enterprise-integration-testing | Cross-module contract testing, E2E flow validation |
| Step 9 → Agent 4 | regression-testing | Change-based test selection, impact analysis, regression pyramid |
| Step 9 → shared | qe-coverage-analysis | Risk-weighted coverage scoring, differential coverage |

### Extended Skills (Direct Extended Mode only, `--full-qe-extended`)

| Feature-ADR Step | Agentic QE Skill | Purpose | Condition |
|-----------------|------------------|---------|-----------|
| Step 7 | tdd-london-chicago | TDD school selection (London mocks vs Chicago state) | Always in direct mode |
| Step 8 | mutation-testing | Mutation score analysis, surviving mutant diagnosis | If test suite exists |
| Step 8, 9 | security-testing | OWASP Top 10, access control, injection, crypto failures | `HAS_AUTH` or `HAS_EXTERNAL_API` |
| Step 8, 9 | performance-testing | Load/stress/spike/endurance testing, SLO verification | `HAS_PERFORMANCE_SLA` |
| Step 9 | chaos-engineering-resilience | Fault injection, blast radius progression, steady state | `HAS_INFRASTRUCTURE_CHANGE` |
| Step 9+ | qcsd-production-swarm | 12-agent post-release health, DORA metrics, feedback loops | Advisory (post-deploy) |

## Source Repository

- Repository: https://github.com/proffesor-for-testing/agentic-qe
- Skills path: `assets/skills/`
- Agents path: `.claude/agents/goal/`
- Total skills in repo: 77+
- Skills integrated: 15 (9 core + 6 extended)

### Trust Tiers

| Skill | Tier |
|-------|------|
| shift-left-testing | 3 (Verified) |
| qcsd-ideation-swarm | 3 (Verified) |
| brutal-honesty-review | 2 (Validated) |
| qe-requirements-validation | 3 (Verified) |
| risk-based-testing | 3 (Verified) |
| enterprise-integration-testing | 3 (Verified) |
| regression-testing | 3 (Verified) |
| qe-coverage-analysis | 3 (Verified) |
| chaos-engineering-resilience | 3 (Verified) |
| security-testing | 3 (Verified) |
| performance-testing | 3 (Verified) |
| mutation-testing | 3 (Verified) |
| tdd-london-chicago | 3 (Verified) |
| qcsd-production-swarm | 3 (Verified) |

## Integration Modes

### Reference Mode (default, no setup)

Skills are stored as condensed copies in `references/agentic-qe/`.
Feature-adr modules read the skill instructions and apply their methodology
within the feature-adr checkpoint framework.

- Works out of the box
- 15 files, ~50KB total
- Covers all core pipeline steps

### Direct Mode (`--full-qe`, requires installation)

When `--full-qe` flag is used and agentic-qe is installed:

1. Step 0 detects agentic-qe installation (`which aqe`)
2. Sets `{AGENTIC_QE_MODE}` = `direct`
3. Modules load full skill files from agentic-qe package for the same 9 core skills
4. Full QCSD swarm protocols with all agents + DDD mapping
5. No additional skills — same agents, deeper protocols

**When to use:**
- L/XL tier features needing deeper QE methodology
- Teams with established QE practices

### Direct Extended Mode (`--full-qe-extended`, requires installation)

Everything from `--full-qe` PLUS 6 additional skills:

1. Sets `{AGENTIC_QE_MODE}` = `direct-extended`
2. Step 7 gets TDD London/Chicago guidance
3. Step 8 gets mutation testing + security + performance
4. Step 9 gets up to 3 extra conditional agents (chaos, security, performance)
5. Post-Step 9 gets production swarm feedback loops

**When to use:**
- XL tier features with security/compliance requirements
- Banking domain (ФЗ-152), regulatory compliance
- Maximum QE coverage needed

**When Reference Mode is enough:**
- S/M tier features
- Quick iteration / prototyping
- No special QE requirements

## Files in this directory

### Core (always loaded)
- `shift-left-testing.md` — Full copy (Tier 3)
- `qcsd-ideation-swarm.md` — Condensed from ~77KB (Tier 3)
- `code-goal-planner.md` — Full copy (Agent)
- `brutal-honesty-review.md` — Full copy (Tier 2)
- `qe-requirements-validation.md` — Full copy, 254 lines (Tier 3)
- `risk-based-testing.md` — Full copy, 212 lines (Tier 3)
- `enterprise-integration-testing.md` — Condensed from 735 lines (Tier 3)
- `regression-testing.md` — Full copy, 233 lines (Tier 3)
- `qe-coverage-analysis.md` — Full copy, 193 lines (Tier 3)

### Extended (loaded in Direct Mode)
- `chaos-engineering-resilience.md` — Full copy, 164 lines (Tier 3)
- `security-testing.md` — Full copy, 312 lines (Tier 3)
- `performance-testing.md` — Full copy, 316 lines (Tier 3)
- `mutation-testing.md` — Full copy, 237 lines (Tier 3)
- `tdd-london-chicago.md` — Full copy, 250 lines (Tier 3)
- `qcsd-production-swarm.md` — Condensed from 2781 lines (Tier 3)
