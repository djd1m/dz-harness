export type EmbedModelSource = 'env' | 'config' | 'default';
/**
 * `embed-daemon-memory` (ADR-001 D2): dtype is a property of the STORE, not a global runtime
 * setting. `fp32` is the full-precision default (existing behaviour, unchanged); `q8` is the
 * quantized variant (`{ dtype: 'q8' }` at `pipeline()` construction, `model_quantized.onnx`) —
 * roughly half the RSS of fp32 at a measured cosine parity >= 0.990 (see the harness-core README's
 * `memory.embed.dtype` section for the numbers). `memory.embed.dtype` in config selects the dtype
 * for a NEW index/reindex; the STORE's manifest is what a query is actually embedded with
 * ({@link guardEmbedSpace}) — the two are deliberately allowed to disagree only long enough for the
 * guard to demand a reindex, never silently.
 */
export type EmbedDtype = 'fp32' | 'q8';
export declare const KNOWN_EMBED_DTYPES: readonly EmbedDtype[];
export interface EmbedModelConfig {
    readonly model: string;
    readonly dim: 384;
    readonly source: EmbedModelSource;
    readonly dtype: EmbedDtype;
}
export interface EmbedManifest {
    readonly model: string;
    readonly dim: 384;
    readonly version: number;
    readonly engine?: string;
    /** Absent on a manifest written before this feature — reads as `'fp32'` everywhere it is compared
     * ({@link guardEmbedSpace}), matching the pre-existing fp32-only behaviour exactly. */
    readonly dtype?: EmbedDtype;
    /**
     * Fix round 1 (Codex #4): the RAW `dtype` string off disk when it is PRESENT but not one of
     * {@link KNOWN_EMBED_DTYPES} — a corrupted manifest (`"Q8"`) or one written by a future version
     * (`"int8"`). Distinct from an ABSENT field (legacy pre-feature manifest, safe to read as `'fp32'`):
     * a present-but-unknown value must never be silently folded into the same "absent" bucket, because
     * the underlying vectors may genuinely not be fp32 — {@link guardEmbedSpace} and
     * {@link resolveStoreEmbedDtype} both refuse instead of guessing when this is set.
     */
    readonly dtypeError?: string;
    /** Lead delta after Codex r2 (HIGH): the manifest file EXISTS but could not be read/parsed
     * (truncated by a concurrent writer, hand-edited into invalid JSON). It used to read as "absent"
     * and fall through to legacy fp32 — the same silent cross-space risk as an unknown dtype. Only
     * ENOENT means absent; a read/parse failure is carried here and guardEmbedSpace refuses. The
     * remedy stays reachable: reindex stamps a NEW manifest before it re-indexes. */
    readonly readError?: string;
}
export declare const DEFAULT_EMBED_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export declare const LEGACY_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export declare const DEFAULT_EMBED_DIM = 384;
export declare const KNOWN_EMBED_DIMS: Readonly<Record<string, 384>>;
/**
 * Cross-lingual quality of the supported 384-dim models, MEASURED 2026-07-09 on the real corpus
 * (a Russian query against an English pattern about the same subject), reproducer: a cosine probe
 * over `pipeline('feature-extraction', <model>)`.
 *
 * | model                                 | RU hit | RU miss | gap   |
 * |---------------------------------------|--------|---------|-------|
 * | paraphrase-multilingual-MiniLM-L12-v2 | 0.639  | 0.194   | 0.444 |  <- DEFAULT
 * | multilingual-e5-small (no prefixes)   | 0.863  | 0.754   | 0.109 |
 * | all-MiniLM-L6-v2 (LEGACY, English)    | 0.018  | 0.017   | 0.001 |  <- no cross-lingual signal
 *
 * The legacy model gives a 0.001 gap on Russian: no threshold can separate relevant from irrelevant.
 * Machine-translating the query first does NOT help — it deletes the shared technical identifiers
 * (`codex`, `grade D`) that carry the signal, scoring 0.141 where the multilingual model scores 0.639.
 */
export declare function resolveEmbedModel(projectRoot: string): EmbedModelConfig | {
    error: string;
};
export declare function embedManifestPath(storePath: string): string;
export declare function readEmbedManifest(storePath: string): EmbedManifest | undefined;
export declare function writeEmbedManifest(storePath: string, manifest: EmbedManifest): void;
export declare function legacyEmbedManifest(): EmbedManifest;
export declare function currentEmbedManifest(configured: EmbedModelConfig, version?: number, engine?: string): EmbedManifest;
/**
 * D2 (`embed-daemon-memory`): the model/dim check is unchanged; a SEPARATE dtype check is added
 * after it. Absent manifest dtype reads as `'fp32'` (matching every store written before this
 * feature) before the comparison — so an existing fp32 store configured for fp32 never trips this,
 * and only a genuine fp32<->q8 disagreement (or a q8 store re-configured to fp32) is refused.
 *
 * Fix round 1 (Codex #4): a manifest `dtype` that is PRESENT but unrecognized ({@link
 * EmbedManifest.dtypeError}) is checked BEFORE the fp32-fallback comparison above — it must never
 * be silently treated as the safe legacy-absent case, because the store's real vectors may not be
 * fp32 at all.
 */
export declare function guardEmbedSpace(args: {
    storePath: string;
    configured: EmbedModelConfig;
    hasRows: boolean;
    reindexHint: string;
}): {
    ok: true;
    manifest: EmbedManifest;
} | {
    ok: false;
    error: string;
    manifest: EmbedManifest;
};
export declare function snapshotEmbedManifest(storePath: string, backupPath: string): void;
//# sourceMappingURL=embedding-config.d.ts.map