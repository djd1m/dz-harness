# DreamEngine Protocol -- Background Pattern Consolidation

> Core protocol for the Dream Cycles system. Implements trigger evaluation, concept graph construction,
> cross-domain association detection, and insight generation from accumulated reward records.
>
> Builds on: `lib/memory-protocol.md` (reward records), `lib/reward-tracker.md` (aggregates & patterns)
> Runs via: `lib/worker-templates/dream-cycle.md` (background worker)

## Overview

The DreamEngine analyzes accumulated reward data to produce higher-order insights that go beyond
what the reward tracker provides. While the tracker computes per-domain aggregates and detects
simple patterns, the DreamEngine builds a concept graph and discovers cross-domain associations,
temporal correlations, and phase interdependencies.

## Directory Structure

```
.keysarium/insights/
├── trigger-state.json              ← Trigger evaluation state (persistent)
├── dream-20260301-120000.json      ← Dream result (newest)
├── dream-20260228-180000.json      ← Dream result
├── ...                             ← Max 10 files retained
└── dream-20260215-090000.json      ← Dream result (oldest kept)
```

## Trigger Evaluation Protocol

### Trigger State File

Location: `.keysarium/insights/trigger-state.json`

```json
{
  "version": "1.0",
  "last_dream_completed_at": "2026-03-01T12:00:00Z",
  "last_dream_id": "dream-20260301-120000",
  "records_since_last_dream": 0,
  "pending_events": [],
  "config": {
    "time_threshold_minutes": 60,
    "volume_threshold": 20,
    "event_triggers_enabled": true
  }
}
```

### Default Trigger State (created if missing)

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

1. **Read state:** Read `.keysarium/insights/trigger-state.json`. If missing or malformed, create with defaults.
2. **Check time trigger:** If `last_dream_completed_at` is null OR `now - last_dream_completed_at > config.time_threshold_minutes`, set `time_triggered = true`.
3. **Check volume trigger:** If `records_since_last_dream >= config.volume_threshold`, set `volume_triggered = true`.
4. **Check event trigger:** If `config.event_triggers_enabled` AND `pending_events` is non-empty, set `event_triggered = true`.
5. **Result:** Return `{ should_dream: time_triggered OR volume_triggered OR event_triggered, reason: "time" | "volume" | "event" | "none" }`. If multiple triggers are true, use priority: event > volume > time.

### Trigger State Update Protocol

#### On reward record store (called by memory_store integration):

```
1. Read trigger-state.json (create with defaults if missing)
2. Increment records_since_last_dream by 1
3. Write trigger-state.json
```

#### On event (quality gate failure, case completion):

```
1. Read trigger-state.json (create with defaults if missing)
2. Append to pending_events:
   {
     "event_type": "quality_gate_failure" | "case_completion",
     "timestamp": "{current ISO8601}",
     "details": "{description of event}"
   }
3. Write trigger-state.json
```

#### On dream completion (called at end of dream cycle):

```
1. Read trigger-state.json
2. Set last_dream_completed_at = current timestamp
3. Set last_dream_id = current dream ID
4. Set records_since_last_dream = 0
5. Set pending_events = []
6. Write trigger-state.json
```

## Dream Execution Protocol

### Step 1: Load Data

**Input:** `.keysarium/memory/` directory tree

**Algorithm:**

1. Check if `.keysarium/memory/` exists. If not, exit with status `no_data`.
2. Read `.keysarium/memory/_stats/reward-summary.json` if it exists.
3. Read `.keysarium/memory/_patterns/domain-patterns.json` if it exists.
4. Scan all `*.json` files recursively under `.keysarium/memory/` (excluding `config.json`, `reward-summary.json`, `domain-patterns.json`).
5. Parse each as a RewardRecord (schema defined in `lib/memory-protocol.md`).
6. Exclude records where `expires_at < current_date`.
7. Sort by `reward` DESC, then `usage_count` DESC, then `timestamp` DESC. Records with higher usage_count carry more weight in concept graph construction.
8. Take top 200 records.
9. If fewer than 5 valid records, exit with status `insufficient_data`.

**Output:** `loaded_records` (list), `reward_summary` (object or null), `domain_patterns` (object or null)

### Step 2: Build Concept Graph

**Input:** `loaded_records` from Step 1

**Algorithm:**

1. Initialize empty graph: `{ nodes: [], edges: [] }`

2. For each record in `loaded_records`:
   a. Ensure domain node exists: `{ id: record.domain, type: "domain" }`
   b. Ensure phase node exists: `{ id: record.phase, type: "phase" }`
   c. Ensure skill node exists: `{ id: record.skill_used, type: "skill" }`
   d. Ensure outcome node exists: `{ id: "{domain}_{phase}_{skill}_outcome", type: "outcome" }`
   e. Create/update edges:
      - domain -> phase (weight = record.reward)
      - phase -> skill (weight = record.reward)
      - skill -> outcome (weight = record.reward)

3. For each node, compute aggregates:
   ```
   node.attributes = {
     avg_reward: mean(all record rewards touching this node),
     record_count: count(records touching this node),
     trend: compute_trend(records touching this node)
   }
   ```

4. Trend computation (same algorithm as `lib/reward-tracker.md`):
   - Split records for node into two halves by timestamp
   - If newer_avg - older_avg > 0.15 -> "improving"
   - If older_avg - newer_avg > 0.15 -> "degrading"
   - Otherwise -> "stable"
   - Minimum 4 records required; otherwise "insufficient_data"

5. For each edge, compute aggregates:
   ```
   edge.weight = mean(all record rewards traversing this edge)
   edge.record_count = count(records traversing this edge)
   ```

**Output:** `concept_graph` object

### Step 3: Detect Cross-Domain Associations

**Input:** `concept_graph` from Step 2

**Algorithm:**

Scan for four types of associations:

#### 3a. Cross-Domain Phase Comparison

For each phase node, compare its performance across different domains:

```
For each pair (domain_A, domain_B) where both have records for phase P:
  gap = abs(avg_reward_A - avg_reward_B)
  if gap > 0.15:
    Create association:
      type: "cross_domain"
      description: "Phase {P} performs differently in {domain_A} (avg {A}) vs {domain_B} (avg {B})"
      reward_gap: gap
      evidence_count: min(records_A, records_B)
```

#### 3b. Skill-Domain Mismatch

For each skill node, compare its performance across different domains:

```
For each pair (domain_A, domain_B) where both use skill S:
  gap = abs(avg_reward_A - avg_reward_B)
  if gap > 0.15:
    Create association:
      type: "skill_mismatch"
      description: "{skill} performs differently in {domain_A} vs {domain_B}"
      reward_gap: gap
      evidence_count: min(records_A, records_B)
```

#### 3c. Phase Correlation

Find phases where low rewards in one correlate with low rewards in another:

```
For each case_slug:
  Collect phase rewards for this case
  For each pair (phase_X, phase_Y):
    If both reward_X < 0.5 AND reward_Y < 0.5:
      Increment correlation counter for (phase_X, phase_Y)

For each (phase_X, phase_Y) pair with counter >= 3:
  Create association:
    type: "phase_correlation"
    description: "Low performance in {phase_X} correlates with low performance in {phase_Y}"
    evidence_count: counter
```

#### 3d. Temporal Trends

Check for systematic reward changes over time across all data:

```
Split all records into two halves by timestamp
If newer_avg - older_avg > 0.15:
  Create association: type: "temporal", description: "Overall system performance is improving"
If older_avg - newer_avg > 0.15:
  Create association: type: "temporal", description: "Overall system performance is degrading -- investigate"
```

**Output:** `associations` (list of association objects)

### Step 4: Generate Insights

**Input:** `associations` from Step 3, `domain_patterns` from Step 1

**Algorithm:**

1. For each association, generate an Insight:

```json
{
  "insight_id": "{dream_id}-{sequential_number:03d}",
  "type": "{map association type to insight type}",
  "description": "{association.description + actionable advice}",
  "confidence": "min(1.0, association.evidence_count / 10)",
  "impact": "{high if gap > 0.3, medium if 0.15-0.3, low if < 0.15}",
  "rank_score": "confidence * impact_weight",
  "evidence_count": "association.evidence_count",
  "domains": ["list of domains involved"],
  "phases": ["list of phases involved"],
  "skills": ["list of skills involved, if relevant"],
  "created_at": "{current ISO8601}",
  "dream_id": "{current dream cycle ID}"
}
```

2. Type mapping:
   - `cross_domain` -> `performance`
   - `skill_mismatch` -> `effectiveness`
   - `phase_correlation` -> `anti_pattern`
   - `temporal` -> `performance`

3. Impact weight:
   - `high` = 3
   - `medium` = 2
   - `low` = 1

4. Actionable advice generation (appended to description):
   - For `performance` (cross-domain): "Consider adjusting time budget for {phase} in {weaker_domain}"
   - For `effectiveness` (skill mismatch): "Consider using alternative skill/approach for {skill} in {weaker_domain}"
   - For `anti_pattern` (phase correlation): "Improving {earlier_phase} may improve {later_phase} outcomes"
   - For `performance` (temporal improving): "Current approach is working well"
   - For `performance` (temporal degrading): "Review recent changes to pipeline configuration"

5. Additionally, promote existing domain patterns from `domain-patterns.json` to insights if they have confidence >= 0.5 and are not already captured by associations. These inherit `type` from their `category` field.

6. Deduplicate: If an insight has the same `type` + normalized `description` as an insight from a recent dream (last 3 files in `.keysarium/insights/`), merge by summing evidence counts and recalculating confidence.

7. Sort by `rank_score` DESC.

8. Take top 20 insights.

**Output:** `insights` (list of Insight objects, max 20)

### Step 5: Store and Clean

**Input:** `insights` from Step 4, `dream_id`, `trigger_reason`

**Algorithm:**

1. **Ensure directory:** Create `.keysarium/insights/` if it does not exist.

2. **Write dream result file:**

```json
// .keysarium/insights/dream-{YYYYMMDD}-{HHmmss}.json
{
  "version": "1.0",
  "dream_id": "dream-{YYYYMMDD}-{HHmmss}",
  "status": "completed",
  "trigger_reason": "time | volume | event | manual",
  "started_at": "{ISO8601}",
  "completed_at": "{ISO8601}",
  "records_analyzed": 200,
  "concept_graph_nodes": 24,
  "concept_graph_edges": 36,
  "associations_found": 8,
  "insights": [
    {
      "insight_id": "dream-20260301-143022-001",
      "type": "performance",
      "description": "Phase 2 takes significantly longer for banking cases (avg reward 0.55) compared to retail (avg reward 0.82). Consider allocating extra time budget for Phase 2 in banking domain.",
      "confidence": 0.80,
      "impact": "high",
      "rank_score": 2.4,
      "evidence_count": 8,
      "domains": ["banking", "retail"],
      "phases": ["phase-2"],
      "skills": ["goap-research-ed25519"],
      "created_at": "2026-03-01T14:30:22Z",
      "dream_id": "dream-20260301-143022"
    }
  ],
  "metadata": {
    "domains_covered": ["banking", "retail", "enterprise"],
    "phases_covered": ["phase-0", "phase-1", "phase-2", "phase-2.5", "phase-3", "phase-5"],
    "total_reward_records_in_memory": 42
  }
}
```

3. **Apply retention policy:**
   - List all `dream-*.json` files in `.keysarium/insights/`
   - Sort by filename (timestamp) DESC
   - If count > 10, delete the oldest files until count = 10

4. **Reset trigger state:** Call the trigger state reset protocol (see above).

5. **Copy to worker output:** If running as a background worker, also write the dream result to `{WORKER_OUTPUT_DIR}/output/dream-{timestamp}.json`.

## Insight Display Format

### For `/dream insights`:

```
Dream Insights (from dream-20260301-143022)
Trigger: volume (23 new records)
Generated: 2026-03-01 14:30:22

Top Insights:
───────────────────────────────────────────────────────────────
1. [0.80 HIGH] Phase 2 takes significantly longer for banking cases
   (avg reward 0.55) compared to retail (avg reward 0.82).
   Advice: Allocate extra time budget for Phase 2 in banking domain.
   Domains: banking, retail | Phases: phase-2 | Evidence: 8 records

2. [0.60 MEDIUM] TRIZ methodology produces better results than
   Game Theory for retail problem-solving.
   Advice: Prefer TRIZ framework for retail domain in Phase 3.
   Domains: retail | Phases: phase-3 | Skills: problem-solver-enhanced | Evidence: 6

3. [0.55 HIGH] Low performance in Phase 2 correlates with low
   performance in Phase 5 across multiple cases.
   Advice: Improving Phase 2 (Research) may improve Phase 5 (Presentation).
   Phases: phase-2, phase-5 | Evidence: 4 records
───────────────────────────────────────────────────────────────
Showing 3 of 12 insights (confidence >= 0.3)
```

### For `/dream status`:

```
Dream Cycle Status
───────────────────────────────────────────────────
Last dream:         dream-20260301-143022 (2h 15m ago)
Records since:      7 / 20 (volume threshold)
Pending events:     0
Time threshold:     60 min (MET -- 135 min elapsed)
Volume threshold:   20 (not met -- 7/20)
Event trigger:      enabled (no pending events)

Status: TRIGGER MET (time)
Recommendation: Run /dream run or it will auto-trigger at next pipeline start
───────────────────────────────────────────────────
```

## Error Handling

| Error | Behavior |
|-------|----------|
| `.keysarium/memory/` does not exist | Exit with status `no_data`, zero insights |
| Fewer than 5 valid records | Exit with status `insufficient_data`, zero insights |
| `reward-summary.json` missing | Proceed without summary data (build graph from raw records only) |
| `domain-patterns.json` missing | Proceed without existing patterns (generate all from scratch) |
| Malformed reward record | Skip record, log warning, continue processing |
| `trigger-state.json` missing or malformed | Create with defaults |
| `.keysarium/insights/` does not exist | Create on first write |
| Write failure (permissions, disk) | Log error, set dream status to `failed` |
| Previous dream file read failure (for dedup) | Skip deduplication, generate fresh insights |

## Integration Points

### With memory_store() (lib/memory-protocol.md)

After each `memory_store()` call, the system should increment the trigger state counter:

```
Protocol addition to memory_store():
7. (After writing reward record) Read .keysarium/insights/trigger-state.json
8. Increment records_since_last_dream
9. Write updated trigger-state.json
```

This is an advisory integration -- if trigger-state.json does not exist, skip silently.

### With /casarium Phase 0

At the start of Phase 0 (Discovery), before beginning analysis:

```
1. Check if .keysarium/insights/ exists
2. If it contains dream-*.json files, read the most recent one
3. Filter insights by detected domain (if domain is already known)
4. Log: "Loaded {count} dream insights for {domain} domain"
5. Apply actionable advice to phase time budget adjustments
```

### With /brain-export

When brain export runs, include dream insights in the container:

```json
{
  "dream_insights": {
    "latest_dream_id": "dream-20260301-143022",
    "insight_count": 12,
    "top_insights": [/* top 5 insights by rank_score */],
    "exported_from": ".keysarium/insights/"
  }
}
```

### With Background Workers (lib/background-workers.md)

Dream cycle is registered as a worker type:

| Type | Description | Model | Template |
|------|-------------|-------|----------|
| `dream-cycle` | Run DreamEngine: build concept graph, generate insights | sonnet | `lib/worker-templates/dream-cycle.md` |

## Modular Reuse

The DreamEngine protocol is domain-agnostic. It operates on any data that conforms to the RewardRecord schema from `lib/memory-protocol.md`. The association detection rules and insight generation can be adapted for any multi-phase pipeline with reward tracking.
