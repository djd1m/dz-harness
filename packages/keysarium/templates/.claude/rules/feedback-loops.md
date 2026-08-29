# Cross-Phase Feedback Loops

## Purpose

Formalize how data flows between phases in the Keysarium pipeline.
Each loop has a name, direction, data payload, and namespace for persistence.

## Named Feedback Loops

### Loop 1: CJM → Solve (Critical)

| Property | Value |
|----------|-------|
| Direction | Phase 2.5 → Phase 3 |
| Variable | `{CHOSEN_CJM}` |
| Payload | Selected CJM variant (A/B/C/D), pain points, conversion metrics |
| Consumers | Phase 3 (User Flow), Phase 5 (Slide 5) |
| Persistence | `researches/<slug>/.feedback/cjm-selection.json` |

**Contract:** Phase 3 MUST NOT start without `{CHOSEN_CJM}` being set.

### Loop 2: Research → Presentation

| Property | Value |
|----------|-------|
| Direction | Phase 2 → Phase 5 |
| Payload | Key findings, verified sources, statistics |
| Source file | `02_research_findings.md` |
| Consumers | Phase 5 (all slides referencing data) |
| Usage | Presentation claims must trace back to research findings |

**Contract:** Every data claim in presentation must have a source in `02_research_findings.md`.

### Loop 3: Discovery → All Phases (Context)

| Property | Value |
|----------|-------|
| Direction | Phase 0 → Phases 1-5 |
| Payload | Domain detection, JTBD segments, competitive landscape, business case |
| Source file | `00_product_discovery.md` |
| Key fields | `{DOMAIN}`, `{PRIMARY_USER}`, `{AHA_MOMENT}` |

**Contract:** Domain-specific rules activate based on Phase 0 detection.

### Loop 4: Solve → Architecture

| Property | Value |
|----------|-------|
| Direction | Phase 3 → Phase 4 |
| Payload | Chosen solution strategy, AI pipeline spec, HITL design, MVP scope |
| Source file | `03_solution_strategy.md` |
| Key fields | `{SOLUTION_CONCEPT}`, `{AI_PIPELINE}`, `{HITL_POLICY}` |

**Contract:** Architecture must implement the solution designed in Phase 3.

### Loop 5: BTO Judges → Optimizer

| Property | Value |
|----------|-------|
| Direction | BTO Layer 2 → BTO Optimize |
| Payload | Per-dimension scores, judge feedback, weak dimensions |
| Source | Layer 2 evaluation reports |
| Key fields | `{BASELINE_SCORE}`, `{WEAK_DIMENSIONS}`, `{JUDGE_FEEDBACK}` |

**Contract:** Optimizer mutations target weak dimensions identified by judges.

### Loop 6: History → Discovery (Cross-Case)

| Property | Value |
|----------|-------|
| Direction | Past cases → Phase 0 of new case |
| Payload | Domain patterns, common pitfalls, successful strategies |
| Source | `TOOLKIT_HARVEST.md`, brain export files |
| Persistence | `keysarium-brain.json` |

**Contract:** If brain file exists, Phase 0 loads historical patterns before starting.

## Feedback Loop Protocol

### At Phase Start
1. Check upstream promises are met
2. Load required source files
3. Extract key variables from upstream outputs
4. Apply domain-specific rules from Loop 3

### At Phase End
1. Emit phase promise tag
2. Write key outputs for downstream consumers
3. Validate contract fulfillment

## Variable Registry

All cross-phase variables in one place:

| Variable | Set In | Used In | Type |
|----------|--------|---------|------|
| `{DOMAIN}` | Phase 0 | All phases | string (banking/retail/enterprise/healthcare) |
| `{PRIMARY_USER}` | Phase 0 | Phase 2.5, 3, 5 | string |
| `{AHA_MOMENT}` | Phase 0 | Phase 2.5, 5 | string |
| `{CHOSEN_CJM}` | Phase 2.5 | Phase 3, 5 | string (A/B/C/D) |
| `{SOLUTION_CONCEPT}` | Phase 3 | Phase 4, 5 | string |
| `{AI_PIPELINE}` | Phase 3 | Phase 4 | structured |
| `{HITL_POLICY}` | Phase 3 | Phase 4, 5 | structured |
| `{BASELINE_SCORE}` | BTO L2 | BTO Optimize | float |
| `{WEAK_DIMENSIONS}` | BTO L2 | BTO Optimize | list[string] |

## Modular Reuse Note

This feedback loop system is domain-agnostic. The same pattern applies to any multi-phase pipeline:
1. Define named loops with direction and payload
2. Set contracts (what must exist before proceeding)
3. Register variables in a central registry
4. Validate contracts at phase boundaries
