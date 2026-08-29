'use strict';

// extract.js — the only file that writes archive CONTENT, and it writes it TWICE-REMOVED from
// sources/: first into a staging tree nobody reads, then into place with ONE rename (INV-1).
//
// THE PROPERTY: THERE IS NO SUCH THING AS A PARTIAL CORPUS. A patient's raw zone either gains a
// complete archive or gains nothing. Not "gains most of it and logs an error" — a half-extracted set
// of lab reports is worse than none, because every later reader (and every later agent) treats what is
// present as what exists. So every byte lands in `sources/.intake-staging/<rand>/` and the LAST act of
// a successful extraction is a single `rename()` into `sources/raw/sha256-<hex>/`.
//
// THE STAGING ROOT SHARES A FILESYSTEM WITH THE DESTINATION, AND THAT IS LOAD-BEARING. `rename(2)` is
// atomic only within one filesystem; across one it becomes copy-then-unlink, which is exactly the
// partial-corpus window this design exists to close. That is why staging lives under the workspace's
// own `sources/` and NOT under `os.tmpdir()` — the convenient choice would have silently removed the
// guarantee while keeping the code shape.
//
// BUDGETS ARE ENFORCED TWICE, AND THE SECOND TIME IS THE ONE THAT COUNTS (INV-5b). zip.js checks
// DECLARED sizes; a central directory is a claim an attacker writes. `maxOutputLength` here caps the
// ACTUAL inflated bytes, so an archive that declares 1 KB and expands to 100 MB is stopped by this
// file and not by the plan phase. A test where BOTH caps would fire proves neither, which is why the
// hardening suite drives a deliberately UNDER-declaring archive.
//
// THE ARCHIVE ID IS NOT RECOMPUTED HERE (P2e/AM-9). It comes from the VerifiedArchive receipt, hashed
// exactly once by digest.js. Two independent computations of one identity can disagree, and the
// disagreement would surface as a directory name that its own catalog row does not describe.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { assertVerifiedArchive } = require('./digest.js');
const { inflateEntry, crc32 } = require('./zip.js');
const {
  LimitExceededError,
  MalformedArchiveError,
  RawZoneDriftError,
  HeaderNameMismatchError,
} = require('./errors.js');

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

const MEDIA_TYPES = Object.freeze({
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.dcm': 'application/dicom',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
});

/**
 * mediaTypeOf(entryPath) — declared by EXTENSION, and that is stated as what it is: a label, not a
 * classification. Automatic content classification / OCR is explicitly out of scope
 * (01_requirements.md §6), so this file never claims to know what a document IS.
 */
function mediaTypeOf(entryPath) {
  return MEDIA_TYPES[path.extname(entryPath).toLowerCase()] || 'application/octet-stream';
}

function fsyncPath(target, isDir) {
  try {
    const fd = fs.openSync(target, isDir ? 'r' : 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch {
    // fsync is a DURABILITY improvement, not a correctness precondition of the rename ordering. On a
    // filesystem or platform that refuses to fsync a directory handle the atomic rename still holds;
    // pretending otherwise by failing the run would trade a real guarantee for a theatrical one.
  }
}

/**
 * applyPlan(plan, options) -> { archiveId, destination, files[], idempotent }
 *
 * options:
 *   receipt       the VerifiedArchive — the SOLE source of `archiveId` (P2e)
 *   stagingRoot   `<ws>/sources/.intake-staging/<rand>` — same filesystem as `destination`
 *   destination   `<ws>/sources/raw/sha256-<hex>`
 *   limits        resolved budgets
 *   inspectExisting(destination) -> 'complete' | 'drift'  — consulted ONLY on a rename collision
 *   beforeCommit()  a test seam: the controlled kill-point between the last staging write and the
 *                   rename. Production passes nothing; the no-partial-corpus test throws from it.
 */
function applyPlan(plan, {
  receipt,
  stagingRoot,
  destination,
  limits,
  inspectExisting = null,
  beforeCommit = null,
} = {}) {
  assertVerifiedArchive(receipt, 'extract.applyPlan');
  const archiveId = receipt.sha256hex;

  let committed = false;
  try {
    fs.mkdirSync(stagingRoot, { recursive: true, mode: DIR_MODE });

    // Directories first, so a file entry never has to invent its parent's mode.
    for (const entry of plan.entries) {
      if (entry.kind !== 'dir') continue;
      fs.mkdirSync(path.join(stagingRoot, entry.path), { recursive: true, mode: DIR_MODE });
    }

    const files = [];
    let actualTotal = 0;
    for (const entry of plan.entries) {
      if (entry.kind !== 'file') continue;

      // BELT-AND-BRACES: the local-header name was already checked against the central directory at
      // plan time. It is checked again HERE, at the write, because the plan-time check protects a
      // decision while this one protects an EFFECT — and the two are separated by every line of code
      // in between.
      const localNameLen = plan.buffer.readUInt16LE(entry.localOffset + 26);
      const localName = plan.buffer
        .subarray(entry.localOffset + 30, entry.localOffset + 30 + localNameLen)
        .toString('utf8');
      if (localName !== entry.path) {
        throw new HeaderNameMismatchError(
          `at write time, entry ${JSON.stringify(entry.path)}'s local header names ${JSON.stringify(localName)}.`,
          { reason: 'name_disagreement_at_write', entry: entry.path }
        );
      }

      const remaining = limits.max_total_bytes - actualTotal;
      if (remaining <= 0) {
        throw new LimitExceededError(
          `the archive's ACTUAL inflated bytes reached max_total_bytes=${limits.max_total_bytes}.`,
          { reason: 'actual_bytes', limit: 'max_total_bytes', actual: actualTotal, cap: limits.max_total_bytes, entry: entry.path }
        );
      }
      const cap = Math.min(limits.max_entry_bytes, remaining);
      const bytes = inflateEntry(plan, entry, cap);
      actualTotal += bytes.length;
      if (actualTotal > limits.max_total_bytes) {
        throw new LimitExceededError(
          `the archive's ACTUAL inflated bytes reached ${actualTotal}, over max_total_bytes=${limits.max_total_bytes}.`,
          { reason: 'actual_bytes', limit: 'max_total_bytes', actual: actualTotal, cap: limits.max_total_bytes, entry: entry.path }
        );
      }

      // The archive's OWN integrity claim per entry. A CRC mismatch means the bytes we just inflated
      // are not the bytes the archive says it holds — committing them would put a silently corrupted
      // lab report in a patient's raw zone under a manifest row vouching for it.
      const actualCrc = crc32(bytes);
      if (actualCrc !== entry.crc32) {
        throw new MalformedArchiveError(
          `entry ${JSON.stringify(entry.path)} failed its CRC-32 check (archive declared ` +
          `0x${entry.crc32.toString(16)}, inflated bytes give 0x${actualCrc.toString(16)}).`,
          { reason: 'crc_mismatch', entry: entry.path }
        );
      }

      const target = path.join(stagingRoot, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: DIR_MODE });
      fs.writeFileSync(target, bytes, { mode: FILE_MODE });
      fsyncPath(target, false);

      files.push({
        path: entry.path,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        media_type: mediaTypeOf(entry.path),
      });
    }

    fsyncPath(stagingRoot, true);

    // The controlled kill-point (test seam). Production passes nothing; the discrimination test throws
    // from here so that "everything is staged, nothing is committed" is exercised for real rather than
    // reasoned about.
    if (typeof beforeCommit === 'function') beforeCommit({ stagingRoot, destination, files });

    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: DIR_MODE });
    try {
      fs.renameSync(stagingRoot, destination);
      committed = true;
    } catch (err) {
      if (err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST' && err.code !== 'EISDIR') throw err;
      // P1-5 — THE RENAME NEVER SURFACES A RAW ENOTEMPTY. run.js short-circuits on an existing
      // destination before staging, so in the single-process case this branch is unreachable; it is
      // the belt for a genuine race (a concurrent winner that landed while we were staging, or a
      // caller outside the lock). Two outcomes only, both named:
      //   • the destination is complete AND the catalog vouches for it ⇒ a concurrent winner landed
      //     identical content-addressed bytes. That IS success, idempotently.
      //   • anything else ⇒ RawZoneDriftError. A raw-zone directory the catalog cannot vouch for is
      //     drift, which is precisely what that class already names — so the enum stays closed at 16.
      const state = typeof inspectExisting === 'function' ? inspectExisting(destination) : 'drift';
      if (state === 'complete') {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        return { archiveId, destination, files, idempotent: true };
      }
      throw new RawZoneDriftError(
        `${destination} already exists but the catalog cannot vouch for it, so this intake will not commit ` +
        'over it. Run `intake-archive --verify --workspace <ws>` to see which files the catalog and the ' +
        'raw zone disagree about. Nothing was committed and the staged copy was discarded.',
        { reason: 'destination_drift', destination }
      );
    }
    fsyncPath(path.dirname(destination), true);

    return { archiveId, destination, files, idempotent: false };
  } finally {
    // ON ANY FAILURE THE STAGED BYTES GO AWAY — best-effort, and NFR-6 tolerates a leftover
    // dot-prefixed staging directory if even the cleanup fails: it is outside every reader's scope
    // (check.js skips dot-entries, --verify walks only sources/raw/), identifiable as leftover, and
    // never mistakable for live sources/ content.
    if (!committed) {
      try { fs.rmSync(stagingRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

module.exports = { applyPlan, mediaTypeOf, FILE_MODE, DIR_MODE, MEDIA_TYPES };
