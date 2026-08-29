---
description: "Show reward learning statistics: phase averages, domain patterns, skill effectiveness"
argument: "optional filters: --domain <name> --phase <number>"
---

# Learning Stats -- Reward Analytics Dashboard

Display accumulated reward learning statistics from the Reward-Calibrated Learning System.

## Protocol

Read `lib/reward-tracker.md` for the full analytics specification.

### Step 1: Parse Arguments

Parse `$ARGUMENTS` for optional filters:
- `--domain <name>` -- Filter by domain (banking, retail, enterprise, healthcare)
- `--phase <number>` -- Filter by phase number (0-5)
- No arguments -- Show all data

### Step 2: Check Memory Directory

Check if `.keysarium/memory/` exists and contains reward records.

If **no data exists**, display:
```
═══════════════════════════════════════════════════════
Learning Stats
═══════════════════════════════════════════════════════

No reward data found in .keysarium/memory/

To start collecting data:
1. Run a case with /casarium
2. Respond at each checkpoint -- rewards are tracked automatically
3. Run /learning-stats again after completing a case

Memory directory: .keysarium/memory/ (created on first pipeline run)
═══════════════════════════════════════════════════════
```

### Step 3: Load and Compute Statistics

1. Scan `.keysarium/memory/` recursively for all reward record JSON files.
2. Exclude expired records (where `expires_at < current_date`).
3. Apply filters from Step 1 (if provided).
4. Compute statistics following the protocol in `lib/reward-tracker.md`:
   - Per-phase reward averages with trend detection
   - Per-domain breakdown with bottleneck identification
   - Per-skill effectiveness rankings
   - Domain pattern detection

### Step 4: Write Updated Stats

Write computed statistics to:
- `.keysarium/memory/_stats/reward-summary.json`
- `.keysarium/memory/_patterns/domain-patterns.json`

### Step 5: Display Results

Display formatted tables following the output format in `lib/reward-tracker.md`:

```
═══════════════════════════════════════════════════════
Learning Stats ({total_records} records, {total_cases} cases)
═══════════════════════════════════════════════════════

Phase Reward Averages
───────────────────────────────────────────
Phase       | Avg    | Runs | Trend       |
────────────|────────|──────|─────────────|
Phase 0     | {avg}  | {n}  | {trend}     |
Phase 1     | {avg}  | {n}  | {trend}     |
Phase 2     | {avg}  | {n}  | {trend}     |
Phase 2.5   | {avg}  | {n}  | {trend}     |
Phase 3     | {avg}  | {n}  | {trend}     |
Phase 4     | {avg}  | {n}  | {trend}     |
Phase 5     | {avg}  | {n}  | {trend}     |
────────────|────────|──────|─────────────|
Overall     | {avg}  | {n}  | {trend}     |

Domain Breakdown
───────────────────────────────────────────
Domain      | Avg    | Cases | Bottleneck  |
────────────|────────|───────|─────────────|
{domain}    | {avg}  | {n}   | {phase}     |

Skill Effectiveness
───────────────────────────────────────────
Skill                       | Avg  | Best Domain |
────────────────────────────|──────|─────────────|
{skill}                     | {avg}| {domain}    |

Detected Patterns (confidence > 0.5)
───────────────────────────────────────────
1. [{confidence}] {description}
   Advice: {actionable_advice}

═══════════════════════════════════════════════════════

• "/learning-stats --domain banking" — filter by domain
• "/learning-stats --phase 2" — filter by phase
• "ок" — done
═══════════════════════════════════════════════════════
```

### Step 6: Offer Actions

After displaying stats, offer:
- Filter by domain or phase (if not already filtered)
- "purge expired" -- Run retention policy cleanup
- "reset" -- Delete all memory data and start fresh (with confirmation)

## Filtered Views

### --domain Filter

When `--domain` is specified, show only:
- Phase averages for that domain
- Skill effectiveness in that domain
- Patterns for that domain
- Cases in that domain

### --phase Filter

When `--phase` is specified, show only:
- That phase's statistics across all domains
- Domain breakdown for that specific phase
- Skills used in that phase with their rewards
- Patterns related to that phase
