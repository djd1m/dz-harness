'use strict';

// The M5 growth analysis reached Phase 1 as an in-conversation --product-brief value and was never
// written to disk (sparc-prd-mini/SKILL.md:993-999). MEASURED before this feature:
// `grep -rn 'growth' sparc-prd-mini/ requirements-validator/` returned 0 hits in these templates.
//
// So the filed diagnosis — "no downstream step is obliged to read the analysis" — was one layer off.
// There was nothing to read. A seed section alone would have written obligations into an artifact
// that evaporates, which is why P1 assertions here are paired with the persistence ones.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const REPLICATE = path.join(TPL, 'commands', 'replicate.md');
const MODULE = path.join(TPL, 'skills', 'reverse-engineering-unicorn', 'modules', '05-growth-engine.md');

const read = (f) => fs.readFileSync(f, 'utf-8');

/** The seed section, from its heading to the next top-level one. */
function seedSection() {
  const src = read(MODULE);
  const start = src.indexOf('## 🌱 Growth Requirements Seed');
  assert.ok(start > 0, '05-growth-engine.md must carry the seed section');
  const end = src.indexOf('\n## ', start + 1);
  assert.ok(end > start, 'the seed section must be followed by another section');
  return src.slice(start, end);
}

describe('the growth analysis becomes a written, traceable obligation', () => {
  test('P1 - Phase 0 names and writes the brief path', () => {
    const src = read(REPLICATE);
    assert.match(src, /docs\/product-discovery-brief\.md/,
      'Phase 0 must name the exact path it writes, or no consumer can find it');

    // ORDER is the property, not mere presence: writing after the hand-off would leave Phase 1
    // running against a brief the file does not yet contain.
    const write = src.indexOf('**Write** the full Product Discovery Brief');
    const hand = src.indexOf('pass it to Phase 1 as pre-filled context');
    assert.ok(write > 0 && hand > write,
      'the write must be instructed BEFORE the hand-off: write=' + write + ' handoff=' + hand);
  });

  test('P2 - the in-context hand-off is preserved, not replaced', () => {
    // FR-A2. Replacing the hand-off with a file read would change what Phase 1 receives and silently
    // break the documented pre-filled-context contract in sparc-prd-mini.
    const src = read(REPLICATE);
    assert.match(src, /pre-filled context/,
      'the hand-off must survive — the file is an ADDITION');
    assert.match(src, /the file is an ADDITION/i,
      'and the artifact must say so, so a later editor does not "simplify" one of the two away');
  });

  test('P3 - an absent brief means Phase 0 did not run, and the artifact says so', () => {
    // FR-A3. The --from-docs entry skips Phase 0 entirely. Absence read as "no growth requirements"
    // would penalise every --from-docs project forever.
    const src = read(REPLICATE);
    assert.match(src, /absent it means Phase 0 did not run/i,
      'absence must be given its meaning where the path is defined');
    assert.match(src, /NOT evidence that the\s+project has no growth requirements/i,
      'and the wrong reading must be refused explicitly');
  });

  test('P4 - the seed emits ids with a defined form', () => {
    const s = seedSection();
    assert.match(s, /FR-GROWTH-<nnn>/, 'the id form must be stated');
    assert.match(s, /три цифры, по порядку, номер не переиспользуется/,
      'an id without a uniqueness rule is an intention, not an identifier');
    assert.match(s, /FR-GROWTH-001/, 'and the table must show a concrete row');
  });

  test('P5 - every row must name its source block', () => {
    const s = seedSection();
    assert.match(s, /Блок-источник/, 'the table needs a source column');
    assert.match(s, /Требование без источника непрослеживаемо/,
      'and the rule must say a sourceless row is not a seed at all');
  });

  test('P6 - confidence is carried verbatim, never recomputed', () => {
    // The module declares NO numeric threshold and confidence is not one scale across modes
    // (SKILL.md:60-64 — QUICK is a manual X/5, DEEP is a formula). Normalising would invent a number
    // nobody measured, so the rule is verbatim carry plus the SHIPPED [H] convention for doubt.
    const s = seedSection();
    assert.match(s, /Confidence переносится ДОСЛОВНО/, 'verbatim carry must be the rule');
    assert.match(s, /Не пересчитывайте/, 'and recomputation must be refused');
    assert.match(s, /\[H\]/, 'SPECULATIVE must hang on the shipped [H] convention');
    assert.match(s, /НЕ НАЙДЕНО/, 'and on the shipped not-found convention');
    assert.ok(!/confidence\s*[<>]\s*0\.\d/i.test(s),
      'a numeric threshold would be a convention invented here: ' + s.slice(0, 80));
  });

  test('P7 - the section states BOTH limits in the shipped artifact', () => {
    // A seed table looks like proof of work planned. It is neither proof of building nor of legality.
    const s = seedSection();
    assert.match(s, /Черновик ≠ построено/, 'draft-is-not-built must be written where a reader sees it');
    // RECONCILED 2026-08-27. The first version said flatly "Законность НЕ проверена" — true then,
    // and false the moment the same feature-day added the ⚖️ compliance checklist, which DOES ask.
    // Cross-family review found the contradiction: the seed disclaimed a question the module now
    // puts to the user. The replacement is narrower AND stronger — asked, recorded, not established
    // — and the distinction it draws is the load-bearing half.
    assert.match(s, /Допустимость СПРОШЕНА, но не установлена/,
      'the seed must say the question is asked, since the checklist asks it');
    assert.match(s, /Это не юридическое заключение/,
      'and must refuse to be read as a legal opinion');
    assert.match(s, /не «это законно»/,
      'the difference between "seven questions cleared" and "lawful" is the whole point');
    assert.ok(!/Законность НЕ проверена/.test(s),
      'the old flat disclaimer now contradicts the checklist and must not survive beside it');
  });

  test('P8 - an empty seed must be written, not omitted', () => {
    // An absent table and a table saying "nothing to seed" are indistinguishable to the next reader,
    // and the checker depends on being able to tell them apart.
    const s = seedSection();
    assert.match(s, /Пустая таблица — тоже ответ/, 'the empty case must be given a shape');
    assert.match(s, /написана словом `нет`/, 'and a concrete token to write');
  });

  test('P9 - the seed says where it goes, closing the loop it was built to close', () => {
    const s = seedSection();
    assert.match(s, /docs\/product-discovery-brief\.md/, 'the seed must name its carrier file');
    assert.match(s, /docs\/Specification\.md/, 'and its destination');
    assert.match(s, /Фаза 2 проверяет/, 'and name the phase that checks the promotion happened');
  });
});
