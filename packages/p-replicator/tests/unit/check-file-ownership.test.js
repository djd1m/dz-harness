'use strict';

// The deterministic half of «владелец назначается в момент разреза». There is NO new always-loaded
// rule for this feature: the corpus budget is spent (measured 2026-09-01) and the owner refused to
// raise the threshold, so the doctrine lives in the checker's header, which is never loaded.
//
// WHAT IS ALREADY CLOSED, AND IS NOT RE-OPENED HERE. The general «two writers, one file» half is
// settled twice in this package — the shared-store principle, and the ownership split BY ORIGIN
// between /replicate and /start (tests/unit/pipeline-file-ownership.test.js). This suite covers the
// half neither of them reaches: the LIFECYCLE of ownership, i.e. what happens when a file APPEARS
// during the run.
//
// THE DEFECT. A file born by SPLITTING a large file inherits an owner from nobody — ownership does
// not travel by itself. The field case: a coordinator wrote into a fresh Architecture-OPS.md a
// paragraph about a permission the owner of the SOURCE file was revoking in the neighbouring
// document in the same minutes. Both authors internally consistent, both files individually
// correct, the two documents contradicting each other, and nothing in the run able to see it.
//
// The second measured signature, this repository 2026-09-01: two swarms in their own worktrees
// produced 23 and 17 merge conflicts, while the swarm in the MAIN tree produced none — not from
// better coordination, but because its second writer edited a live file with no merge to arbitrate.
// A silent overwrite leaves no conflict to count.
//
// HONEST BOUNDARY, asserted rather than merely written (P17): this is a check of the DECLARATION.
// A coordinator editing somebody else's file outside the protocol leaves the plan unchanged and
// this check green. There is no layer-1 check of the BEHAVIOUR without write attribution.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-file-ownership.cjs');
const PLAN = 'docs/dispatch-plan.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run the REAL checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-own-')));
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

/**
 * A dispatch plan in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function plan({
  writes = 'да', coord = 'да', splits = 'да', run = 'ВЫПОЛНЕНА', reason = null,
  units = [['packages/api', 'src/api/**'], ['packages/web', 'src/web/**']],
  owned = [
    ['docs/Architecture.md', 'packages/api'],
    ['src/web/index.ts', 'packages/web'],
    ['docs/Architecture-OPS.md', 'координатор'],
  ],
  splitRows = [['docs/Architecture-OPS.md', 'docs/Architecture.md', 'координатор']],
} = {}) {
  const line = (label, value) => (value === null || value === undefined ? '' : '**' + label + ':** ' + value + '\n');
  const table = (head, body) => '\n## ' + head + '\n\n'
    + '| ' + (head === 'Единицы' ? 'Единица | Что пишет'
      : head === 'Владение' ? 'Файл | Владелец' : 'Новый файл | Разрезан из | Владелец') + ' |\n'
    + '|' + '---|'.repeat(head === 'События разреза' ? 3 : 2) + '\n'
    + body.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
  return '# Dispatch plan\n\n'
    + line('Пишущий фан-аут', writes)
    + line('Координатор пишет', coord)
    + line('Разрезы файлов', splits)
    + line('Проверка владения', run)
    + line('Причина', reason)
    + table('Единицы', units)
    + table('Владение', owned)
    + table('События разреза', splitRows);
}

describe('владение назначается в момент разреза — the deterministic half', () => {
  test('P1 - a total, unambiguous plan with an owned split is CLEAN', () => {
    const r = check({ [PLAN]: plan() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✅/);
    // The boundary is part of the verdict, not a footnote elsewhere.
    assert.match(r.out, /проверка ДЕКЛАРАЦИИ/, r.out);
  });

  test('P2 - no plan at all is NOT clean', () => {
    const r = check({});
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/dispatch-plan\.md/);
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/, '"nobody asked" is not "there is one writer"');
  });

  test('P3 - a read-only fan-out owns nothing, and that is 2 rather than 0', () => {
    const r = check({ [PLAN]: plan({ writes: 'нет' }) });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P4 - an unrecognised closed value stops the check instead of guessing', () => {
    for (const field of [{ writes: 'возможно' }, { coord: 'иногда' }, { splits: 'частично' }]) {
      const r = check({ [PLAN]: plan(field) });
      assert.equal(r.code, 2, JSON.stringify(field) + ' → ' + r.out);
      assert.match(r.out, /нераспознанное значение/);
    }
  });

  test('P5 - «НЕ ВЫПОЛНЕНА» needs a reason from the closed list, and then it is honest', () => {
    const noReason = check({ [PLAN]: plan({ run: 'НЕ ВЫПОЛНЕНА' }) });
    assert.equal(noReason.code, 2, noReason.out);
    assert.match(noReason.out, /без строки `\*\*Причина:\*\*`/);

    const freeText = check({ [PLAN]: plan({ run: 'НЕ ВЫПОЛНЕНА', reason: 'потом' }) });
    assert.equal(freeText.code, 2, freeText.out);
    assert.match(freeText.out, /не из закрытого списка/);

    const named = check({ [PLAN]: plan({ run: 'НЕ ВЫПОЛНЕНА', reason: 'решение-отложено' }) });
    assert.equal(named.code, 2, named.out);
    assert.match(named.out, /решение-отложено/);
    assert.doesNotMatch(named.out, /✅/);
  });

  test('P6 - THE fixture: one file assigned to a unit AND to the coordinator is PROVEN', () => {
    const r = check({ [PLAN]: plan({
      owned: [
        ['docs/Architecture.md', 'packages/api'],
        ['docs/Architecture.md', 'координатор'],
        ['src/web/index.ts', 'packages/web'],
        ['docs/Architecture-OPS.md', 'координатор'],
      ],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /у одного файла два владельца/);
    assert.match(r.out, /docs\/Architecture\.md/, 'the file must be NAMED');
    // The reason, in words: atomicity does not treat a lost update.
    assert.match(r.out, /Атомарная запись этого не лечит/);
  });

  test('P7 - and the same plan with ONE owner for that file passes', () => {
    assert.equal(check({ [PLAN]: plan() }).code, 0);
  });

  test('P8 - an owner nobody dispatched is a file with no writer that reads as owned', () => {
    const r = check({ [PLAN]: plan({
      owned: [
        ['docs/Architecture.md', 'packages/api'],
        ['src/web/index.ts', 'packages/web'],
        ['docs/Architecture-OPS.md', 'координатор'],
        ['docs/Ops.md', 'packages/mobile'],
      ],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не назван среди диспатчируемых единиц/);
    assert.match(r.out, /packages\/mobile/);
  });

  test('P9 - totality runs BOTH ways: a dispatched unit that owns nothing fails', () => {
    // The direction a table naturally forgets. The unit writes anyway; only its path is undeclared.
    const r = check({ [PLAN]: plan({
      owned: [['docs/Architecture.md', 'packages/api'], ['docs/Architecture-OPS.md', 'координатор']],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не владеет ни одним файлом/);
    assert.match(r.out, /packages\/web/);
  });

  test('P10 - the coordinator must answer for ITSELF, in both directions', () => {
    // Declared writing, absent from the table: the table is total for everyone but the author of
    // the measured defect.
    const missing = check({ [PLAN]: plan({
      owned: [['docs/Architecture.md', 'packages/api'], ['src/web/index.ts', 'packages/web']],
      splits: 'нет', splitRows: [],
    }) });
    assert.equal(missing.code, 1, missing.out);
    assert.match(missing.out, /координатор объявлен пишущим, но не владеет/);

    // Declared non-writing and owning files anyway: the reader believes the declaration, and the
    // declaration is the assumption under which a second writer stays unnoticed.
    const contradicted = check({ [PLAN]: plan({ coord: 'нет' }) });
    assert.equal(contradicted.code, 1, contradicted.out);
    assert.match(contradicted.out, /объявлен непишущим, но владеет файлами/);
  });

  test('P11 - a coordinator that genuinely writes nothing is legitimate and passes', () => {
    // An escape that exists, or the mandatory row becomes a lie people write to get green.
    const r = check({ [PLAN]: plan({
      coord: 'нет',
      owned: [['docs/Architecture.md', 'packages/api'], ['src/web/index.ts', 'packages/web'],
        ['docs/Architecture-OPS.md', 'packages/api']],
      splitRows: [['docs/Architecture-OPS.md', 'docs/Architecture.md', 'packages/api']],
    }) });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /объявлен непишущим/);
  });

  test('P12 - THE fixture: a split that produced a file with NO owner is PROVEN', () => {
    const r = check({ [PLAN]: plan({
      owned: [['docs/Architecture.md', 'packages/api'], ['src/web/index.ts', 'packages/web'],
        ['docs/Architecture-OPS.md', 'координатор']],
      splitRows: [['docs/Architecture-OPS.md', 'docs/Architecture.md', '—']],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /создан разрезом БЕЗ владельца/);
    assert.match(r.out, /docs\/Architecture-OPS\.md/);
    // The load-bearing sentence: ownership does not travel by itself.
    assert.match(r.out, /не переносится само/);
  });

  test('P13 - and the SAME split with an explicit owner passes', () => {
    assert.equal(check({ [PLAN]: plan() }).code, 0);
  });

  test('P14 - a split whose owner contradicts the ownership table fails', () => {
    // Two declarations about one file. Which one applies depends on which the worker read.
    const r = check({ [PLAN]: plan({
      splitRows: [['docs/Architecture-OPS.md', 'docs/Architecture.md', 'packages/api']],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /противоречит таблице владения/);
  });

  test('P15 - a split-born file absent from the ownership table fails', () => {
    const r = check({ [PLAN]: plan({
      splitRows: [['docs/Architecture-OPS.md', 'docs/Architecture.md', 'координатор'],
        ['docs/Architecture-NET.md', 'docs/Architecture.md', 'координатор']],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не попал в таблицу владения/);
    assert.match(r.out, /Architecture-NET/);
  });

  test('P16 - an absent split section must be DECLARED, never inferred', () => {
    // «Разрезов не было» and «про разрезы забыли» must not be written the same way. A declared
    // «да» with an empty table is a proven omission; a declared «нет» with rows is a contradiction
    // the checker cannot resolve, so it refuses rather than picking one.
    const declaredEmpty = check({ [PLAN]: plan({ splits: 'да', splitRows: [] }) });
    assert.equal(declaredEmpty.code, 1, declaredEmpty.out);
    assert.match(declaredEmpty.out, /ни один не назван/);

    const contradicted = check({ [PLAN]: plan({ splits: 'нет' }) });
    assert.equal(contradicted.code, 2, contradicted.out);
    assert.match(contradicted.out, /таблица разрезов не пуста/);

    const honestlyNone = check({ [PLAN]: plan({
      splits: 'нет', splitRows: [],
      owned: [['docs/Architecture.md', 'packages/api'], ['src/web/index.ts', 'packages/web'],
        ['README.md', 'координатор']],
    }) });
    assert.equal(honestlyNone.code, 0, honestlyNone.out);
  });

  test('P17 - rows are read PER SECTION, so a unit is never mistaken for a file', () => {
    // Three markdown tables live in one document and two have look-alike first columns. A parser
    // that scanned the whole file would read `packages/api` from the units table as a FILE with no
    // owner — an answer to a question nobody asked, delivered as a defect. The healthy plan passing
    // at all is the assertion; it contains all three tables.
    const r = check({ [PLAN]: plan() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /3 файл\(ов\), 2 единиц\(ы\)/, r.out);
  });

  test('P18 - no non-zero exit ever prints the clean marker', () => {
    const cases = [
      {},
      { [PLAN]: plan({ writes: 'нет' }) },
      { [PLAN]: plan({ owned: [] }) },
      { [PLAN]: plan({ units: [] }) },
      { [PLAN]: plan({ splitRows: [['docs/Architecture-OPS.md', 'docs/Architecture.md', '']] }) },
    ];
    for (const files of cases) {
      const r = check(files);
      assert.notEqual(r.code, 0, JSON.stringify(Object.keys(files)));
      assert.doesNotMatch(r.out, /✅/, r.out);
    }
  });
});

/**
 * The seam's FORCE, separately from its vocabulary. A test that only checks that the words
 * «ownership» and «check-file-ownership.cjs» appear would pass a paragraph softened into a
 * suggestion — this package has MEASURED that exact survival (commit 37916bd3).
 */
function seamForceProblems(text) {
  const problems = [];
  if (!/The same plan MUST assign OWNERSHIP/.test(text)) {
    problems.push('the ownership duty is advisory, not imperative');
  }
  if (!/exactly one writer per file, the coordinator included/.test(text)) {
    problems.push('the coordinator is not named as a writer, which is the author of the field defect');
  }
  if (!/born by SPLITTING another gets its owner AT CREATION/.test(text)) {
    problems.push('the lifecycle half is gone — this is the only half the two shipped rules do not cover');
  }
  if (!/ownership never travels by itself/.test(text)) {
    problems.push('the mechanism is gone — without it the duty reads as bookkeeping');
  }
  if (!/node \.claude\/hooks\/check-file-ownership\.cjs \./.test(text)) {
    problems.push('the deterministic half is not invoked at the seam');
  }
  return problems;
}

describe('the seam still mandates, and every counter agrees', () => {
  const SEAMS = ['templates/.claude/commands/start.md', 'templates/.claude/commands/feature.md'];

  test('P19 - both WRITING dispatchers carry the obligation, and softening it fires', () => {
    for (const rel of SEAMS) {
      const source = read(rel);
      assert.deepEqual(seamForceProblems(source), [], rel);

      const softened = source.replace('The same plan MUST assign OWNERSHIP',
        'The plan may also record ownership');
      assert.notEqual(softened, source, rel + ': mutation fixture did not apply — the sentence moved');
      assert.deepEqual(seamForceProblems(softened), ['the ownership duty is advisory, not imperative'],
        rel + ': softening the duty must fire EXACTLY the mandate predicate');

      // Delete the lifecycle half and keep the duty: what remains is the general single-writer rule
      // this package already shipped twice, and re-shipping it closes nothing new.
      const noLifecycle = source.replace('born by SPLITTING another gets its owner AT CREATION',
        'created during the run should also be assigned');
      assert.ok(seamForceProblems(noLifecycle).some((p) => p.includes('lifecycle half')), rel);

      // Drop the coordinator: a table total for everyone except the author of the defect.
      const noCoordinator = source.replace('exactly one writer per file, the coordinator included',
        'one writer per file');
      assert.ok(seamForceProblems(noCoordinator).some((p) => p.includes('coordinator')), rel);
    }
  });

  test('P20 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-file-ownership'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-file-ownership'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract');

    const statusline = read('templates/.claude/hooks/statusline.cjs');
    const hooks = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(hooks, 'statusline must declare hooksExpected');
    const onDisk = fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs'));
    assert.equal(Number(hooks[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + hooks[1]);
    assert.equal(onDisk.length, Object.keys(COMPONENTS.hooks.items).length,
      'the shipped directory and the declared contract disagree: ' + onDisk.join(', '));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-file-ownership\.cjs/, 'the hook inventory must list it');
    const inventory = rule.match(/\*\*Hooks \((\d+) files/);
    assert.ok(inventory, 'the rule must state the hook count it is inventorying');
    assert.equal(Number(inventory[1]), onDisk.length,
      'the rule prose and the shipped directory disagree — the exact split this family exists for');
  });

  test('P21 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'ownership-cannot-check-is-not-clean': 'templates/.claude/hooks/check-file-ownership.cjs',
      'ownership-split-born-file-needs-an-owner': 'templates/.claude/hooks/check-file-ownership.cjs',
      'ownership-coordinator-is-a-writer-too': 'templates/.claude/hooks/check-file-ownership.cjs',
      'ownership-seam-lifecycle-half-is-required': 'templates/.claude/commands/feature.md',
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
      assert.equal(read(entry.file).split(entry.mutation.find).length - 1, 1,
        id + ': mutation anchor must occur exactly once');
    }
  });
});
