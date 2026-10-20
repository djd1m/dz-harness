/**
 * `SqliteProbe` — cascade probe for the SQLite backend.
 *
 * Attempts to load `better-sqlite3` and open the database. Returns `undefined`
 * if the native module is unavailable (not installed, build failed, etc.).
 *
 * @packageDocumentation
 */
/**
 * A {@link BackendProbe} that tries to initialise a SQLite backend.
 * Safe to construct unconditionally — if `better-sqlite3` is not installed,
 * `create()` returns `undefined` and the cascade moves on.
 */
export class SqliteProbe {
    name = 'sqlite';
    filePath;
    constructor(options = {}) {
        this.filePath = options.filePath ?? '.dz/memory.sqlite';
    }
    async create() {
        try {
            // Attempt to load better-sqlite3 via the SqliteBackend.
            // If the native module is not installed, this throws and we return undefined.
            const { SqliteBackend } = await import('./sqlite-backend.js');
            const backend = SqliteBackend.open(this.filePath);
            return backend;
        }
        catch {
            // Module not available or build failed — fall through
            return undefined;
        }
    }
}
//# sourceMappingURL=sqlite-probe.js.map