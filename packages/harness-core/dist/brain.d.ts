/**
 * Knowledge Brain (ADR-001 `features/book-brain`, Phase P0) — the durable, cross-project home that
 * accretes digitized-book Knowledge Units from many projects into ONE shared, queryable brain.
 *
 * **Reuse-first by design (P0's whole point):** this module does NOT reimplement storage. It
 * repoints the already-shipped primitives at a global brain home:
 * - lexical mirror + idempotent upsert → {@link putBookKnowledge} (`dbPath` = brain books.sqlite)
 * - lexical cross-source query           → {@link queryBookKnowledge} (`dbPath` = brain books.sqlite)
 * - vector re-embed + index              → {@link indexPatternsToAgentdb} (`dbPath` = brain agentdb.db)
 *
 * All functions are pure/best-effort: they never throw uncontrolled and return honest `error`
 * strings when a store is absent or a dependency cannot be resolved. `addedTs` is passed IN by the
 * caller — core stays clock-free and deterministic-friendly.
 *
 * @packageDocumentation
 */
import { type BookKU, type BookKUHit } from './book-kb.js';
/** The durable, cross-project brain home. `DZ_BRAIN_HOME` overrides `~/.dz/brain`. */
export declare function brainHome(): string;
/** Lexical (FTS5) store for the whole brain — all sources, source-tagged. */
export declare function brainBooksPath(home: string): string;
/** Vector (ReasoningBank schema + HNSW) store for the whole brain — all sources, source-tagged. */
export declare function brainAgentdbPath(home: string): string;
/** Registry manifest — every ingested source with metadata. */
export declare function brainRegistryPath(home: string): string;
/** One registered source in the brain (a book, repo, or paper). */
export interface BrainSource {
    readonly slug: string;
    readonly kind: 'book' | 'repo' | 'paper';
    readonly kuCount: number;
    readonly corpusVersion?: string;
    readonly lang?: string;
    readonly isbn?: string;
    /** SPDX-ish license id — carried for repo sources (§8: refuse promoting unknown-license repos). */
    readonly license?: string;
    /** Relative path (from the brain home) to this source's capability card, e.g. `primers/<slug>.md`. */
    readonly primer?: string;
    readonly addedTs: string;
}
/** The brain registry — the durable list of everything ingested. */
export interface BrainRegistry {
    readonly version: 1;
    readonly sources: Record<string, BrainSource>;
}
/**
 * Read the registry from `brain.json`. Returns the empty default if the file is absent or corrupt
 * — never throws (a corrupt/half-written registry must not brick the brain).
 */
export declare function readRegistry(home: string): BrainRegistry;
/**
 * Write the registry to `brain.json`, creating the brain home if absent. **Atomic + best-effort:**
 * writes to a sibling `brain.json.tmp` then `rename()`s it over the final path (atomic on POSIX), so
 * a crash mid-write can never leave a TORN `brain.json` — which `readRegistry` would silently read as
 * the EMPTY default, and the next merge-write would then drop ALL prior sources (registry drift from
 * the SQLite stores that still hold them). Never throws: a registry write must not brick the brain.
 */
export declare function writeRegistry(home: string, reg: BrainRegistry): void;
/** List every registered source. `home` defaults to {@link brainHome}. */
export declare function listBrain(home?: string): BrainSource[];
/**
 * Read reconstructed KUs from ANY `books.sqlite`-format lexical store (a project store, the brain
 * store, or a per-source slice) — the single shared reader behind {@link promoteProjectToBrain},
 * {@link buildPrimer}, {@link exportBrainSlice}, and {@link importBrainSlice}. `source` narrows to
 * one book; default reads all. Synchronous (native `better-sqlite3` via `createRequire`) and
 * best-effort: an absent store or unresolved dependency returns an honest `error`, never throws.
 */
export declare function readBookKus(opts: {
    storePath: string;
    depsRoot?: string;
    source?: string;
}): {
    kus: BookKU[];
    error?: string;
};
/**
 * Exact by-kuId FULL-content lookup over the brain's lexical store (`brainBooksPath(home)` by
 * default) — the by-id reader behind `dz brain expand <kuId>` (brain-ground-expand Tier 1) and the
 * worth-enrichment pass of the budgeted-eager grounding path. Reuses the audited {@link readBookKus}
 * primitive (shared require-path resolution, schema detection, error surfacing), then filters by
 * `kuId`, returning the reconstructed {@link BookKU} with its whole `content` (never a snippet).
 *
 * Best-effort and deterministic: a missing store, unknown kuId, or dependency error returns
 * `{ error }`, never throws. `source` narrows the scan to one book slug (saves a full-table scan on a
 * large brain); omit to search all sources.
 */
export declare function expandKu(opts: {
    kuId: string;
    brainHome?: string;
    depsRoot?: string;
    source?: string;
}): {
    ku?: BookKU;
    error?: string;
};
/**
 * Build a source's capability card (ADR-001 §5.4) by reading its KUs from the brain lexical store
 * ({@link readBookKus}) + its registry entry, then rendering {@link buildPrimerMarkdown}. Best-effort:
 * a missing store/source returns an honest `error` with empty `markdown`, never throws.
 */
export declare function buildPrimer(opts: {
    brainHome?: string;
    depsRoot?: string;
    slug: string;
}): Promise<{
    markdown: string;
    error?: string;
}>;
/** Write a source's primer to `<brainHome>/primers/<slug>.md` (mkdir). Best-effort; honest error. */
export declare function writePrimer(opts: {
    brainHome?: string;
    depsRoot?: string;
    slug: string;
}): Promise<{
    path: string;
    error?: string;
}>;
/**
 * Promote a PROJECT's digitized book KB into the durable cross-project brain (ADR-001 P0
 * `book-brain-register`). Reads the project's lexical `books.sqlite` ({@link readBookKus}) and mirrors
 * every KU into the brain via the shared {@link mirrorKusToBrain} path (lexical + vector + registry +
 * primer). `kind: 'book'`.
 *
 * **Non-clobbering:** promoting the same book twice does not duplicate — the lexical upsert keys on
 * `(book, ku_id, corpus_version)` and the vector rows are pre-deleted before re-index.
 */
export declare function promoteProjectToBrain(opts: {
    projectRoot: string;
    depsRoot?: string;
    brainHome?: string;
    source?: string;
    addedTs: string;
}): Promise<{
    sources: string[];
    kus: number;
    error?: string;
}>;
/**
 * `dz brain update <slug>` backend (ADR-001 §11 P3 — non-destructive refresh). The project has
 * re-ingested a source's book at a NEW `corpus_version`; this re-reads that source's CURRENT KUs
 * from the PROJECT lexical store ({@link readBookKus} at the project `bookKbPath`, `source=slug`)
 * and re-mirrors them into the brain via the shared {@link mirrorKusToBrain} path.
 *
 * **Non-clobbering + non-destructive:** the per-source stale-corpus eviction inside the reused
 * `putBookKnowledge` upsert evicts THIS source's old-corpus rows and upserts the new ones, while
 * OTHER sources are untouched. The primer is refreshed as part of the mirror. Reports the
 * before/after KU counts (read directly from the brain, so `after` reflects the post-eviction set)
 * and the new `corpusVersion`.
 *
 * Honest failure, no partial state: an unregistered source, or a project with no KUs for it, returns
 * an `error` before any write happens.
 */
export declare function updateBrainSource(opts: {
    brainHome?: string;
    depsRoot?: string;
    slug: string;
    projectRoot: string;
    addedTs: string;
}): Promise<{
    before: number;
    after: number;
    corpusVersion?: string;
    error?: string;
}>;
/**
 * Export ONE source's KUs from the brain as a STANDALONE lexical-only `books.sqlite` slice at
 * `outPath` (ADR-001 §8.1). Reads via {@link readBookKus} and writes via {@link putBookKnowledge} —
 * lexical only; vectors re-embed on import. This is the portable, per-book shareable unit.
 *
 * **License-preserving (IP §8):** the source's `kind` + `license` (from the registry) are stamped into
 * each KU's metadata so {@link importBrainSlice} can preserve them — otherwise a `repo`/`paper` slice
 * would import relabeled as an unlicensed `book` (`book_knowledge` has no kind/license column).
 */
export declare function exportBrainSlice(opts: {
    brainHome?: string;
    depsRoot?: string;
    slug: string;
    outPath: string;
}): Promise<{
    kuCount: number;
    error?: string;
}>;
/**
 * Import a per-book slice ({@link exportBrainSlice} output, or a pack's `brain/<slug>.sqlite`) into
 * the brain (ADR-001 §8.1). Reads the slice's KUs ({@link readBookKus}) and mirrors them via the same
 * non-clobbering {@link mirrorKusToBrain} path as promote (upsert + re-embed + registry + primer).
 *
 * **License-safe (IP §8):** the source's `kind` + `license` are recovered from the slice metadata
 * (stamped at export) rather than hardcoding `kind:'book'` — so a `repo`/`paper` cannot be silently
 * relabeled a `book` with its license dropped. Non-`book` kinds pass the SAME {@link licenseGate} as
 * {@link registerKusToBrain}: refused unless a permissive license is carried or `override` is set.
 */
export declare function importBrainSlice(opts: {
    brainHome?: string;
    depsRoot?: string;
    slicePath: string;
    addedTs: string;
    override?: boolean;
}): Promise<{
    sources: string[];
    kus: number;
    error?: string;
}>;
/**
 * Register an array of already-shaped KUs (from a repo deep-walk, §6, or raw JSON) into the brain via
 * the shared {@link mirrorKusToBrain} path — the CLI `--from-kus` backend. `slug` is authoritative:
 * every KU is registered under it (so a repo's `book` field is normalized to the source slug). The
 * registry entry carries `kind` and, for `repo`, `license`.
 */
/**
 * SPDX ids the license gate treats as clearly-permissive (auto-pass for repo ingest). Anything else
 * — including an absent license — is refused unless `override:true`. Kept deliberately small and
 * conservative (ADR §8: repos carry their own licenses; the brain must not silently ingest
 * unknown/incompatible source into a redistributable slice).
 */
export declare const PERMISSIVE_LICENSES: readonly string[];
export declare function registerKusToBrain(opts: {
    brainHome?: string;
    depsRoot?: string;
    kus: readonly BookKU[];
    slug: string;
    kind: 'repo' | 'book' | 'paper';
    addedTs: string;
    lang?: string;
    license?: string;
    override?: boolean;
}): Promise<{
    kus: number;
    error?: string;
}>;
export interface BrainQueryResult {
    readonly hits: BookKUHit[];
    readonly error?: string;
    /** Present only when the default/all-terms pass returned zero hits and queryBrain retried as OR. */
    readonly broadened?: true;
}
/**
 * A DETERMINISTIC lexical reranker (ADR-001 §11 P3 / G3) — lifts precision on the top-K without a
 * model dependency, so the sync grounding path stays fast + offline. Scores each hit against the
 * query's CONTENT TERMS (reusing {@link contentTerms}) by (a) term COVERAGE, (b) a FIELD WEIGHT
 * (name > problem > content), and (c) a small type PRIOR, then returns the top-`limit` reordered.
 * Fully deterministic: no clock, no random, stable tie-break by `kuId`.
 *
 * This is deliberately lexical: an ML cross-encoder reranker is OUT OF SCOPE for the sync path (it
 * would make grounding slow + online + non-deterministic). A future model reranker is a drop-in
 * swap BEHIND this same `(query, hits, opts) → hits` signature — callers never change.
 */
export declare function rerankHits(query: string, hits: BookKUHit[], opts?: {
    limit?: number;
}): BookKUHit[];
/**
 * Cross-source lexical recall over the whole brain — a thin, brain-home-scoped wrapper over
 * {@link queryBookKnowledge}. `source` narrows to one source; default is cross-source. Never throws.
 * The default strict/all-terms match runs first; if it returns zero hits, queryBrain retries once with
 * any-term matching and marks the result as `broadened`. Explicit `match:'any'` starts broad and is not
 * labeled as a fallback.
 *
 * `rerank` (default **false** — pure FTS order stays the default so nothing regresses): when true,
 * over-fetch (`limit*3`, capped) then {@link rerankHits} down to `limit` for on-point top-K.
 */
export declare function queryBrain(opts: {
    query: string;
    brainHome?: string;
    depsRoot?: string;
    source?: string;
    limit?: number;
    match?: 'all' | 'any';
    rerank?: boolean;
}): Promise<BrainQueryResult>;
export declare function searchBrainVectors(opts: {
    query: string;
    brainHome?: string;
    depsRoot?: string;
    source?: string;
    limit?: number;
    timeoutMs?: number;
}): Promise<{
    hits: Array<BookKUHit & {
        similarity: number;
    }>;
    error?: string;
}>;
export declare function reindexBrainVectors(opts: {
    brainHome?: string;
    depsRoot?: string;
}): Promise<{
    reembedded: number;
    model?: string;
    version?: number;
    backupPath?: string;
    error?: string;
}>;
/**
 * The grounding-enforcement hook entrypoint (ADR-001 §7, P1). Given a user prompt, deterministically
 * builds a GROUNDING DIRECTIVE block from the brain's top lexical hits — the mechanical half of
 * ruvnet-brain's "answer from source, not drift" (the agent honoring it is the soft, agent-enforced
 * half, §7.2). Best-effort and **silent by design**: grounding must never inject noise or block a
 * prompt, so any generic prompt, empty brain, store error, or thrown exception yields
 * `{ emitted:false, block:'', hitCount:0 }` rather than an error to the user.
 *
 * **Relevance gate (P1):** `≥ 1 content term AND ≥ 1 lexical hit` under OR/any-term matching. The
 * query uses `match:'any'` (OR), not AND: a natural-language prompt carries terms not in the KB
 * (a verb like "проектирую", filler), and AND-ing them all returns 0 even when the topical terms
 * (репликация, кворум) match — the too-strict gate that made real prompts silent. OR lets the
 * matching terms surface KUs, FTS5-rank-ordered; the stopword filter still keeps "how are you"
 * silent (no content terms). A numeric `--min-score` threshold (§7.1/§7.3) is deferred to **P3**:
 * FTS5's `rank` isn't exposed and a meaningful score needs the vector (cosine) path the sync hook
 * doesn't run. Until then, "≥1 content-term OR-hit clears the gate" is the honest P1 rule.
 */
export declare function groundPrompt(opts: {
    prompt: string;
    brainHome?: string;
    depsRoot?: string;
    k?: number;
    source?: string;
    /**
     * brain-ground-expand: approximate token budget (chars/4) for EAGERLY inlining full KU `content`
     * into the block, worth-ranked. `undefined`/`0` ⇒ the byte-identical pointer-only default (Tier 0);
     * `> 0` ⇒ the expand-capable block (Tier 1/2) with full content inlined for the top-K KUs that fit.
     */
    contentBudget?: number;
}): Promise<{
    emitted: boolean;
    block: string;
    hitCount: number;
    error?: string;
}>;
//# sourceMappingURL=brain.d.ts.map