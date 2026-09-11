/**
 * Durable high-water mark for the two dz learning stores.
 *
 * The mark deliberately lives under the user's home directory, outside the
 * project: deleting `<project>/.dz` must not delete the evidence that a store
 * existed there.
 *
 * @packageDocumentation
 */
export declare const STORE_GUARD_VERSION: 1;
/**
 * A fall of more than 10% from the lifetime maximum is anomalous. A second,
 * absolute threshold below catches a sharp recent loss before it reaches 10%.
 * Basis: across 55 days and 9 measured snapshots the counter never decreased
 * (190 -> 1385), measured 2026-09-06.
 */
export declare const STORE_COLLAPSE_MAX_FRACTION = 0.1;
/** See {@link STORE_COLLAPSE_MAX_FRACTION} for the measured basis. */
export declare const STORE_COLLAPSE_LAST_ROWS = 50;
/** Fractional collapse detection is too noisy below this observed population. */
export declare const STORE_COLLAPSE_MIN_ROWS = 10;
export interface AcceptedStoreShrink {
    readonly at: string;
    readonly reason: string;
    /** Required on every receipt written by the source-aware guard; absent only on legacy marks. */
    readonly command?: string;
    readonly kind?: 'measured-deletion' | 'source-transition' | 'operator-reset' | 'cold-start-override';
    readonly before?: StoreCountSnapshot;
    readonly after?: StoreCountSnapshot;
}
export interface StoreResetReceipt {
    readonly at: string;
    readonly command: string;
    readonly decision: 'manual operator decision';
    readonly before: StoreCountSnapshot;
    readonly after: StoreCountSnapshot;
    readonly reason: string;
}
export type StoreCountSource = 'jsonl' | 'sqlite';
export interface StoreCountSnapshot {
    readonly lexicalRows: number;
    readonly vectorRows: number;
    readonly lexicalSource: StoreCountSource;
}
export interface StoreMark {
    readonly project: string;
    /** `unknown` is read-only compatibility for marks written before source tracking existed. */
    readonly lexicalSource: StoreCountSource | 'unknown';
    readonly lexicalMax: number;
    readonly vectorMax: number;
    readonly lexicalLast: number;
    readonly vectorLast: number;
    /** First lexical backend transition since the last explicit reset. */
    readonly sourceChangedAt?: string;
    /** Most recent explicit operator reset. */
    readonly resetAt?: StoreResetReceipt;
    /** Legacy v1 audit field. Readable for compatibility, never re-emitted or treated as authorization. */
    readonly acceptedShrinkAt?: AcceptedStoreShrink;
    readonly updatedAt: string;
    readonly version: number;
}
export interface StoreMarkObservation {
    readonly lexicalRows: number;
    readonly vectorRows: number;
    readonly lexicalSource: StoreCountSource;
    readonly observedAt: string;
    /** Command that produced the observation; diagnostic only, never authorization. */
    readonly command?: string;
}
export interface StoreMarkWriteOptions {
    /** Zero makes a reader's opportunistic mark refresh a single non-blocking acquisition attempt. */
    readonly timeoutMs?: number;
    /** Writer-preflight compare-and-set used to consume a source transition exactly once. */
    readonly expectedPreviousLexicalSource?: StoreCountSource | 'unknown';
}
export type StoreRowCount = number | 'unreadable' | 'busy';
export type StoreHealthVerdict = 'ok' | 'collapsed' | 'cold-start-over-existing' | 'source-changed' | 'unreadable' | 'busy' | 'no-mark';
export interface StoreHealth {
    readonly verdict: StoreHealthVerdict;
    readonly reason: string;
}
export interface StoreHealthInput {
    readonly projectRoot: string;
    readonly lexicalRows: StoreRowCount;
    readonly lexicalSource: StoreCountSource;
    readonly vectorRows: StoreRowCount;
    readonly mark: StoreMark | undefined;
}
/** External high-water-mark path for one canonical project root. */
export declare function storeGuardPath(projectRoot: string): string;
/** External directory populated by `scripts/dz-store-snapshot.sh` for this project. */
export declare function storeSnapshotPath(projectRoot: string): string;
/** Read the external mark; absence is the only condition represented by `undefined`. */
export declare function readStoreMark(projectRoot: string): StoreMark | undefined;
/**
 * Atomically record an ordinary observation. Both maxima are monotonic by
 * construction: no command label, measured deletion, override, or source
 * transition can lower them. A first source transition is recorded as
 * metadata only; a later low-population transition requires an explicit reset.
 */
export declare function writeStoreMark(projectRoot: string, observation: StoreMarkObservation, options?: StoreMarkWriteOptions): StoreMark;
/** Explicit lowering primitive. Callers must obtain operator confirmation first. */
export declare function resetStoreMark(projectRoot: string, observation: StoreMarkObservation): StoreMark;
/** Pure classification of current row counts against the external mark. */
export declare function checkStoreHealth(input: StoreHealthInput): StoreHealth;
//# sourceMappingURL=store-guard.d.ts.map