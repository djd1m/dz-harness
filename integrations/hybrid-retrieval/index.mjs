/** Immutable, revision-bound Lance snapshots. No provider or application dependencies. */
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile, rename, rm, lstat} from 'node:fs/promises';
import {resolve, dirname, basename, join} from 'node:path';
import * as lance from '@lancedb/lancedb';

export class SnapshotError extends Error {
  constructor(code, message, options) { super(message, options); this.name = 'SnapshotError'; this.code = code; }
}
const fail = (code, message) => { throw new SnapshotError(code, message); };
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaultLexicalize = text => text;
const DEFAULT_LEXICALIZER = 'identity-v1';
const MAX_DOCUMENTS = 10000;
function boundedString(value, maximum) { return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum; }
function optionsIdentity({revision, model, dimensions, lexicalize = defaultLexicalize, lexicalizerId}) {
  lexicalizerId ??= lexicalize === defaultLexicalize ? DEFAULT_LEXICALIZER : undefined;
  if (!boundedString(revision, 256) || !boundedString(model, 256) || !boundedString(lexicalizerId, 256) ||
      !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 8192 || typeof lexicalize !== 'function') {
    fail('INVALID_CONFIG', 'Revision, model, dimensions and lexicalizer identity are required');
  }
  return {identity: {revision, model, dimensions, lexicalizerId}, lexicalize};
}
function lexicalText(lexicalize, text) {
  let result;
  try { result = lexicalize(text); } catch (error) { throw new SnapshotError('INVALID_LEXICALIZER', 'Lexicalizer failed', {cause: error}); }
  const value = Array.isArray(result) && result.every(x => typeof x === 'string') ? result.join(' ') : result;
  if (typeof value !== 'string' || value.length > 200000) fail('INVALID_LEXICALIZER', 'Lexicalizer must return bounded text or string tokens');
  return value;
}
function vectorValue(vector, dimensions) {
  if ((!Array.isArray(vector) && !ArrayBuffer.isView(vector)) || vector.length !== dimensions) fail('INVALID_VECTOR', 'Vector dimension mismatch');
  const result = Array.from(vector, x => typeof x === 'number' ? Math.fround(x) : NaN);
  const squaredNorm = Math.fround(result.reduce((sum, x) => sum + x * x, 0));
  if (!result.every(Number.isFinite) || !Number.isFinite(squaredNorm) || squaredNorm <= 0) fail('INVALID_VECTOR', 'Vector must have finite nonzero Float32 squared magnitude');
  return result;
}
function rowsFor(documents, dimensions, lexicalize) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > MAX_DOCUMENTS) fail('INVALID_DOCUMENTS', 'Expected 1–10000 documents');
  const ids = new Set();
  return documents.map(doc => {
    if (!doc || !boundedString(doc.id, 1024) || !boundedString(doc.text, 100000) || ids.has(doc.id)) fail('INVALID_DOCUMENTS', 'Documents require unique IDs and nonempty text');
    ids.add(doc.id);
    return {id: doc.id, text: doc.text, lexical: lexicalText(lexicalize, doc.text), vector: vectorValue(doc.vector, dimensions)};
  }).sort(compareId);
}
async function absent(path) {
  try { await lstat(path); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
function identityMatches(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value);
}

/** Publish a complete new generation; existing generations are never replaced. */
export async function buildSnapshot(options) {
  const {identity, lexicalize} = optionsIdentity(options);
  if (!boundedString(options.directory, 4096)) fail('INVALID_CONFIG', 'Snapshot directory required');
  const directory = resolve(options.directory), parent = dirname(directory);
  const rows = rowsFor(options.documents, identity.dimensions, lexicalize);
  await mkdir(parent, {recursive: true});
  const lock = directory + '.build-lock';
  try { await mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') fail('SNAPSHOT_EXISTS', 'Snapshot build already exists');
    throw new SnapshotError('SNAPSHOT_IO', 'Cannot lock snapshot build', {cause: error});
  }
  let stage, db, table;
  try {
    if (!await absent(directory)) fail('SNAPSHOT_EXISTS', 'Snapshot generation already exists');
    stage = await mkdtemp(join(parent, '.' + basename(directory) + '.staging-'));
    db = await lance.connect(join(stage, 'lance'));
    table = await db.createTable('documents', rows);
    await table.createIndex('lexical', {config: lance.Index.fts({baseTokenizer: 'simple', stem: false, removeStopWords: false, lowercase: true})});
    const manifest = {schema: 1, ...identity, createdAt: new Date().toISOString(), count: rows.length, contentDigest: digest(rows)};
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest) + '\n', {flag: 'wx'});
    table.close(); table = null; db.close(); db = null;
    // Validate the actual persisted Float32 rows before publication.
    const verified = await openSnapshot({...options, directory: stage});
    verified.close();
    if (!await absent(directory)) fail('SNAPSHOT_EXISTS', 'Snapshot generation already exists');
    await rename(stage, directory); stage = null;
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError('SNAPSHOT_IO', 'Snapshot build failed', {cause: error});
  } finally {
    table?.close(); db?.close();
    if (stage) await rm(stage, {recursive: true, force: true});
    await rm(lock, {recursive: true});
  }
  return openSnapshot(options);
}

/** Open and fully verify a generation against caller-owned expected identity. */
export async function openSnapshot(options) {
  const {identity, lexicalize} = optionsIdentity(options);
  if (!boundedString(options.directory, 4096)) fail('INVALID_CONFIG', 'Snapshot directory required');
  const directory = resolve(options.directory);
  let db, table;
  try {
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (!identityMatches(manifest, identity)) fail('IDENTITY_MISMATCH', 'Snapshot identity does not match caller');
    if (manifest.schema !== 1 || !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > MAX_DOCUMENTS || !/^[a-f0-9]{64}$/.test(manifest.contentDigest)) fail('SNAPSHOT_CORRUPT', 'Invalid snapshot manifest');
    // Connect only after checking the existing table path; connect itself can create directories.
    if (!(await lstat(join(directory, 'lance', 'documents.lance'))).isDirectory()) fail('SNAPSHOT_CORRUPT', 'Snapshot table missing');
    db = await lance.connect(join(directory, 'lance'));
    table = await db.openTable('documents');
    const stored = await table.query().limit(MAX_DOCUMENTS + 1).toArray();
    const rows = rowsFor(stored.map(row => ({id: row.id, text: row.text, vector: Array.from(row.vector)})), identity.dimensions, lexicalize);
    const actualLexical = new Map(stored.map(row => [row.id, row.lexical]));
    if (rows.length !== manifest.count || digest(rows) !== manifest.contentDigest || rows.some(row => row.lexical !== actualLexical.get(row.id))) fail('SNAPSHOT_CORRUPT', 'Snapshot content does not match manifest');
    const info = Object.freeze({...identity});
    let closed = false;
    return Object.freeze({
      ...info, identity: info,
      async search({query, vector, revision, limit = 5}) {
        if (closed) fail('SNAPSHOT_CLOSED', 'Snapshot is closed');
        if (revision !== identity.revision) fail('IDENTITY_MISMATCH', 'Query revision mismatch');
        if (!boundedString(query, 6000) || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('INVALID_QUERY', 'Invalid query or limit');
        const checked = vectorValue(vector, identity.dimensions), term = lexicalText(lexicalize, query);
        try {
          // No ANN index: exact cosine scan + native FTS/RRF at the requested candidate limit.
          let search = table.vectorSearch(checked).distanceType('cosine');
          if (term.trim()) search = search.fullTextSearch(term, {columns: ['lexical']});
          const found = await search.select(['id']).limit(limit).toArray();
          const hits = found.map(row => ({id: row.id, score: term.trim() ? row._relevance_score : 1 - row._distance}));
          if (hits.some(hit => !Number.isFinite(hit.score))) fail('SNAPSHOT_CORRUPT', 'Invalid search scores');
          hits.sort((a, b) => b.score - a.score || compareId(a, b));
          return {...info, hits: hits.slice(0, limit)};
        } catch (error) {
          if (error instanceof SnapshotError) throw error;
          throw new SnapshotError('SEARCH_FAILED', 'Snapshot search failed', {cause: error});
        }
      },
      close() { if (!closed) { closed = true; table.close(); db.close(); } },
    });
  } catch (error) {
    table?.close(); db?.close();
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError('SNAPSHOT_CORRUPT', 'Cannot open snapshot', {cause: error});
  }
}
