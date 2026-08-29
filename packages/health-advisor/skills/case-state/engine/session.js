'use strict';

// session.js — the CHOKEPOINT. THE load-bearing property of this whole slice lives here:
//
//   No conclusion path can use an analyte value that was not read from the profile, through
//   session.readAnalyte, within the same call — the value must be a brand-valid AnalyteReading
//   whose session is the current one.
//
// The failure this closes is not a hallucinated number. It is a REAL number of the wrong
// generation: read correctly at some point, carried in context, and used after the profile moved
// on. Nothing outside the call could tell the two apart. So the discriminating fact is CALL
// IDENTITY, which is why the receipt is session-scoped rather than merely branded.
//
// THE RECEIPT IS OBJECT IDENTITY IN A MODULE-PRIVATE `WeakMap`, not a property on the reading.
//
// ADR-001 §3 specifies "a module-private `Symbol()` (never `Symbol.for()`, whose global registry
// would make the brand forgeable)". The `Symbol.for` half of that reasoning is right and is kept.
// The `Symbol()` half is NOT SUFFICIENT, and this was MEASURED here rather than argued — reproducer:
// brand a reading with an own symbol property, then evaluate `{ ...reading, value: 1.94 }`. Object
// spread copies own ENUMERABLE symbol keys, so the copy carries a genuine brand pointing at the
// genuine session, and passes. That copy is a receipt for a number nobody read — precisely the
// defect this slice exists to close, reachable in one line by anyone holding one honest reading.
//
// A `WeakMap` keyed by the reading object closes it: a spread copy is a DIFFERENT object, so it is
// simply not in the map. Nothing outside this file holds the map, nothing can add to it, and no
// copy, clone, `structuredClone`, JSON round-trip or `Object.assign` can carry membership.
// The mechanism is stronger than the ADR's; the property it enforces is exactly the ADR's.
// Recorded in 07_code_changes/change_manifest.md as a deviation, not adopted silently.
//
// ONE HOME (D-12, DP-1): `assertCurrentSessionReading` below is the ONLY place in engine/** that
// inspects the brand or compares a session. conclusion.js calls it; nothing else does. Deleting its
// body is the discrimination proof, and it must turn case-state-read-in-same-call.test.js RED.
//
// A REJECTED PROFILE YIELDS ZERO READABLE ANALYTES (D-16). There is no partial session: openCase
// either returns a session or throws. That is asserted by ATTEMPTING readAnalyte after each refusal
// path, not by inspecting the throw.
//
// openCase is SYNCHRONOUS and dependency-free — it never writes, so it never touches the lock.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  ProfileRequiredError, AnalyteNotInProfileError, ProfileInvalidError, BlockedByOpenQuestionError,
  parseIsoDate,
} = require('./schema.js');
const { loadProfile, foldAsOf, derive } = require('./profile.js');
const { loadQuestions, questionsDue } = require('./questions.js');
const { loadTtlTable } = require('./freshness.js');
const { loadFacts } = require('./facts.js');
// ONE definition of directory identity, shared with the lock (F3-5). Requiring lock.js here loads
// no dependency and takes no lock — `realCaseDir` is pure path/fs resolution; harness-core is only
// ever imported inside withCaseLock, which openCase never calls.
const { realCaseDir } = require('./lock.js');

// reading object → the session that minted it. Module-private, never exported, never mutated from
// outside. This IS the brand (see the header for why a symbol property was not enough).
const RECEIPTS = new WeakMap();

class UnreceiptedValueError extends Error {
  constructor(message) { super(message); this.name = 'UnreceiptedValueError'; }
}
class StaleReceiptError extends Error {
  constructor(message) { super(message); this.name = 'StaleReceiptError'; }
}

/**
 * THE ONE GUARD (DP-1). Both halves live here and nowhere else:
 *   (a) is this object a receipt at all — brand present?
 *   (b) was it issued by THIS call — is the brand's value this exact session?
 */
function assertCurrentSessionReading(session, reading, where) {
  const issuer = (reading === null || typeof reading !== 'object') ? undefined : RECEIPTS.get(reading);
  if (issuer === undefined) {
    throw new UnreceiptedValueError(
      `${where}: not an AnalyteReading. A conclusion accepts only a receipt issued by ` +
      'session.readAnalyte() in this same call — a literal, a remembered value, a look-alike object or a ' +
      'SPREAD COPY of a genuine reading is refused.'
    );
  }
  if (issuer !== session) {
    throw new StaleReceiptError(
      `${where}: this reading was issued by a DIFFERENT session (${reading.sessionId}), not the current one ` +
      `(${session.sessionId}). Re-read the value from the profile in this call.`
    );
  }
}

function isAnalyteReading(x) { return x !== null && typeof x === 'object' && RECEIPTS.has(x); }

/**
 * Open a case. The profile is REQUIRED — there is no parameter, flag or environment variable that
 * produces a session without one (ADR-001 §2), and `asOf` is explicit because an implicit
 * `Date.now()` is the undeclared input that makes "which generation is this" unanswerable.
 */
function openCase(options) {
  const opts = options || {};
  if (opts.profilePath === undefined || opts.profilePath === null || String(opts.profilePath).trim() === '') {
    throw new ProfileRequiredError(
      'openCase({ profilePath, asOf }): profilePath is required. The profile is a mandatory input, ' +
      'not an optional enrichment — absence is a refusal, never a degraded run (ADR-001 D2).'
    );
  }
  if (parseIsoDate(opts.asOf) === null) {
    throw new ProfileInvalidError(String(opts.profilePath), [
      `asOf ${JSON.stringify(opts.asOf)} must be an explicit ISO YYYY-MM-DD date — there is no implicit "today"`,
    ]);
  }

  const loaded = loadProfile(opts.profilePath, opts);      // throws Unreadable / Invalid, naming fields
  const caseDir = path.dirname(loaded.sourcePath);
  const fold = foldAsOf(loaded, opts.asOf);

  // A CASE IS A DIRECTORY, AND ITS STORES LIVE IN IT (F-7). The lock scope is derived from the
  // directory each store sits in (ADR-007), so a ledger or store outside the case directory takes a
  // DIFFERENT lock from the rest of the case: one case, two scopes, and `withCaseLock(caseDir)` does
  // not admit its own ledger — MEASURED, a `$ref: "state/open_questions.json"` profile produced
  // scopes `<caseDir>/state/.case-state` and `<caseDir>/.case-state` and a CaseLockUnavailableError
  // from the remedy the refusal itself prints. schema.js refuses such a `$ref`; these options are
  // the other way in, and they are refused here for the same reason. The FILENAME is free — the
  // restriction is about the directory, so `questionsPath: <caseDir>/none.json` stays legal.
  // "THE SAME DIRECTORY" HAS ONE DEFINITION, AND IT IS THE LOCK'S (F3-5). This comparison was
  // `path.dirname(path.resolve(p)) !== caseDir` — LEXICAL — while lock.js takes every scope
  // decision on `realCaseDir`, the path as the FILESYSTEM sees it. Two definitions of one concept
  // in one gate is this slice's signature defect class, and it fired third time here: on the very
  // layout lock.js's own comment cites as legitimate (`/tmp -> /private/tmp`), a profile named
  // through the alias and a store named through the real path are ONE directory — `realCaseDir`
  // agrees on both — yet openCase refused them with a TypeError (MEASURED). Both sites now call
  // the one exported `realCaseDir`; nothing here re-derives directory identity case-by-case.
  const realCase = realCaseDir(caseDir);
  const inCase = (p, which) => {
    const abs = path.resolve(p);
    if (realCaseDir(path.dirname(abs)) !== realCase) {
      throw new TypeError(
        `openCase(): ${which} ${JSON.stringify(abs)} is not in the same directory as the profile ` +
        `(${JSON.stringify(caseDir)}). A case is one directory and therefore one lock scope: a store ` +
        'kept elsewhere would be locked separately from the rest of the case, so the case lock would ' +
        'not cover it (ADR-007, F-7). Keep the case\'s stores in the case directory.'
      );
    }
    // A BARE FILENAME CAN STILL BE A SYMLINK OUT OF THE CASE (F3-6). `isCaseLocalRef` is lexical
    // and `path.resolve` does not dereference, so `$ref: "oq-link.json"` pointing at
    // `/elsewhere/oq.json` was ACCEPTED and openCase read the external file (MEASURED) — while the
    // refusal message for other refs promised "a file in the same directory as the profile". The
    // lock-scope invariant survived (the temp+rename write replaces the link in place, and dirname
    // stays caseDir), but the READ crossed the case boundary the message claimed it could not. The
    // check moves to match the promise: an existing store file must RESOLVE into the case
    // directory. An absent file has nothing to dereference and stays legal (facts.json often does
    // not exist yet); a dangling link reads as absent and fails at its own I/O.
    let real = null;
    try { real = fs.realpathSync(abs); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (real !== null && realCaseDir(path.dirname(real)) !== realCase) {
      throw new TypeError(
        `openCase(): ${which} ${JSON.stringify(abs)} is a symlink resolving to ${JSON.stringify(real)}, ` +
        'OUTSIDE the case directory. A case is one directory: reading a store through a link that ' +
        'leaves it means the case\'s own lock and its own boundary no longer cover what was read ' +
        '(ADR-007, F-7). Move the real file into the case directory.'
      );
    }
    return abs;
  };
  const questionsPath = inCase(
    opts.questionsPath !== undefined ? opts.questionsPath : path.resolve(caseDir, loaded.profile.open_questions.$ref),
    opts.questionsPath !== undefined ? 'questionsPath' : 'open_questions.$ref');
  const factsPath = opts.factsPath !== undefined ? inCase(opts.factsPath, 'factsPath') : inCase(path.resolve(caseDir, 'facts.json'), 'factsPath');

  const questions = loadQuestions(questionsPath);
  const ttlTable = opts.ttlTable || loadTtlTable({ dirs: opts.ttlDirs || [] });
  const facts = fs.existsSync(factsPath) ? loadFacts(factsPath) : null;
  const sessionId = `case-${crypto.randomBytes(8).toString('hex')}`;

  const session = {
    sessionId, asOf: opts.asOf, profilePath: loaded.sourcePath, caseDir,
    questionsPath, factsPath, fold, questions, facts, ttlTable,
    /**
     * PROVENANCE IS A SET-LEVEL FACT, SO IT LIVES ON THE SET (feature ha-manifest-provenance, AM-4).
     *
     * The brief asked for "a receipt field with the number of anchored facts". A COUNT is only
     * meaningful over a SET, and a count on a single-analyte reading would be a number with no
     * referent — so the count lives here, over the fold, computed ONCE alongside the other session
     * fields and frozen with them. It is not a mutable running counter: a counter that changes as
     * readings are taken would answer "how many did I look at", not "how many of this case's current
     * values can be traced back to a primary document".
     *
     * The ANCHOR itself rides on each reading (below) — that is what makes "return to the source"
     * reachable from a conclusion, which holds receipts.
     */
    provenance: Object.freeze({
      anchored: Object.values(fold.analytes).filter((a) => a.sourceAnchor !== null).length,
      total: Object.values(fold.analytes).length,
    }),
    /**
     * A DERIVED VALUE IS A VALUE, AND THE BLOCKING GATE APPLIES TO IT.
     *
     * `derive` reads `fold.analytes[*].value` straight out of the fold, so it produced a real number
     * with NO receipt and NO gate — MEASURED: with a due, blocking question scoped to
     * `triglycerides`, `session.derive('tg-hdl-ratio')` returned 2.383928571428571 while
     * `readAnalyte('triglycerides')` fed into a conclusion was refused, and `readAnalyte` was never
     * called at all. Same asymmetry as the prose path in conclusion.js: the honest route is gated,
     * the convenient one is not. The metric's declared `inputs` are exactly the analytes the number
     * is a claim about, so they are what the scope is tested against.
     */
    derive(metricId, deriveOpts) {
      // ADR-001 (fb3c9d93): clinical path defaults to one-draw operands (cross-draw = not a valid number).
      const result = derive(fold, metricId, { requireSameDraw: true, ...(deriveOpts || {}) });
      const blocker = questionsDue(questions, fold, opts.asOf)
        .find((q) => q.blocking === true && q.scope.some((a) => result.inputs.includes(a)));
      if (blocker !== undefined) throw new BlockedByOpenQuestionError(blocker);
      return result;
    },
  };

  // Assigned after `session` exists, because the brand's VALUE is the session itself — that is what
  // makes the brand check and the identity check a single comparison with a single home.
  session.readAnalyte = function readAnalyte(analyteId) {
    const row = fold.analytes[analyteId];
    if (row === undefined) {
      throw new AnalyteNotInProfileError(
        `"${analyteId}" has no observation at or before ${opts.asOf} in ${loaded.sourcePath} — ` +
        'a value that is not in the profile cannot be read out of it'
      );
    }
    // Minted FRESH on every call. Nothing here caches a prior call's result.
    //
    // `sourceAnchor` is the fold's own value — `null` or a DEEP-FROZEN anchor. Frozen matters: a
    // mutable `reading.sourceAnchor.sha256` would let a holder rewrite the address the resolver then
    // checks, so the receipt would be honest about the value and lying about its origin.
    //
    // THE BRAND IS UNTOUCHED (SP-4). `RECEIPTS` is keyed by object IDENTITY, so an added enumerable
    // field cannot weaken it: a spread copy of an anchored reading is still a different object and is
    // still not in the map. Re-proved on an anchored reading rather than assumed.
    const reading = Object.freeze({
      analyteId: row.analyteId, value: row.value, unit: row.unit, observedOn: row.observedOn,
      asOf: opts.asOf, sessionId, sourcePath: loaded.sourcePath, sourceAnchor: row.sourceAnchor,
    });
    RECEIPTS.set(reading, session);
    return reading;
  };

  return Object.freeze(session);
}

module.exports = {
  openCase, assertCurrentSessionReading, isAnalyteReading,
  UnreceiptedValueError, StaleReceiptError,
};
