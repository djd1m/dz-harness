'use strict';

// sparc-prd-mini — Phase 5 must reconcile with Phase 4's data model before its checkpoint.
//
// The skill runs strictly linearly: Phase 4 PSEUDOCODE authors `## Data Structures` — entity types
// with concrete field types — and only then does Phase 5 ARCHITECTURE choose the storage and
// technology those structures have to live in. A sweep from Phase 5 to end-of-file found ZERO
// re-reads of Pseudocode.md, so nothing ever noticed the two documents disagreeing. One ordering
// fact explained three separately-reported field symptoms: a boolean where the schema took an enum,
// an algorithm using a column the schema lacks, and a status with three values on one side and five
// on the other.
//
// The fix is a RECONCILIATION step, deliberately NOT a reorder: SPARC is an acronym — Specification,
// Pseudocode, Architecture, Refinement, Completion — and the skill is named `sparc-prd-mini`.
// Swapping P and A would leave the file claiming a methodology it no longer follows. P5 below guards
// that refused decision, so a later edit cannot quietly take it.
//
// These are PROMPT modules executed by a model, so the strongest deterministic layer available is
// the file's own content. Each assertion is DISCRIMINATING: removing what it names turns it red.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname, '..', '..', 'templates', '.claude', 'skills', 'sparc-prd-mini', 'SKILL.md',
);

function read() {
  return fs.readFileSync(SKILL, 'utf-8');
}

/** The text between the Phase 5 heading and the Phase 6 heading — placement is the property. */
function phase5(src) {
  const start = src.indexOf('### Phase 5: ARCHITECTURE');
  const end = src.indexOf('### Phase 6: REFINEMENT');
  assert.ok(start > 0, 'Phase 5 heading must exist');
  assert.ok(end > start, 'Phase 6 heading must follow Phase 5');
  return src.slice(start, end);
}

describe('sparc-prd-mini — Phase 5 reconciles with Pseudocode (PR-005/PR-010)', () => {
  test('P1 — the reconciliation step lives INSIDE Phase 5, before its checkpoint', () => {
    const block = phase5(read());
    assert.match(block, /СВЕРКА С ПСЕВДОКОДОМ/,
      'the step must be inside Phase 5 — somewhere in the file is not the same property');
    const step = block.indexOf('СВЕРКА С ПСЕВДОКОДОМ');
    const checkpoint = block.indexOf('CHECKPOINT 5');
    assert.ok(checkpoint > 0, 'Phase 5 must still carry its checkpoint');
    assert.ok(step < checkpoint,
      'reconciling AFTER the user has already approved the phase reconciles nothing');
  });

  test('P1b — the step is OUTSIDE the [MANUAL] CP5 block, so AUTO mode cannot skip it', () => {
    // Cross-family QE (Codex gpt-5.6-sol) caught this: the first placement landed the step INSIDE
    // the fenced `**[MANUAL] CP5:**` block, which AUTO mode is entitled to skip — a mandatory
    // reconciliation that only happens in one of two run modes is not mandatory. P1's before/after
    // ordering was true and still missed it, because "before the checkpoint text" and "outside the
    // MANUAL-only block" are two different facts.
    const block = phase5(read());
    const step = block.indexOf('СВЕРКА С ПСЕВДОКОДОМ');
    const manual = block.indexOf('**[MANUAL] CP5:**');
    assert.ok(manual > 0, 'the MANUAL checkpoint marker must still exist');
    assert.ok(step < manual,
      'the step must precede the [MANUAL] marker — inside it, an AUTO run reconciles nothing');
  });

  test('P2 — it names BOTH artifacts to re-read, not "check for consistency"', () => {
    const block = phase5(read());
    assert.match(block, /Pseudocode\.md/, 'the step must name the file it re-reads');
    assert.match(block, /## Data Structures/, 'and the data-model section within it');
    // Codex: "an algorithm uses a missing column" cannot be detected from the type list alone.
    assert.match(block, /## Core Algorithms/,
      'the missing-column kind is undetectable without the algorithms — naming only the data '
      + 'structures would promise a check the step cannot perform');
  });

  test('P3 — all three measured discrepancy kinds are named verbatim', () => {
    const block = phase5(read());
    // Each of these is a real symptom that reached code before this step existed. A generic
    // "look for inconsistencies" would satisfy a reviewer and catch none of them.
    // Checked in BOLD form, i.e. where the kinds are DEFINED. A first draft matched the bare
    // phrase and did not discriminate: the same words also appear inside the example table row, so
    // deleting a kind from the definition list left the assertion green. A phrase appearing in an
    // example is not the same fact as a phrase defining a kind — the fifth instance of that trap
    // in one day, so it is closed by construction here.
    for (const kind of ['смена типа', 'отсутствующая колонка', 'несовпадение набора значений']) {
      assert.ok(block.includes(`**${kind}**`),
        `discrepancy kind must be DEFINED (bold) in the step, not merely mentioned: ${kind}`);
    }
  });

  test('P4 — a written outcome is required in EVERY case, including no-change', () => {
    const block = phase5(read());
    assert.match(block, /## Reconciliation with Pseudocode/,
      'the step must name the block it writes into Architecture.md');
    assert.match(block, /Расхождений с/,
      'the no-change case needs its own stated sentence — silence cannot distinguish '
      + '"reconciled and clean" from "never reconciled"');
  });

  test('P5 — SPARC order is unchanged: the refused decision stays refused', () => {
    const src = read();
    const order = ['### Phase 3: SPECIFICATION', '### Phase 4: PSEUDOCODE',
      '### Phase 5: ARCHITECTURE', '### Phase 6: REFINEMENT', '### Phase 7: COMPLETION'];
    const at = order.map((h) => {
      const i = src.indexOf(h);
      assert.ok(i > 0, `heading must exist: ${h}`);
      return i;
    });
    for (let i = 1; i < at.length; i += 1) {
      assert.ok(at[i] > at[i - 1],
        `phases must stay in S-P-A-R-C order — the acronym IS the method's name; ${order[i]} moved`);
    }
  });
});
