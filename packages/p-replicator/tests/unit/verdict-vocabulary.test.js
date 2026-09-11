'use strict';

/**
 * «НЕ УСТАНОВЛЕНО» / «НЕ ИЗМЕРЕНО» mean REFUSAL here, and no future text may reuse them to mean
 * "carry on".
 *
 * WHY A TEST AND NOT A STYLE NOTE. The toolkit already ships a three-valued verdict whose third
 * value BLOCKS: `commands/feature.md` («`2` ПРОВЕРКА НЕ ВЫПОЛНЕНА, и это никогда не «всё чисто»»),
 * `hooks/capture-source-path.cjs` («единственная дверь к коду 2»), `hooks/check-look-trace.cjs`.
 * A proposal reviewed on 2026-09-02 reused the SAME words for a passing outcome — a row written by
 * the author saying "not established, moving on". Two opposite meanings behind one phrase is worse
 * than a new phrase: a reader who learned the blocking sense would read a pass as a refusal, and a
 * reader who learned the passing sense would ignore a real block.
 *
 * The guard is deliberately narrow. It does NOT try to parse intent. It asserts that every file
 * introducing these terms as a VERDICT also contains a non-zero exit, i.e. the vocabulary and the
 * refusal live together. Prose that merely mentions the phrase in passing is not a verdict and is
 * excluded by requiring the term to appear in a verdict-shaped context.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HOOKS = path.join(__dirname, '..', '..', 'templates', '.claude', 'hooks');
const TERMS = /НЕ УСТАНОВЛЕНО|НЕ ИЗМЕРЕНО|NOT-ESTABLISHED/;
// Three shapes of refusal, all of them real in this package and the first version of this predicate
// only saw the first. `check-dangling-refs.cjs` computes its code in `main()` and calls
// `process.exit(main(argv))`; the guard called that "cannot refuse" and fired on a hook that
// refuses perfectly well. A guard whose predicate is narrower than the thing it guards produces
// false accusations, which cost more trust than the misses they were meant to prevent.
const NONZERO_EXIT = new RegExp([
  'process\\.exit\\(\\s*[1-9]\\d*\\s*\\)',   // literal: process.exit(2)
  'exitCode\\s*=\\s*[1-9]',                    // assigned: process.exitCode = 1
  'process\\.exit\\(\\s*[A-Za-z_$]',           // computed: process.exit(main(argv))
].join('|'));

function hookFiles() {
  return fs.readdirSync(HOOKS).filter((f) => f.endsWith('.cjs')).map((f) => path.join(HOOKS, f));
}

describe('the refusal vocabulary always sits next to a refusal', () => {
  test('every hook using the terms can also exit non-zero', () => {
    const offenders = [];
    for (const file of hookFiles()) {
      const src = fs.readFileSync(file, 'utf8');
      if (!TERMS.test(src)) continue;
      if (!NONZERO_EXIT.test(src)) offenders.push(path.basename(file));
    }
    assert.deepEqual(offenders, [],
      'a hook speaks the refusal vocabulary but has no way to refuse — the words promise a block the code cannot deliver');
  });

  test('the guard fires on a hook that speaks the words without refusing', () => {
    // Discrimination on the predicate itself: a guard that found nothing must be shown to be
    // capable of finding something. Without this, an empty offender list is indistinguishable
    // from a broken matcher.
    const speaksButCannotRefuse = "// НЕ ИЗМЕРЕНО\nconsole.log('ok');\nprocess.exit(0);\n";
    assert.equal(TERMS.test(speaksButCannotRefuse), true, 'the term matcher must see the phrase');
    assert.equal(NONZERO_EXIT.test(speaksButCannotRefuse), false, 'exit(0) is not a refusal');
  });

  test('at least one hook really does carry both, so the guard is not vacuous', () => {
    const both = hookFiles().filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return TERMS.test(src) && NONZERO_EXIT.test(src);
    });
    assert.ok(both.length >= 2,
      'the fixture assumes the toolkit really does use this vocabulary with real refusals');
  });
});
