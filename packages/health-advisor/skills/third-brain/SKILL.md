---
name: third-brain
description: File a FULL analytical document (consultation write-up, trend analysis, consilium synthesis, conclusion) into the workspace's SEGREGATED .health-brain store so it is searchable by its own words, with verified backlinks to the intake manifest. Use after producing an analysis the case will need again. NEVER put patient documents into the shared dz brain.
---

# third-brain

The **Query** half of the Karpathy ingest cycle, for a patient case: an analysis you wrote today
becomes something the case can find in six months by half-remembering a sentence from it.

`ha intake-archive` files PRIMARY sources (`sources/manifest.json` + the immutable raw zone).
`ha third-brain` files the ANALYSES written about them — and links each one back to the primary bytes
it was written about, verified, not merely recorded.

## The one rule that outranks every convenience here

**Patient documents go into `<workspace>/.health-brain`, never into the shared `dz` store.**

This is not enforced by remembering it. Every write goes through
`base/skills/base/goap-research-ed25519/scripts/learning_bridge.py`'s existing four-check gate —
realpath distinctness (including containment: a brain that resolves INSIDE the shared `.dz` store is
refused on the first ingest — fix round 1, QE F1), brain protection, a pre-flight canary that proves
the write LANDS where it was aimed, and a before/after count that fails closed when it cannot be
read. That gate took nine review rounds plus one QE fix round to reach its current shape; this
feature extends it with one new verb and forks nothing. Honest limit, stated: the canary and the
count prove the OUTCOME for the run they are part of — the alias shapes the gate refuses by name are
the ones review has produced so far, and QE's F1 is the standing reminder that the next shape is
found by running, not by trusting the list.

Concurrent ingests into one workspace are SERIALISED under the workspace ingest lock
(`.health-brain/.ingest-lock/`, fix round 1, QE F2) — a waiter that outlives
`DZ_STORE_LOCK_TIMEOUT_MS` refuses by name instead of mis-verifying its write. The count check reads
one test-reserved seam, `HEALTH_BRAIN_COUNT_STUB` (ADR-001 D-3): it can distort VERIFICATION ONLY,
never redirect a write, and must stay unset outside the test suite.

`rm -rf <workspace>/.health-brain` removes every trace. Nothing is ever sent anywhere: the engine
imports no network-capable module, and a test walks the whole directory asserting it.

## Usage

```bash
# file an analysis, citing two primary documents it was written about
node bin/health-advisor.js third-brain ingest analysis/2026-08-18-lipids.md \
  --case ivanov-2026 --kind consultation --date 2026-08-18 \
  --anchor 3f2a1c4d5e6b7a8c --anchor 9d8c7b6a5f4e3d2c \
  --workspace ~/cases/ivanov --json

# find it later by a phrase from its BODY, not from its title
node bin/health-advisor.js third-brain search "миопатия статин фибрат" --workspace ~/cases/ivanov

# walk back from a hit to the primary bytes, verifying every sha256 on the way
node bin/health-advisor.js third-brain backlinks 48fee0a743dee7f7 --workspace ~/cases/ivanov
```

## What it does, exactly

1. **Chunks** the document into paragraph-aligned passages under a 1200-character budget
   (`ADR-002`), losslessly — the concatenation of the passages IS the document.
2. **Stamps and resolves** every `--anchor <entry_id>` through the shipped
   `lib/source-anchor-store.js` pair. One bad anchor aborts the WHOLE ingest: a partial batch would
   file a document claiming citations it does not have.
3. **Writes** one record per passage, each carrying a parseable `ha-doc-1` header line
   (`doc_id`, `case`, `kind`, `date`, `chunk=n/m`, `doc_sha256`, `doc_path`, `anchors`) followed by
   the passage verbatim. The metadata rides the record TEXT because the store's `type` field is a
   closed three-value union that would silently coerce anything else.
4. **Appends** one line to `<workspace>/.health-brain/LOG.jsonl` per attempt, refusals included —
   with no document text in it.

## Refusals — a closed set of seven

`third_brain_not_segregated` · `third_brain_shared_store_targeted` ·
`third_brain_document_outside_workspace` · `third_brain_anchor_unresolvable` ·
`third_brain_write_unverified` · `third_brain_dz_unavailable` · `third_brain_payload_escape`

An absent `dz` is a **hard failure** here, deliberately diverging from the bridge's NOTE posture for
optional lesson-learning: an operator who ran `ingest` believes the document was filed.

A budget breach (document over 10 MiB, more than 256 anchors) is `third_brain_payload_escape` with
the breached limit named in the message — the taxonomy stays closed at seven rather than growing one
member per future limit.

## What it deliberately does NOT do

No reconciliation when a document changes (re-ingest mints new records under a new `doc_sha256` and
leaves the old ones); no orphan/contradiction lint; no cross-case search; no summarisation; no UI.
Re-ingesting an UNCHANGED document is a no-op that reports `written: 0` and exits `0`.

## Not installed standalone

`skills/third-brain/` is deliberately absent from `EXTENDED_SKILLS`: the engine requires
`lib/source-anchor-store.js`, and `installFlat` copies a skill directory without `lib/`. A registered
third-brain would be a broken require, so the omission is pinned by a test rather than a comment.
