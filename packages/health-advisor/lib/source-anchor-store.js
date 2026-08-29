'use strict';

// source-anchor-store.js — the two legs that touch the corpus: STAMP (mint an anchor from a real
// manifest row) and RESOLVE (go back to the primary bytes, verifying before reading).
//
// READ-ONLY, ALWAYS. Nothing in this file writes a byte, appends a log line, repairs a manifest or
// caches a catalog. `intake-archive` owns every write into `sources/`; `intake-archive --verify` owns
// the corpus-wide sweep. This module answers one narrower question — "do the bytes this one anchor
// names still match the row it names?" — and it re-reads the answer from disk every time, because a
// mechanism that consults its own earlier answer is answering the wrong question (verify.js's oracle
// doctrine, verbatim). SP-8 is the proof: the whole workspace is byte-identical around EVERY path,
// including every refusal, and zero LOG lines are appended.
//
// NO NETWORK (NFR-3). This file requires `node:fs`, `node:path`, `node:crypto` and two local modules.
// It sits under `lib/`, which `lib/appraisal-egress-scan.js` walks WHOLE, so the guarantee is
// structural — an added `node:http` here is caught by an existing test, not by review.
//
// THE FILESYSTEM ADDRESS COMES FROM THE ROW, NEVER FROM THE ANCHOR (D1, D9). The anchor deliberately
// has no `stored_at`: if it did, a caller could read a file BY THE ANCHOR'S OWN PATH rather than by
// the path the catalog vouches for, and the verification would be checking the tamperer's homework.
//
// VERIFY BEFORE READ, IN THIS ORDER, WITH NO BYPASS (SP-1). There is no option, flag or environment
// variable that returns bytes past the sha256 comparison. This is deliberately stricter than
// `facts.makeCitedClaim`, which has `acknowledgeStale`: staleness is a judgement a human can own, but
// a sha256 mismatch means THESE ARE NOT THE BYTES THE ANALYSIS WAS WRITTEN ABOUT, and there is
// nothing to acknowledge.
//
// HONEST SCOPE, STATED NOT IMPLIED: a clean `resolveAnchor` proves the bytes on disk still match the
// row the anchor names. It does NOT prove the manifest itself was never rewritten — that is
// `intake-archive --verify`'s both-directions job, plus `sources/LOG.jsonl`. The two are
// complementary and the README says so in the same words.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  ANCHOR_SCHEMA, SourceAnchorInvalidError,
  entryId, logicalPathProblem, makeAnchor, validateAnchor,
} = require('./source-anchor.js');
// The ONE catalog reader (D5) — `loadCatalog` already fails closed with `RawZoneDriftError` on an
// unreadable / unparseable / wrong-schema manifest. Reused, never re-implemented: a second reader
// would be a second answer to "is this catalog trustworthy".
const { loadCatalog, RAW_DIRNAME } = require('../skills/intake-archive/engine/manifest.js');
// The ONE definition of directory identity (F3-5) — the same exported function `session.js` and
// `lock.js` take every scope decision on. AM-2's cross-case guard must not re-derive it.
const { realCaseDir } = require('../skills/case-state/engine/lock.js');

/** The resolve-phase taxonomy. Deliberately NOT a seventeenth member of intake's REFUSALS (AM-3). */
const ANCHOR_REFUSALS = Object.freeze([
  'anchor_not_in_manifest',
  'anchor_ambiguous',
  'anchor_row_mismatch',
  'anchor_escapes_raw_zone',
  'anchor_file_missing',
  'anchor_sha256_drift',
  'anchor_cross_case',
]);

class AnchorResolveError extends Error {
  constructor(message, details = {}) {
    super(message);
    const Klass = new.target;
    this.name = Klass.name;
    this.code = Klass.code;
    this.reason = Klass.reason;
    for (const [k, v] of Object.entries(details)) {
      if (['name', 'code', 'reason', 'message', 'stack'].includes(k)) continue;
      this[k] = v;
    }
  }

  toJSON() {
    return { name: this.name, code: this.code, reason: this.reason, message: this.message };
  }
}

class AnchorNotInManifestError extends AnchorResolveError {}
AnchorNotInManifestError.code = 'EANCHORNOTINMANIFEST';
AnchorNotInManifestError.reason = 'anchor_not_in_manifest';

class AnchorAmbiguousError extends AnchorResolveError {}
AnchorAmbiguousError.code = 'EANCHORAMBIGUOUS';
AnchorAmbiguousError.reason = 'anchor_ambiguous';

class AnchorRowMismatchError extends AnchorResolveError {}
AnchorRowMismatchError.code = 'EANCHORROWMISMATCH';
AnchorRowMismatchError.reason = 'anchor_row_mismatch';

class AnchorEscapesRawZoneError extends AnchorResolveError {}
AnchorEscapesRawZoneError.code = 'EANCHORESCAPESRAWZONE';
AnchorEscapesRawZoneError.reason = 'anchor_escapes_raw_zone';

class AnchorFileMissingError extends AnchorResolveError {}
AnchorFileMissingError.code = 'EANCHORFILEMISSING';
AnchorFileMissingError.reason = 'anchor_file_missing';

class AnchorDriftError extends AnchorResolveError {}
AnchorDriftError.code = 'EANCHORDRIFT';
AnchorDriftError.reason = 'anchor_sha256_drift';

class AnchorCrossCaseError extends AnchorResolveError {}
AnchorCrossCaseError.code = 'EANCHORCROSSCASE';
AnchorCrossCaseError.reason = 'anchor_cross_case';

const ANCHOR_REFUSAL_DESCRIPTORS = Object.freeze([
  { reason: AnchorNotInManifestError.reason, code: AnchorNotInManifestError.code, Class: AnchorNotInManifestError },
  { reason: AnchorAmbiguousError.reason, code: AnchorAmbiguousError.code, Class: AnchorAmbiguousError },
  { reason: AnchorRowMismatchError.reason, code: AnchorRowMismatchError.code, Class: AnchorRowMismatchError },
  { reason: AnchorEscapesRawZoneError.reason, code: AnchorEscapesRawZoneError.code, Class: AnchorEscapesRawZoneError },
  { reason: AnchorFileMissingError.reason, code: AnchorFileMissingError.code, Class: AnchorFileMissingError },
  { reason: AnchorDriftError.reason, code: AnchorDriftError.code, Class: AnchorDriftError },
  { reason: AnchorCrossCaseError.reason, code: AnchorCrossCaseError.code, Class: AnchorCrossCaseError },
]);

/** `<workspace>/sources` — the one place a catalog lives (lib/workspace-layout.js's tree). */
function sourcesDirFor({ workspace, sourcesDir }) {
  if (typeof sourcesDir === 'string' && sourcesDir.trim() !== '') return path.resolve(sourcesDir);
  if (typeof workspace === 'string' && workspace.trim() !== '') return path.resolve(workspace, 'sources');
  throw new TypeError('source-anchor-store: one of { workspace, sourcesDir } is required');
}

/**
 * findRow(sourcesDir, selector) → row | null
 *
 * THE one "load the catalog and select a row" implementation (D5). A MISS RETURNS `null` — it does
 * not throw. That is FR-2.1's "the stamper never throws on a lookup miss": "this document is not in
 * the corpus" is an ordinary answer a caller decides about (open a question, ask for the archive),
 * not a refusal. AMBIGUITY does throw, because "which of these two documents did you mean" is a
 * question only a human can answer — the `ManifestPathConflictError` posture, which refuses rather
 * than silently preferring a row.
 */
function findRow(sourcesDir, selector = {}) {
  const { entryId: wantEntryId, path: wantPath, sha256: wantSha256 } = selector;
  if (wantEntryId === undefined && wantPath === undefined && wantSha256 === undefined) {
    throw new TypeError('findRow(sourcesDir, selector): give at least one of { entryId, path, sha256 }');
  }
  const catalog = loadCatalog(path.resolve(sourcesDir));
  const matches = catalog.entries.filter((row) => (
    (wantEntryId === undefined || row.entry_id === wantEntryId)
    && (wantPath === undefined || row.path === wantPath)
    && (wantSha256 === undefined || row.sha256 === wantSha256)
  ));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    // The manifest deduplicates by logical PATH, so one sha256 legitimately appears under two paths.
    throw new AnchorAmbiguousError(
      `${matches.length} catalog rows match ${JSON.stringify(selector)} in ${path.join(sourcesDir, 'manifest.json')} ` +
      `(${matches.map((r) => r.path).join(', ')}). Which document did you mean? Nothing was stamped or read.`,
      { selector, paths: matches.map((r) => r.path) }
    );
  }
  return matches[0];
}

/**
 * stampFromManifest({workspace|sourcesDir, path?, sha256?, entryId?}) → frozen anchor | null
 *
 * WRITES NOTHING (architecture §4.B). It returns a value object; whichever caller was building a
 * `labs[]` row or an `ha-finding-1` quoted value writes it, under that caller's existing lock
 * obligation (`skills/case-state/engine/anchor-write.js` is the one this feature ships).
 *
 * A MISS RETURNS `null`, and there is NO "stamp it anyway with what you told me" mode: the anchor's
 * three mandatory fields always come from a row that was actually read off disk. An anchor
 * synthesised from a caller's own strings would be a claim about a corpus nobody checked.
 */
function stampFromManifest(opts = {}) {
  const dir = sourcesDirFor(opts);
  const selector = {};
  if (opts.path !== undefined) {
    // AM-5 — the write-site fence, at the LOOKUP: an absolute OS path never becomes a selector, so it
    // can never round-trip into a durable file. Refused loudly rather than silently missing.
    const problem = logicalPathProblem(opts.path);
    if (problem !== null) {
      throw new SourceAnchorInvalidError(
        'anchor_shape',
        `stampFromManifest: path ${problem}. Reuse the manifest row's own logical path verbatim — a ` +
        'write site that re-derives its own path is a write site that can point outside the corpus (AM-5).',
        { path: opts.path }
      );
    }
    selector.path = opts.path;
  }
  if (opts.sha256 !== undefined) selector.sha256 = opts.sha256;
  if (opts.entryId !== undefined) selector.entryId = opts.entryId;

  const row = findRow(dir, selector);
  if (row === null) return null;
  return makeAnchor({
    entry_id: row.entry_id,
    path: row.path,
    sha256: row.sha256,
    archive_id: row.archive_id,
    ingested_at: row.ingested_at,
  });
}

/** Digest of a buffer ALREADY IN HAND — never of a path (see the single-read rule below). */
function sha256OfBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** `realpath` where it exists; the lexical path where it does not (never a silent `null`). */
function realpathOrAbs(p) {
  try { return fs.realpathSync(p); } catch (err) { if (err.code !== 'ENOENT') throw err; return path.resolve(p); }
}

/**
 * The shared verify-then-read core behind `resolveAnchor` and `readAnchoredBytes`.
 *
 * `caseDir` IS MANDATORY (AM-2), and that is load-bearing rather than defensive. `session.js`'s
 * `openCase` already computes `realCaseDir(caseDir)` once, precisely to close this class of bug for
 * `questionsPath` / `factsPath` (its own "signature defect class" comment). An `entry_id` is a short
 * hex string that travels in documents; copy-pasted into another patient's session it would resolve
 * against THAT workspace's manifest and hand back THAT patient's bytes. The function refuses rather
 * than trusting silence.
 *
 * The step order below is the safety property, not an implementation detail: nothing is READ until
 * step 8 has agreed, and step 8 compares against the ROW's sha256, which came off disk in step 4.
 *
 * SINGLE READ (G1, fix round 1, 2026-08-17). The primary file is read into a buffer EXACTLY ONCE, in
 * step 8, and the digest is computed over THAT buffer; `readAnchoredBytes` returns THAT same buffer.
 * The earlier shape — one `readFileSync` to hash, a second to return — left a TOCTOU window in which
 * an external writer could swap the blob between the two reads and receive `verified: true` alongside
 * bytes whose digest is NOT the anchor's (MEASURED by QE, the intake F1 twin). The read is a
 * consequence of verification (ADR D-4), so there is one read, and the verified bytes ARE the
 * returned bytes by construction, not by timing.
 */
function resolveAnchorSingleRead(anchor, opts = {}) {
  const dir = sourcesDirFor(opts);

  if (opts.caseDir === undefined || opts.caseDir === null || String(opts.caseDir).trim() === '') {
    throw new TypeError(
      'resolveAnchor(anchor, {sourcesDir|workspace, caseDir}): caseDir is REQUIRED. An entry_id copied ' +
      'from another case would otherwise resolve against this workspace\'s manifest and return another ' +
      'patient\'s bytes (AM-2). There is no default.'
    );
  }

  // 1 — shape. 2 — the over-determination check (D2) lives inside validateAnchor.
  const problems = validateAnchor(anchor, 'source_anchor', []);
  if (problems.length > 0) {
    throw new SourceAnchorInvalidError('anchor_shape', `refusing to resolve an invalid source anchor:\n  - ${problems.join('\n  - ')}`, { problems });
  }

  // 3 — CASE SCOPE. The workspace whose catalog we are about to open must BE the case directory the
  // caller named, as the filesystem sees both (`realCaseDir`, the one exported definition).
  const workspace = path.dirname(dir);
  const realWorkspace = realCaseDir(workspace);
  const realCase = realCaseDir(String(opts.caseDir));
  if (realWorkspace !== realCase) {
    throw new AnchorCrossCaseError(
      `source anchor ${anchor.entry_id} was resolved against ${JSON.stringify(dir)}, whose workspace ` +
      `${JSON.stringify(realWorkspace)} is NOT the case directory ${JSON.stringify(realCase)} the caller ` +
      'named. An entry_id is portable text; a corpus is not. Nothing was read.',
      { entry_id: anchor.entry_id, workspace: realWorkspace, caseDir: realCase }
    );
  }

  // 4 — the row, re-read from disk every time.
  const row = findRow(dir, { entryId: anchor.entry_id });
  if (row === null) {
    throw new AnchorNotInManifestError(
      `no catalog row in ${path.join(dir, 'manifest.json')} carries entry_id ${anchor.entry_id} ` +
      `(${JSON.stringify(anchor.path)}). The anchor names a document this corpus does not index.`,
      { entry_id: anchor.entry_id, path: anchor.path }
    );
  }

  // 5 — the MANIFEST is the authority; the anchor is a claim about it. EVERY optional anchor field
  // is compared, `ingested_at` included (G2, fix round 1): the rule is unconditional, and a stamped
  // intake date that survives resolution unchecked would let a durable document carry a years-wrong
  // provenance date with `verified: true`.
  for (const field of ['path', 'sha256', 'archive_id', 'ingested_at']) {
    if (anchor[field] === undefined) continue;
    if (row[field] !== anchor[field]) {
      throw new AnchorRowMismatchError(
        `source anchor ${anchor.entry_id} says ${field}=${JSON.stringify(anchor[field])} but the catalog row ` +
        `says ${JSON.stringify(row[field])}. The manifest is the authority; nothing was read.`,
        { entry_id: anchor.entry_id, field, anchor: anchor[field], row: row[field] }
      );
    }
  }

  // 6 — the filesystem address comes from the ROW, and it must stay inside the raw zone ON REALPATH.
  const rawRoot = realpathOrAbs(path.join(dir, RAW_DIRNAME));
  const absPath = realpathOrAbs(path.resolve(workspace, row.stored_at));
  if (absPath !== rawRoot && !absPath.startsWith(rawRoot + path.sep)) {
    throw new AnchorEscapesRawZoneError(
      `catalog row ${row.entry_id} stores ${JSON.stringify(row.stored_at)}, which resolves to ` +
      `${JSON.stringify(absPath)} — OUTSIDE the raw zone ${JSON.stringify(rawRoot)}. A link out of the ` +
      'corpus is not a shortcut into it; nothing was read.',
      { entry_id: row.entry_id, stored_at: row.stored_at, absPath, rawRoot }
    );
  }

  // 7 — present, and a regular file.
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch (err) {
    throw new AnchorFileMissingError(
      `the primary document for entry_id ${row.entry_id} (${row.stored_at}) is not readable ` +
      `(${err.code || err.message}). It is catalogued and absent — that is drift of the raw zone, not a miss.`,
      { entry_id: row.entry_id, stored_at: row.stored_at, absPath }
    );
  }
  if (!stat.isFile()) {
    throw new AnchorFileMissingError(
      `the primary document for entry_id ${row.entry_id} (${row.stored_at}) is not a regular file.`,
      { entry_id: row.entry_id, stored_at: row.stored_at, absPath }
    );
  }

  // 8 — THE NAMED DRIFT REFUSAL, over the ONE and only read of the primary. Size and digest are ONE
  // property ("these are not the bytes the catalog vouches for") and therefore ONE class: splitting
  // them would let a truncating editor produce a "file missing" refusal for a file that is plainly
  // present. The size compared is the BUFFER's length — the length of the bytes actually in hand —
  // not `stat.size`, which was sampled earlier and could describe a different file version (G1).
  const buffer = fs.readFileSync(absPath);
  const actualSha256 = sha256OfBuffer(buffer);
  if (actualSha256 !== row.sha256 || (typeof row.bytes === 'number' && buffer.length !== row.bytes)) {
    throw new AnchorDriftError(
      `SHA-256 DRIFT: ${row.stored_at} now hashes to ${actualSha256} (${buffer.length} bytes) but the catalog ` +
      `records ${row.sha256} (${row.bytes} bytes). These are NOT the bytes the analysis was written ` +
      'about. Nothing was read, and there is no flag that reads them anyway.',
      { entry_id: row.entry_id, stored_at: row.stored_at, expected: row.sha256, actual: actualSha256, expectedBytes: row.bytes, actualBytes: buffer.length }
    );
  }

  // 9 — only past step 8. The buffer travels alongside, NOT inside, the frozen resolution: only
  // `readAnchoredBytes` hands it out, and when it does, it hands out the verified bytes themselves.
  const resolved = Object.freeze({
    schema: ANCHOR_SCHEMA,
    entry_id: row.entry_id,
    path: row.path,
    storedAt: row.stored_at,
    absPath,
    bytes: buffer.length,
    sha256: row.sha256,
    mediaType: row.media_type === undefined ? null : row.media_type,
    verified: true,
  });
  return { resolved, buffer };
}

/** resolveAnchor(anchor, {sourcesDir|workspace, caseDir}) → {..., verified: true} — metadata only. */
function resolveAnchor(anchor, opts = {}) {
  return resolveAnchorSingleRead(anchor, opts).resolved;
}

/**
 * readAnchoredBytes(anchor, opts) → { ...resolveAnchor(...), buffer }
 * The returned `buffer` IS the buffer step 8 hashed — one read, no re-read window (G1). The read is
 * a consequence of the verification, never parallel to it.
 */
function readAnchoredBytes(anchor, opts = {}) {
  const { resolved, buffer } = resolveAnchorSingleRead(anchor, opts);
  return Object.freeze({ ...resolved, buffer });
}

module.exports = {
  ANCHOR_REFUSALS, ANCHOR_REFUSAL_DESCRIPTORS,
  AnchorResolveError,
  AnchorNotInManifestError, AnchorAmbiguousError, AnchorRowMismatchError,
  AnchorEscapesRawZoneError, AnchorFileMissingError, AnchorDriftError, AnchorCrossCaseError,
  sourcesDirFor, findRow, stampFromManifest, resolveAnchor, readAnchoredBytes,
};
