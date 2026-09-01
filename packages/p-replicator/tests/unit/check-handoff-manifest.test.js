'use strict';

// The deterministic half of «передача Фазы 0 → Фазе 1 есть ЗАКРЫТЫЙ список полей». There is NO new
// always-loaded rule: the corpus budget is spent (measured 2026-09-01) and the owner refused to
// raise the threshold, so the doctrine lives in the checker's header and in the PRODUCER's agent
// file — neither of which the corpus measure counts.
//
// THE DEFECT, measured on this package's own templates. `commands/replicate.md` passes Product
// Context as exactly four fields — target_segments, key_competitors, differentiation, monetization.
// The producer's own declared output format, `agents/product-discoverer.md`, carries SIX sections,
// and the sixth is «Key Insights for PRD». There is no field for it. Growth Channels reaches the
// other side only through the separate FR-GROWTH seed.
//
// MECHANISM: the artifact IS written and IS on disk; what the next phase lacks is an INPUT through
// which it could reach a decision. So «used» and «silently dropped» are indistinguishable, because
// nobody is obliged to answer by list.
//
// MEASURED on a fixture tree (2026-09-01): a project whose brief line «Core Loop: еженедельный
// дайджест» appears nowhere in docs/Specification.md, with BOTH existing seeds fully traced, gives
// check-growth-trace 0, check-look-trace 0 and check-docs-complete 0 — three green guards over a
// proven loss. P16 below REBUILDS that tree and asserts exactly that, so the justification for this
// checker is a running measurement rather than a paragraph.
//
// THE CLAIM DELIBERATELY NOT MADE: «no Phase-0 artifact gets through» is FALSE. Two obligation
// families have layer 1 and work — FR-GROWTH and FR-LOOK. What was missing is a guard for
// everything ELSE the run produced.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-handoff-manifest.cjs');
const BRIEF = 'docs/product-discovery-brief.md';
const SPEC = 'docs/Specification.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run a REAL checker over it. */
function run(checker, files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-handoff-')));
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

/**
 * A brief in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function brief({ ran = 'да', run: status = 'ВЫПОЛНЕНА', reason = null, rows, tail = '' } = {}) {
  const line = (label, value) => (value === null || value === undefined ? '' : '**' + label + ':** ' + value + '\n');
  const body = rows === undefined
    ? [['Ключевые инсайты для PRD', 'PD-INSIGHT-001', 'M5'],
      ['Ядро продукта: еженедельный дайджест', 'PD-CORE-001', 'M2']]
    : rows;
  return '# Product Discovery Brief\n\n'
    + '### Key Insights for PRD\n\nПользователь платит за экономию времени.\n\n'
    + '## Манифест передачи\n\n'
    + line('Фаза 0 выполнена', ran)
    + line('Проверка манифеста', status)
    + line('Причина', reason)
    + '\n| Выход | Идентификатор | Модуль |\n|---|---|---|\n'
    + body.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n'
    + tail;
}

/** A Specification that answers both default outputs. */
const SPEC_ANSWERS_BOTH = [
  '# Specification', '',
  '## FR-001 Дайджест', '',
  'Ядро продукта — еженедельный дайджест (PD-CORE-001).', '',
  'Экономия времени пользователя — PD-INSIGHT-001 — определяет приоритет MVP.', '',
].join('\n');

const healthy = (over = {}) => ({ [BRIEF]: brief(over), [SPEC]: SPEC_ANSWERS_BOTH });

describe('манифест передачи Фазы 0 → Фазы 1 — the deterministic half', () => {
  test('P1 - every enumerated output answered by identifier is CLEAN', () => {
    const r = check(healthy());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✅/);
    // The boundary is part of the verdict: an insight can be cited and misused.
    assert.match(r.out, /не что ответ хорош/, r.out);
  });

  test('P2 - no brief means Phase 0 never ran, which is NOT «nothing was lost»', () => {
    const r = check({ [SPEC]: SPEC_ANSWERS_BOTH });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /--from-docs/);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P3 - a brief with NO manifest section cannot be answered by list', () => {
    // The state of the package before this feature: the artifact exists and there is nothing to
    // answer against. Reporting that as clean is the exact substitution the checker refuses.
    const r = check({
      [BRIEF]: '# Product Discovery Brief\n\n### Key Insights for PRD\n\nтри инсайта\n',
      [SPEC]: SPEC_ANSWERS_BOTH,
    });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет раздела `## Манифест передачи`/);
    assert.match(r.out, /отвечать не по чему/);
  });

  test('P4 - «Фаза 0 выполнена: нет» is legitimate, and it is 2 rather than 0', () => {
    const r = check(healthy({ ran: 'нет' }));
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P5 - an unrecognised closed value stops the check instead of guessing', () => {
    const r = check(healthy({ ran: 'частично' }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нераспознанное значение/);
  });

  test('P6 - «НЕ ВЫПОЛНЕНА» needs a reason from the closed list, and then it is honest', () => {
    const noReason = check(healthy({ run: 'НЕ ВЫПОЛНЕНА' }));
    assert.equal(noReason.code, 2, noReason.out);
    assert.match(noReason.out, /без строки `\*\*Причина:\*\*`/);

    const freeText = check(healthy({ run: 'НЕ ВЫПОЛНЕНА', reason: 'не успели' }));
    assert.equal(freeText.code, 2, freeText.out);
    assert.match(freeText.out, /не из закрытого списка/);

    const named = check(healthy({ run: 'НЕ ВЫПОЛНЕНА', reason: 'фаза-1-не-завершена' }));
    assert.equal(named.code, 2, named.out);
    assert.match(named.out, /фаза-1-не-завершена/);
    assert.doesNotMatch(named.out, /✅/);
  });

  test('P7 - THE fixture: three outputs, one unanswered and unrejected, exits 1 WITH ITS NAME', () => {
    // The shape the backlog record mandates, verbatim: the failing name must be printed.
    const r = check({
      [BRIEF]: brief({ rows: [
        ['Ключевые инсайты для PRD', 'PD-INSIGHT-001', 'M5'],
        ['Ядро продукта: еженедельный дайджест', 'PD-CORE-001', 'M2'],
        ['Каналы дистрибуции', 'PD-CHANNEL-001', 'M5'],
      ] }),
      [SPEC]: SPEC_ANSWERS_BOTH,
    });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /PD-CHANNEL-001/, 'the lost output must be NAMED, not counted');
    assert.match(r.out, /Каналы дистрибуции/, 'and named in words a person recognises');
    assert.doesNotMatch(r.out, /PD-CORE-001/, 'an answered output must not be reported as lost');
    assert.match(r.out, /молчание запрещено/);
  });

  test('P8 - a rejection WITH a reason is an answer, and passes', () => {
    const r = check({
      [BRIEF]: brief({ rows: [
        ['Ключевые инсайты для PRD', 'PD-INSIGHT-001', 'M5'],
        ['Ядро продукта: еженедельный дайджест', 'PD-CORE-001', 'M2'],
        ['Каналы дистрибуции', 'PD-CHANNEL-001', 'M5'],
      ] }),
      [SPEC]: SPEC_ANSWERS_BOTH
        + '\nPD-CHANNEL-001 отклонён — дистрибуция вне объёма MVP, вернёмся во второй версии.\n',
    });
    assert.equal(r.code, 0, r.out);
  });

  test('P9 - a rejection WITHOUT a reason is its own defect, reported apart', () => {
    // Different repairs: one needs a decision, the other needs the decision written down.
    const r = check({
      [BRIEF]: brief({ rows: [['Каналы дистрибуции', 'PD-CHANNEL-001', 'M5']] }),
      [SPEC]: '# Specification\n\nPD-CHANNEL-001 отклонён.\n',
    });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /отклонён БЕЗ ПРИЧИНЫ/);
    assert.match(r.out, /PD-CHANNEL-001/);
  });

  test('P10 - a REFUSAL is not a citation, so the reason requirement is actually reached', () => {
    // The measured hole in the sibling checker: a line containing the exact token read as «carried
    // forward», so the rejection path was never entered and its reason was never demanded.
    const withReason = check({
      [BRIEF]: brief({ rows: [['Каналы', 'PD-CHANNEL-001', 'M5']] }),
      [SPEC]: '# Specification\n\nPD-CHANNEL-001 rejected because the channel needs a partner we lack.\n',
    });
    assert.equal(withReason.code, 0, withReason.out);

    const bare = check({
      [BRIEF]: brief({ rows: [['Каналы', 'PD-CHANNEL-001', 'M5']] }),
      [SPEC]: '# Specification\n\nPD-CHANNEL-001 rejected\n',
    });
    assert.equal(bare.code, 1, bare.out);
  });

  test('P11 - an empty manifest under «да» is a PROVEN gap, not an unknown', () => {
    const r = check({ [BRIEF]: brief({ rows: [] }), [SPEC]: SPEC_ANSWERS_BOTH });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ни один её выход не перечислен/);
  });

  test('P12 - a template row does not count as a real output', () => {
    // A manifest padded with the shipped example would make the check pass while describing work
    // nobody did — worse than a short manifest, because it is a green verdict about fiction.
    const r = check({
      [BRIEF]: brief({ rows: [
        ['[what this run actually produced]', 'PD-INSIGHT-001', 'M5'],
      ] }),
      [SPEC]: '# Specification\n\nничего\n',
    });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ни один её выход не перечислен/,
      'an untouched template must not look like a filled-in manifest');
  });

  test('P13 - free prose instead of a stable identifier stops the check', () => {
    // Prose cannot be answered BY LIST, and answering by list is the entire cure.
    const r = check({
      [BRIEF]: brief({ rows: [['Ключевые инсайты', 'три главных инсайта', 'M5']] }),
      [SPEC]: SPEC_ANSWERS_BOTH,
    });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /без устойчивого идентификатора/);
    assert.match(r.out, /ПО СПИСКУ/);
  });

  test('P14 - a reused identifier stops the check: one citation would clear two outputs', () => {
    const r = check({
      [BRIEF]: brief({ rows: [
        ['Инсайты', 'PD-INSIGHT-001', 'M5'],
        ['Ядро продукта', 'PD-INSIGHT-001', 'M2'],
      ] }),
      [SPEC]: SPEC_ANSWERS_BOTH,
    });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /повторяются идентификаторы/);
  });

  test('P15 - no Phase-1 documents at all is «nothing to answer WITH», never «all delivered»', () => {
    const r = check({ [BRIEF]: brief() });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет ни одного документа Фазы 1/);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P16 - MEASURED: the three existing guards are all green over the same proven loss', () => {
    // The justification for this checker, re-measured rather than quoted. The fixture is the one
    // from the backlog record: a brief whose Core Loop line reaches no Phase-1 document, with BOTH
    // shipped seed families fully traced. The three siblings are not broken — they answer their own
    // questions correctly, and nothing was asking this one.
    const files = {
      [BRIEF]: [
        '# Product Discovery Brief', '',
        '### Key Insights for PRD', '',
        'Core Loop: еженедельный дайджест', '',
        '| Требование | Ось | Статус |', '|---|---|---|',
        '| FR-GROWTH-001 | канал | ACCEPTED |', '',
      ].join('\n') + '\n' + brief().slice(brief().indexOf('## Манифест передачи')),
      [SPEC]: [
        '# Specification', '',
        'FR-GROWTH-001 — реферальная программа.', '',
        'FR-LOOK-001 — палитра источника.', '',
        'Экономия времени пользователя — PD-INSIGHT-001.', '',
      ].join('\n'),
      'docs/source-product-profile.md': [
        '# Source Product Profile', '',
        '**Статус съёмки:** СНЯТ', '',
        '| Требование | Ось | Наблюдение | Источник | Статус |', '|---|---|---|---|---|',
        '| FR-LOOK-001 | облик | палитра | https://example.test | СНЯТ |', '',
      ].join('\n'),
      'docs/PRD.md': '# PRD\n\nПродукт для занятых людей.\n',
      'docs/Architecture.md': '# Architecture\n\nМонорепозиторий.\n',
      'docs/Pseudocode.md': '# Pseudocode\n\nАлгоритм сборки дайджеста описан ниже подробно и полно.\n',
    };
    const growth = run(path.join(TPL, 'hooks', 'check-growth-trace.cjs'), files);
    const look = run(path.join(TPL, 'hooks', 'check-look-trace.cjs'), files);
    const docs = run(path.join(TPL, 'hooks', 'check-docs-complete.cjs'), files);
    const mine = check(files);

    // The seeds arrive; the third output does not. Whatever the two seed checkers answer, neither
    // of them is capable of naming PD-CORE-001 — and that is the point being measured.
    for (const [name, r] of [['growth', growth], ['look', look], ['docs', docs]]) {
      assert.doesNotMatch(r.out, /PD-CORE-001/,
        name + ' would have to name the lost output for this feature to be redundant: ' + r.out);
    }
    assert.equal(mine.code, 1, mine.out);
    assert.match(mine.out, /PD-CORE-001/, 'and this checker names it');
  });

  test('P17 - no non-zero exit ever prints the clean marker', () => {
    const cases = [
      {},
      { [BRIEF]: brief({ ran: 'нет' }), [SPEC]: SPEC_ANSWERS_BOTH },
      { [BRIEF]: brief({ rows: [] }), [SPEC]: SPEC_ANSWERS_BOTH },
      { [BRIEF]: brief({ rows: [['Каналы', 'PD-CHANNEL-001', 'M5']] }), [SPEC]: '# Specification\n\nничего\n' },
      { [BRIEF]: brief() },
    ];
    for (const files of cases) {
      const r = check(files);
      assert.notEqual(r.code, 0, JSON.stringify(Object.keys(files)));
      assert.doesNotMatch(r.out, /✅/, r.out);
    }
  });
});

/** The seam's FORCE, separately from its vocabulary. */
function seamForceProblems(text) {
  const problems = [];
  if (!/Phase 1 MUST answer for EVERY one/.test(text)) {
    problems.push('the answer-by-list duty is advisory, not imperative');
  }
  if (!/reject it WITH A REASON/.test(text)) {
    problems.push('a silent rejection is allowed again, which is indistinguishable from forgetting');
  }
  if (!/Silence is forbidden/.test(text)) {
    problems.push('silence is no longer refused — and silence is the whole defect');
  }
  if (!/node \.claude\/hooks\/check-handoff-manifest\.cjs \./.test(text)) {
    problems.push('the deterministic half is not invoked at the seam');
  }
  return problems;
}

describe('the producer emits it, the seam demands it, and every counter agrees', () => {
  test('P18 - /replicate demands the answer by list, and softening it fires', () => {
    const rel = 'templates/.claude/commands/replicate.md';
    const source = read(rel);
    assert.deepEqual(seamForceProblems(source), [], rel);

    const softened = source.replace('Phase 1 MUST answer for EVERY one',
      'Phase 1 may take these into account');
    assert.notEqual(softened, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(seamForceProblems(softened), ['the answer-by-list duty is advisory, not imperative'],
      'softening the duty must fire EXACTLY the mandate predicate');

    const silentDrop = source.replace('Silence is forbidden', 'Silence is discouraged');
    assert.ok(seamForceProblems(silentDrop).some((p) => p.includes('silence')), rel);
  });

  test('P19 - the PRODUCER emits the manifest, or Phase 1 has nothing to answer against', () => {
    // The producer half lives in agents/, which the corpus measure does not count — so the long
    // form is affordable exactly where it is needed and free where it is loaded.
    const agent = read('templates/.claude/agents/product-discoverer.md');
    assert.match(agent, /## Манифест передачи/, 'the output format must carry the manifest section');
    assert.match(agent, /PD-INSIGHT-001/, 'with a concrete identifier shape');
    assert.match(agent, /A module that did not run owes NOTHING/,
      'a manifest padded to look complete is worse than a short one');
    assert.match(agent, /check-handoff-manifest\.cjs/, 'and it must name its deterministic half');
    // The closed four-field handoff is the REASON, and it must be stated where the producer reads it.
    assert.match(agent, /CLOSED list of four fields/,
      'without the mechanism the manifest reads as one more section to fill in');
  });

  test('P20 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-handoff-manifest'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-handoff-manifest'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract, so a '
      + 'hook could only print — the cure REQUIRES a callable utility that can refuse');

    const statusline = read('templates/.claude/hooks/statusline.cjs');
    const hooks = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(hooks, 'statusline must declare hooksExpected');
    const onDisk = fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs'));
    assert.equal(Number(hooks[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + hooks[1]);
    assert.equal(onDisk.length, Object.keys(COMPONENTS.hooks.items).length,
      'the shipped directory and the declared contract disagree: ' + onDisk.join(', '));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-handoff-manifest\.cjs/, 'the hook inventory must list it');
    const inventory = rule.match(/\*\*Hooks \((\d+) files/);
    assert.ok(inventory, 'the rule must state the hook count it is inventorying');
    assert.equal(Number(inventory[1]), onDisk.length,
      'the rule prose and the shipped directory disagree — the exact split this family exists for');
  });

  test('P21 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'handoff-cannot-check-is-not-clean': 'templates/.claude/hooks/check-handoff-manifest.cjs',
      'handoff-silence-is-not-an-answer': 'templates/.claude/hooks/check-handoff-manifest.cjs',
      'handoff-a-refusal-needs-a-reason': 'templates/.claude/hooks/check-handoff-manifest.cjs',
      'handoff-seam-answer-by-list-is-mandatory': 'templates/.claude/commands/replicate.md',
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
