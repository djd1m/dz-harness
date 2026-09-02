'use strict';

// Behaviour tests for the Phase-0.5 provenance gate. The guard answers a different question from
// check-look-trace: a third-party row may be carried forward only after dated live confirmation.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-look-origin.cjs');
const PROFILE = 'docs/source-product-profile.md';
const SPEC = 'docs/Specification.md';

function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-look-origin-')));
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

function profile({ origin = 'сторонний-разбор', analysisSource = 'styles.refero.design — DESIGN.md',
  snapshotDate = '2026-08-20', rows = [] } = {}) {
  return '# Source Product Profile\n\n'
    + '**Источник:** Senja — https://senja.io\n'
    + '**Статус съёмки:** СНЯТ\n'
    + '**Статус съёмки (путь):** ИСТОЧНИКА НЕТ\n'
    + (origin === null ? '' : '**Происхождение:** ' + origin + '\n')
    + (analysisSource === null ? '' : '**Источник разбора:** ' + analysisSource + '\n')
    + (snapshotDate === null ? '' : '**Дата стороннего снимка:** ' + snapshotDate + '\n')
    + '\n## 🎨 Look Requirements Seed\n\n'
    + '| ID | Обязательство | Ось | Источник-экран | Уверенность | Статус |\n'
    + '|----|----|----|----|----|----|\n'
    + rows.join('\n') + (rows.length ? '\n' : '');
}

const HYP1 = '| FR-LOOK-001 | Палитра индиго/сланец | облик | DESIGN.md#palette | сторонний снимок | ГИПОТЕЗА |';
const HYP2 = '| FR-LOOK-002 | Трёхшаговый онбординг | путь | DESIGN.md#flow | сторонний снимок | ГИПОТЕЗА |';
const DRAFT = '| FR-LOOK-003 | Белые карточки | облик | /pricing | живой прогон | ЧЕРНОВИК |';

describe('check-look-origin keeps third-party analysis hypothetical until dated live confirmation', () => {
  test('A1 RED - promoted hypothesis rows are refused and both rows are named', () => {
    const r = check({
      [PROFILE]: profile({ rows: [HYP1, HYP2] }),
      [SPEC]: '# Specification\n\nFR-LOOK-001 используем.\nFR-LOOK-002 используем.\n',
    });
    assert.equal(r.code, 1, 'promotion without confirmation must be refused: ' + r.out);
    assert.match(r.out, /FR-LOOK-001/, 'the first promoted row must be named: ' + r.out);
    assert.match(r.out, /FR-LOOK-002/, 'the second promoted row must be named: ' + r.out);
  });

  test('A2 - third-party analysis needs both its source and a valid snapshot date', () => {
    for (const bad of [
      { analysisSource: null, snapshotDate: '2026-08-20', expected: /Источник разбора/ },
      { analysisSource: 'DESIGN.md', snapshotDate: null, expected: /Дата стороннего снимка/ },
      { analysisSource: 'DESIGN.md', snapshotDate: 'not-a-date', expected: /not-a-date/ },
      { analysisSource: 'DESIGN.md', snapshotDate: '2999-01-01', expected: /2999-01-01/ },
    ]) {
      const r = check({ [PROFILE]: profile({ ...bad, rows: [HYP1] }), [SPEC]: '# Specification\n' });
      assert.equal(r.code, 1, 'bad third-party provenance is a proven defect: ' + r.out);
      assert.match(r.out, bad.expected, r.out);
    }
  });

  test('A5 - illegal origin and row status are exit 1 with quoted value and the closed list', () => {
    const badOrigin = check({
      [PROFILE]: profile({ origin: 'с-разбора', rows: [HYP1] }), [SPEC]: '# Specification\n',
    });
    assert.equal(badOrigin.code, 1, badOrigin.out);
    assert.match(badOrigin.out, /«с-разбора»/, badOrigin.out);
    assert.match(badOrigin.out, /прокликано.*сторонний-разбор.*вручную.*не снято/s, badOrigin.out);

    const misspelled = HYP1.replace('ГИПОТЕЗА', 'ГИПОТЗА');
    const badStatus = check({
      [PROFILE]: profile({ rows: [misspelled] }), [SPEC]: '# Specification\n',
    });
    assert.equal(badStatus.code, 1, badStatus.out);
    assert.match(badStatus.out, /«ГИПОТЗА»/, badStatus.out);
    assert.match(badStatus.out, /ЧЕРНОВИК.*ГИПОТЕЗА.*ПОДТВЕРЖДЕНО.*УСТАРЕЛО/s, badStatus.out);
  });

  test('A3 - confirmed rows require parseable, non-future dates and a live run not older than the snapshot', () => {
    const confirmed = (record) =>
      '| FR-LOOK-001 | Палитра индиго/сланец | облик | DESIGN.md#palette | '
      + record + ' | ПОДТВЕРЖДЕНО |';
    for (const record of [
      'подтверждено: живой прогон 2026-08-10 · сторонний снимок 2026-08-20',
      'подтверждено: живой прогон tomorrow · сторонний снимок 2026-08-20',
      'подтверждено: живой прогон 2999-01-01 · сторонний снимок 2026-08-20',
      'живой прогон без записи обеих дат',
    ]) {
      const r = check({
        [PROFILE]: profile({ rows: [confirmed(record)] }),
        [SPEC]: '# Specification\nFR-LOOK-001 используем.\n',
      });
      assert.equal(r.code, 1, 'invalid confirmation must be refused: ' + record + '\n' + r.out);
      assert.match(r.out, /FR-LOOK-001/, 'the invalid confirmed row must be named: ' + r.out);
    }
  });

  test('a dated live confirmation at or after the snapshot is clean', () => {
    const row = '| FR-LOOK-001 | Палитра индиго/сланец | облик | DESIGN.md#palette | '
      + 'подтверждено: живой прогон 2026-08-20 · сторонний снимок 2026-08-20 | ПОДТВЕРЖДЕНО |';
    const r = check({
      [PROFILE]: profile({ rows: [row] }), [SPEC]: '# Specification\nFR-LOOK-001 используем.\n',
    });
    assert.equal(r.code, 0, r.out);
  });

  test('a legacy profile with no origin field and no hypothesis rows remains exit 0 with a note', () => {
    const r = check({
      [PROFILE]: profile({ origin: null, analysisSource: null, snapshotDate: null, rows: [DRAFT] }),
      [SPEC]: '# Specification\n',
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /legacy/i, 'the compatibility path must be visible: ' + r.out);
  });

  test('a hypothesis under a legacy header is refused because its provenance is missing', () => {
    const r = check({
      [PROFILE]: profile({ origin: null, analysisSource: null, snapshotDate: null, rows: [HYP1] }),
      [SPEC]: '# Specification\n',
    });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Происхождение/, r.out);
    assert.match(r.out, /FR-LOOK-001/, r.out);
  });

  test('a reasoned rejection is not promotion', () => {
    const r = check({
      [PROFILE]: profile({ rows: [HYP1] }),
      [SPEC]: '# Specification\nFR-LOOK-001 отклонено — палитра защищена товарным знаком.\n',
    });
    assert.equal(r.code, 0, r.out);
  });

  test('missing profile or Specification is exit 2, never a clean bill', () => {
    const noProfile = check({ [SPEC]: '# Specification\n' });
    assert.equal(noProfile.code, 2, noProfile.out);
    assert.match(noProfile.out, /source-product-profile/, noProfile.out);

    const noSpec = check({ [PROFILE]: profile({ rows: [HYP1] }) });
    assert.equal(noSpec.code, 2, noSpec.out);
    assert.match(noSpec.out, /Specification/, noSpec.out);
  });

  test('one binary returns all three verdicts', () => {
    const seen = [
      check({
        [PROFILE]: profile({ origin: null, analysisSource: null, snapshotDate: null, rows: [DRAFT] }),
        [SPEC]: '# Specification\n',
      }).code,
      check({ [PROFILE]: profile({ rows: [HYP1] }), [SPEC]: 'FR-LOOK-001\n' }).code,
      check({}).code,
    ];
    assert.deepEqual(seen, [0, 1, 2]);
  });

  test('the guard is registered and hooksExpected agrees with the shipped hook count', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-look-origin'], 'the guard must be a hooks component');
    assert.ok(fs.existsSync(CHECK), 'the registered guard must exist on disk');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf8');
    const declared = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(declared, 'statusline must declare hooksExpected');
    assert.equal(Number(declared[1]), Object.keys(COMPONENTS.hooks.items).length);
    const onDisk = fs.readdirSync(path.join(TPL, 'hooks')).filter((name) => name.endsWith('.cjs'));
    assert.equal(onDisk.length, Object.keys(COMPONENTS.hooks.items).length);
  });
});
