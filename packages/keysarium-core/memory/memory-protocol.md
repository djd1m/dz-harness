# Memory Protocol — Reward-Calibrated Learning

> Core protocol for persistent memory in multi-agent pipelines. Provides `memory_query()` before stages and `memory_store()` after stages.
>
> **Protocol version: 1.1** — adds Index, Brain Container Schema, COW Branching, and Record Lifecycle.

## Overview

The Memory Protocol enables a pipeline to learn from past executions. Each stage outcome is stored with a reward score (0.0-1.0), and future executions query historical patterns to improve performance.

## Memory Namespace

All memory files live in a dedicated directory:

```
{memory-root}/
├── config.json                                    ← Global configuration
├── index.json                                     ← 2-tier index (v1.1)
├── _patterns/
│   └── domain-patterns.json                       ← Detected domain patterns
├── _stats/
│   └── reward-summary.json                        ← Aggregate statistics
├── {domain}/                                      ← Domain-specific subdirectory
│   ├── {project-slug}/
│   │   └── {stage}_{timestamp}.json               ← HOT/WARM reward records
│   └── _archive/                                  ← COLD compressed records (v1.1)
│       └── {project-slug}/
│           └── {stage}_{timestamp}.json            ← Archived records
```

The `{memory-root}` defaults to `.keysarium/memory/` but can be configured.

## Configuration

### config.json (auto-created with defaults on first access)

```json
{
  "version": "1.1",
  "retention_days": 90,
  "max_results_per_query": 10,
  "enabled": true,
  "known_domains": [],
  "reward_levels": {
    "excellent": 1.0,
    "good": 0.7,
    "needs_work": 0.3,
    "failed": 0.0
  },
  "tier_hot_days": 30,
  "tier_warm_days": 90,
  "tier_cold_days": 180
}
```

**Tier fields (v1.1):** If `tier_hot_days` is absent, fall back to v1.0 behavior (flat `retention_days` with no tiering). When present, `retention_days` is ignored in favor of the tier thresholds.

## Protocol: memory_query(context)

Call at the **start** of each pipeline stage to load relevant historical patterns.

### Input

```json
{
  "stage": "{stage-id}",
  "domain": "{domain-name}",
  "slug": "{project-slug}",
  "skill": "{skill-name}"
}
```

### Algorithm

1. **Check enabled:** Read `{memory-root}/config.json`. If `enabled` is false or directory does not exist, return empty result.
2. **Read index (v1.1):** If `{memory-root}/index.json` exists, read it and filter `records` entries by `domain` + `stage`. Go to step 2a. If index does not exist, fall back to step 3 (v1.0 full scan).
   - 2a. **Index hit:** If filtered record count ≤ `max_results_per_query`, read only those files by `file` path (Tier 2 targeted read). Go to step 4.
   - 2b. **Index overflow:** If filtered count > limit, rank by `reward` from index entries, select top-N `file` paths, read those files. Go to step 4.
3. **Full scan (fallback):** Construct `{memory-root}/{domain}/` (scan all project slugs). Read all `{stage}_*.json` files matching the requested stage.
4. **Filter expired:** Exclude records where `expires_at < current_date`.
5. **Archive old records (v1.1):** If tier config is present, check record ages. Move records older than `tier_cold_days` to `{memory-root}/{domain}/_archive/{slug}/` in compressed format (see Record Lifecycle). Update `index.json`.
6. **Purge ancient records (v1.1):** Delete records from `_archive/` older than `tier_cold_days * 2` (default 360 days). Update `index.json`. In v1.0 mode, delete records where `expires_at < current_date`.
7. **Sort:** By `reward` DESC, then `usage_count` DESC, then `timestamp` DESC. Records with higher usage_count are more battle-tested and should be preferred when rewards are equal.
8. **Limit:** Return top `max_results_per_query` records (default 10). HOT and WARM records are preferred; COLD records are included only if result count < limit.
9. **Enrich:** Also load `{memory-root}/_patterns/domain-patterns.json` for matching domain patterns.

### Output

```json
{
  "records": [
    {
      "project_slug": "{slug}",
      "stage": "{stage-id}",
      "reward": 1.0,
      "reward_label": "excellent",
      "skill_used": "{skill-name}",
      "outcome_summary": "{description of what happened}",
      "timestamp": "2026-02-15T14:30:00Z"
    }
  ],
  "patterns": [
    {
      "pattern_id": "{domain}-{stage}-{type}",
      "description": "{human-readable pattern description}",
      "confidence": 0.85,
      "actionable_advice": "{what to do about it}"
    }
  ],
  "count": 3,
  "domain": "{domain-name}"
}
```

### Usage After Query

1. Log: "Loaded {count} historical patterns for {stage} in {domain} domain"
2. If `records` is non-empty, review the top 3 records for relevant approaches
3. If `patterns` is non-empty, apply actionable advice to current stage execution
4. If both are empty (first run), proceed normally
5. **Increment usage_count:** For each record actually applied (top 3), increment `usage_count` in both the record file and the index entry. Records with higher usage_count are more proven — prioritize them in future queries.

## Protocol: memory_store(result, reward)

Call at each **checkpoint** after the human responds, to persist the stage outcome.

### Input

```json
{
  "project_slug": "{slug}",
  "domain": "{domain}",
  "stage": "{stage-id}",
  "stage_name": "{stage human-readable name}",
  "skill_used": "{skill-name}",
  "reward": 0.7,
  "reward_label": "good",
  "reward_reason": "{why this reward was assigned}",
  "context": {
    "stage_number": 2,
    "domain_detected": "{domain}",
    "upstream_promises": ["{PROMISE_1}", "{PROMISE_2}"],
    "patterns_loaded": 3,
    "time_budget_pct": 15.0,
    "agent_count": 3
  },
  "outcome": {
    "artifacts_created": ["{file1.md}", "{file2.md}"],
    "checkpoint_response": "{what the human said}",
    "iterations": 2,
    "promise_emitted": "{PROMISE_TAG}"
  }
}
```

### Algorithm

1. **Ensure directory exists:** Create `{memory-root}/{domain}/{slug}/` if it does not exist.
2. **Build record:** Construct full RewardRecord JSON from input.
3. **Compute expires_at:** `current_date + retention_days` (from config, default 90 days). If tier config is present, use `tier_cold_days * 2` instead.
4. **Generate filename:** `{stage}_{ISO-timestamp}.json`.
5. **Write file:** Write JSON to `{memory-root}/{domain}/{slug}/{filename}`.
6. **Update index (v1.1):** If `{memory-root}/index.json` exists (or tier config is present), update it:
   - Add record entry to `records` map with key = record id, value = `{domain, stage, slug, reward, skill, tier: "hot", usage_count: 0, file, expires_at}`
   - Increment `record_count`
   - Update `by_domain`, `by_phase`, `by_skill` aggregates (count, avg_reward)
   - Set `last_updated` to current timestamp
   - If `index.json` does not exist, create it with this record as the first entry
7. **Log:** "Stored reward {reward} ({reward_label}) for {stage} of {slug}"

### RewardRecord JSON Schema

```json
{
  "id": "{slug}_{stage}_{timestamp}",
  "version": "1.1",
  "timestamp": "ISO-8601",
  "project_slug": "{slug}",
  "domain": "{domain}",
  "stage": "{stage-id}",
  "stage_name": "{human name}",
  "skill_used": "{skill}",
  "reward": 0.7,
  "reward_label": "good",
  "reward_reason": "{reason}",
  "context": { ... },
  "outcome": { ... },
  "promise_tag": "{PROMISE_TAG}",
  "usage_count": 0,
  "expires_at": "ISO-8601"
}
```

## Reward Assignment Rules

| Human Behavior | Reward | Label | Detection |
|---------------|--------|-------|-----------|
| Approves immediately ("ok", "proceed") | 1.0 | excellent | Single-word approval |
| Requests minor adjustments (one section) | 0.7 | good | Feedback scoped to one area |
| Requests significant rework (multiple sections, changed approach) | 0.3 | needs_work | Feedback affects multiple areas |
| Restarts stage entirely / result unusable | 0.0 | failed | Stage restarts from scratch |

## Purge Protocol

To prevent unbounded growth:

1. **Trigger:** At each `memory_query()` call, check for expired records
2. **Scan:** Within the queried domain directory, find records where `expires_at < current_date`
3. **Delete:** Remove expired JSON files
4. **Log:** "Purged {count} expired records from {domain}"

## Error Handling

| Error | Behavior |
|-------|----------|
| Memory root does not exist | `memory_query()` returns empty; `memory_store()` creates directory |
| `config.json` missing | Use defaults (90 days, 10 results, enabled) |
| Malformed JSON file | Skip that record, log warning, continue |
| Write fails (permissions, disk) | Log error, continue pipeline without storing |
| Domain not in `known_domains` | Use "unknown" as domain directory |
| `index.json` corrupted | Delete and rebuild on next `memory_store()` call |
| Archive directory write fails | Log warning, keep record in active directory |

---

## Index Protocol (v1.1)

The index file provides a compact catalog of all records, enabling targeted file reads instead of full directory scans.

### index.json Schema

```json
{
  "version": "1.0",
  "last_updated": "ISO-8601",
  "record_count": 47,
  "by_domain": {
    "{domain}": {
      "count": 23,
      "slugs": ["{slug-1}", "{slug-2}"],
      "avg_reward": 0.82
    }
  },
  "by_stage": {
    "{stage-id}": {
      "count": 12,
      "avg_reward": 0.65
    }
  },
  "by_skill": {
    "{skill-name}": {
      "count": 10,
      "avg_reward": 0.78
    }
  },
  "records": {
    "{record-id}": {
      "domain": "{domain}",
      "stage": "{stage-id}",
      "slug": "{slug}",
      "reward": 0.7,
      "skill": "{skill-name}",
      "tier": "hot|warm|cold",
      "usage_count": 0,
      "file": "{domain}/{slug}/{stage}_{timestamp}.json",
      "expires_at": "ISO-8601"
    }
  }
}
```

### Index Update Rules

1. **On `memory_store()`:** Add new record entry, update aggregates.
2. **On archive (WARM→COLD):** Update `tier` to `"cold"`, change `file` path to `_archive/` location.
3. **On purge:** Remove record entry, decrement aggregates.
4. **Rebuild:** If `index.json` is missing or corrupted, `memory_store()` creates a fresh index with the new record. Full rebuild requires scanning all files (expensive, avoid if possible).

### Fallback Behavior

If `index.json` does not exist, `memory_query()` falls back to the v1.0 full-scan algorithm. This ensures backward compatibility with existing memory directories that predate v1.1.

---

## Brain Container Schema (v1.1)

Defines the portable brain export format with an integrity manifest.

### Container Structure

```json
{
  "version": "1.1",
  "format": "keysarium-brain",
  "manifest": {
    "created_at": "ISO-8601",
    "source_project": "{project-name}",
    "source_branch": "{git-branch}",
    "checksum": "sha256:{64-hex-chars}",
    "record_count": 47,
    "domains": ["{domain-1}", "{domain-2}"],
    "skills": ["{skill-1}", "{skill-2}"],
    "research_count": 5,
    "harvest_pattern_count": 23,
    "size_bytes": 148200,
    "parent": null,
    "parent_checksum": null,
    "delta_type": null
  },
  "skills": { },
  "domain_patterns": { },
  "research_summaries": [ ],
  "harvest_patterns": [ ],
  "pipeline_metrics": { },
  "reward_data": { },
  "metadata": { }
}
```

### Manifest Fields

| Field | Type | Description |
|-------|------|-------------|
| `created_at` | string | ISO-8601 timestamp of export |
| `source_project` | string | Project name from package.json or directory name |
| `source_branch` | string | Current git branch at export time |
| `checksum` | string | SHA-256 of the JSON-serialized content (all sections except `manifest`) |
| `record_count` | integer | Total records across all sections |
| `domains` | string[] | List of domains present in export |
| `skills` | string[] | List of skill names present |
| `research_count` | integer | Number of research summaries |
| `harvest_pattern_count` | integer | Number of harvest patterns |
| `size_bytes` | integer | Approximate size of the content payload |
| `parent` | string\|null | Filename of parent brain container (COW mode) |
| `parent_checksum` | string\|null | SHA-256 of parent container (COW mode) |
| `delta_type` | string\|null | `"rfc6902"` if this is a delta container |

### Checksum Computation

1. Serialize all sections except `manifest` as a JSON string (sorted keys, no extra whitespace)
2. Compute SHA-256 of the resulting string
3. Store as `"sha256:{64-hex-chars}"`

### Version Negotiation

| Reader Version | File Version | Behavior |
|---------------|-------------|----------|
| v1.1 | v1.0 | Accept. Manifest will be absent — proceed without integrity check |
| v1.1 | v1.1 | Accept. Read manifest, verify checksum |
| v1.0 | v1.1 | Accept. Ignore unknown `manifest` field, read sections normally |
| Any | Unknown | Warn, attempt best-effort import |

---

## COW Branching Protocol (v1.1)

Copy-On-Write branching for efficient delta brain exports. A child container stores only the differences from a parent container.

### Delta Container Structure

```json
{
  "version": "1.1",
  "format": "keysarium-brain",
  "manifest": {
    "created_at": "ISO-8601",
    "source_project": "{project-name}",
    "source_branch": "{git-branch}",
    "checksum": "sha256:{hash-of-patch-array}",
    "record_count": 3,
    "domains": ["{domains-in-delta}"],
    "skills": [],
    "research_count": 1,
    "harvest_pattern_count": 2,
    "size_bytes": 4200,
    "parent": "{parent-filename}",
    "parent_checksum": "sha256:{parent-hash}",
    "delta_type": "rfc6902"
  },
  "patch": [
    { "op": "add", "path": "/research_summaries/-", "value": { } },
    { "op": "replace", "path": "/skills/{name}/trust_tier", "value": 2 },
    { "op": "add", "path": "/harvest_patterns/-", "value": { } }
  ]
}
```

### Export Protocol (delta mode)

1. Load parent brain container from the specified path
2. Verify parent checksum matches `manifest.checksum` of the parent file
3. Build current full brain container (in memory, not written to disk)
4. Compute JSON Patch (RFC 6902) between parent and current
5. If patch is empty → log "No changes since parent" and skip export
6. Write delta container with `manifest.parent` set to parent filename

### Import Protocol (delta mode)

1. Read delta container; detect `manifest.parent != null`
2. Resolve parent file:
   - Look in the same directory as the delta file
   - Look in project root
   - If not found → prompt user for path
   - If still not found → offer partial import (self-contained `add` operations only)
3. If parent is also a delta → resolve recursively (chain). Warn if chain depth > 3
4. Load parent (or resolved chain base), apply JSON Patch operations in order
5. Verify result checksum if available
6. Proceed with standard import (selective sections, merge strategy)

### JSON Patch Operations (RFC 6902)

| Operation | Usage |
|-----------|-------|
| `add` | New records (research summaries, harvest patterns, skills) |
| `replace` | Updated values (trust tier upgrade, new BTO score) |
| `remove` | Deleted entries (rare, mainly cleanup) |
| `move` | Renamed entries (rare) |
| `copy` | Duplicated entries (rare) |
| `test` | Pre-condition assertions (optional, for safety) |

### Chain Depth Limit

Delta containers may reference another delta as parent, forming a chain. Import MUST warn if chain depth exceeds 3. Recommended: periodically re-export a full container to reset the chain.

---

## Record Lifecycle (v1.1)

Records transition through tiers based on age, trading detail for storage efficiency.

### Tier Definitions

| Tier | Age Range | Location | Fields | Purpose |
|------|-----------|----------|--------|---------|
| **HOT** | 0 – `tier_hot_days` (default 30) | `{domain}/{slug}/` | All fields | Active learning, full context |
| **WARM** | `tier_hot_days` – `tier_warm_days` (default 90) | `{domain}/{slug}/` | All fields | Available but deprioritized in search |
| **COLD** | `tier_warm_days` – `tier_cold_days` (default 180) | `{domain}/_archive/{slug}/` | Compressed | Long-term pattern retention |
| **PURGE** | > `tier_cold_days` | Deleted | — | Cleanup |

### COLD Record Schema (compressed)

```json
{
  "id": "{original-id}",
  "stage": "{stage-id}",
  "domain": "{domain}",
  "slug": "{slug}",
  "reward": 0.7,
  "reward_label": "good",
  "skill_used": "{skill}",
  "promise_tag": "{PROMISE_TAG}",
  "usage_count": 0,
  "summary": "{first 200 chars of reward_reason + checkpoint_response}",
  "archived_at": "ISO-8601",
  "original_timestamp": "ISO-8601"
}
```

### Archive Procedure

Triggered during `memory_query()` step 5:

1. For each record in the query result set, compute age = `current_date - timestamp`
2. If age > `tier_warm_days` and record is not already archived:
   a. Read full record
   b. Generate `summary` from `reward_reason` + `outcome.checkpoint_response` (truncate to 200 chars)
   c. Write compressed record to `{memory-root}/{domain}/_archive/{slug}/{filename}`
   d. Delete original file from active directory
   e. Update `index.json`: set `tier` to `"cold"`, update `file` path

### Purge Procedure

Triggered during `memory_query()` step 6:

1. Scan `{domain}/_archive/` for records where age > `tier_cold_days`
2. Delete those files
3. Remove entries from `index.json`

### Backward Compatibility

If `tier_hot_days` is NOT present in `config.json`, the entire lifecycle system is disabled. Records use the v1.0 flat `retention_days` for expiration. No archiving occurs. This ensures existing memory directories work without changes.
