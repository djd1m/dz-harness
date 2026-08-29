# Witness Chain Protocol — Tamper-Evident Artifact Integrity

> SHA-256 hash-chain for verifying that pipeline artifacts have not been modified between stages.

## Overview

This protocol defines how to compute SHA-256 hashes of pipeline artifacts and link them into a chain. Each artifact's hash includes the previous artifact's hash, making the chain tamper-evident: modifying any artifact breaks all downstream hashes.

## Constants

```
NULL_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
CHAIN_FILE = ".witness-chain.json"
HASH_PREFIX = "sha256:"
```

## Hash Computation

### Platform Detection

```bash
if command -v sha256sum &>/dev/null; then
  SHA_CMD="sha256sum"
elif command -v shasum &>/dev/null; then
  SHA_CMD="shasum -a 256"
else
  echo "ERROR: No SHA-256 command found."
  exit 1
fi
```

### Computing a File Hash

```bash
HASH=$(${SHA_CMD} "path/to/file.md" | awk '{print $1}')
```

### Computing a Chained Hash

```bash
FILE_CONTENT=$(cat "path/to/file.md")
PREV_HASH="<previous hash value>"
CHAINED_HASH=$(printf '%s%s' "${FILE_CONTENT}" "${PREV_HASH}" | ${SHA_CMD} | awk '{print $1}')
```

**Important:** Use `printf '%s%s'` (not `echo`) to avoid trailing newline issues.

### Content Normalization

Hash the raw file content as stored on disk. Do NOT trim whitespace, normalize line endings, or strip BOM markers. The hash must match the exact bytes.

## Chain Operations

### Create Genesis Record

Called at the first stage to initialize the chain.

**Preconditions:**
- Project directory exists
- First stage artifact has been created
- No `.witness-chain.json` exists yet

**Procedure:**
1. Compute hash of first artifact with NULL_HASH as previous
2. Create `.witness-chain.json` with a single chain record

### Append Record

Called at each subsequent stage checkpoint.

**Preconditions:**
- `.witness-chain.json` exists
- New artifact file has been created
- Previous stage's record exists in the chain

**Procedure:**
1. Read chain, extract last record's hash
2. Compute new chained hash: `SHA-256(new_content + last_hash)`
3. Append record to chain array
4. Update `last_updated` timestamp

### Verify Chain

Walk the entire chain and verify each hash.

**Algorithm:**
```
1. Load .witness-chain.json
2. For each record (index i):
   a. Read the artifact file
   b. Get previous_hash (NULL_HASH for i==0, else chain[i-1].hash)
   c. Compute expected = SHA-256(file_content + previous_hash)
   d. Compare expected with stored hash
   e. If mismatch: record broken link
3. Produce verification report
```

## Chain File Schema

```json
{
  "project_slug": "string — project directory name",
  "created_at": "ISO-8601",
  "last_updated": "ISO-8601",
  "chain": [
    {
      "sequence": 0,
      "stage": "string — stage identifier",
      "artifact": "string — filename relative to project dir",
      "hash": "sha256:<64 hex chars>",
      "previous_hash": "sha256:<64 hex chars or null hash>",
      "timestamp": "ISO-8601",
      "promise_tag": "string — semantic completion promise"
    }
  ]
}
```

## Chain Repair

If an artifact is legitimately modified (e.g., after human feedback at checkpoint):

1. Re-hash the modified artifact using the previous record's hash
2. Update the modified record's hash
3. Re-hash ALL subsequent records (cascade update)
4. Update `last_updated` timestamp

This is expected behavior. The witness chain protects against *undetected* modifications.

## Platform Compatibility

| Platform | Command | Notes |
|----------|---------|-------|
| Linux | `sha256sum` | Default in coreutils |
| macOS | `shasum -a 256` | Default |
| Windows (WSL/Git Bash) | `sha256sum` | Available |

Attempt `sha256sum` first, fall back to `shasum -a 256`.
