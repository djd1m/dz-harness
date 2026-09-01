'use strict';

// The deterministic half of «метрика не называет источник значения». There is NO new always-loaded
// rule; the fourth column and one paragraph live in the SKILL that already owns the metrics table,
// and the long doctrine lives in the checker's header, which the corpus measure does not count.
//
// THE DEFECT, measured on this package's own templates. The Success Metrics table has three columns
// — Metric, Target, Timeline — and no column for where the number comes from. The completion
// checklist asks only whether «метрики успеха измеримы», i.e. whether a NUMBER is present. And the
// single validator lens that looks OUTSIDE the documents reads exactly one thing, Architecture.md →
// ## External Dependencies, so a metric in the PRD never reaches it: there is no route at all.
//
// MECHANISM: measurability is decided by the SHAPE OF A NUMBER, never by the system's ability to
// OBTAIN it. «Доля дошедших до публикации отзыва — 40% — неделя 1» passes completeness,
// measurability and consistency on a platform whose API exposes no reviews. P14 rebuilds that tree
// and re-measures the seven shipped guards rather than quoting the claim.
//
// WHY THE FOURTH COLUMN IS A CLOSED LIST: an open Source column collects «из аналитики», which names
// a genre of place rather than a place — the same defect as a spend ceiling named «разумный» or
// evidence that is a URL nobody opened.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-metric-source.cjs');
const PRD = 'docs/PRD.md';
const ARCH = 'docs/Architecture.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run a REAL checker over it. */
function run(checker, files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-metric-')));
  try {
    for (const [rel, body] of Object.entries(files || {})) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const r = spawnSync(process.execPath, [checker, dir], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const check = (files) => run(CHECK, files);

/** A PRD whose Success Metrics table says what the case needs. `columns: 3` drops the fourth. */
function prd({ rows, columns = 4, heading = true } = {}) {
  const body = rows === undefined
    ? [['доля активных на 7-й день', '35%', 'неделя 4', 'наш журнал']]
    : rows;
  const head = columns === 4
    ? '| Metric | Target | Timeline | Источник значения |\n|---|---|---|---|\n'
    : '| Metric | Target | Timeline |\n|---|---|---|\n';
  return '# PRD\n\n## Key Features\n\nДайджест.\n\n'
    + (heading ? '## Success Metrics\n' + head
      + body.map((r) => '| ' + r.slice(0, columns).join(' | ') + ' |').join('\n') + '\n\n' : '')
    + '## Timeline & Phases\n| Phase | Features | Timeline |\n|---|---|---|\n| MVP | дайджест | неделя 4 |\n';
}

/** An Architecture.md whose inventory does or does not carry the named method. */
function arch({ methods = [] } = {}) {
  return '# Architecture\n\n## External Dependencies\n\n'
    + '| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |\n'
    + '|---|---|---|---|---|\n'
    + methods.map((m) => '| ' + m + ' | Example | https://docs.example.test · checked 2026-08-30 · '
      + '«the endpoint returns published reviews» | CONFIRMED | FR-042 |').join('\n')
    + '\n\n## Data Architecture\n\nPostgres.\n';
}

describe('источник значения метрики — the deterministic half', () => {
  test('P1 - metrics naming a source from the closed list are CLEAN', () => {
    const r = check({ [PRD]: prd() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✅/);
    assert.match(r.out, /НЕ ЗОВЁТ API/, r.out);
  });

  test('P2 - no Success Metrics section anywhere is NOT clean', () => {
    const r = check({ [PRD]: prd({ heading: false }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет раздела `## Success Metrics`/);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P3 - THE core defect: a table with no fourth column at all', () => {
    // Reported as its own case, because the repair is a COLUMN, not a value — telling an author to
    // fill a cell that does not exist is the kind of message people ignore.
    const r = check({ [PRD]: prd({ columns: 3 }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /нет колонки «Источник значения»/);
    assert.match(r.out, /доля активных на 7-й день/, 'the metric must be NAMED');
    // The mechanism, in words: the shape of a number, not the ability to obtain it.
    assert.match(r.out, /формой ЧИСЛА/);
  });

  test('P4 - an empty source cell is a blocker, not a note', () => {
    const r = check({ [PRD]: prd({ rows: [['доля отзывов', '40%', 'неделя 1', '']] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /источник значения не назван/);
    assert.match(r.out, /не задавали/);
  });

  test('P5 - «из аналитики» is a GENRE of place, not a place', () => {
    const r = check({ [PRD]: prd({ rows: [['доля отзывов', '40%', 'неделя 1', 'из аналитики']] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /вне закрытого списка/);
    assert.match(r.out, /жанр места/);
    // The kinship is stated, because it is what makes the closed list obviously right.
    assert.match(r.out, /разумный|не открывал/);
  });

  test('P6 - an external API must name a METHOD, and manual measurement must say HOW', () => {
    // A vendor is not a capability: the same service has one and lacks its neighbour.
    const noMethod = check({
      [PRD]: prd({ rows: [['доля отзывов', '40%', 'неделя 1', 'внешний API']] }),
      [ARCH]: arch({ methods: ['reviews.publish'] }),
    });
    assert.equal(noMethod.code, 1, noMethod.out);
    assert.match(noMethod.out, /не сказано ЧЕМ именно/);
    assert.match(noMethod.out, /МЕТОД/);

    const bareManual = check({ [PRD]: prd({ rows: [['NPS', '40', 'неделя 8', 'ручное измерение']] }) });
    assert.equal(bareManual.code, 1, bareManual.out);
    assert.match(bareManual.out, /не сказано ЧЕМ именно/);
  });

  test('P7 - manual measurement, NAMED, is a legitimate answer and passes', () => {
    // Refusing it would push people to dress a hand count as instrumentation, which is worse than
    // the hand count. What is refused is manual measurement PRESENTED AS instrumented.
    const r = check({ [PRD]: prd({
      rows: [['NPS', '40', 'неделя 8', 'ручное измерение: сверка пяти карточек глазами']],
    }) });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /вручную 1/);
  });

  test('P8 - THE mandated fixture: an external-API metric with NO inventory row fails BY NAME', () => {
    const r = check({
      [PRD]: prd({ rows: [['доля дошедших до публикации отзыва', '40%', 'неделя 1',
        'внешний API: reviews.publish']] }),
      [ARCH]: arch({ methods: ['email.send'] }),
    });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /нет в инвентаре внешних зависимостей/);
    assert.match(r.out, /доля дошедших до публикации отзыва/, 'the metric must be NAMED');
    assert.match(r.out, /шестую линзу|линзу/);
  });

  test('P9 - and the SAME metric with its inventory row passes', () => {
    const r = check({
      [PRD]: prd({ rows: [['доля дошедших до публикации отзыва', '40%', 'неделя 1',
        'внешний API: reviews.publish']] }),
      [ARCH]: arch({ methods: ['reviews.publish'] }),
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /строку инвентаря/);
  });

  test('P10 - no inventory section at all is reported with its OWN reason', () => {
    // Two different repairs — «write the inventory» vs «add the missing row» — so the message must
    // differ. Merging them would name the wrong fix half the time.
    const noSection = check({
      [PRD]: prd({ rows: [['доля отзывов', '40%', 'неделя 1', 'внешний API: reviews.publish']] }),
      [ARCH]: '# Architecture\n\n## Data Architecture\n\nPostgres.\n',
    });
    assert.equal(noSection.code, 1, noSection.out);
    assert.match(noSection.out, /нет раздела `## External Dependencies` вовсе/);

    const wrongRow = check({
      [PRD]: prd({ rows: [['доля отзывов', '40%', 'неделя 1', 'внешний API: reviews.publish']] }),
      [ARCH]: arch({ methods: ['email.send'] }),
    });
    assert.match(wrongRow.out, /инвентарь есть, но названного метода в нём нет/);
    assert.notEqual(noSection.out, wrongRow.out, 'two different repairs must not print the same way');
  });

  test('P11 - the Timeline & Phases table below is NOT read as metrics', () => {
    // Read per section, never globally: the neighbouring table has exactly three columns and the
    // same shape, so a global scan would report every phase as a metric with no source.
    const r = check({ [PRD]: prd() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 метрик/, r.out);
  });

  test('P12 - a template row does not count, and duplicates stop the check', () => {
    const template = check({ [PRD]: prd({ rows: [['[metric]', '[target]', '[timeline]', '[источник]']] }) });
    assert.equal(template.code, 2, template.out);
    assert.match(template.out, /шаблонные строки/);

    const dupe = check({ [PRD]: prd({ rows: [
      ['доля активных', '35%', 'неделя 4', 'наш журнал'],
      ['доля активных', '40%', 'неделя 8', 'наша БД'],
    ] }) });
    assert.equal(dupe.code, 2, dupe.out);
    assert.match(dupe.out, /повторяются строки/);
  });

  test('P13 - no non-zero exit ever prints the clean marker', () => {
    const cases = [
      { [PRD]: prd({ heading: false }) },
      { [PRD]: prd({ columns: 3 }) },
      { [PRD]: prd({ rows: [['m', '1', 'w1', '']] }) },
      { [PRD]: prd({ rows: [['m', '1', 'w1', 'из аналитики']] }) },
      { [PRD]: prd({ rows: [['m', '1', 'w1', 'внешний API: reviews.publish']] }) },
    ];
    for (const files of cases) {
      const r = check(files);
      assert.notEqual(r.code, 0, JSON.stringify(files));
      assert.doesNotMatch(r.out, /✅/, r.out);
    }
  });

  test('P14 - MEASURED: the undeliverable metric passes every OTHER shipped guard', () => {
    // The justification, re-measured rather than quoted: the fixture from the backlog record — a
    // metric «доля дошедших до публикации отзыва» resting on a non-existent reviews.publish. The
    // siblings are not broken; nothing was asking this question.
    const files = {
      [PRD]: prd({ rows: [['доля дошедших до публикации отзыва', '40%', 'неделя 1',
        'внешний API: reviews.publish']] }),
      'docs/Specification.md': '# Specification\n\n### FR-042\n\nПубликация отзыва через reviews.publish.\n',
      'docs/Pseudocode.md': '# Pseudocode\n\nАлгоритм публикации отзыва описан подробно и полно ниже.\n',
      [ARCH]: arch({ methods: ['email.send'] }),
    };
    for (const sibling of ['check-docs-complete.cjs', 'check-external-deps.cjs']) {
      const r = run(path.join(TPL, 'hooks', sibling), files);
      assert.doesNotMatch(r.out, /доля дошедших до публикации отзыва/,
        sibling + ' would have to name the metric for this feature to be redundant: ' + r.out);
    }
    // check-external-deps is deliberately independent: its inventory here is well-formed, so it is
    // GREEN over the same tree. The two mechanisms have independent counterexamples, which is why
    // they are two records and two checkers.
    const deps = run(path.join(TPL, 'hooks', 'check-external-deps.cjs'), files);
    assert.equal(deps.code, 0, 'the inventory itself is fine — only the metric is unobtainable: ' + deps.out);

    const mine = check(files);
    assert.equal(mine.code, 1, mine.out);
    assert.match(mine.out, /доля дошедших до публикации отзыва/, 'and this checker names it');
  });
});

describe('the template demands it, and every counter agrees', () => {
  test('P15 - the SKILL carries the fourth column, the closed list and the consequence', () => {
    const skill = read('templates/.claude/skills/sparc-prd-mini/SKILL.md');
    assert.match(skill, /\| Metric \| Target \| Timeline \| Источник значения \|/,
      'the table shipped to every project must have the column, or nobody fills it');
    assert.match(skill, /Every metric MUST name where its value comes from/,
      'and the duty must read as a duty, not a suggestion');
    for (const value of ['наш журнал', 'наша БД', 'внешний API', 'ручное измерение']) {
      assert.ok(skill.includes(value), 'the closed list must be spelled out: ' + value);
    }
    assert.match(skill, /MUST produce a row in `## External Dependencies`/,
      'the only route by which a metric reaches a lens looking outside the documents');
    // The completion checklist asked only for a number; that is the line that let it through.
    assert.match(skill, /Метрики успеха измеримы И называют источник значения/,
      'the checklist must ask the new question too, or the old one still passes alone');
  });

  test('P16 - the validator 100-point table is untouched, deliberately', () => {
    // The backlog record forbids putting weight on the validator's scoring table: doing so would
    // turn tests/unit/validation-gate-teeth.test.js red, and the same prohibition already applied to
    // Phase 0.5. The enforcement lives in a callable utility instead — which is also the stronger
    // layer, so the constraint and the design agree rather than merely coexisting.
    const cmd = read('templates/.claude/commands/replicate.md');
    const skill = read('templates/.claude/skills/sparc-prd-mini/SKILL.md');
    for (const [name, text] of [['replicate.md', cmd], ['SKILL.md', skill]]) {
      assert.ok(!/источник значения[^\n]{0,80}\b(балл|points?|вес|weight)/i.test(text),
        name + ': metric provenance must not be given a score in the validator table');
    }
  });

  test('P17 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-metric-source'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-metric-source'),
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
    assert.match(rule, /check-metric-source\.cjs/, 'the hook inventory must list it');
    const inventory = rule.match(/\*\*Hooks \((\d+) files/);
    assert.ok(inventory, 'the rule must state the hook count it is inventorying');
    assert.equal(Number(inventory[1]), onDisk.length,
      'the rule prose and the shipped directory disagree — the exact split this family exists for');
  });

  test('P18 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'metric-source-column-must-exist': 'templates/.claude/hooks/check-metric-source.cjs',
      'metric-source-external-api-needs-its-inventory-row': 'templates/.claude/hooks/check-metric-source.cjs',
      'metric-source-list-is-closed': 'templates/.claude/hooks/check-metric-source.cjs',
      'metric-source-template-demands-the-column': 'templates/.claude/skills/sparc-prd-mini/SKILL.md',
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
