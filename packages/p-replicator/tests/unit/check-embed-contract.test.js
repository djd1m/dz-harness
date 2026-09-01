'use strict';

// The deterministic half of the embeddable-widget rule. The rule itself is prose a model executes —
// layer 2. This is layer 1, and only for whoever runs it.
//
// THE DEFECT IT EXISTS FOR. A widget runs on SOMEONE ELSE'S page, and the three ways it dies there
// all have their conditions on that page: the client's browser refuses the cross-origin call, the
// host's CSS reaches into the widget, the host's Content-Security-Policy refuses the script. Test on
// your own page and none of the three CAN occur — same-origin has no preflight, your page ships no
// hostile CSS and no CSP. So a fully green check at home and an outage at the client are not a
// contradiction: they are the same measurement of the wrong page.
//
// Three sides are covered here, deliberately:
//   1. BEHAVIOUR  — the real utility, real files, real exit codes (P1-P17)
//   2. FORCE      — the rule's text still MANDATES, not suggests (P18-P19); a polite rephrasing
//                   must turn this suite red, because a suite that tests a contract's VOCABULARY
//                   and not its FORCE has already been observed to pass an optional obligation
//   3. WIRING     — the seam, the counters and the mutation registry agree (P20-P22)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-embed-contract.cjs');
const CONTRACT = 'docs/embed-contract.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run the REAL checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-embed-')));
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

const WIDGET = 'https://widget.example.com';
const HOST = 'http://localhost:8099';
const CLASSES = ['перекрёстный-запрос', 'протечка-стилей', 'политика-безопасности'];

/**
 * A contract in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function contract({
  embeddable = 'да', widget = WIDGET, host = HOST, credentials = 'нет',
  allowed = 'https://client-one.example', run = 'ВЫПОЛНЕНА', reason = null,
  rows = CLASSES.map((name) => ({ name, status: 'ПРОВЕРЕН', evidence: HOST + '/host.html, 2026-09-01' })),
} = {}) {
  const line = (label, value) => (value === null ? '' : '**' + label + ':** ' + value + '\n');
  return '# Embed contract\n\n'
    + line('Встраиваемый виджет', embeddable)
    + line('Origin виджета', widget)
    + line('Origin хозяйской страницы', host)
    + line('Учётные данные', credentials)
    + line('Разрешённые origin', allowed)
    + line('Проверка на чужой странице', run)
    + line('Причина', reason)
    + '\n## Классы отказа\n\n'
    + '| Класс | Статус | Признак | Лечение | Доказательство |\n'
    + '|---|---|---|---|---|\n'
    + rows.map((r) => '| ' + r.name + ' | ' + r.status + ' | консоль клиента | изоляция | '
      + r.evidence + ' |').join('\n') + (rows.length ? '\n' : '');
}

describe('the embed-contract checker answers three questions and never confuses two of them', () => {
  test('P1 - a widget proven on a foreign origin is exit 0, and both origins are printed', () => {
    const r = check({ [CONTRACT]: contract() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /все 3 классов отказа проверены на чужом origin/, r.out);
    assert.match(r.out, /http:\/\/localhost:8099/, 'the foreign origin must be named: ' + r.out);
    assert.match(r.out, /https:\/\/widget\.example\.com/, r.out);
    // The receipt must state what it does NOT prove, or a reader upgrades it into a rendering proof.
    assert.match(r.out, /Ограничение:/, r.out);
  });

  test('P2 - no contract at all is exit 2, and the hint refuses the wrong reading', () => {
    const r = check({});
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/embed-contract\.md/, r.out);
    // «no file» means the QUESTION was never asked — never «there is no widget».
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/, r.out);
  });

  test('P3 - «виджет: нет» is a legitimate answer and exits 2, never 0', () => {
    const r = check({ [CONTRACT]: contract({ embeddable: 'нет' }) });
    assert.equal(r.code, 2, 'a product that does not embed has nothing to check: ' + r.out);
    assert.match(r.out, /законный ответ/, r.out);
  });

  test('P4 - a missing or unrecognised declaration is exit 2 with the closed set printed', () => {
    const absent = check({ [CONTRACT]: contract({ embeddable: null }) });
    assert.equal(absent.code, 2, absent.out);
    assert.match(absent.out, /Встраиваемый виджет/, absent.out);

    for (const bad of ['возможно', '', 'yes']) {
      const r = check({ [CONTRACT]: contract({ embeddable: bad }) });
      assert.equal(r.code, 2, '«' + bad + '» must not be read as a verdict: ' + r.out);
      assert.match(r.out, /допустимы ровно/, r.out);
    }
  });

  test('P5 - «НЕ ВЫПОЛНЕНА» with a closed-list reason is honest UNKNOWN, exit 2', () => {
    const ok = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: 'no-host-page' }) });
    assert.equal(ok.code, 2, ok.out);
    assert.match(ok.out, /НЕ ВЫПОЛНЕНА, причина: no-host-page/, ok.out);
    assert.match(ok.out, /честное «неизвестно»/, ok.out);

    // A missing reason and a free-text reason are DIFFERENT mistakes with different repairs.
    const none = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: null }) });
    assert.equal(none.code, 2, none.out);
    assert.match(none.out, /без строки `\*\*Причина:\*\*`/, none.out);

    for (const bad of ['было некогда', 'no-host-pages', 'no-browser и not-deployed']) {
      const r = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: bad }) });
      assert.equal(r.code, 2, r.out);
      assert.match(r.out, /не из закрытого списка/, '«' + bad + '»: ' + r.out);
    }
  });

  test('P6 - LOAD-BEARING: a check on your OWN origin is a PROVEN defect, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ host: WIDGET + '/demo.html' }) });
    assert.equal(r.code, 1, 'same-origin must not read as verified: ' + r.out);
    assert.match(r.out, /на СВОЁМ origin/, r.out);
    // The reason must be the MECHANISM, not a scolding: none of the three failures can occur there.
    assert.match(r.out, /НИ ОДИН из трёх классов отказа/, r.out);
  });

  test('P7 - a different PORT is already a foreign origin, and stays reachable', () => {
    // The exception must remain usable, or the check degenerates into a permanent 1 nobody can
    // clear: an honest host fixture on localhost:8099 against a widget on localhost:3000 does
    // trigger a real preflight, and that is the browser's own definition of another site.
    const r = check({
      [CONTRACT]: contract({
        widget: 'http://localhost:3000', host: 'http://localhost:8099',
        rows: CLASSES.map((name) => ({ name, status: 'ПРОВЕРЕН', evidence: 'http://localhost:8099/host.html' })),
      }),
    });
    assert.equal(r.code, 0, r.out);

    // ...and the default port is normalised, so https://x:443 is not a second origin.
    const same = check({
      [CONTRACT]: contract({
        widget: 'https://widget.example.com', host: 'https://Widget.example.com:443/host.html',
      }),
    });
    assert.equal(same.code, 1, 'the default port must not manufacture a foreign origin: ' + same.out);
  });

  test('P8 - a file:// page is the wrong instrument, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ host: 'file:///tmp/host.html' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /file:\/\//, r.out);
    assert.match(r.out, /origin равен null/, 'the reason must be the mechanism: ' + r.out);
  });

  test('P9 - a class left out of the table is a PROVEN omission and is NAMED', () => {
    for (const dropped of CLASSES) {
      const rows = CLASSES.filter((n) => n !== dropped)
        .map((name) => ({ name, status: 'ПРОВЕРЕН', evidence: HOST + '/host.html' }));
      const r = check({ [CONTRACT]: contract({ rows }) });
      assert.equal(r.code, 1, dropped + ' silently missing: ' + r.out);
      assert.match(r.out, new RegExp(dropped), 'the missing class must be named: ' + r.out);
    }
    const empty = check({ [CONTRACT]: contract({ rows: [] }) });
    assert.equal(empty.code, 1, empty.out);
    assert.match(empty.out, /3 из 3/, empty.out);
  });

  test('P10 - «НЕ ПРОВЕРЕН» under a declared ВЫПОЛНЕНА is a contradiction, exit 1', () => {
    const rows = CLASSES.map((name, i) => ({
      name, status: i === 2 ? 'НЕ ПРОВЕРЕН' : 'ПРОВЕРЕН', evidence: HOST + '/host.html',
    }));
    const r = check({ [CONTRACT]: contract({ rows }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /политика-безопасности/, r.out);
    assert.match(r.out, /ложная квитанция/, r.out);
  });

  test('P11 - «ПРОВЕРЕН» whose proof names NO address is exit 1', () => {
    // The kinship with the measured deployment finding: a check must use the address the system
    // ISSUED. Without an address, "checked at the client" and "checked at home" are written the same.
    const rows = CLASSES.map((name) => ({ name, status: 'ПРОВЕРЕН', evidence: 'проверено вручную' }));
    const r = check({ [CONTRACT]: contract({ rows }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не называет адрес/, r.out);
    for (const name of CLASSES) assert.match(r.out, new RegExp(name), r.out);

    // The shipped template's bracketed placeholder counts as NO proof, never as a filled one.
    const tpl = check({
      [CONTRACT]: contract({ rows: CLASSES.map((name) => ({ name, status: 'ПРОВЕРЕН', evidence: '[адрес]' })) }),
    });
    assert.equal(tpl.code, 1, 'an untouched template must not pass: ' + tpl.out);
  });

  test('P12 - a proof pointing back at the widget\'s own origin is exit 1', () => {
    const rows = CLASSES.map((name, i) => ({
      name, status: 'ПРОВЕРЕН',
      evidence: (i === 1 ? WIDGET + '/demo.html' : HOST + '/host.html'),
    }));
    const r = check({ [CONTRACT]: contract({ rows }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /указывает на СВОЙ origin/, r.out);
    assert.match(r.out, /протечка-стилей/, 'only the offending class is named: ' + r.out);
    assert.doesNotMatch(r.out, /• перекрёстный-запрос/, r.out);
  });

  test('P13 - credentials together with `*` is a pair the browser itself refuses, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ credentials: 'да', allowed: '*' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /браузер отвергает сам/, r.out);
  });

  test('P14 - BOUNDED: a wildcard WITHOUT credentials is legal and must stay exit 0', () => {
    // Widening this to "any wildcard is a defect" would refuse a legitimate public read-only widget,
    // and a check that refuses the correct configuration gets switched off.
    const r = check({ [CONTRACT]: contract({ credentials: 'нет', allowed: '*' }) });
    assert.equal(r.code, 0, r.out);
    const named = check({ [CONTRACT]: contract({ credentials: 'да', allowed: 'https://client-one.example' }) });
    assert.equal(named.code, 0, named.out);
  });

  test('P15 - an absent or unparseable origin is «could not check», exit 2', () => {
    for (const field of ['widget', 'host']) {
      const missing = check({ [CONTRACT]: contract({ [field]: null }) });
      assert.equal(missing.code, 2, field + ' missing: ' + missing.out);
      const junk = check({ [CONTRACT]: contract({ [field]: 'наш стенд' }) });
      assert.equal(junk.code, 2, field + ' unparseable: ' + junk.out);
      assert.match(junk.out, /не разбирается как адрес/, junk.out);
    }
    const noAllowed = check({ [CONTRACT]: contract({ allowed: null }) });
    assert.equal(noAllowed.code, 2, noAllowed.out);
  });

  test('P16 - a malformed table is exit 2, never a pass and never a proven loss', () => {
    const bogus = check({
      [CONTRACT]: contract({
        rows: CLASSES.map((name) => ({ name, status: 'ок', evidence: HOST + '/h.html' })),
      }),
    });
    assert.equal(bogus.code, 2, bogus.out);
    assert.match(bogus.out, /нераспознанный статус класса/, bogus.out);

    const dupe = check({
      [CONTRACT]: contract({
        rows: [...CLASSES, 'протечка-стилей']
          .map((name) => ({ name, status: 'ПРОВЕРЕН', evidence: HOST + '/h.html' })),
      }),
    });
    assert.equal(dupe.code, 2, dupe.out);
    assert.match(dupe.out, /повторяются строки/, dupe.out);
  });

  test('P17 - cannot-check is NEVER clean: a bad path exits 2, not 0', () => {
    const r = spawnSync(process.execPath, [CHECK, path.join(os.tmpdir(), 'p-rep-embed-absent-dir')],
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
 * predicates are that lesson applied here: the heading must still refuse, the obligation must still
 * read as a duty, and the closed set must still be mandatory.
 */
function ruleForceProblems(text) {
  const problems = [];
  if (!/^## Своя страница — не проверка$/m.test(text)) {
    problems.push('the heading no longer refuses the own-page check');
  }
  if (!/ОБЯЗАНА выполняться на странице ЧУЖОГО origin/.test(text)) {
    problems.push('the obligation is advisory, not imperative');
  }
  if (!/«Открыли свою демо-страницу[^»]*»\s*—\s*НЕ проверка/.test(text)) {
    problems.push('the own-page demo is not named insufficient');
  }
  if (!/Набор ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ/.test(text)) {
    problems.push('the three classes are a menu, not a mandatory set');
  }
  // Each class must arrive with the symptom the CLIENT sees — a class named without its признак is
  // a label, and a label cannot be recognised in the field.
  for (const [cls, sign] of [['перекрёстный-запрос', /blocked by CORS policy/],
    ['протечка-стилей', /z-index/], ['политика-безопасности', /Refused to load/]]) {
    if (!new RegExp('`' + cls + '`').test(text)) problems.push(cls + ' is not named');
    if (!sign.test(text)) problems.push(cls + ' carries no client-side symptom');
  }
  if (!/Слой 3–4/.test(text) || !/НЕ МОЖЕТ по названной причине/.test(text)) {
    problems.push('the layer marking hides what stays judgment');
  }
  if (!/Код `2` никогда не значит «всё в порядке»/.test(text)) {
    problems.push('exit 2 may be read as clean');
  }
  return problems;
}

describe('the rule still mandates, and the pipeline still calls the check', () => {
  test('P18 - the shipped rule satisfies every force predicate', () => {
    assert.deepEqual(ruleForceProblems(read('templates/.claude/rules/embeddable-widget.md')), []);
  });

  test('P19 - MUTATION: a polite rephrasing must turn this suite red', () => {
    const source = read('templates/.claude/rules/embeddable-widget.md');

    // Retitle only. Every keyword in the file survives; only the refusal in the heading is gone.
    const retitled = source.replace('## Своя страница — не проверка', '## Замечание о демо-странице');
    assert.notEqual(retitled, source, 'mutation fixture did not apply — the heading moved');
    assert.deepEqual(ruleForceProblems(retitled),
      ['the heading no longer refuses the own-page check'],
      'a retitled block must fire EXACTLY the heading predicate and nothing else');

    // Soften «обязана» to «желательно». This is the mutation that survived on the swarm contract.
    const softened = source.replace('ОБЯЗАНА выполняться на странице ЧУЖОГО origin',
      'желательно выполнять на странице чужого origin');
    assert.notEqual(softened, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(ruleForceProblems(softened),
      ['the obligation is advisory, not imperative'],
      'softening the duty must fire EXACTLY the mandate predicate');

    // Downgrade the closed set to a suggestion.
    const optional = source.replace('Набор ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ',
      'Набор рекомендуемый');
    assert.deepEqual(ruleForceProblems(optional),
      ['the three classes are a menu, not a mandatory set'],
      'a downgraded set must fire EXACTLY its own predicate');

    // And deleting the layer honesty must be observable on its own.
    const dishonest = source.replace('НЕ МОЖЕТ по названной причине', 'пока не сделана');
    assert.deepEqual(ruleForceProblems(dishonest), ['the layer marking hides what stays judgment']);
  });

  test('P20 - Phase 2 of /replicate calls the check as an acceptance criterion', () => {
    const cmd = read('templates/.claude/commands/replicate.md');
    assert.match(cmd, /node \.claude\/hooks\/check-embed-contract\.cjs \./,
      'the pipeline must actually invoke it, not merely mention the rule');
    assert.match(cmd, /\.claude\/rules\/embeddable-widget\.md/, 'the rule must be reachable from the seam');
    // Exit 2 must be spelled out at the seam too, or the operator reads silence as success.
    assert.match(cmd, /это НЕ «в порядке»/, cmd.slice(cmd.indexOf('check-embed-contract'), -1).slice(0, 600));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-embed-contract\.cjs/, 'the hook inventory must list it');
    // DERIVED, never literal. Three hardcoded counts used to stand here, and a hardcoded count is
    // exactly the shape that split in half on 2026-09-01: a number whose only guard is a reader.
    // The shipped directory and the canonical registry cannot be wrong about their own size, so
    // the inventory prose is compared against THEM — which is also what makes this assertion
    // survive the next hook without an edit, instead of failing for being right.
    const shippedRules = Object.keys(JSON.parse(read('src/rule-components.json'))).length;
    const shippedHooks = fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs')).length;
    const WIRED_TO_EVENTS = 4;   // session-insights + the three autocommit hooks, per settings.json
    assert.match(rule, new RegExp('\\*\\*Rules \\(' + shippedRules + '\\):\\*\\*'),
      'the rule inventory must count what the registry actually carries (' + shippedRules + ')');
    assert.match(rule, new RegExp('\\*\\*Hooks \\(' + shippedHooks + ' files'),
      'the hook inventory must count what the package actually ships (' + shippedHooks + ')');
    assert.match(rule, new RegExp('wired to nothing \\(' + (shippedHooks - WIRED_TO_EVENTS) + '\\):'),
      'the deliberately-invoked count must equal the shipped total minus the four event hooks');
  });

  test('P21 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-embed-contract'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-embed-contract'),
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

    // The rule counter has the same three-way agreement, and this change moved it too.
    const rules = statusline.match(/rulesExpected:\s*(\d+)/);
    assert.ok(rules, 'statusline must declare rulesExpected');
    const registry = JSON.parse(read('src/rule-components.json'));
    assert.ok(registry['embeddable-widget'], 'the rule must be in the canonical registry');
    assert.equal(Number(rules[1]), Object.keys(registry).length,
      'the status line would report a phantom missing rule: ' + rules[1]);
    assert.equal(Number(rules[1]), Object.keys(COMPONENTS.rules.items).length);
  });

  test('P22 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'embed-cannot-check-is-not-clean': 'templates/.claude/hooks/check-embed-contract.cjs',
      'embed-own-origin-is-not-a-foreign-page': 'templates/.claude/hooks/check-embed-contract.cjs',
      'embed-rule-own-page-is-not-a-check': 'templates/.claude/rules/embeddable-widget.md',
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
    }
  });
});
