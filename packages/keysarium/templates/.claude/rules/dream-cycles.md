# Dream Cycles Integration Rules

## Auto-Trigger Rules

When starting a new pipeline run (`/casarium` or `/feature-adr`), the orchestrator SHOULD check dream triggers:

1. Read `.keysarium/insights/trigger-state.json`
2. Evaluate triggers using the protocol in `lib/dream-engine.md`
   (under `init --minimal`, `lib/` is NOT installed — dream cycles are non-blocking, so skip)
3. If any trigger is met, suggest to the user:
   ```
   Dream cycle trigger met ({reason}). Consider running /dream run for fresh insights.
   ```
4. This is ADVISORY only -- do not auto-launch without user confirmation
5. If user declines, proceed normally

### Trigger Check Timing

- Check triggers at pipeline START (before Phase 0 or Step 0)
- Do NOT check triggers mid-pipeline (would interrupt flow)
- Do NOT check triggers on simple commands (/harvest, /brain-export, /learning-stats)

## Insight Application Rules

### At /casarium Phase 0 (Discovery)

1. After domain detection, check `.keysarium/insights/` for the most recent dream result
2. Filter insights by detected domain
3. For each relevant insight, apply:
   - **Performance insights**: Adjust time budget recommendations for flagged phases
   - **Effectiveness insights**: Note skill preferences in the case brief
   - **Preference insights**: Flag preferred CJM variants for Phase 2.5
   - **Anti-pattern insights**: Add explicit warnings to the case brief
4. Log loaded insights: "Applied {count} dream insights for {domain} domain"

### At /casarium Phase 2 (Research)

If a performance insight flags Phase 2 as problematic for the current domain:
- Log a warning: "Dream insight: Phase 2 is historically challenging for {domain}. Extra attention recommended."
- This is informational only -- does not change the research protocol

### At /feature-adr Step 0 (Complexity Router)

Dream insights are NOT applied to feature-adr (different pipeline, different context).

## Retention Rules

1. Maximum 10 dream result files in `.keysarium/insights/`
2. Retention is enforced at the END of each dream cycle (Step 5)
3. Retention is also enforced by `/dream clear`
4. `trigger-state.json` is NEVER deleted by retention (it is state, not a result)
5. Dream result files are named `dream-{YYYYMMDD}-{HHmmss}.json` for chronological sorting

## Integration with memory_store()

After writing a reward record via `memory_store()`, the system SHOULD:
1. Attempt to read `.keysarium/insights/trigger-state.json`
2. If it exists, increment `records_since_last_dream` and write back
3. If it does not exist, skip silently (dream cycles not yet initialized)
4. If write fails, log warning and continue (non-critical)

This integration is ADVISORY -- memory_store() must succeed even if trigger state update fails.

## Integration with Event Triggers

### Quality Gate Failure

When a BTO quality gate fails (Layer 0 rejection after 3 retries):
1. Append event to `trigger-state.json`:
   ```json
   { "event_type": "quality_gate_failure", "timestamp": "...", "details": "BTO Layer 0 failed 3x" }
   ```
2. Suggest running `/dream run` to analyze the failure pattern

### Case Completion

When a `/casarium` run completes (Phase 6 packaging done):
1. Append event to `trigger-state.json`:
   ```json
   { "event_type": "case_completion", "timestamp": "...", "details": "Completed {slug}" }
   ```
2. If `records_since_last_dream >= 10` (half of volume threshold), suggest a dream run

## Model Routing

| Operation | Model | Rationale |
|-----------|-------|-----------|
| Dream cycle execution | sonnet | Analytical pattern detection |
| Trigger evaluation | N/A | Deterministic JSON operations |
| Insight display | N/A | File reading and formatting |
| Status display | N/A | File reading and formatting |
