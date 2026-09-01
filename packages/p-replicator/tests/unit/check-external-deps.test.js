'use strict';

// The deterministic half of «инвентарь внешних зависимостей может ОТСУТСТВОВАТЬ». There is NO new
// always-loaded rule: the corpus budget is spent (measured 2026-09-01) and the owner refused to
// raise the threshold, so the doctrine lives in the checker's header, which is never loaded.
//
// WHAT IS ALREADY SHIPPED AND IS NOT RE-CREATED: the inventory (five columns), the three verdicts
// CONFIRMED / UNCONFIRMED / CONTRADICTED, the verbatim-quote requirement, the sixth validator lens
// and the Phase-2 output rows — all in skills/sparc-prd-mini/SKILL.md, pinned by
// tests/unit/external-dependency-check.test.js.
//
// THE MISSING THING: nobody ENFORCED it. The template states the rule in its own words — write
// literally "No external dependencies — this product calls no third-party service", because "an
// empty section and an absent section are indistinguishable" — and the only consumers were a prose
// lens read by a model and two output-table rows. Layer 3-4 both.
//
// THE VACUOUS TRUTH: the Phase-2 green line reads "no external dependency UNCONFIRMED or
// CONTRADICTED". Over an EMPTY SET that is true by itself. So the single outcome this file exists to
// make unreachable is a clean answer produced by absence — which is why an absent section is exit 2
// and can never be exit 0. P3 is that fixture; P16 re-measures the three green siblings.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-external-deps.cjs');
const ARCH = 'docs/Architecture.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run a REAL checker over it. */
function run(checker, files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-extdeps-')));
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

const GOOD_EVIDENCE = 'https://docs.example.test/email · checked 2026-08-30 · '
  + '«The API reports hard and soft bounces via webhook»';

/** An Architecture.md whose inventory says what the case needs. */
function arch({ rows, before = '## Technology Stack\n\n| Layer | Technology | Rationale |\n|---|---|---|\n| Backend | Node | привычен команде |\n', section = true, prose = '' } = {}) {
  const body = rows === undefined
    ? [['отправка писем', 'Postmark', GOOD_EVIDENCE, 'CONFIRMED', 'FR-010']]
    : rows;
  let out = '# Architecture\n\n' + before + '\n';
  if (section) {
    out += '## External Dependencies\n\n' + (prose ? prose + '\n\n' : '');
    if (body.length) {
      out += '| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |\n'
        + '|---|---|---|---|---|\n'
        + body.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
    }
  }
  out += '\n## Data Architecture\n\nPostgres.\n';
  return out;
}

describe('инвентарь внешних зависимостей — the deterministic half', () => {
  test('P1 - a filled inventory whose rows carry verdicts is CLEAN', () => {
    const r = check({ [ARCH]: arch() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✅/);
    // The boundary is part of the verdict: the checker cannot open the link.
    assert.match(r.out, /НЕ ОТКРЫВАЕТ ссылку/, r.out);
  });

  test('P2 - no Architecture.md is «Phase 1 is unfinished», not «no dependencies»', () => {
    const r = check({});
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/Architecture\.md/);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P3 - THE fixture: an ABSENT section exits 2 with a named reason, never 0', () => {
    const r = check({ [ARCH]: arch({ section: false }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет раздела `## External Dependencies`/);
    // The mechanism must be printed, or the code alone teaches nothing.
    assert.match(r.out, /истинным САМО СОБОЙ|вакуумн/i, r.out);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P4 - the LEGITIMATE «no dependencies» answer is a DIFFERENT fact and prints differently', () => {
    // Absent section  = the question was never asked.
    // The sentence    = the question was asked and answered.
    // Both are exit 2; printing them identically would rebuild the confusion this file removes.
    const declared = check({ [ARCH]: arch({
      rows: [], prose: 'No external dependencies — this product calls no third-party service.',
    }) });
    assert.equal(declared.code, 2, declared.out);
    assert.match(declared.out, /законный ответ/);
    assert.match(declared.out, /вопрос БЫЛ задан/);

    const absent = check({ [ARCH]: arch({ section: false }) });
    assert.notEqual(declared.out, absent.out,
      'the two exit-2 reasons must not be printed the same way — they are opposite facts');
  });

  test('P5 - an EMPTY section is not the legitimate answer either', () => {
    const r = check({ [ARCH]: arch({ rows: [] }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /пуст/);
    assert.match(r.out, /дословно/, 'and it must say what to write instead');
  });

  test('P6 - a section holding only the shipped TEMPLATE row is not filled in', () => {
    const r = check({ [ARCH]: arch({ rows: [
      ['[what the product needs it to DO]', '[service]', '[link] · checked [YYYY-MM-DD]', 'CONFIRMED', '[REQ ids]'],
    ] }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /шаблонная строка/);
  });

  test('P7 - a row with no verdict is a PROVEN defect, not an unknown', () => {
    // The inventory's entire job is to carry a verdict; a row that carries none was written as if
    // it had one, and that is exactly what makes the Phase-2 green line contentless.
    const r = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', GOOD_EVIDENCE, '', 'FR-010'],
    ] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /без вердикта/);
    assert.match(r.out, /отправка писем/, 'the row must be NAMED');
  });

  test('P8 - an unrecognised verdict is refused with the closed three listed', () => {
    const r = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', GOOD_EVIDENCE, 'PROBABLY', 'FR-010'],
    ] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /CONFIRMED \| UNCONFIRMED \| CONTRADICTED/);
  });

  test('P9 - CONTRADICTED is a proven defect and names the requirements resting on it', () => {
    const r = check({ [ARCH]: arch({ rows: [
      ['вебхук о возвратах', 'Postmark', GOOD_EVIDENCE, 'CONTRADICTED', 'FR-011'],
    ] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /CONTRADICTED/);
    assert.match(r.out, /FR-011/, 'the dependent requirements must be named, not counted');
  });

  test('P10 - THE second fixture: CONFIRMED without a verbatim quote fails, WITH THE ROW NAMED', () => {
    const r = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', 'https://docs.example.test/email · checked 2026-08-30', 'CONFIRMED', 'FR-010'],
    ] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /без ДОСЛОВНОЙ ЦИТАТЫ/);
    assert.match(r.out, /отправка писем/);
    // The reason: a plausible link is the cheapest possible forgery.
    assert.match(r.out, /самая дешёвая подделка/);
  });

  test('P11 - a missing link and a missing date are reported APART from the quote', () => {
    // Three different repairs — «find the page», «say when you looked», «quote the sentence» — so
    // collapsing them into one message would name the wrong fix two times out of three.
    const noLink = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', 'checked 2026-08-30 · «The API reports hard and soft bounces»', 'CONFIRMED', 'FR-010'],
    ] }) });
    assert.equal(noLink.code, 1, noLink.out);
    assert.match(noLink.out, /без ссылки/);

    const noDate = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', 'https://docs.example.test/email · «The API reports hard and soft bounces»', 'CONFIRMED', 'FR-010'],
    ] }) });
    assert.equal(noDate.code, 1, noDate.out);
    assert.match(noDate.out, /без даты проверки/);
    assert.match(noDate.out, /ДРЕЙФУЕТ/, 'and it must say WHY a date matters');
  });

  test('P12 - UNCONFIRMED passes, and its requirements are NAMED as blocked from Phase 3', () => {
    // The middle verdict is the honest state of a project on a machine with no web access. It must
    // not fail — and it must not pass silently either, or external feasibility never has to be
    // established at all while the gate looks mandatory on paper.
    const r = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', GOOD_EVIDENCE, 'CONFIRMED', 'FR-010'],
      ['отчёт о возвратах', 'Postmark', 'нет доступа к сети', 'UNCONFIRMED', 'FR-011'],
    ] }) });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 CONFIRMED, 1 UNCONFIRMED/);
    assert.match(r.out, /НЕ входят в/);
    assert.match(r.out, /FR-011/);
  });

  test('P13 - the Technology Stack table above is NOT read as inventory rows', () => {
    // Read per section, never globally: the neighbouring table has three columns and no verdict, so
    // a global scan would report a defect that is not there — an answer to a neighbouring question.
    const r = check({ [ARCH]: arch() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 способност/, r.out);
  });

  test('P14 - a duplicated capability/provider pair stops the check', () => {
    const r = check({ [ARCH]: arch({ rows: [
      ['отправка писем', 'Postmark', GOOD_EVIDENCE, 'CONFIRMED', 'FR-010'],
      ['отправка писем', 'Postmark', GOOD_EVIDENCE, 'UNCONFIRMED', 'FR-012'],
    ] }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /повторяются строки/);
  });

  test('P15 - no non-zero exit ever prints the clean marker', () => {
    const cases = [
      {},
      { [ARCH]: arch({ section: false }) },
      { [ARCH]: arch({ rows: [] }) },
      { [ARCH]: arch({ rows: [['x', 'y', GOOD_EVIDENCE, '', 'FR-1']] }) },
      { [ARCH]: arch({ rows: [['x', 'y', GOOD_EVIDENCE, 'CONTRADICTED', 'FR-1']] }) },
    ];
    for (const files of cases) {
      const r = check(files);
      assert.notEqual(r.code, 0, JSON.stringify(files));
      assert.doesNotMatch(r.out, /✅/, r.out);
    }
  });

  test('P16 - MEASURED: the three existing guards are all green over the missing inventory', () => {
    // The justification, re-measured rather than quoted: a tree with the full Phase-1 set whose
    // Architecture.md has NO inventory section. The siblings are not broken — nothing was asking
    // this question.
    const files = {
      [ARCH]: arch({ section: false }),
      'docs/product-discovery-brief.md': [
        '# Brief', '', '| Требование | Ось | Статус |', '|---|---|---|',
        '| FR-GROWTH-001 | канал | ACCEPTED |', '',
      ].join('\n'),
      'docs/source-product-profile.md': [
        '# Source Product Profile', '', '**Статус съёмки:** СНЯТ', '',
        '| Требование | Ось | Наблюдение | Источник | Статус |', '|---|---|---|---|---|',
        '| FR-LOOK-001 | облик | палитра | https://example.test | СНЯТ |', '',
      ].join('\n'),
      'docs/Specification.md': '# Specification\n\nFR-GROWTH-001 — реферальная программа.\n\nFR-LOOK-001 — палитра.\n',
      'docs/PRD.md': '# PRD\n\nПродукт для занятых людей, рассылающий еженедельный дайджест по почте.\n',
      'docs/Pseudocode.md': '# Pseudocode\n\nАлгоритм сборки дайджеста описан подробно и полно ниже.\n',
    };
    const growth = run(path.join(TPL, 'hooks', 'check-growth-trace.cjs'), files);
    const look = run(path.join(TPL, 'hooks', 'check-look-trace.cjs'), files);
    for (const [name, r] of [['growth', growth], ['look', look]]) {
      assert.doesNotMatch(r.out, /External Dependencies/,
        name + ' would have to name the missing inventory for this feature to be redundant: ' + r.out);
    }
    const mine = check(files);
    assert.equal(mine.code, 2, mine.out);
    assert.match(mine.out, /External Dependencies/, 'and this checker names it');
  });
});

/** The seam's FORCE, separately from its vocabulary. */
function seamForceProblems(text) {
  const problems = [];
  if (!/Инвентарь внешних зависимостей ОБЯЗАН СУЩЕСТВОВАТЬ/.test(text)) {
    problems.push('the existence duty is advisory, not imperative');
  }
  if (!/отсутствующий раздел — это НЕ «зависимостей\s*\n?нет»/.test(text)) {
    problems.push('an absent section may read as «no dependencies» again — that IS the defect');
  }
  if (!/истинен САМ СОБОЙ/.test(text)) {
    problems.push('the vacuous-truth mechanism is gone — without it the duty reads as paperwork');
  }
  if (!/node \.claude\/hooks\/check-external-deps\.cjs \./.test(text)) {
    problems.push('the deterministic half is not invoked at the seam');
  }
  return problems;
}

describe('the seam still mandates, and every counter agrees', () => {
  test('P17 - Phase 2 calls it as an acceptance criterion, and softening it fires', () => {
    const rel = 'templates/.claude/commands/replicate.md';
    const source = read(rel);
    assert.deepEqual(seamForceProblems(source), [], rel);
    // Placement matters: a check called after the swarm guards nothing this swarm would do.
    const step = source.indexOf('Шаг 2.0');
    const call = source.indexOf('check-external-deps.cjs');
    assert.ok(step > 0 && call > step && call - step < 1200,
      'the call must live in Шаг 2.0, before the validation swarm launches');

    const softened = source.replace('Инвентарь внешних зависимостей ОБЯЗАН СУЩЕСТВОВАТЬ',
      'Инвентарь внешних зависимостей желателен');
    assert.notEqual(softened, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(seamForceProblems(softened), ['the existence duty is advisory, not imperative'],
      'softening the duty must fire EXACTLY the mandate predicate');

    const noMechanism = source.replace('истинен САМ СОБОЙ', 'выглядит убедительно');
    assert.ok(seamForceProblems(noMechanism).some((p) => p.includes('vacuous')), rel);
  });

  test('P18 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-external-deps'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-external-deps'),
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
    assert.match(rule, /check-external-deps\.cjs/, 'the hook inventory must list it');
    const inventory = rule.match(/\*\*Hooks \((\d+) files/);
    assert.ok(inventory, 'the rule must state the hook count it is inventorying');
    assert.equal(Number(inventory[1]), onDisk.length,
      'the rule prose and the shipped directory disagree — the exact split this family exists for');
  });

  test('P19 - the shipped rule it enforces is still there, and is not re-created here', () => {
    // The boundary the backlog record draws: the inventory, the three verdicts and the quote
    // requirement are ALREADY shipped. This feature adds enforcement and nothing else. If the rule
    // were quietly rewritten here, the two copies would disagree and each would believe itself
    // authoritative — which is worse than having one.
    const skill = read('templates/.claude/skills/sparc-prd-mini/SKILL.md');
    assert.match(skill, /No external dependencies —\s+this product calls no third-party service/,
      'the prescribed sentence must stay the SKILL\'s, and the checker must match it, not replace it');
    assert.match(skill, /an empty section and an absent section are\s*\n?indistinguishable/i,
      'the reason the sentence exists must stay where the author reads it');
    for (const verdict of ['CONFIRMED', 'UNCONFIRMED', 'CONTRADICTED']) {
      assert.ok(skill.includes(verdict), 'the closed three must stay in the shipped rule: ' + verdict);
    }
  });

  test('P20 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'extdeps-absent-section-is-never-clean': 'templates/.claude/hooks/check-external-deps.cjs',
      'extdeps-confirmed-needs-a-verbatim-quote': 'templates/.claude/hooks/check-external-deps.cjs',
      'extdeps-row-without-a-verdict-is-proven': 'templates/.claude/hooks/check-external-deps.cjs',
      'extdeps-seam-existence-is-mandatory': 'templates/.claude/commands/replicate.md',
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
