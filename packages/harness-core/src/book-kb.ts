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

import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { describeNativeDep, exerciseSqliteOpen, probeNativeDep } from './native-dep-probe.js';

/** A digitized Knowledge Unit as stored in the book KB. */
export interface BookKU {
  readonly book: string;            // ISBN or book slug (the immutable upstream key)
  readonly kuId: string;
  readonly corpusVersion: string;   // invalidation key: a re-ingest bumps this
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

interface NativeDb {
  pragma: (s: string) => void;
  exec: (s: string) => void;
  prepare: (q: string) => {
    run: (...a: unknown[]) => unknown;
    all: (...a: unknown[]) => unknown[];
  };
  transaction: <T>(fn: (...a: unknown[]) => T) => (...a: unknown[]) => T;
  close: () => void;
}

/** Default lexical store path — a `memory/` sibling of the pattern store, never `agentdb.db`. */
export function bookKbPath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'books.sqlite');
}

const SCHEMA = `CREATE VIRTUAL TABLE IF NOT EXISTS book_knowledge USING fts5(
  book UNINDEXED, ku_id UNINDEXED, corpus_version UNINDEXED, type UNINDEXED,
  name, problem, content, chapter UNINDEXED, pages UNINDEXED, metadata UNINDEXED
);`;

async function openDb(projectRoot: string, dbPath?: string): Promise<NativeDb | { error: string }> {
  const verdict = probeNativeDep(projectRoot, 'better-sqlite3', exerciseSqliteOpen, 'sqlite-open');
  if (verdict.state === 'absent') {
    return { error: 'better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
  }
  if (verdict.state === 'unusable') return { error: describeNativeDep(verdict) };
  let sqliteUrl: string;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
  } catch {
    return { error: 'better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
  }
  // The probe above absorbs the DEPENDENCY failures — absent, or present-but-unloadable — which is
  // what cross-family review (F2) required: those are instrument failures and must be RETURNED.
  //
  // What follows must still THROW, and that is deliberate. `dz recall --books` distinguishes two
  // states by throw-vs-return, and collapsing them loses a shipped honesty contract (measured
  // 2026-08-27, `books-recall-honesty.test.ts`):
  //   throws   -> the STORE ITSELF is unreadable  -> exit 1, naming the path and a cure
  //   {error}  -> the INSTRUMENT did not run      -> exit 3 under --semantic, never a clean 0-hit
  // A corrupted `books.sqlite` is the first state. Wrapping it into `{error}` made a corrupt store
  // read as a missing instrument and exit 0 — a false clean pass over unreadable data.
  const path = dbPath ?? bookKbPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const { default: Database } = (await import(sqliteUrl)) as { default: new (p: string) => NativeDb };
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

/**
 * Upsert a batch of KUs for a book. Idempotent per (book, kuId): existing rows for the same
 * kuId are replaced, and — since a re-ingest changes `corpusVersion` — every row for the book
 * whose corpus_version differs from this batch's is evicted (stale-corpus cleanup), so the KB
 * mirrors exactly the current ingest. Best-effort: returns an honest error, never throws.
 */
export async function putBookKnowledge(
  projectRoot: string,
  kus: readonly BookKU[],
  opts: { dbPath?: string } = {},
): Promise<{ upserted: number; evicted: number; error?: string }> {
  if (kus.length === 0) return { upserted: 0, evicted: 0 };
  // Precondition (QE P3): a batch must be one book at one corpus_version — the eviction below is
  // keyed on that. Reject a mixed batch instead of silently leaving stale rows.
  const book = kus[0]!.book;
  const corpusVersion = kus[0]!.corpusVersion;
  if (kus.some((k) => k.book !== book || k.corpusVersion !== corpusVersion)) {
    return { upserted: 0, evicted: 0, error: 'putBookKnowledge: batch must share one book + corpus_version' };
  }
  const opened = await openDb(projectRoot, opts.dbPath);
  if ('error' in opened) return { upserted: 0, evicted: 0, error: opened.error };
  const db = opened;
  try {
    // Atomic (QE P2): eviction + all inserts in ONE transaction — a mid-batch failure rolls the
    // eviction back too, so we never lose rows and never leave a half-written book.
    const del = db.prepare('DELETE FROM book_knowledge WHERE book = ? AND corpus_version != ?');
    // QE P3: also evict same-version ORPHANS — rows for this book whose ku_id is NOT in the incoming
    // batch (a re-ingest that DROPS a KU at the SAME corpus_version would otherwise leave it behind,
    // since the corpus_version!= guard alone can't see it). After this the book == exactly the batch.
    const kuIds = kus.map((k) => k.kuId);
    const delOrphan = db.prepare(
      `DELETE FROM book_knowledge WHERE book = ? AND ku_id NOT IN (${kuIds.map(() => '?').join(', ')})`,
    );
    const delKu = db.prepare('DELETE FROM book_knowledge WHERE book = ? AND ku_id = ?');
    const ins = db.prepare(`INSERT INTO book_knowledge
      (book, ku_id, corpus_version, type, name, problem, content, chapter, pages, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const run = db.transaction(() => {
      const evictedStale = (del.run(book, corpusVersion) as { changes?: number }).changes ?? 0;
      const evictedOrphan = (delOrphan.run(book, ...kuIds) as { changes?: number }).changes ?? 0;
      for (const ku of kus) {
        delKu.run(ku.book, ku.kuId);
        ins.run(
          ku.book, ku.kuId, ku.corpusVersion, ku.type, ku.name, ku.problem, ku.content,
          ku.chapter ?? null, ku.pages ? JSON.stringify(ku.pages) : null,
          ku.metadata ? JSON.stringify(ku.metadata) : null,
        );
      }
      return { upserted: kus.length, evicted: evictedStale + evictedOrphan };
    });
    return run() as { upserted: number; evicted: number };
  } catch (err) {
    return { upserted: 0, evicted: 0, error: `book-kb upsert failed (rolled back): ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    db.close();
  }
}

/** Lexical (FTS5) search over the book KB. `book` filters to one book. Never throws. */
export async function queryBookKnowledge(
  projectRoot: string,
  query: string,
  opts: { limit?: number; book?: string; dbPath?: string; match?: 'all' | 'any' } = {},
): Promise<{ hits: BookKUHit[]; error?: string }> {
  const path = opts.dbPath ?? bookKbPath(projectRoot);
  if (!existsSync(path)) return { hits: [] };
  const opened = await openDb(projectRoot, opts.dbPath);
  if ('error' in opened) return { hits: [], error: opened.error };
  const db = opened;
  try {
    const limit = opts.limit ?? 10;
    // Build the FTS5 MATCH by AND-ing individually-quoted PREFIX terms (QE P2): quoting the whole
    // query as one phrase forced strict adjacency (a big recall regression), so we AND per-term to
    // allow any-order matches; each term is a trailing-`*` PREFIX query so morphologically-rich
    // languages match (e.g. RU "репликация" hits stored "репликации"/"репликацию" — FTS5 unicode61
    // has no stemming, and exact-token matching returned 0 hits on a real book KB). A 1-2 char term
    // prefix can match broadly; that's an acceptable recall trade (users can add more terms).
    // Injection stays safe: each term is stripped to \p{L}\p{N} then wrapped in a `"…"` phrase, so
    // the only FTS5-special char emitted is our own trailing `*`. Empty/all-punctuation query →
    // no MATCH (return no hits) rather than an FTS5 error.
    const terms = query.split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]+/gu, '')).filter(Boolean);
    if (terms.length === 0) return { hits: [] };
    // Default `all` (AND) — precise search for `dz recall --books`. `any` (OR) — recall-friendly for
    // grounding, where a natural-language prompt carries some terms not in the KB (a verb, filler):
    // AND-ing them all would return 0, so OR lets the matching terms surface KUs, FTS5-rank-ordered.
    const joiner = opts.match === 'any' ? ' OR ' : ' AND ';
    const match = terms.map((t) => `"${t}"*`).join(joiner);
    const rows = (opts.book !== undefined
      ? db.prepare('SELECT book, ku_id, type, name, problem, content, chapter, pages FROM book_knowledge WHERE book_knowledge MATCH ? AND book = ? ORDER BY rank LIMIT ?').all(match, opts.book, limit)
      : db.prepare('SELECT book, ku_id, type, name, problem, content, chapter, pages FROM book_knowledge WHERE book_knowledge MATCH ? ORDER BY rank LIMIT ?').all(match, limit)
    ) as Array<{ book: string; ku_id: string; type: string; name: string; problem: string; content: string; chapter: string | null; pages: string | null }>;
    return {
      hits: rows.map((r) => ({
        book: r.book, kuId: r.ku_id, type: r.type, name: r.name, problem: r.problem, content: r.content,
        ...(r.chapter !== null ? { chapter: r.chapter } : {}),
        ...(r.pages !== null ? { pages: JSON.parse(r.pages) as number[] } : {}),
      })),
    };
  } catch (err) {
    return { hits: [], error: `book-kb query failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    db.close();
  }
}
