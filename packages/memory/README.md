# @dzhechkov/memory

The harness **memory layer** — records skill outcomes, ranks skills, and imports
host memory files.

## What it provides

| Module | Exports | Purpose |
|---|---|---|
| `backend` | `MemoryBackend`, `MemoryRecord`, `MemoryQuery` | The storage contract |
| `json-backend` | `JsonFileBackend` | The default backend — pure JS, zero-dependency, JSON-file persistence, scored keyword retrieval |
| `cascade` | `selectBackend`, `BackendProbe` | Probe optional backends, fall back gracefully |
| `reflexion` | `Reflexion` | Record skill outcomes (`record(skillId, outcome, score)`); rank skills |
| `bridge` | `MemoryBridge`, `importMemoryMarkdown` | Import a host memory markdown file into `MemoryRecord`s |

## A query that matched nothing returns nothing

Both backends' keyword path used to RANK by term overlap and never EXCLUDE, so every query came back
with the whole store, reordered. MEASURED on two records (`hello world`, `another record`):
`zebrafish` returned both, and so did `hello`, which matches exactly one. With no matches the sort
degenerates into confidence order — which is how it looked like "ranking by confidence".

Now the two situations are separated:

| The query | What comes back |
|---|---|
| has usable terms and matches nothing | nothing |
| has usable terms and matches some records | only those |
| has NO usable terms (punctuation, single characters, no text) | the whole store, ranked by confidence — unchanged, because no filter was expressible |

The filter is `overlap > 0`, never a tuned threshold: a weak match is still a match, and zero overlap
is not a weak match. Both backends take the same rule, so a store's answers never depend on which one
is installed. Note that "matched" is measured over the record's TEXT and its `skillId`.

## Backend strategy

The default `JsonFileBackend` is **pure JavaScript with zero dependencies** — no
native build, no WASM, no model download — so it works everywhere and is fully
testable.

`selectBackend` is the **cascade**: it probes a list of optional backends (a
vector/embedding backend can be registered here later) and falls back to a
guaranteed backend if none is available. Heavier backends (`agentdb`, `sql.js`)
are intentionally *not* hard dependencies — see
`features/extended-a-migration/autonomous-log/decisions.md` (D7.1).

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 7).

## Status

`0.2.19` — a signature-only republish; `0.2.11` shipped with a stale manifest. No behaviour changes.

`0.2.11` — a query that matched nothing returns nothing (see above). `0.2.10` — the lexical tokenizer is Unicode-aware. It split on `[^a-z0-9]+`, so every non-Latin letter
was a separator and a Cyrillic query produced **zero terms**: the FTS5 branch was skipped, relevance
degenerated to a constant for every record, and the confidence tie-break decided the order. MEASURED
2026-08-21 on a 267-record store — RU top-1 **0/10** against EN **10/10**, while 63% of real recall
traffic is Cyrillic. The class is now `[^\p{L}\p{N}]+/u` in both backends, and the one-character
floor counts code points rather than UTF-16 units.

No migration is needed: FTS5's own tokenizer always indexed the text correctly — only the query was
being stripped of its terms on the way out.

**Unchanged on purpose:** a query that yields no terms still returns the store. That behaviour is
pinned by four existing tests which comment it as intended, so it is a contract to be changed by
decision, not folded into an alphabet fix.
