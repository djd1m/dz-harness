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
export declare class SqliteProbe implements BackendProbe {
    readonly name = "sqlite";
    private readonly filePath;
    constructor(options?: SqliteProbeOptions);
    create(): Promise<MemoryBackend | undefined>;
}
//# sourceMappingURL=sqlite-probe.d.ts.map