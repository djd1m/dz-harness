'use strict';

// The deterministic half of the growth gate. The validator criterion is prose a model reads —
// layer 3. This is layer 1, and only for whoever runs it.
//
// The load-bearing property is the THIRD exit code, for the same reason it was in check-ports:
// a checker that answers "clean" when it could not look converts an unknown into a reassurance.
// Here the unknown has a specific and common cause — the --from-docs entry skips Phase 0, so the
// brief legitimately does not exist. That must be 2. Reading it as 0 would report "all growth
// requirements traced" for a project that never analysed growth at all.
//
// These are BEHAVIOUR tests: the real utility, real files, real exit codes.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-growth-trace.cjs');

/** Build a throwaway project and run the real checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-growth-')));
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

const brief = (rows) => '# Brief\n\n## 🌱 Growth Requirements Seed\n\n'
  + '| ID | Требование | Блок-источник | Confidence | Статус |\n'
  + '|----|----|----|----|----|\n' + rows.join('\n') + '\n';

const ROW1 = '| FR-GROWTH-001 | Реферальная петля в онбординге | A. Primary Growth Loop | 4/5 | ЧЕРНОВИК |';
const ROW2 = '| FR-GROWTH-002 | Интеграция с маркетплейсом | B. Top-3 Acquisition Channels | 3/5 | ЧЕРНОВИК |';

describe('the growth-trace checker answers three questions, and never confuses two of them', () => {
  test('P1 - a traced requirement is exit 0', () => {
    const r = check({
      'docs/product-discovery-brief.md': brief([ROW1]),
      'docs/Specification.md': '# Spec\n\n## FR-GROWTH-001 Реферальная петля\n\nПодробности.\n',
    });
    assert.equal(r.code, 0, 'a traced id must pass: ' + r.out);
    assert.match(r.out, /прослежены/, r.out);
  });

  test('P2 - an analysed-then-dropped requirement is exit 1, and the id is named', () => {
    const r = check({
      'docs/product-discovery-brief.md': brief([ROW1]),
      'docs/Specification.md': '# Spec\n\nНичего про рост.\n',
    });
    assert.equal(r.code, 1, 'a dropped obligation must fail: ' + r.out);
    assert.match(r.out, /FR-GROWTH-001/, 'and the lost id must be named: ' + r.out);
  });

  test('P3 - an absent brief is exit 2, never exit 0', () => {
    // The single most important case. --from-docs skips Phase 0, so this is the COMMON state, and
    // reading it as clean would silently bless every such project.
    const r = check({ 'docs/Specification.md': '# Spec\n' });
    assert.equal(r.code, 2, 'no brief means the check did not run: ' + r.out);
    assert.match(r.out, /проверка НЕ выполнена/, r.out);
    assert.match(r.out, /Фаза 0 не запускалась/, 'and the reason must be named: ' + r.out);
  });

  test('P4 - an absent Specification is exit 2, not exit 1', () => {
    // Without the destination there is nothing to compare against. Calling that "nothing traced"
    // would blame the project for the checker's blindness.
    const r = check({ 'docs/product-discovery-brief.md': brief([ROW1]) });
    assert.equal(r.code, 2, 'no Specification means the check could not run: ' + r.out);
    assert.match(r.out, /Specification/, r.out);
  });

  test('P5 - an untouched template table is exit 2, not exit 0', () => {
    // The shipped module carries example rows with bracketed placeholders. Counting them would let
    // an untouched template look like a filled-in one — and then "0 traced of 0" reads as clean.
    const r = check({
      'docs/product-discovery-brief.md': brief([
        '| FR-GROWTH-001 | [что обязаны построить, одним предложением] | A. Primary Growth Loop | [как записано] | ЧЕРНОВИК |',
        '| FR-GROWTH-002 | ... | B. Top-3 Acquisition Channels | ... | ... |',
      ]),
      'docs/Specification.md': '# Spec\n',
    });
    assert.equal(r.code, 2, 'a placeholder row is not an obligation: ' + r.out);
    assert.match(r.out, /шаблоном|ни одной заполненной/, r.out);
  });

  test('P6 - a rejection WITH a reason passes; a bare drop does not', () => {
    const withReason = check({
      'docs/product-discovery-brief.md': brief([ROW1]),
      'docs/Specification.md': '# Spec\n\nFR-GROWTH-001 отклонено — нет бюджета на реферальную программу в MVP.\n',
    });
    assert.equal(withReason.code, 0, 'a recorded rejection is a legitimate answer: ' + withReason.out);

    const bare = check({
      'docs/product-discovery-brief.md': brief([ROW1]),
      'docs/Specification.md': '# Spec\n\nFR-GROWTH-001\n',
    });
    // A bare id mention IS a trace by the stated definition — that is deliberate and documented.
    // What must not pass is an id that appears nowhere, which P2 covers.
    assert.equal(bare.code, 0, 'the exact token is the definition of a mention: ' + bare.out);
  });

  test('P7 - a partial loss is reported with the count, not averaged away', () => {
    const r = check({
      'docs/product-discovery-brief.md': brief([ROW1, ROW2]),
      'docs/Specification.md': '# Spec\n\nFR-GROWTH-001 реализуем.\n',
    });
    assert.equal(r.code, 1, 'one of two lost is still a loss: ' + r.out);
    assert.match(r.out, /1 из 2/, 'the count must be reported: ' + r.out);
    assert.match(r.out, /FR-GROWTH-002/, 'and the lost one named: ' + r.out);
    assert.ok(!/FR-GROWTH-001/.test(r.out.split('\n').filter((l) => l.includes('•')).join('\n')),
      'the traced one must NOT be listed as lost: ' + r.out);
  });

  test('P8 - one binary, all three verdicts in a single run', () => {
    // Each case above asserts ONE direction, so a constant-answer implementation could pass a
    // subset. The same executable must produce 0, 1 and 2.
    const seen = [
      check({ 'docs/product-discovery-brief.md': brief([ROW1]),
        'docs/Specification.md': 'FR-GROWTH-001\n' }).code,
      check({ 'docs/product-discovery-brief.md': brief([ROW1]),
        'docs/Specification.md': 'ничего\n' }).code,
      check({}).code,
    ];
    assert.deepEqual(seen, [0, 1, 2], 'expected clean/lost/could-not-check: ' + JSON.stringify(seen));
  });

  test('P11 - the counter-examples cross-family review supplied', () => {
    // Each was a false CLEAN in the first version, and each is named by the input that produced it.
    const cases = [
      [1, '# Spec\nFR-GROWTH-001 rejected\n',
        'a bare refusal with no reason: the reason pattern accepted a hyphen and the IDENTIFIER '
        + 'carries two — and the mention rule reached the line first, so the reason was never asked for'],
      [0, '# Spec\nFR-GROWTH-001 отклонено — нет бюджета на реферальную программу в MVP\n',
        'a refusal WITH a reason is a legitimate answer and must still pass'],
      [1, '# Spec\nFR-GROWTH-001 declined - x\n',
        'one character is a separator plus noise, not a reason'],
    ];
    for (const [expected, spec, why] of cases) {
      const r = check({ 'docs/product-discovery-brief.md': brief([ROW1]), 'docs/Specification.md': spec });
      assert.equal(r.code, expected, why + ' — got ' + r.code + ': ' + r.out);
    }
  });

  test('P12 - a reused id is exit 2, because one mention would clear two obligations', () => {
    // The module's own rule is that a number is never reused. When it is, `mentioned()` answers from
    // a Set and a SINGLE mention marks BOTH rows traced — coverage counted over usable items rather
    // than per position. Malformed input is inconclusive, never a pass.
    const dup = '| FR-GROWTH-001 | Совсем другое требование | B. Top-3 Acquisition Channels | 3/5 | ЧЕРНОВИК |';
    const r = check({
      'docs/product-discovery-brief.md': brief([ROW1, dup]),
      'docs/Specification.md': '# Spec\nFR-GROWTH-001 берём\n',
    });
    assert.equal(r.code, 2, 'a duplicate id must not read as clean: ' + r.out);
    assert.match(r.out, /повторяются идентификаторы/, r.out);
    assert.match(r.out, /FR-GROWTH-001/, 'and the duplicated id must be named: ' + r.out);
  });

  test('P9 - it is a hooks component wired to NO event', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-growth-trace'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = fs.readFileSync(path.join(TPL, 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('check-growth-trace'),
      'it must not be wired to an event: this packages hooks are non-blocking by contract, so a '
      + 'hook could only print — it could never refuse anything');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(m, 'statusline must declare hooksExpected');
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + m[1]);
  });

  test('P10 - a directory that does not exist is exit 2', () => {
    const r = spawnSync(process.execPath, [CHECK, '/nonexistent-path-for-this-test'],
      { encoding: 'utf8' });
    assert.equal(r.status, 2, 'an unusable argument is not a clean bill: ' + r.stdout);
  });
});
