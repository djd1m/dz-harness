'use strict';

// questions.js — the durable open-questions ledger (ADR-006).
//
// A question that must be REMEMBERED is a question that is sometimes not. This ledger is a file, is
// read fresh every session, and states the condition under which it becomes actionable — so "ask
// later" stops being indistinguishable from "never".
//
// FAIL-CLOSED AT LOAD: a duplicate `id`, an unknown predicate operator, a question with neither
// `trigger_date` nor `preconditions`, a withdrawn record with no reason — each throws and the
// ledger loads ZERO questions. An unknown operator must never become a silently false predicate.
//
// NO API PATH REMOVES A QUESTION. `answer()` and `withdraw()` are recorded transitions: "asked and
// the answer was no" and "never asked" are different facts, and deletion makes them identical.
//
// NO `Date.now()` IN THIS FILE — `asOf` is required, so "this fires on 2026-10-15" does not depend
// on the day the test runs.
//
// WRITES GO THROUGH THE ONE LOCK SEAM (ADR-007). `answer`/`withdraw` are `async` for that reason
// and for no other; `loadQuestions` and `questionsDue` are synchronous, lock-free and
// dependency-free. The call is `lock.withCaseLock(...)` through the module object on purpose: the
// ADR-007 discrimination proof replaces that one property with a pass-through and requires the
// suite to go RED, which a destructured binding would make impossible.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const lock = require('./lock.js');
const {
  QuestionInvalidError, QuestionNotFoundError, ProfileUnreadableError,
  readJson, isBlank, parseIsoDate, questionProblems,
} = require('./schema.js');
const { isFold } = require('./profile.js');

const LEDGER_SCHEMA = 'open-questions-v1';

/** Load + validate the whole ledger. One bad record rejects the file (ZERO questions loaded). */
function loadQuestions(ledgerPath) {
  const abs = path.resolve(ledgerPath);
  if (!fs.existsSync(abs)) return { schema: LEDGER_SCHEMA, ledgerPath: abs, questions: [] };
  const data = readJson(abs, ProfileUnreadableError);
  if (data === null || typeof data !== 'object' || !Array.isArray(data.questions)) {
    throw new QuestionInvalidError(`${abs}: an open-questions ledger must be an object with a "questions" array`);
  }
  const problems = [];
  const seen = new Set();
  data.questions.forEach((q, i) => {
    problems.push(...questionProblems(q, `questions[${i}]`));
    const id = q && q.id;
    if (typeof id === 'string' && id !== '') {
      if (seen.has(id)) problems.push(`questions[${i}]: duplicate id "${id}" — the ledger loads ZERO questions`);
      seen.add(id);
    }
  });
  if (problems.length > 0) {
    throw new QuestionInvalidError(`${abs} rejected — ${problems.length} problem(s), ZERO questions loaded:\n  - ${problems.join('\n  - ')}`);
  }
  return { schema: data.schema || LEDGER_SCHEMA, ledgerPath: abs, questions: data.questions };
}

/**
 * Atomic write (temp file + rename). Answers a TORN READ; the LOST UPDATE is the lock's job — and
 * this function now REFUSES to run without it. It is exported and used to write unconditionally:
 * MEASURED — reproducer: pre-create the lock directory so `withCaseLock` genuinely refuses with
 * `StoreLockTimeoutError`, then call `saveQuestions` directly — it wrote the ledger anyway. The
 * write-site grep in test/case-state-store-mutual-exclusion.test.js part 4(b) proves where the
 * CALLS in this file sit; it cannot prove anything about a caller in another package.
 */
function saveQuestions(ledger) {
  const abs = path.resolve(ledger.ledgerPath);
  lock.assertCaseLockHeld(path.dirname(abs), 'questions.saveQuestions');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(tmp, `${JSON.stringify({ schema: ledger.schema || LEDGER_SCHEMA, questions: ledger.questions }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, abs);
}

/** Evaluate one predicate against a fold. Operators are validated at LOAD, never here. */
function satisfies(pre, fold) {
  const row = fold === null || fold === undefined ? undefined : fold.analytes[pre.analyteId];
  switch (pre.op) {
    case 'present': return row !== undefined;
    case 'absent': return row === undefined;
    case 'gte': return row !== undefined && row.value >= pre.value;
    case 'lte': return row !== undefined && row.value <= pre.value;
    case 'eq': return row !== undefined && row.value === pre.value;
    default: throw new QuestionInvalidError(`unknown predicate operator "${pre.op}" reached evaluation — load validation was bypassed`);
  }
}

/**
 * Which questions are DUE at `asOf` (ADR-006 §3). Pure and read-only.
 *
 * open AND (trigger_date <= asOf OR every precondition satisfied by the fold).
 * `fold` may be null — then precondition-only questions simply cannot fire, and the caller is told
 * how many were left unevaluated rather than being shown a confident "nothing is due".
 */
function questionsDue(ledger, fold, asOf) {
  if (parseIsoDate(asOf) === null) throw new TypeError(`questionsDue() requires an explicit ISO asOf date, got ${JSON.stringify(asOf)}`);
  // THE FOLD MUST BE A BRANDED FOLD. This function decides whether a BLOCKING question fires, and it
  // used to trust any object with an `.analytes` bag — so a hand-rolled or hand-edited look-alike
  // produced a confident "nothing is due" that no caller could distinguish from a real evaluation.
  // `foldAsOf` is the only thing that can mint the brand, and it stamps the as-of it folded at.
  // HONEST LIMIT, stated rather than implied: this refuses a FORGED fold, not a STALE one. A genuine
  // fold from an earlier as-of is still a genuine fold; the `asOf` cross-check below is what catches
  // the common case of one, and nothing here re-reads the profile from disk.
  if (fold !== null && fold !== undefined) {
    if (!isFold(fold)) {
      throw new TypeError(
        'questionsDue() accepts only a fold produced by foldAsOf() (or null) — a look-alike object ' +
        'would let a stale or invented analyte bag decide whether a BLOCKING question fires'
      );
    }
    if (fold.asOf !== asOf) {
      throw new TypeError(
        `questionsDue(): the fold was folded as-of ${JSON.stringify(fold.asOf)} but the question ` +
        `evaluation asked for ${JSON.stringify(asOf)} — two generations in one answer is the defect ` +
        'this slice exists to prevent (ADR-002 D4)'
      );
    }
  }
  const due = [];
  let unevaluatedPreconditions = 0;
  for (const q of ledger.questions) {
    if (q.status !== 'open') continue;
    // THE ONE TRIGGER COMPARISON (DP: delete it and case-state-open-questions.test.js goes red).
    const byDate = q.trigger_date !== undefined && q.trigger_date <= asOf;
    let byPre = false;
    if (Array.isArray(q.preconditions) && q.preconditions.length > 0) {
      if (fold === null || fold === undefined) unevaluatedPreconditions += 1;
      else byPre = q.preconditions.every((p) => satisfies(p, fold));
    }
    if (!byDate && !byPre) continue;
    due.push(Object.freeze({
      id: q.id, question: q.question, scope: Object.freeze([...q.scope]), blocking: q.blocking,
      trigger_date: q.trigger_date === undefined ? null : q.trigger_date,
      why: byDate && byPre ? 'both' : byDate ? 'trigger_date' : 'precondition',
    }));
  }
  due.sort((a, b) => {
    const ad = a.trigger_date === null ? '9999-12-31' : a.trigger_date;
    const bd = b.trigger_date === null ? '9999-12-31' : b.trigger_date;
    return ad < bd ? -1 : ad > bd ? 1 : (a.id < b.id ? -1 : 1);
  });
  Object.defineProperty(due, 'unevaluatedPreconditions', { value: unevaluatedPreconditions, enumerable: false });
  return due;
}

function findIndexOrThrow(ledger, id) {
  const i = ledger.questions.findIndex((q) => q.id === id);
  if (i === -1) throw new QuestionNotFoundError(`no open question with id "${id}" in ${ledger.ledgerPath}`);
  return i;
}

/**
 * THE LOCK SCOPE IS DERIVED FROM THE LEDGER PATH, never from a caller-supplied sibling (QE G6):
 * with `opts.caseDir || dirname(ledgerPath)`, two writers to the SAME ledger could take two
 * DIFFERENT locks — the silent lost update ADR-007 exists to prevent, reachable through the
 * documented API. A caseDir that is not the ledger's own directory is a refusal, not a scope.
 */
function lockScope(ledgerPath, opts, where) {
  const dir = path.dirname(path.resolve(ledgerPath));
  if (opts.caseDir !== undefined && path.resolve(opts.caseDir) !== dir) {
    throw new TypeError(
      `${where}: caseDir ${JSON.stringify(opts.caseDir)} is not the ledger's own directory ${JSON.stringify(dir)} — ` +
      'the lock scope is derived from the ledger path, so a sibling caseDir would let a second writer ' +
      'to the same ledger take a different lock (ADR-007, QE G6)'
    );
  }
  return dir;
}

/** Record an answer. `async` because the write is locked (ADR-007). Never deletes. */
async function answer(ledgerPath, id, { answer: text, answered_on: answeredOn }, opts = {}) {
  if (isBlank(text)) throw new QuestionInvalidError('answer() needs a non-empty answer text');
  if (parseIsoDate(answeredOn) === null) throw new QuestionInvalidError('answer() needs an ISO YYYY-MM-DD answered_on date');
  return lock.withCaseLock(lockScope(ledgerPath, opts, 'answer()'), async () => {
    const ledger = loadQuestions(ledgerPath);
    const i = findIndexOrThrow(ledger, id);
    ledger.questions[i] = { ...ledger.questions[i], status: 'answered', answer: text, answered_on: answeredOn };
    saveQuestions(ledger);
    return Object.freeze({ id, status: 'answered', total: ledger.questions.length });
  });
}

/** Record a withdrawal. The reason is REQUIRED — an unexplained withdrawal is a deletion in disguise. */
async function withdraw(ledgerPath, id, { reason, withdrawn_on: withdrawnOn }, opts = {}) {
  if (isBlank(reason)) throw new QuestionInvalidError('withdraw() needs a non-empty reason — withdrawal is a recorded decision, not a delete');
  if (parseIsoDate(withdrawnOn) === null) throw new QuestionInvalidError('withdraw() needs an ISO YYYY-MM-DD withdrawn_on date');
  return lock.withCaseLock(lockScope(ledgerPath, opts, 'withdraw()'), async () => {
    const ledger = loadQuestions(ledgerPath);
    const i = findIndexOrThrow(ledger, id);
    ledger.questions[i] = { ...ledger.questions[i], status: 'withdrawn', withdrawn_reason: reason, withdrawn_on: withdrawnOn };
    saveQuestions(ledger);
    return Object.freeze({ id, status: 'withdrawn', total: ledger.questions.length });
  });
}

/** Append a new question. `async` for the same one reason. Also never deletes. */
async function open(ledgerPath, question, opts = {}) {
  const problems = questionProblems(question, 'question');
  if (problems.length > 0) throw new QuestionInvalidError(`refusing to open a malformed question:\n  - ${problems.join('\n  - ')}`);
  return lock.withCaseLock(lockScope(ledgerPath, opts, 'open()'), async () => {
    const ledger = loadQuestions(ledgerPath);
    if (ledger.questions.some((q) => q.id === question.id)) throw new QuestionInvalidError(`question id "${question.id}" already exists`);
    ledger.questions = [...ledger.questions, question];
    saveQuestions(ledger);
    return Object.freeze({ id: question.id, total: ledger.questions.length });
  });
}

module.exports = { LEDGER_SCHEMA, loadQuestions, saveQuestions, questionsDue, satisfies, answer, withdraw, open };
