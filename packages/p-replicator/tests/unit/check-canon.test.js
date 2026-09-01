'use strict';

// The deterministic half of «канон до диспатча». There is NO new always-loaded rule for this
// feature, and that is a decision, not an omission: the package's corpus budget is spent (measured
// 2026-09-01), the owner refused to raise the threshold, and the doctrine therefore lives where it
// costs nothing per run — in the checker's own header. What DOES live in the corpus is the seam
// obligation itself, one paragraph in each of the two writing dispatchers, and P20 below is what
// keeps that paragraph from decaying into a suggestion.
//
// THE DEFECT IT EXISTS FOR. N parallel workers derive names from ONE source document. Each worker
// is internally consistent; the collision exists only in the UNION of their outputs. So no worker
// can observe it and no delivery receipt can catch it — every receipt truthfully reports a file
// that is individually fine.
//
// MEASURED, this repository, 2026-09-01, three swarms on one package with no canon pinned: two
// different steps numbered «Шаг 2.2» on the same line of two worktrees; two adjacent lines both
// signed «All 13 rules», one with 12 names and one with 11, 13 on disk; 23 merge conflicts in the
// second branch and 17 in the first; six test failures on the merged tree from suites that were
// green individually.
//
// AND THE ASYMMETRY THAT CHOOSES THE CURE — same package, same merge, same day: the hook counter
// (17) is pinned by a UNIT TEST and survived intact; the rule counter (13) lived in PROSE and split
// in two. One repository, one cause, two outcomes. A check held; a paragraph did not.
//
// Three sides are covered here, deliberately:
//   1. BEHAVIOUR — the real utility, real files, real exit codes (P1-P19)
//   2. FORCE     — the seam text still MANDATES, not suggests (P20); a polite rephrasing must turn
//                  this suite red, because a suite that tests a contract's VOCABULARY and not its
//                  FORCE has already been observed to pass an optional obligation (MEASURED on this
//                  package, commit 37916bd3)
//   3. WIRING    — the seam, the counters and the mutation registry agree (P21-P22)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-canon.cjs');
const PLAN = 'docs/dispatch-plan.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');
const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** Build a throwaway project and run the REAL checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-canon-')));
  try {
    for (const [rel, body] of Object.entries(files || {})) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** A canon with nothing wrong in it — every case below changes exactly one thing. */
const CANON_OK = [
  '# Канон проекта',
  '',
  '## Фаза A',
  '',
  '### Шаг 2.1 — имена моделей',
  '',
  'Order, OrderLine, Refund.',
  '',
  '### Шаг 2.2 — значения перечисления статуса',
  '',
  'draft, paid, refunded.',
  '',
  '## Фаза B',
  '',
  '- All 3 модели: `Order`, `OrderLine`, `Refund`',
  '',
].join('\n');

/**
 * A dispatch plan in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function plan({
  writes = 'да', canon = 'docs/canon.md', hash, run = 'ВЫПОЛНЕНА', reason = null,
  units = [['packages/api', 'src/api/**'], ['packages/web', 'src/web/**']],
} = {}) {
  const line = (label, value) => (value === null || value === undefined ? '' : '**' + label + ':** ' + value + '\n');
  return '# Dispatch plan\n\n'
    + line('Пишущий фан-аут', writes)
    + line('Канон', canon)
    + line('Хеш канона', hash)
    + line('Проверка канона', run)
    + line('Причина', reason)
    + '\n## Единицы\n\n'
    + '| Единица | Что пишет |\n|---|---|\n'
    + units.map(([n, w]) => '| ' + n + ' | ' + w + ' |').join('\n') + '\n';
}

/** The healthy pair: a plan pinned to a canon whose live digest matches. */
function healthy(canonText = CANON_OK, overrides = {}) {
  return {
    'docs/canon.md': canonText,
    [PLAN]: plan({ hash: sha256(canonText), ...overrides }),
  };
}

describe('канон до диспатча — the deterministic half', () => {
  test('P1 - a pinned canon with two writing units is CLEAN', () => {
    const r = check(healthy());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✅/);
    // The honesty line is part of the verdict, not decoration: a matching hash proves the canon did
    // not MOVE, never that it was COMPLETE.
    assert.match(r.out, /не то, что он перечислил/, r.out);
  });

  test('P2 - no plan at all is NOT clean', () => {
    const r = check({ 'docs/canon.md': CANON_OK });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/dispatch-plan\.md/);
    // The distinction the whole family exists for: "nobody asked" is not "there is no fan-out".
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/);
  });

  test('P3 - a read-only fan-out is a legitimate answer, and it is 2 rather than 0', () => {
    const r = check({ [PLAN]: plan({ writes: 'нет' }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /только в ОБЪЕДИНЕНИИ|объединения записей/);
    assert.doesNotMatch(r.out, /✅/, 'a legitimate non-answer must never be dressed as a pass');
  });

  test('P4 - an unrecognised closed value stops the check instead of guessing', () => {
    const r = check(healthy(CANON_OK, { writes: 'возможно' }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нераспознанное значение/);
  });

  test('P5 - «НЕ ВЫПОЛНЕНА» needs a reason from the closed list, and then it is honest', () => {
    const noReason = check(healthy(CANON_OK, { run: 'НЕ ВЫПОЛНЕНА' }));
    assert.equal(noReason.code, 2, noReason.out);
    assert.match(noReason.out, /без строки `\*\*Причина:\*\*`/);

    const freeText = check(healthy(CANON_OK, { run: 'НЕ ВЫПОЛНЕНА', reason: 'не успели' }));
    assert.equal(freeText.code, 2, freeText.out);
    assert.match(freeText.out, /не из закрытого списка/);

    const named = check(healthy(CANON_OK, { run: 'НЕ ВЫПОЛНЕНА', reason: 'решение-отложено' }));
    assert.equal(named.code, 2, named.out);
    assert.match(named.out, /решение-отложено/);
    assert.doesNotMatch(named.out, /✅/);
  });

  test('P6 - a declared writing fan-out with an empty unit table is a PROVEN gap', () => {
    const r = check(healthy(CANON_OK, { units: [] }));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ни одна единица не названа/);
  });

  test('P7 - ONE unit is a sequential run: a union of one cannot collide', () => {
    // The rule's own named alternative. Reporting it as a violation would push people to fake a
    // second unit; reporting it as CLEAN would let a real fan-out hide behind one row.
    const r = check(healthy(CANON_OK, { units: [['packages/api', 'src/api/**']] }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /последовательный запуск/);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P8 - duplicate unit rows stop the check', () => {
    const r = check(healthy(CANON_OK, {
      units: [['packages/api', 'src/api/**'], ['packages/api', 'src/other/**']],
    }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /повторяются строки/);
  });

  test('P9 - THE fixture: two parallel writers and no canon named is a PROVEN defect', () => {
    const r = check({ 'docs/canon.md': CANON_OK, [PLAN]: plan({ canon: null, hash: null }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /канон не назван/);
    assert.match(r.out, /packages\/api/, 'the units must be NAMED, not counted');
  });

  test('P10 - a canon path that does not exist pins nothing', () => {
    const r = check({ [PLAN]: plan({ canon: 'docs/absent.md', hash: sha256(CANON_OK) }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /канон назван, но/);
  });

  test('P11 - a canon named without a recorded hash is a PROVEN defect', () => {
    const r = check({ 'docs/canon.md': CANON_OK, [PLAN]: plan({ hash: null }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /хеш не записан/);
    // The reason, in words: without a digest the moved and the unmoved canon are written the same.
    assert.match(r.out, /выглядят\s+одинаково|одинаково/);
  });

  test('P12 - a malformed hash is «could not check», not «mismatch»', () => {
    // Different repairs: a typo in the digest is not evidence that the canon moved.
    const r = check({ 'docs/canon.md': CANON_OK, [PLAN]: plan({ hash: 'deadbeef' }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /не похож на sha256/);
  });

  test('P13 - a canon edited after the freeze is caught by the digest', () => {
    const r = check({
      'docs/canon.md': CANON_OK + '\n### Шаг 2.3 — добавлено после диспатча\n\nтело\n',
      [PLAN]: plan({ hash: sha256(CANON_OK) }),
    });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /канон изменился после фиксации/);
    assert.match(r.out, /на диске: [0-9a-f]{64}/);
  });

  test('P14 - two siblings under ONE ordinal fail, and renumbering one fixes it', () => {
    // The measured «Шаг 2.2» collision, in both directions.
    const collided = CANON_OK.replace('### Шаг 2.1 — имена моделей', '### Шаг 2.2 — имена моделей');
    const bad = check(healthy(collided));
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /один порядковый номер у соседних разделов/);
    assert.match(bad.out, /2\.2/);
    assert.match(bad.out, /ДВУХ РАЗНЫХ/, 'the report must say the bodies differ — that is the merge signature');

    const good = check(healthy(CANON_OK));
    assert.equal(good.code, 0, good.out);
  });

  test('P15 - the SAME ordinal under DIFFERENT parents is legitimate and must pass', () => {
    // Scope is the whole point. A global search over the file cannot tell an addressable pair of
    // steps from an unaddressable one, and an eager guard is not a stricter guard — it is a guard
    // people delete. `Шаг 2.2` under «Фаза A» and under «Фаза B» are two different steps.
    const twoPhases = [
      '# Канон', '', '## Фаза A', '', '### Шаг 2.2 — модели', '', 'Order.', '',
      '## Фаза B', '', '### Шаг 2.2 — маршруты', '', 'POST /orders.', '',
    ].join('\n');
    const r = check(healthy(twoPhases));
    assert.equal(r.code, 0, r.out);
  });

  test('P16 - a list that contradicts its own number fails; the corrected list passes', () => {
    // The measured «All 13 rules» defect, reduced to its shape.
    const twelve = CANON_OK.replace('- All 3 модели: `Order`, `OrderLine`, `Refund`',
      '- All 3 модели: `Order`, `OrderLine`');
    const bad = check(healthy(twelve));
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /перечень противоречит собственному числу/);
    assert.match(bad.out, /заявлено 3.*перечислено 2/s);

    assert.equal(check(healthy(CANON_OK)).code, 0);
  });

  test('P17 - two claims about ONE population that disagree fail even when both counts are right', () => {
    // The predicate that survives when the arithmetic happens to be correct. The measured defect
    // had two lines both signed «All 13 rules»; had both carried 13 names, a count check alone
    // would have passed a document that still contradicted itself. Split knowledge is the failure.
    const split = CANON_OK.replace('- All 3 модели: `Order`, `OrderLine`, `Refund`',
      '- All 3 модели: `Order`, `OrderLine`, `Refund`\n- All 3 модели: `Order`, `OrderLine`, `Invoice`');
    const r = check(healthy(split));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /два перечня об одном и том же не совпадают/);
  });

  test('P18 - a `#` inside a fenced block is a comment, not a heading', () => {
    // A parser that cannot tell them apart invents siblings that do not exist, and then refuses a
    // document that is fine — the same eagerness P15 guards against, one layer down.
    const withFence = [
      '# Канон', '', '## Фаза A', '', '### Шаг 2.2 — модели', '', 'Order.', '',
      '```bash', '### Шаг 2.2 — это комментарий в примере, а не заголовок', 'echo ok', '```', '',
    ].join('\n');
    const r = check(healthy(withFence));
    assert.equal(r.code, 0, r.out);
  });

  test('P19 - no non-zero exit ever prints the clean marker', () => {
    // The single property the three-code contract is FOR: an unknown must never read as a
    // reassurance. Asserted over every negative case at once rather than case by case.
    const cases = [
      {},                                                            // no plan at all
      { [PLAN]: plan({ writes: 'нет' }) },
      { [PLAN]: plan({ canon: null, hash: null }) },
      { 'docs/canon.md': CANON_OK, [PLAN]: plan({ hash: 'deadbeef' }) },
      { 'docs/canon.md': CANON_OK, [PLAN]: plan({ hash: sha256('other') }) },
    ];
    for (const files of cases) {
      const r = check(files);
      assert.notEqual(r.code, 0, JSON.stringify(Object.keys(files)));
      assert.doesNotMatch(r.out, /✅/, r.out);
    }
  });
});

/**
 * The seam's FORCE, separately from its vocabulary.
 *
 * Each predicate names ONE reader decision. A test that only checks that the words «канон» and
 * «check-canon.cjs» appear would pass a paragraph that had been softened into a suggestion — this
 * package has MEASURED that exact survival (commit 37916bd3), where a retitle plus a softened
 * imperative left twelve keyword predicates satisfied and the registered mutation alive.
 */
function seamForceProblems(text) {
  const problems = [];
  if (!/The canon MUST be frozen BEFORE dispatch/.test(text)) {
    problems.push('the canon duty is advisory, not imperative');
  }
  if (!/ONLY IN THE UNION/.test(text)) {
    problems.push('the union-only mechanism is gone — without it the duty looks like bureaucracy');
  }
  if (!/node \.claude\/hooks\/check-canon\.cjs \./.test(text)) {
    problems.push('the deterministic half is not invoked at the seam');
  }
  if (!/sequential/i.test(text)) {
    problems.push('the sequential alternative is gone, which makes the duty unsatisfiable');
  }
  if (!/THE CHECK DID NOT RUN\*\*,?\s*which is\s*never "all clear"/.test(text)) {
    problems.push('exit 2 is not spelled out as «not clean» at the seam');
  }
  return problems;
}

describe('the seam still mandates, and every counter agrees', () => {
  const SEAMS = ['templates/.claude/commands/start.md', 'templates/.claude/commands/feature.md'];

  test('P20 - both WRITING dispatchers carry the obligation, and softening it fires', () => {
    for (const rel of SEAMS) {
      const source = read(rel);
      assert.deepEqual(seamForceProblems(source), [], rel);

      // Soften MUST to a recommendation — the mutation that survived on the swarm contract.
      const softened = source.replace('The canon MUST be frozen BEFORE dispatch',
        'Freezing the canon before dispatch is recommended');
      assert.notEqual(softened, source, rel + ': mutation fixture did not apply — the sentence moved');
      assert.deepEqual(seamForceProblems(softened), ['the canon duty is advisory, not imperative'],
        rel + ': softening the duty must fire EXACTLY the mandate predicate');

      // Delete the mechanism and keep the duty: a duty whose reason is gone is the first thing a
      // reader drops under time pressure.
      const mechanismless = source.replace('ONLY IN THE UNION', 'sometimes at merge time');
      assert.ok(seamForceProblems(mechanismless).some((p) => p.includes('union-only')), rel);

      // Turn the invocation into a mention: the layer-1 half must be CALLED, not referenced.
      const mention = source.replace('node .claude/hooks/check-canon.cjs .',
        'см. .claude/hooks/check-canon.cjs');
      assert.ok(seamForceProblems(mention).some((p) => p.includes('not invoked')), rel);
    }
  });

  test('P21 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-canon'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-canon'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract, so a '
      + 'hook could only print — it could never refuse anything');

    const statusline = read('templates/.claude/hooks/statusline.cjs');
    const hooks = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(hooks, 'statusline must declare hooksExpected');
    assert.equal(Number(hooks[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + hooks[1]);
    const onDisk = fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs'));
    assert.equal(onDisk.length, Object.keys(COMPONENTS.hooks.items).length,
      'the shipped directory and the declared contract disagree: ' + onDisk.join(', '));

    // The THIRD place the count lives — the one that split in half on 2026-09-01 because prose was
    // its only guard.
    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-canon\.cjs/, 'the hook inventory must list it');
    const inventory = rule.match(/\*\*Hooks \((\d+) files/);
    assert.ok(inventory, 'the rule must state the hook count it is inventorying');
    assert.equal(Number(inventory[1]), onDisk.length,
      'the rule prose and the shipped directory disagree — the exact split this feature exists for');
  });

  test('P22 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'canon-cannot-check-is-not-clean': 'templates/.claude/hooks/check-canon.cjs',
      'canon-pin-must-still-match': 'templates/.claude/hooks/check-canon.cjs',
      'canon-ordinal-collision-is-scoped': 'templates/.claude/hooks/check-canon.cjs',
      'canon-seam-duty-is-imperative': 'templates/.claude/commands/start.md',
    };
    for (const [id, file] of Object.entries(expected)) {
      const entry = registry.entries.find((e) => e.id === id);
      assert.ok(entry, 'missing targeted mutation id ' + id);
      assert.equal(entry.file, file, id + ' mutates the wrong surface');
      assert.ok(entry.property && entry.property.length > 40,
        id + ' needs a behavioral property, not a cosmetic label');
      assert.ok(entry.mutation && entry.mutation.find && entry.mutation.replace,
        id + ' needs a real source mutation');
      assert.ok(Number.isInteger(entry.minFailing) && entry.minFailing >= 1,
        id + ' must require at least one failing test');
      // The anchor must be UNIQUE, or the registered mutation silently rewrites something else.
      assert.equal(read(entry.file).split(entry.mutation.find).length - 1, 1,
        id + ': mutation anchor must occur exactly once');
    }
  });
});
