# Checkpoint Protocol — Human Synchronization Points

> Universal protocol for checkpoints and semantic completion promises in multi-agent pipelines.

## Overview

A checkpoint is a mandatory pause point where the pipeline stops and waits for human confirmation before proceeding. Checkpoints serve three purposes:

1. **Quality gate** — Human reviews the stage output before the next stage begins
2. **Feedback loop** — Human provides corrections or approvals that calibrate the system
3. **Completion signal** — A machine-readable promise tag records that the stage is done

## Checkpoint Format

```
=====================================================
CHECKPOINT {N}: {Stage Name} Complete
<promise>{PROMISE_TAG}</promise>

{2-3 line summary of what was accomplished}
Artifacts created: {list of files}

Options:
- "ok" / "proceed" — advance to next stage
- "deepen {section}" — elaborate on a specific section
- "{specific feedback}" — adjust current stage output
=====================================================
```

## Semantic Completion Promises

### What is a Promise?

A promise is a machine-readable tag embedded in the checkpoint output that signals the stage's completion status. It follows the format:

```
<promise>{TAG_NAME}</promise>
```

### Promise Rules

1. A promise tag MUST only be emitted AFTER its conditions are verifiably met
2. If conditions are NOT met, emit `<promise>{TAG_NAME}_INCOMPLETE</promise>` instead
3. Downstream stages SHOULD check for upstream promises before starting
4. Promise tags replace informal "stage done" signals with formal, parseable markers

### Defining Promises for Your Pipeline

Each stage in your pipeline should define:

| Stage | Promise Tag | Conditions |
|-------|-------------|------------|
| Stage 0 | `{PIPELINE}_STAGE_0_COMPLETE` | All stage 0 artifacts created and validated |
| Stage 1 | `{PIPELINE}_STAGE_1_COMPLETE` | All stage 1 artifacts created and validated |
| ... | ... | ... |

Replace `{PIPELINE}` with your pipeline's name (e.g., `RESEARCH`, `BTO`, `QE`).

### Promise Validation

At each stage start, the orchestrator should verify upstream promises:

```
1. Read the checkpoint history
2. Check that all required upstream promises exist
3. If any promise is missing or has _INCOMPLETE suffix:
   a. Log: "Missing prerequisite: {TAG_NAME}"
   b. Do NOT proceed — return to the incomplete stage
```

## Checkpoint Behavior

### On "ok" Response

1. Store the reward (1.0 — excellent) via memory_store
2. Emit the stage's promise tag
3. Advance to the next stage

### On Feedback Response

1. Parse feedback to determine scope
2. If minor (one section): store reward 0.7, adjust, re-checkpoint
3. If major (multiple sections): store reward 0.3, rework, re-checkpoint
4. If restart requested: store reward 0.0, restart stage from scratch

### On No Response

If the session ends without a response at the checkpoint:
- Do NOT store any reward (no record created)
- Do NOT emit any promise tag
- The stage remains in an indeterminate state

## Checkpoint Timing

Each checkpoint should display time spent vs. budget:

```
Time: {minutes_spent}m / {budget}m ({percentage}%)
```

If a stage exceeds its time budget, the checkpoint should include a warning:

```
Warning: Time budget exceeded ({percentage}% used). Consider wrapping up.
```

## Integration with Governance

Checkpoints are the primary enforcement point for governance rules:

1. Before displaying the checkpoint, run all constitution invariant checks
2. Before displaying the checkpoint, validate all quality gates from the stage's shard
3. If any gate fails, indicate it in the checkpoint and require the human to acknowledge

## Integration with Memory

After each checkpoint response:

1. Determine the reward score based on the human's response type
2. Call `memory_store()` with the stage context and reward
3. This enables the system to learn which stages perform well and which need improvement

## Integration with Witness Chain

After each checkpoint with "ok" response:

1. Compute the SHA-256 hash of the stage's primary artifact
2. Append a record to the witness chain
3. The promise tag is recorded in the chain record
