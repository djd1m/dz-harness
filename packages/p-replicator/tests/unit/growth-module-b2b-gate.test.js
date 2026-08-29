'use strict';

// Two callers disabled the exact branch the module they call declares. MEASURED:
//
//   commands/replicate.md:169        | M5: Growth Engine | If B2C/PLG | …
//   agents/product-discoverer.md:22  | M5: Growth Engine | If B2C/PLG | …
//   modules/05-growth-engine.md:62   - Если B2B → sales-led growth, не product-led; переключи framework
//   reverse-engineering-unicorn/SKILL.md:94   MODULE 5: GROWTH ENGINE → …      (no condition)
//
// Three files disagreed about whether M5 runs, and the two that said "only for B2C" were the ones
// that decided. For every B2B project the one output slot — product-discoverer.md "### Growth
// Channels [From growth engine analysis — if applicable]" — arrived empty, not because there was
// nothing to say but because the gate stopped the module that would have said it.
//
// NOT done, deliberately: editing the growth module. It exists in four byte-identical copies across
// three published packages, kept in step by a --check gate that exits 1 on drift. A two-line fix in
// two callers touches ONE package; touching the module is a three-package release. P5 pins that.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const read = (rel) => fs.readFileSync(path.join(TPL, rel), 'utf-8');

const CALLERS = [
  { file: 'commands/replicate.md', produces: 'Channels, integrations' },
  { file: 'agents/product-discoverer.md', produces: 'Channels, integrations, viral loops' },
];
const MODULE = 'skills/reverse-engineering-unicorn/modules/05-growth-engine.md';

/** EVERY table row that decides whether M5 runs. Cross-family QE: taking the FIRST match let a gate
 *  come back in a duplicate row further down, invisible to both helpers. */
function m5Rows(file) {
  const rows = read(file).split('\n').filter((l) => l.startsWith('| M5: Growth Engine |'));
  assert.equal(rows.length, 1,
    file + ' must have exactly one M5 row; found ' + rows.length + ': ' + JSON.stringify(rows));
  return rows;
}
const cells = (row) => row.split('|').map((c) => c.trim());

describe('the growth module is not gated off for the type it handles itself', () => {
  test('P1 — neither caller conditions M5 on a product type', () => {
    // Asserted on the ROW, not the file: the phrase "B2C" appears legitimately elsewhere (the
    // sentence explaining WHY the gate went), and a whole-file check would forbid the explanation.
    // The property is not "no condition" — cross-family QE was right that `Always` over-promises,
    // because M5's outputs are CAC, channels and loops and an internal tool with no acquisition
    // objective has nothing to put in them. The property is that the condition does not EXCLUDE a
    // product type the module handles: if it names types at all, B2B must be among them.
    for (const { file } of CALLERS) {
      for (const row of m5Rows(file)) {
        const condition = cells(row)[2];
        assert.notEqual(condition, '', file + ': the M5 condition cell is empty');
        const namesTypes = /B2C|B2B|PLG|product-led|sales-led/i.test(condition);
        if (namesTypes) {
          assert.match(condition, /B2B/i,
            file + ' gates M5 on product type and leaves B2B out — the module handles B2B at '
            + 'modules/05-growth-engine.md:62: ' + JSON.stringify(condition));
        }
        assert.ok(!/^If B2C/i.test(condition),
          file + ' restored the original product-type gate: ' + JSON.stringify(condition));
      }
    }
  });

  test('P2 — the row keeps saying what M5 produces', () => {
    // A removal that took the row with it would satisfy P1 and lose the module from the table.
    // The OUTPUT COLUMN, not a substring of the row: cross-family QE noted a substring check passes
    // if the text drifts into the condition cell.
    for (const { file, produces } of CALLERS) {
      for (const row of m5Rows(file)) {
        assert.equal(cells(row)[3], produces,
          file + ' lost or moved M5\'s output column: ' + row);
      }
    }
  });

  test('P3 — the orchestrator still runs M5 unconditionally: it is the fixed point', () => {
    const skill = read('skills/reverse-engineering-unicorn/SKILL.md');
    const line = skill.split('\n').find((l) => l.includes('MODULE 5: GROWTH ENGINE'));
    assert.ok(line, 'SKILL.md must still list MODULE 5');
    assert.ok(!/if |если |B2C|B2B|PLG/i.test(line),
      'the orchestrator must stay unconditional — all three files agree with IT: ' + line);
  });

  test('P4 — the module\'s own B2B branch survives the removal that it justifies', () => {
    // This is the load-bearing one. Removing the gate is safe BECAUSE the module decides per type.
    // Without this assertion someone could delete the justification and keep the removal, and the
    // module would then run for B2B with no B2B behaviour.
    // REWORDED 2026-08-27 by growth-list-and-compliance. The old wording said "sales-led growth,
    // не product-led", treating MOTION and LOOP as one exclusive choice — which the axis split had
    // just refuted, so a B2B company with a sales-led motion and a product-led loop was told to
    // reject the latter. Cross-family review caught the contradiction. The INTENT this test defends
    // is unchanged and still asserted below: the module branches on type, which is what makes the
    // ungated call correct. Only the wording moved, and it now says which axis it speaks about.
    assert.match(read(MODULE), /Если B2B → мотион почти всегда sales-led или partnership-led/,
      'the branch that makes the ungated call correct must still be there');
    assert.match(read(MODULE), /ТОЛЬКО про ось 1: петля выбирается отдельно/,
      'and it must scope itself to one axis, or it re-asserts the exclusivity the split removed');
  });

  test('P5 — the growth module is byte-identical: this feature touches two callers only', () => {
    // Four byte-identical copies across three published packages hang off this file. Pinning its
    // hash is what keeps a two-line fix from becoming a three-package release by accident.
    //
    // MOVED ONCE, deliberately, 2026-08-27 by growth-requirements-bridge, which added the
    // `Growth Requirements Seed` section and IS the three-package release this message demands.
    // MOVED A THIRD TIME by prebake-skill-paths: the module's own /mnt/ references became
    // .claude/skills/ paths. Pins: 98e8577a… → bd9cfcb8… → 6657dbe2… → this.
    // MOVED AGAIN, same day, by growth-list-and-compliance (two axes + the compliance
    // checklist) — also a three-package release. Pins so far: 98e8577a… → bd9cfcb8… → this.
    // Previous pin: 98e8577a… The tripwire is not weakened by the move — re-pinning is the
    // conscious decision it exists to force, and the accompanying module-copy-identity.test.js now
    // also proves all four copies still agree, which a single hash never could.
    const sha = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(TPL, MODULE))).digest('hex');
    assert.equal(sha, '84658390dc7beb590f70164b391ace915e42926660bc1015e4be300752b74a37',
      'the growth module changed; that is a three-package release, not this feature');
  });
});
