export declare const MEMORY_INDEX_MAX_BYTES = 24000;
export declare const MEMORY_INDEX_MAX_LINE_CHARS = 200;
export declare const MEMORY_INDEX_MIN_HOOK_SUPPORT = 0.5;
export type FindingKind = 'over-size' | 'long-line' | 'broken-link' | 'unindexed-file' | 'unsupported-hook' | 'duplicate-link';
export type Finding = {
    kind: FindingKind;
    line?: number;
    file?: string;
    detail: string;
};
export type MemoryIndexReport = {
    bytes: number;
    lines: number;
    findings: readonly Finding[];
};
/** Pure check: callers supply the index and sibling Markdown files (excluding MEMORY.md). */
export declare function checkMemoryIndex(input: {
    indexText: string;
    files: ReadonlyMap<string, string>;
    limits?: {
        maxBytes?: number;
        maxLineChars?: number;
        minHookSupport?: number;
    };
}): MemoryIndexReport;
//# sourceMappingURL=memory-index-check.d.ts.map