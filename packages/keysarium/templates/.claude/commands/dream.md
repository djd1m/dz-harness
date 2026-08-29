# /dream -- Dream Cycles Management

Manage Dream Cycles: trigger dream analysis, view insights, check trigger status.

Dream Cycles build on the reward-calibrated learning system (`lib/memory-protocol.md`,
`lib/reward-tracker.md`) and background workers (`lib/background-workers.md`).

## Usage

```
/dream run          — Manually trigger a dream cycle
/dream insights     — Show latest insights
/dream status       — Show trigger state
/dream clear        — Clear old insights (keep last 10)
```

The argument `$ARGUMENTS` determines which subcommand to execute.

## Protocol

### 1. Parse Subcommand

Parse `$ARGUMENTS` to determine subcommand:
- If starts with "run" -> execute RUN
- If starts with "insights" -> execute INSIGHTS
- If starts with "status" -> execute STATUS
- If starts with "clear" -> execute CLEAR
- If empty or unrecognized -> show usage help

### 2. Execute Subcommand

#### RUN: Manually Trigger Dream Cycle

1. Read the DreamEngine protocol: `lib/dream-engine.md`
2. Read the worker template: `lib/worker-templates/dream-cycle.md`
3. Read the background workers protocol: `lib/background-workers.md`
4. Generate a worker ID: `wkr-{YYYYMMDD}-{HHmmss}-dream-cycle`
5. Create worker directory: `.keysarium/workers/{worker_id}/output/`
6. Register in `.keysarium/workers/registry.json`
7. Launch background worker agent with:
   - Prompt: Contents of `lib/worker-templates/dream-cycle.md` with WORKER_ID, OUTPUT_DIR, TRIGGER_REASON="manual" injected
   - Model: sonnet
   - run_in_background: true
8. Report to user:

```
Dream cycle started.
  ID:     {worker_id}
  Trigger: manual
  Model:  sonnet
  Output: .keysarium/workers/{worker_id}/

Use /dream status to check progress.
Use /dream insights to view results after completion.
```

#### INSIGHTS: Show Latest Insights

1. Check if `.keysarium/insights/` exists. If not, display empty state.
2. List all `dream-*.json` files, sort by name DESC, take the first (most recent).
3. Read the most recent dream result file.
4. Display insights using the format from `lib/dream-engine.md` (Insight Display Format).
5. Only show insights with `confidence >= 0.3`.
6. If no dream files exist, display:

```
No dream insights available yet.

To generate insights:
1. Run several cases with /casarium (data is collected automatically)
2. Run /dream run to trigger analysis
3. Use /dream insights to view results

Dream insights are generated from accumulated reward data in .keysarium/memory/
```

#### STATUS: Show Trigger State

1. Read `.keysarium/insights/trigger-state.json`. If missing, display default state.
2. Calculate time elapsed since `last_dream_completed_at`.
3. Display using the format from `lib/dream-engine.md` (Status Display Format).
4. Evaluate triggers and show which are met.
5. If any trigger is met, suggest running `/dream run`.

#### CLEAR: Clear Old Insights

1. List all `dream-*.json` files in `.keysarium/insights/`.
2. Sort by name DESC.
3. Keep the 10 most recent files.
4. Delete older files.
5. Report count of deleted files.
6. If 10 or fewer files exist, report "Nothing to clear."

```
Dream insights cleanup:
  Total files: 15
  Kept: 10 (most recent)
  Deleted: 5

Trigger state preserved.
```
