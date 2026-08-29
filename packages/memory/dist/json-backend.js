/**
 * `JsonFileBackend` — the default memory backend.
 *
 * Pure JavaScript, zero runtime dependencies: records live in an in-memory map
 * and persist to a JSON file. Retrieval is scored keyword overlap. No native
 * build, no WASM, no model download — it works everywhere.
 *
 * @packageDocumentation
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const DEFAULT_LIMIT = 20;
/**
 * Split text into lowercase word tokens of length > 1.
 *
 * The class is `\p{L}\p{N}`, not `a-z0-9`. Until 2026-08-21 it was ASCII-only, so every non-Latin
 * letter was a SEPARATOR and a Cyrillic query produced ZERO tokens — the FTS5 branch was then skipped
 * entirely, `relevanceOf` returned 0 for every record, and the sort collapsed onto its confidence
 * tie-break. MEASURED on a 267-record clone of the real brain: RU top-1 0/10 against EN 10/10, while
 * 63% of real recall traffic is Cyrillic. The INDEX was never wrong — FTS5's own tokenizer handles
 * Cyrillic — so nothing on disk needed migrating; only the query was being stripped of its terms.
 *
 * `\p{L}` admits letters and `\p{N}` digits; it does NOT admit `"`, `*`, `(` or any other FTS5
 * operator, which is what keeps the joined terms safe to interpolate into a MATCH expression.
 */
function tokenize(text) {
    return text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        // Count CODE POINTS, not UTF-16 units. `token.length` counts units, so a single astral letter
        // (`𐐀`, one character, two units) would slip past a floor meant to reject one-character words —
        // an accidental threshold change smuggled in by the alphabet change (cross-family review,
        // 2026-08-21). The promise was "the alphabet, not the thresholds"; this keeps it.
        .filter((token) => [...token].length > 1);
}
/**
 * Crude prefix-stem for morphology-bearing languages — feature recall-ru-morphology.
 *
 * MEASURED 2026-08-24: one store, teach «…случай миопатии…» — `recall "миопатия"` returned [].
 * FTS5's unicode61 does no Russian stemming, so nominative vs genitive never match, and 63% of
 * real recall traffic is Cyrillic; the July build only «found» such queries because its ASCII
 * tokenizer produced ZERO tokens and a token-less query returned the whole store (82757da0 closed
 * that). The cure is a PREFIX: `миопати*` covers миопатия/миопатии/миопатию alike.
 *
 * ≥6 code points → drop 2; ==5 → drop 1; shorter → no stem (a 4-letter prefix of a 4-letter word
 * is the word). Deliberately NOT a stemmer: root alternations (бежать/бегу) stay uncovered — the
 * honest scope; semantic coverage belongs to the vector tier where one is mirrored.
 */
function stemOf(token) {
    const cps = [...token];
    if (cps.length >= 6)
        return cps.slice(0, -2).join('');
    if (cps.length === 5)
        return cps.slice(0, -1).join('');
    return null;
}
/** Count how many query terms appear in a record's text/skillId. Exact hit = 1; a hit only via
 *  the prefix-stem = 0.7 (a real signal, ranked below an exact word — and above the >0 filter). */
function relevanceOf(record, terms) {
    if (terms.length === 0)
        return 0;
    const tokens = tokenize(`${record.text} ${record.skillId}`);
    const haystack = new Set(tokens);
    let hits = 0;
    for (const term of terms) {
        if (haystack.has(term)) {
            hits += 1;
            continue;
        }
        const stem = stemOf(term);
        if (stem !== null) {
            let found = false;
            for (const t of tokens) {
                if (t.startsWith(stem)) {
                    found = true;
                    break;
                }
            }
            if (found)
                hits += 0.7;
        }
    }
    return hits;
}
/** The default memory backend — in-memory map with optional JSON-file persistence. */
export class JsonFileBackend {
    name = 'json-file';
    records = new Map();
    filePath;
    constructor(options = {}) {
        this.filePath = options.filePath;
    }
    /** Create a backend and load any records already persisted at `filePath`. */
    static async open(filePath) {
        const backend = new JsonFileBackend({ filePath });
        await backend.load();
        return backend;
    }
    /**
     * Synchronous counterpart to {@link JsonFileBackend.open}. Because this backend
     * is physically synchronous (in-memory map + sync `fs`), a hot sync path (e.g.
     * a recommender) can read the store without an async ripple.
     */
    static openSync(filePath) {
        const backend = new JsonFileBackend({ filePath });
        backend.loadSync();
        return backend;
    }
    put(record) {
        this.records.set(record.id, record);
        return Promise.resolve();
    }
    query(query) {
        return Promise.resolve(this.querySync(query));
    }
    /** Synchronous {@link JsonFileBackend.query} — same ranking, no Promise. */
    querySync(query) {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const terms = query.text !== undefined ? tokenize(query.text) : [];
        let candidates = [...this.records.values()];
        if (query.skillId !== undefined) {
            candidates = candidates.filter((record) => record.skillId === query.skillId);
        }
        const ranked = candidates
            .map((record) => ({ record, relevance: relevanceOf(record, terms) }))
            .sort((a, b) => b.relevance - a.relevance ||
            b.record.score - a.record.score ||
            b.record.timestamp.localeCompare(a.record.timestamp));
        // ASKING and finding nothing returns nothing. Without this the keyword path RANKS by overlap and
        // never EXCLUDES, so every query returned the whole store reordered — MEASURED on two records:
        // `zebrafish` (matches neither) AND `hello` (matches one) both returned both. With no usable
        // terms there was nothing to match on, and returning the store ranked by confidence stays the
        // right answer; that distinction is the whole decision (ADR-001).
        const filtered = terms.length > 0 ? ranked.filter((entry) => entry.relevance > 0) : ranked;
        return filtered.slice(0, limit).map((entry) => entry.record);
    }
    all() {
        return Promise.resolve(this.allSync());
    }
    /** Synchronous {@link JsonFileBackend.all}. */
    allSync() {
        return [...this.records.values()];
    }
    remove(id) {
        this.removeSync(id);
        return Promise.resolve();
    }
    /** Synchronous {@link JsonFileBackend.remove}. Call {@link save} to persist. */
    removeSync(id) {
        this.records.delete(id);
    }
    count() {
        return Promise.resolve(this.records.size);
    }
    /**
     * Persist every record to `filePath`. No-op when no path is configured.
     *
     * Writes atomically: serialize to a unique temp file in the same directory,
     * then `rename` over the target (atomic on POSIX). This prevents a torn/partial
     * file if the process is interrupted mid-write, and prevents a concurrent
     * reader from observing a half-written store.
     */
    save() {
        if (this.filePath !== undefined) {
            mkdirSync(dirname(this.filePath), { recursive: true });
            const tmp = `${this.filePath}.tmp-${process.pid}`;
            try {
                writeFileSync(tmp, JSON.stringify([...this.records.values()], null, 2));
                renameSync(tmp, this.filePath);
            }
            catch (err) {
                rmSync(tmp, { force: true }); // don't leak the temp file on failure
                throw err;
            }
        }
        return Promise.resolve();
    }
    /** Load records from `filePath`. No-op when no path is set or the file is absent. */
    load() {
        this.loadSync();
        return Promise.resolve();
    }
    /** Synchronous {@link JsonFileBackend.load}. */
    loadSync() {
        if (this.filePath !== undefined && existsSync(this.filePath)) {
            const data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
            for (const record of data)
                this.records.set(record.id, record);
        }
    }
}
//# sourceMappingURL=json-backend.js.map