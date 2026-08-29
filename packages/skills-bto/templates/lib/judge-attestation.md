# Judge Attestation Protocol

> Cryptographic proof of BTO judge isolation via SHA-256 hash chain attestations.

## Purpose

This protocol defines how BTO judges (Domain Expert, Critic, Completeness Auditor) create cryptographic attestations proving their evaluations were performed independently. Each judge records a hash of its evaluation before seeing other judges' scores. The attestations are chained to provide ordering proof.

## Constants

```
NULL_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
ATTESTATION_FILE = ".judge-attestations.json"
HASH_PREFIX = "sha256:"
STANDARD_PANEL_SIZE = 3
HIGH_STAKES_PANEL_SIZE = 5
```

## Section 1: Attestation Creation

### Hash Input Construction

Each judge's evaluation hash is computed from a deterministic concatenation of:

```
evaluation_hash = SHA-256(judge_id + "|" + artifact_hash + "|" + score + "|" + rationale_summary)
```

The pipe character `|` serves as a delimiter to prevent ambiguity in concatenation.

**Fields:**
- `judge_id`: One of `"domain-expert"`, `"critic"`, `"completeness-auditor"` (or `"meta-judge"` for escalation)
- `artifact_hash`: SHA-256 hash of the artifact being evaluated (computed before evaluation starts)
- `score`: The numeric score as a string with one decimal place (e.g., `"8.2"`)
- `rationale_summary`: First 500 characters of the judge's rationale text, trimmed of leading/trailing whitespace

### Computing the Artifact Hash

Before any judge starts evaluation, compute the artifact hash:

```bash
ARTIFACT_HASH=$(${SHA_CMD} "path/to/artifact.md" | awk '{print $1}')
```

This hash is shared with all judges and recorded in each attestation. It proves all judges evaluated the same artifact.

### Computing the Evaluation Hash

After a judge completes its evaluation:

```bash
JUDGE_ID="domain-expert"
ARTIFACT_HASH="<computed above>"
SCORE="8.2"
RATIONALE_SUMMARY="<first 500 chars of rationale>"

EVAL_HASH=$(printf '%s' "${JUDGE_ID}|${ARTIFACT_HASH}|${SCORE}|${RATIONALE_SUMMARY}" | ${SHA_CMD} | awk '{print $1}')
```

**Important:** The rationale_summary must be trimmed to exactly 500 characters (or fewer if the rationale is shorter) to ensure deterministic reproduction during verification.

## Section 2: Chain Linking

### Attestation Order

Judges are recorded in a fixed order within each evaluation round:

1. Domain Expert (first, previous = NULL_HASH)
2. Critic (second, previous = Domain Expert's evaluation_hash)
3. Completeness Auditor (third, previous = Critic's evaluation_hash)

For a 5-judge high-stakes panel:
4. Additional Expert (fourth, previous = Auditor's evaluation_hash)
5. Tiebreaker (fifth, previous = Additional Expert's evaluation_hash)

### Chain Link Protocol

```bash
# Judge 1 (Domain Expert)
PREV_ATTESTATION_HASH="${NULL_HASH}"
# ... compute evaluation_hash_1 ...
# Record attestation with previous = NULL_HASH

# Judge 2 (Critic)
PREV_ATTESTATION_HASH="${EVAL_HASH_1}"
# ... compute evaluation_hash_2 ...
# Record attestation with previous = evaluation_hash_1

# Judge 3 (Completeness Auditor)
PREV_ATTESTATION_HASH="${EVAL_HASH_2}"
# ... compute evaluation_hash_3 ...
# Record attestation with previous = evaluation_hash_2
```

### Ordering Note

The chain records the ORDER in which attestations were finalized, not the order in which judges started evaluating. Since judges evaluate in parallel but record sequentially, the chain proves:
- Each attestation was recorded after the previous one
- The evaluation_hash was computed from the judge's OWN data only
- The previous_attestation_hash links to the preceding record (not to the preceding judge's score)

## Section 3: Isolation Verification

### Verification Algorithm

```
1. Load .judge-attestations.json
2. For each evaluation round:
   a. Verify artifact_hash matches across all attestations
   b. For each attestation (index i):
      i.   Reconstruct evaluation_hash from (judge_id, artifact_hash, score, rationale_summary)
      ii.  Compare reconstructed hash with stored evaluation_hash
      iii. If i == 0: verify previous_attestation_hash == NULL_HASH
      iv.  If i > 0: verify previous_attestation_hash == attestations[i-1].evaluation_hash
      v.   Verify timestamp > attestations[i-1].timestamp (if i > 0)
3. Produce verification report
```

### Isolation Proof Logic

The isolation proof works as follows:

1. **Hash Independence:** Each evaluation_hash is computed from `judge_id|artifact_hash|score|rationale`. If a judge had seen another judge's score, it would not affect its own hash computation -- but it would be detectable if the rationale text references specific scores from other judges.

2. **Chain Integrity:** The previous_attestation_hash links attestations in order but does NOT include other judges' scores in the hash input. This means the chain proves ORDER but the evaluation content is provably independent.

3. **Timestamp Monotonicity:** Timestamps must be strictly increasing. If Judge B's timestamp is BEFORE Judge A's, but Judge B's previous_attestation_hash points to Judge A, then something is wrong.

### Verification Script

```bash
python3 << 'VERIFY_ATTESTATION'
import json, subprocess, sys

NULL_HASH = "0" * 64

def sha256(content):
    result = subprocess.run(
        ["sha256sum"],
        input=content.encode(),
        capture_output=True
    )
    if result.returncode != 0:
        result = subprocess.run(
            ["shasum", "-a", "256"],
            input=content.encode(),
            capture_output=True
        )
    return result.stdout.decode().split()[0]

DIR = sys.argv[1] if len(sys.argv) > 1 else "."

with open(f"{DIR}/.judge-attestations.json") as f:
    data = json.load(f)

for eval_round in data.get("evaluations", [data]):
    attestations = eval_round.get("attestations", [])
    artifact_hash = eval_round.get("artifact_hash", "")
    violations = []

    for i, att in enumerate(attestations):
        # Reconstruct evaluation hash
        hash_input = f"{att['judge_id']}|{artifact_hash}|{att['score']}|{att.get('rationale_summary', '')}"
        expected = sha256(hash_input)
        actual = att["evaluation_hash"].replace("sha256:", "")

        if expected != actual:
            violations.append(f"Judge {att['judge_id']}: evaluation_hash mismatch")

        # Verify chain link
        if i == 0:
            expected_prev = NULL_HASH
        else:
            expected_prev = attestations[i-1]["evaluation_hash"].replace("sha256:", "")

        actual_prev = att["previous_attestation_hash"].replace("sha256:", "")
        if expected_prev != actual_prev:
            violations.append(f"Judge {att['judge_id']}: chain link broken")

    if not violations:
        print(f"PASS: All {len(attestations)} judge attestations verified. Isolation confirmed.")
    else:
        print(f"FAIL: {len(violations)} violations detected:")
        for v in violations:
            print(f"  - {v}")

VERIFY_ATTESTATION
```

## Section 4: File Format

### .judge-attestations.json Schema

```json
{
  "evaluations": [
    {
      "evaluation_id": "string — unique ID for this evaluation round",
      "artifact_path": "string — path to the evaluated artifact",
      "artifact_hash": "string — sha256:<hex> of the artifact content",
      "panel_size": "integer — 3 (standard) or 5 (high-stakes)",
      "started_at": "ISO-8601 — when evaluation round began",
      "completed_at": "ISO-8601 — when last attestation recorded",
      "attestations": [
        {
          "judge_id": "string — domain-expert|critic|completeness-auditor",
          "score": "float — 0.0-10.0",
          "rationale_summary": "string — first 500 chars of rationale",
          "evaluation_hash": "string — sha256:<hex>",
          "timestamp": "ISO-8601 — when attestation was recorded",
          "previous_attestation_hash": "string — sha256:<hex> or null hash"
        }
      ],
      "final_score": "float — weighted average",
      "weights": {
        "domain-expert": 0.4,
        "critic": 0.3,
        "completeness-auditor": 0.3
      }
    }
  ]
}
```

### Example Attestation File

```json
{
  "evaluations": [
    {
      "evaluation_id": "bto-eval-2026-03-01T12:00:00Z",
      "artifact_path": ".claude/skills/explore/SKILL.md",
      "artifact_hash": "sha256:abc123def456789012345678901234567890123456789012345678901234fedc",
      "panel_size": 3,
      "started_at": "2026-03-01T12:00:00Z",
      "completed_at": "2026-03-01T12:01:45Z",
      "attestations": [
        {
          "judge_id": "domain-expert",
          "score": 8.2,
          "rationale_summary": "Strong SKILL.md with clear protocol steps. References directory provides good examples...",
          "evaluation_hash": "sha256:111222333444555666777888999000aaabbbcccdddeeefff000111222333444555",
          "timestamp": "2026-03-01T12:00:30Z",
          "previous_attestation_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        },
        {
          "judge_id": "critic",
          "score": 7.5,
          "rationale_summary": "Missing edge case handling for multi-language inputs. Error recovery protocol unclear...",
          "evaluation_hash": "sha256:222333444555666777888999000aaabbbcccdddeeefff000111222333444555666",
          "timestamp": "2026-03-01T12:01:00Z",
          "previous_attestation_hash": "sha256:111222333444555666777888999000aaabbbcccdddeeefff000111222333444555"
        },
        {
          "judge_id": "completeness-auditor",
          "score": 8.0,
          "rationale_summary": "All required sections present. References directory has 3 examples. Missing: performance benchmarks...",
          "evaluation_hash": "sha256:333444555666777888999000aaabbbcccdddeeefff000111222333444555666777",
          "timestamp": "2026-03-01T12:01:30Z",
          "previous_attestation_hash": "sha256:222333444555666777888999000aaabbbcccdddeeefff000111222333444555666"
        }
      ],
      "final_score": 7.94,
      "weights": {
        "domain-expert": 0.4,
        "critic": 0.3,
        "completeness-auditor": 0.3
      }
    }
  ]
}
```

## Section 5: Integration with BTO Pipeline

### When to Create Attestations

Attestations are created during **BTO Layer 2 evaluation** (the judge panel stage):

1. **Before panel starts:** Compute `artifact_hash` of the artifact being evaluated
2. **After each judge completes:** Create attestation record with evaluation_hash
3. **After all judges complete:** Write `.judge-attestations.json`
4. **If meta-judge is invoked:** Add a 4th attestation with `judge_id: "meta-judge"`

### Integration Points

| BTO Stage | Attestation Action |
|-----------|-------------------|
| Layer 0 (structural) | No attestation needed (deterministic checks) |
| Layer 1 (semantic) | No attestation needed (single haiku agent) |
| Layer 2 (judge panel) | Create attestation set with 3 attestations |
| Meta-judge (escalation) | Append meta-judge attestation to the set |
| Optimization rounds | Create new attestation set per round's final evaluation |

### Disagreement Detection Enhancement

With attestations, disagreement detection gains cryptographic backing:

```
If max_score - min_score > 3.0:
  1. Verify all attestations are valid (no tampering)
  2. Verify isolation (no judge influenced another)
  3. If isolation verified: escalate to meta-judge (genuine disagreement)
  4. If isolation violated: flag conformity collapse warning
```

## Section 6: Meta-Judge Attestation

When the meta-judge is invoked (disagreement > 3 points), it creates its own attestation:

```json
{
  "judge_id": "meta-judge",
  "score": 7.8,
  "rationale_summary": "Disagreement between domain-expert (8.5) and critic (5.2) on dimension 'completeness'...",
  "evaluation_hash": "sha256:...",
  "timestamp": "2026-03-01T12:02:00Z",
  "previous_attestation_hash": "sha256:<last judge's eval hash>"
}
```

The meta-judge's rationale MAY reference other judges' scores (it has access to them for arbitration). This is expected and does not violate isolation -- the meta-judge is explicitly a synthesizer, not an independent evaluator.
