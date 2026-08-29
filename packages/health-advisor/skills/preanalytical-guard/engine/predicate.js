'use strict';

// The FIXED declarative comparator vocabulary (05_architecture.md §3.4).
//
// Stated limit, so a reviewer does not have to find it: adding a new analyte, confounder,
// threshold, magnitude, source or companion pair is DATA-ONLY. Adding a new OPERATOR is a code
// edit. "Extensible without touching code" is true of the registry's CONTENT and false of its
// GRAMMAR, and this file is where that boundary lives.

const { UNKNOWN } = require('./conditions.js');

class UnknownOperator extends Error {
  constructor(op) {
    super('unknown predicate operator: ' + JSON.stringify(op) + ' (vocabulary: ' + OPERATORS.join(', ') + ')');
    this.name = 'UnknownOperator';
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const OPS = {
  lt: (v, p) => num(v) !== null && num(p.value) !== null && v < p.value,
  lte: (v, p) => num(v) !== null && num(p.value) !== null && v <= p.value,
  gt: (v, p) => num(v) !== null && num(p.value) !== null && v > p.value,
  gte: (v, p) => num(v) !== null && num(p.value) !== null && v >= p.value,
  between: (v, p) =>
    num(v) !== null && Array.isArray(p.value) && p.value.length === 2 &&
    num(p.value[0]) !== null && num(p.value[1]) !== null &&
    v >= p.value[0] && v <= p.value[1],
  eq: (v, p) => v === p.value,
  is_unknown: (v) => v === UNKNOWN,
  missing: (v) => v === undefined || v === null,
};

const OPERATORS = Object.freeze(Object.keys(OPS));

/** True when `predicate` is a well-formed member of the vocabulary. */
function isValidPredicate(predicate) {
  return (
    predicate !== null &&
    typeof predicate === 'object' &&
    !Array.isArray(predicate) &&
    typeof predicate.op === 'string' &&
    Object.prototype.hasOwnProperty.call(OPS, predicate.op)
  );
}

/**
 * Apply a declarative predicate to one slot value. Pure; no I/O, no registry access.
 * `UNKNOWN` never satisfies a value comparison — only `is_unknown` matches it.
 */
function test(predicate, value) {
  if (!isValidPredicate(predicate)) throw new UnknownOperator(predicate && predicate.op);
  if (value === UNKNOWN && predicate.op !== 'is_unknown') return false;
  return OPS[predicate.op](value, predicate) === true;
}

module.exports = { test, isValidPredicate, OPERATORS, UnknownOperator };
