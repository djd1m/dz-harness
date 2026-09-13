export type StoreRowCount = number | 'unreadable' | 'busy';
export interface StoreCountOptions {
    readonly busyTimeoutMs?: number;
    readonly attempts?: number;
}
export interface QuarantineTierRow {
    readonly id?: string;
    readonly dzId?: string;
    /** Content-addressed alias used by the teach-time mirror before a lexical row is re-keyed. */
    readonly patternRecordId?: string;
    readonly quarantined?: boolean;
    readonly qStatus?: unknown;
    readonly metadata?: Record<string, unknown> | string | null;
}
export interface QuarantineTierParity {
    readonly both: number;
    readonly lexicalOnly: number;
    readonly mirrorOnly: number;
    readonly ids: {
        readonly both: readonly string[];
        readonly lexicalOnly: readonly string[];
        readonly mirrorOnly: readonly string[];
    };
}
/** Pure dual-key comparison for active quarantine labels in the lexical and mirror tiers. */
export declare function quarantineTierParity(lexicalRows: readonly QuarantineTierRow[], mirrorRows: readonly QuarantineTierRow[]): QuarantineTierParity;
type DatabaseRequire = (id: string) => unknown;
export interface LearningStoreRowCounts {
    readonly lexicalRows: StoreRowCount;
    /** Lexical rows accepted by the same class/noise gate as the vector mirror writer. */
    readonly lexicalMirrorableRows?: number;
    /** Mirrorable lexical rows whose current qStatus is quarantined. */
    readonly lexicalMirrorableQuarantinedRows?: number;
    /** Mutually exclusive exclusion buckets; class takes precedence over noise. */
    readonly lexicalExcludedClassRows?: number;
    readonly lexicalExcludedNoiseRows?: number;
    /** Exact active quarantine labels in the selected lexical SQLite tier; absent for fallback/error paths. */
    readonly lexicalQuarantinedRows?: number;
    /** Physical lexical population counted; jsonl and SQLite maxima are not comparable. */
    readonly lexicalSource: 'jsonl' | 'sqlite';
    /** Exact selected physical source. SQLite wins when both stores coexist, matching runtime reads. */
    readonly lexicalSourcePath: string;
    /** Coexisting JSONL is deliberately excluded from the selected SQLite population. */
    readonly lexicalIgnoredRows?: number | 'unreadable';
    readonly lexicalIgnoredSourcePath?: string;
    /**
     * ВСЕ строки зеркала, включая идеи бэклога и книжные единицы. Смысл поля НЕ сужен намеренно:
     * его читает страж стора как признак целостности (отметка высшей точки `vectorMax`), и сужение
     * до уроков уронило бы наблюдение с 1774 до 631 — страж прочитал бы это как обвал стора.
     * Для показателя зеркала в панели есть отдельное поле `vectorLessonRows`.
     */
    readonly vectorRows: StoreRowCount;
    /**
     * Только зеркальные УРОКИ (task_type dz-teach/dz-learning) — величина, сравнимая с `lexicalRows`.
     * Отсутствует, когда зеркала нет или разложить его по родам не удалось: тогда показатель обязан
     * сказать «не читается», а не молчать, будто величины сошлись.
     */
    readonly vectorLessonRows?: number;
    /** Exact active quarantine labels on mirrored lesson rows; absent when the vector tier is missing/unreadable. */
    readonly vectorQuarantinedRows?: number;
    /** Present when the vector store file exists, including when its count is unreadable. */
    readonly vectorSourcePath?: string;
    /** Exact qStatus parity by dzId; absent when either tier cannot establish quarantine ids. */
    readonly quarantineTierParity?: QuarantineTierParity;
}
/** Best-effort readonly SQLite count with a short busy timeout. */
export declare function countSqliteRowsReadonly(sqlitePath: string, table: 'memory_records' | 'reasoning_patterns'): number | undefined;
export declare function countSqliteRowsReadonly(sqlitePath: string, table: 'memory_records' | 'reasoning_patterns', options: StoreCountOptions, requireModule?: DatabaseRequire): StoreRowCount;
/**
 * Count both protected store populations without opening either store writable.
 * Missing tiers count as zero; an existing tier that cannot be counted is
 * explicitly `unreadable`.
 */
export declare function countLearningStoreRowsReadonly(projectRoot: string, options?: StoreCountOptions, requireModule?: DatabaseRequire): LearningStoreRowCounts;
export {};
//# sourceMappingURL=store-counts.d.ts.map