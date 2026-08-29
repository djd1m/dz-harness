---
name: intake-archive
description: Deterministically ingest an archive of patient documents (object-storage URL or local path) into a workspace's canonical sources/ layout — digest verified before parse, hardened unzip, atomic commit, append-only catalog. Use when the user has a zip of medical documents to bring into a case. NEVER unpack a patient archive by hand.
---

# intake-archive

The **deterministic** way patient documents enter a workspace. When a user has an archive of medical
documents — a hospital export, a scan bundle, a lab's zip — you do not unpack it yourself. You run this
command, and the workspace gains an immutable, indexed, auditable corpus.

## Why not just unzip it

Hand-unpacking loses every property that matters for a medical corpus:

| Property | Hand-unzip | `intake-archive` |
|---|---|---|
| Is this the archive the sender sent? | unknown | sha256 verified **before** any parse, against a digest supplied independently |
| Did an entry write outside the destination? | possible | `../`, absolute paths, drive letters, backslashes, NUL and symlink entries are **refused by name** |
| Can a zip bomb exhaust the disk? | yes | budgets on entries, per-entry bytes, total bytes, expansion ratio and path depth — enforced on declared **and actual** bytes |
| What happens if it fails half-way? | a partial corpus | nothing lands: every byte stages first, then ONE atomic rename |
| What is in the corpus? | whatever is on disk | `sources/manifest.json` — one row per file, with sha256, size, media type, ingest time and redacted source |
| What was attempted? | nothing recorded | `sources/LOG.jsonl` — one append-only line per attempt, refusals included |
| Ingest the same archive twice? | duplicates | idempotent: no download, no re-extract, one `already-ingested` log line |

## Usage

```bash
# from object storage — --expect-sha256 is MANDATORY and must come from the SENDER, not the URL
node bin/health-advisor.js intake-archive \
  --workspace ~/health/ivan \
  --url https://storage.example/exports/2026-08-17-labs.zip \
  --expect-sha256 3b1f…64hex

# from a file already on this machine — no socket is opened at all
node bin/health-advisor.js intake-archive --workspace ~/health/ivan --file ~/Downloads/labs.zip

# see exactly what would happen — zero network calls, zero writes
node bin/health-advisor.js intake-archive --workspace ~/health/ivan --file ~/Downloads/labs.zip --dry-run

# later: is the corpus still what the catalog says it is?
node bin/health-advisor.js intake-archive --verify --workspace ~/health/ivan
```

Exit codes: `0` committed / already ingested / verify clean · `1` a named refusal or verify drift ·
`2` a usage error. `--json` reports the same code and carries the refusal's identity as `error.code`.

## The canonical layout this command defines

```
<workspace>/
  sources/
    raw/sha256-<64 hex>/…      immutable primary sources, one directory per archive
    manifest.json              the INDEX: one row per ingested file
    LOG.jsonl                  the append-only LOG: one line per attempt
    *.md + *.html              deliverables (the pairing gate still applies OUTSIDE raw/)
  research/ analysis/ doctors/ the other canonical directories
```

`sources/raw/**` is exempt from the `.md` ↔ `.html` pairing gate: raw sources are not deliverables
awaiting a render. Everything else under `sources/` still fails `ha check` closed if unpaired.

## Privacy, stated as a boundary and not as an intention

- Ingested documents **never** reach `~/.dz/brain`, `dz teach`, `dz recall`, or any pattern store.
- The only network call is the single URL you pass. `https:` only; inline credentials refused; redirects
  re-validated at every hop and capped; private/loopback/link-local literal addresses refused.
- A presigned URL's signature never reaches a durable file — one redactor strips userinfo, query and
  fragment before anything is written, and `url_sha256` keeps the source comparable without keeping it.
- A git-tracked workspace whose `sources/` is not ignored gets a **loud, non-suppressible** warning.
- `--workspace` inside the package tree is refused outright.

## What it deliberately does not do

No OCR, no content classification, no transcription, no non-zip formats, no zip64, no encrypted
archives. It moves bytes into a place where they can be trusted and found; understanding them is a
different job, done by other skills against `sources/manifest.json`.
