---
name: chaos-engineering-resilience
description: "Chaos engineering principles, controlled failure injection, resilience testing, and system recovery validation. Use when testing distributed systems, building confidence in fault tolerance, or validating disaster recovery."
category: specialized-testing
priority: high
tokenEstimate: 900
agents: [qe-chaos-engineer, qe-performance-tester, qe-production-intelligence]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [chaos, resilience, fault-injection, distributed-systems, recovery, netflix]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/chaos-engineering-resilience.yaml
---

<!-- Vendored from https://github.com/proffesor-for-testing/agentic-qe at 0a6de058575cbe292afe220df105cc74120f7674 (MIT, Copyright (c) 2025 Agentic QE Contributors), 2026-10-24. Bundled references do not install aqe, MCP tools, pattern memory, or fleet runtime. See ../LICENSE.agentic-qe and ../README.md. -->

## Keysarium execution adapter

This pinned upstream body is methodology inside the bundled feature-ADR pipeline. In Reference Mode, the feature-ADR module that loaded this file owns orchestration and checkpoints. Use the reasoning and output shape below with the host's available tools. Do not treat upstream `aqe` CLI/MCP calls, named agent roles, browser tools, or example absolute paths as installed capabilities. Name a missing capability or evidence in the checkpoint instead of reporting that an upstream step ran. The schemas and eval files are bundled for explicit validation; bundling them does not run those checks automatically.

Relative paths such as `schemas/output.json`, `evals/...` and `steps/...` resolve from this skill directory under `references/agentic-qe/`. Direct Extended Mode still requires a separately installed `aqe` runtime; verify each required runtime capability before using it.

The upstream `run-history.json` is execution history, not a reference contract, and is intentionally omitted. Do not run an upstream example that reads or writes it unless an installed aqe runtime supplies its own history.

<!-- BEGIN AGENTIC-QE UPSTREAM BODY -->

# Chaos Engineering & Resilience Testing

<default_to_action>
When testing system resilience or injecting failures:
1. DEFINE steady state (normal metrics: error rate, latency, throughput)
2. HYPOTHESIZE system continues in steady state during failure
3. INJECT real-world failures (network, instance, disk, CPU)
4. OBSERVE and measure deviation from steady state
5. FIX weaknesses discovered, document runbooks, repeat

**Quick Chaos Steps:**
- Start small: Dev → Staging → 1% prod → gradual rollout
- Define clear rollback triggers (error_rate > 5%)
- Measure blast radius, never exceed planned scope
- Document findings → runbooks → improved resilience

**Critical Success Factors:**
- Controlled experiments with automatic rollback
- Steady state must be measurable
- Start in non-production, graduate to production
</default_to_action>

## Quick Reference Card

### When to Use
- Distributed systems validation
- Disaster recovery testing
- Building confidence in fault tolerance
- Pre-production resilience verification

### Failure Types to Inject
| Category | Failures | Tools |
|----------|----------|-------|
| **Network** | Latency, packet loss, partition | tc, toxiproxy |
| **Infrastructure** | Instance kill, disk failure, CPU | Chaos Monkey |
| **Application** | Exceptions, slow responses, leaks | Gremlin, LitmusChaos |
| **Dependencies** | Service outage, timeout | WireMock |

### Blast Radius Progression
```
Dev (safe) → Staging → 1% prod → 10% → 50% → 100%
     ↓           ↓         ↓        ↓
  Learn      Validate   Careful   Full confidence
```

### Steady State Metrics
| Metric | Normal | Alert Threshold |
|--------|--------|-----------------|
| Error rate | < 0.1% | > 1% |
| p99 latency | < 200ms | > 500ms |
| Throughput | baseline | -20% |

---

## Chaos Experiment Structure

```typescript
// Chaos experiment definition
const experiment = {
  name: 'Database latency injection',
  hypothesis: 'System handles 500ms DB latency gracefully',
  steadyState: {
    errorRate: '< 0.1%',
    p99Latency: '< 300ms'
  },
  method: {
    type: 'network-latency',
    target: 'database',
    delay: '500ms',
    duration: '5m'
  },
  rollback: {
    automatic: true,
    trigger: 'errorRate > 5%'
  }
};
```

---

## Agent-Driven Chaos

```typescript
// qe-chaos-engineer runs controlled experiments
await Task("Chaos Experiment", {
  target: 'payment-service',
  failure: 'terminate-random-instance',
  blastRadius: '10%',
  duration: '5m',
  steadyStateHypothesis: {
    metric: 'success-rate',
    threshold: 0.99
  },
  autoRollback: true
}, "qe-chaos-engineer");

// Validates:
// - System recovers automatically
// - Error rate stays within threshold
// - No data loss
// - Alerts triggered appropriately
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/chaos-engineering/
├── experiments/*       - Experiment definitions & results
├── steady-states/*     - Baseline measurements
├── runbooks/*          - Generated recovery procedures
└── blast-radius/*      - Impact analysis
```

### Fleet Coordination
```typescript
const chaosFleet = await FleetManager.coordinate({
  strategy: 'chaos-engineering',
  agents: [
    'qe-chaos-engineer',          // Experiment execution
    'qe-performance-tester',      // Baseline metrics
    'qe-production-intelligence'  // Production monitoring
  ],
  topology: 'sequential'
});
```

---

## Related Skills
- [shift-right-testing](../shift-right-testing/) - Production testing
- [performance-testing](../performance-testing/) - Load testing
- [test-environment-management](../test-environment-management/) - Environment stability

---

## Remember

**Break things on purpose to prevent unplanned outages.** Find weaknesses before users do. Define steady state, inject failures, measure impact, fix weaknesses, create runbooks. Start small, increase blast radius gradually.

**With Agents:** `qe-chaos-engineer` automates chaos experiments with blast radius control, automatic rollback, and comprehensive resilience validation. Generates runbooks from experiment results.
<!-- END AGENTIC-QE UPSTREAM BODY -->
