'use strict';

// The Growth Traceability criterion is CONDITIONAL, and that is where the danger is.
//
// An unconditional growth threshold sends a project with no acquisition objective (internal tool,
// on-prem) into a permanent NEEDS WORK loop — the exact trap already closed once for the Measurable
// criterion. But the cure has its own failure mode, and it is the quieter one: a condition that can
// never be true makes a gate that never fires, and a gate that never fires reads exactly like a gate
// that always passes.
//
// Recalled lesson (dz recall, 0.85): "a verification probe that CAN run in a mode where it checks
// nothing is vacuous evidence". So both directions are asserted here — the -10 path must be
// REACHABLE, and the +0 path must exist for the projects the condition exempts.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const VALIDATOR = path.join(TPL, 'skills', 'requirements-validator', 'SKILL.md');

const read = () => fs.readFileSync(VALIDATOR, 'utf-8');

/** The criterion, from its heading to the next one. */
function criterion() {
  const src = read();
  const start = src.indexOf('### Growth Traceability');
  assert.ok(start > 0, 'requirements-validator must carry the Growth Traceability criterion');
  const end = src.indexOf('\n### ', start + 1);
  assert.ok(end > start, 'the criterion must be followed by another section');
  return src.slice(start, end);
}

describe('the growth gate has teeth AND an exemption, and neither swallows the other', () => {
  test('P1 - the penalty path is reachable and the exempt path is not', () => {
    const c = criterion();
    // REACHABLE: a project with a filled seed table and no trace scores the penalty.
    assert.match(c, /-10 not traced|-10 if the seed table carries rows/,
      'the -10 path must exist for a project the criterion applies to');
    assert.match(c, /≥1 `FR-GROWTH-nnn` row \| YES/,
      'and the applicable row of the table must say YES, or nothing ever reaches -10');
    // EXEMPT: three named situations score +0, and each is a row of the same table.
    for (const exempt of ['says `нет` / is empty', 'internal tool, on-prem', 'is ABSENT']) {
      assert.ok(c.includes(exempt), 'the exemption table must name: ' + exempt);
    }
    // The two must be distinguishable by a reader: an applicability table with only YES rows or
    // only no rows is one of the two failure modes above wearing the other's clothes.
    const yes = (c.match(/\| YES \|/g) || []).length;
    const no = (c.match(/\| no \|/g) || []).length;
    assert.ok(yes >= 1 && no >= 3,
      'both verdicts must be reachable in the table: YES=' + yes + ' no=' + no);
  });

  test('P2 - an absent brief is +0, never -10, with the reason stated', () => {
    const c = criterion();
    assert.match(c, /An absent brief is \+0, never -10/,
      'the --from-docs entry skips Phase 0 — penalising it would loop those projects forever');
    assert.match(c, /Phase 0 did not run.*is not.*the growth requirements are missing/is,
      'and the two must be distinguished in words, not only in a table cell');
  });

  test('P3 - the condition is APPLICABILITY, not project type', () => {
    // Gating on type was tried upstream and refuted: replicate.md:171 records that gating M5 on
    // PRODUCT TYPE disabled the one branch M5 declares, and every B2B project got an empty slot.
    // Repeating that mistake one phase later would re-open it.
    const c = criterion();
    assert.match(c, /acquisition or adoption is in scope/,
      'the condition must be the same fact replicate.md gates M5 on');
    assert.match(c, /incl\. B2B/, 'including B2B explicitly, or the refuted type-gate returns');
    assert.match(c, /it is not about project type/i,
      'and the artifact must refuse the type reading out loud');
  });

  test('P4 - the scoring stays OUTSIDE the 100-point table', () => {
    // validation-gate-teeth.test.js pins 72/100 in its own title, derived from the current weight
    // table. A new weight changes that arithmetic and reddens the test whose job is holding the
    // gate's teeth. The Security criterion already solved this; this one copies the mechanism.
    const c = criterion();
    assert.match(c, /scores OUTSIDE the 100-point/i, 'the criterion must say where it scores');
    assert.match(c, /adds no\s*\n?weight to any existing criterion/i,
      'and that it adds no weight');
    // Structural proof, not a promise: the INVEST/SMART weight headings must be untouched.
    const src = read();
    assert.match(src, /### INVEST Criteria \(User Stories\) — 50% weight/,
      'the INVEST weight must still be 50%');
    assert.match(src, /### SMART Criteria \(Acceptance Criteria\) — 30% weight/,
      'and SMART still 30% — a growth weight here is what reddens validation-gate-teeth');
    assert.ok(!/Growth.*—\s*\d+% weight/i.test(src),
      'no growth criterion may carry a percentage weight');
  });

  test('P5 - TRACED is defined, and a silent drop is separated from a recorded rejection', () => {
    const c = criterion();
    assert.match(c, /case-sensitive, the exact token/,
      '"mention" must be defined or every reader draws a different line');
    assert.match(c, /not a title, not a paraphrase/i, 'and what does NOT count must be named');
    assert.match(c, /A silently dropped row is the defect/,
      'the defect class must be stated');
    assert.match(c, /A row rejected on the record is not/,
      'and a conscious rejection must be permitted, or the gate forbids saying no');
  });

  test('P6 - the criterion states its own limit and does not claim legality', () => {
    const c = criterion();
    assert.match(c, /proves an obligation was CARRIED FORWARD, not that it was built/,
      'a traceability gate looks like proof of implementation and must refuse the reading');
    assert.match(c, /Legality is not assessed anywhere in this pipeline/,
      'and legality must be disclaimed here too — it is a separate backlog item');
  });

  test('P7 - the prose gate points at its deterministic counterpart and does not claim to be one', () => {
    // AR-2: this section is read by a model — layer 3. Calling it layer 1 would be exactly the
    // documented-but-false safety story this project has been burned by.
    const c = criterion();
    assert.match(c, /check-growth-trace\.cjs/, 'the deterministic checker must be named');
    assert.match(c, /This\s*\n?section is a prose gate read by a model/i,
      'and the prose gate must say what it is');
    assert.match(c, /the utility is the deterministic one/,
      'and which of the two is deterministic');
  });
});
