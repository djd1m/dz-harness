'use strict';

// claim.js — THE safety gate (04_domain_model.md §6, D-12).
//
// The brief's constraint: «выше цели» is admissible ONLY as
//     (both numbers) + (citation of the threshold's source) + (explicit non-diagnosis framing).
// Modelled as a value object that CANNOT BE CONSTRUCTED otherwise. The property is enforced by
// construction, not by review:
//
//   • `makeTargetStatement()` throws, naming the field, unless every component is present;
//   • the citation is re-validated through `schema.js::makeCitation` — claim.js never trusts an
//     "already-checked" object handed to it (AC-7), and that also means the ONE citation guard in
//     schema.js is the single thing T-10's discrimination proof has to remove;
//   • the brand is a MODULE-PRIVATE `Symbol()` — NOT `Symbol.for()`, which would be forgeable
//     through the global symbol registry — so no external object can pass `isTargetStatement()`.
//
// CONSTRUCTION IS ONLY HALF THE PROPERTY (QE finding G1, 2026-08-05). A statement that was built
// with all four parts can still be RENDERED without them — and a one-line summary is the first
// thing a refactor adds. The reviewer proved the gap by eroding `renderTargetStatement` to a bare
// «→ ВЫШЕ ЦЕЛИ» line: the named safety test stayed at 6/6 green. So `STATEMENT_PARTS` below is not
// a comment about the shape — it is the ONE executable definition (ADR-001 §6, Confirmation
// assertion 1) used on BOTH sides:
//   • `makeTargetStatement` derives its required-field list from it (construction side);
//   • `missingStatementParts(text, stmt)` answers "did this part survive rendering?" (render side),
//     and `clinical-targets-safety.test.js` asserts the answer is «all four survived» for every
//     string any render.js export produces that asserts a relation to a target.
// One definition, two sides — the repo's two-definitions-in-one-gate lesson.

const { makeCitation, isBlank } = require('./schema.js');

const ABOVE = 'ABOVE';
const BELOW = 'BELOW';
const CLAIM_DIRECTIONS = Object.freeze([ABOVE, BELOW]);

// Module-private brand. Nothing outside this file can obtain it.
const BRAND = Symbol('clinical-targets/TargetStatement');

// The four parts of ADR-001 §6. `fields` = what construction demands; `evidence` = the substrings
// that must be LITERALLY present in a rendered string for the part to count as having survived.
// Evidence is read off the statement itself — never a phrase table, never a wording allowlist, so
// a change of wording cannot silently satisfy it and a change of wording cannot falsely fail it.
const STATEMENT_PARTS = Object.freeze([
  Object.freeze({
    part: 'observed',                       // both numbers, half 1
    fields: Object.freeze(['observationDisplay']),
    evidence: (s) => [s.observationDisplay],
  }),
  Object.freeze({
    part: 'threshold',                      // both numbers, half 2
    fields: Object.freeze(['thresholdDisplay']),
    evidence: (s) => [s.thresholdDisplay],
  }),
  Object.freeze({
    part: 'citation',                       // the citation of the SAME row the threshold came from
    fields: Object.freeze(['citation']),
    evidence: (s) => [
      s.citation.organization, s.citation.documentTitle, String(s.citation.year),
      String(s.citation.section), s.citation.quote,
    ],
  }),
  Object.freeze({
    part: 'framing',                        // non-diagnosis frame + who the threshold is addressed to
    fields: Object.freeze(['framing', 'applicabilityNote']),
    evidence: (s) => [s.framing, s.applicabilityNote],
  }),
]);

// DERIVED, not restated: the construction-side list is the render-side list. `citation` is excluded
// only because it has its own constructor (`makeCitation`) rather than a blank-check; `direction`
// is not a PART (it selects the wording, it is not a component of the claim).
const REQUIRED_STATEMENT_FIELDS = Object.freeze([
  ...STATEMENT_PARTS.flatMap((p) => p.fields).filter((f) => f !== 'citation'),
  'direction',
]);

function makeTargetStatement(spec) {
  const src = spec && typeof spec === 'object' ? spec : {};

  const missing = REQUIRED_STATEMENT_FIELDS.filter((f) => isBlank(src[f]));
  if (missing.length > 0) {
    throw new TypeError(
      `makeTargetStatement: a target claim needs both numbers, a citation and a non-diagnosis framing; ` +
      `missing or blank: ${missing.join(', ')}`,
    );
  }
  if (!CLAIM_DIRECTIONS.includes(src.direction)) {
    throw new TypeError(
      `makeTargetStatement: direction must be ${CLAIM_DIRECTIONS.join('|')} — ` +
      `AT and NOT_COMPARABLE may never reach a target claim (got ${String(src.direction)})`,
    );
  }

  // Re-validated here, ALWAYS. A citation object that skipped schema.js on its way in is exactly
  // the case AC-7 names.
  const citation = makeCitation(src.citation, 'makeTargetStatement.citation');

  const statement = {
    observationDisplay: src.observationDisplay,
    observationInThresholdUnit: isBlank(src.observationInThresholdUnit) ? null : src.observationInThresholdUnit,
    thresholdDisplay: src.thresholdDisplay,
    deltaDisplay: isBlank(src.deltaDisplay) ? null : src.deltaDisplay,
    direction: src.direction,
    citation,
    framing: src.framing,
    applicabilityNote: src.applicabilityNote,
    analyteDisplayName: isBlank(src.analyteDisplayName) ? null : src.analyteDisplayName,
  };
  Object.defineProperty(statement, BRAND, { value: true, enumerable: false });
  return Object.freeze(statement);
}

function isTargetStatement(value) {
  return Boolean(value && typeof value === 'object' && value[BRAND] === true);
}

// ── the RENDER side of the property (ADR-001 Confirmation assertion 1) ─────────────────────────
// Given a rendered string and the branded statement it was rendered FROM, return the names of the
// parts whose evidence did not survive. `[]` means all four parts are in the text.
//
// Blank evidence counts as MISSING: a part cannot be proven present by an empty string, which is
// the render-side twin of `isBlank` refusing '   ' at construction.
function missingStatementParts(text, statement) {
  if (!isTargetStatement(statement)) {
    throw new TypeError(
      'missingStatementParts: needs the branded TargetStatement the text was rendered from — ' +
      'checking a claim against a hand-made object would prove nothing',
    );
  }
  const haystack = String(text);
  return STATEMENT_PARTS
    .filter((p) => !p.evidence(statement)
      .every((needle) => !isBlank(needle) && haystack.includes(String(needle))))
    .map((p) => p.part);
}

module.exports = {
  ABOVE,
  BELOW,
  CLAIM_DIRECTIONS,
  STATEMENT_PARTS,
  REQUIRED_STATEMENT_FIELDS,
  makeTargetStatement,
  isTargetStatement,
  missingStatementParts,
};
