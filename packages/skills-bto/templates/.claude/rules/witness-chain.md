# Witness Chain Integration Rules

## Purpose

These rules define when and how SHA-256 witness records and BTO judge attestations are created during the Keysarium pipeline. They integrate with the existing checkpoint protocol and BTO quality gates.

## Rule 1: Witness Record at Every Phase Checkpoint

**WHEN:** A phase checkpoint is reached and the phase artifact has been created.
**THEN:** Create a witness record before displaying the checkpoint banner.

### Procedure

1. After creating the phase artifact file, compute its witness record
2. If this is Phase 0 (first phase): create genesis record in `.witness-chain.json`
3. If this is Phase 1+: append record to existing `.witness-chain.json`
4. Include the witness hash in the checkpoint banner

### Integration with Checkpoint Format

The checkpoint banner gains a witness hash line:

```
=============================================================
CHECKPOINT N: [Phase Name] Complete
<promise>[PROMISE_TAG]</promise>
Witness: sha256:<hash>  (chain link #N)

[2-3 line summary of what was done]
Files created: [list]

* "ok" -- next phase
* "углуби [section]" -- elaborate
* "[specific feedback]" -- adjust
=============================================================
```

## Rule 2: Chain Structure Per Research

Each research directory (`researches/<slug>/`) has its own independent witness chain stored in `researches/<slug>/.witness-chain.json`.

### Chain initialization

- Created at Phase 0 (Discovery) with the genesis record
- Uses NULL_HASH (64 zeros) as the previous_hash for the first record

### Standard chain sequence

| Sequence | Phase | Artifact | Promise Tag |
|----------|-------|----------|-------------|
| 0 | phase-0 | 00_product_discovery.md | DISCOVERY_COMPLETE |
| 1 | phase-1 | 01_case_brief.md | CASE_EXPLORED |
| 2 | phase-2 | 02_research_findings.md | RESEARCH_PARANOID_PASSED |
| 3 | phase-2.5 | 02.5_trend_brief.md | CJM_VALIDATED |
| 4 | phase-3 | 03_solution_strategy.md | SOLUTION_DESIGNED |
| 5 | phase-4 | 04_architecture.md | ARCHITECTURE_DEFINED |
| 6 | phase-5 | 05_presentation_content.md | PRESENTATION_READY |

Additional artifacts (06_speaker_script.md, 07_qa_preparation.md, 08_executive_summary.md) may be added as additional chain records after sequence 6 if desired.

## Rule 3: Required Fields Per Witness Record

Every witness record MUST contain ALL of the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `sequence` | integer | 0-based position, monotonically increasing |
| `phase` | string | Phase identifier (phase-0 through phase-5) |
| `artifact` | string | Filename relative to research directory |
| `hash` | string | `sha256:` prefix + 64 hex chars |
| `previous_hash` | string | `sha256:` prefix + 64 hex chars (or null hash for genesis) |
| `timestamp` | string | ISO-8601 UTC timestamp |
| `promise_tag` | string | The semantic promise tag for this phase |

No field may be empty, null, or omitted.

## Rule 4: BTO Judge Attestation Integration

**WHEN:** A BTO Layer 2 judge panel completes evaluation.
**THEN:** Create judge attestations in `.judge-attestations.json`.

### Procedure

1. Before the panel starts: compute the artifact_hash of the evaluated artifact
2. After each judge submits its score and rationale:
   a. Compute evaluation_hash = SHA-256(judge_id|artifact_hash|score|rationale_summary)
   b. Link to previous attestation hash (or NULL_HASH for first judge)
   c. Record timestamp
3. After all judges complete: write `.judge-attestations.json` alongside the evaluation files
4. If meta-judge is invoked (disagreement > 3 points): append meta-judge attestation

### Attestation placement

The `.judge-attestations.json` file is stored in the same directory as the BTO evaluation output. If the BTO evaluation is for a skill, this could be:
- `researches/<slug>/` if BTO was run on a research artifact
- `.claude/skills/<name>/` if BTO was run on a skill
- The current working directory if path was specified explicitly

## Rule 5: Chain Repair After Legitimate Edits

If a user provides feedback at a checkpoint and the artifact is modified:

1. Re-hash the modified artifact using the same previous_hash
2. Update the record's hash in `.witness-chain.json`
3. If subsequent records exist: re-hash ALL downstream records (cascade)
4. Update `last_updated` timestamp
5. Log the repair in a `chain_repairs` array at the top level of the JSON:

```json
{
  "chain_repairs": [
    {
      "repaired_at": "2026-03-01T11:30:00Z",
      "sequence": 2,
      "artifact": "02_research_findings.md",
      "reason": "User requested additional research depth",
      "records_rehashed": 3
    }
  ]
}
```

This is expected behavior, not an error. The repair log provides audit context.

## Rule 6: Verification Recommendation

After completing a full pipeline (all phases through packaging):
- Recommend running `/verify-chain researches/<slug>/` as a final integrity check
- Include verification in the Phase 6 (Packaging) checklist

After completing a BTO evaluation:
- Recommend running `/verify-chain` on the evaluation directory to confirm judge isolation

## Rule 7: Graceful Degradation

If witness chain creation fails for any reason (sha256sum not available, file permission error, JSON write failure):
- Log a WARNING but do NOT block the pipeline
- The witness chain is an integrity enhancement, not a pipeline gate
- The pipeline must complete even without witness records

Exception: In banking domain (detected by Phase 0 domain detection), witness chain failure should be escalated to the user as a WARNING at the checkpoint, since audit trail is especially important for ФЗ-152 compliance.

## Rule 8: No Witness Chain for Feature ADR Pipeline

The `/feature-adr` pipeline does NOT require witness chains. Witness chains are designed for the Keysarium research pipeline (`/casarium`) and BTO evaluation pipeline (`/bto-test`).

If a user explicitly requests witness chain verification for a feature directory, `/verify-chain` should handle it gracefully (scan for `.witness-chain.json`, report NOT_FOUND if absent).

## Rule 9: Chain Files in .gitignore

The `.witness-chain.json` and `.judge-attestations.json` files SHOULD be committed to git alongside research artifacts. They are part of the audit trail and should be version-controlled.

Do NOT add these files to `.gitignore`.
