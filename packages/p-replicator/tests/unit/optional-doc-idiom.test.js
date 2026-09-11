'use strict';

/**
 * A document may be retired from the required set only WITH A DATED MEASUREMENT beside it.
 *
 * WHY THIS IS A TEST AND NOT A CONVENTION. Retiring a document is the cheapest way to make a
 * pipeline look faster, and it is invisible afterwards: nobody notices a check that stopped
 * running. The package already ships the honest form of this move — `Final_Summary.md` carries
 * `{ optional: true, expected: true }` plus a comment naming WHAT was measured, WHEN, and WHY the
 * evidence is not yet enough to decide. That is reversible and it leaves a receipt.
 *
 * This test makes the receipt mandatory. `optional: true` without a `MEASURED YYYY-MM-DD` comment
 * above it turns red, so the next person who wants to drop a document must either measure or argue
 * in the open. The guard is deliberately about the RECEIPT, not about which documents are optional:
 * deciding that is a design call, and this file does not pretend to make it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', '..', 'templates', '.claude', 'hooks', 'check-docs-complete.cjs');
const DATE = /MEASURED \d{4}-\d{2}-\d{2}/;

/** Lines of the DOCS array, paired with the comment block immediately above each entry. */
function optionalEntriesWithContext(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    // Match an ENTRY of the DOCS array, not any prose that happens to contain the words. The first
    // version of this parser matched a doc-comment at :29 that merely EXPLAINS the flag, which
    // would have made the guard permanently red for a reason unrelated to any real receipt.
    if (!/^\s*\{\s*file:\s*'[^']+'.*optional:\s*true/.test(line)) return;
    // Walk up through the contiguous comment block directly above this entry.
    let j = i - 1;
    const comment = [];
    while (j >= 0 && /^\s*\/\//.test(lines[j])) { comment.unshift(lines[j]); j -= 1; }
    out.push({ line: i + 1, entry: line.trim(), comment: comment.join('\n') });
  });
  return out;
}

describe('retiring a document leaves a dated receipt', () => {
  test('every `optional: true` entry carries a MEASURED date above it', () => {
    const source = fs.readFileSync(HOOK, 'utf8');
    const entries = optionalEntriesWithContext(source);
    assert.ok(entries.length > 0, 'the fixture assumes at least one optional document exists');

    const undated = entries.filter((e) => !DATE.test(e.comment));
    assert.deepEqual(
      undated.map((e) => `${HOOK}:${e.line} ${e.entry}`),
      [],
      'a document was made optional without a dated measurement — say what was measured and when',
    );
  });

  test('the guard fires on an injected undated entry', () => {
    // Discrimination: without this, a guard that found nothing would look identical to a guard
    // that cannot see anything. Inject the exact shape it must catch.
    const injected = [
      "const DOCS = [",
      "  { file: 'Honest.md' },",
      "  // a comment with no date at all",
      "  { file: 'Sneaky.md', optional: true },",
      "];",
    ].join('\n');
    const found = optionalEntriesWithContext(injected).filter((e) => !DATE.test(e.comment));
    assert.equal(found.length, 1, 'the parser must catch an undated optional entry');
    assert.match(found[0].entry, /Sneaky\.md/);
  });

  test('a dated entry passes, so the guard is not simply always-red', () => {
    const injected = [
      "const DOCS = [",
      "  // MEASURED 2026-08-27 against a real project: produced 8 of 9 promised documents.",
      "  { file: 'Final_Summary.md', optional: true, expected: true },",
      "];",
    ].join('\n');
    const found = optionalEntriesWithContext(injected).filter((e) => !DATE.test(e.comment));
    assert.deepEqual(found, [], 'a dated entry must pass');
  });
});
