# Memory Protocol -- Reward-Calibrated Learning

> **Scope:** Shared **Keysarium learning layer** (installed by `--with-learning`). Governs the
> Keysarium pipeline (Phases 0-5, `.keysarium/memory/`), NOT the feature-adr pipeline. Install
> only if you also run Keysarium; `@dzhechkov/keysarium` already ships this layer.

Core protocol for persistent memory in the Keysarium pipeline. Provides `memory_query()` before tasks and `memory_store()` after tasks.

**Protocol version: 1.1** — adds 2-tier index, record lifecycle (HOT/WARM/COLD/PURGE), and brain container manifest.

## Memory Namespace

All memory files live in `.keysarium/memory/`:

```
.keysarium/memory/
├── config.json                                    ← Global configuration
├── index.json                                     ← 2-tier index (v1.1)
├── _patterns/
│   └── domain-patterns.json                       ← Detected domain patterns
├── _stats/
│   ├── reward-summary.json                        ← Aggregate statistics
│   └── imported-baselines.json                    ← Imported reward baselines
├── {domain}/                                      ← banking | retail | enterprise | healthcare
│   ├── {case-slug}/
│   │   └── {phase}_{timestamp}.json               ← HOT/WARM reward records
│   └── _archive/                                  ← COLD compressed records (v1.1)
│       └── {case-slug}/
│           └── {phase}_{timestamp}.json            ← Archived records
```

## Configuration

### config.json (auto-created with defaults on first access)

```json
{
  "version": "1.1",
  "retention_days": 90,
  "max_results_per_query": 10,
  "enabled": true,
  "known_domains": ["banking", "retail", "enterprise", "healthcare"],
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

## Index File (v1.1)

The index provides a compact catalog of all records, enabling targeted reads instead of full directory scans.

### index.json Schema

```json
{
  "version": "1.0",
  "last_updated": "2026-03-02T14:00:00Z",
  "record_count": 47,
  "by_domain": {
    "banking": {
      "count": 23,
      "slugs": ["case-a", "case-b"],
      "avg_reward": 0.82
    }
  },
  "by_phase": {
    "phase-0": { "count": 8, "avg_reward": 0.91 },
    "phase-2": { "count": 12, "avg_reward": 0.65 }
  },
  "by_skill": {
    "goap-research-ed25519": { "count": 10, "avg_reward": 0.78 }
  },
  "records": {
    "bank_kc_automation_phase-2_2026-03-01T12-30-00": {
      "domain": "banking",
      "phase": "phase-2",
      "slug": "bank_kc_automation",
      "reward": 0.7,
      "skill": "goap-research-ed25519",
      "tier": "hot",
      "usage_count": 0,
      "file": "banking/bank_kc_automation/phase-2_2026-03-01T12-30-00.json",
      "expires_at": "2026-08-28T12:30:00Z"
    }
  }
}
```

### Index Behavior

- **Created:** On first `memory_store()` call when tier config is present (or `index.json` already exists)
- **Updated:** On every `memory_store()`, archive, and purge operation
- **Fallback:** If missing, `memory_query()` uses v1.0 full-scan algorithm
- **Rebuild:** If corrupted, delete `index.json` — it will be recreated on next `memory_store()`

## Protocol: memory_query(context)

Call at the **start** of each pipeline phase to load relevant historical patterns.

### Input

```json
{
  "phase": "phase-2",
  "domain": "banking",
  "slug": "bank_kc_automation",
  "skill": "goap-research-ed25519"
}
```

### Algorithm

1. **Check enabled:** Read `.keysarium/memory/config.json`. If `enabled` is false or directory does not exist, return empty list.
2. **Read index (v1.1):** If `.keysarium/memory/index.json` exists, read it and filter `records` entries by `domain` + `phase`. Go to step 2a. If index does not exist, fall back to step 3 (v1.0 full scan).
   - 2a. **Index hit:** If filtered record count ≤ `max_results_per_query`, read only those files by `file` path (targeted read). Go to step 4.
   - 2b. **Index overflow:** If filtered count > limit, rank by `reward` from index entries, select top-N `file` paths, read those files. Go to step 4.
3. **Full scan (fallback):** Construct `.keysarium/memory/{domain}/` (scan all slugs). Read all `{phase}_*.json` files matching the requested phase.
4. **Filter expired:** Exclude records where `expires_at < current_date`.
5. **Archive old records (v1.1):** If tier config is present, check record ages. For records older than `tier_warm_days`:
   - Read full record
   - Generate `summary` from `reward_reason` + `outcome.checkpoint_response` (first 200 chars)
   - Write compressed record to `.keysarium/memory/{domain}/_archive/{slug}/{filename}`
   - Delete original file from active directory
   - Update `index.json`: set `tier` to `"cold"`, update `file` path
   - Log: "Archived {count} records to cold storage in {domain}"
6. **Purge ancient records (v1.1):** Delete records from `_archive/` older than `tier_cold_days`. In v1.0 mode, delete records where `expires_at < current_date`. Update `index.json`. Log: "Purged {count} expired records from {domain}"
7. **Sort:** By `reward` DESC, then `usage_count` DESC, then `timestamp` DESC. HOT and WARM records first; COLD records included only if result count < `max_results_per_query`. Records with higher usage_count are more battle-tested and should be preferred when rewards are equal.
8. **Limit:** Return top `max_results_per_query` records (default 10).
9. **Enrich:** Also load `.keysarium/memory/_patterns/domain-patterns.json` for matching domain patterns.

### Output

```json
{
  "records": [
    {
      "case_slug": "bank_loan_approval",
      "phase": "phase-2",
      "reward": 1.0,
      "reward_label": "excellent",
      "skill_used": "goap-research-ed25519",
      "outcome_summary": "Research completed with all claims verified...",
      "timestamp": "2026-02-15T14:30:00Z"
    }
  ],
  "patterns": [
    {
      "pattern_id": "banking-phase2-slow",
      "description": "Banking cases take 2x longer in Phase 2 due to regulatory research",
      "confidence": 0.85,
      "actionable_advice": "Allocate extra time budget for Phase 2 in banking domain"
    }
  ],
  "count": 3,
  "domain": "banking"
}
```

### Usage in Phase

After calling `memory_query()`, the agent should:
1. Log: "Loaded {count} historical patterns for {phase} in {domain} domain"
2. If `records` is non-empty, review the top 3 records for relevant approaches
3. If `patterns` is non-empty, apply actionable advice to current phase execution
4. If both are empty (first run), proceed normally
5. **Increment usage_count:** For each record actually applied (top 3), increment `usage_count` in both the record file and the index entry. Records with higher usage_count are more proven — prioritize them in future queries.

## Protocol: memory_store(result, reward)

Call at each **checkpoint** after the user responds, to persist the phase outcome with a reward score.

### Input

```json
{
  "case_slug": "bank_kc_automation",
  "domain": "banking",
  "phase": "phase-2",
  "phase_name": "Research",
  "skill_used": "goap-research-ed25519",
  "reward": 0.7,
  "reward_label": "good",
  "reward_reason": "User requested minor edits to competitor analysis section",
  "context": {
    "phase_number": 2,
    "domain_detected": "banking",
    "upstream_promises": ["DISCOVERY_COMPLETE", "CASE_EXPLORED"],
    "patterns_loaded": 3,
    "time_budget_pct": 15.0,
    "agent_count": 3
  },
  "outcome": {
    "artifacts_created": ["02_research_findings.md"],
    "checkpoint_response": "ok, but expand the FinTech competitor section",
    "iterations": 2,
    "promise_emitted": "RESEARCH_PARANOID_PASSED"
  }
}
```

### Algorithm

1. **Ensure directory exists:** Create `.keysarium/memory/{domain}/{slug}/` if it does not exist.
2. **Build record:** Construct full RewardRecord JSON from input.
3. **Compute expires_at:** If tier config is present, use `tier_cold_days` (default 180 days). Otherwise, use `retention_days` (default 90 days). Formula: `current_date + threshold`.
4. **Generate filename:** `{phase}_{ISO-timestamp}.json` (e.g., `phase-2_2026-03-01T12-30-00.json`).
5. **Write file:** Write JSON to `.keysarium/memory/{domain}/{slug}/{filename}`.
6. **Update index (v1.1):** Read `.keysarium/memory/index.json` (or create if absent and tier config is present):
   - Add record entry to `records` map: key = record id, value = `{domain, phase, slug, reward, skill, tier: "hot", usage_count: 0, file, expires_at}`
   - Increment `record_count`
   - Update `by_domain` aggregate: increment count, add slug if new, recalculate `avg_reward`
   - Update `by_phase` aggregate: increment count, recalculate `avg_reward`
   - Update `by_skill` aggregate: increment count, recalculate `avg_reward`
   - Set `last_updated` to current timestamp
   - Write updated `index.json`
7. **Log:** "Stored reward {reward} ({reward_label}) for {phase} of {slug}"

### RewardRecord JSON Schema

```json
{
  "id": "bank_kc_automation_phase-2_2026-03-01T12-30-00",
  "version": "1.1",
  "timestamp": "2026-03-01T12:30:00Z",
  "case_slug": "bank_kc_automation",
  "domain": "banking",
  "phase": "phase-2",
  "phase_name": "Research",
  "skill_used": "goap-research-ed25519",
  "reward": 0.7,
  "reward_label": "good",
  "reward_reason": "User requested minor edits to competitor analysis section",
  "context": {
    "phase_number": 2,
    "domain_detected": "banking",
    "upstream_promises": ["DISCOVERY_COMPLETE", "CASE_EXPLORED"],
    "patterns_loaded": 3,
    "time_budget_pct": 15.0,
    "agent_count": 3
  },
  "outcome": {
    "artifacts_created": ["02_research_findings.md"],
    "checkpoint_response": "ok, but expand the FinTech competitor section",
    "iterations": 2,
    "promise_emitted": "RESEARCH_PARANOID_PASSED"
  },
  "promise_tag": "RESEARCH_PARANOID_PASSED",
  "usage_count": 0,
  "expires_at": "2026-08-28T12:30:00Z"
}
```

## Record Lifecycle (v1.1)

Records transition through tiers based on age:

| Tier | Age Range | Location | Fields |
|------|-----------|----------|--------|
| **HOT** | 0 – 30 days | `{domain}/{slug}/` | All fields |
| **WARM** | 30 – 90 days | `{domain}/{slug}/` | All fields (deprioritized in search) |
| **COLD** | 90 – 180 days | `{domain}/_archive/{slug}/` | Compressed (see below) |
| **PURGE** | > 180 days | Deleted | — |

Tier thresholds are configurable via `config.json` fields: `tier_hot_days`, `tier_warm_days`, `tier_cold_days`.

### COLD Record Schema (compressed)

```json
{
  "id": "bank_kc_automation_phase-2_2026-01-01T12-00-00",
  "phase": "phase-2",
  "domain": "banking",
  "slug": "bank_kc_automation",
  "reward": 0.7,
  "reward_label": "good",
  "skill_used": "goap-research-ed25519",
  "promise_tag": "RESEARCH_PARANOID_PASSED",
  "usage_count": 3,
  "summary": "User requested minor edits to competitor analysis section. ok, but expand the FinTech competitor section",
  "archived_at": "2026-03-02T14:00:00Z",
  "original_timestamp": "2026-01-01T12:00:00Z"
}
```

### Backward Compatibility

If `tier_hot_days` is NOT present in `config.json`, the lifecycle system is disabled. Records use the v1.0 flat `retention_days` for expiration. No archiving occurs.

## Reward Assignment Rules

The reward score is determined by the user's response at the checkpoint:

| User Behavior | Reward | Label | Detection |
|---------------|--------|-------|-----------|
| Says "ok" / "ок" / proceeds to next phase immediately | 1.0 | excellent | Exact match or single-word approval |
| Requests minor adjustments ("углуби X", small edits to one section) | 0.7 | good | Feedback is scoped to one area, does not change direction |
| Requests significant rework (multiple sections, changed approach, re-research) | 0.3 | needs_work | Feedback affects multiple areas or changes phase direction |
| Restarts phase entirely / says result is unusable / requests complete redo | 0.0 | failed | Phase restarts from scratch |

### Edge Cases

- **"углуби [section]"** = 0.7 (deepening is enhancement, not failure)
- **Multiple rounds of minor feedback** = 0.7 on first round, 0.3 if third+ round
- **Positive feedback with minor note** ("great, just fix the typo in section 3") = 1.0
- **No explicit response** (session ends) = do not store (no record created)

## Error Handling

| Error | Behavior |
|-------|----------|
| `.keysarium/memory/` does not exist | `memory_query()` returns empty; `memory_store()` creates directory |
| `config.json` missing | Use defaults (90 days, 10 results, enabled) |
| Malformed JSON file | Skip that record, log warning, continue |
| Write fails (permissions, disk) | Log error, continue pipeline without storing |
| Domain not in `known_domains` | Use "unknown" as domain directory |
| `index.json` corrupted | Delete and rebuild on next `memory_store()` call |
| Archive directory write fails | Log warning, keep record in active directory |

## Integration with Brain Export

When `/brain-export` runs, it should include a `"reward_data"` section:

```json
{
  "reward_data": {
    "total_records": 42,
    "domains": ["banking", "retail"],
    "phase_averages": {
      "phase-0": 0.85,
      "phase-1": 0.92,
      "phase-2": 0.65,
      "phase-2.5": 0.78,
      "phase-3": 0.71,
      "phase-4": 0.89,
      "phase-5": 0.74
    },
    "top_patterns": [],
    "exported_from": ".keysarium/memory/"
  }
}
```

Individual records are NOT exported (too voluminous). Only aggregates and patterns are included.
