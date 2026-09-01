'use strict';

// The deterministic half of the incoming-webhooks rule. The rule itself is prose a model executes —
// layer 2. This is layer 1, and only for whoever runs it.
//
// THE DEFECT IT EXISTS FOR. A payment provider delivers ONE event MORE THAN ONCE by construction:
// its guarantee is at-least-once, never exactly-once. A handler with no repeat key credits the
// partner's commission twice, and nobody notices — each credit is a legitimate row on its own, so
// there is no error, no alert, no failing request. The same retry topology also delivers events OUT
// OF ORDER, which overwrites newer state with older, equally silently. And because the endpoint is
// public, an unsigned handler accepts a "payment succeeded" event from any stranger.
//
// Three sides are covered here, deliberately:
//   1. BEHAVIOUR — the real utility, real files, real exit codes (P1-P19)
//   2. FORCE     — the rule's text still MANDATES, not suggests (P20-P21); a polite rephrasing must
//                  turn this suite red, because a suite that tests a contract's VOCABULARY and not
//                  its FORCE has already been observed to pass an optional obligation on this
//                  package (commit 37916bd3)
//   3. WIRING    — the seam, the counters and the mutation registry agree (P22-P24)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-webhook-contract.cjs');
const CONTRACT = 'docs/webhook-contract.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

const CLASSES = ['подделка', 'повтор', 'перестановка'];
/** The three proof files a healthy contract points at. They must EXIST — that is the whole bite. */
const TESTS = {
  'подделка': 'tests/webhooks/test_signature.py',
  'повтор': 'tests/webhooks/test_redelivery.py',
  'перестановка': 'tests/webhooks/test_ordering.py',
};

/**
 * A contract in whatever state the case needs, written into a throwaway project together with the
 * test files it cites, and judged by the REAL checker.
 *
 * Defaults are the HEALTHY ones so every case stays about the single thing it changes; a case that
 * wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function contract({
  incoming = 'да', sender = 'Stripe', run = 'ВЫПОЛНЕНА', reason = null,
  key = 'event.id', source = 'событие-отправителя',
  store = 'таблица webhook_events, колонка event_id', exclusion = 'уникальный-индекс',
  signedOver = 'сырое-тело', signWhen = 'до-разбора', comparison = 'постоянное-время',
  window = '300', order = 'версия-из-события',
  rows = CLASSES.map((name) => ({ name, status: 'ЗАКРЫТ', evidence: TESTS[name] })),
} = {}) {
  const line = (label, value) => (value === null ? '' : '**' + label + ':** ' + value + '\n');
  return '# Webhook contract\n\n'
    + line('Входящие вебхуки', incoming)
    + line('Отправитель', sender)
    + line('Проверка повторной доставкой', run)
    + line('Причина', reason)
    + line('Ключ повторности', key)
    + line('Источник ключа', source)
    + line('Хранилище ключа', store)
    + line('Механизм исключения', exclusion)
    + line('Что подписано', signedOver)
    + line('Когда проверяется подпись', signWhen)
    + line('Сравнение подписи', comparison)
    + line('Окно свежести (секунды)', window)
    + line('Порядок событий', order)
    + '\n## Классы отказа\n\n'
    + '| Класс | Статус | Признак | Лечение | Доказательство |\n'
    + '|---|---|---|---|---|\n'
    + rows.map((r) => '| ' + r.name + ' | ' + r.status + ' | у владельца | лечение | '
      + r.evidence + ' |').join('\n') + (rows.length ? '\n' : '');
}

/** Build a throwaway project (contract + the cited test files) and run the REAL checker over it. */
function check(files, { withTests = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-webhook-')));
  try {
    if (withTests) {
      fs.mkdirSync(path.join(dir, 'tests', 'webhooks'), { recursive: true });
      for (const rel of Object.values(TESTS)) fs.writeFileSync(path.join(dir, rel), '# fixture\n');
    }
    for (const [rel, body] of Object.entries(files || {})) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

describe('the webhook-contract checker answers three questions and never confuses two of them', () => {
  test('P1 - a fully answered contract is exit 0, and the receipt states what it does NOT prove', () => {
    const r = check({ [CONTRACT]: contract() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /все 3 классов отказа закрыты/, r.out);
    assert.match(r.out, /event\.id/, 'the repeat key must be named back: ' + r.out);
    // Without this line a reader upgrades a declaration check into a proof that the handler is safe.
    assert.match(r.out, /Ограничение:/, r.out);
    assert.match(r.out, /дважды/, r.out);
  });

  test('P2 - no contract at all is exit 2, and the hint refuses the wrong reading', () => {
    const r = check({});
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/webhook-contract\.md/, r.out);
    // «no file» means the QUESTION was never asked — never «there are no webhooks».
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/, r.out);
  });

  test('P3 - «входящие вебхуки: нет» is a legitimate answer and exits 2, never 0', () => {
    const r = check({ [CONTRACT]: contract({ incoming: 'нет' }) });
    assert.equal(r.code, 2, 'a product nobody calls into has nothing to check: ' + r.out);
    assert.match(r.out, /законный ответ/, r.out);
  });

  test('P4 - a missing or unrecognised declaration is exit 2 with the closed set printed', () => {
    const absent = check({ [CONTRACT]: contract({ incoming: null }) });
    assert.equal(absent.code, 2, absent.out);
    assert.match(absent.out, /Входящие вебхуки/, absent.out);
    for (const bad of ['возможно', '', 'yes']) {
      const r = check({ [CONTRACT]: contract({ incoming: bad }) });
      assert.equal(r.code, 2, '«' + bad + '» must not be read as a verdict: ' + r.out);
      assert.match(r.out, /допустимы ровно/, r.out);
    }
  });

  test('P5 - «НЕ ВЫПОЛНЕНА» with a closed-list reason is honest UNKNOWN, exit 2', () => {
    const ok = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: 'no-test-harness' }) });
    assert.equal(ok.code, 2, ok.out);
    assert.match(ok.out, /НЕ ВОСПРОИЗВОДИЛАСЬ, причина: no-test-harness/, ok.out);
    assert.match(ok.out, /честное «неизвестно»/, ok.out);

    // A missing reason and a free-text reason are DIFFERENT mistakes with different repairs.
    const none = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: null }) });
    assert.equal(none.code, 2, none.out);
    assert.match(none.out, /без строки `\*\*Причина:\*\*`/, none.out);

    for (const bad of ['было некогда', 'no-providers', 'no-provider и out-of-scope']) {
      const r = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: bad }) });
      assert.equal(r.code, 2, r.out);
      assert.match(r.out, /не из закрытого списка/, '«' + bad + '»: ' + r.out);
    }
  });

  test('P6 - LOAD-BEARING: check-then-insert dedup is a PROVEN defect, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ exclusion: 'проверка-перед-вставкой' }) });
    assert.equal(r.code, 1, 'a read-then-write dedup must not read as verified: ' + r.out);
    // The reason must be the MECHANISM, not a scolding: two retries arrive CONCURRENTLY.
    assert.match(r.out, /ОДНОВРЕМЕННО/, r.out);
    assert.match(r.out, /уникальный индекс/, r.out);

    for (const good of ['уникальный-индекс', 'атомарная-вставка']) {
      assert.equal(check({ [CONTRACT]: contract({ exclusion: good }) }).code, 0, good);
    }
    // An unmapped spelling is refused, never silently read as one of the two atomic answers.
    const junk = check({ [CONTRACT]: contract({ exclusion: 'блокировка' }) });
    assert.equal(junk.code, 2, junk.out);
  });

  test('P7 - LOAD-BEARING: a key the RECEIVER invents can never recognise a repeat, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ source: 'сгенерирован-получателем' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /различно на каждой доставке/, r.out);
  });

  test('P8 - a key that cannot distinguish repeat from new is exit 1, in BOTH directions', () => {
    // Direction one: the value changes per delivery, so the repeat looks new — two commissions.
    for (const bad of ['event.created', 'received_at', 'Stripe-Signature timestamp']) {
      const r = check({ [CONTRACT]: contract({ key: bad }) });
      assert.equal(r.code, 1, '«' + bad + '» must not pass as a repeat key: ' + r.out);
      assert.match(r.out, /меняется при КАЖДОЙ доставке/, r.out);
    }
    // Direction two: the value is shared by two GENUINE events — the second real payment is eaten.
    for (const bad of ['amount', 'сумма платежа']) {
      const r = check({ [CONTRACT]: contract({ key: bad }) });
      assert.equal(r.code, 1, '«' + bad + '» must not pass as a repeat key: ' + r.out);
      assert.match(r.out, /ДВУХ настоящих событий/, r.out);
    }
    // BOUNDED: the blacklist is short on purpose — a check that refuses correct keys gets switched
    // off. Real sender-side identities must keep passing.
    for (const good of ['event.id', 'payment_intent.id', 'data.object.id', 'Idempotency-Key']) {
      assert.equal(check({ [CONTRACT]: contract({ key: good }) }).code, 0, good);
    }
  });

  test('P9 - a store INSIDE the process is exit 1, and Redis is not collateral damage', () => {
    for (const bad of ['множество в памяти процесса', 'глобальный словарь handled_ids']) {
      const r = check({ [CONTRACT]: contract({ store: bad }) });
      assert.equal(r.code, 1, '«' + bad + '» must not pass as a store: ' + r.out);
      assert.match(r.out, /невидим второй реплике/, r.out);
    }
    // BOUNDED: Redis IS an in-memory store and IS a correct answer — it is shared and it outlives a
    // request. Refusing it on the phrase «in-memory» would refuse the recommended configuration.
    for (const good of ['ключ webhook:{id} в Redis (in-memory), TTL 30 дней',
      'таблица webhook_events, колонка event_id']) {
      assert.equal(check({ [CONTRACT]: contract({ store: good }) }).code, 0, good);
    }
  });

  test('P10 - the three signature defects each fire on their own, exit 1', () => {
    const reparsed = check({ [CONTRACT]: contract({ signedOver: 'разобранное-тело' }) });
    assert.equal(reparsed.code, 1, reparsed.out);
    assert.match(reparsed.out, /не совпадёт НИКОГДА/, reparsed.out);

    const after = check({ [CONTRACT]: contract({ signWhen: 'после-разбора' }) });
    assert.equal(after.code, 1, after.out);
    assert.match(after.out, /прислал кто угодно/, after.out);

    const naive = check({ [CONTRACT]: contract({ comparison: 'обычное' }) });
    assert.equal(naive.code, 1, naive.out);
    assert.match(naive.out, /префикс угадан/, naive.out);
  });

  test('P11 - the freshness window is bounded on BOTH sides, and unparseable is exit 2', () => {
    for (const bad of ['нет', '0', '-5']) {
      const r = check({ [CONTRACT]: contract({ window: bad }) });
      assert.equal(r.code, 1, '«' + bad + '» must be a proven defect: ' + r.out);
    }
    const wide = check({ [CONTRACT]: contract({ window: '86400' }) });
    assert.equal(wide.code, 1, wide.out);
    assert.match(wide.out, /шире часа/, wide.out);

    // BOUNDED: everything up to an hour passes untouched, or the check refuses real configurations.
    for (const good of ['300', '900', '3600', '300 с']) {
      assert.equal(check({ [CONTRACT]: contract({ window: good }) }).code, 0, good);
    }
    // Unparseable is «could not check», not «violated» — different facts, different repairs.
    const junk = check({ [CONTRACT]: contract({ window: 'пять минут' }) });
    assert.equal(junk.code, 2, junk.out);
    assert.match(junk.out, /не разбирается как число/, junk.out);
    assert.equal(check({ [CONTRACT]: contract({ window: null }) }).code, 2);
  });

  test('P12 - «the sender guarantees order» is a PROVEN false belief, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ order: 'гарантирован-отправителем' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /порядок НЕ гарантирован/, r.out);
    // The mechanism must tie it to the SAME retry that produces duplicates, or a reader treats
    // ordering as an unrelated nicety and fixes only half the failure.
    assert.match(r.out, /тот же ретрай/, r.out);

    // Both legitimate answers stay reachable.
    for (const good of ['версия-из-события', 'перестановочен']) {
      assert.equal(check({ [CONTRACT]: contract({ order: good }) }).code, 0, good);
    }
  });

  test('P13 - a class left out of the table is a PROVEN omission and is NAMED', () => {
    for (const dropped of CLASSES) {
      const rows = CLASSES.filter((n) => n !== dropped)
        .map((name) => ({ name, status: 'ЗАКРЫТ', evidence: TESTS[name] }));
      const r = check({ [CONTRACT]: contract({ rows }) });
      assert.equal(r.code, 1, dropped + ' silently missing: ' + r.out);
      assert.match(r.out, new RegExp(dropped), 'the missing class must be named: ' + r.out);
    }
    const empty = check({ [CONTRACT]: contract({ rows: [] }) });
    assert.equal(empty.code, 1, empty.out);
    assert.match(empty.out, /3 из 3/, empty.out);
  });

  test('P14 - «НЕ ЗАКРЫТ» under a declared ВЫПОЛНЕНА is a contradiction, exit 1', () => {
    const rows = CLASSES.map((name, i) => ({
      name, status: i === 1 ? 'НЕ ЗАКРЫТ' : 'ЗАКРЫТ', evidence: TESTS[name],
    }));
    const r = check({ [CONTRACT]: contract({ rows }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /повтор/, r.out);
    assert.match(r.out, /ложная квитанция/, r.out);
  });

  test('P15 - a proof that names no test file is exit 1', () => {
    const rows = CLASSES.map((name) => ({ name, status: 'ЗАКРЫТ', evidence: 'проверено вручную' }));
    const r = check({ [CONTRACT]: contract({ rows }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /не называет файл теста/, r.out);
    for (const name of CLASSES) assert.match(r.out, new RegExp(name), r.out);

    // A design document is not a test, and the shipped template's placeholder is not a proof.
    const doc = check({
      [CONTRACT]: contract({ rows: CLASSES.map((name) => ({ name, status: 'ЗАКРЫТ', evidence: 'docs/design.md' })) }),
    });
    assert.equal(doc.code, 1, 'a document must not close a class: ' + doc.out);
    const tpl = check({
      [CONTRACT]: contract({ rows: CLASSES.map((name) => ({ name, status: 'ЗАКРЫТ', evidence: '[файл теста]' })) }),
    });
    assert.equal(tpl.code, 1, 'an untouched template must not pass: ' + tpl.out);
  });

  test('P16 - LOAD-BEARING: a named test file that does not exist is exit 1, not exit 2', () => {
    // We LOOKED. An absent file is a proven loss, not an unknown — that is the difference between
    // this and a proof written as prose, and it is the strongest bite a declaration checker has.
    const r = check({ [CONTRACT]: contract() }, { withTests: false });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /названный файл теста не существует/, r.out);
    assert.match(r.out, /tests\/webhooks\/test_redelivery\.py/, r.out);

    // Only the offending class is named when the others are real.
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-webhook-one-')));
    try {
      fs.mkdirSync(path.join(dir, 'tests', 'webhooks'), { recursive: true });
      for (const [name, rel] of Object.entries(TESTS)) {
        if (name !== 'повтор') fs.writeFileSync(path.join(dir, rel), '# fixture\n');
      }
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(dir, CONTRACT), contract());
      const one = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
      assert.equal(one.status, 1, one.stdout);
      assert.match(one.stdout, /повтор →/, one.stdout);
      assert.doesNotMatch(one.stdout, /• подделка →/, one.stdout);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P17 - a malformed table is exit 2, never a pass and never a proven loss', () => {
    const bogus = check({
      [CONTRACT]: contract({ rows: CLASSES.map((name) => ({ name, status: 'ок', evidence: TESTS[name] })) }),
    });
    assert.equal(bogus.code, 2, bogus.out);
    assert.match(bogus.out, /нераспознанный статус класса/, bogus.out);

    const dupe = check({
      [CONTRACT]: contract({
        rows: [...CLASSES, 'повтор'].map((name) => ({ name, status: 'ЗАКРЫТ', evidence: TESTS[name] })),
      }),
    });
    assert.equal(dupe.code, 2, dupe.out);
    assert.match(dupe.out, /повторяются строки/, dupe.out);
  });

  test('P18 - an unfilled required field is «not filled in», exit 2', () => {
    for (const field of ['sender', 'key', 'store']) {
      const missing = check({ [CONTRACT]: contract({ [field]: null }) });
      assert.equal(missing.code, 2, field + ' missing: ' + missing.out);
      const dash = check({ [CONTRACT]: contract({ [field]: '—' }) });
      assert.equal(dash.code, 2, field + ' dash: ' + dash.out);
      const tplRow = check({ [CONTRACT]: contract({ [field]: '[заполните]' }) });
      assert.equal(tplRow.code, 2, field + ' template: ' + tplRow.out);
    }
    // «Сделаем идемпотентно» is an intention, not a key — but it IS filled in, so it is not this
    // check's business; the closed-set and blacklist checks below it are. What matters here is only
    // that an EMPTY field never reads as an answered one.
    assert.equal(check({ [CONTRACT]: contract({ source: null }) }).code, 2);
    assert.equal(check({ [CONTRACT]: contract({ order: null }) }).code, 2);
  });

  test('P19 - cannot-check is NEVER clean: a bad path exits 2, not 0', () => {
    const r = spawnSync(process.execPath, [CHECK, path.join(os.tmpdir(), 'p-rep-webhook-absent-dir')],
      { encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /проверка НЕ выполнена/, r.stdout);
  });
});

/**
 * The rule's FORCE, kept apart from its vocabulary.
 *
 * MEASURED on this package 2026-09-01 (commit 37916bd3): twelve keyword predicates over the swarm
 * receipt contract were fully satisfied by a block retitled "Coordination note" whose imperative had
 * been softened to "Where convenient" — the registered mutation SURVIVED. These predicates are that
 * lesson applied here: the headings must still refuse, the obligations must still read as duties,
 * the closed set must still be mandatory, and the ORDERING half must still be inside the rule rather
 * than deferred to a backlog entry nobody will open.
 */
function ruleForceProblems(text) {
  const problems = [];
  if (!/^## Одна доставка — не одно событие$/m.test(text)) {
    problems.push('the heading no longer refuses the one-delivery reading');
  }
  if (!/Платёжные системы доставляют одно событие НЕСКОЛЬКО РАЗ по построению/.test(text)) {
    problems.push('at-least-once is presented as a possibility, not as the sender\'s contract');
  }
  if (!/Ключ повторности ОБЯЗАН быть НАЗВАН/.test(text)) {
    problems.push('the repeat key is advisory, not a named obligation');
  }
  // Naming the key without its STORE and its EXCLUSION closes nothing: «назовите поле» alone still
  // permits a per-process dict and a check-then-insert race.
  for (const [word, message] of [['ПОЛЕ', 'the key field is not required'],
    ['МЕСТО', 'the storage location is not required'],
    ['МЕХАНИЗМ', 'the exclusion mechanism is not required']]) {
    if (!new RegExp('\\*\\*' + word + '\\*\\*').test(text)) problems.push(message);
  }
  if (!/ОБЯЗАН быть атомарным/.test(text)) problems.push('the exclusion may be a read-then-write');
  if (!/^## Подпись проверяется ПЕРВОЙ$/m.test(text)) {
    problems.push('signature verification is no longer ordered first');
  }
  if (!/Четыре свойства\s*\nОБЯЗАТЕЛЬНЫ вместе|Четыре свойства ОБЯЗАТЕЛЬНЫ вместе/.test(text)) {
    problems.push('the four signature properties are a menu, not a conjunction');
  }
  if (!/^## Порядок доставки не гарантирован — и это ТА ЖЕ причина$/m.test(text)) {
    problems.push('the ordering half is no longer part of this rule');
  }
  if (!/Это часть правила, а не отдельная запись бэклога/.test(text)) {
    problems.push('the decision to keep ordering here is unrecorded and will be re-litigated');
  }
  if (!/Набор ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ/.test(text)) {
    problems.push('the three classes are a menu, not a mandatory set');
  }
  // Each class must arrive with the symptom the OWNER sees — a class named without its признак is a
  // label, and a label cannot be recognised in the field.
  for (const [cls, sign] of [['подделка', /кабинете отправителя/],
    ['повтор', /ДВЕ комиссии за один платёж/], ['перестановка', /«откатился» сам/]]) {
    if (!new RegExp('`' + cls + '`').test(text)) problems.push(cls + ' is not named');
    if (!sign.test(text)) problems.push(cls + ' carries no owner-visible symptom');
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
  test('P20 - the shipped rule satisfies every force predicate', () => {
    assert.deepEqual(ruleForceProblems(read('templates/.claude/rules/incoming-webhooks.md')), []);
  });

  test('P21 - MUTATION: a polite rephrasing must turn this suite red', () => {
    const source = read('templates/.claude/rules/incoming-webhooks.md');

    // Retitle only. Every keyword in the file survives; only the refusal in the heading is gone.
    const retitled = source.replace('## Одна доставка — не одно событие',
      '## Замечание о повторных доставках');
    assert.notEqual(retitled, source, 'mutation fixture did not apply — the heading moved');
    assert.deepEqual(ruleForceProblems(retitled),
      ['the heading no longer refuses the one-delivery reading'],
      'a retitled block must fire EXACTLY the heading predicate and nothing else');

    // Soften «ОБЯЗАН быть НАЗВАН» to a wish. This is the mutation that survived on the swarm
    // contract: every keyword stays, only the duty is gone.
    const softened = source.replace('**Ключ повторности ОБЯЗАН быть НАЗВАН, а не подразумеваться.**',
      '**Ключ повторности желательно назвать.**');
    assert.notEqual(softened, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(ruleForceProblems(softened),
      ['the repeat key is advisory, not a named obligation'],
      'softening the duty must fire EXACTLY the mandate predicate');

    // Downgrade the atomicity requirement — the exact defect P6 refuses at runtime.
    const racy = source.replace('ОБЯЗАН быть атомарным', 'лучше сделать атомарным');
    assert.deepEqual(ruleForceProblems(racy), ['the exclusion may be a read-then-write'],
      'a downgraded exclusion must fire EXACTLY its own predicate');

    // Downgrade the closed set to a suggestion.
    const optional = source.replace('Набор ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ', 'Набор рекомендуемый');
    assert.deepEqual(ruleForceProblems(optional),
      ['the three classes are a menu, not a mandatory set']);

    // Move the ordering half out to a backlog entry — the split this rule deliberately refuses.
    const split = source.replace('## Порядок доставки не гарантирован — и это ТА ЖЕ причина',
      '## Порядок доставки (вынесено в бэклог)');
    assert.deepEqual(ruleForceProblems(split),
      ['the ordering half is no longer part of this rule']);

    // And deleting the layer honesty must be observable on its own.
    const dishonest = source.replace('НЕ МОЖЕТ по названной причине', 'пока не сделана');
    assert.deepEqual(ruleForceProblems(dishonest), ['the layer marking hides what stays judgment']);
  });

  test('P22 - Phase 2 of /replicate calls the check as an acceptance criterion', () => {
    const cmd = read('templates/.claude/commands/replicate.md');
    assert.match(cmd, /node \.claude\/hooks\/check-webhook-contract\.cjs \./,
      'the pipeline must actually invoke it, not merely mention the rule');
    assert.match(cmd, /\.claude\/rules\/incoming-webhooks\.md/, 'the rule must be reachable from the seam');
    // Exit 2 must be spelled out at the seam too, or the operator reads silence as success.
    const seam = cmd.slice(cmd.indexOf('check-webhook-contract'));
    assert.match(seam.slice(0, 600), /это НЕ «в порядке»/, seam.slice(0, 600));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-webhook-contract\.cjs/, 'the hook inventory must list it');
  });

  test('P23 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-webhook-contract'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-webhook-contract'),
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
    assert.ok(registry['incoming-webhooks'], 'the rule must be in the canonical registry');
    assert.equal(Number(rules[1]), Object.keys(registry).length,
      'the status line would report a phantom missing rule: ' + rules[1]);
    assert.equal(Number(rules[1]), Object.keys(COMPONENTS.rules.items).length);
    const ruleFiles = fs.readdirSync(path.join(TPL, 'rules')).filter((f) => f.endsWith('.md'));
    assert.equal(ruleFiles.length, Object.keys(registry).length,
      'the shipped rules directory and the registry disagree: ' + ruleFiles.join(', '));
  });

  test('P24 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'webhook-cannot-check-is-not-clean': 'templates/.claude/hooks/check-webhook-contract.cjs',
      'webhook-check-then-insert-is-a-race': 'templates/.claude/hooks/check-webhook-contract.cjs',
      'webhook-named-test-file-must-exist': 'templates/.claude/hooks/check-webhook-contract.cjs',
      'webhook-rule-repeat-key-must-be-named': 'templates/.claude/rules/incoming-webhooks.md',
      'webhook-rule-ordering-stays-in-this-rule': 'templates/.claude/rules/incoming-webhooks.md',
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
      // The anchor must be UNIQUE in the file it mutates, or the registered mutation is not the one
      // that would be applied.
      const target = read(entry.file);
      assert.equal(target.split(entry.mutation.find).length - 1, 1,
        id + ': mutation anchor must occur exactly once');
    }
  });
});
