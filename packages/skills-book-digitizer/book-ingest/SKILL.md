---
name: book-ingest
description: >
  Stage 1 of the book digitizer: turn a book PDF into a chunked, page-anchored corpus + a
  manifest, DETERMINISTICALLY (Poppler bookmarks + text fallback, no LLM). Token-budget chunker, per-page
  quality matrix (empty/low-coherence/math-dense/two-column), figure/table inventory,
  front-matter listed-not-skipped, deterministic corpus_version + per-chunk source_hash and
  watermarks. Triggers on: "ingest this book", "book-ingest", "разбей книгу на главы",
  "prepare book corpus". Usually invoked by `digitize-book`, not directly.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# book-ingest — PDF → corpus + manifest (deterministic)

The reproducible foundation of the pipeline: everything downstream trusts the manifest. **No LLM
here** — a book must ingest the same way every time, or resume and idempotency break.

## When to use / NOT

- **Use** as the first stage of `digitize-book`, or standalone to inspect a book's structure.
- **NOT** for extracting knowledge (that's `book-knowledge-extract`) — ingest only structures text.

## Prerequisites

```bash
pdftotext -v && pdfinfo -v && pdftohtml -v   # poppler-utils; on Debian/Ubuntu: apt-get install poppler-utils
```

## Protocol

Run the bundled deterministic script (resolve `scripts/` relative to this `SKILL.md`):

```bash
node <book-ingest-skill-dir>/scripts/book-ingest.mjs <book.pdf> --out <workspace> \
     --book <slug> --isbn <isbn> [--max-chunk-tokens 70000]
```

What it produces:

- `<workspace>/corpus/<chunk-id>-<sha256>.md` — each chunk's text with **`[p.N]` page anchors** before
  every page (the anchors are what make provenance verifiable downstream).
- `<workspace>/manifest.json` — the contract for the whole run:

```jsonc
{
  "book": { "slug", "isbn", "title", "pages", "source_file", "source_sha256" },
  "structure_type": "chaptered | monolithic",  // "collection" (papers) is a planned enhancement
  "corpus_version": "<hash of PDF snapshot, chunk results + extraction profile>",   // bumps on any re-ingest
  "chapters": [{ "num", "title", "pages": [a, b] }],
  "front_matter": [{ "page", "reason": "empty-text | pre-first-chapter" }],  // also covered by 000-prefixed chunks
  "ingested_settings": { "structure_detection": { "policy", "source", "result", "producer_version", "warning_counts" } },
  "chunks": [{
    "id", "file", "parent_chapter", "pages": [a, b], "token_estimate",
    "figure_table_mentions", "page_flags": { "<page>": ["math_dense", "two_column"] },
    "source_hash": "<sha of chunk text>",
    "watermark": { "extracted": false, "reduced": false, "indexed": false }
  }],
  "page_quality_summary": { "flag_counts", "total_figure_table_mentions" },
  "phase_state": { "extracted": 0, "reduced": false, "distilled": false, "packed": false }
}
```

Key design points (all in the script, ADR-001 v2):

- **Token-budget chunker**, not chapter=unit: a chapter over `max-chunk-tokens` splits at
  sub-headings → page windows, so every chunk is agent-sized. `parent_chapter` links split chunks.
- **Per-page quality matrix**: `empty` (cover/blank → OCR candidate), `low_coherence` (garbled),
  `math_dense` (formula-heavy → the extract stage must quarantine, not reproduce, mangled formulas),
  `two_column` (layout divergence). Flags are advisory signals surfaced at CP1 — nothing silent.
- **Figure/table inventory**: counts «Рис. N.M» / «Таблица N.M» / «Figure/Table» *mentions* (text
  regex) per chunk, so the extract coverage report can flag uncaptured visuals. (`pdfimages` is an
  optional deeper check, not required by the current script.)
- **Front matter is chunked separately** under `000` identifiers and listed in `front_matter`. Every extracted physical page has one `[p.N]` anchor.
- **Structure detection** prefers usable top-level PDF bookmarks as physical page boundaries, including when printed page labels differ. Equal starts keep the first title; nested entries never become chapter boundaries. With no usable outline, a failed optional `pdftohtml`, or a page-count mismatch, the script uses its text-heading heuristic and records a stable fallback reason in `ingested_settings.structure_detection`. Check that profile and the chapter ranges at CP1.
- **Determinism**: the full `book.source_sha256` identifies the private PDF snapshot used by every Poppler call. `corpus_version` also includes chunk results, settings and Poppler version. The same PDF, settings, tools and selected extraction outcome/profile yield byte-identical manifest and chunks.

**Re-ingest and recovery.** Read chunk paths from `manifest.chunks[].file`; filenames include content SHA-256 and can change after a new revision. Ingest holds one exclusive writer lock, stages all chunks, journals the transition, then atomically replaces `manifest.json`. After a successful rerun it removes only old manifest-owned chunks no longer referenced. A failure before manifest replacement leaves the old corpus active. A failure after replacement reports that the new revision is active and cleanup is incomplete; rerun to recover from the journal. A killed process leaves `.book-ingest.lock`; confirm the owner process has stopped, then remove that lock manually and rerun. Never remove a live writer's lock. The guarantee covers completed ingest and process recovery on a trusted local filesystem; concurrent readers during replacement and power loss are outside this contract.

Then relay the manifest summary to the user for **CP1** (structure_type, chapter count, chunk
count, front-matter pages, quality flags, figure/table total, and the token-cost estimate).

## OCR / bad-layout fallback (when quality flags are heavy)

- Many `empty` pages on a scanned book → run `tesseract` per page image (`pdftoppm` → PNG) and
  re-ingest from the OCR text; mark those pages' KUs `ocr: true`.
- Many `math_dense` pages → those chunks carry the flag; the extract stage MUST quarantine
  formulas from mangled text (cite «формула на с. X, см. источник») rather than reproduce them.
  Better path (enhancement): render flagged pages via `pdftoppm` + a vision model, set
  `formula_verified: true` only when transcribed from the page image.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Hand-editing the corpus/manifest | breaks corpus_version → resume + idempotency | re-run ingest |
| Using an LLM to chunk | non-deterministic → duplicate/re-pointed KUs on resume | the script is deterministic |
| Trusting `math_dense` chunk text for formulas | pdftotext mangles math | quarantine + cite / vision fallback |
| Silently dropping front matter | violates no-silent-caps | it's listed for CP1 |

## Self-check

- [ ] `pdftotext`/`pdfinfo` present; PDF not encrypted?
- [ ] manifest chapter page-ranges look right (spot-check 2 chapters vs the book)?
- [ ] corpus_version stable on a re-run (determinism)?
- [ ] Heavy quality flags triaged (OCR / formula policy) before extraction?

## Examples

- «book-ingest ddia.pdf» → 640 p. → 12 chapters, ~19 chunks (oversized chapters auto-split), 24 front-matter pages in separate chunks.
- «Почему пропущены страницы 1–24?» → they're `front_matter` in the manifest and 000-prefixed chunks with physical page anchors.
