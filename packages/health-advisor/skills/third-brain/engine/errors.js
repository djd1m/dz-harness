'use strict';

// errors.js — THE CLOSED REFUSAL TAXONOMY (ADR-001 D-9). SEVEN reasons, no eighth.
//
// Structurally the `ANCHOR_REFUSALS` idiom from lib/source-anchor-store.js — reused as a SHAPE, never
// imported as a set: that is a different resolver's taxonomy for a different question, and merging
// the two would make "which layer refused" unanswerable from the code.
//
// THE ENUM IS CLOSED, AND CLOSED MEANS TESTED CLOSED (SP-15,
// test/third-brain-refusal-enum-reflection.test.js reflects over `THIRD_BRAIN_REFUSALS` and asserts
// exactly seven). Two pressures on that number were resolved in the ADR rather than left here:
//
//   • BUDGET BREACHES fold into `third_brain_payload_escape`, whose documented scope is CONSCIOUSLY
//     WIDENED (2026-08-18, P1-1) from "the payload path resolves outside the workspace" to "the
//     payload violates its containment contract — path escape, document over MAX_DOCUMENT_BYTES, or
//     anchors over MAX_ANCHORS_PER_DOCUMENT", with the breached limit NAMED IN THE MESSAGE. A budget
//     is part of containment. A reason per budget would make "the closed set" a promise nobody can
//     keep: every future limit would argue for its own member, which is an enumeration wearing a
//     guarantee's clothes — the exact shape ADR-004 stepped away from.
//
//   • THE 8th REASON `third_brain_case_mismatch` IS DROPPED, NOT DEFERRED (2026-08-18, P1-4). It
//     would have re-checked, at backlink time, that a record's `case=` matched the case being read.
//     `.health-brain` is per-workspace and this feature ships exactly ONE writer, so no in-topology
//     input can drive it — and a fence nobody can trigger reads, in review, exactly like a fence
//     that works. The narrowing is OWNED as an accepted-degradation entry in
//     architecture/degradations.md with a stated exit condition, and the guarantee moved to the
//     WRITE side, where this feature can keep it (test/third-brain-case-header-write-integrity.test.js).
//
// A USAGE ERROR IS NOT A REFUSAL. `ThirdBrainUsageError` exits 2, never 1: "you typed it wrong" and
// "the document was refused" are the two answers the JSON payload exists to distinguish. An
// all-whitespace document is a usage error too (ADR-002 step 5) — deliberately NOT an eighth reason.

/**
 * The base every third-brain refusal extends. `code` and `reason` are STATIC on the subclass and
 * copied onto the instance, so a refusal is identifiable by `instanceof` in code and by `err.reason`
 * across the process boundary the exit code collapses to `1`.
 */
class ThirdBrainError extends Error {
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

  /** The stable machine shape `--json` prints. Never the stack. */
  toJSON() {
    return { name: this.name, code: this.code, reason: this.reason, message: this.message };
  }
}

/** `.health-brain` does not resolve to a store distinct from the shared one — the invariant the
 *  whole design rests on, checked at WRITE time by learning_bridge's `_health_brain_is_distinct`
 *  because a symlink can appear after the process starts. */
class ThirdBrainNotSegregatedError extends ThirdBrainError {}
ThirdBrainNotSegregatedError.code = 'ETHIRDBRAINNOTSEGREGATED';
ThirdBrainNotSegregatedError.reason = 'third_brain_not_segregated';

/** The pre-flight canary proved the write would land in the SHARED store (an alias deeper than any
 *  path check can see, or a `dz` that does not honour `--project`). Distinct from the reason above:
 *  that one is about the PATHS, this one about the OUTCOME of a real probe write. */
class ThirdBrainSharedStoreTargetedError extends ThirdBrainError {}
ThirdBrainSharedStoreTargetedError.code = 'ETHIRDBRAINSHAREDSTORE';
ThirdBrainSharedStoreTargetedError.reason = 'third_brain_shared_store_targeted';

/** The document to ingest is not inside the workspace it is being filed into. A document reached
 *  through `../` or a symlink out of the workspace would be indexed under a `doc_path` that means
 *  nothing to the operator who later reads the header. */
class ThirdBrainDocumentOutsideWorkspaceError extends ThirdBrainError {}
ThirdBrainDocumentOutsideWorkspaceError.code = 'ETHIRDBRAINDOCOUTSIDE';
ThirdBrainDocumentOutsideWorkspaceError.reason = 'third_brain_document_outside_workspace';

/** An `--anchor <entry_id>` did not stamp, or did not resolve `verified: true`. Carries the
 *  underlying resolver `reason`/`code` VERBATIM — drift, absent row, missing file, raw-zone escape,
 *  cross-case — because "the anchor failed" is not an answer an operator can act on. The whole
 *  ingest aborts: not a record, not a partial batch (SP-2). */
class ThirdBrainAnchorUnresolvableError extends ThirdBrainError {}
ThirdBrainAnchorUnresolvableError.code = 'ETHIRDBRAINANCHOR';
ThirdBrainAnchorUnresolvableError.reason = 'third_brain_anchor_unresolvable';

/** The bridge could not SAY what happened: an unreadable brain count on either side (always
 *  fail-closed), a parsed `written > 0` that the count delta does not corroborate, a bridge that
 *  died, timed out or emitted output this side cannot parse. Never "probably fine". */
class ThirdBrainWriteUnverifiedError extends ThirdBrainError {}
ThirdBrainWriteUnverifiedError.code = 'ETHIRDBRAINUNVERIFIED';
ThirdBrainWriteUnverifiedError.reason = 'third_brain_write_unverified';

/** A mechanism the write depends on is not on this machine: `dz`, or the `python3` that runs the
 *  bridge. A DELIBERATE DIVERGENCE from learning_bridge's NOTE posture for lessons (D-5): an absent
 *  `dz` is an acceptable no-op for an optional learning loop and a hard failure here, because an
 *  operator who ran `ha third-brain ingest` believes the document was filed. */
class ThirdBrainDzUnavailableError extends ThirdBrainError {}
ThirdBrainDzUnavailableError.code = 'ETHIRDBRAINDZUNAVAILABLE';
ThirdBrainDzUnavailableError.reason = 'third_brain_dz_unavailable';

/** THE CONTAINMENT REASON, scope widened 2026-08-18 (P1-1) — see the header. The payload path would
 *  resolve outside the workspace, OR the document exceeds `MAX_DOCUMENT_BYTES`, OR the anchor list
 *  exceeds `MAX_ANCHORS_PER_DOCUMENT`. The breached limit is named in the message, every time. */
class ThirdBrainPayloadEscapeError extends ThirdBrainError {}
ThirdBrainPayloadEscapeError.code = 'ETHIRDBRAINPAYLOADESCAPE';
ThirdBrainPayloadEscapeError.reason = 'third_brain_payload_escape';

/**
 * THE ENUM — descriptors, not bare classes, so the reflection test has one loop and the renderer has
 * one lookup. The ORDER is the ADR's order; the SET is the contract.
 */
const THIRD_BRAIN_REFUSALS = Object.freeze([
  { reason: ThirdBrainNotSegregatedError.reason, code: ThirdBrainNotSegregatedError.code, Class: ThirdBrainNotSegregatedError },
  { reason: ThirdBrainSharedStoreTargetedError.reason, code: ThirdBrainSharedStoreTargetedError.code, Class: ThirdBrainSharedStoreTargetedError },
  { reason: ThirdBrainDocumentOutsideWorkspaceError.reason, code: ThirdBrainDocumentOutsideWorkspaceError.code, Class: ThirdBrainDocumentOutsideWorkspaceError },
  { reason: ThirdBrainAnchorUnresolvableError.reason, code: ThirdBrainAnchorUnresolvableError.code, Class: ThirdBrainAnchorUnresolvableError },
  { reason: ThirdBrainWriteUnverifiedError.reason, code: ThirdBrainWriteUnverifiedError.code, Class: ThirdBrainWriteUnverifiedError },
  { reason: ThirdBrainDzUnavailableError.reason, code: ThirdBrainDzUnavailableError.code, Class: ThirdBrainDzUnavailableError },
  { reason: ThirdBrainPayloadEscapeError.reason, code: ThirdBrainPayloadEscapeError.code, Class: ThirdBrainPayloadEscapeError },
]);

const REFUSAL_BY_REASON = Object.freeze(Object.fromEntries(THIRD_BRAIN_REFUSALS.map((d) => [d.reason, d])));

/** NOT a member of the enum, and the reflection test asserts so. Exit 2. */
class ThirdBrainUsageError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ThirdBrainUsageError';
    this.code = 'ETHIRDBRAINUSAGE';
    this.reason = details.reason === undefined ? 'usage' : details.reason;
  }

  toJSON() {
    return { name: this.name, code: this.code, reason: this.reason, message: this.message };
  }
}

/** Is `err` one of the seven? THE one place cli.js consults to choose exit 1 over exit 2. */
function isThirdBrainRefusal(err) {
  return THIRD_BRAIN_REFUSALS.some((d) => err instanceof d.Class);
}

/** The descriptor for a refusal instance, or `null`. */
function refusalDescriptor(err) {
  return THIRD_BRAIN_REFUSALS.find((d) => err instanceof d.Class) || null;
}

/**
 * The bridge speaks `reason` strings across the process boundary; this is the ONE place they become
 * classes again. An UNKNOWN reason is `third_brain_write_unverified`, never a silent success: a
 * bridge that named a refusal this build does not know about has still refused.
 */
function refusalFromReason(reason, message, details = {}) {
  const d = REFUSAL_BY_REASON[reason];
  if (d === undefined) {
    return new ThirdBrainWriteUnverifiedError(
      `the bridge refused with an unrecognised reason ${JSON.stringify(reason)}: ${message}. This build ` +
      `knows ${THIRD_BRAIN_REFUSALS.length} reasons; an unknown one is treated as UNVERIFIED, never as success.`,
      { ...details, bridgeReason: reason }
    );
  }
  return new d.Class(message, details);
}

module.exports = {
  ThirdBrainError,
  ThirdBrainUsageError,
  ThirdBrainNotSegregatedError,
  ThirdBrainSharedStoreTargetedError,
  ThirdBrainDocumentOutsideWorkspaceError,
  ThirdBrainAnchorUnresolvableError,
  ThirdBrainWriteUnverifiedError,
  ThirdBrainDzUnavailableError,
  ThirdBrainPayloadEscapeError,
  THIRD_BRAIN_REFUSALS,
  REFUSAL_BY_REASON,
  isThirdBrainRefusal,
  refusalDescriptor,
  refusalFromReason,
};
