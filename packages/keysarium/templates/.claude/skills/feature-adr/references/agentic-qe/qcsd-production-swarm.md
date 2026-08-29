# QCSD Production Swarm (Condensed for Feature ADR)

> Source: agentic-qe `qcsd-production-swarm` skill (Tier 3)
> Condensed from 2781 lines — SAP/middleware-specific agents removed, universal patterns retained.

## Purpose

Post-release production health assessment and QCSD feedback loop closure.
The only QCSD phase with dual responsibility: assessing current health AND
closing the feedback loop back to earlier phases.

## QCSD Phase Positioning

| Phase | Swarm | Question | Decision |
|-------|-------|----------|----------|
| Ideation | qcsd-ideation-swarm | Should we build this? | GO / CONDITIONAL / NO-GO |
| Refinement | qcsd-refinement-swarm | How should we test this? | READY / CONDITIONAL / NOT-READY |
| Development | qcsd-development-swarm | Is code quality sufficient? | SHIP / CONDITIONAL / HOLD |
| Verification | qcsd-cicd-swarm | Is this change safe to release? | RELEASE / REMEDIATE / BLOCK |
| **Production** | **qcsd-production-swarm** | **Is release healthy?** | **HEALTHY / DEGRADED / CRITICAL** |

## Core Agents (always run)

| Agent | Domain | Role |
|-------|--------|------|
| qe-metrics-optimizer | learning-optimization | DORA metrics + SLA compliance |
| qe-defect-predictor | defect-intelligence | Defect trend + density prediction |
| qe-root-cause-analyzer | defect-intelligence | Incident RCA + severity assessment |

## Conditional Agents (flag-based)

| Flag | Agent | When to activate |
|------|-------|------------------|
| HAS_INFRASTRUCTURE_CHANGE | qe-chaos-engineer | Infra changes in release |
| HAS_PERFORMANCE_SLA | qe-performance-tester | Performance SLAs defined |
| HAS_REGRESSION_RISK | qe-regression-analyzer | Known regression risk areas |
| HAS_RECURRING_INCIDENTS | qe-pattern-learner | Repeated incident patterns |

## Feedback Agents (always run, SEQUENTIAL)

| Order | Agent | Role |
|-------|-------|------|
| 1st | qe-learning-coordinator | Synthesize production findings |
| 2nd | qe-transfer-specialist | Transfer learnings to Ideation + Refinement |

## Decision Logic

```
CRITICAL (any condition):
  - Active P0/P1 incidents
  - DORA score < 0.4
  - SLA compliance < 95%
  - Accelerating defect trend (increasing + density > 5.0/KLOC)

HEALTHY (all conditions):
  - DORA score >= 0.7
  - SLA compliance >= 99%
  - No P0/P1/P2 incidents
  - RCA completeness >= 80%
  - Defect trend declining or stable
  - Defect density <= 2.0/KLOC

DEGRADED:
  - Everything else (default)
```

## Execution Pattern (3 batches)

```
Batch 1 (parallel):  Core agents [3]
  → WAIT for all to complete
Batch 2 (parallel):  Conditional agents [0-4, based on flags]
  → WAIT for all to complete
Batch 3 (sequential): Feedback agents [2, strictly ordered]
  → Learning coordinator THEN transfer specialist
```

## Enforcement Rules

1. ALL THREE core agents MUST be spawned — no exceptions
2. All parallel agents in a SINGLE message
3. STOP and WAIT after each batch
4. Conditional agents MUST spawn if flags are TRUE
5. Decision logic applied EXACTLY as specified
6. Both feedback agents MUST run SEQUENTIALLY
7. Learning persistence MUST happen BEFORE feedback agents

## Feedback Loop Closure

Production swarm closes the QCSD loop by feeding findings back:

```
Production findings
  → qe-learning-coordinator (synthesize)
    → qe-transfer-specialist (distribute)
      → Ideation phase (future GO/NO-GO informed by production data)
      → Refinement phase (test strategy informed by production failures)
```

This is the key differentiator: no other QCSD phase feeds back to earlier phases.

## Integration with Feature ADR

When used in Direct Mode (full agentic-qe installed):
- After Step 9 Fleet QE detects issues, production swarm feedback patterns
  inform future `/feature-adr` runs via memory system
- Historical production health data feeds Step 3.5 QCSD Ideation quality risks
- Defect patterns from production inform Step 2 Research phase
