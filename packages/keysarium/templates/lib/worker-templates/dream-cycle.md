# Worker Template: Dream Cycle

> This file is loaded by the background worker agent. It contains the complete
> instructions for executing a dream cycle using the DreamEngine protocol.

## Worker Identity

- **Type:** dream-cycle
- **Model:** sonnet
- **Purpose:** Build concept graph from reward records, detect cross-domain associations, generate actionable insights

## Instructions

You are a background worker agent. Your job is to analyze accumulated reward records
and generate higher-order insights using the DreamEngine protocol defined in
`lib/dream-engine.md`. You operate in ISOLATION -- you must not modify any files
outside your output directory and `.keysarium/insights/`.

### Input Parameters

These will be injected by the orchestrator:

- `WORKER_ID`: Your unique worker identifier
- `OUTPUT_DIR`: Your output directory path (`.keysarium/workers/{WORKER_ID}/`)
- `TRIGGER_REASON`: Why this dream was triggered (`time` | `volume` | `event` | `manual`)

### Execution Steps

#### Step 1: Initialize

Write your status file:

```json
// Write to {OUTPUT_DIR}/status.json
{
  "worker_id": "{WORKER_ID}",
  "type": "dream-cycle",
  "status": "running",
  "started_at": "{current ISO8601 timestamp}",
  "completed_at": null,
  "progress": {
    "phase": "initializing",
    "items_processed": 0
  },
  "error": null
}
```

#### Step 2: Load Data

Follow the DreamEngine Step 1 (Load Data) protocol from `lib/dream-engine.md`:

1. Check if `.keysarium/memory/` exists. If not, write status `completed` with `"phase": "no_data"` and exit.
2. Read `.keysarium/memory/_stats/reward-summary.json` (optional).
3. Read `.keysarium/memory/_patterns/domain-patterns.json` (optional).
4. Scan and parse all reward record JSON files under `.keysarium/memory/`.
5. Exclude expired records, sort by reward DESC, take top 200.
6. If fewer than 5 records: write status `completed` with `"phase": "insufficient_data"` and exit.

Update status: `"phase": "loading data", "items_processed": {record_count}`

**IMPORTANT:** Check for `{OUTPUT_DIR}/stop-requested` file. If it exists, write status as `stopped` and exit immediately.

#### Step 3: Build Concept Graph

Follow the DreamEngine Step 2 (Build Concept Graph) protocol:

1. Initialize empty graph.
2. For each record, create/update domain, phase, skill, and outcome nodes.
3. Create/update edges with reward weights.
4. Compute per-node aggregates (avg_reward, record_count, trend).
5. Compute per-edge aggregates (weight, record_count).

Update status: `"phase": "building concept graph", "items_processed": {node_count}`

**IMPORTANT:** Check for `stop-requested` file.

#### Step 4: Detect Associations

Follow the DreamEngine Step 3 (Detect Associations) protocol:

1. Cross-domain phase comparison (reward gap > 0.15).
2. Skill-domain mismatch detection (reward gap > 0.15).
3. Phase correlation analysis (co-occurring low rewards).
4. Temporal trend detection (systematic changes over time).

Update status: `"phase": "detecting associations", "items_processed": {association_count}`

**IMPORTANT:** Check for `stop-requested` file.

#### Step 5: Generate Insights

Follow the DreamEngine Step 4 (Generate Insights) protocol:

1. Convert each association to an Insight object.
2. Map association types to insight types.
3. Score confidence and impact.
4. Add actionable advice to descriptions.
5. Promote high-confidence domain patterns to insights.
6. Deduplicate against recent dreams (last 3 files in `.keysarium/insights/`).
7. Sort by rank_score DESC, take top 20.

Update status: `"phase": "generating insights", "items_processed": {insight_count}`

#### Step 6: Store Results

Follow the DreamEngine Step 5 (Store and Clean) protocol:

1. Ensure `.keysarium/insights/` directory exists.
2. Write dream result JSON to `.keysarium/insights/dream-{YYYYMMDD}-{HHmmss}.json`.
3. Apply retention: list dream files, keep newest 10, delete older.
4. Reset trigger state in `.keysarium/insights/trigger-state.json`.
5. Copy dream result to `{OUTPUT_DIR}/output/dream-{timestamp}.json`.

#### Step 7: Complete

Write final status:

```json
{
  "worker_id": "{WORKER_ID}",
  "type": "dream-cycle",
  "status": "completed",
  "started_at": "{start timestamp}",
  "completed_at": "{current timestamp}",
  "progress": {
    "phase": "completed",
    "records_analyzed": "{count}",
    "insights_generated": "{count}",
    "associations_found": "{count}"
  },
  "error": null
}
```

### Error Handling

If any step fails:

1. Write error details to `{OUTPUT_DIR}/error.log`
2. Update status.json with status `failed` and error message in the `error` field
3. Do NOT modify trigger-state.json on failure (preserve current trigger state)
4. Exit

### Isolation Rules

- You MUST only write files to `{OUTPUT_DIR}/` and `.keysarium/insights/`
- You MUST NOT modify any file in `researches/`, `features/`, `.claude/`, or project root
- You MUST NOT modify files in `.keysarium/memory/` (read-only access)
- You MUST NOT modify `TOOLKIT_HARVEST.md` or `CLAUDE.md`
- You MUST NOT spawn sub-agents
- You MAY read any file in the project for analysis purposes
- Exception: `.keysarium/insights/trigger-state.json` is writable (for reset on completion)
- Exception: `.keysarium/insights/dream-*.json` is writable (for new dream results and retention cleanup)
