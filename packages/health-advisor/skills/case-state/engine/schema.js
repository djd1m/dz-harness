'use strict';

// schema.js — validation for the profile, the fact record and the open-question record.
// It THROWS; it never warns. (ADR-001 §4: "every check in this module is fail-closed" — the
// contrast is lib/installer.js:419, where structure findings are `warn` and gate nothing.)
//
// THE CODE-LEVEL FLOOR IS CODE. `registry/profile-required.json` may only ADD to the constants
// below; the loader unions the two and asserts the union still contains every floor entry. Deleting
// or emptying the data file therefore cannot disarm the gate — the shape (and the reason) taken
// from skills/preanalytical-guard/registry/universal.json, read-only precedent.
//
// One deliberate departure from ADR-002 §3's literal wording, recorded here rather than made
// silently: that section says the key name `value` is refused "at the top level or inside `labs`",
// while ADR-002 §1 REQUIRES `value` on every `labs` row. Both cannot hold. The refusal is of a
// SECOND COPY of a current value, so it applies to the top level and to the `labs` CONTAINER, and
// the per-row forbidden set is `current`/`latest`/`current_labs` — a row's own `value` is the
// observation itself, not a copy of it.

const fs = require('node:fs');
const path = require('node:path');

// THE ONE `source_anchor` validator (NFR-5). `lib/consult-finding-schema.js` calls this exact
// function object for the `ha-finding-1` leg — two schemas, one definition of what an anchor is.
const { validateAnchor } = require('./source-anchor.js');

// ── errors ───────────────────────────────────────────────────────────────────────────────────
class ProfileError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
class ProfileRequiredError extends ProfileError {}
class ProfileUnreadableError extends ProfileError {}
class ProfileInvalidError extends ProfileError {
  constructor(sourcePath, fields) {
    super(`profile ${sourcePath} is invalid — ${fields.length} problem(s):\n  - ${fields.join('\n  - ')}`);
    this.fields = Object.freeze([...fields]);
    this.sourcePath = sourcePath;
  }
}
class AmbiguousObservationError extends ProfileError {}
class AnalyteNotInProfileError extends ProfileError {}
class DateNotObservedError extends ProfileError {
  constructor(asked, available) {
    super(`no observation is dated ${asked}; the profile's observation dates are: ${available.join(', ')}`);
    this.available = Object.freeze([...available]);
  }
}

class FactError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
class FactIdentityError extends FactError {}
class FactCollisionError extends FactError {}
class StaleEvidenceError extends FactError {}

class QuestionError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
class QuestionInvalidError extends QuestionError {}
class QuestionNotFoundError extends QuestionError {}
class BlockedByOpenQuestionError extends QuestionError {
  constructor(question) {
    super(
      `conclusion refused: open blocking question "${question.id}" is due and its scope ` +
      `[${question.scope.join(', ')}] intersects this conclusion.\n  ${question.question}\n` +
      '  There is no flag that disables this block — answer the question and record it.'
    );
    this.questionId = question.id;
  }
}

// ── the code-level floor ─────────────────────────────────────────────────────────────────────
const REQUIRED_SECTIONS = Object.freeze(['schema', 'labs', 'preanalytical_context', 'open_questions']);
const REQUIRED_LAB_FIELDS = Object.freeze(['analyteId', 'value', 'unit', 'observedOn']);
const FORBIDDEN_CURRENT_KEYS = Object.freeze(['current', 'latest', 'value', 'current_labs']);
// `value` is absent here on purpose — see the header note.
const FORBIDDEN_ROW_KEYS = Object.freeze(['current', 'latest', 'current_labs']);

const QUESTION_REQUIRED_FIELDS = Object.freeze(['id', 'question', 'scope', 'blocking', 'status', 'opened_on']);
const QUESTION_STATUSES = Object.freeze(['open', 'answered', 'withdrawn']);
const PRECONDITION_OPS = Object.freeze(['gte', 'lte', 'eq', 'present', 'absent']);

const SHIPPED_REGISTRY_DIR = path.join(__dirname, 'registry');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(v) { return typeof v !== 'string' || v.trim() === ''; }

/**
 * Is `ref` a file in the case directory ITSELF — a bare name, no traversal, not absolute?
 *
 * ONE CASE IS ONE LOCK SCOPE (F-7), and the scope is derived from the directory the store lives in.
 * So the ledger and the facts store must sit in the case directory, or the case's own lock does not
 * cover them. Enforced here, at the door, rather than surfacing as a `CaseLockUnavailableError`
 * from a write path whose printed remedy — "hold lock.withCaseLock(caseDir, …)" — could not work.
 *
 * Both separators are rejected on every platform on purpose: a profile is a data file that travels,
 * and `"state\\open_questions.json"` is a subdirectory on the machine that matters.
 */
function isCaseLocalRef(ref) {
  if (typeof ref !== 'string') return false;
  const name = ref.trim();
  if (name === '' || name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\\')) return false;
  return !path.isAbsolute(name);
}

function readJson(file, ErrCls) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (err) { throw new ErrCls(`cannot read ${file}: ${err.message}`); }
  try { return JSON.parse(raw); } catch (err) { throw new ErrCls(`${file} is not valid JSON: ${err.message}`); }
}

/** ISO YYYY-MM-DD → epoch ms, or null when the string is not a real calendar date. */
function parseIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  // Date.parse accepts 2026-02-31 by rolling over; reject anything that does not round-trip.
  if (new Date(ms).toISOString().slice(0, 10) !== s) return null;
  return ms;
}

/**
 * The effective required-field sets: the CODE floor unioned with the DATA additions.
 * `dirs` is the injection seam (ADR-005 D2) so a test can prove the data half is real.
 */
function loadRequiredSections(opts = {}) {
  const dirs = [SHIPPED_REGISTRY_DIR, ...(opts.dirs || [])];
  const sections = new Set(REQUIRED_SECTIONS);
  const labFields = new Set(REQUIRED_LAB_FIELDS);
  const currentKeys = new Set(FORBIDDEN_CURRENT_KEYS);
  const guardSlots = new Set();
  for (const dir of dirs) {
    const file = path.join(dir, 'profile-required.json');
    if (!fs.existsSync(file)) continue;
    const data = readJson(file, ProfileUnreadableError);
    for (const [key, target] of [
      ['required_sections', sections], ['required_lab_fields', labFields],
      ['forbidden_current_keys', currentKeys], ['forbidden_preanalytical_slots', guardSlots],
    ]) {
      const rows = data[key];
      if (rows === undefined) continue;
      if (!Array.isArray(rows) || rows.some(isBlank)) {
        throw new ProfileUnreadableError(`${file}: "${key}" must be an array of non-empty strings`);
      }
      for (const r of rows) target.add(r.trim());
    }
  }
  // Monotonicity: the data may only ADD. A union can never shrink, and this asserts it out loud so
  // a future "let the data replace the floor" refactor fails here rather than in the field.
  for (const s of REQUIRED_SECTIONS) if (!sections.has(s)) throw new ProfileUnreadableError(`floor section "${s}" was dropped`);
  return Object.freeze({
    sections: Object.freeze([...sections]),
    labFields: Object.freeze([...labFields]),
    currentKeys: Object.freeze([...currentKeys]),
    guardSlots: Object.freeze([...guardSlots]),
  });
}

/**
 * Validate a parsed profile. Returns nothing; throws ProfileInvalidError naming EVERY offending
 * field (not the first one) so one run tells the author everything that is wrong.
 */
function validateProfile(profile, sourcePath, opts = {}) {
  const req = opts.required || loadRequiredSections(opts);
  const problems = [];

  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new ProfileInvalidError(sourcePath, ['the profile must be a JSON object']);
  }

  for (const section of req.sections) {
    if (!Object.prototype.hasOwnProperty.call(profile, section)) problems.push(`missing required section "${section}"`);
  }
  for (const key of Object.keys(profile)) {
    if (req.currentKeys.some((f) => f.toLowerCase() === key.toLowerCase())) {
      problems.push(`top-level key "${key}" stores a current value — current values are DERIVED by foldAsOf, never stored (ADR-002 §3)`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'labs')) {
    if (!Array.isArray(profile.labs)) {
      problems.push('"labs" must be an ARRAY of dated observations (an object would be a place to hide a "current" block)');
    } else {
      profile.labs.forEach((row, i) => {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) {
          problems.push(`labs[${i}] must be an object`); return;
        }
        for (const field of req.labFields) {
          const v = row[field];
          if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
            problems.push(`labs[${i}] is missing required field "${field}"`);
          }
        }
        for (const key of Object.keys(row)) {
          if (FORBIDDEN_ROW_KEYS.some((f) => f.toLowerCase() === key.toLowerCase())) {
            problems.push(`labs[${i}] carries "${key}" — a second copy of a current value`);
          }
        }
        // AN ANALYTE ID MUST BE A STRING, because the fold keys an OBJECT by it and JS coerces the
        // key while the ties-check compares the raw value. MEASURED from an ordinary JSON profile —
        // reproducer: rows {"analyteId":"1","value":11} and {"analyteId":1,"value":22}, same date.
        // `foldAsOf`'s `Map` keeps `1` and `"1"` apart, so the same-date AmbiguousObservationError
        // never fires; `analytes[id] = …` then coerces both to `"1"`, `Object.keys` returns exactly
        // one entry, both reads return 22, and the measurement of 11 vanishes with no error at all —
        // a silently lost observation, which is the one outcome ADR-002 §2 exists to prevent.
        // The guard sat on the wrong side of the coercion; a type check at the door fixes it once.
        // (A Symbol analyteId is the mirror case — readable but not enumerable — and is unreachable
        // from a JSON file; `typeof !== 'string'` closes both without a second rule.)
        if (row.analyteId !== undefined && typeof row.analyteId !== 'string') {
          problems.push(
            `labs[${i}].analyteId must be a STRING, got ${typeof row.analyteId} ` +
            `(${JSON.stringify(row.analyteId)}) — a non-string id is coerced when the fold is keyed ` +
            'by it, which silently merges two different analytes and loses an observation'
          );
        }
        if (typeof row.value !== 'number' || !Number.isFinite(row.value)) {
          problems.push(`labs[${i}].value must be a finite number`);
        }
        if (row.observedOn !== undefined && parseIsoDate(row.observedOn) === null) {
          problems.push(`labs[${i}].observedOn "${row.observedOn}" is not an ISO YYYY-MM-DD calendar date`);
        }
        // `source_anchor` is OPTIONAL and ADDITIVE (FR-1, FR-6): `REQUIRED_LAB_FIELDS` is deliberately
        // NOT edited, so absence stays legal BY CONSTRUCTION rather than by a second branch that a
        // future edit could invert. Present ⇒ it must be a real anchor; a half-anchor is worse than
        // none, because it reads like provenance and resolves to nothing.
        if (row.source_anchor !== undefined) {
          validateAnchor(row.source_anchor, `labs[${i}].source_anchor`, problems);
        }
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'preanalytical_context')) {
    const ctx = profile.preanalytical_context;
    if (!Array.isArray(ctx)) {
      problems.push('"preanalytical_context" must be an array of dated context facts');
    } else {
      ctx.forEach((row, i) => {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) { problems.push(`preanalytical_context[${i}] must be an object`); return; }
        if (parseIsoDate(row.observedOn) === null) problems.push(`preanalytical_context[${i}].observedOn must be an ISO YYYY-MM-DD date`);
        if (isBlank(row.note)) problems.push(`preanalytical_context[${i}].note must be non-empty`);
        for (const key of Object.keys(row)) {
          if (req.guardSlots.includes(key)) {
            problems.push(
              `preanalytical_context[${i}] carries "${key}", a per-draw sampling slot owned by ` +
              'skills/preanalytical-guard — this section holds DATED history facts, not a second answer to that skill\'s question'
            );
          }
        }
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'open_questions')) {
    const oq = profile.open_questions;
    if (Array.isArray(oq)) {
      problems.push('"open_questions" must be a pointer {"$ref": "open_questions.json"}, never an inline array (ADR-006 §2 — one home per question)');
    } else if (oq === null || typeof oq !== 'object' || isBlank(oq.$ref) || Object.keys(oq).length !== 1) {
      problems.push('"open_questions" must be exactly {"$ref": "<file>"}');
    } else if (!isCaseLocalRef(oq.$ref)) {
      problems.push(
        `"open_questions".$ref ${JSON.stringify(oq.$ref)} points outside the case directory — it must ` +
        'name a file in the SAME DIRECTORY AS THE PROFILE (no "/", no "\\", no "..", not absolute). ' +
        'A case is a directory, and its lock scope is derived from the directory each store lives in ' +
        '(ADR-007): a ledger in a subdirectory therefore takes a DIFFERENT lock from the case\'s own ' +
        'facts store, so one case would have two scopes and the case lock would not admit its own ' +
        'ledger — MEASURED: withCaseLock(caseDir) + saveQuestions() threw CaseLockUnavailableError ' +
        'naming <caseDir>/state. Move the ledger next to the profile.'
      );
    }
  }

  if (problems.length > 0) throw new ProfileInvalidError(sourcePath, problems);
}

/** Validate ONE open-question record (ADR-006 §1). Returns a problem list; never throws. */
function questionProblems(q, where) {
  const problems = [];
  if (q === null || typeof q !== 'object' || Array.isArray(q)) return [`${where} must be an object`];
  for (const field of QUESTION_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(q, field)) problems.push(`${where} is missing required field "${field}"`);
  }
  if (isBlank(q.id)) problems.push(`${where}.id must be a non-empty string`);
  if (isBlank(q.question)) problems.push(`${where}.question must be a non-empty string`);
  if (!Array.isArray(q.scope) || q.scope.length === 0 || q.scope.some(isBlank)) {
    problems.push(`${where}.scope must be a non-empty array of analyte ids`);
  }
  if (typeof q.blocking !== 'boolean') problems.push(`${where}.blocking must be a boolean`);
  if (!QUESTION_STATUSES.includes(q.status)) problems.push(`${where}.status must be one of ${QUESTION_STATUSES.join('|')} (got ${JSON.stringify(q.status)})`);
  if (parseIsoDate(q.opened_on) === null) problems.push(`${where}.opened_on must be an ISO YYYY-MM-DD date`);

  const hasTrigger = q.trigger_date !== undefined;
  const hasPre = q.preconditions !== undefined;
  if (!hasTrigger && !hasPre) {
    problems.push(`${where} ("${q.id}") has neither trigger_date nor preconditions — that is a note, not a question (ADR-006 D2)`);
  }
  if (hasTrigger && parseIsoDate(q.trigger_date) === null) problems.push(`${where}.trigger_date must be an ISO YYYY-MM-DD date`);
  if (hasPre) {
    if (!Array.isArray(q.preconditions) || q.preconditions.length === 0) {
      problems.push(`${where}.preconditions must be a non-empty array of predicate objects`);
    } else {
      q.preconditions.forEach((p, i) => {
        if (p === null || typeof p !== 'object') { problems.push(`${where}.preconditions[${i}] must be an object`); return; }
        if (isBlank(p.analyteId)) problems.push(`${where}.preconditions[${i}].analyteId must be non-empty`);
        if (!PRECONDITION_OPS.includes(p.op)) {
          problems.push(`${where}.preconditions[${i}].op "${p.op}" is not one of ${PRECONDITION_OPS.join('|')} — an unknown operator is a load error, never a silently false predicate (ADR-006 §3)`);
        }
        if ((p.op === 'gte' || p.op === 'lte' || p.op === 'eq') && !Number.isFinite(p.value)) {
          problems.push(`${where}.preconditions[${i}].value must be a finite number for op "${p.op}"`);
        }
      });
    }
  }
  if (q.status === 'withdrawn' && isBlank(q.withdrawn_reason)) {
    problems.push(`${where} ("${q.id}") is withdrawn without a reason — withdrawal is a recorded decision (ADR-006 §5)`);
  }
  return problems;
}

module.exports = {
  ProfileError, ProfileRequiredError, ProfileUnreadableError, ProfileInvalidError,
  AmbiguousObservationError, AnalyteNotInProfileError, DateNotObservedError,
  FactError, FactIdentityError, FactCollisionError, StaleEvidenceError,
  QuestionError, QuestionInvalidError, QuestionNotFoundError, BlockedByOpenQuestionError,
  REQUIRED_SECTIONS, REQUIRED_LAB_FIELDS, FORBIDDEN_CURRENT_KEYS, FORBIDDEN_ROW_KEYS,
  QUESTION_REQUIRED_FIELDS, QUESTION_STATUSES, PRECONDITION_OPS,
  SHIPPED_REGISTRY_DIR,
  isBlank, readJson, parseIsoDate, loadRequiredSections, validateProfile, questionProblems,
};
