# Worker Template: Brain Export

> This file is loaded by the background worker agent. It contains the complete
> instructions for executing a non-blocking brain export.

## Worker Identity

- **Type:** export-brain
- **Model:** haiku
- **Purpose:** Non-blocking version of /brain-export. Assembles a portable brain container.

## Instructions

You are a background worker agent. Your job is to export Keysarium's accumulated
knowledge into a portable JSON brain container. You operate in ISOLATION -- you must
not modify any files outside your output directory.

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
  "type": "export-brain",
  "status": "running",
  "started_at": "{current ISO8601 timestamp}",
  "completed_at": null,
  "progress": { "phase": "initializing", "items_processed": 0 },
  "error": null
}
```

#### Step 2: Collect Skill Metadata

For each skill in `.claude/skills/`:

1. Read `SKILL.md` -- extract name, description, trust_tier
2. Count files in references/, modules/, examples/
3. Build skill metadata entry

Update status: `"phase": "collecting skill metadata"`

**Check for `stop-requested` file.**

#### Step 3: Collect Domain Patterns

1. Read `TOOLKIT_HARVEST.md` if it exists -- extract all patterns
2. Read `.claude/rules/domain-specific.md` -- extract domain templates
3. Scan `researches/` directories for domain distribution

Update status: `"phase": "collecting domain patterns"`

**Check for `stop-requested` file.**

#### Step 4: Collect Research Summaries

For each completed research in `researches/`:

1. Read `08_executive_summary.md` (if exists) -- extract key summary
2. Read `README.md` (if exists) -- extract brief
3. Build research summary entry (NO full content, just metadata + summary)

Update status: `"phase": "collecting research summaries"`

**Check for `stop-requested` file.**

#### Step 5: Collect Harvest Patterns

1. Read `TOOLKIT_HARVEST.md` -- extract classified patterns
2. Categories: skills, commands, rules, templates, patterns, snippets

Update status: `"phase": "collecting harvest patterns"`

#### Step 6: Collect Pipeline Metrics

1. Count total researches (completed vs incomplete)
2. Count total features (completed vs in-progress)
3. List skill trust tiers
4. Summarize domain distribution

Update status: `"phase": "collecting pipeline metrics"`

#### Step 7: Assemble Brain Container

Write `{OUTPUT_DIR}/output/brain-export-{YYYYMMDD}.json`:

```json
{
  "version": "1.0",
  "format": "keysarium-brain",
  "exported_at": "{ISO8601 timestamp}",
  "source_project": "dz-harness-hub",
  "worker_id": "{WORKER_ID}",
  "skills": [
    {
      "name": "explore",
      "description": "Adaptive task clarification",
      "trust_tier": 1,
      "trust_label": "Structured",
      "has_references": true,
      "has_modules": false,
      "has_examples": false
    }
  ],
  "domain_patterns": [
    {
      "domain": "banking",
      "rules": ["on-premise LLM", "HITL mandatory", "FZ-152 compliance"],
      "palette": "Blue/Navy/Silver"
    }
  ],
  "research_summaries": [
    {
      "slug": "bank_kc_automation",
      "domain": "banking",
      "status": "completed",
      "summary": "AI-powered knowledge center automation for banking..."
    }
  ],
  "harvest_patterns": {
    "skills_count": 0,
    "commands_count": 0,
    "rules_count": 0,
    "patterns_count": 0,
    "patterns": []
  },
  "pipeline_metrics": {
    "total_researches": 5,
    "completed_researches": 3,
    "total_features": 2,
    "completed_features": 1,
    "skill_tiers": { "tier_0": 1, "tier_1": 6, "tier_2": 0, "tier_3": 0 },
    "domain_distribution": { "banking": 2, "retail": 1 }
  },
  "metadata": {
    "generator": "background-worker-export-brain",
    "keysarium_version": "2026-03-01"
  }
}
```

#### Step 8: Complete

Write final status:

```json
{
  "worker_id": "{WORKER_ID}",
  "type": "export-brain",
  "status": "completed",
  "started_at": "{start timestamp}",
  "completed_at": "{current timestamp}",
  "progress": { "phase": "completed", "items_processed": 5 },
  "error": null
}
```

Also copy the brain export file to `.keysarium/exports/` if that directory exists
(create it if needed). This provides a standard location for brain exports regardless
of which worker produced them.

### Error Handling

If any collection step fails:
1. Write partial brain container with available data
2. Add `"incomplete": true` and `"missing_sections"` to the metadata
3. Write error details to `{OUTPUT_DIR}/error.log`
4. Set status to `completed` (partial export is still useful)

Only set status to `failed` if the entire worker cannot write output at all.

### Isolation Rules

- You MUST only write files to `{OUTPUT_DIR}/` and `.keysarium/exports/`
- You MUST NOT modify any file in `researches/`, `features/`, `.claude/`, or project root
- You MUST NOT spawn sub-agents
- You MAY read any file in the project for data collection
