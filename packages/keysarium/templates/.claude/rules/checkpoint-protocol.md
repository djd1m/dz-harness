# Checkpoint Protocol

## After Every Phase
Display a checkpoint banner and WAIT for user confirmation before proceeding.

## Checkpoint Format
```
═══════════════════════════════════════════════════════
⏸️ CHECKPOINT N: [Phase Name] Complete
<promise>[PROMISE_TAG]</promise>

[2-3 line summary of what was done]
Files created: [list] ✅

• "ок" — next phase
• "углуби [section]" — elaborate
• "[specific feedback]" — adjust
═══════════════════════════════════════════════════════
```

## Semantic Completion Promises

Each checkpoint MUST include the relevant promise tag to signal phase completion status.
Promises are machine-readable markers that formalize phase gates.

### Promise Tags by Phase

| Phase | Promise Tag | Meaning |
|-------|------------|---------|
| Phase 0 | `<promise>DISCOVERY_COMPLETE</promise>` | JTBD + competitors + ROI analyzed |
| Phase 1 | `<promise>CASE_EXPLORED</promise>` | Case fully understood, brief created |
| Phase 2 | `<promise>RESEARCH_PARANOID_PASSED</promise>` | All claims verified, zero unverified |
| Phase 2.5 | `<promise>CJM_VALIDATED</promise>` | CJM prototype created and variant chosen |
| Phase 3 | `<promise>SOLUTION_DESIGNED</promise>` | Solution strategy formulated |
| Phase 4 | `<promise>ARCHITECTURE_DEFINED</promise>` | C4 diagrams + sequence flows ready |
| Phase 5 | `<promise>PRESENTATION_READY</promise>` | All 4 artifacts (05-08) created |
| BTO L0 | `<promise>BTO_LAYER0_PASSED</promise>` | Deterministic checks passed |
| BTO L2 | `<promise>BTO_LAYER2_SCORED</promise>` | Panel of 3 judges scored artifact |
| BTO Opt | `<promise>BTO_OPTIMIZED</promise>` | Optimization converged |

### Enhanced Checkpoint Format

```
═══════════════════════════════════════════════════════
⏸️ CHECKPOINT N: [Phase Name] Complete
<promise>[PROMISE_TAG]</promise>

[2-3 line summary of what was done]
Files created: [list] ✅

• "ок" — next phase
• "углуби [section]" — elaborate
• "[specific feedback]" — adjust
═══════════════════════════════════════════════════════
```

### Promise Validation Rules

- A promise tag MUST only be emitted AFTER its conditions are verifiably met
- If conditions are NOT met, emit `<promise>[TAG]_INCOMPLETE</promise>` instead
- Downstream phases SHOULD check for upstream promises before starting
- Promise tags serve as formal phase gates — they replace informal "phase done" signals

## Rules
- NEVER skip checkpoints
- NEVER auto-advance to the next phase without user confirmation
- If user says "ок" — proceed to next phase
- If user gives feedback — adjust current phase, then re-checkpoint
- Track time spent vs. allocated budget per phase
