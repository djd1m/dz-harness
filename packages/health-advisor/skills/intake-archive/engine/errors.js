'use strict';

// errors.js — THE CLOSED REFUSAL ENUM (04_domain_model.md §8). Sixteen classes, no seventeenth.
//
// EVERY failure of an intake is one of these sixteen, and each one NAMES what was refused and in
// which PHASE. That is the whole point: "the archive could not be ingested" is not an answer a
// patient or an operator can act on, and a refusal that reads like a crash gets retried blindly.
//
// THE ENUM IS CLOSED, AND CLOSED MEANS TESTED CLOSED. `REFUSALS` is exported for reflection
// (the pattern skills/case-state/engine/cli.js uses for its `VERBS` triple), and
// test/intake-refusal-enum-reflection.test.js asserts exactly sixteen members, each with a `code`,
// a `phase`, and at least one discriminating test in the coverage map (INV-12). A class added later
// without a mapped test is RED.
//
// WHY CLOSING IT MATTERS MORE THAN ADDING TO IT: the two places this slice was tempted to grow the
// enum — an idempotent re-intake landing on an existing destination, and a rename that raced a
// concurrent winner — are both DRIFT of the raw zone relative to the catalog, which is exactly what
// `RawZoneDriftError` already says (P1-5). Reaching for a new class there would have split one
// property across two names.
//
// THE SIXTEENTH MEMBER IS DELIBERATELY FOREIGN, AND THAT IS RECORDED RATHER THAN HIDDEN.
// `CaseLockUnavailableError` is skills/case-state/engine/lock.js's OWN class, re-exported here
// unchanged. The lock refuses loudly and its error propagates VERBATIM — wrapping it in a local
// look-alike would have produced two classes for one failure, and the remedy text the refusal prints
// (how to make harness-core resolvable) would have had two homes. It is therefore described by a
// DESCRIPTOR in `REFUSALS` rather than by a base-class field, because nothing here constructs it.

const {
  CaseLockUnavailableError,
} = require('../../case-state/engine/lock.js');

/**
 * The base every intake-owned refusal extends. `code` and `phase` are STATIC on the subclass and
 * copied onto the instance, so a refusal can be identified either by `instanceof` (in code) or by
 * `err.code` (in `--json`, across a process boundary) — AM-7's requirement that the distinguishing
 * identity survives the exit-code collapse to `1`.
 */
class IntakeError extends Error {
  constructor(message, details = {}) {
    super(message);
    const Klass = new.target;
    this.name = Klass.name;
    this.code = Klass.code;
    this.phase = Klass.phase;
    this.reason = details.reason === undefined ? null : details.reason;
    for (const [k, v] of Object.entries(details)) {
      if (k === 'name' || k === 'code' || k === 'phase' || k === 'message' || k === 'stack') continue;
      this[k] = v;
    }
  }

  /** The stable, machine-readable shape a `--json` renderer prints. Never the stack. */
  toJSON() {
    return { name: this.name, code: this.code, phase: this.phase, reason: this.reason, message: this.message };
  }
}

// ── phase: input (nothing has been opened, dialled or written) ───────────────────────────────────

/** A URL source with no independently supplied --expect-sha256. Refused BEFORE any network (INV-3). */
class ExpectedDigestRequiredError extends IntakeError {}
ExpectedDigestRequiredError.code = 'EINTAKE_EXPECTED_DIGEST_REQUIRED';
ExpectedDigestRequiredError.phase = 'input';

/** Anything other than https: — an allowlist, not advice. */
class UnsupportedSchemeError extends IntakeError {}
UnsupportedSchemeError.code = 'EINTAKE_UNSUPPORTED_SCHEME';
UnsupportedSchemeError.phase = 'input';

/** `https://user:pass@host/…` — a live credential in an argv string that would reach the catalog. */
class CredentialsInUrlError extends IntakeError {}
CredentialsInUrlError.code = 'EINTAKE_CREDENTIALS_IN_URL';
CredentialsInUrlError.phase = 'input';

/** The --workspace target is inside the package tree, or is not a directory (NFR-1's fence). */
class WorkspaceRefusedError extends IntakeError {}
WorkspaceRefusedError.code = 'EINTAKE_WORKSPACE_REFUSED';
WorkspaceRefusedError.phase = 'input';

// ── phase: transport ─────────────────────────────────────────────────────────────────────────────

/** Scheme-valid but the fetch itself refused or failed: http status, redirect policy, SSRF, timeout. */
class TransportError extends IntakeError {}
TransportError.code = 'EINTAKE_TRANSPORT';
TransportError.phase = 'transport';

// ── phase: digest ────────────────────────────────────────────────────────────────────────────────

/** The bytes on disk are not the bytes the caller vouched for. Fires BEFORE any parse (INV-2). */
class DigestMismatchError extends IntakeError {}
DigestMismatchError.code = 'EINTAKE_DIGEST_MISMATCH';
DigestMismatchError.phase = 'digest';

// ── phase: parse (pure, plan-only — nothing has been written) ────────────────────────────────────

/** A zip envelope this reader deliberately does not implement: zip64, encryption, not-a-zip. */
class UnsupportedArchiveFormatError extends IntakeError {}
UnsupportedArchiveFormatError.code = 'EINTAKE_UNSUPPORTED_ARCHIVE_FORMAT';
UnsupportedArchiveFormatError.phase = 'parse';

/** Structurally broken bytes: a missing signature, a truncated record, a CRC that does not match. */
class MalformedArchiveError extends IntakeError {}
MalformedArchiveError.code = 'EINTAKE_MALFORMED_ARCHIVE';
MalformedArchiveError.phase = 'parse';

/** An entry name that would write outside its destination: `../`, `/abs`, `C:\`, a NUL, a backslash. */
class PathEscapeError extends IntakeError {}
PathEscapeError.code = 'EINTAKE_PATH_ESCAPE';
PathEscapeError.phase = 'parse';

/** A symlink, device, fifo or socket entry. Only regular files and directories are ingestable. */
class UnsafeEntryTypeError extends IntakeError {}
UnsafeEntryTypeError.code = 'EINTAKE_UNSAFE_ENTRY_TYPE';
UnsafeEntryTypeError.phase = 'parse';

/** Two entries naming one path — which one is the source of truth is not a question to guess. */
class DuplicateEntryNameError extends IntakeError {}
DuplicateEntryNameError.code = 'EINTAKE_DUPLICATE_ENTRY_NAME';
DuplicateEntryNameError.phase = 'parse';

/** The local file header disagrees with the central directory about a name or a size. */
class HeaderNameMismatchError extends IntakeError {}
HeaderNameMismatchError.code = 'EINTAKE_HEADER_NAME_MISMATCH';
HeaderNameMismatchError.phase = 'parse';

/** A declared or an ACTUAL budget was exceeded. `limit` names WHICH one — never a bare "too big". */
class LimitExceededError extends IntakeError {}
LimitExceededError.code = 'EINTAKE_LIMIT_EXCEEDED';
LimitExceededError.phase = 'limits';

// ── phase: manifest ──────────────────────────────────────────────────────────────────────────────

/** Same logical path, different sha256 — an append-only catalog never silently overwrites (INV-6). */
class ManifestPathConflictError extends IntakeError {}
ManifestPathConflictError.code = 'EINTAKE_MANIFEST_PATH_CONFLICT';
ManifestPathConflictError.phase = 'manifest';

/** A raw-zone directory the catalog cannot vouch for: partial, corrupted, or absent from the index. */
class RawZoneDriftError extends IntakeError {}
RawZoneDriftError.code = 'EINTAKE_RAW_ZONE_DRIFT';
RawZoneDriftError.phase = 'manifest';

// ── NOT a member of the enum, and the reflection test asserts so ─────────────────────────────────
//
// A USAGE error is not a domain refusal. It exits `2`, not `1` (AM-7's triple), and it means the
// operator's command line was wrong — a bad flag, an unknown `--limits` key, a non-finite budget.
// Putting it in the refusal enum would have made "you typed it wrong" indistinguishable from "the
// archive was refused" in exactly the JSON payload built to distinguish them.
class IntakeUsageError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IntakeUsageError';
    this.code = 'EINTAKE_USAGE';
    this.phase = 'usage';
    this.reason = details.reason === undefined ? null : details.reason;
  }

  toJSON() {
    return { name: this.name, code: this.code, phase: this.phase, reason: this.reason, message: this.message };
  }
}

/**
 * THE ENUM, as descriptors rather than bare classes — because the sixteenth member is foreign and
 * carries no static `phase` of its own (see the header). One shape for all sixteen means the
 * reflection test has one loop, not fifteen plus a special case.
 */
const REFUSALS = Object.freeze([
  { name: 'ExpectedDigestRequiredError', code: ExpectedDigestRequiredError.code, phase: 'input', Class: ExpectedDigestRequiredError },
  { name: 'UnsupportedSchemeError', code: UnsupportedSchemeError.code, phase: 'input', Class: UnsupportedSchemeError },
  { name: 'CredentialsInUrlError', code: CredentialsInUrlError.code, phase: 'input', Class: CredentialsInUrlError },
  { name: 'WorkspaceRefusedError', code: WorkspaceRefusedError.code, phase: 'input', Class: WorkspaceRefusedError },
  { name: 'TransportError', code: TransportError.code, phase: 'transport', Class: TransportError },
  { name: 'DigestMismatchError', code: DigestMismatchError.code, phase: 'digest', Class: DigestMismatchError },
  { name: 'UnsupportedArchiveFormatError', code: UnsupportedArchiveFormatError.code, phase: 'parse', Class: UnsupportedArchiveFormatError },
  { name: 'MalformedArchiveError', code: MalformedArchiveError.code, phase: 'parse', Class: MalformedArchiveError },
  { name: 'PathEscapeError', code: PathEscapeError.code, phase: 'parse', Class: PathEscapeError },
  { name: 'UnsafeEntryTypeError', code: UnsafeEntryTypeError.code, phase: 'parse', Class: UnsafeEntryTypeError },
  { name: 'DuplicateEntryNameError', code: DuplicateEntryNameError.code, phase: 'parse', Class: DuplicateEntryNameError },
  { name: 'HeaderNameMismatchError', code: HeaderNameMismatchError.code, phase: 'parse', Class: HeaderNameMismatchError },
  { name: 'LimitExceededError', code: LimitExceededError.code, phase: 'limits', Class: LimitExceededError },
  { name: 'ManifestPathConflictError', code: ManifestPathConflictError.code, phase: 'manifest', Class: ManifestPathConflictError },
  { name: 'RawZoneDriftError', code: RawZoneDriftError.code, phase: 'manifest', Class: RawZoneDriftError },
  // the foreign member — case-state's own lock refusal, propagated verbatim, never re-wrapped
  { name: 'CaseLockUnavailableError', code: 'ECASELOCKUNAVAILABLE', phase: 'lock', Class: CaseLockUnavailableError },
]);

const REFUSAL_BY_NAME = Object.freeze(Object.fromEntries(REFUSALS.map((d) => [d.name, d])));

/** Is `err` one of the sixteen? THE one place cli.js consults to choose exit `1` over exit `2`. */
function isIntakeRefusal(err) {
  return REFUSALS.some((d) => err instanceof d.Class);
}

/** The descriptor for a refusal instance, or `null`. */
function refusalDescriptor(err) {
  return REFUSALS.find((d) => err instanceof d.Class) || null;
}

module.exports = {
  IntakeError,
  IntakeUsageError,
  ExpectedDigestRequiredError,
  UnsupportedSchemeError,
  CredentialsInUrlError,
  WorkspaceRefusedError,
  TransportError,
  DigestMismatchError,
  UnsupportedArchiveFormatError,
  MalformedArchiveError,
  PathEscapeError,
  UnsafeEntryTypeError,
  DuplicateEntryNameError,
  HeaderNameMismatchError,
  LimitExceededError,
  ManifestPathConflictError,
  RawZoneDriftError,
  CaseLockUnavailableError,
  REFUSALS,
  REFUSAL_BY_NAME,
  isIntakeRefusal,
  refusalDescriptor,
};
