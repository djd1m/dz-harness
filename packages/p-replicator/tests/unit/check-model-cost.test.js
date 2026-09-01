'use strict';

// The deterministic half of the model-call-cost rule. The rule itself is prose a model executes —
// layer 2. This is layer 1, and only for whoever runs it.
//
// THE DEFECT IT EXISTS FOR. An external model call is billed PER CALL, and in these products the
// call is triggered by a STRANGER: a photo upload, a submitted episode, a pasted knowledge base. So
// the spend curve is drawn by someone whose behaviour you do not control — and unlike every other
// defect this package guards, the failure CANNOT BE ROLLED BACK. A wrong port is closed and the
// story ends. Here the invoice arrives and the money is gone. That is why the checks below are all
// about what refuses BEFORE the call, never about noticing afterwards.
//
// Three sides are covered here, deliberately:
//   1. BEHAVIOUR  — the real utility, real files, real exit codes (P1-P16)
//   2. FORCE      — the rule's text still MANDATES, not suggests (P17-P18); a polite rephrasing
//                   must turn this suite red, because a suite that tests a contract's VOCABULARY
//                   and not its FORCE has already been observed to pass an optional obligation
//                   (MEASURED on this package, commit 37916bd3)
//   3. WIRING     — the seam, the counters and the mutation registry agree (P19-P21)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-model-cost.cjs');
const CONTRACT = 'docs/model-cost-contract.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run the REAL checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-cost-')));
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

/** The Cal-AI-clone row: an outsider uploads a photo, nobody logs in, sessions are the unit. */
const OUTSIDER = {
  name: 'распознавание-фото', trigger: 'посторонний', auth: 'без-входа', unit: 'сессия',
  perUser: '20', perDay: '2000', onLimit: 'ОТКАЗ',
};
/** The developer's own nightly job: you can only ruin yourself with it. */
const OWN = {
  name: 'ночной-пересчёт', trigger: 'свой-код', auth: '—', unit: '—',
  perUser: '500', perDay: '500', onLimit: 'ОТКАЗ',
};

/**
 * A contract in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function contract({
  calls = 'да', where = 'https://console.example.com/usage', billed = 'попыткам',
  unset = 'ОТКАЗ ПРИ СТАРТЕ', run = 'ВЫПОЛНЕНА', reason = null, rows = [OUTSIDER, OWN],
} = {}) {
  const line = (label, value) => (value === null ? '' : '**' + label + ':** ' + value + '\n');
  return '# Model cost contract\n\n'
    + line('Внешние вызовы модели', calls)
    + line('Где виден расход', where)
    + line('Счёт ведётся по', billed)
    + line('Потолок не сконфигурирован', unset)
    + line('Проверка пределов', run)
    + line('Причина', reason)
    + '\n## Внешние вызовы\n\n'
    + '| Вызов | Кто запускает | Вход | Единица счёта | Предел на пользователя | Предел в сутки | При достижении |\n'
    + '|---|---|---|---|---|---|---|\n'
    + rows.map((r) => '| ' + [r.name, r.trigger, r.auth, r.unit, r.perUser, r.perDay, r.onLimit]
      .join(' | ') + ' |').join('\n') + (rows.length ? '\n' : '');
}

const withRow = (patch, base = OUTSIDER) => [{ ...base, ...patch }, OWN];

describe('the model-cost checker answers three questions and never confuses two of them', () => {
  test('P1 - bounded ceilings on every call is exit 0, and the outsider count is printed', () => {
    const r = check({ [CONTRACT]: contract() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /2 вызов\(ов\) названы/, r.out);
    // The number of calls a STRANGER can trigger is the number that decides the risk, so it is
    // printed rather than folded into a total.
    assert.match(r.out, /запускаются посторонними: 1 \(из них без входа: 1\)/, r.out);
    // The receipt must state what it does NOT prove, or a reader upgrades it into an enforcement proof.
    assert.match(r.out, /Ограничение:/, r.out);
  });

  test('P2 - no contract at all is exit 2, and the hint refuses the wrong reading', () => {
    const r = check({});
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/model-cost-contract\.md/, r.out);
    // «no file» means the QUESTION was never asked — never «there are no paid calls».
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/, r.out);
  });

  test('P3 - «внешних вызовов нет» is a legitimate answer and exits 2, never 0', () => {
    const r = check({ [CONTRACT]: contract({ calls: 'нет' }) });
    assert.equal(r.code, 2, 'a product with no paid call has nothing to bound: ' + r.out);
    assert.match(r.out, /законный ответ/, r.out);
  });

  test('P4 - «НЕ ВЫПОЛНЕНА» with a closed-list reason is honest UNKNOWN, exit 2', () => {
    const ok = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: 'не-подключено' }) });
    assert.equal(ok.code, 2, ok.out);
    assert.match(ok.out, /НЕ ВЫПОЛНЕНА, причина: не-подключено/, ok.out);
    assert.match(ok.out, /потраченного не вернуть/, 'the irreversibility must be said here: ' + ok.out);

    const none = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: null }) });
    assert.equal(none.code, 2, none.out);
    assert.match(none.out, /без строки `\*\*Причина:\*\*`/, none.out);

    for (const bad of ['потом разберёмся', 'не-подключено и вне-объёма']) {
      const r = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: bad }) });
      assert.equal(r.code, 2, r.out);
      assert.match(r.out, /не из закрытого списка/, '«' + bad + '»: ' + r.out);
    }
  });

  test('P5 - ПРАВИЛО №0: an unconfigured ceiling declared as «без ограничений» is exit 1', () => {
    const r = check({ [CONTRACT]: contract({ unset: 'БЕЗ ОГРАНИЧЕНИЙ' }) });
    assert.equal(r.code, 1, 'an absent limit must not mean infinity: ' + r.out);
    assert.match(r.out, /CFG-S1/, 'the honest-configuration lineage must be named: ' + r.out);
    assert.match(r.out, /Запуск обязан ПАДАТЬ/, r.out);
  });

  test('P6 - LOAD-BEARING: a ceiling named as an INTENTION is a proven defect, exit 1', () => {
    for (const bad of ['разумный', 'по ситуации', '[20]', '', '—']) {
      const r = check({ [CONTRACT]: contract({ rows: withRow({ perUser: bad }) }) });
      assert.equal(r.code, 1, '«' + bad + '» must not pass as a ceiling: ' + r.out);
      assert.match(r.out, /намерением, а не числом/, r.out);
      assert.match(r.out, /распознавание-фото \/ на пользователя/, 'the cell must be named: ' + r.out);
    }
    // A number a HUMAN writes with a separator is still a number; refusing it would push people to
    // omit the ceiling rather than to write it.
    const spaced = check({ [CONTRACT]: contract({ rows: withRow({ perDay: '2 000' }) }) });
    assert.equal(spaced.code, 0, spaced.out);
  });

  test('P7 - an INFINITE ceiling is named apart from a typo, exit 1', () => {
    for (const bad of ['∞', 'unlimited', 'без ограничений', '-1', 'нет']) {
      const r = check({ [CONTRACT]: contract({ rows: withRow({ perDay: bad }) }) });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /предел объявлен бесконечным/, '«' + bad + '»: ' + r.out);
    }
    const zero = check({ [CONTRACT]: contract({ rows: withRow({ perUser: '0' }) }) });
    assert.equal(zero.code, 1, zero.out);
    assert.match(zero.out, /предел не положителен/, zero.out);
  });

  test('P8 - a per-user ceiling above the daily one can never bind, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ rows: withRow({ perUser: '5000', perDay: '2000' }) }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не сработает никогда/, r.out);
    assert.match(r.out, /на пользователя 5000 > в сутки 2000/, r.out);
    // BOUNDED: equal is legitimate — a single-user-per-day product is not a defect.
    const equal = check({ [CONTRACT]: contract({ rows: withRow({ perUser: '2000', perDay: '2000' }) }) });
    assert.equal(equal.code, 0, equal.out);
  });

  test('P9 - LOAD-BEARING: a counting unit that cannot exist for the caller is exit 1', () => {
    // The whole feature in one comparison. `без-входа` + `аккаунт` is a limit written like a
    // defence that can never bind a single call — the same shape as a widget checked on its own
    // origin: a measurement that cannot observe the failure it names.
    const r = check({ [CONTRACT]: contract({ rows: withRow({ auth: 'без-входа', unit: 'аккаунт' }) }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не существует для того, кто вызов запускает/, r.out);
    assert.match(r.out, /у анонимного посетителя нет аккаунта/, 'the mechanism, not a scolding: ' + r.out);

    // BOUNDED: the SAME unit is legitimate once the caller must log in, or the check would refuse
    // the correct configuration and get switched off.
    const authed = check({ [CONTRACT]: contract({ rows: withRow({ auth: 'после-входа', unit: 'аккаунт' }) }) });
    assert.equal(authed.code, 0, authed.out);
  });

  test('P10 - an outsider-triggered call with no unit, or no answer about login, is exit 1', () => {
    const noUnit = check({ [CONTRACT]: contract({ rows: withRow({ unit: '—' }) }) });
    assert.equal(noUnit.code, 1, noUnit.out);
    assert.match(noUnit.out, /не к чему привязать/, noUnit.out);

    const noAuth = check({ [CONTRACT]: contract({ rows: withRow({ auth: '—' }) }) });
    assert.equal(noAuth.code, 1, noAuth.out);
    assert.match(noAuth.out, /не сказано, нужен ли ему вход/, noAuth.out);

    // BOUNDED: `—` in both columns is exactly right for свой-код, and must stay exit 0 (the OWN row
    // carries it in every healthy fixture above, and here alone).
    const ownOnly = check({ [CONTRACT]: contract({ rows: [OWN] }) });
    assert.equal(ownOnly.code, 0, 'own-code calls need no identity: ' + ownOnly.out);
    assert.match(ownOnly.out, /посторонними: 0/, ownOnly.out);
  });

  test('P11 - reaching the ceiling must REFUSE: degradation and a queue are exit 1, named apart', () => {
    const degraded = check({ [CONTRACT]: contract({ rows: withRow({ onLimit: 'ДЕГРАДАЦИЯ' }) }) });
    assert.equal(degraded.code, 1, 'silent degradation must not read as a ceiling: ' + degraded.out);
    assert.match(degraded.out, /ДЕГРАДАЦИЯ, а не отказ/, degraded.out);
    assert.match(degraded.out, /вы узнаете из счёта/, degraded.out);

    const queued = check({ [CONTRACT]: contract({ rows: withRow({ onLimit: 'ОЧЕРЕДЬ' }) }) });
    assert.equal(queued.code, 1, queued.out);
    assert.match(queued.out, /ОЧЕРЕДЬ, а не отказ/, queued.out);
    assert.match(queued.out, /не отменяет расход/, 'a queue postpones the spend, it does not cancel it');
  });

  test('P12 - billing counted by successes leaves the retry path unmetered, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ billed: 'успехам' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /по УСПЕХАМ/, r.out);
    assert.match(r.out, /счёт за ПОПЫТКУ/, r.out);
    // The adjacency is NAMED, and only named: the retry policy itself belongs to the neighbouring rule.
    assert.match(r.out, /долгих фоновых задач/, r.out);
  });

  test('P13 - a spend place without an ADDRESS is exit 1; three address forms pass', () => {
    for (const vague of ['в логах', 'в консоли провайдера', 'спросить у меня']) {
      const r = check({ [CONTRACT]: contract({ where: vague }) });
      assert.equal(r.code, 1, '«' + vague + '»: ' + r.out);
      assert.match(r.out, /жанром, а не адресом/, r.out);
    }
    for (const good of ['https://console.example.com/usage', '/var/log/model-spend.jsonl',
      'команда `make spend-report`']) {
      const r = check({ [CONTRACT]: contract({ where: good }) });
      assert.equal(r.code, 0, '«' + good + '» must be accepted: ' + r.out);
    }
    const empty = check({ [CONTRACT]: contract({ where: null }) });
    assert.equal(empty.code, 2, 'an absent header is «could not check», not a proven defect: ' + empty.out);
  });

  test('P14 - an empty call table under «да» is a PROVEN omission, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ rows: [] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ни один не назван/, r.out);
    assert.match(r.out, /доказанный пропуск, а не неизвестность/, r.out);
  });

  test('P15 - an unrecognised value or a duplicate row is exit 2, never a pass', () => {
    for (const [field, bad] of [['trigger', 'кто-то'], ['auth', 'иногда'], ['unit', 'человек'],
      ['onLimit', 'подумаем']]) {
      const r = check({ [CONTRACT]: contract({ rows: withRow({ [field]: bad }) }) });
      assert.equal(r.code, 2, field + '=«' + bad + '» must not be read as a verdict: ' + r.out);
      assert.match(r.out, /допустимы ровно/, r.out);
    }
    for (const bad of ['возможно', '', 'yes']) {
      const r = check({ [CONTRACT]: contract({ calls: bad }) });
      assert.equal(r.code, 2, r.out);
    }
    const dupe = check({ [CONTRACT]: contract({ rows: [OUTSIDER, { ...OUTSIDER, perDay: '9' }] }) });
    assert.equal(dupe.code, 2, dupe.out);
    assert.match(dupe.out, /повторяются строки/, dupe.out);
  });

  test('P16 - cannot-check is NEVER clean: a bad path exits 2, not 0', () => {
    const r = spawnSync(process.execPath, [CHECK, path.join(os.tmpdir(), 'p-rep-cost-absent-dir')],
      { encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /проверка НЕ выполнена/, r.stdout);
  });
});

/**
 * The rule's FORCE, kept apart from its vocabulary.
 *
 * MEASURED on this package 2026-09-01 (commit 37916bd3): a suite of twelve keyword predicates over
 * the swarm receipt contract was fully satisfied by a block retitled "Coordination note" whose
 * imperative had been softened to "Where convenient" — the registered mutation SURVIVED. These
 * predicates are that lesson applied here: the heading must still refuse, each obligation must still
 * read as a duty, the closed set must still be closed, and the irreversibility must still be stated.
 */
function ruleForceProblems(text) {
  const problems = [];
  if (!/^## Правило №0 — несконфигурированный потолок ОТКАЗЫВАЕТ$/m.test(text)) {
    problems.push('the Правило №0 heading no longer refuses an unconfigured ceiling');
  }
  if (!/ОБЯЗАН валить запуск/.test(text)) {
    problems.push('the unconfigured-ceiling duty is advisory, not imperative');
  }
  if (!/Предел ОБЯЗАН быть назван числом, а не намерением/.test(text)) {
    problems.push('the ceiling may be an intention rather than a number');
  }
  if (!/Достижение предела есть ОТКАЗ, а не тихая деградация/.test(text)) {
    problems.push('reaching the ceiling may degrade instead of refusing');
  }
  if (!/Отказ, который НЕЛЬЗЯ ОТКАТИТЬ/.test(text)) {
    problems.push('the irreversibility that defines this class is gone');
  }
  if (!/набор ЗАКРЫТЫЙ/.test(text)) {
    problems.push('the two spend sources are a menu, not a closed set');
  }
  // Each source must arrive with WHO turns the meter — a source named without its actor is a label,
  // and a label cannot be recognised in the field.
  for (const [src, actor] of [['свой-код', /ваш цикл/], ['посторонний', /посетитель решает/]]) {
    if (!new RegExp('`' + src + '`').test(text)) problems.push(src + ' is not named');
    if (!actor.test(text)) problems.push(src + ' carries no actor');
  }
  if (!/место, где расход виден/.test(text)) problems.push('the spend has no named place');
  if (!/Слой 3–4/.test(text) || !/НЕ МОЖЕТ по названной причине/.test(text)) {
    problems.push('the layer marking hides what stays judgment');
  }
  if (!/Код `2` никогда не значит «всё в порядке»/.test(text)) {
    problems.push('exit 2 may be read as clean');
  }
  return problems;
}

describe('the rule still mandates, and the pipeline still calls the check', () => {
  test('P17 - the shipped rule satisfies every force predicate', () => {
    assert.deepEqual(ruleForceProblems(read('templates/.claude/rules/model-call-cost.md')), []);
  });

  test('P18 - MUTATION: a polite rephrasing must turn this suite red', () => {
    const source = read('templates/.claude/rules/model-call-cost.md');

    // Retitle only. Every keyword in the file survives; only the refusal in the heading is gone.
    const retitled = source.replace('## Правило №0 — несконфигурированный потолок ОТКАЗЫВАЕТ',
      '## Замечание о настройке потолка');
    assert.notEqual(retitled, source, 'mutation fixture did not apply — the heading moved');
    assert.deepEqual(ruleForceProblems(retitled),
      ['the Правило №0 heading no longer refuses an unconfigured ceiling'],
      'a retitled block must fire EXACTLY the heading predicate and nothing else');

    // Soften «обязан» to «желательно». This is the mutation that survived on the swarm contract.
    const softened = source.replace('ОБЯЗАН валить запуск', 'желательно останавливать запуск');
    assert.notEqual(softened, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(ruleForceProblems(softened),
      ['the unconfigured-ceiling duty is advisory, not imperative'],
      'softening the duty must fire EXACTLY the mandate predicate');

    // Downgrade the number requirement to a preference.
    const preference = source.replace('Предел ОБЯЗАН быть назван числом, а не намерением',
      'Предел желательно называть числом');
    assert.deepEqual(ruleForceProblems(preference),
      ['the ceiling may be an intention rather than a number'],
      'a downgraded ceiling requirement must fire EXACTLY its own predicate');

    // Turn the REFUSAL into a warning — the exact softening the brief names.
    const warning = source.replace('Достижение предела есть ОТКАЗ, а не тихая деградация',
      'Достижение предела стоит сопровождать предупреждением');
    assert.deepEqual(ruleForceProblems(warning),
      ['reaching the ceiling may degrade instead of refusing'],
      'downgrading ОТКАЗ to a warning must fire EXACTLY its own predicate');

    // Delete what makes this class different — the money that does not come back.
    const reversible = source.replace('Отказ, который НЕЛЬЗЯ ОТКАТИТЬ',
      'Неприятность, которую стоит учитывать');
    assert.deepEqual(ruleForceProblems(reversible),
      ['the irreversibility that defines this class is gone']);

    // And deleting the layer honesty must be observable on its own.
    const dishonest = source.replace('НЕ МОЖЕТ по названной причине', 'пока не сделана');
    assert.deepEqual(ruleForceProblems(dishonest), ['the layer marking hides what stays judgment']);
  });

  test('P19 - Phase 2 of /replicate calls the check as an acceptance criterion', () => {
    const cmd = read('templates/.claude/commands/replicate.md');
    assert.match(cmd, /node \.claude\/hooks\/check-model-cost\.cjs \./,
      'the pipeline must actually invoke it, not merely mention the rule');
    assert.match(cmd, /\.claude\/rules\/model-call-cost\.md/, 'the rule must be reachable from the seam');
    // Exit 2 must be spelled out at the seam too, or the operator reads silence as success.
    const seam = cmd.slice(cmd.indexOf('check-model-cost'));
    assert.match(seam.slice(0, 800), /это НЕ «в порядке»/, seam.slice(0, 800));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-model-cost\.cjs/, 'the hook inventory must list it');
  });

  test('P20 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-model-cost'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-model-cost'),
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

    const rules = statusline.match(/rulesExpected:\s*(\d+)/);
    assert.ok(rules, 'statusline must declare rulesExpected');
    const registry = JSON.parse(read('src/rule-components.json'));
    assert.ok(registry['model-call-cost'], 'the rule must be in the canonical registry');
    assert.equal(Number(rules[1]), Object.keys(registry).length,
      'the status line would report a phantom missing rule: ' + rules[1]);
    assert.equal(Number(rules[1]), Object.keys(COMPONENTS.rules.items).length);
  });

  test('P21 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'cost-cannot-check-is-not-clean': 'templates/.claude/hooks/check-model-cost.cjs',
      'cost-unit-must-exist-for-the-caller': 'templates/.claude/hooks/check-model-cost.cjs',
      'cost-unset-ceiling-is-not-infinity': 'templates/.claude/hooks/check-model-cost.cjs',
      'cost-rule-limit-is-a-number-and-a-refusal': 'templates/.claude/rules/model-call-cost.md',
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
