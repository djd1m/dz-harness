'use strict';

// Two prose defects in 05-growth-engine.md, shipped as one change because the file has four
// byte-identical copies and splitting them means two three-package releases.
//
// P4: the growth-type list forced ONE choice across TWO different questions — how a company reaches
// buyers, and what makes usage produce more usage. A sales-led company running a referral loop was
// literally unsayable. Three loop mechanics were also absent.
//
// P2: the Research Protocol's three modes mentioned no constraint of any kind, so the module could
// design a violation with full confidence — confidence here comes from data quality, not legality.
//
// The load-bearing rule in P2's fix, and the evidence for it is the source report's own failure: it
// warned that a 2024 penalty figure was stale and then quoted the 2025 figure as current, in August
// 2026. Warning and error, one document, one year apart. So: cite the norm, never the amount — and
// P5 exists to make a future edit that re-adds a figure go red.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULE = path.join(__dirname, '..', '..', 'templates', '.claude', 'skills',
  'reverse-engineering-unicorn', 'modules', '05-growth-engine.md');

const read = () => fs.readFileSync(MODULE, 'utf-8');

/** A named section, from its heading to the next heading at the same level. */
function section(heading, level) {
  const src = read();
  const start = src.indexOf(heading);
  assert.ok(start > 0, 'the module must carry: ' + heading);
  const end = src.indexOf('\n' + '#'.repeat(level) + ' ', start + 1);
  assert.ok(end > start, heading + ' must be followed by another section');
  return src.slice(start, end);
}

const compliance = () => section('### ⚖️ Чеклист допустимости', 3);

describe('growth type is two questions, and the protocol knows constraints exist', () => {
  test('P1 - the two axes are separate and independently chosen', () => {
    const src = read();
    assert.match(src, /\*\*Ось 1 — МОТИОН/, 'the go-to-market axis must be its own list');
    assert.match(src, /\*\*Ось 2 — ПЕТЛЯ/, 'and the loop axis its own');
    assert.match(src, /Оси НЕЗАВИСИМЫ/, 'independence must be stated, not left to be inferred');
    assert.match(src, /Sales-Led` \+ `Поощряемая реферальная/,
      'and shown with the combination the old single list made unsayable');

    // The defect was ONE instruction spanning both questions. Its removal is the property.
    assert.ok(!/\*\*Выбранный тип:\*\* \[ONE из:\]/.test(src),
      'the single cross-axis selector must be gone, or the fix is cosmetic');
  });

  test('P2 - the three missing loop mechanics are present', () => {
    const src = read();
    for (const m of ['Значковая / встраиваемая', 'Поощряемая реферальная', 'Сетевой эффект']) {
      assert.ok(src.includes(m), 'the loop axis must offer: ' + m);
    }
    // "no loop" must be sayable, or every project claims one it does not have.
    assert.match(src, /Нет петли/, 'absence of a loop must be a choice');
    assert.match(src, /полноценный ответ, а не пропуск/,
      'and must be marked as an answer, not a blank');
  });

  test('P3 - the artifact does not claim the module was blind to virality', () => {
    // The backlog item's own correction: the K-factor is already tracked and referrals already
    // appear in the TRIZ table. A false problem statement outlives the fix that follows it.
    const src = read();
    assert.ok(/K-фактор|K-factor/.test(src), 'the pre-existing K-factor site must survive the edit');
    assert.ok(/[Рр]еферал|referral/i.test(src), 'and the pre-existing referral mentions');
    for (const claim of ['не знает про виральность', 'слеп к виральности', 'ignores virality']) {
      assert.ok(!src.includes(claim), 'the module must not be accused of what it already did: ' + claim);
    }
  });

  test('P4 - the compliance checklist covers all three research modes', () => {
    const src = read();
    const c = src.indexOf('### ⚖️ Чеклист допустимости');
    const quick = src.indexOf('### 🟢 Режим QUICK');
    assert.ok(c > 0 && quick > c,
      'the checklist must precede the modes, or it reads as an afterthought to QUICK alone');
    assert.match(compliance(), /все три режима/,
      'and must say it applies to all three, not only the one it sits above');
  });

  // The two detectors P5 runs. Declared at module scope so P8 can drive them over counter-examples:
  // a detector asserted only against text that happens to be clean proves nothing about its reach.
  //
  // Cross-family review found both too narrow. The statute pattern REQUIRED a leading number, so the
  // ordinary form `Article 6 GDPR` slipped through; the money pattern required a currency marker, so
  // a bare threshold such as `30 дней` did too — and the rule forbids thresholds, not only prices.
  const MONEY = /(?:[0-9][0-9\s,.]*\s*(?:долл|USD|\$|€|руб|₽|%|дн(?:я|ей)|мес|год|лет|час|тыс|млн))|(?:(?:не более|не менее|до|свыше|от)\s+[0-9])/gi;
  const L = '(?<![\\p{L}\\p{N}])';   // a real left boundary, Cyrillic included
  const STATUTE = new RegExp(
    '(?:' + L + '\\d+\\s*(?:CFR|U\\.?S\\.?C|USC|ФЗ))'
    + '|(?:' + L + '(?:Article|Art\\.|Статья|ст\\.)\\s*\\d+)'
    + '|(?:' + L + '(?:GDPR|CCPA))'
    + '|(?:' + L + 'ФЗ[- ]?\\d+)'
    + '|(?:' + L + '\\d+-ФЗ)', 'giu');

  test('P5 - no monetary figure and no statute is asserted', () => {
    // THE rule. A number in a template is wrong within a year; a statute is jurisdiction-specific and
    // unverified in this repository. Written so a future edit re-adding either goes red.
    const c = compliance();
    MONEY.lastIndex = 0; STATUTE.lastIndex = 0;
    const money = c.match(MONEY) || [];
    assert.deepEqual(money, [],
      'a monetary figure or threshold appeared in the checklist: ' + JSON.stringify(money));
    const statutes = c.match(STATUTE) || [];
    assert.deepEqual(statutes, [],
      'a statute is asserted as authoritative, and none was verified here: ' + JSON.stringify(statutes));
    assert.match(c, /Ссылайтесь на \*\*норму и на то, где её смотреть\*\*, никогда — на сумму/,
      'the rule itself must be written down, or the absence above is an accident');
    assert.match(c, /Здесь намеренно нет ни одной\s*\n?цифры/,
      'and the absence must be declared deliberate, so a later editor does not "helpfully" add one');
  });

  test('P6 - it is questions, and it says it is not a gate', () => {
    const c = compliance();
    assert.match(c, /это вопросы, а не утверждения о праве/,
      'a template installed into arbitrary projects cannot assert any project law');
    assert.match(c, /Это не юридическая проверка и не застава/,
      'and it must refuse to be read as a gate — it has no verifiable input');
    assert.match(c, /у неё нет проверяемого входа/, 'with the reason stated');
    assert.match(c, /Ответ «нет» — это находка, а не формальность/,
      'an unanswered question and a cleared one must not look alike');
    assert.ok((c.match(/^\| \d+ \|/gm) || []).length >= 5,
      'the checklist needs enough questions to be worth running');
  });

  test('P8 - the detectors CATCH the forms a future edit would actually add', () => {
    // A detector run only against clean text is vacuous evidence: it cannot be distinguished from a
    // detector that matches nothing at all. These are the exact strings that slipped through the
    // first version, plus the ones it did catch, so the fix is proven to have widened reach without
    // losing it.
    const mustCatch = [
      ['штраф 53088 долларов', MONEY, 'the stale figure this whole rule exists because of'],
      ['30 дней', MONEY, 'a bare time threshold — the rule forbids thresholds, not only prices'],
      ['не более 3 месяцев', MONEY, 'a threshold written in words plus a number'],
      ['до 20% оборота', MONEY, 'a percentage cap'],
      ['Article 6 GDPR', STATUTE, 'the ordinary citation form, which needed no leading number'],
      ['16 CFR Part 465', STATUTE, 'the US form'],
      ['ст. 15 ФЗ-152', STATUTE, 'the Russian form'],
      ['152-ФЗ', STATUTE, 'and its other spelling'],
    ];
    for (const [text, re, why] of mustCatch) {
      re.lastIndex = 0;
      assert.ok(re.test(text), 'detector missed (' + why + '): ' + JSON.stringify(text));
    }

    // And it must not fire on ordinary prose, or the guard becomes noise someone disables.
    const mustNotCatch = ['вопрос 1', 'семь вопросов', 'Ось 2 — ПЕТЛЯ', 'K-фактор'];
    for (const text of mustNotCatch) {
      MONEY.lastIndex = 0; STATUTE.lastIndex = 0;
      assert.ok(!MONEY.test(text) && !STATUTE.test(text),
        'detector false-fires on ordinary text: ' + JSON.stringify(text));
    }
  });

  test('P7 - the staleness lesson is recorded where the next editor will read it', () => {
    // The reason for the norm-not-amount rule is a real, dated failure. Keeping the reason next to
    // the rule is what stops the rule from being softened by someone who does not know why it exists.
    const c = compliance();
    assert.match(c, /предупреждал, что цифра позапрошлого\s*\n?года устарела/,
      'the source failure must be recorded');
    assert.match(c, /Предупреждение и ошибка в одном\s*\n?документе/,
      'including what made it instructive');
  });
});
