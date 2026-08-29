'use strict';

// digest.js — VERIFY BEFORE PARSE, AS A TYPE RATHER THAN AS A HABIT (INV-2).
//
// The property: no byte of an archive is ever handed to the zip reader unless its sha256 matched a
// digest the caller supplied INDEPENDENTLY of the archive. Enforcing that by convention — "always
// call verify() first" — is a habit, and a habit is invisible when it lapses. So `readArchive` accepts
// NOTHING but a `VerifiedArchive` receipt minted here, and membership is object identity in a
// module-private WeakMap.
//
// WHY NOT A `verified: true` FLAG, AND WHY NOT A SYMBOL EITHER. This is the lesson
// skills/case-state/engine/session.js paid for and recorded: a flag is forgeable in one line
// (`{...v}`), and an own ENUMERABLE symbol property is ALSO copied by object spread — so a spread
// copy carries a genuine brand for bytes nobody hashed. A WeakMap keyed on the receipt closes both:
// a spread copy is a DIFFERENT object and is simply not in the map. Nothing outside this file holds
// the map and nothing can add to it.
//
// THE HASH IS STREAMED FROM DISK, NEVER BUFFERED (P1-2). `fs.readSync` into one reusable 1 MiB
// buffer, `hash.update` per chunk — so hashing a 512 MiB blob costs 1 MiB of RSS, not 512. The
// receipt carries the hex digest STRING (`sha256hex`), never a Buffer of the blob: a receipt that
// carried the payload would defeat the whole point of streaming it. Synchronous by design, because
// every other stage of this pipeline is, and an async hash here would force `await` into pure code
// that has no other reason to be async.
//
// A SECOND FULL-BLOB HASH IS THE BUG THIS FILE EXISTS TO PREVENT (P2e/AM-9). The archive identity is
// computed EXACTLY ONCE, here. extract.js takes `archiveId` from the receipt; it does not re-hash.
// Two independent computations of one identity can disagree, and the disagreement would show up as a
// content-addressed directory whose name does not match the catalog row that points at it.
//
// NETWORK-AGNOSTIC BY CONTRACT (P2d). There is no "URL-sourced" concept in this file: `verify()`
// refuses an absent expected digest, period. The ORDERING property — a URL source is refused before
// any network call — is run.js's job, because digest.js cannot observe whether a socket was opened.

const fs = require('node:fs');
const crypto = require('node:crypto');

const { ExpectedDigestRequiredError, DigestMismatchError } = require('./errors.js');

// receipt object -> true. Module-private; never exported, never mutated from outside. THIS is the brand.
const RECEIPTS = new WeakMap();

const CHUNK_BYTES = 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * normaliseDigest(d) -> lowercase 64-hex | null. Accepts a bare hex string or the `sha256:<hex>`
 * prefixed form, because both spellings appear in object-storage listings and refusing one on
 * cosmetic grounds would push operators to hand-edit digests, which is where transcription errors
 * come from.
 */
function normaliseDigest(d) {
  if (typeof d !== 'string') return null;
  const bare = d.trim().replace(/^sha256:/i, '').toLowerCase();
  return SHA256_HEX.test(bare) ? bare : null;
}

/**
 * hashFile(blobPath) -> lowercase 64-hex sha256, STREAMED. Exported because run.js needs the digest
 * of a LOCAL-path source in order to supply it as `expectedDigest` and keep verify()'s contract
 * total (see the header's P2d note) — the same one computation, not a second one.
 */
function hashFile(blobPath) {
  const hash = crypto.createHash('sha256');
  const buf = Buffer.allocUnsafe(CHUNK_BYTES);
  const fd = fs.openSync(blobPath, 'r');
  let bytes = 0;
  try {
    for (;;) {
      const read = fs.readSync(fd, buf, 0, CHUNK_BYTES, null);
      if (read === 0) break;
      bytes += read;
      hash.update(buf.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return { sha256hex: hash.digest('hex'), bytes };
}

/**
 * verify(blobPath, expectedDigest) -> VerifiedArchive | throws.
 *
 * VerifiedArchive: frozen `{ sha256hex, blobPath, bytes }` — a hex string, a path, a size. It is the
 * ONLY object `readArchive` accepts, and it can only come from here.
 */
function verify(blobPath, expectedDigest) {
  const expected = normaliseDigest(expectedDigest);
  if (expected === null) {
    throw new ExpectedDigestRequiredError(
      `intake refuses to parse ${blobPath} without an expected sha256 supplied INDEPENDENTLY of the ` +
      `archive (got ${JSON.stringify(expectedDigest)}). A digest computed from the same bytes it is ` +
      'meant to vouch for proves only that the bytes are the bytes. Nothing was parsed or written.',
      { reason: expectedDigest === undefined || expectedDigest === null ? 'absent' : 'malformed', blobPath }
    );
  }

  let actual;
  try {
    actual = hashFile(blobPath);
  } catch (err) {
    // An unreadable blob is not a digest mismatch — reporting it as one would send an operator
    // hunting a tampered archive when the real answer is a missing file.
    throw new ExpectedDigestRequiredError(
      `intake cannot read ${blobPath} to verify it (${err.code || err.message}). Nothing was parsed or written.`,
      { reason: 'blob_unreadable', blobPath }
    );
  }

  if (actual.sha256hex !== expected) {
    throw new DigestMismatchError(
      `digest mismatch for ${blobPath}: expected ${expected}, actual ${actual.sha256hex}. ` +
      'The archive was NOT parsed and NOTHING was extracted — verification precedes every parse ' +
      '(INV-2), so a wrong or tampered archive cannot reach the zip reader at all.',
      { reason: 'sha256_mismatch', expected, actual: actual.sha256hex, blobPath }
    );
  }

  const receipt = Object.freeze({ sha256hex: actual.sha256hex, blobPath, bytes: actual.bytes });
  RECEIPTS.set(receipt, true);
  return receipt;
}

/** Is `x` a genuine receipt minted by verify() in this process? Object identity, not shape. */
function isVerifiedArchive(x) {
  return x !== null && typeof x === 'object' && RECEIPTS.has(x);
}

/**
 * THE ONE GUARD. zip.js calls it and nothing else does; deleting its body must turn
 * test/intake-verify-before-parse.test.js RED (both forgery shapes: a spread copy of a genuine
 * receipt, and a hand-built look-alike carrying the correct hex).
 */
function assertVerifiedArchive(x, where) {
  if (isVerifiedArchive(x)) return;
  throw new ExpectedDigestRequiredError(
    `${where}: not a VerifiedArchive. The zip reader accepts only a receipt minted by ` +
    'digest.verify() in this process — a look-alike object, a SPREAD COPY of a genuine receipt, a ' +
    'JSON round-trip, or a plain `{sha256hex, blobPath}` is refused. Nothing was parsed.',
    { reason: 'unverified_input' }
  );
}

module.exports = {
  verify,
  hashFile,
  normaliseDigest,
  isVerifiedArchive,
  assertVerifiedArchive,
  CHUNK_BYTES,
};
