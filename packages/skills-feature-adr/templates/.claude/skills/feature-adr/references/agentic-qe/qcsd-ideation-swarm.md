---
name: qcsd-ideation-swarm
description: "QCSD Ideation phase swarm for Quality Criteria sessions using HTSM v6.3, Risk Storming, and Testability analysis before development begins."
source: https://github.com/proffesor-for-testing/agentic-qe/tree/main/assets/skills/qcsd-ideation-swarm
version: 7.5.1
trust_tier: 3
agents:
  core: [qe-quality-criteria-recommender, qe-risk-assessor, qe-requirements-validator]
  conditional: [qe-accessibility-auditor, qe-security-auditor, qe-qx-partner]
---

# QCSD Ideation Swarm (Adapted for Feature-ADR)

Shift-left quality engineering swarm applied to feature ADR and requirements analysis.

---

## Phase 1: Flag Detection

Scan feature requirements/ADR and SET these flags:

```
□ HAS_UI = FALSE
  Set TRUE if feature contains: UI, frontend, visual, component, screen, page, form, button,
  modal, dialog, dashboard, widget, interface, display, view, layout, CSS, styling

□ HAS_SECURITY = FALSE
  Set TRUE if feature contains: auth, security, credential, token, encrypt, PII, compliance,
  password, login, session, OAuth, JWT, permission, role, access control, RBAC, sensitive

□ HAS_UX = FALSE
  Set TRUE if feature contains: user experience, UX, journey, usability, user flow, persona,
  friction, delight, onboarding, retention, engagement
```

## Phase 2: Spawn Core Agents (3 parallel)

ALL THREE core agents MUST be spawned in a single message:

### Agent 1: Quality Criteria Recommender (HTSM v6.3)
Analyze ALL 10 HTSM categories with weight and testability score:
1. Capability — does it do what's required?
2. Reliability — under stress, load, edge cases
3. Usability — learnability, accessibility, efficiency
4. Charisma — visual design, responsiveness
5. Security — authentication, authorization, data protection
6. Scalability — growth handling, resource limits
7. Compatibility — browsers, devices, APIs, integrations
8. Performance — speed, throughput, resource usage
9. Installability — deployment, configuration, migration
10. Development — testability, maintainability, portability

### Agent 2: Risk Assessor (SFDIPOT)
Apply SFDIPOT framework:
- **S**tructure: Code architecture, component dependencies
- **F**unction: Business logic, calculations, workflows
- **D**ata: Data integrity, migrations, edge values
- **I**nterfaces: API contracts, integration points, UI interactions
- **P**latform: OS, browser, infrastructure dependencies
- **O**perations: Deployment, monitoring, maintenance
- **T**ime: Scheduling, concurrency, timeouts, caching

Identify minimum 10 risks with probability (1-5), impact (1-5), and risk score.

### Agent 3: Requirements Validator (Testability)
Apply 10 Principles of Testability, score each 0-100:
1. Observability — can we see what the system does?
2. Controllability — can we put it in the state we need?
3. Decomposability — can we test parts independently?
4. Simplicity — is it only as complex as needed?
5. Stability — does it change predictably?
6. Information — do we have what we need to test?
7. Communication — do we know what to test?
8. Relation to prior work — can we leverage past tests?
9. Time — do we have enough time to test?
10. Accountability — who owns quality?

## Phase 3: Conditional Agents (based on flags)

| Flag | Agent | Analysis |
|------|-------|----------|
| HAS_UI | qe-accessibility-auditor | WCAG 2.2 AA compliance assessment |
| HAS_SECURITY | qe-security-auditor | STRIDE threat modeling |
| HAS_UX | qe-qx-partner | User journey and experience quality analysis |

## Phase 4: GO/NO-GO Decision

| Metric | NO-GO | CONDITIONAL | GO |
|--------|-------|-------------|-----|
| Testability Score | < 40 | 40-79 | ≥ 80 |
| HTSM Coverage | < 6/10 | 6-7/10 | ≥ 8/10 |
| AC Completeness | < 50% | 50-89% | ≥ 90% |
| Critical Risks | > 2 | 1-2 | 0 |

**NO-GO**: Stop. Requirements need rework before development.
**CONDITIONAL**: Proceed with advisory warnings. Include findings in judge context.
**GO**: Full confidence. Proceed to implementation planning.

## Phase 5: Synthesis Report

Generate consolidated report with:
1. Executive summary (GO/CONDITIONAL/NO-GO verdict)
2. Quality criteria scores (10 HTSM categories)
3. Risk matrix (top 10 risks by score)
4. Testability assessment (10 principles)
5. Test ideas (categorized by type: unit/integration/E2E)
6. Recommendations (prioritized by risk × impact)

## Integration with Feature-ADR

This swarm runs as Step 3.5 in the feature-adr pipeline:
- **Input**: Refined ADR from Step 3 + Requirements from Step 1
- **Output**: Quality assessment report in `features/<slug>/03.5_ideation_report.md`
- **Gate**: NO-GO blocks progression to Step 6 (Implementation Plan)
- **CONDITIONAL**: Warnings are passed to Steps 6-8 as context

## Enforcement Rules

| Rule | Requirement |
|------|------------|
| E1 | ALL THREE core agents must be spawned. No exceptions. |
| E2 | All parallel agents in a SINGLE message. |
| E3 | STOP and WAIT after each batch. No proceeding early. |
| E4 | Conditional agents MUST be spawned if flags are TRUE. |
| E5 | GO/CONDITIONAL/NO-GO logic applied exactly as specified. |
| E6 | Full report structure generated. No abbreviated versions. |
