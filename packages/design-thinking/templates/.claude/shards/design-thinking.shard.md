# Design Thinking — Governance Shard

## Skill
Load: `.claude/skills/design-thinking/SKILL.md`

## Prerequisites
- `explore` and `goap-research-ed25519` skills installed (bundled by this toolkit).
- Standalone command — not part of the casarium or feature-adr pipelines.

## Phases & artifacts

The skill's complexity tiers decide which phases run (S = 1→2→5, M = 1→2→3→4→5,
L/XL = all six). Artifact paths below are **toolkit governance** (the skill itself
prescribes report contents, not paths) — see `design-thinking-conventions.md`.

| Phase | Toolkit artifact |
|-------|------------------|
| Brief (`explore`, always first) | `design/<slug>/00_task_brief.md` |
| 1 — Empathize | `01_empathize_research.md` |
| 2 — Define (incl. POV + HMW questions) | `02_define_jtbd_cjm.md` |
| 3 — Ideate (HADI hypotheses from HMW) | `03_ideate_hadi.md` |
| 4 — Prototype | `04_prototype/` |
| 5 — Test (usability + HADI validation) | `05_test_usability.md` |
| 6 — Validate (pilot, L/XL tiers) | `06_validate_pilot.md` |

## Hard gates — the skill's own validation rules (scripts/validate-config.json)

| Rule | Severity | Tiers | Gate |
|------|----------|-------|------|
| DT-002 | error | all | JTBD school explicitly chosen (Switch **or** ODI, not both) |
| DT-003 | error | M/L/XL | CJM **TO BE** labeled as hypothesis |
| DT-005 | error | M/L/XL | Minimum 2 prototype iterations |
| DT-008 | error | all | Minimum 5 users for usability testing (qualitative) |
| DT-009 | error | M/L/XL | Minimum 2 test iterations |
| DT-010 | error | L/XL | VSM **TO BE** labeled as projection |
| DT-011 | error | L/XL | Pilot (Validate phase) must be conducted |

Warnings: 16 warning-severity rules spanning DT-001 … DT-023 — e.g. DT-001 (≥15
interviews for saturation), DT-004 (LTV/CAC >10 suspicious early), DT-006 (LTV
cohort-based), DT-007 (CAC fully-loaded), DT-012 (≥100 survey respondents for
quantitative validation), plus DT-013…DT-023 (SUS instrument, unit-economics
reproducibility, selection-bias, PII-compliance gates, …). The full 23-rule set with
severities lives in `scripts/validate-config.json` (source of truth). SKILL.md prose
additionally requires 30+ users before any statistical claim — 5 users is qualitative
discovery only.

## Toolkit conventions (additions, NOT DT-xxx rules)
- Empathize before Define — synthesis without research input is blocked.
- Every Ideate idea should trace to a Define insight (traceability discipline).

## Checkpoint protocol (canonical SKILL.md format)

Pause after each phase with the skill's banner — no custom tags:

```
=============================================
STEP N: [Phase Name] Complete
Tier: {COMPLEXITY_TIER}

[2-3 line summary of findings]
Artifacts: [list]

* "ok" -- next phase
* "углуби [area]" -- elaborate
* "[feedback]" -- adjust
=============================================
```

Do not advance phases past an unmet error-severity gate.

## Output contract
All artifacts under `design/<slug>/`. Never write to project root, `features/`, or
`researches/`.
