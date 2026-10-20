/**
 * `MemoryBridge` — import host memory files into canonical `MemoryRecord`s.
 *
 * The bridge is the anti-corruption layer between a host's memory format
 * (a Claude Code `MEMORY.md`, a memory note, …) and this package's records.
 *
 * @packageDocumentation
 */
import type { MemoryBackend, MemoryRecord } from './backend.js';
/** Options for a bridge import. */
export interface BridgeOptions {
    /** A label for where the memory came from, e.g. `claude-code:MEMORY.md`. */
    readonly source: string;
    /** Skill id to associate the imported records with. Default `imported`. */
    readonly skillId?: string;
    /** Score for imported records, in `[0, 1]`. Default `0.5`. */
    readonly score?: number;
}
/**
 * Parse a host memory markdown document into {@link MemoryRecord}s — one record
 * per `##` section (or one for the whole document if it has no headings).
 * Empty sections are dropped. Pure: it does not touch any backend.
 */
export declare function importMemoryMarkdown(markdown: string, options: BridgeOptions): MemoryRecord[];
/** Imports host memory markdown into a {@link MemoryBackend}. */
export declare class MemoryBridge {
    private readonly backend;
    constructor(backend: MemoryBackend);
    /** Parse `markdown` and store each resulting record; returns the records. */
    importMarkdown(markdown: string, options: BridgeOptions): Promise<MemoryRecord[]>;
}
//# sourceMappingURL=bridge.d.ts.map