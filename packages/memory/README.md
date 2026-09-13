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
опенер чтения) — `dz mutation-gate --package packages/@dzhechkov/memory --only <id>` мутирует
названное свойство в scratch-копии и требует, чтобы `npx vitest run test/sqlite-readonly.test.ts
test/sqlite-backend.test.ts` покраснел; форму реестра проверяет
`test/mutation-registry-shape.test.ts`.

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 7).

## Status

`0.2.20` — a signature-only republish; `0.2.11` shipped with a stale manifest. No behaviour changes.

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
