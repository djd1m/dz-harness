# Witness Chain Protocol

> SHA-256 hash-chain for tamper-evident artifact integrity verification.

## Purpose

This protocol defines how to compute SHA-256 hashes of pipeline artifacts and link them into a chain. Each artifact's hash includes the previous artifact's hash, making the chain tamper-evident: modifying any artifact breaks all downstream hashes.

## Constants

```
NULL_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
CHAIN_FILE = ".witness-chain.json"
HASH_PREFIX = "sha256:"
```

## Section 1: Hash Computation

### Platform Detection

Detect the available SHA-256 command:

```bash
# Try sha256sum first (Linux), then shasum (macOS)
if command -v sha256sum &>/dev/null; then
  SHA_CMD="sha256sum"
elif command -v shasum &>/dev/null; then
  SHA_CMD="shasum -a 256"
else
  echo "ERROR: No SHA-256 command found. Install coreutils."
  exit 1
fi
```

### Computing a File Hash

Hash a single file's content:

```bash
HASH=$(${SHA_CMD} "path/to/file.md" | awk '{print $1}')
```

### Computing a Chained Hash

Hash file content concatenated with the previous hash to create a chain link:

```bash
# Read file content and previous hash
FILE_CONTENT=$(cat "path/to/file.md")
PREV_HASH="<previous hash value>"

# Compute chained hash
CHAINED_HASH=$(printf '%s%s' "${FILE_CONTENT}" "${PREV_HASH}" | ${SHA_CMD} | awk '{print $1}')
```

**Important:** Use `printf '%s%s'` (not `echo`) to avoid trailing newline issues. The content is the raw file bytes followed immediately by the 64-character hex hash string.

### Content Normalization

Before hashing, the content should be the raw file content as stored on disk. Do NOT:
- Trim whitespace
- Normalize line endings
- Strip BOM markers

The hash must match the exact bytes in the file so that verification produces the same result.

## Section 2: Chain Operations

### Operation: Create Genesis Record

Called at Phase 0 (Discovery) to initialize the chain for a new research.

**Preconditions:**
- Research directory `researches/<slug>/` exists
- Phase 0 artifact `00_product_discovery.md` has been created
- No `.witness-chain.json` exists yet

**Procedure:**

```bash
SLUG="<research-slug>"
DIR="researches/${SLUG}"
ARTIFACT="00_product_discovery.md"
PREV_HASH="${NULL_HASH}"

# Compute genesis hash
FILE_CONTENT=$(cat "${DIR}/${ARTIFACT}")
HASH=$(printf '%s%s' "${FILE_CONTENT}" "${PREV_HASH}" | ${SHA_CMD} | awk '{print $1}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create .witness-chain.json
cat > "${DIR}/.witness-chain.json" << ENDOFCHAIN
{
  "research_slug": "${SLUG}",
  "created_at": "${TIMESTAMP}",
  "last_updated": "${TIMESTAMP}",
  "chain": [
    {
      "sequence": 0,
      "phase": "phase-0",
      "artifact": "${ARTIFACT}",
      "hash": "${HASH_PREFIX}${HASH}",
      "previous_hash": "${HASH_PREFIX}${PREV_HASH}",
      "timestamp": "${TIMESTAMP}",
      "promise_tag": "DISCOVERY_COMPLETE"
    }
  ]
}
ENDOFCHAIN
```

### Operation: Append Record

Called at each subsequent phase checkpoint to add a new record to the chain.

**Preconditions:**
- `.witness-chain.json` exists in the research directory
- The new artifact file has been created
- The previous phase's record exists in the chain

**Procedure:**

1. Read `.witness-chain.json` and extract the last record's hash
2. Compute the new chained hash: `SHA-256(new_content + last_hash)`
3. Append the new record to the chain array
4. Update `last_updated` timestamp

```bash
SLUG="<research-slug>"
DIR="researches/${SLUG}"
ARTIFACT="<artifact-filename>"
PHASE="<phase-id>"
PROMISE="<promise-tag>"

# Get the latest hash from the chain
PREV_HASH=$(cat "${DIR}/.witness-chain.json" | python3 -c "
import json, sys
chain = json.load(sys.stdin)
last = chain['chain'][-1]
print(last['hash'].replace('sha256:', ''))
")

# Compute new hash
FILE_CONTENT=$(cat "${DIR}/${ARTIFACT}")
HASH=$(printf '%s%s' "${FILE_CONTENT}" "${PREV_HASH}" | ${SHA_CMD} | awk '{print $1}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SEQUENCE=$(cat "${DIR}/.witness-chain.json" | python3 -c "
import json, sys
chain = json.load(sys.stdin)
print(len(chain['chain']))
")

# Append to chain (using python3 for safe JSON manipulation)
python3 -c "
import json, sys
with open('${DIR}/.witness-chain.json', 'r') as f:
    chain = json.load(f)
chain['chain'].append({
    'sequence': ${SEQUENCE},
    'phase': '${PHASE}',
    'artifact': '${ARTIFACT}',
    'hash': 'sha256:${HASH}',
    'previous_hash': 'sha256:${PREV_HASH}',
    'timestamp': '${TIMESTAMP}',
    'promise_tag': '${PROMISE}'
})
chain['last_updated'] = '${TIMESTAMP}'
with open('${DIR}/.witness-chain.json', 'w') as f:
    json.dump(chain, f, indent=2)
"
```

### Operation: Get Latest Hash

Retrieve the most recent hash from the chain (needed as input for the next append).

```bash
LATEST_HASH=$(python3 -c "
import json
with open('${DIR}/.witness-chain.json') as f:
    chain = json.load(f)
print(chain['chain'][-1]['hash'].replace('sha256:', ''))
")
```

## Section 3: Verification

### Operation: Verify Chain

Walk the entire chain and verify each hash matches the current file content.

**Algorithm:**

```
1. Load .witness-chain.json
2. For each record in chain (index i):
   a. Read the artifact file
   b. Get previous_hash:
      - If i == 0: previous_hash = NULL_HASH
      - Else: previous_hash = chain[i-1].hash (without prefix)
   c. Compute expected = SHA-256(file_content + previous_hash)
   d. Compare expected with record.hash (without prefix)
   e. If mismatch: record broken link
3. Produce verification report
```

**Bash implementation:**

```bash
DIR="researches/<slug>"

python3 << 'VERIFY_SCRIPT'
import json, subprocess, sys

NULL_HASH = "0" * 64
DIR = sys.argv[1] if len(sys.argv) > 1 else "."

def sha256(content):
    """Compute SHA-256 of a string."""
    result = subprocess.run(
        ["sha256sum"],
        input=content.encode(),
        capture_output=True
    )
    if result.returncode != 0:
        # Fallback to shasum
        result = subprocess.run(
            ["shasum", "-a", "256"],
            input=content.encode(),
            capture_output=True
        )
    return result.stdout.decode().split()[0]

# Load chain
with open(f"{DIR}/.witness-chain.json") as f:
    chain_data = json.load(f)

records = chain_data["chain"]
broken = []
verified = 0

for i, record in enumerate(records):
    artifact_path = f"{DIR}/{record['artifact']}"
    try:
        with open(artifact_path) as f:
            content = f.read()
    except FileNotFoundError:
        broken.append({
            "sequence": i,
            "artifact": record["artifact"],
            "reason": "File not found"
        })
        continue

    if i == 0:
        prev_hash = NULL_HASH
    else:
        prev_hash = records[i-1]["hash"].replace("sha256:", "")

    expected = sha256(content + prev_hash)
    actual = record["hash"].replace("sha256:", "")

    if expected == actual:
        verified += 1
    else:
        broken.append({
            "sequence": i,
            "artifact": record["artifact"],
            "expected_hash": f"sha256:{expected}",
            "actual_hash": record["hash"],
            "reason": "Hash mismatch - artifact may have been modified"
        })

# Report
total = len(records)
if not broken:
    print(f"PASS: All {total} records verified successfully")
else:
    print(f"FAIL: {len(broken)} broken links out of {total} records")
    for b in broken:
        print(f"  - Record {b['sequence']} ({b['artifact']}): {b['reason']}")

VERIFY_SCRIPT
```

## Section 4: File Format

### .witness-chain.json Schema

```json
{
  "research_slug": "string — research directory name",
  "created_at": "ISO-8601 — when chain was initialized",
  "last_updated": "ISO-8601 — when last record was added",
  "chain": [
    {
      "sequence": "integer — 0-based position in chain",
      "phase": "string — phase-0, phase-1, ..., phase-5",
      "artifact": "string — filename relative to research dir",
      "hash": "string — sha256:<64 hex chars>",
      "previous_hash": "string — sha256:<64 hex chars> or sha256:<null hash>",
      "timestamp": "ISO-8601 — when record was created",
      "promise_tag": "string — semantic completion promise"
    }
  ]
}
```

### Standard Phase-to-Artifact Mapping

| Phase | Artifact | Promise Tag |
|-------|----------|-------------|
| phase-0 | 00_product_discovery.md | DISCOVERY_COMPLETE |
| phase-1 | 01_case_brief.md | CASE_EXPLORED |
| phase-2 | 02_research_findings.md | RESEARCH_PARANOID_PASSED |
| phase-2.5 | 02.5_trend_brief.md | CJM_VALIDATED |
| phase-3 | 03_solution_strategy.md | SOLUTION_DESIGNED |
| phase-4 | 04_architecture.md | ARCHITECTURE_DEFINED |
| phase-5 | 05_presentation_content.md | PRESENTATION_READY |

### Example Complete Chain

```json
{
  "research_slug": "bank_kc_automation",
  "created_at": "2026-03-01T10:00:00Z",
  "last_updated": "2026-03-01T14:30:00Z",
  "chain": [
    {
      "sequence": 0,
      "phase": "phase-0",
      "artifact": "00_product_discovery.md",
      "hash": "sha256:a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
      "previous_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "timestamp": "2026-03-01T10:00:00Z",
      "promise_tag": "DISCOVERY_COMPLETE"
    },
    {
      "sequence": 1,
      "phase": "phase-1",
      "artifact": "01_case_brief.md",
      "hash": "sha256:b2c3d4e5f67890123456789012345678901234567890123456789012345bef01",
      "previous_hash": "sha256:a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
      "timestamp": "2026-03-01T10:30:00Z",
      "promise_tag": "CASE_EXPLORED"
    }
  ]
}
```

## Section 5: Chain Repair

If an artifact is legitimately modified (e.g., user requested changes during checkpoint review), the chain must be repaired:

1. Re-hash the modified artifact using the previous record's hash
2. Update the modified record's hash in `.witness-chain.json`
3. Re-hash ALL subsequent records (cascade update)
4. Update `last_updated` timestamp

This is expected and normal. The witness chain protects against *undetected* modifications, not against all modifications.

## Section 6: Platform Compatibility

| Platform | Command | Notes |
|----------|---------|-------|
| Linux (Ubuntu, Debian, etc.) | `sha256sum` | Available by default in coreutils |
| macOS | `shasum -a 256` | Available by default |
| Windows (WSL) | `sha256sum` | Available in WSL |
| Windows (Git Bash) | `sha256sum` | Available in Git for Windows |
| Alpine Linux | `sha256sum` | Available in coreutils |

The protocol should attempt `sha256sum` first, then fall back to `shasum -a 256`.
