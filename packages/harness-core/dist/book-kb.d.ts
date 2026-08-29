/**
 * Book Knowledge Base — a lexical (FTS5) namespace for digitized-book Knowledge Units, kept
 * **separate by construction** from the taught-pattern store (`.dz/memory/…`). Because it is its
 * own file (`.dz/memory/books.sqlite`) with its own API, `loadPatterns`/`computePatternBoost`
 * never see book KUs (ADR-001 v2 harness-integration P1: no boost pollution) and there is no
 * retention expiry (books are permanent references, not decaying session patterns).
 *
 * The semantic (vector) layer lives in the shared agentdb store via {@link indexPatternsToAgentdb};
 * this is the lexical layer for `dz recall --books`. Native better-sqlite3; best-effort.
 *
 * @packageDocumentation
 */
/** A digitized Knowledge Unit as stored in the book KB. */
export interface BookKU {
    readonly book: string;
    readonly kuId: string;
    readonly corpusVersion: string;
    readonly type: string;
    readonly name: string;
    readonly problem: string;
    readonly content: string;
    readonly chapter?: string;
    readonly pages?: readonly number[];
    readonly metadata?: Record<string, unknown>;
}
/** A lexical hit from {@link queryBookKnowledge}. */
export interface BookKUHit {
    readonly book: string;
    readonly kuId: string;
    readonly type: string;
    readonly name: string;
    readonly problem: string;
    readonly content: string;
    readonly chapter?: string;
    readonly pages?: readonly number[];
}
/** Default lexical store path — a `memory/` sibling of the pattern store, never `agentdb.db`. */
export declare function bookKbPath(projectRoot: string): string;
/**
 * Upsert a batch of KUs for a book. Idempotent per (book, kuId): existing rows for the same
 * kuId are replaced, and — since a re-ingest changes `corpusVersion` — every row for the book
 * whose corpus_version differs from this batch's is evicted (stale-corpus cleanup), so the KB
 * mirrors exactly the current ingest. Best-effort: returns an honest error, never throws.
 */
export declare function putBookKnowledge(projectRoot: string, kus: readonly BookKU[], opts?: {
    dbPath?: string;
}): Promise<{
    upserted: number;
    evicted: number;
    error?: string;
}>;
/** Lexical (FTS5) search over the book KB. `book` filters to one book. Never throws. */
export declare function queryBookKnowledge(projectRoot: string, query: string, opts?: {
    limit?: number;
    book?: string;
    dbPath?: string;
    match?: 'all' | 'any';
}): Promise<{
    hits: BookKUHit[];
    error?: string;
}>;
//# sourceMappingURL=book-kb.d.ts.map