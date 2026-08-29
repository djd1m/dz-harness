# Reward Learning Rules

## Purpose

Govern how the Keysarium pipeline integrates with the Reward-Calibrated Learning System. These rules define when and how to call `memory_query()` and `memory_store()`, how reward scores are assigned, and how historical patterns influence phase execution.

## Core Protocol

Read `lib/memory-protocol.md` for the full protocol specification.
Read `lib/reward-tracker.md` for analytics and pattern detection.

Under `init --minimal`, `lib/` is NOT installed; memory operations are non-blocking, so skip them
silently when these files are absent.

## When to Call memory_query()

**Trigger:** At the START of every pipeline phase (Phase 0 through Phase 5).

**Protocol:**
1. Before loading the phase's governance shard, check if `.keysarium/memory/` exists.
2. If it exists, call `memory_query()` with the current context:
   - `phase`: Current phase identifier (e.g., "phase-2")
   - `domain`: Detected domain from Phase 0 (or "unknown" if Phase 0 has not run yet)
   - `slug`: Current case slug
   - `skill`: Skill about to be loaded for this phase
3. Log the number of patterns loaded.
4. If relevant patterns are found, incorporate the top 3 into the phase brief:
   - Include high-reward approaches from similar past cases
   - Apply actionable advice from domain patterns
   - Note any bottleneck warnings for the current phase/domain combination
5. If no patterns are found (first run or no relevant data), proceed normally.

**Exception:** Phase 0 (Discovery) may not have a domain yet. Query with `domain: "unknown"` to load cross-domain patterns.

## When to Call memory_store()

**Trigger:** At every CHECKPOINT, after the user responds.

**Protocol:**
1. After displaying the checkpoint banner and receiving user response.
2. Classify the user response into a reward level (see Reward Assignment below).
3. Call `memory_store()` with:
   - The phase result (artifacts created, promise tag emitted)
   - The reward score and label
   - Context metadata (upstream promises, patterns loaded, agent count)
   - Outcome metadata (user response, iteration count)
4. Log the stored reward.
5. Continue with the checkpoint protocol as normal (proceed / adjust / redo).

**Exception:** If the session ends without a user response at the checkpoint, do NOT store a record. Only explicit user responses generate reward data.

## Reward Assignment

Map the user's checkpoint response to a reward score:

| User Response Pattern | Reward | Label | Examples |
|----------------------|--------|-------|----------|
| Immediate approval | 1.0 | excellent | "ok", "ок", "next", "продолжай", "good", single-word approval |
| Minor adjustments | 0.7 | good | "углуби X", "expand section Y", "add one more competitor", feedback on 1 area |
| Significant rework | 0.3 | needs_work | "rework the approach", "this misses the point of X and Y", feedback on 3+ areas |
| Complete restart | 0.0 | failed | "start over", "this is wrong", "redo this phase completely" |

### Classification Rules

1. **Count the areas of feedback:** 0 areas = 1.0, 1 area = 0.7, 2+ areas = 0.3, full restart = 0.0
2. **Positive feedback with minor note** counts as 1.0 (e.g., "great work, just fix the typo")
3. **Multiple rounds:** If user gives feedback more than twice on the same phase, cap reward at 0.3
4. **Ambiguous responses:** Default to 0.7 (assume minor adjustment)

## Integration with Promise Tags

Every `memory_store()` call includes the promise tag emitted at the checkpoint:

| Phase | Promise Tag in Record |
|-------|----------------------|
| Phase 0 | `DISCOVERY_COMPLETE` |
| Phase 1 | `CASE_EXPLORED` |
| Phase 2 | `RESEARCH_PARANOID_PASSED` |
| Phase 2.5 | `CJM_VALIDATED` |
| Phase 3 | `SOLUTION_DESIGNED` |
| Phase 4 | `ARCHITECTURE_DEFINED` |
| Phase 5 | `PRESENTATION_READY` |

If a promise is `_INCOMPLETE`, the reward should be 0.3 or lower.

## Integration with Feedback Loops

This system adds a new feedback loop to the Variable Registry (see `.claude/rules/feedback-loops.md`):

### Loop 7: Memory -> All Phases

| Property | Value |
|----------|-------|
| Direction | `.keysarium/memory/` -> Phase 0-5 start |
| Variable | `{MEMORY_PATTERNS}` |
| Payload | Top reward records + domain patterns from memory_query() |
| Consumers | All phases (loaded at phase start) |
| Persistence | `.keysarium/memory/{domain}/{slug}/` |

**Contract:** `memory_query()` is called before each phase starts. Empty result is acceptable (first run).

## Retention Policy

- **Default:** 90 days from record creation
- **Configuration:** Set in `.keysarium/memory/config.json` via `retention_days`
- **Enforcement:** Expired records are purged during `memory_query()` calls
- **Override:** Set `retention_days: 0` to disable expiration (keep forever)
- **Manual purge:** Delete `.keysarium/memory/` directory to reset all memory

## Error Handling

| Situation | Behavior |
|-----------|----------|
| `.keysarium/memory/` does not exist | `memory_query()` returns empty; `memory_store()` creates it |
| `config.json` missing | Use defaults (90 days, 10 max results, enabled) |
| Corrupted JSON file during query | Skip file, log warning, continue with other records |
| Write failure during store | Log error, continue pipeline (memory is non-blocking) |
| Unknown domain | Store under `unknown/` directory |

## Rules Summary

1. **ALWAYS** call `memory_query()` at the start of every phase
2. **ALWAYS** call `memory_store()` at every checkpoint after user responds
3. **NEVER** block the pipeline if memory operations fail
4. **NEVER** store a record without an explicit user response
5. **ALWAYS** log memory operations (patterns loaded, reward stored)
6. Memory operations are **advisory** -- they enhance quality but are not mandatory gates
