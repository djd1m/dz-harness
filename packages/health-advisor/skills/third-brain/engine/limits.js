'use strict';

// limits.js — THE ONE BUDGET REGISTRY (ADR-001 D-8a), structurally mirroring
// skills/intake-archive/engine/limits.js's precedent: one file, one home for every number, so a
// consumer never invents a local constant "just for here".
//
// EVERY CONSTANT HERE HAS A CONSUMING CALL SITE, and that is the point of the 2026-08-18 P1-1
// amendment: a limits file no code reads is decoration, and decoration passes review while enforcing
// nothing.
//
//   CHUNK_BUDGET             plan.js's pack loop            (re-exported, NOT re-declared — one source)
//   BRIDGE_TIMEOUT_MS        write.js's spawn({timeout})    → kill ⇒ third_brain_write_unverified
//   MAX_DOCUMENT_BYTES       write.js, BEFORE chunking      → third_brain_payload_escape
//   MAX_ANCHORS_PER_DOCUMENT write.js, BEFORE chunking      → third_brain_payload_escape
//
// EVERY VALUE PASSES `clamp` AT MODULE LOAD — AND, HONESTLY STATED (fix round 1, QE F9): with every
// argument below a literal, the clamp cannot fire here in the shipped code; it is a CONVENTION GATE
// that keeps a future edit ("read the cap from an env var") flowing through a Number.isFinite check
// by construction, plus a pure function the budget test exercises directly. The protection against a
// NaN that REACHES a comparison at runtime lives at the call sites that take numbers from outside —
// `Number.isFinite(opts.maxDocumentBytes)` / `opts.bridgeTimeoutMs` in write.js and the `--limit`
// check in cli.js — which is the fa-improvements lesson (2026-07-18, "every numeric config clamp
// needs Number.isFinite") applied where the outside numbers actually enter.
//
// THERE IS NO `--limits` KNOB HERE, deliberately, and the divergence from intake-archive is stated
// rather than inherited: intake's budgets defend against a HOSTILE archive whose shape the operator
// cannot know in advance, so they need per-corpus tuning. These three defend a LOCAL filing
// operation against its own accidents, and an operator who can raise them by file could raise the
// document cap past the memory the chunker needs. Changing one is a code change, reviewed.

const { CHUNK_BUDGET } = require('./plan.js');

/**
 * clamp(value, fallback) — the ONE gate every number below passes through.
 *
 * A non-finite, non-integer, or non-positive override is REPLACED BY THE DEFAULT rather than
 * refused, because these constants are read at module load, before any error renderer exists. The
 * substitution is the safe direction: the shipped default always enforces something.
 */
function clamp(value, fallback) {
  return (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1)
    ? value
    : fallback;
}

/** The outer bound on the `python3 learning_bridge.py ingest-documents` spawn. 120 s, against the
 *  verb's own two inner `_run_dz` timeouts of 30 s + 45 s = 75 s — strictly less, so an inner
 *  refusal always wins the race and the operator gets the PRECISE reason rather than the vaguer
 *  `bridge timeout` (SP-22, pinned by test/third-brain-timeout-budget-coherent.test.js). */
const BRIDGE_TIMEOUT_MS = clamp(120000, 120000);

/** 10 MiB. Checked BEFORE chunking and before any payload is written: the chunker is in-memory by
 *  design, and a 2 GiB "document" would be a memory incident dressed as a filing operation. */
const MAX_DOCUMENT_BYTES = clamp(10485760, 10485760);

/** Each anchor costs one manifest load plus one full file read + sha256 inside `resolveAnchor`, and
 *  every id is written into the header line of EVERY passage of the document. 256 is far past any
 *  real consultation and well short of a header line no reader can use. */
const MAX_ANCHORS_PER_DOCUMENT = clamp(256, 256);

const LIMITS = Object.freeze({
  CHUNK_BUDGET,
  BRIDGE_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
  MAX_ANCHORS_PER_DOCUMENT,
});

module.exports = {
  CHUNK_BUDGET,
  BRIDGE_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
  MAX_ANCHORS_PER_DOCUMENT,
  LIMITS,
  clamp,
};
