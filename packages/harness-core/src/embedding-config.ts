import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
export const KNOWN_EMBED_DTYPES: readonly EmbedDtype[] = ['fp32', 'q8'];
const DEFAULT_EMBED_DTYPE: EmbedDtype = 'fp32';

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

export const DEFAULT_EMBED_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const LEGACY_EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DEFAULT_EMBED_DIM = 384;

export const KNOWN_EMBED_DIMS: Readonly<Record<string, 384>> = {
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

export function resolveEmbedModel(projectRoot: string): EmbedModelConfig | { error: string } {
  const dtypeResult = resolveEmbedDtype(projectRoot);
  if ('error' in dtypeResult) return dtypeResult;
  const env = process.env['DZ_EMBED_MODEL'];
  if (env !== undefined && env.trim() !== '') return modelConfig(env.trim(), 'env', dtypeResult.dtype);
  const cfgPath = join(projectRoot, '.dz', 'config.json');
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
      const memory = cfg['memory'] as Record<string, unknown> | undefined;
      const agentdb = memory?.['agentdb'] as Record<string, unknown> | undefined;
      const embed = memory?.['embed'] as Record<string, unknown> | undefined;
      const configured = agentdb?.['embeddingModel'] ?? embed?.['model'];
      if (typeof configured === 'string' && configured.trim() !== '') return modelConfig(configured.trim(), 'config', dtypeResult.dtype);
    } catch {
      /* corrupt config falls back to the default, matching the existing config-read discipline */
    }
  }
  return modelConfig(DEFAULT_EMBED_MODEL, 'default', dtypeResult.dtype);
}

/**
 * FR-3/AC-2 (`embed-daemon-memory`): `memory.embed.dtype` read INDEPENDENTLY of which model source
 * won above — a dtype override must apply the same way whether the model itself came from env,
 * config, or the default. An unset value (or a config file that predates this feature) is `'fp32'`,
 * matching every store written before this feature existed. An unrecognized string is a hard
 * `{error}` naming the allowed values, never a silent fp32 fallback — a typo in the dtype must not
 * quietly build the wrong-shaped index.
 */
function resolveEmbedDtype(projectRoot: string): { dtype: EmbedDtype } | { error: string } {
  const cfgPath = join(projectRoot, '.dz', 'config.json');
  if (!existsSync(cfgPath)) return { dtype: DEFAULT_EMBED_DTYPE };
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    const memory = cfg['memory'] as Record<string, unknown> | undefined;
    const embed = memory?.['embed'] as Record<string, unknown> | undefined;
    const raw = embed?.['dtype'];
    if (raw === undefined) return { dtype: DEFAULT_EMBED_DTYPE };
    if (typeof raw === 'string' && (KNOWN_EMBED_DTYPES as readonly string[]).includes(raw)) return { dtype: raw as EmbedDtype };
    return { error: `unsupported embedding dtype '${String(raw)}' (known: ${KNOWN_EMBED_DTYPES.join(', ')})` };
  } catch {
    // corrupt config falls back to the default, matching resolveEmbedModel's own discipline
    return { dtype: DEFAULT_EMBED_DTYPE };
  }
}

function modelConfig(model: string, source: EmbedModelSource, dtype: EmbedDtype): EmbedModelConfig | { error: string } {
  const dim = KNOWN_EMBED_DIMS[model];
  if (dim === undefined) {
    return { error: `unsupported embedding model '${model}' (known 384-dim models: ${Object.keys(KNOWN_EMBED_DIMS).join(', ')})` };
  }
  return { model, dim, source, dtype };
}

export function embedManifestPath(storePath: string): string {
  return `${storePath}.embed-manifest.json`;
}

export function readEmbedManifest(storePath: string): EmbedManifest | undefined {
  return readManifestFile(embedManifestPath(storePath));
}

function readManifestFile(p: string): EmbedManifest | undefined {
  if (!existsSync(p)) return undefined;
  // `readError` (below) is scoped to a REGULAR FILE whose bytes cannot be parsed — the concurrent-
  // writer/hand-edit case Codex r2 named. A non-file at the sidecar path (a directory) is a different
  // pathology and stays "absent": the store-generation AM-3 fixture plants exactly that directory so
  // the manifest WRITE fails loudly after a real commit — refusing here would hide that contract.
  let isFile = false;
  try {
    isFile = statSync(p).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) return undefined;
  try {
    const m = JSON.parse(readFileSync(p, 'utf-8')) as Partial<EmbedManifest>;
    if (typeof m.model !== 'string' || m.model === '') return undefined;
    if (m.dim !== DEFAULT_EMBED_DIM) return undefined;
    // T1 + fix round 1 (Codex #4): only the two known dtype strings are trusted off disk as a real
    // dtype. An ABSENT field reads as `undefined` (legacy pre-feature manifest — guardEmbedSpace
    // treats it as fp32, the safe pre-existing default). A field that IS PRESENT but names neither
    // known value is NEVER folded into that same "absent" bucket — it used to be (T1's original cut),
    // which let a corrupted (`"Q8"`) or future-version (`"int8"`) dtype masquerade as legacy-fp32 and
    // search would silently compare vectors from two different spaces. It is carried instead as
    // `dtypeError` (the raw string), which guardEmbedSpace/resolveStoreEmbedDtype turn into a hard
    // refusal rather than a guess.
    const dtype = m.dtype === 'fp32' || m.dtype === 'q8' ? m.dtype : undefined;
    const dtypeError = m.dtype !== undefined && dtype === undefined ? String(m.dtype) : undefined;
    return {
      model: m.model,
      dim: DEFAULT_EMBED_DIM,
      version: typeof m.version === 'number' ? m.version : 1,
      ...(typeof m.engine === 'string' ? { engine: m.engine } : {}),
      ...(dtype !== undefined ? { dtype } : {}),
      ...(dtypeError !== undefined ? { dtypeError } : {}),
    };
  } catch (err) {
    return { model: '', dim: DEFAULT_EMBED_DIM, version: 1, readError: err instanceof Error ? err.message : String(err) };
  }
}

function readStoreManifest(storePath: string): EmbedManifest | undefined {
  return readEmbedManifest(storePath) ?? readManifestFile(`${storePath}.manifest.json`);
}

export function writeEmbedManifest(storePath: string, manifest: EmbedManifest): void {
  const p = embedManifestPath(storePath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function legacyEmbedManifest(): EmbedManifest {
  return { model: LEGACY_EMBED_MODEL, dim: DEFAULT_EMBED_DIM, version: 1 };
}

export function currentEmbedManifest(configured: EmbedModelConfig, version = 1, engine?: string): EmbedManifest {
  return { model: configured.model, dim: configured.dim, version, dtype: configured.dtype, ...(engine !== undefined ? { engine } : {}) };
}

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
export function guardEmbedSpace(args: {
  storePath: string;
  configured: EmbedModelConfig;
  hasRows: boolean;
  reindexHint: string;
}): { ok: true; manifest: EmbedManifest } | { ok: false; error: string; manifest: EmbedManifest } {
  const manifest = readStoreManifest(args.storePath)
    ?? (args.hasRows ? legacyEmbedManifest() : currentEmbedManifest(args.configured));
  if (manifest.readError !== undefined) {
    return {
      ok: false,
      manifest,
      error: `embedding manifest unreadable (${manifest.readError}); run ${args.reindexHint}`,
    };
  }
  if (manifest.model !== args.configured.model || manifest.dim !== args.configured.dim) {
    return {
      ok: false,
      manifest,
      error: `embedding model mismatch: index built with ${manifest.model}/${manifest.dim}, configured ${args.configured.model}/${args.configured.dim}; run ${args.reindexHint}`,
    };
  }
  if (manifest.dtypeError !== undefined) {
    return {
      ok: false,
      manifest,
      error: `unknown embedding dtype "${manifest.dtypeError}" in manifest; run ${args.reindexHint}`,
    };
  }
  const manifestDtype = manifest.dtype ?? DEFAULT_EMBED_DTYPE;
  if (manifestDtype !== args.configured.dtype) {
    return {
      ok: false,
      manifest,
      error: `embedding dtype mismatch: index built with ${manifestDtype}, configured ${args.configured.dtype}; run ${args.reindexHint}`,
    };
  }
  return { ok: true, manifest };
}

export function snapshotEmbedManifest(storePath: string, backupPath: string): void {
  const p = embedManifestPath(storePath);
  if (existsSync(p)) copyFileSync(p, backupPath);
}
