'use strict';

// The deterministic half of the Phase-0.5 gate. The phase itself is prose a model executes —
// layer 2/3. This is layer 1, and only for whoever runs it.
//
// The load-bearing property is the THIRD exit code, for the same reason it was in check-ports and
// check-growth-trace: a checker that answers "clean" when it could not look converts an unknown into
// a reassurance. Here the unknown has THREE distinct causes, and only one of them is a defect:
//
//   ИСТОЧНИКА НЕТ   the project replicates nothing            → 2, a legitimate answer
//   НЕ ИЗМЕРЕНО     a source was NAMED but not captured       → 2, with a reason from a closed list
//   СНЯТ            the look was captured                     → the table is checked, 0 or 1
//
// Reading any of the 2s as 0 would report "the source look is carried through" for a project whose
// look nobody ever looked at — which is exactly the defect the phase exists to remove.
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
const CHECK = path.join(TPL, 'hooks', 'check-look-trace.cjs');

/** Build a throwaway project and run the real checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-look-')));
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

const PROFILE = 'docs/source-product-profile.md';
const SPEC = 'docs/Specification.md';

/**
 * A profile in one of the three states, with whatever rows the case needs.
 *
 * `pathStatus` / `pathReason` are the SECOND axis's own answer. It defaults to «ИСТОЧНИКА НЕТ» so
 * that a case about the `облик` axis stays about the `облик` axis — but the default is a real
 * DECLARATION, never silence: silence is its own case, asserted in P16.
 */
function profile({ status = 'СНЯТ', reason = null, source = 'Senja — https://senja.io', rows = [],
  pathStatus = 'ИСТОЧНИКА НЕТ', pathReason = null } = {}) {
  return '# Source Product Profile\n\n'
    + '**Источник:** ' + source + '\n'
    + '**Статус съёмки:** ' + status + '\n'
    + (reason === null ? '' : '**Причина:** ' + reason + '\n')
    + (pathStatus === null ? '' : '**Статус съёмки (путь):** ' + pathStatus + '\n')
    + (pathReason === null ? '' : '**Причина (путь):** ' + pathReason + '\n')
    + '\n## 🎨 Look Requirements Seed\n\n'
    + '| ID | Обязательство | Ось | Источник-экран | Уверенность | Статус |\n'
    + '|----|----|----|----|----|----|\n'
    + rows.join('\n') + (rows.length ? '\n' : '');
}

const ROW1 = '| FR-LOOK-001 | Палитра индиго/сланец с белыми карточками | облик | /pricing | скриншот 2026-09-01 | ЧЕРНОВИК |';
const ROW2 = '| FR-LOOK-002 | Онбординг из трёх шагов до первого виджета | путь | /signup | запись сессии | ЧЕРНОВИК |';

/** The CLOSED list, as the checker owns it. Four originals plus the four browser-specific ones. */
const REASONS = ['no-browser-mcp', 'unreachable', 'auth-required', 'out-of-scope',
  'no-browser', 'bot-protected', 'timeout', 'robots-disallowed'];

describe('the look-trace checker answers three questions, and never confuses two of them', () => {
  test('P1 - a traced obligation is exit 0', () => {
    const r = check({
      [PROFILE]: profile({ rows: [ROW1] }),
      [SPEC]: '# Spec\n\n## FR-LOOK-001 Палитра\n\nПодробности.\n',
    });
    assert.equal(r.code, 0, 'a traced id must pass: ' + r.out);
    assert.match(r.out, /прослежены/, r.out);
  });

  test('P2 - REQUIRED: a filled table with no promotion is exit 1, and the lost ids are NAMED', () => {
    // The first of the three mandated cases. A count without names sends the reader to diff two
    // documents by hand; the whole value of the check is that it says WHICH obligation was dropped.
    const r = check({
      [PROFILE]: profile({ rows: [ROW1, ROW2] }),
      [SPEC]: '# Spec\n\nНичего про облик.\n',
    });
    assert.equal(r.code, 1, 'a captured-then-dropped look must fail: ' + r.out);
    assert.match(r.out, /FR-LOOK-001/, 'the first lost id must be named: ' + r.out);
    assert.match(r.out, /FR-LOOK-002/, 'the second lost id must be named: ' + r.out);
  });

  test('P3 - REQUIRED: an absent profile is exit 2, never exit 0', () => {
    // The second mandated case, and the most important one. Phase 0.5 is mandatory, so an absent
    // profile means the phase did not run — reading that as clean would silently bless every
    // project that skipped it.
    const r = check({ [SPEC]: '# Spec\n' });
    assert.equal(r.code, 2, 'no profile means the check did not run: ' + r.out);
    assert.match(r.out, /проверка НЕ выполнена/, r.out);
    assert.match(r.out, /Фаза 0\.5 не запускалась/, 'and the reason must be named: ' + r.out);
    assert.match(r.out, /--from-docs/,
      'and it must say WHY that is not an excuse: --from-docs skips Phase 0 only');
  });

  test('P4 - REQUIRED: untouched bracketed placeholders are exit 2, not "the phase ran"', () => {
    // The third mandated case. The command ships an example table with bracketed placeholders.
    // Counting them would let an untouched template look like a filled-in one, and then
    // "0 traced of 0" reads as clean.
    const r = check({
      [PROFILE]: profile({ rows: [
        '| FR-LOOK-001 | [что обязаны воспроизвести, одним предложением] | облик | [URL] | [как измерено] | ЧЕРНОВИК |',
        '| FR-LOOK-002 | ... | путь | ... | ... | ... |',
      ] }),
      [SPEC]: '# Spec\n',
    });
    assert.equal(r.code, 2, 'a placeholder row is not an obligation: ' + r.out);
    assert.match(r.out, /ни одной заполненной строки/, r.out);
    assert.ok(!/прослежены/.test(r.out), 'and it must not claim anything was traced: ' + r.out);
  });

  test('P5 - «источника нет» is exit 2 and is stated as a LEGITIMATE answer', () => {
    const r = check({ [PROFILE]: profile({ status: 'ИСТОЧНИКА НЕТ', source: 'нет' }), [SPEC]: '# Spec\n' });
    assert.equal(r.code, 2, 'nothing to trace is not "everything traced": ' + r.out);
    assert.match(r.out, /законный ответ/, 'it must not read as a violation: ' + r.out);
  });

  test('P6 - «НЕ ИЗМЕРЕНО» needs a reason from the closed list, and is exit 2 either way', () => {
    const noReason = check({ [PROFILE]: profile({ status: 'НЕ ИЗМЕРЕНО', reason: null }), [SPEC]: '# Spec\n' });
    assert.equal(noReason.code, 2, noReason.out);
    assert.match(noReason.out, /Причина/, 'the missing reason must be named: ' + noReason.out);
    assert.match(noReason.out, /no-browser-mcp/, 'and the closed list printed: ' + noReason.out);

    const freeText = check({
      [PROFILE]: profile({ status: 'НЕ ИЗМЕРЕНО', reason: 'было некогда' }), [SPEC]: '# Spec\n',
    });
    assert.equal(freeText.code, 2, 'free text is not one of the four fixes: ' + freeText.out);
    assert.match(freeText.out, /закрытого списка/, freeText.out);

    for (const reason of REASONS) {
      const r = check({ [PROFILE]: profile({ status: 'НЕ ИЗМЕРЕНО', reason }), [SPEC]: '# Spec\n' });
      assert.equal(r.code, 2, reason + ' must still be inconclusive, never clean: ' + r.out);
      assert.match(r.out, new RegExp(reason), 'the reason must be echoed: ' + r.out);
      assert.match(r.out, /НЕ ИЗМЕРЕН/, r.out);
    }

    // `no-browser-mcp` and `no-browser` are DIFFERENT missing tools (the clone-website browser MCP
    // versus a local Playwright), and they share a prefix. A matcher that let one swallow the other
    // would report "several reasons named" for either spelling and refuse both.
    for (const reason of ['no-browser-mcp', 'no-browser']) {
      const r = check({ [PROFILE]: profile({ status: 'НЕ ИЗМЕРЕНО', reason }), [SPEC]: '# Spec\n' });
      assert.match(r.out, new RegExp('причина: ' + reason + '$', 'm'),
        'the prefix pair must resolve to exactly one reason: ' + r.out);
    }
  });

  test('P7 - an unrecognised capture status is refused, and the recognised ones are printed', () => {
    // CFG-I3 of honest-configuration: an unmapped variant refuses and lists the code-owned set.
    // A misspelling that silently read as СНЯТ would check a table nobody captured.
    const r = check({ [PROFILE]: profile({ status: 'снято частично' }), [SPEC]: '# Spec\n' });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нераспознанный статус/, r.out);
    assert.match(r.out, /СНЯТ/, r.out);
    assert.match(r.out, /ИСТОЧНИКА НЕТ/, r.out);

    const missing = check({
      [PROFILE]: '# Source Product Profile\n\n**Источник:** Senja\n', [SPEC]: '# Spec\n',
    });
    assert.equal(missing.code, 2, 'an absent status line is not a default: ' + missing.out);
    assert.match(missing.out, /Статус съёмки/, missing.out);
  });

  test('P8 - an absent Specification is exit 2, not exit 1', () => {
    // Without the destination there is nothing to compare against. Calling that "nothing traced"
    // would blame the project for the checker's blindness.
    const r = check({ [PROFILE]: profile({ rows: [ROW1] }) });
    assert.equal(r.code, 2, 'no Specification means the check could not run: ' + r.out);
    assert.match(r.out, /Specification/, r.out);
  });

  test('P9 - a partial loss is reported with the count and only the lost row is listed', () => {
    const r = check({
      [PROFILE]: profile({ rows: [ROW1, ROW2] }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 воспроизводим.\n',
    });
    assert.equal(r.code, 1, 'one of two lost is still a loss: ' + r.out);
    assert.match(r.out, /1 из 2/, 'the count must be reported: ' + r.out);
    const bullets = r.out.split('\n').filter((l) => l.includes('•')).join('\n');
    assert.match(bullets, /FR-LOOK-002/, 'the lost one must be listed: ' + r.out);
    assert.ok(!/FR-LOOK-001/.test(bullets), 'the traced one must NOT be listed as lost: ' + r.out);
  });

  test('P10 - a rejection WITH a reason passes; a bare refusal does not', () => {
    const withReason = check({
      [PROFILE]: profile({ rows: [ROW1] }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 отклонено — исходная палитра защищена товарным знаком.\n',
    });
    assert.equal(withReason.code, 0, 'a recorded rejection is a legitimate answer: ' + withReason.out);

    // The identifier itself carries two hyphens, so a reason pattern that accepts punctuation would
    // read the id as its own justification. That was a MEASURED false-clean in the growth twin.
    const bare = check({
      [PROFILE]: profile({ rows: [ROW1] }), [SPEC]: '# Spec\n\nFR-LOOK-001 rejected\n',
    });
    assert.equal(bare.code, 1, 'a refusal with no reason is a silent drop: ' + bare.out);

    const noise = check({
      [PROFILE]: profile({ rows: [ROW1] }), [SPEC]: '# Spec\n\nFR-LOOK-001 declined - x\n',
    });
    assert.equal(noise.code, 1, 'one character is a separator plus noise, not a reason: ' + noise.out);
  });

  test('P11 - a reused id is exit 2, because one mention would clear two obligations', () => {
    const dup = '| FR-LOOK-001 | Совсем другое обязательство | путь | /signup | скриншот | ЧЕРНОВИК |';
    const r = check({
      [PROFILE]: profile({ rows: [ROW1, dup] }), [SPEC]: '# Spec\nFR-LOOK-001 берём\n',
    });
    assert.equal(r.code, 2, 'a duplicate id must not read as clean: ' + r.out);
    assert.match(r.out, /повторяются идентификаторы/, r.out);
    assert.match(r.out, /FR-LOOK-001/, 'and the duplicated id must be named: ' + r.out);
  });

  test('P12 - the axis is a COLUMN of one family, and a row without it is inconclusive', () => {
    // The design constraint is one identifier family with an axis column, NOT a second namespace
    // such as FR-FLOW-nnn. That is only true while the column actually carries a value.
    const r = check({
      [PROFILE]: profile({ rows: [
        '| FR-LOOK-001 | Палитра индиго/сланец | | /pricing | скриншот | ЧЕРНОВИК |',
      ] }),
      [SPEC]: '# Spec\nFR-LOOK-001\n',
    });
    assert.equal(r.code, 2, 'a row with no axis must not read as traced: ' + r.out);
    assert.match(r.out, /Ось/, r.out);
    assert.match(r.out, /облик/, 'the closed set must be printed: ' + r.out);
    assert.match(r.out, /путь/, r.out);

    const bogus = check({
      [PROFILE]: profile({ rows: [
        '| FR-LOOK-001 | Палитра индиго/сланец | поток | /pricing | скриншот | ЧЕРНОВИК |',
      ] }),
      [SPEC]: '# Spec\nFR-LOOK-001\n',
    });
    assert.equal(bogus.code, 2, 'an axis outside the closed set is not an axis: ' + bogus.out);
  });

  test('P13 - one binary, all three verdicts in a single run', () => {
    // Each case above asserts ONE direction, so a constant-answer implementation could pass a
    // subset. The same executable must produce 0, 1 and 2.
    const seen = [
      check({ [PROFILE]: profile({ rows: [ROW1] }), [SPEC]: 'FR-LOOK-001\n' }).code,
      check({ [PROFILE]: profile({ rows: [ROW1] }), [SPEC]: 'ничего\n' }).code,
      check({}).code,
    ];
    assert.deepEqual(seen, [0, 1, 2], 'expected clean/lost/could-not-check: ' + JSON.stringify(seen));
  });

  test('P14 - a directory that does not exist is exit 2', () => {
    const r = spawnSync(process.execPath, [CHECK, '/nonexistent-path-for-this-test'],
      { encoding: 'utf8' });
    assert.equal(r.status, 2, 'an unusable argument is not a clean bill: ' + r.stdout);
  });

  // ── ось «путь»: тот же механизм трёх исходов, отдельный ответ ────────────────────────────────
  //
  // The axes FAIL APART — a landing page captures while the click-through dies on a 403 — so one
  // shared status would have to lie about one of them. These assert the second axis answers for
  // itself, WITHOUT a second identifier family and without a second artifact.

  test('P16 - REQUIRED: an EMPTY «путь» axis with no declaration is exit 2, never exit 0', () => {
    // The mandated "untouched stub" case for this axis. Before the instrument existed, silence about
    // the path was unavoidable; now silence is a gap, and reading it as clean would bless every
    // profile that only ever looked at one screen.
    const r = check({
      [PROFILE]: profile({ rows: [ROW1], pathStatus: null }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 берём как есть.\n',
    });
    assert.equal(r.code, 2, 'an undeclared path axis must not read as a clean bill: ' + r.out);
    assert.match(r.out, /проверка НЕ выполнена/, r.out);
    assert.match(r.out, /ось «путь» пуста и не объявлена/, r.out);
    assert.match(r.out, /capture-source-path\.cjs/,
      'and the instrument must be named, or the reader has a verdict with no repair: ' + r.out);
    assert.ok(!/прослежены/.test(r.out), 'nothing may be claimed traced: ' + r.out);
  });

  test('P17 - REQUIRED: a FILLED «путь» axis with no promotion is exit 1, and the ids are NAMED', () => {
    // The mandated "filled axis, no promotion" case. ROW2 is a path row, so no declaration is asked
    // for: rows ARE the answer.
    const r = check({
      [PROFILE]: profile({ rows: [ROW1, ROW2], pathStatus: null }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 берём.\n',
    });
    assert.equal(r.code, 1, 'a captured-then-dropped path must fail: ' + r.out);
    assert.match(r.out, /FR-LOOK-002/, 'the lost path id must be NAMED: ' + r.out);
    const bullets = r.out.split('\n').filter((l) => l.includes('•')).join('\n');
    assert.match(bullets, /путь/, 'and its axis must be shown: ' + r.out);
  });

  test('P18 - «путь» declared НЕ ИЗМЕРЕНО keeps a fully traced profile at 2, not 0', () => {
    // The asymmetry that makes the axis worth having. Everything written down IS traced, yet half
    // the phase never ran — "прослежено" here would be a complete-looking receipt for half a check.
    const r = check({
      [PROFILE]: profile({ rows: [ROW1], pathStatus: 'НЕ ИЗМЕРЕНО', pathReason: 'bot-protected' }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 берём.\n',
    });
    assert.equal(r.code, 2, 'a half-run phase is not a clean bill: ' + r.out);
    assert.match(r.out, /ось «путь» НЕ ИЗМЕРЕНА/, r.out);
    assert.match(r.out, /bot-protected/, 'the reason must be echoed: ' + r.out);
    assert.ok(!/^✅/m.test(r.out), 'and it must not print the clean line: ' + r.out);
  });

  test('P19 - a proven LOSS outranks an unanswered «путь» axis (1 beats 2)', () => {
    // Order of verdicts is a decision, not an accident: a dropped obligation is a defect with a
    // named fix, an unanswered axis is a question. Reporting the question first would hide the
    // defect behind "проверка не выполнена".
    const r = check({
      [PROFILE]: profile({ rows: [ROW1], pathStatus: 'НЕ ИЗМЕРЕНО', pathReason: 'timeout' }),
      [SPEC]: '# Spec\n\nничего про облик\n',
    });
    assert.equal(r.code, 1, 'the proven loss must win: ' + r.out);
    assert.match(r.out, /FR-LOOK-001/, r.out);
  });

  test('P20 - «путь: ИСТОЧНИКА НЕТ» is a legitimate answer and does NOT block a clean bill', () => {
    // Unlike the whole-profile version of that answer, the trace set here is non-empty, so 0 still
    // means something. If an honest answer could never reach 0, the check would degenerate into a
    // permanent 2 that nobody reads.
    const r = check({
      [PROFILE]: profile({ rows: [ROW1], pathStatus: 'ИСТОЧНИКА НЕТ' }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 берём.\n',
    });
    assert.equal(r.code, 0, 'a declared sourceless path axis must not block: ' + r.out);
    assert.match(r.out, /Ось «путь»: ИСТОЧНИКА НЕТ/,
      'and the answer must be VISIBLE in the receipt, or the reader cannot tell which check ran: '
      + r.out);
  });

  test('P21 - NEGATIVE: a «путь» reason outside the closed list is not an honest refusal', () => {
    // The list is closed because each entry names a different repair. Free text, a plausible-looking
    // near-miss, and two reasons at once all leave the reader with nothing to do.
    for (const bad of ['было некогда', 'no-browser-please', 'bot-protected и timeout']) {
      const r = check({
        [PROFILE]: profile({ rows: [ROW1], pathStatus: 'НЕ ИЗМЕРЕНО', pathReason: bad }),
        [SPEC]: '# Spec\n\nFR-LOOK-001 берём.\n',
      });
      assert.equal(r.code, 2, '«' + bad + '» must not pass as a reason: ' + r.out);
      assert.match(r.out, /не из закрытого списка/, r.out);
      assert.match(r.out, /\(путь\)/, 'and the axis must be named: ' + r.out);
    }

    // A missing reason line is its own failure, distinct from a wrong one.
    const none = check({
      [PROFILE]: profile({ rows: [ROW1], pathStatus: 'НЕ ИЗМЕРЕНО' }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 берём.\n',
    });
    assert.equal(none.code, 2, none.out);
    assert.match(none.out, /Причина \(путь\)/, 'the missing line must be named: ' + none.out);

    // And a «путь: СНЯТ» with no path rows is the mirror of the untouched-template case: a captured
    // path nobody wrote down is indistinguishable from an uncaptured one.
    const claimed = check({
      [PROFILE]: profile({ rows: [ROW1], pathStatus: 'СНЯТ' }),
      [SPEC]: '# Spec\n\nFR-LOOK-001 берём.\n',
    });
    assert.equal(claimed.code, 2, claimed.out);
    assert.match(claimed.out, /объявлена СНЯТ, но в таблице нет ни одной строки/, claimed.out);
  });

  test('P22 - a traced draft plus an unpromoted hypothesis is exit 0 with an informational count', () => {
    const hypothesis = '| FR-LOOK-002 | Гипотеза о пути регистрации | путь | DESIGN.md#flow | сторонний снимок | ГИПОТЕЗА |';
    const r = check({
      [PROFILE]: profile({ rows: [ROW1, hypothesis] }),
      [SPEC]: '# Specification\nFR-LOOK-001 берём.\n',
    });
    assert.equal(r.code, 0, 'an unpromoted hypothesis is not a lost captured row: ' + r.out);
    assert.match(r.out, /строк-гипотез вне промоушена: 1/, r.out);
    assert.match(r.out, /check-look-origin\.cjs/, r.out);
  });

  test('P23 - a lost draft is exit 1 while the hypothesis is not named as lost', () => {
    const hypothesis = '| FR-LOOK-002 | Гипотеза о пути регистрации | путь | DESIGN.md#flow | сторонний снимок | ГИПОТЕЗА |';
    const r = check({
      [PROFILE]: profile({ rows: [ROW1, hypothesis] }), [SPEC]: '# Specification\n',
    });
    assert.equal(r.code, 1, 'the promotable draft is still a proved loss: ' + r.out);
    const bullets = r.out.split('\n').filter((line) => line.includes('•')).join('\n');
    assert.match(bullets, /FR-LOOK-001/, 'the lost draft must be named: ' + r.out);
    assert.ok(!/FR-LOOK-002/.test(bullets), 'the hypothesis must not be named as lost: ' + r.out);
  });

  test('P24 - an all-hypothesis profile is exit 2, never a clean 0', () => {
    const hypothesis = '| FR-LOOK-002 | Гипотеза о пути регистрации | путь | DESIGN.md#flow | сторонний снимок | ГИПОТЕЗА |';
    const stale = '| FR-LOOK-003 | Устаревшая палитра | облик | DESIGN.md#palette | сторонний снимок | УСТАРЕЛО |';
    const r = check({
      [PROFILE]: profile({ rows: [hypothesis, stale] }), [SPEC]: '# Specification\n',
    });
    assert.equal(r.code, 2, 'zero promotable rows is not a clean tracing receipt: ' + r.out);
    assert.match(r.out, /все строки — гипотезы, промоушен ещё не имел права случиться/, r.out);
  });

  test('P15 - it is a hooks component wired to NO event, and the three counts agree', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-look-trace'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = fs.readFileSync(path.join(TPL, 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('check-look-trace'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract, so a '
      + 'hook could only print — it could never refuse anything');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(m, 'statusline must declare hooksExpected');
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + m[1]);
    const onDisk = fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs'));
    assert.equal(onDisk.length, Object.keys(COMPONENTS.hooks.items).length,
      'the shipped directory and the declared contract disagree: ' + onDisk.join(', '));
  });
});
