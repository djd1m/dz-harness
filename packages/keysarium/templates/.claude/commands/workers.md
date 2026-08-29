# /workers — Background Worker Management

Manage background workers for non-blocking operations in Keysarium.

## Usage

```
/workers start <type>    — Launch a background worker
/workers status          — Show active workers and progress
/workers stop <id>       — Stop a running worker
/workers list            — List available worker types
```

## Arguments

$ARGUMENTS — Subcommand and optional parameters (e.g., "start consolidate", "status", "stop wkr-xxx", "list")

## Protocol

### Step 1: Parse Command

Parse $ARGUMENTS to determine the subcommand:

- If starts with "start": extract worker type from remaining args
- If "status": no additional args needed
- If starts with "stop": extract worker ID from remaining args
- If "list": no additional args needed
- If empty or unrecognized: show usage help

### Step 2: Load Protocol

Read the worker protocol:
```
Read: lib/background-workers.md
Read: .claude/rules/background-workers.md
```

### Step 3: Execute Subcommand

#### For `/workers list`

Display available worker types from the protocol:

```
═══════════════════════════════════════════════════════
Available Worker Types
═══════════════════════════════════════════════════════

Type              Model    Description
consolidate       sonnet   Scan completed researches for patterns, update TOOLKIT_HARVEST.md
export-brain      haiku    Non-blocking brain export to .keysarium/exports/
health-check      haiku    Verify skill trust tiers, check for stale data
pattern-analysis  sonnet   Analyze reward data and trends across cases

Usage: /workers start <type>
═══════════════════════════════════════════════════════
```

#### For `/workers start <type>`

1. Validate `<type>` is one of: consolidate, export-brain, health-check, pattern-analysis
2. Ensure `.keysarium/workers/` directory exists (create if needed)
3. Read or create `.keysarium/workers/registry.json`
4. Count active workers (status = starting or running)
5. If count >= 3: reject with "Maximum concurrent workers (3) reached"
6. Generate worker ID: `wkr-{YYYYMMDD}-{HHmmss}-{type}`
7. Create worker directory: `.keysarium/workers/{worker_id}/output/`
8. Add entry to registry.json with status `starting`
9. Read worker template from `lib/worker-templates/{type}.md`
10. Spawn background agent:

```
Use the Agent tool with:
- prompt: [Worker template content with WORKER_ID and OUTPUT_DIR injected]
- model: [From routing table in protocol]
- run_in_background: true
```

11. Report to user:
```
Background worker started.
  ID:     {worker_id}
  Type:   {type}
  Model:  {model}
  Output: .keysarium/workers/{worker_id}/

Use `/workers status` to check progress.
```

#### For `/workers status`

1. Read `.keysarium/workers/registry.json`
2. If no registry or empty: "No workers have been started yet."
3. For each worker in registry:
   - Read `.keysarium/workers/{id}/status.json` if it exists
   - Update registry entry with latest status
   - If status.json missing and registry says "running": mark as "unknown"
4. Prune entries older than 24 hours that are completed/failed/stopped
5. Write updated registry
6. Display formatted table:

```
═══════════════════════════════════════════════════════
Background Workers Status
═══════════════════════════════════════════════════════

ID                                    Type          Status      Progress         Started
wkr-20260301-143022-consolidate       consolidate   running     scanning (3/7)   14:30
wkr-20260301-143500-health-check      health-check  completed   6/6 checks       14:35
wkr-20260301-144000-export-brain      export-brain  failed      —                14:40

Active: 1/3 | Completed: 1 | Failed: 1
═══════════════════════════════════════════════════════
```

If a worker is completed, also show output location:
```
Completed worker output:
  wkr-20260301-143500-health-check → .keysarium/workers/wkr-20260301-143500-health-check/output/
```

#### For `/workers stop <id>`

1. Read registry.json
2. Find worker entry by ID (or prefix match for convenience)
3. If not found: "Worker {id} not found in registry"
4. If status is not `running`: "Worker {id} is not running (status: {status})"
5. Write empty file: `.keysarium/workers/{id}/stop-requested`
6. Update registry entry status to `stop-requested`
7. Report:
```
Stop requested for worker {id}.
Worker will stop at next safe point.
Use `/workers status` to confirm.
```

### Step 4: Confirm

After executing the subcommand, confirm the action was completed.
Do NOT display a checkpoint -- `/workers` is a utility command, not a pipeline phase.
