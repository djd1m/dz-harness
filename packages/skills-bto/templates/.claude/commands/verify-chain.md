# /verify-chain — Witness Chain and Judge Attestation Verification

> Verify the integrity of SHA-256 witness chains and BTO judge attestation chains.

## Usage

```
/verify-chain [path]       — Verify a specific research directory
/verify-chain all          — Verify all research directories
```

## Arguments

- `path`: Path to a research directory (e.g., `researches/bank_kc_automation/`) or `"all"` to scan all directories under `researches/`.

$ARGUMENTS

## Protocol

### Step 1: Parse Arguments and Discover Targets

Determine which directories to verify:

```bash
TARGET="$ARGUMENTS"

if [ "${TARGET}" = "all" ]; then
  # Find all research directories
  DIRS=$(find researches/ -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
  if [ -z "${DIRS}" ]; then
    echo "No research directories found under researches/"
    exit 0
  fi
else
  # Single directory
  DIRS="${TARGET}"
  if [ ! -d "${TARGET}" ]; then
    echo "ERROR: Directory '${TARGET}' not found"
    exit 1
  fi
fi
```

### Step 2: Load Protocols

Read the witness chain and judge attestation protocols for reference:

```
Read: lib/witness-chain.md
Read: lib/judge-attestation.md
```

### Step 3: Verify Each Directory

For each target directory, perform two verification passes:

#### Pass A: Witness Chain Verification

1. Check if `.witness-chain.json` exists in the directory
2. If not found: report `NOT_FOUND` for this directory (not an error — chain may not have been enabled)
3. If found:
   a. Parse the JSON file
   b. Detect platform SHA-256 command (`sha256sum` or `shasum -a 256`)
   c. For each record in the chain:
      - Read the artifact file
      - If file missing: record FAIL with "artifact file not found"
      - Compute the chained hash: `SHA-256(file_content + previous_hash)`
        - For sequence 0: previous_hash = NULL_HASH (64 zeros)
        - For sequence N: previous_hash = chain[N-1].hash (without "sha256:" prefix)
      - Compare computed hash with stored hash
      - If match: record PASS
      - If mismatch: record FAIL with expected vs actual hash
   d. Verify sequence numbers are contiguous (0, 1, 2, ...)
   e. Verify timestamps are chronologically ordered

#### Pass B: Judge Attestation Verification

1. Check if `.judge-attestations.json` exists in the directory
2. If not found: skip (attestations are optional — only present if BTO was run)
3. If found:
   a. Parse the JSON file
   b. For each evaluation round:
      - Verify `artifact_hash` by recomputing SHA-256 of the artifact file (if file path available)
      - For each attestation:
        - Reconstruct evaluation_hash from: `judge_id|artifact_hash|score|rationale_summary`
        - Compare reconstructed hash with stored `evaluation_hash`
        - Verify `previous_attestation_hash` matches the preceding attestation's `evaluation_hash`
        - Verify timestamp is after the preceding attestation's timestamp
      - Report isolation status (all hashes valid = isolation confirmed)

### Step 4: Produce Verification Report

Display a formatted report for each directory:

```
===============================================================
WITNESS CHAIN VERIFICATION REPORT
===============================================================

Directory: researches/bank_kc_automation/

--- Artifact Chain ---
  [PASS] #0 phase-0  00_product_discovery.md
  [PASS] #1 phase-1  01_case_brief.md
  [PASS] #2 phase-2  02_research_findings.md
  [FAIL] #3 phase-2.5 02.5_trend_brief.md
         Expected: sha256:abc123...
         Actual:   sha256:def456...
         >> Artifact may have been modified after checkpoint
  [SKIP] #4 phase-3  03_solution_strategy.md (upstream chain broken)

  Chain Status: BROKEN at record #3
  Verified: 3/5 records

--- Judge Attestations ---
  Evaluation: bto-eval-2026-03-01T12:00:00Z
  [PASS] domain-expert    score=8.2  hash verified
  [PASS] critic           score=7.5  hash verified, chain link valid
  [PASS] completeness-auditor score=8.0  hash verified, chain link valid

  Isolation Status: CONFIRMED
  All 3 judges evaluated independently.

===============================================================
SUMMARY
===============================================================

Directories verified: 1
  PASS: 0
  FAIL: 1 (broken chain in bank_kc_automation)
  NOT_FOUND: 0

Attestation sets verified: 1
  Isolation confirmed: 1
  Isolation violated: 0

===============================================================
```

### Step 5: Handle Edge Cases

| Scenario | Behavior |
|----------|----------|
| No `.witness-chain.json` in directory | Report NOT_FOUND, do not treat as error |
| Empty chain (no records) | Report WARNING: "Chain exists but contains no records" |
| Artifact file deleted | Report FAIL: "Artifact file not found" |
| Invalid JSON | Report FAIL: "Chain file corrupted — invalid JSON" |
| `sha256sum` not available | Try `shasum -a 256`, if also missing report ERROR |
| Directory does not exist | Report ERROR: "Directory not found" |
| Chain has gaps in sequence numbers | Report WARNING: "Non-contiguous sequence numbers" |
| Timestamps not monotonic | Report WARNING: "Timestamps not in chronological order" |

### Step 6: Summary and Recommendations

After all directories are verified, provide actionable recommendations:

- If a chain is broken: "Run the pipeline phase again to re-hash from the modified artifact forward"
- If attestation isolation is violated: "Review the BTO evaluation process — judges may have shared context"
- If no chains found: "Witness chains are created automatically during the /casarium pipeline when witness-chain rules are active"

## Quality Gates

- [ ] All target directories scanned
- [ ] Each record verified with hash recomputation (not just format check)
- [ ] Broken links reported with specific artifact name and hash values
- [ ] Judge attestation isolation checked (if attestations present)
- [ ] Clear summary with pass/fail counts
- [ ] Actionable recommendations provided for failures
