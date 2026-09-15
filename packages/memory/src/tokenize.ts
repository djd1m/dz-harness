/**
 * The shared lexical tokenizer — `sqlite-backend.ts` and `json-backend.ts` both import this
 * instead of carrying their own copy (feature recall-short-terms, FR-1). A forked copy is exactly
 * the class of bug this package has hit twice already: the two backends' tokenizers drifted once
 * before (the Cyrillic-alphabet fix, 2026-08-21) and a reader whose ranking diverges from the
 * writer's silently regresses recall.
 *
 * @packageDocumentation
 */

/**
 * Split text into lowercase word tokens.
 *
 * The class is `\p{L}\p{N}`, not `a-z0-9` — see the 2026-08-21 Cyrillic-alphabet fix: an ASCII-only
 * class made every non-Latin letter a SEPARATOR, so a Cyrillic query produced zero tokens.
 *
 * Until 2026-09-15 a token also had to be MORE THAN ONE code point (`[...token].length > 1`), so a
 * query like `x`, `C`, or Cyrillic `на`'s single-letter cousin `и` produced ZERO usable terms and
 * fell into the "nothing to search by" branch — which used to silently return the WHOLE STORE
 * (backlog 529c31ab, MEASURED: a record whose entire text is `x` was never found by querying `x`,
 * because the query never reached the ranker at all). Single- and two-character alphanumeric
 * entities are real in this domain — `C`, `Go`, `R`, `ID`, `db`, ADR letter variants — so the floor
 * is gone: ANY non-empty run of `\p{L}\p{N}` characters is now a token.
 *
 * This introduces no new noise on its own: each backend's `stemOf` already refuses to stem
 * anything under 5 code points, so a 1-2 character term is only ever matched by EXACT token
 * equality, never a prefix (FR-2) — the widened floor and the no-stemming-below-5 rule are
 * independent decisions that happen to compose safely.
 *
 * Filtering on `token.length > 0` (a JS UTF-16-unit length) rather than counting code points is
 * deliberately fine here, unlike the old `> 1` floor: emptiness does not depend on surrogate
 * pairs — a non-empty string always has `.length >= 1` and an empty one always has `.length === 0`,
 * on BOTH measures. The code-point-vs-UTF-16-unit distinction only mattered for a POSITIVE
 * threshold like the old `> 1` (where a lone astral letter, one code point but two UTF-16 units,
 * could slip past it); it is moot once the floor is simply "not empty".
 *
 * `.normalize('NFC')` runs BEFORE lowercasing (fix-round 1, Codex HIGH-2, MEASURED — not merely
 * argued). Precomposed `café` (4 code points, the `é` is U+00E9) and decomposed `café` (5 code
 * points, `e` + combining acute U+0301) are the SAME text to a reader and to shipping FTS5 — a
 * `better-sqlite3` probe (`node -e` against an in-memory `fts5` table) confirmed both forms and
 * the bare ASCII `cafe` all MATCH each other under FTS5's default `unicode61` tokenizer. Without
 * NFC, this tokenizer disagreed: the combining mark U+0301 is category `\p{M}` (Mark), not
 * `\p{L}`, so it fell into the SEPARATOR class above — decomposed `café` tokenized to `cafe`
 * (accent silently dropped) while precomposed `café` tokenized to the distinct string `café`
 * (accent kept), so the keyword-overlap path treated two representations of ONE word as two
 * DIFFERENT words. NFC first collapses both representations to the single precomposed form
 * before the letter/number split ever runs, so both now tokenize to the identical `café`.
 *
 * **Diacritics are folded for LATIN script only — exactly the shipping engine's rule (Codex r2/r3,
 * lead fix, MEASURED 2026-09-15 with a `better-sqlite3` probe against an in-memory `fts5` table):**
 * FTS5's default `unicode61` tokenizer (`remove_diacritics=1`) strips diacritics from Latin
 * characters (`cafe` MATCHes `café`, `ano` MATCHes `año`) but leaves other scripts alone
 * (`й` does NOT match `и`, `ё` does NOT match `е`). The keyword-overlap path (JSON backend, sqlite
 * with FTS5 off) must answer IDENTICALLY — parity between the two backends of one store is the
 * requirement — so this tokenizer does the same: NFD, strip combining marks that follow a LATIN
 * base letter only, NFC back (so `й` = `и` + U+0306 recomposes and stays a distinct letter). A
 * global `\p{M}` strip (the first lead attempt) would have folded Cyrillic `й`→`и`, `ё`→`е` where
 * FTS5 does not — a divergence in the script that carries 63% of real recall traffic. Named
 * limit, inherited from the engine: Latin words that differ only by an accent (`año`/`ano`,
 * `côté`/`cote`) conflate in BOTH backends, as FTS5 already conflated them.
 * Edge measured (Codex r4): `remove_diacritics=1` leaves Latin letters with TWO combining marks
 * alone (`ộ`, `ố`, `ấ`, `ǘ` — `MATCH 'o'` does not return the `ộ` row), so the fold applies only
 * to a single mark; `remove_diacritics=2` semantics (fold everything) are deliberately NOT used.
 */
export function tokenize(text: string): string[] {
  return text
    // Latin-only diacritic fold = FTS5 unicode61 remove_diacritics=1 (see the doc comment):
    // NFD → drop marks after a Latin base letter → NFC (non-Latin letters recompose untouched).
    .normalize('NFD')
    // Codex r4 (lead, MEASURED 2026-09-15 on fts5 in-memory): remove_diacritics=1 folds a Latin
    // letter carrying ONE mark (é→e, ü→u, ñ→n) but NOT one carrying two (Vietnamese ộ/ố/ấ, ǘ stay
    // distinct) — so only a SINGLE mark after a Latin base is dropped; multi-mark letters recompose.
    .replace(/(\p{Script=Latin})\p{M}(?!\p{M})/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/**
 * Does `text` contain at least one searchable token?
 *
 * FR-3: the "nothing to search by" branch in each backend's keyword path must fire ONLY when this
 * is `false` — i.e. only when tokenization finds literally nothing (pure punctuation, whitespace,
 * or an empty string), never merely because every token happened to be short. That narrower branch
 * used to answer with a silent full-store dump; it no longer does (see each backend's `querySync`),
 * and this function is the one place that decides which queries land in it — named so the decision
 * is discoverable, not reimplemented ad hoc at each call site.
 */
export function hasSearchableTerms(text: string): boolean {
  return tokenize(text).length > 0;
}

/**
 * The named reason a query's keyword-overlap path fell into the "no searchable terms" branch, or
 * `undefined` when it didn't. Fix-round 1 (Codex HIGH-1): both backends used to reimplement the
 * `hasSearchableTerms(text) === false` check as a hand-rolled `terms.length === 0`, and the reason
 * string it corresponds to lived nowhere a caller — including `dz recall`'s CLI printer — could
 * name without re-deriving it. This is the single source of truth for that name: a backend or a
 * printer that wants to know WHY an empty result came back calls this instead of re-tokenizing.
 */
export function noSearchableTermsReason(text: string): 'no-searchable-terms' | undefined {
  return hasSearchableTerms(text) ? undefined : 'no-searchable-terms';
}
