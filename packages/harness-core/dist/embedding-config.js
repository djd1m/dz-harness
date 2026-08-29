import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
export const DEFAULT_EMBED_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const LEGACY_EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DEFAULT_EMBED_DIM = 384;
export const KNOWN_EMBED_DIMS = {
    [DEFAULT_EMBED_MODEL]: DEFAULT_EMBED_DIM,
    [LEGACY_EMBED_MODEL]: DEFAULT_EMBED_DIM,
    // e5 models require asymmetric "query:" / "passage:" prefixes at call sites to reach full quality.
    // Without them the whole space is compressed: MEASURED 2026-07-09, a relevant RU query scored 0.863
    // and an IRRELEVANT one 0.754 — a 0.109 gap, too thin to place a relevance floor on.
    'Xenova/multilingual-e5-small': DEFAULT_EMBED_DIM,
    // REMOVED 'Xenova/paraphrase-multilingual-mpnet-base-v2': it is a 768-dim model, not 384. Listing it
    // here as 384 was a latent bug — configuring it would have written 768-dim vectors into a 384-dim
    // store. (MEASURED 2026-07-09: `pipeline('feature-extraction', <model>)` output length was 768.)
    // The store's `vectorDim` is 384, so a 768-dim model cannot be supported without a schema change.
};
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
export function resolveEmbedModel(projectRoot) {
    const env = process.env['DZ_EMBED_MODEL'];
    if (env !== undefined && env.trim() !== '')
        return modelConfig(env.trim(), 'env');
    const cfgPath = join(projectRoot, '.dz', 'config.json');
    if (existsSync(cfgPath)) {
        try {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            const memory = cfg['memory'];
            const agentdb = memory?.['agentdb'];
            const embed = memory?.['embed'];
            const configured = agentdb?.['embeddingModel'] ?? embed?.['model'];
            if (typeof configured === 'string' && configured.trim() !== '')
                return modelConfig(configured.trim(), 'config');
        }
        catch {
            /* corrupt config falls back to the default, matching the existing config-read discipline */
        }
    }
    return modelConfig(DEFAULT_EMBED_MODEL, 'default');
}
function modelConfig(model, source) {
    const dim = KNOWN_EMBED_DIMS[model];
    if (dim === undefined) {
        return { error: `unsupported embedding model '${model}' (known 384-dim models: ${Object.keys(KNOWN_EMBED_DIMS).join(', ')})` };
    }
    return { model, dim, source };
}
export function embedManifestPath(storePath) {
    return `${storePath}.embed-manifest.json`;
}
export function readEmbedManifest(storePath) {
    return readManifestFile(embedManifestPath(storePath));
}
function readManifestFile(p) {
    if (!existsSync(p))
        return undefined;
    try {
        const m = JSON.parse(readFileSync(p, 'utf-8'));
        if (typeof m.model !== 'string' || m.model === '')
            return undefined;
        if (m.dim !== DEFAULT_EMBED_DIM)
            return undefined;
        return { model: m.model, dim: DEFAULT_EMBED_DIM, version: typeof m.version === 'number' ? m.version : 1, ...(typeof m.engine === 'string' ? { engine: m.engine } : {}) };
    }
    catch {
        return undefined;
    }
}
function readStoreManifest(storePath) {
    return readEmbedManifest(storePath) ?? readManifestFile(`${storePath}.manifest.json`);
}
export function writeEmbedManifest(storePath, manifest) {
    const p = embedManifestPath(storePath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`);
}
export function legacyEmbedManifest() {
    return { model: LEGACY_EMBED_MODEL, dim: DEFAULT_EMBED_DIM, version: 1 };
}
export function currentEmbedManifest(configured, version = 1, engine) {
    return { model: configured.model, dim: configured.dim, version, ...(engine !== undefined ? { engine } : {}) };
}
export function guardEmbedSpace(args) {
    const manifest = readStoreManifest(args.storePath)
        ?? (args.hasRows ? legacyEmbedManifest() : currentEmbedManifest(args.configured));
    if (manifest.model !== args.configured.model || manifest.dim !== args.configured.dim) {
        return {
            ok: false,
            manifest,
            error: `embedding model mismatch: index built with ${manifest.model}/${manifest.dim}, configured ${args.configured.model}/${args.configured.dim}; run ${args.reindexHint}`,
        };
    }
    return { ok: true, manifest };
}
export function snapshotEmbedManifest(storePath, backupPath) {
    const p = embedManifestPath(storePath);
    if (existsSync(p))
        copyFileSync(p, backupPath);
}
//# sourceMappingURL=embedding-config.js.map