// Local single-writer corpus publication. A manifest rename is the commit point.
import {
  mkdirSync, lstatSync, openSync, closeSync, writeFileSync, readFileSync, renameSync,
  unlinkSync, rmdirSync, mkdtempSync, copyFileSync, readdirSync, createReadStream,
} from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LOCK = '.book-ingest.lock';
const JOURNAL = '.book-ingest-journal.json';
const MANIFEST = 'manifest.json';
const safeName = (name) => typeof name === 'string' && /^corpus\/[\p{L}\p{N}._-]+\.md$/u.test(name) && !name.includes('..');
function stat(path) { try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function normal(path, kind) {
  const s = stat(path);
  if (s && (s.isSymbolicLink() || !(kind === 'dir' ? s.isDirectory() : s.isFile()))) throw new Error(`unsafe ${kind}: ${path}`);
  return s;
}
function readNormal(path) { return normal(path, 'file') ? readFileSync(path) : null; }
function ownedChunks(out, manifest, missingAllowed = false) {
  if (!manifest || !Array.isArray(manifest.chunks)) throw new Error('invalid existing manifest chunks');
  const owned = new Map();
  for (const chunk of manifest.chunks) {
    const name = chunk?.file;
    if (!safeName(name) || !/^[a-f0-9]{16,64}$/.test(chunk.source_hash || '') || owned.has(name)) throw new Error(`unsafe owned chunk path/hash: ${name}`);
    const bytes = readNormal(join(out, name));
    if (!bytes && !missingAllowed) throw new Error(`missing owned chunk: ${name}`);
    if (bytes && !sha(bytes).startsWith(chunk.source_hash)) throw new Error(`modified owned chunk: ${name}`);
    owned.set(name, bytes ? sha(bytes) : null);
  }
  return owned;
}
function removeOwned(out, entries, keep = new Set()) {
  for (const [name, hash] of entries) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`unsafe journal entry: ${name}`);
    if (keep.has(name)) continue;
    const bytes = readNormal(join(out, name));
    if (bytes) {
      if (sha(bytes) !== hash) throw new Error(`modified journal-owned chunk: ${name}`);
      unlinkSync(join(out, name));
    }
  }
}
function readManifest(out) {
  const bytes = readNormal(join(out, MANIFEST));
  if (!bytes) return { bytes: null, manifest: null };
  let manifest;
  try { manifest = JSON.parse(bytes); } catch { throw new Error('invalid existing manifest JSON'); }
  return { bytes, manifest };
}
function readJournal(out) {
  const bytes = readNormal(join(out, JOURNAL));
  if (!bytes) return null;
  let journal;
  try { journal = JSON.parse(bytes); } catch { throw new Error('invalid publication journal JSON'); }
  if (journal?.version !== 1 || !/^[a-f0-9]{64}$/.test(journal.next) || (journal.previous !== null && !/^[a-f0-9]{64}$/.test(journal.previous)) || !Array.isArray(journal.old) || !Array.isArray(journal.created) || !Array.isArray(journal.current)) throw new Error('invalid publication journal');
  for (const list of [journal.old, journal.created]) for (const pair of list) if (!Array.isArray(pair) || pair.length !== 2 || !safeName(pair[0]) || !/^[a-f0-9]{64}$/.test(pair[1])) throw new Error('unsafe publication journal entry');
  if (!journal.current.every(safeName)) throw new Error('unsafe publication journal references');
  if (typeof journal.work !== 'string' || !/^\.book-ingest-txn-[A-Za-z0-9]{6}$/.test(journal.work)) throw new Error('unsafe publication journal work path');
  return journal;
}
function removeWork(out, name) {
  if (!name || !/^\.book-ingest-txn-[A-Za-z0-9]{6}$/.test(name)) return;
  const dir = join(out, name);
  if (!normal(dir, 'dir')) return;
  const children = readdirSync(dir);
  for (const child of children) {
    if (!/^(snapshot\.pdf|manifest\.json|journal\.json|candidate-[0-9]+)$/.test(child) || !normal(join(dir, child), 'file')) throw new Error(`unsafe work file: ${child}`);
  }
  for (const child of children) unlinkSync(join(dir, child));
  rmdirSync(dir);
}
function recover(out) {
  const journal = readJournal(out);
  if (!journal) return;
  const { bytes, manifest } = readManifest(out);
  const actual = bytes ? sha(bytes) : null;
  if (actual !== journal.previous && actual !== journal.next) throw new Error('publication journal manifest identity mismatch');
  const current = new Set(journal.current);
  if (actual === journal.previous) {
    if (manifest) ownedChunks(out, manifest);
    removeOwned(out, journal.created, new Set(manifest?.chunks.map((c) => c.file) || []));
  } else {
    if (!manifest) throw new Error('publication journal missing new manifest');
    ownedChunks(out, manifest);
    removeOwned(out, journal.old, current);
  }
  removeWork(out, journal.work);
  unlinkSync(join(out, JOURNAL));
}
async function streamHash(file) {
  const hash = createHash('sha256');
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest('hex');
}
export async function beginPublication(outDir, source) {
  const out = resolve(outDir);
  if (!normal(out, 'dir')) mkdirSync(out, { recursive: true });
  normal(out, 'dir');
  const corpus = join(out, 'corpus');
  if (!normal(corpus, 'dir')) mkdirSync(corpus);
  const lock = join(out, LOCK);
  if (stat(lock)) throw new Error(`output locked: ${lock}; verify owner stopped before manual removal`);
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); writeFileSync(fd, JSON.stringify({ pid: process.pid, created: new Date().toISOString() })); closeSync(fd); }
  catch (e) { if (fd !== undefined) closeSync(fd); throw new Error(`output locked or lock unavailable: ${lock}: ${e.message}`); }
  let work;
  try {
    recover(out);
    // A crash before the journal needs no live rollback, only private work cleanup.
    for (const child of readdirSync(out)) if (/^\.book-ingest-txn-[A-Za-z0-9]{6}$/.test(child)) removeWork(out, child);
    const prior = readManifest(out);
    const old = prior.manifest ? ownedChunks(out, prior.manifest) : new Map();
    work = mkdtempSync(join(out, '.book-ingest-txn-'));
    const snapshot = join(work, 'snapshot.pdf');
    copyFileSync(source, snapshot);
    const sourceSha256 = await streamHash(snapshot);
    const lockStat = lstatSync(lock);
    return { out, work, snapshot, sourceSha256, prior, old, lock, lockStat, committed: false };
  } catch (e) {
    if (work) removeWork(out, basename(work));
    unlinkSync(lock);
    throw e;
  }
}
export function publishCorpus(tx, manifest, contents) {
  const { out, work, prior, old } = tx;
  const manifestPath = join(out, MANIFEST);
  const journalPath = join(out, JOURNAL);
  const stagedManifest = join(work, 'manifest.json');
  const stagedJournal = join(work, 'journal.json');
  const names = new Set();
  const created = [];
  const stagedCandidates = [];
  for (const [name, bytes] of contents) {
    if (!safeName(name) || names.has(name)) throw new Error(`unsafe or duplicate new chunk: ${name}`);
    names.add(name);
    const existing = readNormal(join(out, name));
    if (existing && !existing.equals(bytes)) throw new Error(`destination collision: ${name}`);
    if (!existing) {
      created.push([name, sha(bytes)]);
      const staged = join(work, `candidate-${stagedCandidates.length}`);
      writeFileSync(staged, bytes, { flag: 'wx' });
      stagedCandidates.push([name, staged]);
    }
  }
  if (prior.bytes && !readNormal(manifestPath).equals(prior.bytes)) throw new Error('existing manifest changed during ingest');
  if (!prior.bytes && readNormal(manifestPath)) throw new Error('manifest appeared during ingest');
  for (const [name, hash] of old) {
    const bytes = readNormal(join(out, name));
    if (!bytes || sha(bytes) !== hash) throw new Error(`modified owned chunk during ingest: ${name}`);
  }
  const next = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const journal = {
    version: 1, previous: prior.bytes ? sha(prior.bytes) : null, next: sha(next),
    old: [...old], created, current: [...names], work: basename(work),
  };
  writeFileSync(stagedManifest, next, { flag: 'wx' });
  writeFileSync(stagedJournal, JSON.stringify(journal), { flag: 'wx' });
  renameSync(stagedJournal, journalPath); // durable recovery record before live mutations
  try {
    for (const [name, staged] of stagedCandidates) {
      const path = join(out, name);
      if (normal(path, 'file')) throw new Error(`destination appeared: ${name}`);
      renameSync(staged, path);
    }
    renameSync(stagedManifest, manifestPath); // commit point
    tx.committed = true;
    removeOwned(out, journal.old, names);
    unlinkSync(journalPath);
  } catch (e) {
    if (!tx.committed) {
      try { recover(out); } catch (rollback) { throw new AggregateError([e, rollback], 'publication failed; recovery journal retained'); }
      throw e;
    }
    throw new Error(`new revision active; cleanup incomplete: ${e.message}`);
  }
}
export function endPublication(tx) {
  // Keep work listed by an unresolved journal for recovery on the next run.
  if (!normal(join(tx.out, JOURNAL), 'file')) removeWork(tx.out, basename(tx.work));
  const actualLock = stat(tx.lock);
  if (!actualLock || !actualLock.isFile() || actualLock.ino !== tx.lockStat.ino || actualLock.dev !== tx.lockStat.dev) throw new Error('publication lock changed; manual inspection required');
  unlinkSync(tx.lock);
}
export function contentPath(id, bytes) {
  return `corpus/${id}-${sha(bytes)}.md`;
}
