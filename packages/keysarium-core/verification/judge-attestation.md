# Judge Attestation Protocol — Evaluator Isolation Proofs

> Cryptographic proof that evaluators in a multi-evaluator panel operated independently.

## Overview

When multiple evaluators (judges) assess the same artifact, it is critical to prove they operated independently. This protocol defines how each judge creates a cryptographic attestation of its evaluation before seeing other judges' scores.

## Constants

```
NULL_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
ATTESTATION_FILE = ".judge-attestations.json"
HASH_PREFIX = "sha256:"
STANDARD_PANEL_SIZE = 3
HIGH_STAKES_PANEL_SIZE = 5
```

## Attestation Creation

### Hash Input Construction

Each judge's evaluation hash is computed from:

```
evaluation_hash = SHA-256(judge_id + "|" + artifact_hash + "|" + score + "|" + rationale_summary)
```

- `judge_id`: Unique identifier for the judge role
- `artifact_hash`: SHA-256 hash of the artifact being evaluated
- `score`: Numeric score as a string with one decimal place (e.g., "8.2")
- `rationale_summary`: First 500 characters of the judge's rationale text

### Computing the Artifact Hash

Before any judge starts, compute the artifact hash:

```bash
ARTIFACT_HASH=$(${SHA_CMD} "path/to/artifact.md" | awk '{print $1}')
```

This proves all judges evaluated the same artifact.

### Computing the Evaluation Hash

After a judge completes its evaluation:

```bash
EVAL_HASH=$(printf '%s' "${JUDGE_ID}|${ARTIFACT_HASH}|${SCORE}|${RATIONALE_SUMMARY}" | ${SHA_CMD} | awk '{print $1}')
```

## Chain Linking

Judges are recorded in a fixed order:

1. First judge (previous = NULL_HASH)
2. Second judge (previous = first judge's evaluation_hash)
3. Third judge (previous = second judge's evaluation_hash)
4. Additional judges continue the chain

The chain records the ORDER of attestation finalization, proving each was recorded after the previous.

## Isolation Proof Logic

1. **Hash Independence:** Each evaluation_hash is computed from the judge's own data only
2. **Chain Integrity:** The previous_attestation_hash links attestations in order but does NOT include other judges' scores
3. **Timestamp Monotonicity:** Timestamps must be strictly increasing

## Attestation File Schema

```json
{
  "evaluations": [
    {
      "evaluation_id": "string — unique ID for this round",
      "artifact_path": "string — path to evaluated artifact",
      "artifact_hash": "sha256:<hex>",
      "panel_size": 3,
      "started_at": "ISO-8601",
      "completed_at": "ISO-8601",
      "attestations": [
        {
          "judge_id": "string — judge role identifier",
          "score": 8.2,
          "rationale_summary": "string — first 500 chars",
          "evaluation_hash": "sha256:<hex>",
          "timestamp": "ISO-8601",
          "previous_attestation_hash": "sha256:<hex or null hash>"
        }
      ],
      "final_score": 7.94,
      "weights": {
        "judge-1": 0.4,
        "judge-2": 0.3,
        "judge-3": 0.3
      }
    }
  ]
}
```

## Verification

```
1. Load attestation file
2. For each evaluation round:
   a. Verify artifact_hash matches across all attestations
   b. For each attestation (index i):
      i.   Reconstruct evaluation_hash from (judge_id, artifact_hash, score, rationale_summary)
      ii.  Compare with stored evaluation_hash
      iii. Verify chain link (previous_attestation_hash)
      iv.  Verify timestamp monotonicity
3. Produce verification report
```

## Meta-Judge Attestation

When a meta-judge is invoked (e.g., disagreement exceeds threshold), it creates its own attestation appended to the chain. The meta-judge MAY reference other judges' scores (it is explicitly a synthesizer, not an independent evaluator).

## Disagreement Detection Enhancement

With attestations, disagreement detection gains cryptographic backing:

```
If max_score - min_score > threshold:
  1. Verify all attestations are valid
  2. Verify isolation (no influence detected)
  3. If isolation verified: escalate to meta-judge (genuine disagreement)
  4. If isolation violated: flag conformity collapse warning
```
