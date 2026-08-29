'use strict';
// ha-ca1 — rules-ADR-001's named CONTRACT path. Re-exports the engine's public surface from
// lib/appraisal-core.js, PLUS the shared kernel's functions re-exported BY REFERENCE from
// lib/registry-edit-timing.js (AM-13, Seam D):
//   require('./appraisal.js').editAfterPrimaryCompletion
//     === require('./registry-edit-timing.js').editAfterPrimaryCompletion      (T-12 identity)
// UNWRAPPED, deliberately: a wrapper would be a second semantics wearing an import's clothes.
// Shipped CA-2 code (lib/registry-comparison.js) presence-probes THIS file and folds
// FORBIDDEN_INTENT_TERMS into its vocabulary union (T-14); shipped T-13 calls checkForDomain here.

const kernel = require('./registry-edit-timing.js');

module.exports = {
  ...require('./appraisal-core.js'),
  // BY REFERENCE — the function objects themselves, never copies, never wrappers:
  editAfterPrimaryCompletion: kernel.editAfterPrimaryCompletion,
  changedAfterPrimaryCompletion: kernel.changedAfterPrimaryCompletion,
  timingUnknownReason: kernel.timingUnknownReason,
  TIMING_COMPARISON: kernel.TIMING_COMPARISON,
  TIMING_DISCLOSURE: kernel.TIMING_DISCLOSURE,
  // CA-1 QE F1 — the ONE calendar-validity definition, re-exported BY REFERENCE like the rest.
  hasDateShape: kernel.hasDateShape,
  isCalendarDate: kernel.isCalendarDate,
};
