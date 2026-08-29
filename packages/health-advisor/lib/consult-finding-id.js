'use strict';

// consult-finding-id.js — THE ONE definition of `finding_id` and `caveat_id` for the consilium
// (INV-1, AM-7). Mirrors the identity discipline of skills/case-state/engine/facts.js (sha256 over
// STRUCTURALLY normalised parts: NFC + whitespace-run collapse + trim — no synonym table, no
// stemming, no case folding), as a SEPARATE module because the consult context is not the fact
// ledger (architecture §1.1).
//
// The id must be RECOMPUTABLE FROM CONTENT: the caveat-preservation gate re-derives every id at
// evaluation time (gate step B) and treats a mismatch as LaneFailure{id_not_derivable} — an id the
// content does not produce would let a re-pointed caveat pass as linked. Identical input ⇒
// byte-identical id across runs; a random or timestamp seed here reddens the AM-7 stability test.

const crypto = require('node:crypto');

class ConsultIdentityError extends Error {
  constructor(message) { super(message); this.name = 'ConsultIdentityError'; }
}

// A lone UTF-16 surrogate makes the digest a function of a LOSSY projection of the text (see the
// measured reproducer in skills/case-state/engine/facts.js) — refused at the door, same posture.
function assertWellFormed(s, what) {
  if (typeof s !== 'string') return;
  const ok = typeof s.isWellFormed === 'function'
    ? s.isWellFormed()
    : !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
  if (!ok) throw new ConsultIdentityError(`${what} contains an unpaired UTF-16 surrogate; refusing to hash a string UTF-8 cannot represent losslessly`);
}

function sha256Hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

/** Structural normalisation ONLY: NFC + whitespace runs collapsed + trim. Nothing else. */
function normalizeText(s) {
  if (typeof s !== 'string' || s.trim() === '') throw new ConsultIdentityError('cannot normalise an empty or non-string value into an identity part');
  assertWellFormed(s, 'identity part');
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// NUL separator: makes the concatenation unambiguous — no two part-lists can re-split into each
// other (the facts.js KEY_SEPARATOR rationale, verbatim).
const SEP = String.fromCharCode(0);

/**
 * Canonical serialisation of the identity-bearing parts of a finding. Deliberately EXCLUDES
 * volatile fields (fetch_date, unknowns, recommendation_eligible, source_anchor) — identity is the
 * CLAIM in its clinical binding (kind, values, dose, population), so a re-run over the same clinical
 * content yields the same id even when metadata breathes.
 *
 * `source_anchor` (feature ha-manifest-provenance, AM-1) is on that list DELIBERATELY, and the
 * exclusion is written here rather than left as an accident of what the loop happens not to read.
 * An anchor is PROVENANCE — where a value was transcribed from — and two findings quoting the same
 * value must have the same id whether or not anyone has traced it yet. If the anchor entered the
 * hash, `caveat_id = "<finding_id>:c<N>"` would change with it and every linked caveat would be
 * ORPHANED — a re-pointed caveat, which is precisely the defect INV-1 exists to catch. Pinned by
 * test/anchor-identity-excludes-anchor.test.js and mutation entry `anchor-identity-excludes-anchor`:
 * adding `qv.source_anchor` to the parts below must turn that test RED.
 */
function canonicalFindingParts(finding) {
  const parts = [normalizeText(finding.claim), normalizeText(finding.claim_kind || 'observation')];
  for (const qv of finding.quoted_values || []) {
    parts.push(['qv', normalizeText(String(qv.analyte)), normalizeText(String(qv.value)), normalizeText(String(qv.unit)), qv.observed_on ? normalizeText(String(qv.observed_on)) : ''].join(SEP));
  }
  if (finding.dose) {
    parts.push(['dose', normalizeText(String(finding.dose.agent)), normalizeText(String(finding.dose.amount)), normalizeText(String(finding.dose.unit)), finding.dose.frequency ? normalizeText(String(finding.dose.frequency)) : ''].join(SEP));
  }
  if (finding.population) {
    parts.push(['pop', normalizeText(String(finding.population.description))].join(SEP));
  }
  return parts;
}

/** finding_id = "<specialty>:<first 12 hex of sha256 over the canonical parts>". */
function deriveFindingId(specialty, finding) {
  const spec = normalizeText(specialty);
  const digest = sha256Hex(canonicalFindingParts(finding).join(SEP));
  return `${spec}:${digest.slice(0, 12)}`;
}

/**
 * caveat_id = "<finding_id>:c<1-based index>" — positional within its finding, recomputable from
 * the record. The gate recomputes both halves; a caveat filed under a different finding therefore
 * cannot keep a valid id (MISLINKED_CAVEAT is detectable by construction).
 */
function deriveCaveatId(findingId, caveatIndex) {
  if (typeof findingId !== 'string' || findingId === '') throw new ConsultIdentityError('deriveCaveatId needs the finding_id');
  if (!Number.isInteger(caveatIndex) || caveatIndex < 0) throw new ConsultIdentityError('deriveCaveatId needs a non-negative caveat index');
  return `${findingId}:c${caveatIndex + 1}`;
}

module.exports = { deriveFindingId, deriveCaveatId, normalizeText, ConsultIdentityError };
