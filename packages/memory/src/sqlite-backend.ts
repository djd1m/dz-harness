/**
 * `SqliteBackend` — production-scale memory backend using better-sqlite3.
 *
 * Write-through persistence (every `put` is durable), WAL mode for concurrency,
 * and indexed columns for efficient queries. Handles 100k+ records where
 * JsonFileBackend degrades.
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryBackend, MemoryQuery, MemoryRecord } from './backend.js';

const require = createRequire(import.meta.url);

const DEFAULT_LIMIT = 20;

/**
 * Split text into lowercase word tokens of length > 1.
 *
 * The class is `\p{L}\p{N}`, not `a-z0-9`. Until 2026-08-21 it was ASCII-only, so every non-Latin
 * letter was a SEPARATOR and a Cyrillic query produced ZERO tokens — the FTS5 branch was then skipped
 * entirely, `relevanceOf` returned 0 for every record, and the sort collapsed onto its confidence
 * tie-break. MEASURED on a 267-record clone of the real brain: RU top-1 0/10 against EN 10/10, while
 * 63% of real recall traffic is Cyrillic. The INDEX was never wrong — FTS5's own tokenizer handles
 * Cyrillic — so nothing on disk needed migrating; only the query was being stripped of its terms.
 *
 * `\p{L}` admits letters and `\p{N}` digits; it does NOT admit `"`, `*`, `(` or any other FTS5
 * operator, which is what keeps the joined terms safe to interpolate into a MATCH expression.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    // Count CODE POINTS, not UTF-16 units. `token.length` counts units, so a single astral letter
    // (`𐐀`, one character, two units) would slip past a floor meant to reject one-character words —
    // an accidental threshold change smuggled in by the alphabet change (cross-family review,
    // 2026-08-21). The promise was "the alphabet, not the thresholds"; this keeps it.
    .filter((token) => [...token].length > 1);
}

/**
 * Crude prefix-stem for morphology-bearing languages — feature recall-ru-morphology.
 *
 * MEASURED 2026-08-24: one store, teach «…случай миопатии…» — `recall "миопатия"` returned [].
 * FTS5's unicode61 does no Russian stemming, so nominative vs genitive never match, and 63% of
 * real recall traffic is Cyrillic; the July build only «found» such queries because its ASCII
 * tokenizer produced ZERO tokens and a token-less query returned the whole store (82757da0 closed
 * that). The cure is a PREFIX: `миопати*` covers миопатия/миопатии/миопатию alike.
 *
 * ≥6 code points → drop 2; ==5 → drop 1; shorter → no stem (a 4-letter prefix of a 4-letter word
 * is the word). Deliberately NOT a stemmer: root alternations (бежать/бегу) stay uncovered — the
 * honest scope; semantic coverage belongs to the vector tier where one is mirrored.
 */
function stemOf(token: string): string | null {
  const cps = [...token];
  if (cps.length >= 6) return cps.slice(0, -2).join('');
  if (cps.length === 5) return cps.slice(0, -1).join('');
  return null;
}

/** Count how many query terms appear in a record's text/skillId. Exact hit = 1; a hit only via
 *  the prefix-stem = 0.7 (a real signal, ranked below an exact word — and above the >0 filter). */
function relevanceOf(record: MemoryRecord, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const tokens = tokenize(`${record.text} ${record.skillId}`);
  const haystack = new Set(tokens);
  let hits = 0;
  for (const term of terms) {
    if (haystack.has(term)) { hits += 1; continue; }
    const stem = stemOf(term);
    if (stem !== null) {
      let found = false;
      for (const t of tokens) { if (t.startsWith(stem)) { found = true; break; } }
      if (found) hits += 0.7;
    }
  }
  return hits;
}

/** Schema version for future migrations. */
const SCHEMA_VERSION = 2;

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS memory_records (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    text TEXT NOT NULL,
    score REAL NOT NULL,
    outcome TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_skill ON memory_records(skill_id);
  CREATE INDEX IF NOT EXISTS idx_timestamp ON memory_records(timestamp);
  PRAGMA user_version = ${SCHEMA_VERSION};
`;

/** FTS5 virtual table + triggers for automatic sync. */
const FTS5_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    text, skill_id, content=memory_records, content_rowid=rowid
  );
  CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_records BEGIN
    INSERT INTO memory_fts(rowid, text, skill_id) VALUES (new.rowid, new.text, new.skill_id);
  END;
  CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_records BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, text, skill_id) VALUES ('delete', old.rowid, old.text, old.skill_id);
  END;
  CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_records BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, text, skill_id) VALUES ('delete', old.rowid, old.text, old.skill_id);
    INSERT INTO memory_fts(rowid, text, skill_id) VALUES (new.rowid, new.text, new.skill_id);
  END;
`;

/** FTS5 query — matching records with their relevance rank (lower = better). */
const FTS5_SEARCH_SQL = `
  SELECT mr.*, fts.rank AS _rank FROM memory_fts fts
  JOIN memory_records mr ON mr.rowid = fts.rowid
  WHERE memory_fts MATCH ?
  ORDER BY fts.rank
`;

const FTS5_SEARCH_SKILL_SQL = `
  SELECT mr.*, fts.rank AS _rank FROM memory_fts fts
  JOIN memory_records mr ON mr.rowid = fts.rowid
  WHERE memory_fts MATCH ? AND mr.skill_id = ?
  ORDER BY fts.rank
`;

const UPSERT_SQL = `
  INSERT OR REPLACE INTO memory_records (id, skill_id, text, score, outcome, timestamp, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const DELETE_SQL = 'DELETE FROM memory_records WHERE id = ?';

const ALL_SQL = 'SELECT * FROM memory_records';
const COUNT_SQL = 'SELECT COUNT(*) as cnt FROM memory_records';
const BY_SKILL_SQL = 'SELECT * FROM memory_records WHERE skill_id = ?';

/** Options for SqliteBackend. */
export interface SqliteBackendOptions {
  /** Path to the SQLite database file. */
  readonly filePath: string;
}

/**
 * SQLite-backed memory store. Write-through, WAL mode, indexed.
 *
 * Requires `better-sqlite3` at runtime — use via {@link SqliteProbe} in the
 * cascade to gracefully fall back when the native module is unavailable.
 */
export class SqliteBackend implements MemoryBackend {
  readonly name = 'sqlite';

  private readonly db: any; // better-sqlite3 Database instance
  private readonly upsertStmt: any;
  private readonly deleteStmt: any;
  private readonly allStmt: any;
  private readonly countStmt: any;
  private readonly bySkillStmt: any;
  private readonly ftsSearchStmt: any | undefined;
  private readonly ftsSearchSkillStmt: any | undefined;
  private readonly hasFts5: boolean;

  constructor(db: any) {
    this.db = db;
    db.exec(INIT_SQL);

    // Try to enable FTS5 — gracefully degrade if unavailable
    let ftsOk = false;
    try {
      db.exec(FTS5_SQL);
      // Rebuild FTS index from existing data (idempotent)
      db.exec(`INSERT INTO memory_fts(memory_fts) VALUES ('rebuild')`);
      this.ftsSearchStmt = db.prepare(FTS5_SEARCH_SQL);
      this.ftsSearchSkillStmt = db.prepare(FTS5_SEARCH_SKILL_SQL);
      ftsOk = true;
    } catch {
      // FTS5 not compiled in — fall back to keyword overlap
    }
    this.hasFts5 = ftsOk;

    this.upsertStmt = db.prepare(UPSERT_SQL);
    this.deleteStmt = db.prepare(DELETE_SQL);
    this.allStmt = db.prepare(ALL_SQL);
    this.countStmt = db.prepare(COUNT_SQL);
    this.bySkillStmt = db.prepare(BY_SKILL_SQL);
  }

  /** Open (or create) a SQLite database at the given path. */
  static open(filePath: string): SqliteBackend {
    mkdirSync(dirname(filePath), { recursive: true });
    // Dynamic require — better-sqlite3 must be available at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new Database(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    return new SqliteBackend(db);
  }

  put(record: MemoryRecord): Promise<void> {
    this.upsertStmt.run(
      record.id,
      record.skillId,
      record.text,
      record.score,
      record.outcome,
      record.timestamp,
      record.metadata ? JSON.stringify(record.metadata) : null,
    );
    return Promise.resolve();
  }

  query(query: MemoryQuery): Promise<MemoryRecord[]> {
    return Promise.resolve(this.querySync(query));
  }

  /**
   * Synchronous {@link SqliteBackend.query}. Same FTS5-ranked / keyword-fallback
   * logic, no Promise — better-sqlite3 is physically synchronous, so a hot sync
   * path (a recommender / `dz recall`) can query the store without an async ripple.
   */
  querySync(query: MemoryQuery): MemoryRecord[] {
    const limit = query.limit ?? DEFAULT_LIMIT;

    // FTS5 path — use SQLite full-text search when available and text query provided
    if (this.hasFts5 && query.text !== undefined && query.text.trim().length > 0) {
      try {
        // FTS5 query syntax: simple terms joined by spaces (implicit AND → OR with ranking)
        // Each token also contributes its prefix-stem as `stem*` (see stemOf): the exact word and
        // its inflections all match, and a row holding the exact token matches BOTH disjuncts, so
        // bm25 ranks it at or above a prefix-only row. Tokens are \p{L}\p{N}-only — safe to
        // interpolate; the star is appended HERE, never taken from user text.
        const ftsQuery = tokenize(query.text)
          .flatMap((t) => {
            const stem = stemOf(t);
            return stem === null ? [t] : [t, stem + '*'];
          })
          .join(' OR ');
        if (ftsQuery.length > 0) {
          let rows: any[];
          if (query.skillId !== undefined) {
            rows = this.ftsSearchSkillStmt!.all(ftsQuery, query.skillId);
          } else {
            rows = this.ftsSearchStmt!.all(ftsQuery);
          }
          // Rank by FTS5 relevance FIRST (lower rank = better match), with score
          // then timestamp as a true tiebreak between equally-relevant rows. Score
          // must NOT be primary — that would discard FTS5's relevance signal and
          // diverge from the JSON backend (which also ranks relevance-primary).
          const ranked = rows
            .map((row) => ({ record: rowToRecord(row), rank: row._rank as number }))
            .sort(
              (a, b) =>
                a.rank - b.rank ||
                b.record.score - a.record.score ||
                b.record.timestamp.localeCompare(a.record.timestamp),
            );
          return ranked.slice(0, limit).map((entry) => entry.record);
        }
      } catch {
        // FTS5 query failed (e.g., special chars) — fall through to keyword approach
      }
    }

    // Keyword overlap fallback
    const terms = query.text !== undefined ? tokenize(query.text) : [];
    let rows: any[];
    if (query.skillId !== undefined) {
      rows = this.bySkillStmt.all(query.skillId);
    } else {
      rows = this.allStmt.all();
    }

    const records = rows.map(rowToRecord);
    const ranked = records
      .map((record) => ({ record, relevance: relevanceOf(record, terms) }))
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          b.record.score - a.record.score ||
          b.record.timestamp.localeCompare(a.record.timestamp),
      );
    // The SAME guard the JSON backend applies, so a store's answers never depend on which backend is
    // installed. This is the keyword FALLBACK; the FTS5 path above already returns zero honestly and
    // is untouched. With no usable terms there was nothing to match on, so the store still comes back
    // ranked by confidence — that distinction is the whole decision (ADR-001).
    const filtered = terms.length > 0 ? ranked.filter((entry) => entry.relevance > 0) : ranked;
    return filtered.slice(0, limit).map((entry) => entry.record);
  }

  all(): Promise<MemoryRecord[]> {
    return Promise.resolve(this.allSync());
  }

  /** Synchronous {@link SqliteBackend.all}. */
  allSync(): MemoryRecord[] {
    return this.allStmt.all().map(rowToRecord);
  }

  remove(id: string): Promise<void> {
    this.removeSync(id);
    return Promise.resolve();
  }

  /** Synchronous {@link SqliteBackend.remove}. Write-through (durable immediately); the FTS5 delete trigger keeps the index in sync. */
  removeSync(id: string): void {
    this.deleteStmt.run(id);
  }

  count(): Promise<number> {
    return Promise.resolve(this.countStmt.get().cnt);
  }

  /** Batch insert records within a transaction (for bulk loading). */
  putMany(records: readonly MemoryRecord[]): void {
    const insertMany = this.db.transaction((items: readonly MemoryRecord[]) => {
      for (const record of items) {
        this.upsertStmt.run(
          record.id,
          record.skillId,
          record.text,
          record.score,
          record.outcome,
          record.timestamp,
          record.metadata ? JSON.stringify(record.metadata) : null,
        );
      }
    });
    insertMany(records);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }
}

/** Convert a raw SQLite row to a MemoryRecord. */
function rowToRecord(row: any): MemoryRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    text: row.text,
    score: row.score,
    outcome: row.outcome,
    timestamp: row.timestamp,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
