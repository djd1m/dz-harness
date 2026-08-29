'use strict';

// manifest.js — the INDEX (sources/manifest.json) and the append-only LOG (sources/LOG.jsonl).
//
// The shape comes from the llm-wiki "Ingest" template, verified at the primary source: immutable raw
// sources, an INDEX describing them, and an append-only LOG of what was attempted. All three are
// separate on purpose. The index answers "what is in here"; the log answers "what happened, including
// what was refused" — and a refusal that leaves no trace is a refusal an operator cannot audit.
//
// APPEND-ONLY IN SPIRIT, ENFORCED IN FACT (INV-6). A re-intake of the same archive is a NO-OP: a row
// whose (path, sha256) already matches is SKIPPED and its ORIGINAL `ingested_at` survives — rewriting
// the timestamp would quietly turn "when this document entered the corpus" into "when it was last
// looked at". The same `path` with a DIFFERENT `sha256` is a `ManifestPathConflictError` and NOTHING is
// written: two different documents claiming one logical path is a question for a human, and silently
// preferring the newer one is how a corpus loses the original.
//
// TWO DURABILITY PROPERTIES, NAMED SEPARATELY — the distinction skills/case-state/engine/facts.js
// records and this file reuses rather than re-derives:
//   • temp-file + rename → answers a TORN READ: no reader ever sees half a manifest.
//   • the .intake lock   → answers a LOST UPDATE: no writer ever discards another writer's rows.
// Conflating them is the mistake; an atomic write cannot see two processes each loading N and writing
// N+1, and both exiting 0 with one archive's rows gone.
//
// THE LOG IS APPENDED INSIDE THE SAME LOCK as the manifest write, so the index and the log can never
// disagree about whether something landed.
//
// NO SECRET REACHES EITHER FILE (INV-8). This module never builds a source descriptor; run.js hands it
// one already redacted by transport.js's single `redactUrl()`. `assertRedactedSource` is a fence at the
// WRITE site as well, because "the caller redacts it" is a convention and this is a durable file in a
// patient's folder.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  withCaseLock, CaseLockUnavailableError, CaseLockEscapeError,
} = require('../../case-state/engine/lock.js');
// ONE DEFINITION OF ENTRY IDENTITY (SP-7, feature ha-manifest-provenance). `entryId` used to be
// defined here and nowhere else; a `source_anchor` must derive the SAME id or it is unresolvable
// against every corpus already on disk. The function MOVED — it was not re-implemented — and this
// module re-exports it under its original name and signature, so every existing caller is untouched.
const { entryId } = require('../../case-state/engine/source-anchor.js');
const {
  ManifestPathConflictError,
  RawZoneDriftError,
  WorkspaceRefusedError,
} = require('./errors.js');
const { INTAKE_LOCK_SCOPE } = require('../../../lib/workspace-layout.js');

const MANIFEST_SCHEMA = 'ha-intake-manifest-1';
const LOG_SCHEMA = 'ha-intake-log-1';
const MANIFEST_FILE = 'manifest.json';
const LOG_FILE = 'LOG.jsonl';
const RAW_DIRNAME = 'raw';
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/** `sources/raw/sha256-<full 64 hex>` — AM-9: the FULL digest, never a truncated prefix. */
function rawDirnameFor(archiveId) {
  return `sha256-${archiveId}`;
}

function manifestPath(sourcesDir) { return path.join(sourcesDir, MANIFEST_FILE); }
function logPath(sourcesDir) { return path.join(sourcesDir, LOG_FILE); }
function rawRoot(sourcesDir) { return path.join(sourcesDir, RAW_DIRNAME); }
function destinationFor(sourcesDir, archiveId) { return path.join(rawRoot(sourcesDir), rawDirnameFor(archiveId)); }

function emptyCatalog() {
  return { schema: MANIFEST_SCHEMA, entries: [] };
}

/**
 * loadCatalog(sourcesDir) -> { schema, entries[] }
 *
 * An ABSENT manifest is the first run — empty, not an error. An UNREADABLE or wrong-schema manifest is
 * `RawZoneDriftError`: the raw zone may hold files this process cannot account for, and starting a
 * fresh empty catalog on top of that is exactly how a corpus loses its own index.
 */
function loadCatalog(sourcesDir) {
  const file = manifestPath(sourcesDir);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return emptyCatalog();
    throw new RawZoneDriftError(
      `${file} exists but cannot be read (${err.code || err.message}). Intake will not write a new catalog ` +
      'over an unreadable one — the raw zone may hold files only that file described.',
      { reason: 'manifest_unreadable', manifest: file }
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new RawZoneDriftError(
      `${file} is not valid JSON (${err.message}). Nothing was written; fix or move the file, then re-run.`,
      { reason: 'manifest_unparseable', manifest: file }
    );
  }
  if (parsed === null || typeof parsed !== 'object' || parsed.schema !== MANIFEST_SCHEMA || !Array.isArray(parsed.entries)) {
    throw new RawZoneDriftError(
      `${file} is not a ${MANIFEST_SCHEMA} document (schema: ${JSON.stringify(parsed && parsed.schema)}).`,
      { reason: 'manifest_schema', manifest: file }
    );
  }
  return { schema: MANIFEST_SCHEMA, entries: parsed.entries.slice() };
}

/**
 * THE WRITE-SITE PRIVACY FENCE. A source descriptor reaching a durable file must carry no query
 * string, no fragment and no userinfo. run.js builds it through transport.js's one `redactUrl()`; this
 * is the assertion that a future call site which forgets cannot land the secret anyway.
 */
function assertRedactedSource(source) {
  if (source === null || typeof source !== 'object') {
    throw new TypeError('manifest: source must be an object {kind, url_redacted?, url_sha256?, local_path?, digest_source}');
  }
  const u = source.url_redacted;
  if (u !== undefined && u !== null) {
    if (typeof u !== 'string' || u.includes('?') || u.includes('#') || u.includes('@')) {
      throw new WorkspaceRefusedError(
        `manifest: refusing to write a source URL that still carries a query string, fragment or userinfo ` +
        `(${JSON.stringify(String(u).slice(0, 60))}…). A presigned URL's signature is a live credential and ` +
        'sources/manifest.json is a durable file inside a patient\'s folder (NFR-1, INV-8).',
        { reason: 'unredacted_source_url' }
      );
    }
  }
}

/**
 * mergeEntries(catalog, files, meta) -> { catalog, added[], skipped[], conflicts[] }
 *
 * PURE. It decides; it does not write. `conflicts` is non-empty ⇒ the caller must write NOTHING, which
 * is why this returns them instead of throwing: the caller is the one holding the lock and the staging
 * tree, and it is the only place that can honour "nothing was written".
 */
function mergeEntries(catalog, files, meta) {
  assertRedactedSource(meta.source);
  const byPath = new Map(catalog.entries.map((e) => [e.path, e]));
  const added = [];
  const skipped = [];
  const conflicts = [];

  for (const file of files) {
    const existing = byPath.get(file.path);
    if (existing !== undefined) {
      if (existing.sha256 === file.sha256) {
        // IMMUTABLE: the original row — and above all its original `ingested_at` — survives untouched.
        skipped.push({ path: file.path, sha256: file.sha256, entry_id: existing.entry_id });
        continue;
      }
      conflicts.push({
        path: file.path,
        existing_sha256: existing.sha256,
        incoming_sha256: file.sha256,
        existing_archive_id: existing.archive_id,
      });
      continue;
    }
    const row = {
      entry_id: entryId(file.path, file.sha256),
      path: file.path,
      stored_at: `sources/${RAW_DIRNAME}/${rawDirnameFor(meta.archiveId)}/${file.path}`,
      sha256: file.sha256,
      bytes: file.bytes,
      media_type: file.media_type,
      ingested_at: meta.ingestedAt,
      archive_id: `sha256:${meta.archiveId}`,
      source: {
        kind: meta.source.kind,
        url_redacted: meta.source.url_redacted === undefined ? null : meta.source.url_redacted,
        url_sha256: meta.source.url_sha256 === undefined ? null : meta.source.url_sha256,
        local_path: meta.source.local_path === undefined ? null : meta.source.local_path,
        digest_source: meta.source.digest_source,
      },
    };
    added.push(row);
    byPath.set(row.path, row);
  }

  return {
    catalog: { schema: MANIFEST_SCHEMA, entries: catalog.entries.concat(added) },
    added,
    skipped,
    conflicts,
  };
}

/** The refusal `conflicts` becomes, built here so its wording has one home. */
function conflictError(conflicts, manifestFile) {
  const first = conflicts[0];
  return new ManifestPathConflictError(
    `${manifestFile} already carries ${JSON.stringify(first.path)} with sha256 ${first.existing_sha256} ` +
    `(from archive ${first.existing_archive_id}); this archive offers ${first.incoming_sha256} for the same ` +
    `path${conflicts.length > 1 ? ` (and ${conflicts.length - 1} more)` : ''}. The catalog is append-only: ` +
    'two different documents cannot share one logical path, and the newer one is NOT silently preferred. ' +
    'NOTHING was written — the workspace is byte-identical.',
    { reason: 'path_sha256_conflict', conflicts }
  );
}

/** TORN-READ ANSWER: temp file in the same directory, then rename. */
function writeCatalogAtomically(sourcesDir, catalog) {
  const file = manifestPath(sourcesDir);
  const tmp = path.join(sourcesDir, `.${MANIFEST_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.mkdirSync(sourcesDir, { recursive: true, mode: DIR_MODE });
  fs.writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`, { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}

/**
 * appendLog(sourcesDir, event) — ONE line per attempt, refusals included. `fs.appendFileSync` with
 * 'a' is the append the LOG's name promises; nothing in this module ever rewrites an earlier line.
 */
function appendLog(sourcesDir, event) {
  fs.mkdirSync(sourcesDir, { recursive: true, mode: DIR_MODE });
  const line = JSON.stringify({ schema: LOG_SCHEMA, ...event });
  fs.appendFileSync(logPath(sourcesDir), `${line}\n`, { mode: FILE_MODE });
}

/**
 * inspectDestination(sourcesDir, archiveId) -> { state, destination, rows, missing[] }
 *   'absent'   nothing at the content-addressed path — a normal first intake
 *   'complete' every catalog row for this archive_id resolves and every file present is catalogued
 *   'drift'    the directory exists but the catalog cannot vouch for it
 *
 * THE PRE-STAGING SHORT-CIRCUIT (P1-5) IS BUILT ON THIS. Called BEFORE staging and — for a URL source
 * — before the DOWNLOAD, so a second intake of an already-committed archive costs no bytes over the
 * wire at all. That is only sound because the destination is content-addressed: the caller's mandatory
 * `--expect-sha256` IS the archive identity, so "this exact archive is already here" is answerable
 * without fetching it.
 *
 * It does NOT re-hash file contents — that is `--verify`'s job, and doing it on every intake would
 * make the cheap path expensive. The distinction is stated rather than blurred: this answers
 * "is the commit complete and indexed", `--verify` answers "are the bytes still what the index says".
 */
function inspectDestination(sourcesDir, archiveId) {
  const destination = destinationFor(sourcesDir, archiveId);
  let stat;
  try {
    stat = fs.lstatSync(destination);
  } catch (err) {
    if (err.code === 'ENOENT') return { state: 'absent', destination, rows: [], missing: [] };
    throw err;
  }
  if (!stat.isDirectory()) {
    return { state: 'drift', destination, rows: [], missing: [], detail: 'destination exists and is not a directory' };
  }

  const catalog = loadCatalog(sourcesDir);
  const rows = catalog.entries.filter((e) => e.archive_id === `sha256:${archiveId}`);
  if (rows.length === 0) {
    return { state: 'drift', destination, rows, missing: [], detail: 'the catalog has no row for this archive_id' };
  }

  const workspace = path.dirname(sourcesDir);
  const missing = [];
  for (const row of rows) {
    const abs = path.resolve(workspace, row.stored_at);
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size !== row.bytes) missing.push(row.stored_at);
    } catch {
      missing.push(row.stored_at);
    }
  }
  if (missing.length > 0) {
    return { state: 'drift', destination, rows, missing, detail: 'catalogued files are absent or the wrong size' };
  }

  // …and the other direction: a file present in the raw zone that the catalog does NOT describe is
  // drift too. Checking only one direction is how an extra file lives in a corpus unremarked.
  const catalogued = new Set(rows.map((r) => r.stored_at));
  const stray = [];
  for (const abs of walkFiles(destination)) {
    const rel = `sources/${path.relative(sourcesDir, abs).split(path.sep).join('/')}`;
    if (!catalogued.has(rel)) stray.push(rel);
  }
  if (stray.length > 0) {
    return { state: 'drift', destination, rows, missing: stray, detail: 'the raw zone holds files the catalog does not describe' };
  }

  return { state: 'complete', destination, rows, missing: [] };
}

function walkFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

/**
 * withIntakeLock(sourcesDir, fn) — the `.intake` scope, and the WHOLE critical section.
 *
 * SCOPE, AND WHY IT IS THIS WIDE (P2a). The lock covers destination-inspection → staging → the commit
 * rename → catalog load → merge → catalog write → log append, as ONE region. A narrower lock around
 * just the catalog cycle would leave two concurrent intakes racing the rename itself: both stage, both
 * rename, one throws a raw ENOTEMPTY (a crash, not an answer) or leaves a partial tree behind. With
 * the wide lock, the winner commits and the loser re-enters at the pre-staging short-circuit and
 * reports idempotent success.
 *
 * THE LOCK IS NOT OPTIONAL AND HAS NO FALLBACK. `harness-core` unresolvable ⇒ `CaseLockUnavailableError`
 * propagates verbatim, exactly as case-state's own writers do it: a missing lock costs a record,
 * silently, and there is no env var here that trades that for convenience. A lock TIMEOUT is mapped
 * onto the same class (a named refusal, exit 1) rather than surfacing as an unhandled harness-core
 * error, because "another intake holds this workspace" is an answer, not a crash.
 */
async function withIntakeLock(sourcesDir, fn) {
  fs.mkdirSync(sourcesDir, { recursive: true, mode: DIR_MODE });
  try {
    return await withCaseLock(sourcesDir, fn, { scopeDirname: INTAKE_LOCK_SCOPE });
  } catch (err) {
    if (err instanceof CaseLockEscapeError) {
      throw new WorkspaceRefusedError(
        `intake refuses this workspace: ${err.message}`,
        { reason: 'lock_scope_escape' }
      );
    }
    if (err && typeof err.name === 'string' && err.name.startsWith('StoreLock')) {
      throw new CaseLockUnavailableError(
        `the ${INTAKE_LOCK_SCOPE} lock for ${sourcesDir} could not be taken (${err.name}) — another intake is ` +
        'holding this workspace. Nothing was written.'
      );
    }
    throw err;
  }
}

module.exports = {
  MANIFEST_SCHEMA,
  LOG_SCHEMA,
  MANIFEST_FILE,
  LOG_FILE,
  RAW_DIRNAME,
  rawDirnameFor,
  manifestPath,
  logPath,
  rawRoot,
  destinationFor,
  emptyCatalog,
  loadCatalog,
  mergeEntries,
  conflictError,
  writeCatalogAtomically,
  appendLog,
  inspectDestination,
  withIntakeLock,
  assertRedactedSource,
  entryId,
  walkFiles,
};
