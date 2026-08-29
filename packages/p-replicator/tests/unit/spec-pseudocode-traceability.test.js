'use strict';

// A scenario could promise a check that no algorithm performs, and nothing in the pipeline could
// notice. MEASURED: Specification.md's user-story template produced Gherkin acceptance criteria with
// no identifier of any kind, Pseudocode.md's algorithm template was "### Algorithm: [Name]" with no
// back-reference, and a sweep of the skill for traceab|SC-\d|scenario id returned nothing. The two
// documents are written one phase apart and were never compared again.
//
// WHAT THIS FEATURE CLAIMS, exactly. It establishes that a CLAIM exists and that its two ends name
// each other. It does not establish that the algorithm performs the check — no comparison of names
// can. The nearest precedent says the same of itself: the K2 gate's own source records that its C1
// check is a grep and that PROSE satisfies it. So this catches "nobody wrote anything about this
// scenario"; it does not catch "someone wrote a line that mentions it", and closing a gap with
// paperwork is precisely the failure the field report is about. P6 asserts the limit is written into
// the template, so the next reader sees the same caveat the author did.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '..', 'templates', '.claude', 'skills',
  'sparc-prd-mini', 'SKILL.md');
const read = () => fs.readFileSync(SKILL, 'utf-8');

function phase(src, heading, nextHeading) {
  const start = src.indexOf(heading);
  const end = src.indexOf(nextHeading, start + 1);
  assert.ok(start > 0, 'missing section: ' + heading);
  assert.ok(end > start, 'missing terminator: ' + nextHeading);
  return src.slice(start, end);
}

const phase3 = (src) => phase(src, '### Phase 3: SPECIFICATION', '### Phase 4: PSEUDOCODE');
const phase4 = (src) => phase(src, '### Phase 4: PSEUDOCODE', '### Phase 5: ARCHITECTURE');

describe('a scenario and the algorithm that claims it can be traced to each other (PR-003)', () => {
  test('P1 — Phase 3 gives every acceptance scenario an ID of a stated form', () => {
    const block = phase3(read());
    assert.match(block, /\[SC-<story-id>-1\]/,
      'the ID must appear IN the template, so its form is unambiguous rather than described');
    assert.match(block, /`SC-<US-id>-<n>`/, 'and the form must be stated');
    // Cross-family QE: <story-id> had no definition and no uniqueness rule, so two scenarios could
    // end up with the same name and a trace would point at either.
    assert.match(block, /`US-<nnn>` — three digits, assigned in order, never reused/,
      'the story id must be DEFINED, with a uniqueness rule, or the scenario id is not well-formed');
    assert.match(block, /the scenarios of `US-007` are `SC-US-007-1`/,
      'and shown worked once, so the composition is unambiguous');
    assert.match(block, /nothing to trace to if a scenario has no\s+name/,
      'and WHY, or a later editor drops the ID as noise');
  });

  test('P2 — Phase 4 algorithms declare what they realise, where they are written', () => {
    const block = phase4(read());
    // Structural, not textual: between the algorithm heading and its INPUT line. Cross-family QE
    // noted the first version only proved the string occurs somewhere in the phase.
    const at = block.indexOf('### Algorithm: [Name]');
    assert.ok(at > 0, 'the algorithm template must exist');
    const algo = block.slice(at, block.indexOf('COMPLEXITY', at));
    assert.match(algo, /REALISES: \[SC-… ids this algorithm implements/,
      'the declaration must sit in the algorithm block itself, not in a table someone must remember');
    assert.ok(algo.indexOf('REALISES') < algo.indexOf('INPUT:'),
      'and beside INPUT/OUTPUT where the algorithm is written, not appended after it');
  });

  test('P3 — the reconciliation is INSIDE Phase 4 and OUTSIDE the [MANUAL] CP4 block', () => {
    // Placement is the property, twice over. A step after Phase 4 reconciles nothing in time; a step
    // inside the fenced [MANUAL] block is skipped by an AUTO run, so a "mandatory" step would run in
    // half of runs. The sibling Phase-5 feature shipped that exact defect and had it caught in
    // review — "precedes the checkpoint text" and "outside the MANUAL-only block" are two different
    // facts, and only the second one is the property.
    const src = read();
    const block = phase4(src);
    const step = block.indexOf('**Шаг 4.9 — ПОКРЫТИЕ СЦЕНАРИЕВ');
    const manual = block.indexOf('**[MANUAL] CP4:**');
    assert.ok(step > 0, 'the coverage step must live inside Phase 4');
    assert.ok(manual > step,
      'and BEFORE the manual checkpoint block, not after it: ' + step + ' vs ' + manual);
    // NOTE: an earlier version added a "not inside the fenced block" assertion here. It was VACUOUS
    // — the fence is located FROM `manual`, so after `manual > step` the step cannot be inside it.
    // Cross-family QE caught it. The assertion above is the real guard, and the mutation that moves
    // the step into the fenced block turns it red, which is the evidence that matters.
  });

  test('P4 — a Scenario Coverage block is required in EVERY case, including all-covered', () => {
    const block = phase4(read());
    assert.match(block, /## Scenario Coverage/,
      'the required output block must be named, or "reconcile" is advice');
    assert.match(block, /in every\s+case, including the one where everything is covered/,
      'an absent block and a block saying "all covered" are indistinguishable to the next reader');
    assert.match(block, /Not claimed by any algorithm:/,
      'and the uncovered scenarios must be listed, not summarised as a count');
    // Cross-family QE: the check ran ONE WAY. An algorithm could declare REALISES for a scenario
    // nobody ever wrote, and the dangling reference reads exactly like coverage.
    assert.match(block, /Claimed by an algorithm but absent from Specification\.md:/,
      'traceability must run both ways, or a dangling REALISES passes as coverage');
    assert.match(block, /Both tables are required, and both may be the single word `none`/,
      'and the empty case must be written out — an empty table and a forgotten one look identical');
  });

  test('P5 — the reason vocabulary is CLOSED, and the two escape hatches are rejected by name', () => {
    const block = phase4(read());
    const expected = ['ui-only', 'external-service', 'out-of-mvp-scope', 'data-only', 'config-only'];
    for (const reason of expected) {
      assert.ok(block.includes('`' + reason + '`'),
        'the closed list must carry the reason: ' + reason);
    }
    assert.match(block, /CLOSED list of five/, 'and declare itself closed, with its size');
    // CLOSED means closed: the first version asserted the values exist and let a sixth in silently.
    // The count is the property, and it must agree with the stated size.
    const at = block.indexOf('CLOSED list of five');
    const table = block.slice(at, block.indexOf('Free text is NOT a reason', at));
    const rows = table.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l));
    assert.equal(rows.length, expected.length,
      'the reason table must have exactly the stated number of rows: ' + JSON.stringify(rows));
    // Without these two named, "free text" creeps back as the default and the list means nothing.
    assert.match(block, /Free text is NOT a reason, and `N\/A` is NOT a reason/,
      'the two ways this field gets emptied must be rejected by name');
    assert.match(block, /A field that accepts anything records nothing/,
      'with the reason, so the rejection survives an editor who finds it unfriendly');
  });

  test('P6 — the template states its own limit', () => {
    // The load-bearing honesty. A traceability block LOOKS like proof of implementation, and the
    // field report's actual complaint is gaps closed with paperwork — which this cannot detect.
    const block = phase4(read());
    assert.match(block, /It does NOT establish that the algorithm's steps actually perform the check/,
      'the limit must be written into the artifact, not only into the feature\'s own report');
    assert.match(block, /nobody wrote anything about this\s+scenario/,
      'and the class it DOES catch must be named, so the claim is bounded on both sides');
  });

  test('P7 — the phase order is still S→P→A→R→C', () => {
    // Regression guard on the file this edits: the skill is named sparc-prd-mini and its phases are
    // the acronym. A reorder would leave it claiming a methodology it no longer follows.
    const src = read();
    const order = ['### Phase 3: SPECIFICATION', '### Phase 4: PSEUDOCODE',
      '### Phase 5: ARCHITECTURE', '### Phase 6: REFINEMENT', '### Phase 7: COMPLETION'];
    let prev = -1;
    for (const h of order) {
      const at = src.indexOf(h);
      assert.ok(at > prev, 'phases must appear in SPARC order; out of place: ' + h);
      prev = at;
    }
  });
});
