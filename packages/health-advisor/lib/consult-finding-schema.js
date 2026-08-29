'use strict';

// consult-finding-schema.js — fail-closed validation of the `ha-finding-1` emit contract
// (INV-2, INV-3, INV-4). It THROWS typed errors; it never warns (the case-state schema.js posture).
//
// THE CODE-LEVEL FLOOR IS CODE (skills/case-state/engine/schema.js precedent): the caveat-type
// registry lib/registry/caveat-types.json may only ADD types on top of CAVEAT_TYPE_FLOOR below; the
// loader unions the two and asserts the union still contains every floor entry. Deleting or
// emptying the data file therefore cannot disarm the gate.
//
// PARSE FAILURE = A NAMED FAILED LANE, NEVER A SILENT SKIP (INV-2/AM-6). `laneFromContent` has
// exactly ONE catch, and it CONSTRUCTS a LaneFailure; there is no path where an exception becomes
// `continue`. Reasons come from the closed taxonomy of 04_domain_model.md §7.

const fs = require('node:fs');
const path = require('node:path');

const { deriveFindingId, deriveCaveatId, ConsultIdentityError } = require('./consult-finding-id.js');
// THE SAME validator skills/case-state/engine/schema.js calls — one definition of what a
// `source_anchor` is, for both schemas (NFR-5). `lib/source-anchor.js` is a re-export of the
// case-state module, so this is the same function object, not a second copy.
const { validateAnchor } = require('./source-anchor.js');

class ConsultSchemaError extends Error {
  constructor(message, problems) {
    super(problems && problems.length ? `${message} — ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}` : message);
    this.name = 'ConsultSchemaError';
    this.problems = Object.freeze([...(problems || [])]);
  }
}

const SCHEMA_NAME = 'ha-finding-1';

// The closed failure taxonomy (04_domain_model.md §7). A reason outside this set is itself a bug.
const LANE_FAILURE_REASONS = Object.freeze([
  'missing', 'unparsable', 'schema_invalid', 'id_collision', 'id_not_derivable',
  'refusal', 'timeout', 'budget_exhausted',
  // Round 3 (Codex re-QE R2): a lane file whose lane.run_id does not match the run under audit is
  // a STALE or SPOOFED artifact — a named failure, never a silently satisfied roster entry.
  'run_mismatch',
]);

const CLAIM_KINDS = Object.freeze(['observation', 'interpretation', 'recommendation']);
const SEVERITIES = Object.freeze(['minor', 'moderate', 'major', 'critical']);
const CAVEAT_DROP_SEVERITIES = Object.freeze(['informational', 'material']);

// ── the code-level floor: deleting the data file cannot narrow the enum below this ────────────
const CAVEAT_TYPE_FLOOR = Object.freeze([
  'FRESHNESS_UNKNOWN', 'conditions_unknown', 'GRADE', 'study_population',
  'source_disclaimer', 'dose_scope', 'population_scope', 'timeframe_scope',
  // Round 3 (Codex re-QE R3): the two safety categories the round-2 pinned set lacked. Before
  // this, a contraindication or a measurement-context condition ("fasting only") had NO machine
  // type at all — it existed only as free text, outside every pinned-materiality guarantee.
  'contraindication_scope', 'measurement_context',
]);

/**
 * Union of the floor and the ADDITIVE registry file. The registry may only ADD; the union is
 * asserted to still contain every floor entry (a data file that "removes" a floor type is refused).
 */
function loadCaveatTypes(registryPath) {
  const p = registryPath || path.join(__dirname, 'registry', 'caveat-types.json');
  let extra = [];
  if (fs.existsSync(p)) {
    const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(reg.types)) throw new ConsultSchemaError(`caveat-type registry ${p} has no types[] array`);
    extra = reg.types;
  }
  const union = new Set([...CAVEAT_TYPE_FLOOR, ...extra]);
  for (const t of CAVEAT_TYPE_FLOOR) {
    if (!union.has(t)) throw new ConsultSchemaError(`caveat-type union lost floor entry ${t} — the registry is additive, never subtractive`);
  }
  return union;
}

// applies_to → the canonical linkage token set the gate compares by SET EQUALITY (never proximity).
// claim:true → 'claim'; each quoted_values ref → itself; dose/population refs → themselves;
// timeframe non-null → 'timeframe'; evidence_scope non-null → 'evidence'.
function linkageTokens(appliesTo) {
  const tokens = [];
  if (appliesTo.claim === true) tokens.push('claim');
  for (const ref of appliesTo.quoted_values || []) tokens.push(String(ref));
  if (appliesTo.dose != null) tokens.push(String(appliesTo.dose));
  if (appliesTo.population != null) tokens.push(String(appliesTo.population));
  if (appliesTo.timeframe != null) tokens.push('timeframe');
  if (appliesTo.evidence_scope != null) tokens.push('evidence');
  return tokens.sort();
}

function validateCaveat(caveat, findingId, index, findingRefs, caveatTypes, problems) {
  const where = `finding ${findingId} caveats[${index}]`;
  if (typeof caveat !== 'object' || caveat === null) { problems.push(`${where}: not an object`); return; }
  if (typeof caveat.text !== 'string' || caveat.text.trim() === '') problems.push(`${where}: caveat text is mandatory`);
  if (!caveatTypes.has(caveat.type)) problems.push(`${where}: type ${JSON.stringify(caveat.type)} is not in the caveat-type union`);
  if (!CAVEAT_DROP_SEVERITIES.includes(caveat.severity_if_dropped)) problems.push(`${where}: severity_if_dropped must be informational|material`);

  const expectedId = deriveCaveatId(findingId, index);
  if (caveat.caveat_id !== expectedId) problems.push(`${where}: caveat_id ${JSON.stringify(caveat.caveat_id)} is not recomputable (expected ${expectedId})`);

  // INV-4: no decorative caveats — applies_to must bind to ≥1 true/non-null member.
  const at = caveat.applies_to;
  if (typeof at !== 'object' || at === null) { problems.push(`${where}: applies_to is mandatory`); return; }
  const tokens = linkageTokens(at);
  if (tokens.length === 0) problems.push(`${where}: applies_to binds to NOTHING (all members null/false) — a decorative caveat is a schema error (INV-4)`);
  for (const ref of at.quoted_values || []) {
    if (!findingRefs.has(String(ref))) problems.push(`${where}: applies_to.quoted_values names unknown ref ${JSON.stringify(ref)}`);
  }
  if (at.dose != null && !findingRefs.has(String(at.dose))) problems.push(`${where}: applies_to.dose names unknown ref ${JSON.stringify(at.dose)}`);
  if (at.population != null && !findingRefs.has(String(at.population))) problems.push(`${where}: applies_to.population names unknown ref ${JSON.stringify(at.population)}`);
}

function validateFinding(finding, specialty, index, caveatTypes, problems) {
  const where = `findings[${index}]`;
  if (typeof finding !== 'object' || finding === null) { problems.push(`${where}: not an object`); return; }
  if (typeof finding.claim !== 'string' || finding.claim.trim() === '') problems.push(`${where}: claim is mandatory`);
  if (!CLAIM_KINDS.includes(finding.claim_kind)) problems.push(`${where}: claim_kind must be one of ${CLAIM_KINDS.join('|')}`);
  if (!SEVERITIES.includes(finding.severity)) problems.push(`${where}: severity must be one of ${SEVERITIES.join('|')}`);

  // INV-1: the emitted id must be RECOMPUTABLE from content.
  let expectedId = null;
  try {
    expectedId = deriveFindingId(specialty, finding);
  } catch (err) {
    if (err instanceof ConsultIdentityError) { problems.push(`${where}: id not derivable — ${err.message}`); return; }
    throw err;
  }
  if (finding.finding_id !== expectedId) {
    problems.push(`${where}: finding_id ${JSON.stringify(finding.finding_id)} is not recomputable from content (expected ${expectedId}) — id_not_derivable`);
  }

  const refs = new Set();
  for (const qv of finding.quoted_values || []) {
    if (typeof qv.ref !== 'string' || qv.ref === '') { problems.push(`${where}: every quoted_value needs a ref`); continue; }
    if (refs.has(qv.ref)) problems.push(`${where}: duplicate ref ${qv.ref}`);
    refs.add(qv.ref);
    if (typeof qv.value !== 'string' || typeof qv.unit !== 'string') problems.push(`${where} ${qv.ref}: value and unit are SEPARATE mandatory strings (byte-match needs both)`);
    if (typeof qv.analyte !== 'string' || qv.analyte.trim() === '') problems.push(`${where} ${qv.ref}: analyte is mandatory`);
    // `source_anchor` — OPTIONAL and ADDITIVE (feature ha-manifest-provenance, FR-2.3). A lane file
    // written before this feature has none and is unaffected; one that carries a MALFORMED anchor
    // pushes onto this same `problems[]` accumulator, so `laneFromContent`'s single catch turns it
    // into a NAMED `{kind:'lane_failure', reason:'schema_invalid'}` — an existing member of the
    // closed taxonomy. No new LANE_FAILURE_REASONS entry, and no path where it becomes a skip.
    //
    // The anchor sits on the QUOTED VALUE (the thing that came out of a document), never on the
    // finding: a finding's anchors are the union of its quoted values' anchors — derived, never
    // stored a second time.
    if (qv.source_anchor !== undefined) validateAnchor(qv.source_anchor, `${where} ${qv.ref}.source_anchor`, problems);
  }
  if (finding.dose) { if (typeof finding.dose.ref !== 'string' || finding.dose.ref === '') problems.push(`${where}: dose needs a ref`); else refs.add(finding.dose.ref); }
  if (finding.population) { if (typeof finding.population.ref !== 'string' || finding.population.ref === '') problems.push(`${where}: population needs a ref`); else refs.add(finding.population.ref); }

  // INV-3: `caveats` is a mandatory KEY; [] is legal ONLY for claim_kind: observation.
  if (!Array.isArray(finding.caveats)) {
    problems.push(`${where}: caveats[] is a MANDATORY key (absent ≠ empty; absence is a schema error, INV-3)`);
  } else if (finding.caveats.length === 0 && finding.claim_kind !== 'observation') {
    problems.push(`${where}: caveats [] is legal only for claim_kind: observation — a ${finding.claim_kind} with zero caveats is a schema error (INV-3)`);
  } else {
    finding.caveats.forEach((c, i) => validateCaveat(c, finding.finding_id, i, refs, caveatTypes, problems));
  }
}

/**
 * validateFindings(doc, {specialty?, caveatTypesPath?}) → normalized SpecialistFindingSet.
 * Throws ConsultSchemaError with every problem enumerated (fail-closed, never partial-accept).
 */
function validateFindings(doc, opts = {}) {
  const problems = [];
  if (typeof doc !== 'object' || doc === null) throw new ConsultSchemaError('findings document is not an object');
  if (doc.schema !== SCHEMA_NAME) problems.push(`schema must be ${JSON.stringify(SCHEMA_NAME)}, got ${JSON.stringify(doc.schema)}`);
  const lane = doc.lane;
  if (typeof lane !== 'object' || lane === null || typeof lane.specialty !== 'string' || lane.specialty.trim() === '') {
    problems.push('lane.specialty is mandatory');
  }
  // lane.run_id is OPTIONAL data (the host workflow instructs it; solo emitters may omit it) —
  // but when present it must be a usable string: the run-binding check compares it byte-for-byte.
  if (lane && lane.run_id !== undefined && (typeof lane.run_id !== 'string' || lane.run_id.trim() === '')) {
    problems.push('lane.run_id, when present, must be a non-empty string');
  }
  if (opts.specialty && lane && lane.specialty !== opts.specialty) {
    problems.push(`lane.specialty ${JSON.stringify(lane && lane.specialty)} does not match the expected lane ${JSON.stringify(opts.specialty)}`);
  }
  const outcome = doc.lane_outcome;
  if (typeof outcome !== 'object' || outcome === null || typeof outcome.status !== 'string') problems.push('lane_outcome.status is mandatory');

  // The REFUSAL SHAPE: a specialist that cannot answer emits a valid record with
  // lane_outcome.status = "refused" and findings: [] — that is a NAMED outcome, not a schema error.
  if (outcome && outcome.status === 'refused') {
    if (Array.isArray(doc.findings) && doc.findings.length > 0) problems.push('a refused lane must not also carry findings');
    if (problems.length) throw new ConsultSchemaError('invalid ha-finding-1 document', problems);
    return { specialty: lane.specialty, lane, outcome, findings: [] };
  }

  if (!Array.isArray(doc.findings)) problems.push('findings[] is mandatory');
  const caveatTypes = loadCaveatTypes(opts.caveatTypesPath);
  const seenIds = new Set();
  if (Array.isArray(doc.findings) && lane && typeof lane.specialty === 'string') {
    doc.findings.forEach((f, i) => {
      validateFinding(f, lane.specialty, i, caveatTypes, problems);
      if (f && typeof f.finding_id === 'string') {
        if (seenIds.has(f.finding_id)) problems.push(`duplicate finding_id ${f.finding_id} — id_collision`);
        seenIds.add(f.finding_id);
      }
    });
  }
  if (problems.length) throw new ConsultSchemaError('invalid ha-finding-1 document', problems);
  return { specialty: lane.specialty, lane, outcome, findings: doc.findings };
}

/** Construct a named LaneFailure (the ONLY shape a broken lane may take downstream). */
function laneFailure(specialty, reason, detail) {
  if (!LANE_FAILURE_REASONS.includes(reason)) throw new ConsultSchemaError(`unknown LaneFailure reason ${JSON.stringify(reason)} — the taxonomy is closed`);
  return Object.freeze({ kind: 'lane_failure', specialty: String(specialty), reason, detail: detail == null ? null : String(detail) });
}

/**
 * laneFromContent(specialty, rawText) → {kind:'set', set} | LaneFailure.
 * EXACTLY ONE catch, and it CONSTRUCTS a LaneFailure — no exception path becomes a skip (INV-2).
 */
function laneFromContent(specialty, rawText, opts = {}) {
  if (rawText == null) return laneFailure(specialty, 'missing', 'no lane file content');
  try {
    const doc = JSON.parse(String(rawText));
    const set = validateFindings(doc, { ...opts, specialty });
    // Round 3 (Codex re-QE R2, stale/spoofed lanes): when the caller names the run under audit,
    // the lane file must carry the SAME lane.run_id. A different id — or NO id at all — is a
    // named run_mismatch: accepting an id-less file would make stripping the field the trivial
    // bypass. Checked before the refusal conversion (a stale refusal is still a stale artifact).
    if (opts.expectedRunId != null) {
      const laneRunId = set.lane && typeof set.lane.run_id === 'string' ? set.lane.run_id : null;
      if (laneRunId !== String(opts.expectedRunId)) {
        return laneFailure(specialty, 'run_mismatch',
          laneRunId === null
            ? `lane file carries no lane.run_id while the audit is bound to run ${JSON.stringify(String(opts.expectedRunId))} — an unbindable file cannot satisfy the roster`
            : `lane.run_id ${JSON.stringify(laneRunId)} does not match the run under audit ${JSON.stringify(String(opts.expectedRunId))} — stale or spoofed lane file`);
      }
    }
    if (set.outcome.status === 'refused') return laneFailure(specialty, 'refusal', 'lane refused with a valid refusal record');
    return { kind: 'set', set };
  } catch (err) {
    if (err instanceof SyntaxError) return laneFailure(specialty, 'unparsable', err.message);
    if (err instanceof ConsultSchemaError) {
      const idProblem = err.problems.find((p) => p.includes('id_not_derivable') || p.includes('id not derivable'));
      const collision = err.problems.find((p) => p.includes('id_collision'));
      if (idProblem) return laneFailure(specialty, 'id_not_derivable', idProblem);
      if (collision) return laneFailure(specialty, 'id_collision', collision);
      return laneFailure(specialty, 'schema_invalid', err.message);
    }
    return laneFailure(specialty, 'unparsable', err && err.message);
  }
}

module.exports = {
  SCHEMA_NAME, CAVEAT_TYPE_FLOOR, LANE_FAILURE_REASONS, CLAIM_KINDS, SEVERITIES,
  ConsultSchemaError, loadCaveatTypes, linkageTokens, validateFindings, laneFailure, laneFromContent,
};
