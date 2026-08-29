# Queen Coordinator Protocol — 10-Step Orchestration Lifecycle

> Standard protocol for the top-level coordinator (the "Queen") in a multi-agent pipeline.

## Overview

The Queen Coordinator is the master orchestrator that manages the lifecycle of a multi-agent pipeline execution. It follows a mandatory 10-step protocol that ensures proper initialization, execution, and finalization.

This protocol is inspired by the Agentic QE 10-phase mandatory coordinator protocol and Ruflo's hierarchical orchestration model.

## The 10 Steps

### Step 1: INIT

**Purpose:** Initialize the working environment.

**Actions:**
1. Create the project working directory (e.g., `projects/{slug}/`)
2. Verify directory structure matches expected layout
3. Initialize metadata files (if applicable)

**Failure mode:** If directory creation fails, abort with error.

### Step 2: HEALTH

**Purpose:** Verify all required resources are available.

**Actions:**
1. Check that all required skills exist and are readable
2. Verify governance shards are present for all active stages
3. Check that the constitution file is accessible
4. Verify external dependencies (commands, tools) are available

**Failure mode:** If any critical resource is missing, abort with diagnostic message.

### Step 3: LOAD

**Purpose:** Load historical knowledge from memory.

**Actions:**
1. Call `memory_query()` with the current domain and first stage
2. Load the most recent dream insights (if available)
3. Load the brain file (if it exists from a previous export)
4. Log: "Loaded {N} historical patterns" or "No historical data available (first run)"

**Failure mode:** Graceful degradation — if no memory exists, proceed without it.

### Step 4: DETECT

**Purpose:** Classify the project's domain and characteristics.

**Actions:**
1. Analyze the input to detect the relevant domain
2. Identify key characteristics (e.g., regulatory requirements, latency needs)
3. Set cross-pipeline variables: `{DOMAIN}`, `{PRIMARY_USER}`, etc.

**Failure mode:** If domain cannot be detected, use "general" as default.

### Step 5: SHARD

**Purpose:** Load the governance shard for the current stage.

**Actions:**
1. Determine the current stage
2. Read the corresponding governance shard
3. Validate prerequisites (upstream promises)
4. Apply domain-specific rules based on the detected domain

**Failure mode:** If shard is missing, fall back to the master configuration.

### Step 6: ORCHESTRATE

**Purpose:** Execute the pipeline stages with appropriate topologies.

**Actions:**
1. For each active stage:
   a. Select topology (from `topology-selection.md`)
   b. Assign model tier (from `model-routing.md`)
   c. Spawn agents per the topology
   d. Execute the stage
   e. Collect results from all agents
   f. Synthesize results (if parallel agents)

**Failure mode:** If a stage fails, halt at checkpoint and report to human.

### Step 7: MONITOR

**Purpose:** Track execution and enforce checkpoints.

**Actions:**
1. After each stage, display the checkpoint
2. Wait for human confirmation
3. Record the reward based on the human's response
4. Check time budget vs. actual elapsed time
5. Warn if budget is exceeded

**Failure mode:** If checkpoint is skipped, halt — INV-003 violated.

### Step 8: COLLECT

**Purpose:** Gather all artifacts produced by the pipeline.

**Actions:**
1. Enumerate all files created in the project directory
2. Verify each artifact against its quality gates
3. Compile a manifest of all outputs

**Failure mode:** If mandatory artifacts are missing, report and halt.

### Step 9: STORE

**Purpose:** Persist knowledge for future use.

**Actions:**
1. Call `memory_store()` for the final stage outcome
2. Update the trigger state for the dream engine
3. If this was a significant execution, trigger knowledge extraction

**Failure mode:** Graceful — if storage fails, log and continue (pipeline output is not lost).

### Step 10: REPORT

**Purpose:** Produce the final output and summary.

**Actions:**
1. Generate a summary of all stages and their outcomes
2. List all artifacts created
3. Report time spent vs. budget per stage
4. Report any warnings or issues encountered
5. Emit the final pipeline promise tag

**Failure mode:** N/A — reporting always succeeds.

## Lifecycle Diagram

```
INIT → HEALTH → LOAD → DETECT → SHARD
                                   ↓
                              ORCHESTRATE
                                   ↓
                               MONITOR ←→ (repeat per stage)
                                   ↓
                              COLLECT → STORE → REPORT
```

## Customization

To adapt this protocol for your pipeline:

1. Steps 1-3 (INIT, HEALTH, LOAD) are universal — keep as-is
2. Step 4 (DETECT) — customize detection logic for your domain categories
3. Step 5 (SHARD) — point to your shard directory
4. Step 6 (ORCHESTRATE) — define your stages and their topologies
5. Steps 7-10 (MONITOR, COLLECT, STORE, REPORT) — universal, keep as-is
