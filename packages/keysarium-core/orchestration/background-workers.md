# Background Workers Protocol

> Core protocol for managing non-blocking background workers in multi-agent pipelines.

## Overview

Background workers enable long-running operations (pattern consolidation, knowledge export, health checks) to execute without blocking the foreground session. Each worker is an isolated agent that reads instructions from a template and writes output to a dedicated directory.

## Worker Type Registry

Define worker types for your pipeline:

| Property | Description |
|----------|-------------|
| `type` | Unique identifier for the worker type |
| `description` | Human-readable description |
| `model` | Model tier (haiku, sonnet, opus) |
| `template` | Path to the worker instruction template |

Example registry:

| Type | Description | Model |
|------|-------------|-------|
| `consolidate` | Scan completed projects for patterns | sonnet |
| `export-brain` | Non-blocking knowledge export | haiku |
| `health-check` | Verify skill tiers, check stale data | haiku |
| `pattern-analysis` | Analyze reward data and trends | sonnet |

## Directory Structure

```
{workers-root}/
├── registry.json                          ← Central registry (orchestrator-managed)
├── wkr-{YYYYMMDD}-{HHmmss}-{type}/       ← Per-worker directory
│   ├── status.json                        ← Worker-managed status
│   ├── stop-requested                     ← Flag file (orchestrator writes to request stop)
│   ├── output/                            ← Worker output files
│   └── error.log                          ← Written on failure
└── ...
```

## Worker ID Format

```
wkr-{YYYYMMDD}-{HHmmss}-{type}
```

Example: `wkr-20260301-143022-consolidate`

## Registry Schema

The registry file is managed ONLY by the orchestrator. Workers NEVER modify it.

```json
{
  "version": "1.0",
  "max_concurrent": 3,
  "workers": [
    {
      "worker_id": "wkr-20260301-143022-consolidate",
      "type": "consolidate",
      "status": "running",
      "model": "sonnet",
      "started_at": "ISO-8601",
      "completed_at": null,
      "output_dir": "{workers-root}/wkr-20260301-143022-consolidate/",
      "retry_count": 0
    }
  ]
}
```

## Worker Status Schema

Each worker writes its own `status.json`:

```json
{
  "worker_id": "wkr-...",
  "type": "consolidate",
  "status": "running",
  "started_at": "ISO-8601",
  "completed_at": null,
  "progress": {
    "phase": "scanning projects",
    "items_processed": 3,
    "total_items": 7
  },
  "error": null
}
```

Status values: `starting`, `running`, `completing`, `completed`, `failed`, `stop-requested`, `stopped`

## Launch Protocol

1. **Validate:** Check type is valid, count active workers, enforce max_concurrent limit.
2. **Create directory:** `mkdir -p {workers-root}/wkr-{id}/output/`
3. **Update registry:** Add entry with status `starting`.
4. **Load template:** Read the worker template.
5. **Spawn agent:** Launch with background execution, injecting worker_id and output_dir.
6. **Confirm:** Report worker ID and output directory to user.

## Status Query Protocol

1. Read registry.json
2. For each worker, read its status.json
3. Update registry with latest status
4. Prune entries older than 24 hours (completed/failed/stopped)
5. Display formatted status table

## Stop Protocol

1. Verify worker exists and is running
2. Write empty file: `{worker-dir}/stop-requested`
3. Update registry status to `stop-requested`
4. Worker checks for this file between operations and exits gracefully

## Error Handling

- Maximum 2 retries per original request
- Each retry creates a NEW worker (new ID) with incremented retry_count
- If retry_count >= 2, mark as permanently failed

## Worker Isolation Rules

1. Workers MUST only write to their own directory
2. Workers MUST NOT modify project files directly
3. Workers MUST NOT modify pipeline configuration
4. Workers MUST NOT spawn sub-agents
5. Workers MAY read project files (read-only access)
6. Workers write deltas/reports that the user decides whether to apply

## Model Routing

| Worker Type | Recommended Model | Rationale |
|-------------|------------------|-----------|
| Pattern synthesis | sonnet | Analytical reasoning required |
| File operations | haiku | Primarily reading and formatting |
| Structural checks | haiku | Pattern matching only |
| Trend analysis | sonnet | Deeper reasoning needed |
