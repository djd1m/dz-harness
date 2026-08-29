---
name: book-kb-index
description: >
  Stage 5 of the book digitizer (supporting): load verified Knowledge Units into the memory layer —
  the lexical books.sqlite namespace (dz recall --books) AND the shared agentdb vector index
  (agentdb_pattern_search), so book know-how is recallable lexically and semantically across all
  digitized books. Upsert by (book, ku_id, corpus_version), never append-only. Triggers on:
  "index the book KB", "book-kb-index", "load KUs into memory". Invoked by `digitize-book`.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# book-kb-index — KUs → the searchable Knowledge Base

The layer BEHIND the distilled skills: when a skill says «см. источник, гл.5», or when you want to
recall book knowledge that never became a standalone skill, this is what answers. Two stores, one
purpose.

## When to use / NOT

- **Use** as stage 5 of `digitize-book`, to load verified KUs into the searchable memory layer.
- **NOT** to extract or verify KUs (that's `book-knowledge-extract`) — this stage only indexes them into the two stores.

## Prerequisites

- Verified KUs from `book-knowledge-extract`.
- `agentdb` + `better-sqlite3` in the project (`dz setup --memory agentdb`) for both stores.

## The two stores (why two)

| Store | Backend | Recall | Reached via |
|-------|---------|--------|-------------|
| **Lexical** | `.dz/memory/books.sqlite` (FTS5) | keyword | `dz recall --books` |
| **Semantic** | shared `.dz/agentdb.db` (vector) | similarity | `agentdb_pattern_search` |

The lexical store is a **separate namespace by construction** — `computePatternBoost` (the
`dz recommend` reward loop) never sees book KUs, and they never expire under default retention.

**Lexical matching (FTS5, know its limits):** `books.sqlite` now does **prefix** matching
(AND-of-terms) — morphology-tolerant, so `репликаци` matches `репликация`/`репликации`. But it has
**no stemming and no synonymy**, and it is single-language. So route **cross-lingual, fuzzy, or
semantic** queries through the VECTOR store (agentdb, multilingual embeddings) via
`agentdb_pattern_search` — lexical prefix-AND is for exact-ish keyword recall only.

## Protocol

1. **Idempotent upsert** — for each verified KU, write to BOTH stores keyed on
   `(book, ku_id, corpus_version)`. A re-ingest bumps `corpus_version`; indexing then **evicts**
   the book's rows from any stale corpus_version before inserting (upsert, never append) — so the
   KB mirrors exactly the current ingest and re-runs don't duplicate.
   - Lexical: `putBookKnowledge(projectRoot, kus)` (harness-core) — FTS5 over name/problem/content.
   - Semantic: `indexPatternsToAgentdb(projectRoot, rows)` (harness-core) — native better-sqlite3
     insert into ReasoningBank's schema (agentdb only for embeddings; never its sql.js
     `createDatabase`). This primitive is **INSERT-only**, so to stay idempotent the skill FIRST
     deletes this book's rows from a stale corpus_version (a better-sqlite3
     `DELETE FROM reasoning_patterns WHERE tags LIKE '%"'||<slug>||'"%' AND metadata NOT LIKE
     '%'||<corpus_version>||'%'` — mirror the lexical store's eviction) BEFORE calling it. Map each
     KU → `{ taskType: 'book-knowledge', text: \`${name}: ${problem}\`, score: <documented
     confidence, NOT a fabricated 1.0>, tags: ['book', <slug>, type], metadata: { isbn, chapter,
     pages, ku_id, corpus_version } }`. (The lexical `putBookKnowledge` upserts automatically.)
2. **Honest score** — `score` = the KU's extraction/verify confidence (documented mapping), never a
   fake 1.0 (the pollution lesson from the session-hook telemetry).
3. **Mark** each KU's `watermark.indexed = true` in the manifest (resume skips it next run).
4. **Verify recall** — a lexical probe (`dz recall --books "<a KU name>"`) and, if the MCP server is
   up, a semantic probe (`agentdb_pattern_search`) return the KU with its page provenance.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Append-only indexing | re-ingest duplicates KUs | lexical auto-upserts; for the vector store, DELETE stale-corpus rows before insert |
| Book KUs in the pattern store | pollutes `dz recommend` boost | separate books.sqlite namespace |
| Fabricated score 1.0 | biases vector ranking | honest extraction confidence |
| Using agentdb's createDatabase to write | sql.js corrupts the shared DB | native better-sqlite3 insert |

## Self-check

- [ ] Both stores written; keyed on (book, ku_id, corpus_version)?
- [ ] Lexical upserted; vector stale-corpus rows explicitly deleted before insert (no dup vectors)?
- [ ] Scores honest; book KUs excluded from `computePatternBoost`?
- [ ] `watermark.indexed` set; recall probe returns KU + provenance?

## Examples

- «Index the DDIA KUs» → 180 KUs → lexical + vector; `dz recall --books "репликация"` returns them.
- «Найди в книге про кворумы» → `agentdb_pattern_search` surfaces the quorum KU with gл.5 pages.
