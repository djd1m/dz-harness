'use strict';

// conclusion.js — the only exported way to build a conclusion, and it accepts only receipts.
//
// It renders numbers ONLY from reading objects. No exported signature takes a caller-supplied
// scalar for a value, so the number printed and the number receipted are the same object field
// (ADR-001 §3, D-15). This is a partial mitigation, and it is labelled as one in the ADR: the
// receipt proves a READ happened, not that the read value is the one a human then paraphrases.
//
// A DUE, BLOCKING, IN-SCOPE QUESTION REFUSES THE CONCLUSION UNCONDITIONALLY (ADR-006 §4, plan
// AM-7). There is no `acknowledge`, no `namedQuestions`, no flag. The pre-checkpoint design let a
// conclusion proceed by MENTIONING the question — "named but not resolved" is exactly the silent
// workaround this slice exists to close, so it is deleted rather than softened. Non-blocking due
// questions are ATTACHED to the conclusion and rendered; they never throw.
//
// The brand/identity comparison is NOT here — it has one home, in session.js. This file calls it.

const { assertCurrentSessionReading } = require('./session.js');
const { questionsDue } = require('./questions.js');
const { fmt } = require('./render.js');
const { BlockedByOpenQuestionError, isBlank } = require('./schema.js');

/**
 * Does `text` state this analyte's folded value as a number in its own right?
 *
 * THE TEXT IS TOKENIZED INTO NUMBERS, AND WHOLE TOKENS ARE COMPARED (F3-3). Three rounds of
 * lookaround patches did not converge: round 1's `(?<![\d.])` refused `…2.67 mmol/L.` and allowed
 * `…2.67.`; round 2's `(?<!\d\.)` guarded a period only when a DIGIT preceded it, so `was .5
 * mg/dL`, `No.5`, `v.5`, `report.2.67.txt`, `v.2.67` and the list ordinal `5. Recheck…` all became
 * blocks (MEASURED, new=BLOCK old=pass), while `1,267` still blocked a blocked 267 and `2.67e3`
 * still blocked a blocked 2.67. The comment scanner learned the same lesson when its regex became
 * a tokenizer: pattern-matching AROUND a number keeps re-deciding what a boundary is; LEXING the
 * numbers decides it once.
 *
 * The lexer takes maximal-munch number tokens — digits with optional thousands-grouping commas, an
 * optional fractional part, an optional exponent, or a bare `.digits` when no digit precedes the
 * period (`.5` in `No.5` is the token `.5`, never a stated `5`). A token states the value only if
 * it EQUALS a rendered form of it — `String(value)` (what a template literal produces) or
 * `fmt(value)` (what renderConclusion prints) — or equals it after stripping VALID thousands
 * grouping (`1,267` states 1267). So `2.670`, `12.674`, `1.5`, `5.3`, `2.67e3`, `.5`, `1,267` are
 * whole tokens that are simply different numbers, and none of them can block 2.67 or 5.
 *
 * Two deliberate rules on top of the lexer, each with a test that goes red if it is deleted:
 *   • the scan runs over the NFKC normalization of the text, so fullwidth digits/periods
 *     (`２.６７`) are the same statement, not an evasion;
 *   • an integer token at the start of a line, immediately followed by `.` + whitespace/EOL, is a
 *     LIST ORDINAL (`5. Recheck lipids next month`) and states nothing.
 *
 * HONEST RESIDUE, stated rather than implied: a standalone number genuinely present in prose
 * (`see Table 5.` when the blocked value is 5) is indistinguishable from a stated value at the
 * lexical level and stays blocked; and spelled-out, spaced (`2 . 67`), comma-decimal (`2,67`),
 * line-break-split and non-NFKC-foldable digit-script forms remain evasions of a gate that is
 * DELIBERATELY narrow — it closes the copy-paste asymmetry, not the paraphrase gap.
 */
const NUMBER_TOKEN = /\d(?:[\d,]*\d)?(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?/g;
const THOUSANDS_GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

function tokenStatesForm(token, form) {
  if (token === form) return true;
  return THOUSANDS_GROUPED.test(token) && token.replace(/,/g, '') === form;
}

function isListOrdinal(scan, index, token) {
  if (!/^\d+$/.test(token)) return false;
  const lineStart = scan.lastIndexOf('\n', index - 1) + 1;
  if (!/^\s*$/.test(scan.slice(lineStart, index))) return false;
  return /^\.(?:\s|$)/.test(scan.slice(index + token.length));
}

function proseStatesValue(text, row) {
  const forms = new Set([String(row.value), fmt(row.value)]);
  const scan = text.normalize('NFKC');
  for (const m of scan.matchAll(NUMBER_TOKEN)) {
    if (isListOrdinal(scan, m.index, m[0])) continue;
    for (const form of forms) if (tokenStatesForm(m[0], form)) return true;
  }
  return false;
}

/**
 * @param {object}   args.session   the session that issued every reading
 * @param {object[]} args.readings  AnalyteReading receipts from THIS session — nothing else
 * @param {string}   args.text      the prose frame; it carries no numbers of its own
 */
function makeConclusion({ session, readings, text }) {
  if (session === null || session === undefined || typeof session.readAnalyte !== 'function') {
    throw new TypeError('makeConclusion({ session, readings, text }): session must come from openCase()');
  }
  if (isBlank(text)) throw new TypeError('makeConclusion(): text must be a non-empty string');
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new TypeError('makeConclusion(): readings must be a non-empty array of AnalyteReading receipts');
  }

  readings.forEach((r, i) => {
    const label = (r !== null && typeof r === 'object' && typeof r.analyteId === 'string') ? r.analyteId : `readings[${i}]`;
    assertCurrentSessionReading(session, r, label);      // THE guard — one home, in session.js
  });

  const analyteSet = new Set(readings.map((r) => r.analyteId));
  const due = questionsDue(session.questions, session.fold, session.asOf);
  const inScope = due.filter((q) => q.scope.some((a) => analyteSet.has(a)));

  // THE BLOCKING GATE MUST NOT BE ESCAPABLE BY OMITTING THE READING.
  //
  // The gate keyed off `readings` alone, so prose was STRICTLY MORE PERMISSIVE than a receipt.
  // MEASURED — reproducer: a due, blocking question scoped to `triglycerides`; copy
  // `session.fold.analytes.triglycerides.value` into `text`, cite an unrelated receipt, and the
  // conclusion renders `Triglycerides are 2.67 mmol/L`, while the HONEST version of the same
  // sentence — `readAnalyte('triglycerides')` receipted into `readings` — is refused with
  // BlockedByOpenQuestionError. A gate that the careful path trips and the careless path walks
  // around is not a gate; it is a tax on honesty.
  //
  // So the gate is also applied to any analyte a BLOCKING due question is scoped to whose folded
  // value the prose states outright. Deliberately narrow: only blocking scopes are scanned, so a
  // number that coincides with an unrelated analyte cannot refuse an unrelated conclusion.
  //
  // WHAT THIS DOES NOT CLAIM. It does not make prose trustworthy. conclusion.js's header already
  // labels the receipt a PARTIAL mitigation — it proves a read happened, not that the read value is
  // the one a human then paraphrases — and rounding, wording or a units change still slips past.
  // The defect closed here is the ASYMMETRY, not the paraphrase gap.
  const blocker = due.find((q) => q.blocking === true && q.scope.some((a) => {
    if (analyteSet.has(a)) return true;
    const row = session.fold.analytes[a];
    return row !== undefined && proseStatesValue(text, row);
  }));
  if (blocker !== undefined) throw new BlockedByOpenQuestionError(blocker);

  return Object.freeze({
    text,
    readings: Object.freeze([...readings]),
    analytes: Object.freeze([...analyteSet].sort()),
    asOf: session.asOf,
    profilePath: session.profilePath,
    sessionId: session.sessionId,
    openQuestions: Object.freeze(inScope),               // non-blocking, due, in scope — rendered
  });
}

module.exports = { makeConclusion };
