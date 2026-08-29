---
name: book-knowledge-extract
description: >
  Stage 2 of the book digitizer: map-reduce the ingested corpus into page-anchored Knowledge Units
  (methodologies, decision-frameworks, formulas, heuristics, checklists, tradeoff-tables,
  case-patterns, definitions), then dedup/merge and run a KU-VERIFY entailment pass so only
  KUs actually supported by their cited pages proceed. Enforces the FACTS-verbatim /
  PROSE-paraphrase fidelity regime. Triggers on: "extract knowledge from the corpus",
  "book-knowledge-extract", "harvest KUs". Invoked by `digitize-book`.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# book-knowledge-extract — corpus → verified Knowledge Units

Turn structured text into **actionable know-how**, page-anchored and verified. This is where the
book's expertise becomes machine-usable — and where the IP and honesty rules bite.

## When to use / NOT

- **Use** as stage 2 of `digitize-book`, after `book-ingest` produced a manifest + corpus.
- **NOT** to author skills (that's `book-skill-distill`) or to structure text (that's ingest) — this stage produces verified Knowledge Units only.

## Prerequisites

A manifest + corpus from `book-ingest`. Reuse `knowledge-extractor`'s quality-gate discipline by
reference (`Read` its SKILL.md) — do not restate it; ADD only the book-specific gates below.

## The Knowledge Unit schema (the shared contract for the whole pipeline)

```yaml
id: <book>-<chunk>-<seq>       # GLOBALLY UNIQUE: <chunk> MUST discriminate the chunk (e.g.
                               # ch05-p187), not just the chapter — a chapter split across chunks
                               # would otherwise collide (ch09-ku01 from two chunks) and the KB
                               # upsert-by-id silently drops the duplicates. Include the chunk's
                               # start page: `<book>-ch<NN>-p<startpage>-ku<NN>`.
type: methodology | decision-framework | formula | heuristic | checklist |
      tradeoff-table | case-pattern | definition
name: "Выбор топологии репликации"
problem: when/why this knowledge applies (the decision or task it serves)
content: the paraphrased procedure / framework / restructured table / verbatim formula
applicability: preconditions, scale ranges, contexts where it holds
limits: tradeoffs, failure modes, when NOT to apply
sources: [{ isbn, title, chapter, pages: [169, 214], unit_title? }]   # LIST (survives merges)
aliases: []                   # ids merged into this KU at reduce
skill_worthiness: high | medium | low        # HINT — reduce re-scores with global view
verified: true | false | partial              # set by the KU-verify pass; distill needs true
```

## Protocol

### Map — one agent per chunk (parallelizable, resumable)

For each chunk whose `watermark.extracted == false`: read `corpus/<chunk>.md`, emit KUs in the
schema. **Idempotency**: `<seq>` is assigned only within one complete chunk run — write to a temp
file, then atomically rename + set `watermark.extracted = true` together; on retry, delete partial
output first. A changed `source_hash` invalidates that chunk's watermark AND all downstream
phase watermarks. **Id uniqueness (live-run bug):** because `<seq>` restarts per chunk, the
`<chunk>` segment MUST carry a chunk discriminator (its start page) so ids stay globally unique —
otherwise a chapter split into N chunks emits N × `ku01` and the KB's upsert-by-id keeps only the
last (a 116-KU extraction collapsed to 97 rows before this fix).

**Fidelity regime (the IP contract — non-negotiable):**
- **OUTPUT LANGUAGE (pin it — one language per book):** the book's language by default — detect from
  the corpus (Cyrillic-dominant → Russian, Latin → English) — OR an explicit `--lang <code>` override
  the orchestrator passes. ALL KU fields (`name`, `problem`, `content`, `applicability`, `limits`)
  must be in that ONE language — **never mix**. Rationale: a consistent language is required for
  lexical recall (`dz recall --books`) and for coherent distilled skills; a Russian book digitized
  into English KUs breaks RU search and reads incoherently.
- **FACTS** (formulas, numeric thresholds, table DATA, algorithm names, code): preserved
  **verbatim** with a page anchor. A `formula` KU's `content` must byte-match the source
  expression — UNLESS the chunk flags the page `math_dense` (mangled), in which case the KU may
  only POINT («формула на с. X, см. источник»), never reproduce a mangled formula.
- **PROSE** (explanations, narrative): **paraphrased** — no verbatim run ≥ 8–10 words outside a
  cited quote (quotes ≤ ~25 words each, with an immediate page citation). **If the skills are
  authored in a DIFFERENT language than the source** (e.g. RU book → EN skills), n-gram checking is
  insufficient — run a sampled LLM-judge paraphrase audit and gate on it.
- **TABLES**: RESTRUCTURED, never transcribed — re-derive axes from the decision the KU serves,
  reword cells, reorder/filter rows, cite «по мотивам табл. X, гл. Y, с. Z».
- Every KU accounts for the chunk's inventoried figures/tables — reconstruct (mermaid/markdown) or
  emit `not_captured`. The coverage report counts capture rate, not just chunks.

### Reduce — single-threaded, after a barrier on all map watermarks

1. **Blocking** — embed every KU (via `book-kb-index`'s embedding path) and cluster by cosine
   similarity within the same `type` (deterministic, near-free).
2. **Adjudication** — one small LLM call per above-threshold cluster: merge / link / keep-separate.
   Merged KUs get a new id + `aliases` for the constituents (no dangling references); `sources`
   accumulates. Cross-links between related KUs are recorded (distill uses them for "Related
   decisions").
3. Re-score `skill_worthiness` with the coverage report in view (map scores were hints).

### KU-verify — the provenance gate (adversarial-verifier pattern)

A fresh checker agent re-opens each KU's cited page range in the corpus (the `[p.N]` anchors make
this a cheap lookup) and scores entailment: *is this KU actually supported by these pages?* Set
`verified: true|false|partial`. **Verify ALL KUs — do not sample** (lookup ≪ generation cost).
Only `verified` KUs proceed to distill. This is what stops hallucinated page anchors.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Paraphrasing a formula/threshold | corrupts the highest-value content | FACTS verbatim + anchor |
| Transcribing a book table | IP + it mirrors the book's framing | restructure around the decision |
| Sampling KU-verify | hallucinated anchors slip through | verify all — it's cheap |
| Extracting raw summary instead of know-how | RAG, not behavior | KUs are decisions/procedures |
| Reproducing a formula from a `math_dense` page | pdftotext mangled it | point + cite, or vision-verify |
| Mixed-language KUs from a single book | breaks lexical recall — half the corpus is unsearchable | pin the language (book default or `--lang`) |

## Self-check

- [ ] Every KU page-anchored to a real `[p.N]` in the corpus?
- [ ] FACTS verbatim, PROSE paraphrased, TABLES restructured — regime respected?
- [ ] Figures/tables accounted for (reconstructed or `not_captured`)?
- [ ] Reduce merged duplicates with `aliases`; `skill_worthiness` re-scored globally?
- [ ] KU-verify run on ALL KUs; only `verified` proceed?

## Examples

- «Extract chapter 5» → KUs like `ddia-ch05-ku03` (decision-framework «Выбор топологии
  репликации», pp.169–214, verified).
- «Почему этот KU не попал в дистилляцию?» → `verified: false` — the cited pages didn't support it.
