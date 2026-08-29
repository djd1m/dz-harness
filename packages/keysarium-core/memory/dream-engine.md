# DreamEngine Protocol — Background Pattern Consolidation

> Background process that builds concept graphs from accumulated reward data and generates cross-domain insights.

## Overview

The DreamEngine analyzes accumulated reward data to produce higher-order insights. While the Reward Tracker computes per-domain aggregates and detects simple patterns, the DreamEngine builds a concept graph and discovers cross-domain associations, temporal correlations, and stage interdependencies.

**Builds on:** memory-protocol.md (reward records), reward-tracker.md (aggregates and patterns)

## Directory Structure

```
{insights-root}/
├── trigger-state.json              ← Trigger evaluation state (persistent)
├── dream-{YYYYMMDD}-{HHmmss}.json ← Dream result (newest)
├── ...                             ← Max 10 files retained
└── dream-{oldest}.json             ← Dream result (oldest kept)
```

The `{insights-root}` defaults to `.keysarium/insights/` but can be configured.

## Trigger Evaluation Protocol

### Trigger State File

```json
{
  "version": "1.0",
  "last_dream_completed_at": null,
  "last_dream_id": null,
  "records_since_last_dream": 0,
  "pending_events": [],
  "config": {
    "time_threshold_minutes": 60,
    "volume_threshold": 20,
    "event_triggers_enabled": true
  }
}
```

### Trigger Evaluation Algorithm

1. **Read state:** Read trigger-state.json. If missing, create with defaults.
2. **Check time trigger:** If `last_dream_completed_at` is null OR elapsed time > threshold, set `time_triggered = true`.
3. **Check volume trigger:** If `records_since_last_dream >= volume_threshold`, set `volume_triggered = true`.
4. **Check event trigger:** If events are enabled AND `pending_events` is non-empty, set `event_triggered = true`.
5. **Result:** Return `{ should_dream: any_trigger, reason: "time" | "volume" | "event" | "none" }`.

## Dream Execution Protocol

### Step 1: Load Data

1. Check if memory root exists. If not, exit with status `no_data`.
2. Read reward-summary.json and domain-patterns.json if they exist.
3. Scan all reward record files recursively.
4. Exclude expired records.
5. Sort by reward DESC, then usage_count DESC, then timestamp DESC. Records with higher usage_count carry more weight in concept graph construction.
6. Take top 200 records.
7. If fewer than 5 valid records, exit with status `insufficient_data`.

### Step 2: Build Concept Graph

1. Initialize empty graph: `{ nodes: [], edges: [] }`
2. For each record, create/update nodes: domain, stage, skill, outcome.
3. Create/update edges: domain->stage, stage->skill, skill->outcome (weighted by reward).
4. Compute per-node aggregates: avg_reward, record_count, trend.
5. Compute per-edge aggregates: weight (mean reward), record_count.

### Step 3: Detect Cross-Domain Associations

Four types of associations:

**3a. Cross-Domain Stage Comparison:** For each stage, compare performance across domains. If gap > 0.15, create association.

**3b. Skill-Domain Mismatch:** For each skill, compare performance across domains. If gap > 0.15, create association.

**3c. Stage Correlation:** Find stages where low rewards in one correlate with low rewards in another (co-occurrence >= 3).

**3d. Temporal Trends:** Check for systematic reward changes over time across all data.

### Step 4: Generate Insights

For each association, generate an Insight:

```json
{
  "insight_id": "{dream_id}-{sequential:03d}",
  "type": "performance | effectiveness | anti_pattern",
  "description": "{description + actionable advice}",
  "confidence": "min(1.0, evidence_count / 10)",
  "impact": "high | medium | low",
  "rank_score": "confidence * impact_weight",
  "evidence_count": 8,
  "domains": ["list of domains involved"],
  "stages": ["list of stages involved"],
  "skills": ["list of skills involved"],
  "created_at": "ISO-8601",
  "dream_id": "{dream_id}"
}
```

Sort by rank_score DESC. Take top 20 insights.

### Step 5: Store and Clean

1. Write dream result file to `{insights-root}/dream-{timestamp}.json`.
2. Apply retention policy: keep max 10 dream files, delete oldest.
3. Reset trigger state.

## Dream Result Schema

```json
{
  "version": "1.0",
  "dream_id": "dream-{YYYYMMDD}-{HHmmss}",
  "status": "completed",
  "trigger_reason": "time | volume | event | manual",
  "started_at": "ISO-8601",
  "completed_at": "ISO-8601",
  "records_analyzed": 200,
  "concept_graph_nodes": 24,
  "concept_graph_edges": 36,
  "associations_found": 8,
  "insights": [ ... ],
  "metadata": {
    "domains_covered": [],
    "stages_covered": [],
    "total_reward_records_in_memory": 42
  }
}
```

## Error Handling

| Error | Behavior |
|-------|----------|
| Memory root does not exist | Exit with status `no_data`, zero insights |
| Fewer than 5 valid records | Exit with status `insufficient_data` |
| reward-summary.json missing | Proceed from raw records only |
| domain-patterns.json missing | Generate all patterns from scratch |
| Malformed reward record | Skip record, log warning, continue |
| trigger-state.json missing | Create with defaults |
| Write failure | Log error, set dream status to `failed` |

## Modular Reuse

The DreamEngine protocol is domain-agnostic. It operates on any data conforming to the RewardRecord schema. The association detection rules and insight generation can be adapted for any multi-stage pipeline with reward tracking.
