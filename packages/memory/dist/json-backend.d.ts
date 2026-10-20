/**
 * `JsonFileBackend` — the default memory backend.
 *
 * Pure JavaScript, zero runtime dependencies: records live in an in-memory map
 * and persist to a JSON file. Retrieval is scored keyword overlap. No native
 * build, no WASM, no model download — it works everywhere.
 *
 * @packageDocumentation
 */
import type { MemoryBackend, MemoryQuery, MemoryRecord } from './backend.js';
/** Options for {@link JsonFileBackend}. */
export interface JsonFileBackendOptions {
    /** File the records persist to. Omit for an in-memory-only backend. */
    readonly filePath?: string;
}
/** The default memory backend — in-memory map with optional JSON-file persistence. */
export declare class JsonFileBackend implements MemoryBackend {
    readonly name = "json-file";
    private readonly records;
    private readonly filePath;
    constructor(options?: JsonFileBackendOptions);
    /** Create a backend and load any records already persisted at `filePath`. */
    static open(filePath: string): Promise<JsonFileBackend>;
    /**
     * Synchronous counterpart to {@link JsonFileBackend.open}. Because this backend
     * is physically synchronous (in-memory map + sync `fs`), a hot sync path (e.g.
     * a recommender) can read the store without an async ripple.
     */
    static openSync(filePath: string): JsonFileBackend;
    put(record: MemoryRecord): Promise<void>;
    query(query: MemoryQuery): Promise<MemoryRecord[]>;
    /** Synchronous {@link JsonFileBackend.query} — same ranking, no Promise. */
    querySync(query: MemoryQuery): MemoryRecord[];
    all(): Promise<MemoryRecord[]>;
    /** Synchronous {@link JsonFileBackend.all}. */
    allSync(): MemoryRecord[];
    remove(id: string): Promise<void>;
    /** Synchronous {@link JsonFileBackend.remove}. Call {@link save} to persist. */
    removeSync(id: string): void;
    count(): Promise<number>;
    /**
     * Persist every record to `filePath`. No-op when no path is configured.
     *
     * Writes atomically: serialize to a unique temp file in the same directory,
     * then `rename` over the target (atomic on POSIX). This prevents a torn/partial
     * file if the process is interrupted mid-write, and prevents a concurrent
     * reader from observing a half-written store.
     */
    save(): Promise<void>;
    /** Load records from `filePath`. No-op when no path is set or the file is absent. */
    load(): Promise<void>;
    /** Synchronous {@link JsonFileBackend.load}. */
    loadSync(): void;
}
//# sourceMappingURL=json-backend.d.ts.map