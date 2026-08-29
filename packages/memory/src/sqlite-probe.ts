/**
 * `SqliteProbe` — cascade probe for the SQLite backend.
 *
 * Attempts to load `better-sqlite3` and open the database. Returns `undefined`
 * if the native module is unavailable (not installed, build failed, etc.).
 *
 * @packageDocumentation
 */

import type { BackendProbe } from './cascade.js';
import type { MemoryBackend } from './backend.js';

/** Options for SqliteProbe. */
export interface SqliteProbeOptions {
  /** Path to the SQLite database file. Default: `.dz/memory.sqlite` */
  readonly filePath?: string;
}

/**
 * A {@link BackendProbe} that tries to initialise a SQLite backend.
 * Safe to construct unconditionally — if `better-sqlite3` is not installed,
 * `create()` returns `undefined` and the cascade moves on.
 */
export class SqliteProbe implements BackendProbe {
  readonly name = 'sqlite';
  private readonly filePath: string;

  constructor(options: SqliteProbeOptions = {}) {
    this.filePath = options.filePath ?? '.dz/memory.sqlite';
  }

  async create(): Promise<MemoryBackend | undefined> {
    try {
      // Attempt to load better-sqlite3 via the SqliteBackend.
      // If the native module is not installed, this throws and we return undefined.
      const { SqliteBackend } = await import('./sqlite-backend.js');
      const backend = SqliteBackend.open(this.filePath);
      return backend;
    } catch {
      // Module not available or build failed — fall through
      return undefined;
    }
  }
}
