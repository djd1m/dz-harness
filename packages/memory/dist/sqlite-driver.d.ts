/**
 * Resolve lazily from this package, then load the selected entry by its physical path.
 * A symlink alias must not give better-sqlite3 a different dependency-search directory.
 * Keep Node's constructor cache and the original dependency errors; do not select another install.
 */
export declare function loadMemorySqliteDriver(): new (filePath: string, options?: {
    readonly?: boolean;
    fileMustExist?: boolean;
}) => any;
//# sourceMappingURL=sqlite-driver.d.ts.map