---
name: "qe-coverage-analysis"
description: "Analyzes test coverage data (Istanbul, c8, lcov) to identify uncovered lines, branches, and functions with risk-weighted gap detection. Use when analyzing coverage reports, identifying coverage gaps, comparing coverage between branches, or prioritizing which untested code to cover first."
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/qe-coverage-analysis.yaml
---

<!-- Vendored from https://github.com/proffesor-for-testing/agentic-qe at 0a6de058575cbe292afe220df105cc74120f7674 (MIT, Copyright (c) 2025 Agentic QE Contributors), 2026-10-23. Bundled references do not install aqe, MCP tools, pattern memory, or fleet runtime. See ../LICENSE.agentic-qe and ../README.md. -->

## Keysarium execution adapter

This pinned upstream body is methodology inside the bundled feature-ADR pipeline. In Reference Mode, the feature-ADR module that loaded this file owns orchestration and checkpoints. Use the reasoning and output shape below with the host's available tools. Do not treat upstream `aqe` CLI/MCP calls, named agent roles, browser tools, or example absolute paths as installed capabilities. Name a missing capability or evidence in the checkpoint instead of reporting that an upstream step ran. The schemas and eval files are bundled for explicit validation; bundling them does not run those checks automatically.

Relative paths such as `schemas/output.json`, `evals/...` and `steps/...` resolve from this skill directory under `references/agentic-qe/`. When Direct Mode has a separately installed `aqe` runtime, follow the feature-ADR module's direct-mode branch and verify that each required runtime capability is actually available.

The upstream `run-history.json` is execution history, not a reference contract, and is intentionally omitted. Do not run the upstream example that reads or writes it unless an installed aqe runtime supplies its own history.

<!-- BEGIN AGENTIC-QE UPSTREAM BODY -->

# QE Coverage Analysis

## Purpose

Guide the use of v3's advanced coverage analysis capabilities including sublinear gap detection algorithms, risk-weighted coverage scoring, and intelligent test prioritization based on code criticality.

## Activation

- When analyzing test coverage
- When identifying coverage gaps
- When prioritizing testing effort
- When setting coverage targets
- When assessing code risk

## Quick Start

```bash
# Analyze coverage with gap detection
aqe coverage analyze --source src/ --tests tests/

# Find high-risk uncovered code
aqe coverage gaps --risk-weighted --threshold 80

# Generate coverage report
aqe coverage report --format html --output coverage-report/

# Compare coverage between branches
aqe coverage diff --base main --head feature-branch
```

## Agent Workflow

```typescript
// Comprehensive coverage analysis
Task("Analyze coverage gaps", `
  Perform O(log n) coverage analysis on src/:
  - Calculate statement, branch, function coverage
  - Identify uncovered critical paths
  - Risk-weight gaps by code complexity and change frequency
  - Recommend tests to write for maximum coverage impact
`, "qe-coverage-specialist")

// Risk-based prioritization
Task("Prioritize coverage effort", `
  Analyze coverage gaps and prioritize by:
  - Business criticality (payment, auth, data)
  - Code complexity (cyclomatic > 10)
  - Recent bug history
  - Change frequency
  Output prioritized list of files needing tests.
`, "qe-coverage-analyzer")
```

## Analysis Strategies

### 1. Sublinear Gap Detection

```typescript
await coverageAnalyzer.detectGaps({
  algorithm: 'sublinear',  // O(log n) complexity
  source: 'src/**/*.ts',
  metrics: ['statement', 'branch', 'function'],
  sampling: {
    enabled: true,
    confidence: 0.95,
    maxSamples: 1000
  }
});
```

### 2. Risk-Weighted Coverage

```typescript
await coverageAnalyzer.riskWeightedAnalysis({
  coverage: coverageReport,
  riskFactors: {
    complexity: { weight: 0.3, threshold: 10 },
    changeFrequency: { weight: 0.25, window: '90d' },
    bugHistory: { weight: 0.25, window: '180d' },
    criticality: { weight: 0.2, tags: ['payment', 'auth'] }
  },
  output: {
    riskScore: true,
    prioritizedGaps: true
  }
});
```

### 3. Differential Coverage

```typescript
await coverageAnalyzer.diffCoverage({
  base: 'main',
  head: 'feature-branch',
  requirements: {
    newCode: 80,           // New code must have 80% coverage
    modifiedCode: 'maintain',  // Don't decrease existing
    deletedCode: 'ignore'
  }
});
```

## Coverage Thresholds

```yaml
thresholds:
  global:
    statements: 80
    branches: 75
    functions: 85
    lines: 80

  per_file:
    min_statements: 70
    critical_paths: 90

  new_code:
    statements: 85
    branches: 80

  exceptions:
    - path: "src/migrations/**"
      reason: "Database migrations"
    - path: "src/generated/**"
      reason: "Auto-generated code"
```

## Coverage Report

```typescript
interface CoverageAnalysis {
  summary: {
    statements: { covered: number; total: number; percentage: number };
    branches: { covered: number; total: number; percentage: number };
    functions: { covered: number; total: number; percentage: number };
  };
  gaps: {
    file: string;
    uncoveredLines: number[];
    uncoveredBranches: BranchInfo[];
    riskScore: number;
    suggestedTests: string[];
  }[];
  trends: {
    period: string;
    coverageChange: number;
    newGaps: number;
    closedGaps: number;
  };
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    file: string;
    action: string;
    expectedImpact: number;
  }[];
}
```

## Quality Gates

```yaml
quality_gates:
  coverage:
    block_merge:
      - new_code_coverage < 80
      - coverage_regression > 5
      - critical_path_uncovered

    warn:
      - overall_coverage < 75
      - branch_coverage < 70

    metrics:
      - track_trends: true
      - alert_on_decline: 3  # consecutive PRs
```

## Run History

After each coverage analysis, append results to `run-history.json` in this skill directory:
```bash
# Read current history, append new entry, write back
node -e "
const fs = require('fs');
const h = JSON.parse(fs.readFileSync('.claude/skills/qe-coverage-analysis/run-history.json'));
h.runs.push({date: new Date().toISOString().split('T')[0], statements_pct: STATEMENTS, branches_pct: BRANCHES, gaps_found: GAPS});
fs.writeFileSync('.claude/skills/qe-coverage-analysis/run-history.json', JSON.stringify(h, null, 2));
"
```
Read `run-history.json` before each run to detect trends (e.g., "coverage dropped 3 consecutive times").

## Skill Composition

- **Coverage dropped?** → Use `/coverage-drop-investigator` to trace the cause
- **Need more tests** → Use `/qe-test-generation` to fill gaps
- **Validate quality** → Use `/mutation-testing` to ensure coverage means quality
- **Ship decision** → Feed into `/qe-quality-assessment` for deployment readiness

## Gotchas

- High line coverage does NOT mean good tests — 100% coverage with 0% assertions is common agent output. Use mutation testing to verify
- coverage-analysis domain has 86% success rate — 14% of runs fail on initialization. Always verify results and have fallback plan (e.g. manual coverage tools)
- Self-learning pipeline may silently stop learning (statusline frozen for days) — only human inspection catches this

## Coordination

**Primary Agents**: qe-coverage-specialist, qe-coverage-analyzer, qe-gap-detector
**Coordinator**: qe-coverage-coordinator
**Related Skills**: qe-test-generation, qe-quality-assessment
<!-- END AGENTIC-QE UPSTREAM BODY -->
