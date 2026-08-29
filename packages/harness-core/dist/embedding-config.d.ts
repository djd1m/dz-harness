export type EmbedModelSource = 'env' | 'config' | 'default';
export interface EmbedModelConfig {
    readonly model: string;
    readonly dim: 384;
    readonly source: EmbedModelSource;
}
export interface EmbedManifest {
    readonly model: string;
    readonly dim: 384;
    readonly version: number;
    readonly engine?: string;
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