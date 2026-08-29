/**
 * Knowledge Brain (ADR-001 `features/book-brain`, Phase P0) — the durable, cross-project home that
 * accretes digitized-book Knowledge Units from many projects into ONE shared, queryable brain.
 *
 * **Reuse-first by design (P0's whole point):** this module does NOT reimplement storage. It
 * repoints the already-shipped primitives at a global brain home:
 * - lexical mirror + idempotent upsert → {@link putBookKnowledge} (`dbPath` = brain books.sqlite)
 * - lexical cross-source query           → {@link queryBookKnowledge} (`dbPath` = brain books.sqlite)
 * - vector re-embed + index              → {@link indexPatternsToAgentdb} (`dbPath` = brain agentdb.db)
 *
 * All functions are pure/best-effort: they never throw uncontrolled and return honest `error`
 * strings when a store is absent or a dependency cannot be resolved. `addedTs` is passed IN by the
 * caller — core stays clock-free and deterministic-friendly.
 *
 * @packageDocumentation
 */
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { putBookKnowledge, queryBookKnowledge, bookKbPath } from './book-kb.js';
import { indexPatternsToAgentdb, searchAgentdbPatterns, reindexAgentdbRows } from './agentdb-index.js';
import { resolveEmbedModel } from './embedding-config.js';
// ─────────────────────────────────────── Home & paths ───────────────────────────────────────
/** The durable, cross-project brain home. `DZ_BRAIN_HOME` overrides `~/.dz/brain`. */
export function brainHome() {
    const env = process.env['DZ_BRAIN_HOME'];
    return env !== undefined && env !== '' ? env : join(homedir(), '.dz', 'brain');
}
/** Lexical (FTS5) store for the whole brain — all sources, source-tagged. */
export function brainBooksPath(home) {
    return join(home, 'books.sqlite');
}
/** Vector (ReasoningBank schema + HNSW) store for the whole brain — all sources, source-tagged. */
export function brainAgentdbPath(home) {
    return join(home, 'agentdb.db');
}
/** Registry manifest — every ingested source with metadata. */
export function brainRegistryPath(home) {
    return join(home, 'brain.json');
}
function defaultRegistry() {
    return { version: 1, sources: {} };
}
/**
 * Read the registry from `brain.json`. Returns the empty default if the file is absent or corrupt
 * — never throws (a corrupt/half-written registry must not brick the brain).
 */
export function readRegistry(home) {
    const path = brainRegistryPath(home);
    if (!existsSync(path))
        return defaultRegistry();
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (parsed !== null && typeof parsed === 'object' &&
            typeof parsed.sources === 'object' &&
            parsed.sources !== null) {
            return { version: 1, sources: parsed.sources };
        }
        return defaultRegistry();
    }
    catch {
        return defaultRegistry();
    }
}
/**
 * Write the registry to `brain.json`, creating the brain home if absent. **Atomic + best-effort:**
 * writes to a sibling `brain.json.tmp` then `rename()`s it over the final path (atomic on POSIX), so
 * a crash mid-write can never leave a TORN `brain.json` — which `readRegistry` would silently read as
 * the EMPTY default, and the next merge-write would then drop ALL prior sources (registry drift from
 * the SQLite stores that still hold them). Never throws: a registry write must not brick the brain.
 */
export function writeRegistry(home, reg) {
    try {
        mkdirSync(home, { recursive: true });
        const finalPath = brainRegistryPath(home);
        const tmpPath = `${finalPath}.tmp`;
        writeFileSync(tmpPath, `${JSON.stringify(reg, null, 2)}\n`);
        renameSync(tmpPath, finalPath); // atomic swap — readers see either the old file or the new, never a torn one
    }
    catch {
        /* best-effort: a registry write failure must never surface or brick the brain */
    }
}
/** List every registered source. `home` defaults to {@link brainHome}. */
export function listBrain(home) {
    return Object.values(readRegistry(home ?? brainHome()).sources);
}
/** Resolve the project's `better-sqlite3` from `depsRoot` (matches the reused primitives). */
function resolveSqlite(depsRoot) {
    try {
        const req = createRequire(join(depsRoot, 'package.json'));
        return { url: pathToFileURL(req.resolve('better-sqlite3')).href };
    }
    catch {
        return { error: 'better-sqlite3 not installed (run: dz setup --memory agentdb)' };
    }
}
/** Reconstruct a {@link BookKU} from a raw `book_knowledge` row (shared by every reader below). */
function rowToKu(r) {
    const pages = jsonPages(r.pages);
    const meta = jsonObj(r.metadata);
    return {
        book: r.book,
        kuId: r.ku_id,
        corpusVersion: r.corpus_version,
        type: r.type,
        name: r.name,
        problem: r.problem,
        content: r.content,
        ...(r.chapter !== null ? { chapter: r.chapter } : {}),
        ...(pages !== undefined ? { pages } : {}),
        ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
    };
}
/**
 * Read reconstructed KUs from ANY `books.sqlite`-format lexical store (a project store, the brain
 * store, or a per-source slice) — the single shared reader behind {@link promoteProjectToBrain},
 * {@link buildPrimer}, {@link exportBrainSlice}, and {@link importBrainSlice}. `source` narrows to
 * one book; default reads all. Synchronous (native `better-sqlite3` via `createRequire`) and
 * best-effort: an absent store or unresolved dependency returns an honest `error`, never throws.
 */
export function readBookKus(opts) {
    const depsRoot = opts.depsRoot ?? process.cwd();
    if (!existsSync(opts.storePath))
        return { kus: [], error: `no book store at ${opts.storePath}` };
    let Database;
    try {
        const req = createRequire(join(depsRoot, 'package.json'));
        Database = req('better-sqlite3');
    }
    catch {
        return { kus: [], error: 'better-sqlite3 not installed (run: dz setup --memory agentdb)' };
    }
    try {
        const db = new Database(opts.storePath, { readonly: true });
        try {
            const cols = 'book, ku_id, corpus_version, type, name, problem, content, chapter, pages, metadata';
            const rows = (opts.source !== undefined
                ? db.prepare(`SELECT ${cols} FROM book_knowledge WHERE book = ?`).all(opts.source)
                : db.prepare(`SELECT ${cols} FROM book_knowledge`).all());
            return { kus: rows.map(rowToKu) };
        }
        finally {
            db.close();
        }
    }
    catch (err) {
        return { kus: [], error: `read book KB failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/**
 * Exact by-kuId FULL-content lookup over the brain's lexical store (`brainBooksPath(home)` by
 * default) — the by-id reader behind `dz brain expand <kuId>` (brain-ground-expand Tier 1) and the
 * worth-enrichment pass of the budgeted-eager grounding path. Reuses the audited {@link readBookKus}
 * primitive (shared require-path resolution, schema detection, error surfacing), then filters by
 * `kuId`, returning the reconstructed {@link BookKU} with its whole `content` (never a snippet).
 *
 * Best-effort and deterministic: a missing store, unknown kuId, or dependency error returns
 * `{ error }`, never throws. `source` narrows the scan to one book slug (saves a full-table scan on a
 * large brain); omit to search all sources.
 */
export function expandKu(opts) {
    const home = opts.brainHome ?? brainHome();
    const storePath = brainBooksPath(home);
    const res = readBookKus({
        storePath,
        ...(opts.depsRoot !== undefined ? { depsRoot: opts.depsRoot } : {}),
        ...(opts.source !== undefined ? { source: opts.source } : {}),
    });
    if (res.error !== undefined)
        return { error: res.error };
    const ku = res.kus.find((k) => k.kuId === opts.kuId);
    if (ku === undefined)
        return { error: `kuId not found: ${opts.kuId}` };
    return { ku };
}
/**
 * The vector primitive is insert-only, so before re-indexing a book we delete its existing brain
 * vector rows — mirroring the reindex approach. Best-effort: a missing store/table is a no-op.
 * `foreign_keys = ON` makes the embeddings cascade with the pattern rows.
 */
async function deleteBrainVectors(depsRoot, agentdbPath, book) {
    if (!existsSync(agentdbPath))
        return; // nothing indexed yet
    const sqlite = resolveSqlite(depsRoot);
    if ('error' in sqlite)
        return;
    try {
        const { default: Database } = (await import(sqlite.url));
        const db = new Database(agentdbPath);
        try {
            db.pragma('busy_timeout = 5000');
            db.pragma('foreign_keys = ON');
            db.prepare("DELETE FROM reasoning_patterns WHERE task_type = 'book-knowledge' AND tags LIKE ?").run(`%"${book}"%`);
        }
        finally {
            db.close();
        }
    }
    catch {
        /* best-effort: table may not exist yet, or store is cold */
    }
}
// ──────────────────────────────────────── Promote ───────────────────────────────────────────
function jsonObj(s) {
    if (s === null)
        return {};
    try {
        const v = JSON.parse(s);
        return v !== null && typeof v === 'object' ? v : {};
    }
    catch {
        return {};
    }
}
function jsonPages(s) {
    if (s === null)
        return undefined;
    try {
        const v = JSON.parse(s);
        return Array.isArray(v) ? v : undefined;
    }
    catch {
        return undefined;
    }
}
/** Map a KU's declared `worth` to an honest vector score. Unknown/absent → 0.5 (no fabrication). */
function worthScore(meta) {
    switch (meta['worth']) {
        case 'high':
            return 0.9;
        case 'medium':
            return 0.6;
        case 'low':
            return 0.3;
        default:
            return 0.5;
    }
}
// ──────────────────────────────────────── Primers ───────────────────────────────────────────
/** Clamp + whitespace-collapse a one-line problem for the primer (deterministic). */
function primerLine(s, max = 120) {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
/**
 * Render a source's capability card (ADR-001 §5.4) from its registry entry + KUs — PURE and
 * DETERMINISTIC (no clock, no query): a header (slug/kind/kuCount/corpusVersion/isbn/lang/license),
 * a KU-TYPE histogram (count per type, count-desc then type-asc), and the top ~8 decision/framework
 * KUs (name + one-line problem, page-anchored), ranked by declared `worth` then `kuId`.
 */
function buildPrimerMarkdown(source, kus) {
    const lines = [`# Primer: ${source.slug}`, ''];
    lines.push(`- kind: ${source.kind}`);
    lines.push(`- KUs: ${source.kuCount}`);
    if (source.corpusVersion !== undefined && source.corpusVersion !== '')
        lines.push(`- corpusVersion: ${source.corpusVersion}`);
    if (source.isbn !== undefined)
        lines.push(`- isbn: ${source.isbn}`);
    if (source.lang !== undefined)
        lines.push(`- lang: ${source.lang}`);
    if (source.license !== undefined)
        lines.push(`- license: ${source.license}`);
    lines.push('');
    // KU-type histogram — count per type, count-desc then type-asc (stable, deterministic).
    const counts = new Map();
    for (const k of kus)
        counts.set(k.type, (counts.get(k.type) ?? 0) + 1);
    const hist = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    lines.push('## KU types');
    for (const [type, n] of hist)
        lines.push(`- ${type}: ${n}`);
    lines.push('');
    // Top decision-grade KUs — worth-desc then kuId-asc, first 8; page-anchored provenance. Match the
    // ACTUAL KU type vocabulary (decision-framework / tradeoff-table / methodology / heuristic), not the
    // legacy 'decision'/'framework' shorthands that never occur in real KUs (primer showed _none_).
    const DECISION_TYPES = new Set(['decision-framework', 'tradeoff-table', 'methodology', 'heuristic', 'decision', 'framework']);
    const top = kus
        .filter((k) => DECISION_TYPES.has(k.type))
        .sort((a, b) => worthScore(b.metadata ?? {}) - worthScore(a.metadata ?? {}) || a.kuId.localeCompare(b.kuId))
        .slice(0, 8);
    lines.push('## Top decision moments');
    if (top.length === 0) {
        lines.push('_none_');
    }
    else {
        top.forEach((k, i) => {
            const ch = k.chapter !== undefined && k.chapter !== '' ? ` гл.${k.chapter}` : '';
            const pg = k.pages !== undefined && k.pages.length > 0 ? ` с.${k.pages.join('–')}` : '';
            lines.push(`${i + 1}. ${k.name} — ${primerLine(k.problem)}${ch}${pg}`);
        });
    }
    lines.push('');
    return lines.join('\n');
}
/** Synthesize a {@link BrainSource} for a primer when the registry has no entry yet (metadata-derived). */
function sourceFromKus(slug, kus) {
    const meta0 = kus[0]?.metadata ?? {};
    const corpusVersion = kus[0]?.corpusVersion ?? '';
    return {
        slug,
        kind: 'book',
        kuCount: kus.length,
        addedTs: '',
        ...(corpusVersion !== '' ? { corpusVersion } : {}),
        ...(typeof meta0['lang'] === 'string' ? { lang: meta0['lang'] } : {}),
        ...(typeof meta0['isbn'] === 'string' ? { isbn: meta0['isbn'] } : {}),
        ...(typeof meta0['license'] === 'string' ? { license: meta0['license'] } : {}),
    };
}
/**
 * Build a source's capability card (ADR-001 §5.4) by reading its KUs from the brain lexical store
 * ({@link readBookKus}) + its registry entry, then rendering {@link buildPrimerMarkdown}. Best-effort:
 * a missing store/source returns an honest `error` with empty `markdown`, never throws.
 */
export async function buildPrimer(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    const read = readBookKus({ storePath: brainBooksPath(home), depsRoot, source: opts.slug });
    if (read.error !== undefined)
        return { markdown: '', error: read.error };
    if (read.kus.length === 0)
        return { markdown: '', error: `no KUs for source '${opts.slug}' in brain` };
    const source = readRegistry(home).sources[opts.slug] ?? sourceFromKus(opts.slug, read.kus);
    return { markdown: buildPrimerMarkdown(source, read.kus) };
}
/** Write a source's primer to `<brainHome>/primers/<slug>.md` (mkdir). Best-effort; honest error. */
export async function writePrimer(opts) {
    const home = opts.brainHome ?? brainHome();
    const path = join(home, 'primers', `${opts.slug}.md`);
    const built = await buildPrimer(opts);
    if (built.error !== undefined)
        return { path, error: built.error };
    try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, built.markdown);
        return { path };
    }
    catch (err) {
        return { path, error: `write primer failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
// ──────────────────────────────────────── Mirror ────────────────────────────────────────────
/**
 * The ONE shared "mirror KUs into the brain + register + primer" path behind
 * {@link promoteProjectToBrain}, {@link importBrainSlice}, and {@link registerKusToBrain}. Groups
 * the KUs by `book` and, per book: (1) lexical-mirrors via the idempotent {@link putBookKnowledge},
 * (2) re-embeds via {@link indexPatternsToAgentdb} after pre-deleting the book's stale vectors, and
 * (3) writes/refreshes the registry entry — then generates `primers/<slug>.md` best-effort (a primer
 * failure never fails the mirror) and stores its relative path on the entry.
 *
 * **Non-clobbering:** mirroring the same book twice does not duplicate — the lexical upsert keys on
 * `(book, ku_id, corpus_version)` and the vector rows are pre-deleted before re-index.
 */
async function mirrorKusToBrain(opts) {
    const { home, depsRoot } = opts;
    if (opts.kus.length === 0)
        return { sources: [], kus: 0 };
    // Group KUs by book (each book is one mirror unit + one registry entry).
    const byBook = new Map();
    for (const k of opts.kus) {
        const bucket = byBook.get(k.book);
        if (bucket)
            bucket.push(k);
        else
            byBook.set(k.book, [k]);
    }
    const reg = readRegistry(home);
    const sources = { ...reg.sources };
    const mirrored = [];
    let totalKus = 0;
    let firstError;
    for (const [book, kus] of byBook) {
        // 1. Lexical mirror — reuse the idempotent upsert, pointed at the brain store.
        const lex = await putBookKnowledge(depsRoot, kus, { dbPath: brainBooksPath(home) });
        if (lex.error !== undefined && firstError === undefined)
            firstError = lex.error;
        // 2. Vector re-embed — pre-delete this book's stale vectors (insert-only primitive), then index.
        await deleteBrainVectors(depsRoot, brainAgentdbPath(home), book);
        const vecRows = kus.map((k) => ({
            taskType: 'book-knowledge',
            text: `${k.name}: ${k.problem}`,
            score: worthScore(k.metadata ?? {}),
            tags: ['book', k.book, k.type],
            metadata: {
                chapter: k.chapter ?? null,
                pages: k.pages ?? null,
                ku_id: k.kuId,
                corpus_version: k.corpusVersion,
            },
        }));
        const vec = await indexPatternsToAgentdb(depsRoot, vecRows, { dbPath: brainAgentdbPath(home) });
        if (vec.error !== undefined && firstError === undefined)
            firstError = vec.error;
        // 3. Registry entry — corpus_version/lang/isbn/license from opts (explicit) then first KU's metadata.
        const meta0 = kus[0].metadata ?? {};
        const corpusVersion = kus[0].corpusVersion;
        const lang = opts.lang ?? (typeof meta0['lang'] === 'string' ? meta0['lang'] : undefined);
        const isbn = typeof meta0['isbn'] === 'string' ? meta0['isbn'] : undefined;
        const license = opts.license ?? (typeof meta0['license'] === 'string' ? meta0['license'] : undefined);
        const entry = {
            slug: book,
            kind: opts.kind,
            kuCount: kus.length,
            addedTs: opts.addedTs,
            ...(corpusVersion !== undefined && corpusVersion !== '' ? { corpusVersion } : {}),
            ...(lang !== undefined ? { lang } : {}),
            ...(isbn !== undefined ? { isbn } : {}),
            ...(license !== undefined ? { license } : {}),
        };
        // 4. Primer — best-effort: a primer failure must not fail the mirror. Store the relative path.
        let primerRel;
        try {
            const rel = join('primers', `${book}.md`);
            const primerPath = join(home, rel);
            mkdirSync(dirname(primerPath), { recursive: true });
            writeFileSync(primerPath, buildPrimerMarkdown(entry, kus));
            primerRel = rel;
        }
        catch {
            /* primer is advisory — never fail the mirror on it */
        }
        sources[book] = primerRel !== undefined ? { ...entry, primer: primerRel } : entry;
        mirrored.push(book);
        totalKus += kus.length;
    }
    writeRegistry(home, { version: 1, sources });
    return firstError !== undefined
        ? { sources: mirrored, kus: totalKus, error: firstError }
        : { sources: mirrored, kus: totalKus };
}
// ──────────────────────────────────────── Promote ───────────────────────────────────────────
/**
 * Promote a PROJECT's digitized book KB into the durable cross-project brain (ADR-001 P0
 * `book-brain-register`). Reads the project's lexical `books.sqlite` ({@link readBookKus}) and mirrors
 * every KU into the brain via the shared {@link mirrorKusToBrain} path (lexical + vector + registry +
 * primer). `kind: 'book'`.
 *
 * **Non-clobbering:** promoting the same book twice does not duplicate — the lexical upsert keys on
 * `(book, ku_id, corpus_version)` and the vector rows are pre-deleted before re-index.
 */
export async function promoteProjectToBrain(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? opts.projectRoot;
    const projectDbPath = bookKbPath(opts.projectRoot);
    if (!existsSync(projectDbPath))
        return { sources: [], kus: 0, error: 'no project book KB' };
    const read = readBookKus({ storePath: projectDbPath, depsRoot, ...(opts.source !== undefined ? { source: opts.source } : {}) });
    if (read.error !== undefined)
        return { sources: [], kus: 0, error: read.error };
    if (read.kus.length === 0)
        return { sources: [], kus: 0 };
    return mirrorKusToBrain({ home, depsRoot, kus: read.kus, kind: 'book', addedTs: opts.addedTs });
}
// ────────────────────────────────────────── Update ──────────────────────────────────────────
/**
 * `dz brain update <slug>` backend (ADR-001 §11 P3 — non-destructive refresh). The project has
 * re-ingested a source's book at a NEW `corpus_version`; this re-reads that source's CURRENT KUs
 * from the PROJECT lexical store ({@link readBookKus} at the project `bookKbPath`, `source=slug`)
 * and re-mirrors them into the brain via the shared {@link mirrorKusToBrain} path.
 *
 * **Non-clobbering + non-destructive:** the per-source stale-corpus eviction inside the reused
 * `putBookKnowledge` upsert evicts THIS source's old-corpus rows and upserts the new ones, while
 * OTHER sources are untouched. The primer is refreshed as part of the mirror. Reports the
 * before/after KU counts (read directly from the brain, so `after` reflects the post-eviction set)
 * and the new `corpusVersion`.
 *
 * Honest failure, no partial state: an unregistered source, or a project with no KUs for it, returns
 * an `error` before any write happens.
 */
export async function updateBrainSource(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? opts.projectRoot;
    // Gate 1: the source must already be in the registry (update refreshes, it does not add).
    const existing = readRegistry(home).sources[opts.slug];
    if (existing === undefined) {
        return { before: 0, after: 0, error: `source '${opts.slug}' is not registered in the brain (use promote/register first)` };
    }
    // `before` = the source's CURRENT row count in the brain (read directly, not the cached registry
    // count) so the delta reflects real state.
    const beforeRead = readBookKus({ storePath: brainBooksPath(home), depsRoot, source: opts.slug });
    const before = beforeRead.kus.length;
    // Gate 2: the project must hold the re-ingested KUs for THIS source (no partial state on failure).
    const projectDbPath = bookKbPath(opts.projectRoot);
    if (!existsSync(projectDbPath)) {
        return { before, after: before, error: 'no project book KB' };
    }
    const read = readBookKus({ storePath: projectDbPath, depsRoot, source: opts.slug });
    if (read.error !== undefined)
        return { before, after: before, error: read.error };
    if (read.kus.length === 0) {
        return { before, after: before, error: `project has no KUs for source '${opts.slug}'` };
    }
    // Re-mirror through the shared path — the stale-corpus eviction makes this refresh non-destructive
    // for this source and non-clobbering for others; the primer is rewritten inside the mirror.
    const mirror = await mirrorKusToBrain({
        home,
        depsRoot,
        kus: read.kus,
        kind: existing.kind,
        addedTs: opts.addedTs,
        ...(existing.lang !== undefined ? { lang: existing.lang } : {}),
        ...(existing.license !== undefined ? { license: existing.license } : {}),
    });
    // `after` from the brain itself — proves the eviction landed (no orphan old-corpus rows).
    const afterRead = readBookKus({ storePath: brainBooksPath(home), depsRoot, source: opts.slug });
    const after = afterRead.kus.length;
    const newCorpus = read.kus[0]?.corpusVersion;
    const out = { before, after };
    if (newCorpus !== undefined && newCorpus !== '')
        out.corpusVersion = newCorpus;
    if (mirror.error !== undefined)
        out.error = mirror.error;
    return out;
}
// ────────────────────────────────────── Slices / ingest ─────────────────────────────────────
/**
 * Reserved KU-metadata keys that carry a source's `kind` + `license` THROUGH a lexical slice
 * (`book_knowledge` has no kind/license column). Stamped on {@link exportBrainSlice}, read back +
 * stripped on {@link importBrainSlice} so a `repo`/`paper` slice cannot be silently re-imported
 * relabeled as an unlicensed `book` (IP §8). Underscore-prefixed to avoid clashing with real KU meta.
 */
const BRAIN_KIND_KEY = '_brainKind';
const BRAIN_LICENSE_KEY = '_brainLicense';
/** Narrow an untrusted `kind` back to the union, defaulting HONESTLY to `book` (never fabricate). */
function brainKindOf(v) {
    return v === 'repo' || v === 'paper' ? v : 'book';
}
/**
 * The ONE license gate (IP §8) shared by {@link registerKusToBrain} and {@link importBrainSlice}: a
 * `repo`/`paper` source must declare a permissive SPDX license, else refuse unless `override`. Returns
 * an error string to refuse, or `undefined` to allow. `book` kinds are exempt (own CP5 flow).
 */
function licenseGate(kind, license, override, slug) {
    if (kind === 'book' || override === true)
        return undefined;
    if (license === undefined || license === '') {
        return `refusing to ingest '${slug}' (${kind}) with no --license; pass a permissive SPDX id (${PERMISSIVE_LICENSES.join(', ')}) or --override`;
    }
    if (!PERMISSIVE_LICENSES.includes(license)) {
        return `refusing to ingest '${slug}': license '${license}' is not in the permissive allow-list (${PERMISSIVE_LICENSES.join(', ')}); pass --override to ingest anyway`;
    }
    return undefined;
}
/** Stamp a source's `kind` + `license` into a KU's metadata for a portable slice ({@link exportBrainSlice}). */
function stampBrainMeta(ku, src) {
    const kind = src?.kind ?? 'book';
    return {
        ...ku,
        metadata: {
            ...(ku.metadata ?? {}),
            [BRAIN_KIND_KEY]: kind,
            ...(src?.license !== undefined ? { [BRAIN_LICENSE_KEY]: src.license } : {}),
        },
    };
}
/** Drop the reserved kind/license keys so the brain's KU metadata stays clean after import. */
function stripBrainMeta(ku) {
    if (ku.metadata === undefined)
        return ku;
    const rest = { ...ku.metadata };
    delete rest[BRAIN_KIND_KEY];
    delete rest[BRAIN_LICENSE_KEY];
    return { ...ku, metadata: rest };
}
/**
 * Export ONE source's KUs from the brain as a STANDALONE lexical-only `books.sqlite` slice at
 * `outPath` (ADR-001 §8.1). Reads via {@link readBookKus} and writes via {@link putBookKnowledge} —
 * lexical only; vectors re-embed on import. This is the portable, per-book shareable unit.
 *
 * **License-preserving (IP §8):** the source's `kind` + `license` (from the registry) are stamped into
 * each KU's metadata so {@link importBrainSlice} can preserve them — otherwise a `repo`/`paper` slice
 * would import relabeled as an unlicensed `book` (`book_knowledge` has no kind/license column).
 */
export async function exportBrainSlice(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    const read = readBookKus({ storePath: brainBooksPath(home), depsRoot, source: opts.slug });
    if (read.error !== undefined)
        return { kuCount: 0, error: read.error };
    if (read.kus.length === 0)
        return { kuCount: 0, error: `no KUs for source '${opts.slug}' in brain` };
    const src = readRegistry(home).sources[opts.slug];
    const stamped = read.kus.map((k) => stampBrainMeta(k, src));
    const put = await putBookKnowledge(depsRoot, stamped, { dbPath: opts.outPath });
    if (put.error !== undefined)
        return { kuCount: 0, error: put.error };
    return { kuCount: read.kus.length };
}
/**
 * Import a per-book slice ({@link exportBrainSlice} output, or a pack's `brain/<slug>.sqlite`) into
 * the brain (ADR-001 §8.1). Reads the slice's KUs ({@link readBookKus}) and mirrors them via the same
 * non-clobbering {@link mirrorKusToBrain} path as promote (upsert + re-embed + registry + primer).
 *
 * **License-safe (IP §8):** the source's `kind` + `license` are recovered from the slice metadata
 * (stamped at export) rather than hardcoding `kind:'book'` — so a `repo`/`paper` cannot be silently
 * relabeled a `book` with its license dropped. Non-`book` kinds pass the SAME {@link licenseGate} as
 * {@link registerKusToBrain}: refused unless a permissive license is carried or `override` is set.
 */
export async function importBrainSlice(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    const read = readBookKus({ storePath: opts.slicePath, depsRoot });
    if (read.error !== undefined)
        return { sources: [], kus: 0, error: read.error };
    if (read.kus.length === 0)
        return { sources: [], kus: 0 };
    // Recover the declared kind + license from the slice (stamped at export) — do NOT hardcode
    // kind:'book', which would relabel a repo/paper source and DROP its license (the §8 relabel hole).
    const meta0 = read.kus[0].metadata ?? {};
    const kind = brainKindOf(meta0[BRAIN_KIND_KEY]);
    const license = typeof meta0[BRAIN_LICENSE_KEY] === 'string' ? meta0[BRAIN_LICENSE_KEY] : undefined;
    // Same license gate as register — a non-book slice without a permissive license is refused before
    // any write, so a relabel-to-book can never sneak an unlicensed repo/paper into the brain.
    const slug = read.kus[0].book;
    const gate = licenseGate(kind, license, opts.override, slug);
    if (gate !== undefined)
        return { sources: [], kus: 0, error: gate };
    const kus = read.kus.map(stripBrainMeta); // clean the reserved keys back out of the stored metadata
    return mirrorKusToBrain({
        home,
        depsRoot,
        kus,
        kind,
        addedTs: opts.addedTs,
        ...(license !== undefined ? { license } : {}),
    });
}
/**
 * Register an array of already-shaped KUs (from a repo deep-walk, §6, or raw JSON) into the brain via
 * the shared {@link mirrorKusToBrain} path — the CLI `--from-kus` backend. `slug` is authoritative:
 * every KU is registered under it (so a repo's `book` field is normalized to the source slug). The
 * registry entry carries `kind` and, for `repo`, `license`.
 */
/**
 * SPDX ids the license gate treats as clearly-permissive (auto-pass for repo ingest). Anything else
 * — including an absent license — is refused unless `override:true`. Kept deliberately small and
 * conservative (ADR §8: repos carry their own licenses; the brain must not silently ingest
 * unknown/incompatible source into a redistributable slice).
 */
export const PERMISSIVE_LICENSES = [
    'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', '0BSD', 'MIT-0',
];
export async function registerKusToBrain(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    if (opts.kus.length === 0)
        return { kus: 0 };
    // License gate (ADR §8) — repo/paper sources must declare a permissive license, else refuse unless
    // explicitly overridden. Books promoted from a digitized pack are exempt (own CP5 flow). No writes
    // happen before this check, so a refusal never leaves a partial brain. Shared with importBrainSlice.
    const gate = licenseGate(opts.kind, opts.license, opts.override, opts.slug);
    if (gate !== undefined)
        return { kus: 0, error: gate };
    // Normalize every KU under the source slug so the batch shares one `book` (putBookKnowledge's key).
    const kus = opts.kus.map((k) => (k.book === opts.slug ? k : { ...k, book: opts.slug }));
    const mirror = await mirrorKusToBrain({
        home,
        depsRoot,
        kus,
        kind: opts.kind,
        addedTs: opts.addedTs,
        ...(opts.lang !== undefined ? { lang: opts.lang } : {}),
        ...(opts.license !== undefined ? { license: opts.license } : {}),
    });
    return mirror.error !== undefined ? { kus: mirror.kus, error: mirror.error } : { kus: mirror.kus };
}
// ──────────────────────────────────────── Rerank ────────────────────────────────────────────
/** FTS5's default `limit` when none is passed (mirrors {@link queryBookKnowledge}). */
const DEFAULT_QUERY_LIMIT = 10;
/**
 * Field weights for the deterministic reranker (ADR-001 §11 P3 / G3): a query term matched in a
 * KU's `name` outranks one only in its `problem`, which outranks one only in `content`. Because a
 * term contributes its BEST field's weight once, summing over distinct terms folds together (a)
 * term COVERAGE — more distinct query terms present ⇒ a higher sum — and (b) FIELD WEIGHT.
 */
const RERANK_FIELD_WEIGHT = { name: 3, problem: 2, content: 1 };
/**
 * KU types that carry a small, deterministic type PRIOR — a decision-grade unit
 * (decision-framework / tradeoff-table / methodology) sits slightly above a bare `definition` when
 * coverage + field weight tie. Kept below the smallest field-weight step (1) so it only breaks
 * near-ties and never overrides a genuinely better term/field match.
 */
const RERANK_TYPE_PRIOR = new Set(['decision-framework', 'tradeoff-table', 'methodology']);
const RERANK_PRIOR_BONUS = 0.5;
/** Over-fetch cap for the rerank pass — bounds work while leaving room for a `limit*3` window. */
const RERANK_OVERFETCH_CAP = 200;
const GROUND_VECTOR_TIMEOUT_MS = 1_000;
const GROUND_VECTOR_SIMILARITY_FLOOR = 0.35;
/**
 * A DETERMINISTIC lexical reranker (ADR-001 §11 P3 / G3) — lifts precision on the top-K without a
 * model dependency, so the sync grounding path stays fast + offline. Scores each hit against the
 * query's CONTENT TERMS (reusing {@link contentTerms}) by (a) term COVERAGE, (b) a FIELD WEIGHT
 * (name > problem > content), and (c) a small type PRIOR, then returns the top-`limit` reordered.
 * Fully deterministic: no clock, no random, stable tie-break by `kuId`.
 *
 * This is deliberately lexical: an ML cross-encoder reranker is OUT OF SCOPE for the sync path (it
 * would make grounding slow + online + non-deterministic). A future model reranker is a drop-in
 * swap BEHIND this same `(query, hits, opts) → hits` signature — callers never change.
 */
export function rerankHits(query, hits, opts) {
    const terms = contentTerms(query);
    const scored = hits.map((hit, idx) => {
        const name = hit.name.toLowerCase();
        const problem = hit.problem.toLowerCase();
        const content = hit.content.toLowerCase();
        let score = 0;
        for (const t of terms) {
            // Each distinct term contributes its BEST field's weight once (coverage × field weight).
            if (name.includes(t))
                score += RERANK_FIELD_WEIGHT.name;
            else if (problem.includes(t))
                score += RERANK_FIELD_WEIGHT.problem;
            else if (content.includes(t))
                score += RERANK_FIELD_WEIGHT.content;
        }
        if (RERANK_TYPE_PRIOR.has(hit.type))
            score += RERANK_PRIOR_BONUS;
        return { hit, score, idx };
    });
    // Deterministic order: score desc, then stable tie-break by kuId (never by input position/clock).
    scored.sort((a, b) => b.score - a.score || a.hit.kuId.localeCompare(b.hit.kuId));
    const limit = opts?.limit ?? hits.length;
    return scored.slice(0, limit).map((s) => s.hit);
}
// ───────────────────────────────────────── Query ────────────────────────────────────────────
/**
 * Cross-source lexical recall over the whole brain — a thin, brain-home-scoped wrapper over
 * {@link queryBookKnowledge}. `source` narrows to one source; default is cross-source. Never throws.
 * The default strict/all-terms match runs first; if it returns zero hits, queryBrain retries once with
 * any-term matching and marks the result as `broadened`. Explicit `match:'any'` starts broad and is not
 * labeled as a fallback.
 *
 * `rerank` (default **false** — pure FTS order stays the default so nothing regresses): when true,
 * over-fetch (`limit*3`, capped) then {@link rerankHits} down to `limit` for on-point top-K.
 */
export async function queryBrain(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    const rerank = opts.rerank === true;
    const effLimit = opts.limit ?? DEFAULT_QUERY_LIMIT;
    const run = async (match) => {
        const qopts = { dbPath: brainBooksPath(home) };
        if (opts.source !== undefined)
            qopts.book = opts.source;
        if (rerank) {
            // Over-fetch a wider window so the reranker has real candidates to reorder, then trim to limit.
            qopts.limit = Math.min(effLimit * 3, RERANK_OVERFETCH_CAP);
        }
        else if (opts.limit !== undefined) {
            qopts.limit = opts.limit;
        }
        if (match !== undefined)
            qopts.match = match;
        const res = await queryBookKnowledge(depsRoot, opts.query, qopts);
        if (!rerank || res.error !== undefined)
            return res;
        return { hits: rerankHits(opts.query, res.hits, { limit: effLimit }) };
    };
    const first = await run(opts.match);
    if (opts.match === 'any' || first.error !== undefined || first.hits.length > 0)
        return first;
    const broadened = await run('any');
    return { ...broadened, broadened: true };
}
async function bounded(promise, ms, fallback) {
    let timer;
    try {
        return await Promise.race([
            promise.catch(() => fallback()),
            new Promise((resolvePromise) => {
                timer = setTimeout(() => resolvePromise(fallback()), ms);
                timer.unref?.();
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
const backgroundWarmups = new Set();
function isFakeAgentdbForTests(depsRoot) {
    try {
        const req = createRequire(join(depsRoot, 'package.json'));
        const pkg = JSON.parse(readFileSync(req.resolve('agentdb/package.json'), 'utf-8'));
        return typeof pkg.version === 'string' && pkg.version.includes('test');
    }
    catch {
        return false;
    }
}
function hasOnnxFile(dir, depth = 0, seen = { count: 0 }) {
    if (depth > 8 || seen.count > 2_000 || !existsSync(dir))
        return false;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return false;
    }
    for (const entry of entries) {
        seen.count += 1;
        const p = join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.onnx'))
            return true;
        if (entry.isDirectory() && hasOnnxFile(p, depth + 1, seen))
            return true;
        if (seen.count > 2_000)
            return false;
    }
    return false;
}
function cacheRoots() {
    const roots = [];
    const transformers = process.env['TRANSFORMERS_CACHE'];
    if (transformers !== undefined && transformers !== '')
        roots.push(transformers);
    const hfHome = process.env['HF_HOME'];
    if (hfHome !== undefined && hfHome !== '')
        roots.push(join(hfHome, 'hub'));
    const xdg = process.env['XDG_CACHE_HOME'];
    roots.push(join(xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.cache'), 'huggingface', 'hub'));
    return [...new Set(roots)];
}
function isEmbedModelCached(depsRoot, model) {
    if (isFakeAgentdbForTests(depsRoot))
        return true;
    const modelDir = `models--${model.model.replace(/\//g, '--')}`;
    for (const root of cacheRoots()) {
        if (hasOnnxFile(join(root, modelDir)) || hasOnnxFile(root.endsWith(modelDir) ? root : join(root, 'hub', modelDir)))
            return true;
    }
    return false;
}
function warmEmbedModelInBackground(depsRoot, model) {
    const key = `${depsRoot}\0${model.model}`;
    if (backgroundWarmups.has(key))
        return;
    backgroundWarmups.add(key);
    setImmediate(() => {
        const script = `
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = ${JSON.stringify(depsRoot)};
const model = ${JSON.stringify(model.model)};
const dim = ${JSON.stringify(model.dim)};
const req = createRequire(join(root, 'package.json'));
const agentdbDir = dirname(req.resolve('agentdb'));
const mod = await import(pathToFileURL(join(agentdbDir, 'controllers', 'EmbeddingService.js')).href);
const emb = new mod.EmbeddingService({ model, dimension: dim, provider: 'transformers' });
await emb.initialize();
await emb.embed('warm embedding model cache');
`;
        try {
            const nodeBin = existsSync(process.execPath) ? process.execPath : (process.argv[0] ?? 'node');
            const child = spawn(nodeBin, ['--input-type=module', '-e', script], {
                cwd: depsRoot,
                detached: true,
                stdio: ['ignore', 'ignore', 'ignore'],
                env: { ...process.env, DZ_EMBED_MODEL: model.model },
            });
            child.on('error', () => undefined);
            child.unref();
        }
        catch {
            /* warmup is advisory; the foreground grounding path must never block or throw */
        }
    });
}
export async function searchBrainVectors(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    const limit = Math.max(1, opts.limit ?? DEFAULT_QUERY_LIMIT);
    const model = resolveEmbedModel(depsRoot);
    if ('error' in model)
        return { hits: [], error: model.error };
    if (!isEmbedModelCached(depsRoot, model)) {
        // eslint-disable-next-line no-console
        console.warn(`[dz brain] SKIP vector leg: embedding model cache is cold for ${model.model}; warming in background`);
        warmEmbedModelInBackground(depsRoot, model);
        return { hits: [], error: 'brain vector search skipped: embedding model cache cold' };
    }
    const run = async () => {
        const vec = await searchAgentdbPatterns(depsRoot, opts.query, {
            dbPath: brainAgentdbPath(home),
            taskTypes: ['book-knowledge'],
            limit: limit * 3,
            reindexHint: 'dz brain reindex',
        });
        if (vec.error !== undefined)
            return { hits: [], error: vec.error };
        if (vec.hits.length === 0)
            return { hits: [] };
        const read = readBookKus({ storePath: brainBooksPath(home), depsRoot, ...(opts.source !== undefined ? { source: opts.source } : {}) });
        if (read.error !== undefined)
            return { hits: [], error: read.error };
        const byKu = new Map(read.kus.map((ku) => [ku.kuId, ku]));
        const hits = [];
        const seen = new Set();
        for (const h of vec.hits) {
            if (h.dzId === undefined || seen.has(h.dzId))
                continue;
            const ku = byKu.get(h.dzId);
            if (ku === undefined)
                continue;
            seen.add(h.dzId);
            hits.push({
                book: ku.book,
                kuId: ku.kuId,
                type: ku.type,
                name: ku.name,
                problem: ku.problem,
                content: ku.content,
                ...(ku.chapter !== undefined ? { chapter: ku.chapter } : {}),
                ...(ku.pages !== undefined ? { pages: ku.pages } : {}),
                similarity: h.similarity,
            });
            if (hits.length >= limit)
                break;
        }
        return { hits };
    };
    return bounded(run(), opts.timeoutMs ?? GROUND_VECTOR_TIMEOUT_MS, () => ({ hits: [], error: 'brain vector search timed out' }));
}
export async function reindexBrainVectors(opts) {
    const home = opts.brainHome ?? brainHome();
    const depsRoot = opts.depsRoot ?? process.cwd();
    const read = readBookKus({ storePath: brainBooksPath(home), depsRoot });
    if (read.error !== undefined)
        return { reembedded: 0, error: read.error };
    const rows = read.kus.map((ku) => ({
        taskType: 'book-knowledge',
        text: `${ku.name}\n${ku.problem}\n${ku.content}`,
        score: 1.0,
        tags: ['book-knowledge', ku.book, ku.type],
        metadata: { source: 'book-kb', book: ku.book, kuId: ku.kuId, dzId: ku.kuId, corpusVersion: ku.corpusVersion },
    }));
    return reindexAgentdbRows(depsRoot, rows, { dbPath: brainAgentdbPath(home), taskTypes: ['book-knowledge'] });
}
// ──────────────────────────────────────── Grounding ─────────────────────────────────────────
/**
 * A small bilingual (RU+EN) stopword list. Deliberately tiny — the goal is only to strip the most
 * common glue words so the residual tokens are CONTENT terms worth grounding on, not to do real NLP.
 */
const STOPWORDS = new Set([
    // EN
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one',
    'our', 'out', 'has', 'had', 'his', 'how', 'its', 'who', 'get', 'got', 'use', 'via', 'per',
    'with', 'this', 'that', 'from', 'into', 'over', 'your', 'they', 'them', 'then', 'than', 'have',
    'will', 'what', 'when', 'why', 'where', 'which', 'about', 'would', 'should', 'could', 'does',
    'did', 'yes', 'no', 'or', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'be', 'as', 'at', 'by',
    // RU
    'и', 'в', 'на', 'как', 'для', 'что', 'это', 'или', 'но', 'же', 'то', 'по', 'из', 'за', 'от',
    'до', 'со', 'об', 'при', 'без', 'над', 'под', 'про', 'так', 'уже', 'еще', 'ещё', 'вот', 'бы',
    'ли', 'не', 'ни', 'да', 'нет', 'мне', 'мой', 'моя', 'вы', 'ты', 'он', 'она', 'они', 'оно',
    'кто', 'где', 'чем', 'чей', 'быть', 'если', 'чтобы', 'этот', 'эта', 'эти', 'все', 'всё', 'меня',
]);
/**
 * Extract meaningful CONTENT TERMS from a prompt: lowercase, keep `\p{L}\p{N}` tokens of length ≥ 3,
 * and drop the small RU+EN stopword list. Deterministic; deduped preserving first-seen order.
 */
function contentTerms(prompt) {
    const seen = new Set();
    const out = [];
    // Split on anything that is not a Unicode letter or number (handles RU + EN + punctuation).
    for (const raw of prompt.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        if (raw.length < 3)
            continue;
        if (STOPWORDS.has(raw))
            continue;
        if (seen.has(raw))
            continue;
        seen.add(raw);
        out.push(raw);
    }
    return out;
}
/** Clamp a snippet to a max length, collapsing whitespace, with an ellipsis when truncated. */
function snippet(s, max = 160) {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
/**
 * Approximate token count for `s`. ASCII/Latin ≈ chars/4, but CYRILLIC — the brain's primary KU
 * language — costs ~2 tokens/char under multilingual tokenizers, so a plain chars/4 UNDERCOUNTS
 * Russian content and lets `--budget N` OVERSHOOT the real token budget. We count Cyrillic at chars/2
 * and the rest at chars/4; OVERESTIMATING is the safe direction for a soft ceiling (inlines slightly
 * less, never more). Used only by the budgeted-eager grounding path; never on the default hot path.
 */
function approxTokens(s) {
    const cyrillic = (s.match(/[Ѐ-ӿ]/g) || []).length;
    return Math.ceil((s.length - cyrillic) / 4 + cyrillic / 2);
}
/** The directive line prepended to every grounding block (§7.1). */
const GROUNDING_DIRECTIVE = 'Ground your answer in the KNOWLEDGE BRAIN below; prefer these ingested sources over ' +
    'training-data recall; cite [Kn] source+page per claim; if the brain is silent on a point, say so.';
/**
 * Expand-capable variant of the grounding directive (brain-ground-expand Tier 1/2). Used ONLY when
 * `contentBudget > 0`; the default (no-budget) path keeps {@link GROUNDING_DIRECTIVE} byte-identical.
 * Augments the base directive with a model instruction: each citation carries its `kuId` as the first
 * field, and the model can pull a KU's FULL content ON DEMAND by running `dz brain expand <kuId>` —
 * so it expands only the KUs it actually needs (latency paid only on real use).
 */
const GROUNDING_DIRECTIVE_EXPAND = 'Ground your answer in the KNOWLEDGE BRAIN below; prefer these ingested sources over ' +
    'training-data recall; cite [Kn] source+page per claim; if the brain is silent on a point, say so. ' +
    "Each citation shows its kuId as the first field — to read a KU's FULL content on demand, run " +
    '`dz brain expand <kuId>`; expand only the KUs you actually need.';
/**
 * The grounding-enforcement hook entrypoint (ADR-001 §7, P1). Given a user prompt, deterministically
 * builds a GROUNDING DIRECTIVE block from the brain's top lexical hits — the mechanical half of
 * ruvnet-brain's "answer from source, not drift" (the agent honoring it is the soft, agent-enforced
 * half, §7.2). Best-effort and **silent by design**: grounding must never inject noise or block a
 * prompt, so any generic prompt, empty brain, store error, or thrown exception yields
 * `{ emitted:false, block:'', hitCount:0 }` rather than an error to the user.
 *
 * **Relevance gate (P1):** `≥ 1 content term AND ≥ 1 lexical hit` under OR/any-term matching. The
 * query uses `match:'any'` (OR), not AND: a natural-language prompt carries terms not in the KB
 * (a verb like "проектирую", filler), and AND-ing them all returns 0 even when the topical terms
 * (репликация, кворум) match — the too-strict gate that made real prompts silent. OR lets the
 * matching terms surface KUs, FTS5-rank-ordered; the stopword filter still keeps "how are you"
 * silent (no content terms). A numeric `--min-score` threshold (§7.1/§7.3) is deferred to **P3**:
 * FTS5's `rank` isn't exposed and a meaningful score needs the vector (cosine) path the sync hook
 * doesn't run. Until then, "≥1 content-term OR-hit clears the gate" is the honest P1 rule.
 */
export async function groundPrompt(opts) {
    const silent = { emitted: false, block: '', hitCount: 0 };
    try {
        // Gate 1: at least one CONTENT term (all-stopword prompts like "how are you" → silent).
        const terms = contentTerms(opts.prompt ?? '');
        if (terms.length < 1)
            return silent;
        // Best-effort OR/any-term lexical recall over the whole brain. Never throws. `match:'any'` so a
        // matching topical term surfaces KUs even when other prompt terms (a verb, filler) miss — the
        // fix for real-prompt silence (AND required every term to co-occur). Rank ordering + top-K keep
        // it precise; the stopword filter keeps generic prompts silent.
        const query = {
            query: terms.join(' '),
            limit: opts.k ?? 5,
            match: 'any',
            // Grounding wants the most ON-POINT citation first — pass through the deterministic reranker.
            rerank: true,
        };
        if (opts.brainHome !== undefined)
            query.brainHome = opts.brainHome;
        if (opts.depsRoot !== undefined)
            query.depsRoot = opts.depsRoot;
        if (opts.source !== undefined)
            query.source = opts.source;
        const res = await queryBrain(query);
        // Gate 2: any lexical hit? On error or zero hits, stay silent (no noise, no block).
        const lexicalHits = res.error === undefined ? res.hits : [];
        const semantic = await searchBrainVectors({
            query: terms.join(' '),
            limit: opts.k ?? 5,
            ...(opts.brainHome !== undefined ? { brainHome: opts.brainHome } : {}),
            ...(opts.depsRoot !== undefined ? { depsRoot: opts.depsRoot } : {}),
            ...(opts.source !== undefined ? { source: opts.source } : {}),
            timeoutMs: GROUND_VECTOR_TIMEOUT_MS,
        });
        const semanticHits = semantic.hits.filter((h) => h.similarity >= GROUND_VECTOR_SIMILARITY_FLOOR);
        if (lexicalHits.length === 0 && semanticHits.length === 0)
            return silent;
        const mergedByKu = new Map();
        for (const h of lexicalHits)
            mergedByKu.set(h.kuId, h);
        for (const h of semanticHits)
            if (!mergedByKu.has(h.kuId))
                mergedByKu.set(h.kuId, h);
        const merged = rerankHits(terms.join(' '), [...mergedByKu.values()], { limit: opts.k ?? 5 });
        // Gate 3 — COVERAGE (the OR balance): OR recall alone over-fires when a single common term
        // ("today", "data") incidentally matches a KU. Require the retrieved hits to actually cover the
        // prompt's intent: for a single-content-term prompt ("кворум") one hit suffices; for a
        // multi-term prompt, ≥2 DISTINCT content terms must prefix-appear in the hit set — so an
        // off-topic prompt whose only matching word is incidental ("weather today" → only "today"
        // matches) stays silent, while a real one ("репликацию single multi leader" → 4 covered) grounds.
        if (terms.length >= 2) {
            const hay = lexicalHits.map((h) => `${h.name} ${h.problem} ${h.content}`.toLowerCase()).join(' ');
            const covered = terms.filter((t) => hay.includes(t.toLowerCase())).length;
            if (covered < 2 && semanticHits.length === 0)
                return silent;
        }
        // ── Tier 0: DEFAULT (backward-compatible pointer block) ────────────────────────────────────
        // No budget ⇒ the exact block emitted before brain-ground-expand, byte-identical (property a).
        // `!opts.contentBudget` covers both `undefined` and `0` (--budget 0 ≡ no budget, FR-03.6).
        if (!opts.contentBudget) {
            // Build the GROUNDING DIRECTIVE block (§7.1): directive line + numbered citations.
            const lines = [GROUNDING_DIRECTIVE, ''];
            merged.forEach((h, i) => {
                const ch = h.chapter !== undefined && h.chapter !== '' ? ` гл.${h.chapter}` : '';
                const pg = h.pages !== undefined && h.pages.length > 0 ? ` с.${h.pages.join('–')}` : '';
                const body = snippet(h.problem !== '' ? h.problem : h.content);
                lines.push(`[K${i + 1}] ${h.book}${ch}${pg} — ${h.name}: ${body}`);
            });
            return { emitted: true, block: lines.join('\n'), hitCount: merged.length };
        }
        const rankedHits = merged.map((h, i) => {
            const expanded = expandKu({
                kuId: h.kuId,
                ...(opts.brainHome !== undefined ? { brainHome: opts.brainHome } : {}),
                ...(opts.depsRoot !== undefined ? { depsRoot: opts.depsRoot } : {}),
                ...(opts.source !== undefined ? { source: opts.source } : {}),
            });
            const worth = expanded.ku !== undefined ? worthScore(expanded.ku.metadata ?? {}) : 0.5;
            return { hit: h, worth, rank: i }; // rank = merge/rerank position (lower = more on-point)
        });
        // Rank: worth desc → similarity/rerank-order (rank) asc → kuId asc (stable, deterministic).
        rankedHits.sort((a, b) => b.worth - a.worth || a.rank - b.rank || a.hit.kuId.localeCompare(b.hit.kuId));
        // Greedy budget fill: inline a KU's full content ONLY if it fits the remaining budget; the first
        // KU that would overflow stops the fill (property c: hard ceiling, atomic KUs — never partial).
        let tokensBudgeted = 0;
        const inlineSet = new Set();
        for (const { hit } of rankedHits) {
            if (hit.content === '')
                continue; // empty content → stays a pointer (zero-token)
            const cost = approxTokens(hit.content);
            if (tokensBudgeted + cost <= opts.contentBudget) {
                inlineSet.add(hit.kuId);
                tokensBudgeted += cost;
            }
            else {
                break; // stop at first overflow (stop-don't-skip policy, FR-03.4)
            }
        }
        // Emit the expand-capable block: directive names `dz brain expand <kuId>`; every citation exposes
        // its kuId (property b). Chosen KUs get full content inlined; the rest stay pointers.
        const lines = [GROUNDING_DIRECTIVE_EXPAND, ''];
        merged.forEach((h, i) => {
            const ch = h.chapter !== undefined && h.chapter !== '' ? ` гл.${h.chapter}` : '';
            const pg = h.pages !== undefined && h.pages.length > 0 ? ` с.${h.pages.join('–')}` : '';
            const header = `[K${i + 1}] ${h.kuId} · ${h.book}${ch}${pg} — ${h.name}`;
            if (inlineSet.has(h.kuId) && h.content !== '') {
                // Inlined full content (budget allocated) — content supersedes the snippet suffix.
                lines.push(header);
                lines.push(h.content);
                lines.push(''); // blank separator between KUs for readability
            }
            else {
                // Pointer with kuId annotation; the model can expand this one on demand.
                const body = snippet(h.problem !== '' ? h.problem : h.content);
                lines.push(`${header}: ${body}`);
            }
        });
        return { emitted: true, block: lines.join('\n'), hitCount: merged.length };
    }
    catch {
        // Grounding is advisory — a bug here must never surface to the user or block the prompt.
        return silent;
    }
}
//# sourceMappingURL=brain.js.map