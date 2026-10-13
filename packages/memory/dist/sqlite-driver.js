/** The memory package's optional SQLite driver, shared by its default readers and writers. */
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
const require = createRequire(import.meta.url);
/**
 * Resolve lazily from this package, then load the selected entry by its physical path.
 * A symlink alias must not give better-sqlite3 a different dependency-search directory.
 * Keep Node's constructor cache and the original dependency errors; do not select another install.
 */
export function loadMemorySqliteDriver() {
    return require(realpathSync(require.resolve('better-sqlite3')));
}
//# sourceMappingURL=sqlite-driver.js.map