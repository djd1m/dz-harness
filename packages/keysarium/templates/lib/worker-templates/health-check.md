# Worker Template: Health Check

> This file is loaded by the background worker agent. It contains the complete
> instructions for executing the health check task.

## Worker Identity

- **Type:** health-check
- **Model:** haiku
- **Purpose:** Verify system health: skill trust tiers, data freshness, structural integrity

## Instructions

You are a background worker agent. Your job is to perform health checks on the
Keysarium system and produce a structured health report. You operate in ISOLATION --
you must not modify any files outside your output directory.

### Input Parameters

These will be injected by the orchestrator:

- `WORKER_ID`: Your unique worker identifier
- `OUTPUT_DIR`: Your output directory path (`.keysarium/workers/{WORKER_ID}/`)

### Execution Steps

#### Step 1: Initialize

Write your status file:

```json
{
  "worker_id": "{WORKER_ID}",
  "type": "health-check",
  "status": "running",
  "started_at": "{current ISO8601 timestamp}",
  "completed_at": null,
  "progress": { "phase": "initializing", "items_processed": 0 },
  "error": null
}
```

#### Step 2: Check Skill Trust Tiers

For each skill directory in `.claude/skills/`:

1. Read `SKILL.md` -- check for `trust_tier` in frontmatter
2. Check if `references/` directory exists
3. Check if `modules/` directory exists
4. Check if `examples/` directory exists
5. Determine actual tier based on contents:
   - Tier 0 (Advisory): Only SKILL.md
   - Tier 1 (Structured): SKILL.md + references/ or modules/
   - Tier 2 (Validated): Tier 1 + BTO test score >= 7.0 in metadata
   - Tier 3 (Verified): Tier 2 + eval test suites
6. Compare claimed tier vs actual tier
7. Flag mismatches (claimed higher than actual)

Record results for each skill:
```json
{
  "name": "skill-trust-tiers",
  "status": "warn",
  "message": "frontend-design claims Tier 0 but could be promoted to Tier 1",
  "details": {
    "skills": [
      { "name": "explore", "claimed": 1, "actual": 1, "match": true },
      { "name": "frontend-design", "claimed": 0, "actual": 0, "match": true, "promotion_hint": "Add references/ to reach Tier 1" }
    ]
  }
}
```

Update status: `"phase": "checking skill tiers", "items_processed": 1`

**Check for `stop-requested` file.**

#### Step 3: Check Governance Integrity

1. Verify all governance shards exist in `.claude/shards/`:
   - `phase-0-discovery.shard.md`
   - `phase-1-explore.shard.md`
   - `phase-2-research.shard.md`
   - `phase-25-cjm.shard.md`
   - `phase-3-solve.shard.md`
   - `phase-4-architecture.shard.md`
   - `phase-5-presentation.shard.md`
   - `phase-ai-factory.shard.md`
   - `feature-adr.shard.md`
2. Verify all rule files exist in `.claude/rules/`
3. Verify all commands exist in `.claude/commands/`
4. Check for any orphaned files (files not referenced in CLAUDE.md)

Record results:
```json
{
  "name": "governance-integrity",
  "status": "pass",
  "message": "All 9 shards, 13 rules, and 20 commands present",
  "details": { "shards": 9, "rules": 13, "commands": 20, "orphaned": 0 }
}
```

Update status: `"phase": "checking governance", "items_processed": 2`

**Check for `stop-requested` file.**

#### Step 4: Check Research Data Freshness

1. List all research directories in `researches/`
2. For each: check last modification date of files
3. Flag researches with incomplete artifact sets (missing required files)
4. Check if TOOLKIT_HARVEST.md has been updated recently

Record results:
```json
{
  "name": "data-freshness",
  "status": "pass",
  "message": "3 completed researches, 0 stale, TOOLKIT_HARVEST.md current",
  "details": {
    "total_researches": 3,
    "completed": 3,
    "incomplete": 0,
    "harvest_stale": false
  }
}
```

Update status: `"phase": "checking data freshness", "items_processed": 3`

**Check for `stop-requested` file.**

#### Step 5: Check Witness Chain (if exists)

1. Check if `.keysarium/witness-chain/` exists
2. If yes, verify chain integrity (each hash links to previous)
3. Report any broken links

Record results:
```json
{
  "name": "witness-chain",
  "status": "pass",
  "message": "Witness chain intact (12 entries, no breaks)",
  "details": { "entries": 12, "broken_links": 0 }
}
```

If witness chain does not exist:
```json
{
  "name": "witness-chain",
  "status": "warn",
  "message": "Witness chain not initialized (optional feature)",
  "details": null
}
```

Update status: `"phase": "checking witness chain", "items_processed": 4`

#### Step 6: Check Worker System Health

1. Read `.keysarium/workers/registry.json` if it exists
2. Count stale entries (running but no status.json update in > 15 minutes)
3. Check for orphaned worker directories (no registry entry)
4. Report disk usage of `.keysarium/workers/` directory

Record results:
```json
{
  "name": "worker-system",
  "status": "pass",
  "message": "Worker registry clean, 0 stale entries",
  "details": { "total_entries": 5, "stale": 0, "orphaned": 0 }
}
```

Update status: `"phase": "checking worker system", "items_processed": 5`

#### Step 7: Check Brain/Memory State

1. Check if `keysarium-brain.json` or `.keysarium/exports/` exists
2. Verify brain file structure if present
3. Check for reward data (`.keysarium/rewards/` if exists)

Record results:
```json
{
  "name": "brain-state",
  "status": "pass",
  "message": "Brain export available, last exported 2026-02-28",
  "details": { "brain_exists": true, "last_export": "2026-02-28" }
}
```

Update status: `"phase": "checking brain state", "items_processed": 6`

#### Step 8: Generate Health Report

Write `{OUTPUT_DIR}/output/health-report.json`:

```json
{
  "generated_at": "{timestamp}",
  "worker_id": "{WORKER_ID}",
  "summary": {
    "total_checks": 6,
    "passed": 5,
    "warnings": 1,
    "failures": 0,
    "overall_status": "healthy"
  },
  "checks": [ /* all check results from steps 2-7 */ ],
  "recommendations": [
    "Run a BTO evaluation (separate package: npx @dzhechkov/skills-bto) on the explore skill to promote from Tier 1 to Tier 2",
    "Consider initializing witness chain for audit trail"
  ]
}
```

Overall status logic:
- `healthy`: 0 failures, 0-2 warnings
- `degraded`: 0 failures, 3+ warnings
- `unhealthy`: 1+ failures

#### Step 9: Complete

Write final status:

```json
{
  "worker_id": "{WORKER_ID}",
  "type": "health-check",
  "status": "completed",
  "started_at": "{start timestamp}",
  "completed_at": "{current timestamp}",
  "progress": { "phase": "completed", "items_processed": 6 },
  "error": null
}
```

### Error Handling

If any check step fails:
1. Record the failed check with status `fail` and error message
2. Continue to the next check (do not abort on individual check failure)
3. Only write `error.log` and set status `failed` if the entire worker crashes

### Isolation Rules

- You MUST only write files to `{OUTPUT_DIR}/`
- You MUST NOT modify any file in the project
- You MUST NOT spawn sub-agents
- You MAY read any file in the project for analysis purposes
