/**
 * The memory storage contract — what every backend implements.
 *
 * @packageDocumentation
 */

/** A single memory entry. */
export interface MemoryRecord {
  /** Unique record id. */
  readonly id: string;
  /** The skill this record is about. */
  readonly skillId: string;
  /** Free text — the content keyword queries match against. */
  readonly text: string;
  /** Reward / quality score, in `[0, 1]`. */
  readonly score: number;
  /** A short outcome label, e.g. `excellent`, `good`, `imported`. */
  readonly outcome: string;
  /** ISO-8601 creation time. */
  readonly timestamp: string;
  /** Optional string-keyed metadata. */
  readonly metadata?: Record<string, string>;
}

/** A retrieval query. */
export interface MemoryQuery {
  /** Keyword text to rank records by relevance. */
  readonly text?: string;
  /** Restrict to one skill. */
  readonly skillId?: string;
  /** Maximum results (default 20). */
  readonly limit?: number;
}

/** A pluggable memory store. */
export interface MemoryBackend {
  /** Stable backend name, e.g. `json-file`. */
  readonly name: string;
  /** Insert or replace a record (keyed by `record.id`). */
  put(record: MemoryRecord): Promise<void>;
  /** Retrieve records ranked by relevance to the query. */
  query(query: MemoryQuery): Promise<MemoryRecord[]>;
  /** Every stored record. */
  all(): Promise<MemoryRecord[]>;
  /** Number of stored records. */
  count(): Promise<number>;
  /** Remove a record by id. Resolves whether or not the id existed (idempotent). */
  remove(id: string): Promise<void>;
}
