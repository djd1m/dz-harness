# Reward Tracker — Analytics and Pattern Detection

> Computes aggregate statistics and detects domain patterns from accumulated reward records.

## Overview

The Reward Tracker operates on data stored by the Memory Protocol. It reads all RewardRecord JSON files and produces two output artifacts:

1. **reward-summary.json** — aggregate statistics per stage, domain, and skill
2. **domain-patterns.json** — detected patterns with confidence scores

## Computation Protocol

### Step 1: Load All Records

1. Scan `{memory-root}/` recursively for all `*.json` files (excluding config.json, domain-patterns.json, reward-summary.json).
2. Parse each JSON file as a RewardRecord.
3. Exclude records where `expires_at < current_date`.
4. Collect into a list sorted by `timestamp` DESC.

### Step 2: Per-Stage Reward Averages

Group records by `stage` and compute:

```json
{
  "{stage-id}": {
    "avg_reward": 0.85,
    "total_runs": 12,
    "distribution": {
      "excellent": 8,
      "good": 3,
      "needs_work": 1,
      "failed": 0
    },
    "trend": "stable",
    "best_project": "{slug}",
    "worst_project": "{slug}"
  }
}
```

**Trend Detection Algorithm:**
1. Split records for each stage into two halves by timestamp (older half, newer half).
2. Compute average reward for each half.
3. If newer_avg - older_avg > 0.15 -> "improving"
4. If older_avg - newer_avg > 0.15 -> "degrading"
5. Otherwise -> "stable"
6. Minimum 4 records required for trend detection; otherwise "insufficient_data".

### Step 3: Per-Domain Reward Averages

Group records by `domain` and compute:

```json
{
  "{domain}": {
    "avg_reward": 0.72,
    "total_runs": 18,
    "stage_breakdown": {
      "{stage-0}": 0.85,
      "{stage-1}": 0.90,
      "{stage-2}": 0.55
    },
    "bottleneck_stage": "{stage-id}",
    "strongest_stage": "{stage-id}"
  }
}
```

**Bottleneck Detection:**
- Stage with the lowest average reward in a domain is flagged as `bottleneck_stage`.
- Stage with the highest average reward is flagged as `strongest_stage`.
- Only computed if domain has 3+ records.

### Step 4: Per-Skill Effectiveness

Group records by `skill_used` and cross-reference with domain:

```json
{
  "{skill-name}": {
    "overall_avg": 0.74,
    "total_runs": 15,
    "total_usage_count": 42,
    "by_domain": {
      "{domain-a}": { "avg": 0.65, "runs": 8, "usage_count": 18 },
      "{domain-b}": { "avg": 0.85, "runs": 7, "usage_count": 24 }
    },
    "best_domain": "{domain}",
    "worst_domain": "{domain}",
    "most_reused_domain": "{domain}"
  }
}
```

### Step 5: Domain Pattern Detection

Analyze accumulated data to detect actionable patterns.

**Pattern Detection Rules:**

| Rule | Condition | Pattern Template |
|------|-----------|-----------------|
| Stage Bottleneck | Stage avg < 0.5 in domain, 3+ records | "{domain} projects struggle in {stage} (avg reward: {avg})" |
| Stage Excellence | Stage avg > 0.9 in domain, 3+ records | "{domain} projects excel in {stage} (avg reward: {avg})" |
| Skill-Domain Mismatch | Skill avg < 0.5 in domain but > 0.7 in another | "{skill} underperforms in {domain} vs {other_domain}" |
| Improving Trend | Trend = "improving" for stage in domain | "{stage} quality is improving in {domain}" |
| Degrading Trend | Trend = "degrading" for stage in domain | "{stage} quality is degrading in {domain} -- investigate" |
| Time Overhead | Stage avg iterations > 2.0 in domain | "{domain} projects require more iterations in {stage}" |
| High Reuse | Record usage_count >= 5 | "Pattern from {slug}/{stage} is highly reused ({count} times) — consider promoting to a rule" |

**Confidence Calculation:**
```
confidence = min(1.0, evidence_count / 10)
```

### Step 6: Write Outputs

#### reward-summary.json

Write to `{memory-root}/_stats/reward-summary.json`:

```json
{
  "version": "1.0",
  "generated_at": "ISO-8601",
  "total_records": 42,
  "total_domains": 3,
  "total_projects": 8,
  "stage_averages": { ... },
  "domain_averages": { ... },
  "skill_effectiveness": { ... },
  "overall_average": 0.76,
  "overall_trend": "improving"
}
```

#### domain-patterns.json

Write to `{memory-root}/_patterns/domain-patterns.json`:

```json
{
  "version": "1.0",
  "generated_at": "ISO-8601",
  "patterns": [
    {
      "pattern_id": "{domain}-{stage}-{type}",
      "domain": "{domain}",
      "description": "{human-readable description}",
      "category": "{bottleneck|excellence|mismatch|trend|overhead}",
      "confidence": 0.80,
      "evidence_count": 8,
      "detected_at": "ISO-8601",
      "examples": ["{slug1}", "{slug2}"],
      "actionable_advice": "{what to do about it}"
    }
  ]
}
```

## Modular Reuse

This tracker is domain-agnostic. It works with any RewardRecord JSON that conforms to the schema defined in `memory-protocol.md`. The pattern detection rules can be extended by adding entries to the Pattern Detection Rules table.
