# Reward Tracker -- Analytics & Pattern Detection

Computes aggregate statistics and detects domain patterns from accumulated reward records. Used by `/learning-stats` and by `memory_query()` for pattern enrichment.

## Overview

The Reward Tracker operates on the data stored by the Memory Protocol (`lib/memory-protocol.md`). It reads all RewardRecord JSON files from `.keysarium/memory/` and produces two output artifacts:

1. **reward-summary.json** -- aggregate statistics per phase, domain, and skill
2. **domain-patterns.json** -- detected patterns with confidence scores

## Computation Protocol

### Step 1: Load All Records

1. Scan `.keysarium/memory/` recursively for all `*.json` files (excluding config.json, domain-patterns.json, reward-summary.json).
2. Parse each JSON file as a RewardRecord.
3. Exclude records where `expires_at < current_date`.
4. Collect into a list sorted by `timestamp` DESC.

### Step 2: Per-Phase Reward Averages

Group records by `phase` and compute:

```json
{
  "phase-0": {
    "avg_reward": 0.85,
    "total_runs": 12,
    "distribution": {
      "excellent": 8,
      "good": 3,
      "needs_work": 1,
      "failed": 0
    },
    "trend": "stable",
    "best_case": "retail_personalization",
    "worst_case": "bank_kc_automation"
  }
}
```

**Trend Detection Algorithm:**
1. Split records for each phase into two halves by timestamp (older half, newer half).
2. Compute average reward for each half.
3. If newer_avg - older_avg > 0.15 -> "improving"
4. If older_avg - newer_avg > 0.15 -> "degrading"
5. Otherwise -> "stable"
6. Minimum 4 records required for trend detection; otherwise "insufficient_data".

### Step 3: Per-Domain Reward Averages

Group records by `domain` and compute:

```json
{
  "banking": {
    "avg_reward": 0.72,
    "total_runs": 18,
    "phase_breakdown": {
      "phase-0": 0.85,
      "phase-1": 0.90,
      "phase-2": 0.55,
      "phase-2.5": 0.70,
      "phase-3": 0.65,
      "phase-4": 0.80,
      "phase-5": 0.72
    },
    "bottleneck_phase": "phase-2",
    "strongest_phase": "phase-1"
  }
}
```

**Bottleneck Detection:**
- Phase with the lowest average reward in a domain is flagged as `bottleneck_phase`.
- Phase with the highest average reward is flagged as `strongest_phase`.
- Only computed if domain has 3+ records.

### Step 4: Per-Skill Effectiveness

Group records by `skill_used` and cross-reference with domain:

```json
{
  "goap-research-ed25519": {
    "overall_avg": 0.74,
    "total_runs": 15,
    "total_usage_count": 42,
    "by_domain": {
      "banking": { "avg": 0.65, "runs": 8, "usage_count": 18 },
      "retail": { "avg": 0.85, "runs": 7, "usage_count": 24 }
    },
    "best_domain": "retail",
    "worst_domain": "banking",
    "most_reused_domain": "retail"
  }
}
```

### Step 5: Domain Pattern Detection

Analyze accumulated data to detect actionable patterns. Each pattern has a confidence score based on evidence count.

**Pattern Detection Rules:**

| Rule | Condition | Pattern Template |
|------|-----------|-----------------|
| Phase Bottleneck | Phase avg < 0.5 in domain, 3+ records | "{domain} cases struggle in {phase} (avg reward: {avg})" |
| Phase Excellence | Phase avg > 0.9 in domain, 3+ records | "{domain} cases excel in {phase} (avg reward: {avg})" |
| Skill-Domain Mismatch | Skill avg < 0.5 in domain but > 0.7 in another | "{skill} underperforms in {domain} vs {other_domain}" |
| Improving Trend | Trend = "improving" for phase in domain | "{phase} quality is improving in {domain} domain" |
| Degrading Trend | Trend = "degrading" for phase in domain | "{phase} quality is degrading in {domain} -- investigate" |
| Time Overhead | Phase avg iterations > 2.0 in domain | "{domain} cases require more iterations in {phase}" |
| High Reuse | Record usage_count >= 5 | "Pattern from {slug}/{phase} is highly reused ({count} times) — consider promoting to a rule" |

**Confidence Calculation:**
```
confidence = min(1.0, evidence_count / 10)
```
Where `evidence_count` is the number of records supporting the pattern. Confidence reaches 1.0 at 10+ supporting records.

### Step 6: Write Outputs

#### reward-summary.json

Write to `.keysarium/memory/_stats/reward-summary.json`:

```json
{
  "version": "1.0",
  "generated_at": "2026-03-01T14:00:00Z",
  "total_records": 42,
  "total_domains": 3,
  "total_cases": 8,
  "phase_averages": { ... },
  "domain_averages": { ... },
  "skill_effectiveness": { ... },
  "overall_average": 0.76,
  "overall_trend": "improving"
}
```

#### domain-patterns.json

Write to `.keysarium/memory/_patterns/domain-patterns.json`:

```json
{
  "version": "1.0",
  "generated_at": "2026-03-01T14:00:00Z",
  "patterns": [
    {
      "pattern_id": "banking-phase2-bottleneck",
      "domain": "banking",
      "description": "Banking cases struggle in Phase 2 (Research) with average reward 0.55",
      "category": "phase_bottleneck",
      "confidence": 0.80,
      "evidence_count": 8,
      "detected_at": "2026-03-01T14:00:00Z",
      "examples": ["bank_kc_automation", "bank_loan_approval"],
      "actionable_advice": "Allocate 20% extra time for Phase 2 in banking cases. Consider pre-loading regulatory templates."
    },
    {
      "pattern_id": "retail-triz-effective",
      "domain": "retail",
      "description": "TRIZ methodology produces better results than Game Theory for retail problem-solving",
      "category": "skill_effectiveness",
      "confidence": 0.60,
      "evidence_count": 6,
      "detected_at": "2026-03-01T14:00:00Z",
      "examples": ["ecom_personalization", "retail_inventory"],
      "actionable_advice": "Prefer TRIZ framework over Game Theory for retail domain cases in Phase 3."
    }
  ]
}
```

## Display Format for /learning-stats

### Phase Averages Table

```
Phase Reward Averages (42 records, 8 cases)
───────────────────────────────────────────
Phase       | Avg    | Runs | Trend       |
────────────|────────|──────|─────────────|
Phase 0     | 0.85   | 8    | stable      |
Phase 1     | 0.92   | 8    | improving   |
Phase 2     | 0.65   | 7    | stable      |
Phase 2.5   | 0.78   | 6    | improving   |
Phase 3     | 0.71   | 5    | stable      |
Phase 4     | 0.89   | 4    | stable      |
Phase 5     | 0.74   | 4    | stable      |
────────────|────────|──────|─────────────|
Overall     | 0.76   | 42   | improving   |
```

### Domain Breakdown Table

```
Domain Breakdown
───────────────────────────────────────
Domain      | Avg    | Cases | Bottleneck  |
────────────|────────|───────|─────────────|
Banking     | 0.72   | 3     | Phase 2     |
Retail      | 0.82   | 3     | Phase 5     |
Enterprise  | 0.69   | 2     | Phase 3     |
```

### Detected Patterns

```
Detected Patterns (confidence > 0.5)
──────────────────────────────────────────────────────
1. [0.80] Banking cases struggle in Phase 2 (Research)
   Advice: Allocate 20% extra time for Phase 2 in banking cases

2. [0.60] TRIZ outperforms Game Theory for retail problem-solving
   Advice: Prefer TRIZ framework for retail domain in Phase 3

3. [0.55] Phase 1 quality is improving across all domains
   Advice: Current exploration approach is working well
```

### Skill Effectiveness Table

```
Skill Effectiveness
────────────────────────────────────────────────────
Skill                          | Avg  | Best Domain |
───────────────────────────────|──────|─────────────|
explore                        | 0.92 | retail      |
goap-research-ed25519          | 0.74 | retail      |
problem-solver-enhanced        | 0.71 | enterprise  |
reverse-engineering-unicorn    | 0.85 | banking     |
presentation-storyteller       | 0.74 | retail      |
```

## Empty State

When no records exist yet:

```
Learning Stats
──────────────
No reward data found in .keysarium/memory/

To start collecting data:
1. Run a case with /casarium
2. Respond at each checkpoint
3. Rewards are automatically tracked

Memory directory: .keysarium/memory/ (will be created on first run)
```

## Modular Reuse

This tracker is domain-agnostic. It works with any RewardRecord JSON that conforms to the schema defined in `lib/memory-protocol.md`. The pattern detection rules can be extended by adding entries to the Pattern Detection Rules table.
