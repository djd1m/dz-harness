'use strict';

// The ONLY public import surface of the pre-analytical guard — deliberately five names.
//
// There is no `interpretationOf()`, no `raw()`, no `evaluate(..., {skipGuard})`, no
// `attach(..., {force})`. The invariant is enforced by what is ABSENT as much as by what is
// checked: a path that does not exist cannot be taken by a command nobody has written yet.
//
//   SamplingConditions  .of() — total constructor, throws on a partial bundle
//                       .UNKNOWN — the recorded-but-not-known value (truthy on purpose)
//   loadRegistry        ({dirs}) → Registry; throws on a schema or monotonicity violation
//   evaluate            (observations, conditions, registry) → { readout, ticket }
//   attach              (ticket, coworkerJson) → MergedReadout; throws off-ticket
//   render              (readout | mergedReadout) → string
//
// Named safety property (NSP-1): no path may emit an interpretation of a value whose
// pre-analytical conditions were not CHECKED. Checked, not known — `conditions_unknown` is the
// legal, terminal RESULT of a check, and is admitted with an inseparable caveat.
//
// Honest scope: NSP-1 binds this API. It cannot stop a human or an agent from invoking
// `/health-advisor-lab-results` directly or running the third-party engine by hand — that skill is
// third-party and we may not add a defence inside it. That residual path is covered only by the
// prose layer (base/skills/health-advisor.md's Anti-Patterns BLOCK row). A green test here does
// not prove that path is closed, and must not be read as if it did.

const { SamplingConditions } = require('./conditions.js');
const { loadRegistry } = require('./registry.js');
const { evaluate } = require('./evaluate.js');
const { attach } = require('./attach.js');
const { render } = require('./render.js');

module.exports = { SamplingConditions, loadRegistry, evaluate, attach, render };
