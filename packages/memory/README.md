# @dzhechkov/memory

The harness **memory layer** — records skill outcomes, ranks skills, and imports
host memory files.

## What it provides

| Module | Exports | Purpose |
|---|---|---|
| `backend` | `MemoryBackend`, `MemoryRecord`, `MemoryQuery` | The storage contract |
| `json-backend` | `JsonFileBackend` | The default backend — pure JS, zero-dependency, JSON-file persistence, scored keyword retrieval |
| `cascade` | `selectBackend`, `BackendProbe` | Probe optional backends, fall back gracefully |
| `sqlite-readonly` | `openSqliteReadOnly`, `SqliteReadOnlyStore`, `ReadOnlyHandle`, `ReadOnlyStore`, `OpenReadOnlyOptions` | Read-only SQLite access from directories the process may not write to (in-place → tmp-copy → honest failure) — see "Reading from a read-only directory" below |
| `reflexion` | `Reflexion` | Record skill outcomes (`record(skillId, outcome, score)`); rank skills |
| `bridge` | `MemoryBridge`, `importMemoryMarkdown` | Import a host memory markdown file into `MemoryRecord`s |

## A query that matched nothing returns nothing

Both backends' keyword path used to RANK by term overlap and never EXCLUDE, so every query came back
with the whole store, reordered. MEASURED on two records (`hello world`, `another record`):
`zebrafish` returned both, and so did `hello`, which matches exactly one. With no matches the sort
degenerates into confidence order — which is how it looked like "ranking by confidence".

Now the three situations are separated:

| The query | What comes back |
|---|---|
| has usable terms and matches nothing | nothing |
| has usable terms and matches some records | only those |
| was PROVIDED but tokenizes to NO usable terms (pure punctuation/whitespace/empty) | nothing — a named `no-searchable-terms` reason, not a silent full-store dump (`recall-short-terms`, 2026-09-15; see below) |
| has NO text field at all (`{}` — a browse, not a search) | the whole store, ranked by confidence — unchanged, because nothing was ever expressible to filter on |

The filter is `overlap > 0`, never a tuned threshold: a weak match is still a match, and zero overlap
is not a weak match. Both backends take the same rule, so a store's answers never depend on which one
is installed. Note that "matched" is measured over the record's TEXT and its `skillId`.

## Short terms — `x`, `C`, `Go`, `ID`, `db` are now searchable (`recall-short-terms`, 2026-09-15)

Until 2026-09-15 `tokenize` dropped every token of length <= 1 code point (`memory/src/tokenize.ts`,
shared by both backends since this feature — FR-1). Single- and two-character alphanumeric entities
are real in this domain (`C`, `Go`, `R`, `ID`, `db`, ADR letter variants), so a record whose entire
text is `x` was never found by querying `x`: the query tokenized to zero terms and fell into the
"nothing to search by" branch, which used to dump the whole store instead of the specific match
(backlog 529c31ab, MEASURED by Codex 2026-08-22).

The floor is gone: any non-empty run of `\p{L}\p{N}` characters is a token now, matched **only by
exact equality** — never a prefix or stem (`stemOf`, in each backend, already refuses anything under
5 code points, so this was already the rule for 1-2 char terms; recall-short-terms only widens which
terms REACH that rule). `Go concurrency` finds a record about Go, not one about "going".

`tokenize.ts` also exports `hasSearchableTerms(text)` — the single place that decides whether a query
falls into the "no-searchable-terms" branch above — and `noSearchableTermsReason(text)`, which returns
the literal `'no-searchable-terms'` string or `undefined`. Both backends call `hasSearchableTerms`
directly for the branch decision now (fix-round 1, Codex HIGH-1) rather than reimplementing it as
`terms.length === 0`; `dz recall`'s CLI printer calls `noSearchableTermsReason` (re-exported from
`@dzhechkov/harness-core`) so the reason it prints — `no searchable terms in "<query>" (only
punctuation/whitespace) — reason: no-searchable-terms` — can never drift from what the backends
actually decided.

**No stop-list, by design.** Every alphanumeric token is searchable, including one-letter ones —
`a`, `i`, `и`, `в` all count. A one-letter query can legitimately match every record that contains
that letter as a standalone token; the caller's own `limit` bounds the flood, this package does not
maintain a stop-list to pre-filter it (measured: 50 records each containing token `a`, query `a`,
`limit: 5` → exactly 5 hits, in both backends — `test/short-terms.test.ts`).

**Shipping FTS5 (fix-round 1, Codex HIGH-2/MEDIUM-5).** `test/short-terms.test.ts`'s twins corpus
now runs BOTH with FTS5 forced off (the keyword-overlap CONTROL — both backends run the identical
algorithm, so any divergence can only be the shared tokenizer) and with FTS5 left ON, the shipping
default. The FTS5-on comparison checks the MATCHED SET, not ranking order: FTS5's bm25 and the
keyword path's hit-count relevance are different algorithms and may legitimately tie-break ties
differently even when they agree on which records qualify. Separately, single-character Cyrillic,
CJK, and astral-plane terms are each planted and then FOUND via shipping FTS5 — proving they are
reachable, not merely that an absent one returns empty (which `tokenize-unicode.test.ts`'s A7
already covered).

`tokenize()` also `.normalize('NFC')`s before splitting (fix-round 1, HIGH-2, MEASURED via a
`better-sqlite3` probe against an in-memory FTS5 table): precomposed `café` (`é` = U+00E9) and
decomposed `café` (`e` + combining acute U+0301) are the same word to a reader and to shipping
FTS5's own tokenizer, which already matched both forms (and even bare `cafe`) to each other. Without
NFC, this tokenizer disagreed with itself across representations — the combining mark falls in the
SEPARATOR class, so decomposed `café` tokenized to `cafe` (accent silently dropped) while
precomposed `café` tokenized to the distinct string `café`. NFC-normalizing first fixes that
representation bug: both forms now tokenize to the identical `café`.

**Diacritics are FOLDED, in both backends (Codex r2, lead fix).** Shipping FTS5's default `unicode61` tokenizer strips diacritics (`remove_diacritics=1`): a MATCH for plain `cafe` finds a row stored as `café`. The keyword-overlap path (JSON backend, or sqlite with FTS5 off) used to keep `café` and `cafe` as two tokens — an exact-parity violation between the two backends of one store. `tokenize()` therefore folds diacritics the way `unicode61` does — for LATIN script only (NFD, drop combining marks after a Latin base letter, NFC back), so both paths answer alike (tested in both backends: `cafe`/`café`/decomposed `café` and `ano`/`año` fold; Cyrillic `й`≠`и`, `ё`≠`е` do NOT — MEASURED against FTS5, which keeps them distinct; and a Latin letter carrying TWO marks — `ộ`, `ǘ` — is NOT folded either, exactly as `remove_diacritics=1` leaves it, measured: `MATCH 'o'` does not return the `ộ` row). **Named limit, inherited from the shipping engine:** words that differ only by an accent (`año`/`ano`, `côté`/`cote`) conflate — exactly as FTS5 already conflated them; parity was chosen over a narrower keyword rule.

## Backend strategy

The default `JsonFileBackend` is **pure JavaScript with zero dependencies** — no
native build, no WASM, no model download — so it works everywhere and is fully
testable.

`selectBackend` is the **cascade**: it probes a list of optional backends (a
vector/embedding backend can be registered here later) and falls back to a
guaranteed backend if none is available. Heavier backends (`agentdb`, `sql.js`)
are intentionally *not* hard dependencies — see
`features/extended-a-migration/autonomous-log/decisions.md` (D7.1).

## Reading from a read-only directory (ADR-001, `store-readonly-reads`)

`{ readonly: true }` alone does **not** read a WAL-mode SQLite database from a directory the
process cannot write to: a WAL reader still needs to create (or find) `-shm`/`-wal` next to the
file, and on a read-only-mounted directory that fails with `unable to open database file`
(measured against better-sqlite3 11.10.0 / SQLite 3.49.2 on a `chattr +i` directory). `openSqliteReadOnly(filePath, opts?)` climbs a three-step ladder instead of assuming step 1 always
works:

1. **In place.** `{ readonly: true, fileMustExist: true }`, then a real read — the WAL error
   surfaces on the first *query*, not on open. Succeeds when a live writer already left
   `-shm`/`-wal` behind, or the directory is writable (note: opening a WAL database whose
   `-wal`/`-shm` were already cleaned up, in a *writable* directory, legitimately (re)creates them
   here — that is SQLite's own WAL mechanics, not a DDL call this package makes).
2. **Copy.** Only on `SQLITE_CANTOPEN` / "unable to open database file": copies the database
   (+ its `-wal`, if present — **never** `-shm`, which is derived and SQLite recreates it) into a
   fresh `mkdtemp` directory and opens *that* read-only.
3. **Honest failure.** Any other error, or step 2 itself failing, throws — naming both the file
   path and the original cause. Never a swallowed empty result.

`SqliteBackend.openReadOnly(filePath, opts?)` builds on this: it returns a `ReadOnlyStore`
(`querySync`/`allSync`/`countSync`/`close`) that shares the writer's exact ranking logic
(`searchPreparedRecords`) but runs **no** `INIT_SQL`, **no** `FTS5_SQL`, and no FTS rebuild — FTS5
presence is discovered by reading `sqlite_master`, never by (re)creating the table. `put`/
`putMany`/`remove`/`removeSync` on a `ReadOnlyStore` throw `read-only backend: <method> is not
available` rather than silently no-op. `close()` closes the underlying connection and then removes
a step-2 temporary copy, if one was made.

**A limit, named honestly:** step 2's copy can race a *concurrent* writer on the same host — a
copy taken mid-transaction is a torn read. The result is an open/read error naming the cause, not
silent zeros; retrying the read is the cure. Measured frequency: n=0 (the write window is
milliseconds); this is a named risk, not a dismissed one.

**A second limit, named honestly (fix round 1, LOW #7):** on a store whose `memory_fts` table is
missing, the writer creates/rebuilds FTS5 on open while the read-only store only checks
`sqlite_master` and falls back to keyword search — so search results and ranking can differ between
the two on that specific old/incomplete schema; not fixed here, a named limit.

**Реестр мутаций:** этот пакет несёт собственный `test/mutation-registry.json` (ADR-001 C-1…C-3 —
опенер чтения; `short-terms-searchable` — AC-4, `recall-short-terms`, 2026-09-15, единый токенизатор
в `src/tokenize.ts`) — `dz mutation-gate --package packages/@dzhechkov/memory --only <id>` мутирует
названное свойство в scratch-копии и требует, чтобы `npx vitest run test/sqlite-readonly.test.ts
test/sqlite-backend.test.ts test/short-terms.test.ts` покраснел; форму реестра проверяет
`test/mutation-registry-shape.test.ts`.

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 7).

## Status

`0.2.23` — ONE shared `tokenize()` (`src/tokenize.ts`) for both backends: no length floor (one-character terms are searchable), Latin-only diacritic folding measured against FTS5 `unicode61 remove_diacritics=1` (one combining mark folds; two marks, Cyrillic `й`/`ё` do not), `hasSearchableTerms` / `noSearchableTermsReason` exported, a query that tokenizes to nothing returns `[]` (feature recall-short-terms, 2026-09-15; `@dzhechkov/harness-core` ≥ 0.8.35 re-exports the reason helper).

`0.2.21` — ships `openSqliteReadOnly` (read-only opener ladder: in-place → tmp copy → honest error; feature store-readonly-reads, 2026-09-12) — the export `@dzhechkov/harness-core` ≥ 0.8.31 imports; `0.2.19` was a signature-only republish; `0.2.11` shipped with a stale manifest.

`0.2.11` — a query that matched nothing returns nothing (see above). `0.2.10` — the lexical tokenizer is Unicode-aware. It split on `[^a-z0-9]+`, so every non-Latin letter
was a separator and a Cyrillic query produced **zero terms**: the FTS5 branch was skipped, relevance
degenerated to a constant for every record, and the confidence tie-break decided the order. MEASURED
2026-08-21 on a 267-record store — RU top-1 **0/10** against EN **10/10**, while 63% of real recall
traffic is Cyrillic. The class is now `[^\p{L}\p{N}]+/u` in both backends, and the one-character
floor counts code points rather than UTF-16 units.

No migration is needed: FTS5's own tokenizer always indexed the text correctly — only the query was
being stripped of its terms on the way out.

**Left unchanged HERE, on purpose:** at the time of this fix, a query that yielded no terms still
returned the store — a contract deliberately NOT folded into this alphabet-only fix, pinned by four
existing tests that commented it as intended. That contract was narrowed by a LATER, SEPARATE
decision — `recall-short-terms` (2026-09-15, see above): the one-character floor was removed, and a
PROVIDED query that still yields zero terms (pure punctuation) now returns empty, not the store. A
query with no text field at all still returns the store — that half of the old contract survives.
