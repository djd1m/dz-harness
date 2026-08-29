# Audit Trail Protocol — Complete Evaluation History

> Protocol for maintaining a complete, verifiable history of all evaluations and decisions in a pipeline.

## Overview

The Audit Trail combines the Witness Chain (artifact integrity) and Judge Attestation (evaluator isolation) into a unified evaluation history. It provides a single point of reference for auditing any decision made during pipeline execution.

## Audit Trail Structure

```
{audit-root}/
├── audit-log.json                     ← Master log of all events
├── witness-chains/
│   └── {project-slug}.json            ← Per-project witness chain
├── attestations/
│   └── {evaluation-id}.json           ← Per-evaluation attestation set
└── decisions/
    └── {decision-id}.json             ← Per-decision record
```

## Event Types

| Event Type | Description | Source Protocol |
|------------|-------------|----------------|
| `artifact_created` | A stage artifact was produced | witness-chain.md |
| `artifact_verified` | An artifact's hash was verified | witness-chain.md |
| `artifact_modified` | An artifact was legitimately changed | witness-chain.md (repair) |
| `evaluation_started` | A judge panel began evaluation | judge-attestation.md |
| `evaluation_completed` | A judge panel finished scoring | judge-attestation.md |
| `checkpoint_reached` | A human checkpoint was displayed | checkpoint-protocol.md |
| `checkpoint_approved` | Human approved at checkpoint | checkpoint-protocol.md |
| `checkpoint_revised` | Human requested changes at checkpoint | checkpoint-protocol.md |
| `reward_stored` | A reward record was persisted | memory-protocol.md |
| `decision_made` | A pipeline decision was recorded | (this protocol) |

## Audit Log Schema

```json
{
  "version": "1.0",
  "pipeline_id": "string — unique pipeline execution ID",
  "started_at": "ISO-8601",
  "events": [
    {
      "event_id": "evt-{sequence:06d}",
      "type": "string — event type from table above",
      "timestamp": "ISO-8601",
      "stage": "string — stage where event occurred",
      "actor": "string — agent ID or 'human'",
      "details": {
        "description": "string — human-readable event description",
        "artifact": "string — file path (if applicable)",
        "hash": "sha256:... (if applicable)",
        "score": 8.2,
        "reward": 0.7
      },
      "references": {
        "witness_chain_sequence": 3,
        "attestation_id": "bto-eval-...",
        "checkpoint_number": 2
      }
    }
  ]
}
```

## Decision Record Schema

For significant decisions (e.g., which solution variant to choose, which candidate to promote):

```json
{
  "decision_id": "dec-{YYYYMMDD}-{HHmmss}-{seq}",
  "timestamp": "ISO-8601",
  "stage": "string — stage where decision was made",
  "decision_type": "variant_selection | tier_promotion | escalation | rollback",
  "description": "string — what was decided",
  "options_considered": [
    {
      "option_id": "A",
      "description": "string",
      "score": 8.2,
      "selected": true
    },
    {
      "option_id": "B",
      "description": "string",
      "score": 7.1,
      "selected": false
    }
  ],
  "rationale": "string — why this option was chosen",
  "decided_by": "string — agent ID or 'human'",
  "evidence": {
    "attestation_id": "string (if decision was based on judge scores)",
    "witness_chain_hash": "sha256:... (if decision was about an artifact)"
  }
}
```

## Audit Trail Operations

### Initialize

At pipeline start:
1. Create `{audit-root}/` directory if it does not exist
2. Create a new `audit-log.json` with the pipeline execution ID
3. Log the `pipeline_started` event

### Record Event

At each significant point:
1. Read the current audit-log.json
2. Append the new event with an incremental event_id
3. Write the updated audit-log.json

### Query

To find events related to a specific artifact or stage:
1. Load audit-log.json
2. Filter events by `stage`, `type`, or `details.artifact`
3. Return matching events in chronological order

### Verify Integrity

To verify the audit trail has not been tampered with:
1. For each `artifact_created` event, verify the hash in the witness chain
2. For each `evaluation_completed` event, verify attestations
3. Check that event timestamps are monotonically increasing
4. Report any inconsistencies

## Integration Points

| Source | Audit Event | When |
|--------|------------|------|
| Witness Chain | `artifact_created` | After each stage artifact is hashed |
| Judge Attestation | `evaluation_started`, `evaluation_completed` | At judge panel start/end |
| Checkpoint Protocol | `checkpoint_reached`, `checkpoint_approved` | At each human checkpoint |
| Memory Protocol | `reward_stored` | After each memory_store() call |

## Retention Policy

- Audit logs are retained for the lifetime of the project
- They are NOT subject to the memory protocol's expiration rules
- On brain export, the audit trail is included as metadata (event counts, not full events)

## Regulatory Compliance Note

For regulated domains (banking, healthcare), the audit trail provides:
- Complete decision traceability
- Proof of human oversight (checkpoint events)
- Proof of evaluator independence (attestation events)
- Artifact integrity verification (witness chain events)
