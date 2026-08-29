'use strict';

// anchor-write.js — the ONE writer that attaches a `source_anchor` to an existing `labs[]` row.
//
// WHY THIS FILE EXISTS AT ALL (AM-7). FR-2.2 asks for "the case-state write path that appends a
// `labs[]` row … validates the anchor before writing". There was no such path: `cli.js`'s header
// states it plainly — "No write verb ships here" — and `facts.js` / `questions.js` write their own
// stores, not the profile. Without this module the live-cycle acceptance test would have to
// hand-edit a JSON fixture outside any lock, which is exactly the evidence AC-1 forbids.
//
// IT STAMPS; IT DOES NOT CREATE (ADR D-3). There is no `sources/` → `labs[]` importer in this
// feature, and no backfill: a row that does not exist is `LabRowNotFoundError`, not a row this
// module invents. Inventing one would put a value into a patient's profile that no clinician
// entered, which is a much larger decision than "record where this number came from".
//
// THE LOCK IS REUSED, NEVER REINVENTED (NFR-4). `withCaseLock` + temp-file-then-rename, the same two
// mechanisms `facts.js` and `questions.js` use, for the same two DIFFERENT failures:
//   • temp-file + rename → a TORN READ: no reader ever sees a half-written profile.
//   • the case lock      → a LOST UPDATE: no writer ever discards another writer's row.
// `assertCaseLockHeld` runs at the write site too, because "every call is lexically inside a
// withCaseLock callback" is a property of THIS file, not of a caller in another package.
//
// FAIL-CLOSED, ALWAYS. An invalid anchor, a missing row, a conflicting existing anchor: each is a
// named throw and the profile is byte-identical afterwards. An identical re-stamp is an idempotent
// no-op that does not touch the file at all — the manifest's own "same content ⇒ skipped" spirit.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const lock = require('./lock.js');
const { loadProfile } = require('./profile.js');
const { AmbiguousObservationError } = require('./schema.js');
const { validateAnchor, anchorsEqual, SourceAnchorInvalidError } = require('./source-anchor.js');

/** This module's own closed taxonomy — two members, and neither is a resolve-phase reason (AM-3). */
const WRITE_REFUSALS = Object.freeze(['row_not_found', 'anchor_conflict']);

class LabRowNotFoundError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'LabRowNotFoundError';
    this.code = LabRowNotFoundError.code;
    this.reason = LabRowNotFoundError.reason;
    Object.assign(this, details);
  }
}
LabRowNotFoundError.code = 'ELABROWNOTFOUND';
LabRowNotFoundError.reason = 'row_not_found';

class AnchorConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AnchorConflictError';
    this.code = AnchorConflictError.code;
    this.reason = AnchorConflictError.reason;
    Object.assign(this, details);
  }
}
AnchorConflictError.code = 'EANCHORCONFLICT';
AnchorConflictError.reason = 'anchor_conflict';

/**
 * The lock scope is the profile's OWN directory. A sibling `caseDir` would let a second writer to the
 * same profile take a different lock — the `questions.js` `lockScope` argument, applied to the file
 * this module writes.
 */
function lockScope(profileAbs, caseDir) {
  const dir = path.dirname(profileAbs);
  if (caseDir === undefined) return dir;
  if (lock.realCaseDir(String(caseDir)) !== lock.realCaseDir(dir)) {
    throw new TypeError(
      `stampLabRow(): caseDir ${JSON.stringify(String(caseDir))} is not the profile's own directory ` +
      `${JSON.stringify(dir)} — the lock scope is derived from the profile path, so a sibling caseDir ` +
      'would let a second writer take a different lock (ADR-007).'
    );
  }
  return dir;
}

/** TORN-READ ANSWER: temp file in the same directory, then rename (questions.js:saveQuestions). */
function writeProfileAtomically(profileAbs, profile) {
  lock.assertCaseLockHeld(path.dirname(profileAbs), 'anchor-write.stampLabRow');
  const tmp = `${profileAbs}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(tmp, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, profileAbs);
}

/**
 * Which `labs[]` row is "(analyteId, observedOn)"? Two rows may legitimately share a date when one
 * declares `supersedes` — the SAME tie-break `foldAsOf` takes, so a stamp lands on the row the fold
 * would have chosen. Neither declaring it is `AmbiguousObservationError`: the EXISTING class for
 * exactly this question, reused rather than duplicated under a new name.
 */
function selectRowIndex(labs, analyteId, observedOn) {
  const candidates = [];
  labs.forEach((row, i) => {
    if (row !== null && typeof row === 'object' && row.analyteId === analyteId && row.observedOn === observedOn) {
      candidates.push(i);
    }
  });
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0];
  const superseding = candidates.filter((i) => labs[i].supersedes !== undefined);
  if (superseding.length === 1) return superseding[0];
  throw new AmbiguousObservationError(
    `${candidates.length} observations of "${analyteId}" are dated ${observedOn} and ` +
    `${superseding.length === 0 ? 'none declares' : `${superseding.length} declare`} "supersedes" — ` +
    'which one carries the source? Nothing was written (ADR-002 §2).'
  );
}

/**
 * stampLabRow({profilePath, analyteId, observedOn, sourceAnchor, caseDir?})
 *   → { stamped: boolean, alreadyStamped: boolean, analyteId, observedOn, profilePath }
 *
 * `async` for the one reason every mutating case-state API is async: it takes the lock (ADR-007 D5).
 */
async function stampLabRow(options) {
  const opts = options || {};
  const { analyteId, observedOn, sourceAnchor } = opts;
  if (typeof opts.profilePath !== 'string' || opts.profilePath.trim() === '') {
    throw new TypeError('stampLabRow({profilePath, analyteId, observedOn, sourceAnchor}): profilePath is required');
  }
  if (typeof analyteId !== 'string' || analyteId.trim() === '') {
    throw new TypeError('stampLabRow(): analyteId must be a non-empty string');
  }
  if (typeof observedOn !== 'string' || observedOn.trim() === '') {
    throw new TypeError('stampLabRow(): observedOn must be the row\'s ISO YYYY-MM-DD observation date');
  }

  // VALIDATE BEFORE THE LOCK IS EVEN TAKEN. A malformed anchor is a caller bug, not a contended
  // write, and refusing here means an invalid value never reaches the critical section at all.
  const problems = validateAnchor(sourceAnchor, 'sourceAnchor', []);
  if (problems.length > 0) {
    throw new SourceAnchorInvalidError(
      'anchor_shape',
      `refusing to stamp an invalid source anchor onto ${analyteId} @ ${observedOn}:\n  - ${problems.join('\n  - ')}\n` +
      '  Nothing was written. Mint the anchor with stampFromManifest() so its fields come from a real catalog row.',
      { problems }
    );
  }

  const profileAbs = path.resolve(opts.profilePath);
  const scope = lockScope(profileAbs, opts.caseDir);

  return lock.withCaseLock(scope, async () => {
    const loaded = loadProfile(profileAbs, opts);
    const profile = loaded.profile;
    const i = selectRowIndex(profile.labs, analyteId, observedOn);
    if (i === -1) {
      throw new LabRowNotFoundError(
        `${profileAbs} has no labs[] row for "${analyteId}" observed on ${observedOn}. This writer STAMPS ` +
        'an existing observation; it never creates one — a value no clinician entered is a much larger ' +
        'decision than recording where a value came from. Nothing was written.',
        { analyteId, observedOn, profilePath: profileAbs }
      );
    }

    const existing = profile.labs[i].source_anchor;
    if (existing !== undefined) {
      if (anchorsEqual(existing, sourceAnchor)) {
        // IDEMPOTENT: the same anchor twice is a no-op, and the file is not touched at all.
        return Object.freeze({ stamped: false, alreadyStamped: true, analyteId, observedOn, profilePath: profileAbs });
      }
      throw new AnchorConflictError(
        `labs[${i}] ("${analyteId}" @ ${observedOn}) already carries a DIFFERENT source_anchor ` +
        `(${existing && existing.entry_id} → ${sourceAnchor.entry_id}). Two primaries claiming one ` +
        'observation is a question for a human, and silently preferring the newer one is how a record ' +
        'loses its origin (the manifest.js ManifestPathConflictError posture). Nothing was written.',
        { analyteId, observedOn, existing, incoming: sourceAnchor }
      );
    }

    const labs = profile.labs.map((row, idx) => (idx === i ? { ...row, source_anchor: sourceAnchor } : row));
    writeProfileAtomically(profileAbs, { ...profile, labs });
    return Object.freeze({ stamped: true, alreadyStamped: false, analyteId, observedOn, profilePath: profileAbs });
  });
}

module.exports = {
  WRITE_REFUSALS, LabRowNotFoundError, AnchorConflictError,
  stampLabRow, selectRowIndex,
};
