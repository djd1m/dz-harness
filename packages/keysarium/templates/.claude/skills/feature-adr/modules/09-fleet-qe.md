# Step 9: Fleet QE Assessment (Final Quality Gate)

> Comprehensive quality fleet assessment — the final "did we miss something?" check before declaring the feature complete.
> Each agent applies methodology from [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) skills.

## When

L/XL tiers only. For S/M tiers, Step 8 is the final step.

This step implements the recursive quality loop: if gaps are found, the pipeline
returns to the appropriate earlier step for remediation.

## Model

sonnet (analytical fleet coordination — multiple parallel agents)

## Input

- `{QE_RESULTS}` from Step 8
- `{REQUIREMENTS}` from Step 1
- `{ADR_DECISIONS}` from Step 3
- `{IDEATION_VERDICT}` and `{QUALITY_RISKS}` from Step 3.5
- `{CODE_CHANGES}` from Step 7
- All feature artifacts in `features/<slug>/`

## Protocol

### 1. Fleet Assembly

> Load agent protocols:
> - Agent 1: `references/agentic-qe/qe-requirements-validation.md`
> - Agent 2: `references/agentic-qe/risk-based-testing.md`
> - Agent 3: `references/agentic-qe/enterprise-integration-testing.md`
> - Agent 4: `references/agentic-qe/regression-testing.md`
> - Shared: `references/agentic-qe/qe-coverage-analysis.md`

Spawn a QE fleet of 4 parallel assessment agents:

| Agent | Role | Agentic QE Skill | Model | Scope |
|-------|------|-------------------|-------|-------|
| Agent 1 | Requirements Traceability Auditor | qe-requirements-validation | sonnet | Every FR-N → test → code → ADR chain |
| Agent 2 | Risk Mitigation Verifier | risk-based-testing | sonnet | Every QCSD risk → mitigation in code |
| Agent 3 | Integration Integrity Checker | enterprise-integration-testing | sonnet | Cross-module interactions, API contracts |
| Agent 4 | Regression Impact Analyzer | regression-testing | sonnet | Changes vs existing codebase, side effects |

All 4 agents MUST be spawned in a SINGLE message.

Each agent loads its corresponding agentic-qe skill protocol and applies
the methodology within the feature-adr context.

### 2. Traceability Matrix (Agent 1)

> Protocol from: `qe-requirements-validation` (Tier 3)

Apply the **qe-requirements-validation** traceability matrix protocol:

1. **SMART Validation**: For each FR-N, verify acceptance criteria are Specific, Measurable, Achievable, Relevant, Testable
2. **Forward Traceability**: Map requirements → ADR → tasks → code → tests
3. **Backward Traceability**: Map tests → code → tasks → ADR → requirements
4. **Orphan Detection**: Find tests not linked to any requirement, code not covered by tests

Build the complete traceability chain:

```
FR-{N} → ADR-{M} → TASK-{K} → File:{path} → Test:{name} → Status: ✅|❌|⚠️
```

Coverage gate (from qe-requirements-validation):
- Minimum coverage: 80% of FR-N chains complete
- Maximum untested requirements: 2
- Any broken chain on MUST requirement = GAP

### 3. Risk Verification (Agent 2)

> Protocol from: `risk-based-testing` (Tier 3)

Apply the **risk-based-testing** Probability × Impact scoring:

For each critical/high risk from Step 3.5, score using the 5×5 matrix:

**Probability factors** (1-5): complexity, change rate, developer experience, technical debt
**Impact factors** (1-5): users affected, revenue, safety, reputation

```
RISK-{N}: {description}
  Risk Score: Probability({1-5}) × Impact({1-5}) = {score}
  Priority Tier: Critical(≥20) | High(12-19) | Medium(6-11) | Low(≤5)
  Mitigation in code: {file:line or "MISSING"}
  Test covering mitigation: {test name or "MISSING"}
  Status: MITIGATED | PARTIALLY_MITIGATED | UNMITIGATED
```

Test effort allocation (from risk-based-testing):
- Critical risks: 60% of verification effort
- High risks: 25%
- Medium risks: 10%
- Low risks: 5%

Any UNMITIGATED critical risk (score ≥ 20) = GAP.

### 4. Integration Check (Agent 3)

> Protocol from: `enterprise-integration-testing` (Tier 3, condensed)

Apply the **enterprise-integration-testing** hierarchical testing strategy:

**Phase 1 — Contract validation:**
- API contracts match between producer and consumer
- Request/response schemas compatible
- No breaking changes in shared interfaces

**Phase 2 — Integration boundary testing:**
- Data models consistent across modules
- Event/message schemas compatible
- Database access patterns don't conflict

**Phase 3 — E2E flow validation:**
- Complete user flows work end-to-end
- Cross-module data consistency verified
- Correlation IDs propagate through the chain

**Phase 4 — Error recovery:**
- No circular dependencies introduced
- External service mocks are realistic
- Failure scenarios have compensation/rollback

Integration quality gates:
- Cross-module data consistency: 100% for critical paths → BLOCK on failure
- API contract compliance: 100% → BLOCK on failure
- Error recovery: all compensation paths tested → WARN if partial

### 5. Regression Analysis (Agent 4)

> Protocol from: `regression-testing` (Tier 3)

Apply the **regression-testing** change-based test selection and impact analysis:

**Step 1 — Change-based analysis** (from regression-testing):
- Map `{CODE_CHANGES}` via git diff to affected test suites
- Classify tests: mustRun | shouldRun | canSkip
- Expected reduction: 70-90% of full suite

**Step 2 — Impact analysis:**
- Which existing tests could break? (run mustRun + shouldRun)
- Which existing features share modified files?
- Are there implicit dependencies not in the task graph?
- Does the feature change any public API?

**Step 3 — Regression suite execution:**
- Quick suite (per-commit critical tests): MUST pass
- Extended suite (broader coverage): SHOULD pass
- Full suite (complete regression): recommended for XL tier

**Step 4 — Coverage delta** (from qe-coverage-analysis):
- New code coverage: must hit 80%
- Modified code: must maintain previous coverage
- Critical paths: must hit 90%

### 5.5. Shared Coverage Analysis

> Protocol from: `qe-coverage-analysis`

All 4 agents feed their findings into a shared coverage analysis:
- Risk-weighted coverage scoring: complexity(0.3) + change frequency(0.25) + bug history(0.25) + criticality(0.2)
- Differential coverage assessment for new vs modified code
- Gap prioritization by risk weight

### 6. Gap Synthesis and Decision

After all agents complete, synthesize findings:

```
┌─────────────────────────────────────────────────────────┐
│              FLEET QE ASSESSMENT RESULTS                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Traceability: {N}/{M} chains complete ({%})             │
│  Risk Mitigation: {N}/{M} risks mitigated ({%})          │
│  Integration: {N} issues found                           │
│  Regression: {N} potential impacts identified             │
│                                                          │
│  GAPS FOUND: {count}                                     │
│  VERDICT: COMPLETE | NEEDS_REMEDIATION                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7. Remediation Loop

If gaps are found (NEEDS_REMEDIATION):

1. Classify each gap by origin step:
   - Requirements gap → return to Step 1
   - ADR gap → return to Step 3
   - Implementation gap → return to Step 7
   - Test gap → return to Step 8
2. Present gaps to user with remediation recommendations
3. After user confirms, execute remediation at the appropriate step
4. Re-run Step 9 fleet assessment (max 2 iterations)
5. If gaps remain after 2 iterations → flag for user decision

If no gaps (COMPLETE):
- Declare feature ready
- Generate final README.md for `features/<slug>/`

## Output

Create `features/<slug>/09_fleet_qe_assessment.md` with:
- Traceability matrix
- Risk mitigation status
- Integration check results
- Regression analysis
- Gap list (if any)
- Remediation actions taken (if any)
- Final verdict

Set `{FLEET_QE_VERDICT}` variable (COMPLETE | NEEDS_REMEDIATION).

## Checkpoint Format

```
═══════════════════════════════════════════════════════
⏸️ STEP 9: Fleet QE Assessment Complete
<promise>FEATURE_ADR_FLEET_VERIFIED</promise>
Tier: {COMPLEXITY_TIER}

Fleet: 4 agents | Traceability: {%} | Risks mitigated: {%}
Gaps found: {N} | Verdict: {COMPLETE | NEEDS_REMEDIATION}

{If NEEDS_REMEDIATION:}
Gaps requiring attention:
1. {gap description} → return to Step {N}
2. {gap description} → return to Step {N}

• "ок" — feature complete! (if COMPLETE)
• "исправь" — remediate gaps (if NEEDS_REMEDIATION)
• "пропусти [gap]" — accept risk for specific gap
═══════════════════════════════════════════════════════
```

## Quality Gates

- [ ] All 4 fleet agents spawned and completed
- [ ] Traceability matrix covers all requirements
- [ ] Critical QCSD risks verified as mitigated
- [ ] No unresolved integration issues
- [ ] Regression analysis completed
- [ ] Remediation loop completed (if gaps found)
- [ ] Fleet QE report created

## Direct Mode (`--full-qe`)

When `{AGENTIC_QE_MODE}` = `direct` (activated via `--full-qe` flag), Step 9
uses full agentic-qe protocols for the same 4 core agents. No additional agents
are added — the same fleet runs with deeper methodology from the full skill files.

### What changes

| Agent | Reference Mode | Direct Mode (`--full-qe`) |
|-------|---------------|---------------------------|
| Agent 1 | Condensed qe-requirements-validation | Full SMART + BDD + sprint coverage protocol |
| Agent 2 | Condensed risk-based-testing | Full 5×5 matrix + ML-enhanced + dynamic reassessment |
| Agent 3 | Condensed enterprise-integration | Full hierarchical fleet + QCSD flags |
| Agent 4 | Condensed regression-testing | Full change-based + historical + time-budget strategies |

## Pattern Memory Loop (Direct Modes)

When `{AGENTIC_QE_MODE}` = `direct` | `direct-extended`, Step 9 runs a recall → store cycle over
agentic-qe pattern memory. Non-blocking: errors or empty results never stall the assessment.
(`fleet_init` was called in Step 0; call it first if this session resumed at Step 9.)

**Before fleet assembly** — prime agent focus areas:

```
mcp__agentic-qe__memory_query({ pattern: "patterns/feature-adr/fleet/*", namespace: "learning", limit: 5 })
```

Fold recurring findings (e.g. traceability chains that historically break, risk categories that recur)
into each agent's scope brief.

**After the fleet verdict** — store the finding for future pipeline runs:

```
mcp__agentic-qe__memory_store({
  key: "patterns/feature-adr/fleet/{timestamp}",
  namespace: "learning",
  value: {
    pattern: "<one-sentence lesson from this assessment>",
    confidence: <honest 0-1 from gap synthesis — never a fabricated 1.0>,
    type: "fleet-qe-finding",
    metadata: { tier: "{COMPLEXITY_TIER}", verdict: "{FLEET_QE_VERDICT}", agents_used: <4-7>, remediation_count: <N> }
  },
  persist: true
})
```

Then persist the SAME finding durably via the dz lexical store (the aqe kv store is
ephemeral across MCP-server restarts — the dz half survives):

```
dz teach "<the same one-sentence lesson>" --reward <same confidence> --domain feature-adr \
  --type <success-pattern if COMPLETE, else lesson-learned>
```

Non-blocking: if `dz` is unavailable or fails, note it and proceed.

## Direct Extended Mode (`--full-qe-extended`)

When `{AGENTIC_QE_MODE}` = `direct-extended`, Step 9 gets everything from
`--full-qe` PLUS additional conditional agents and production feedback loops.

### Additional Conditional Agents

| Agent | Skill | Condition | Scope |
|-------|-------|-----------|-------|
| Agent 5 | chaos-engineering-resilience | `HAS_INFRASTRUCTURE_CHANGE` | Fault injection, blast radius, steady state |
| Agent 6 | security-testing | `HAS_AUTH` or `HAS_EXTERNAL_API` | OWASP Top 10, access control, injection |
| Agent 7 | performance-testing | `HAS_PERFORMANCE_SLA` | Load/stress/spike testing, SLO verification |

These agents are spawned alongside Agents 1-4 in the same message.

### Post-Assessment: Production Feedback

After Step 9 completes, if `--full-qe-extended` is active:
1. Load `qcsd-production-swarm` feedback loop patterns
2. Store Fleet QE findings via the Pattern Memory Loop above (`patterns/feature-adr/fleet/{timestamp}`)
3. Flag production health risks for monitoring post-deploy
4. Advisory: suggest post-deploy monitoring checklist

### Extended Checkpoint (Direct Extended Mode)

```
Fleet: {4-7} agents | Mode: full-qe-extended | Traceability: {%} | Risks: {%}
Extended: Security: {PASS|WARN|FAIL} | Performance: {PASS|WARN|FAIL} | Chaos: {PASS|WARN|N/A}
```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Skipping fleet QE "for speed" | No Step 9 for L/XL | BLOCK — mandatory for L/XL |
| Fewer than 4 agents | Agent count < 4 | BLOCK — all 4 required |
| Infinite remediation loop | > 2 iterations | Stop, flag for user |
| Accepting unmitigated critical risks | UNMITIGATED status for critical | Require explicit user acknowledgment |
| Using --full-qe-extended for S/M tier | Flag on simple features | WARN — overhead not justified |
| --full-qe without agentic-qe installed | Flag present, tool missing | WARN and fall back to reference mode |
