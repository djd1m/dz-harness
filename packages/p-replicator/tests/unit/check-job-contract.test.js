'use strict';

// The deterministic half of the long-running-job rule. The rule itself is prose a model executes —
// layer 2. This is layer 1, and only for whoever runs it.
//
// THE DEFECT IT EXISTS FOR. Some work takes MINUTES: transcribe an hour of audio and cut it,
// generate an image. A plain request-response cannot carry that, and the three ways it breaks are
// one confusion wearing three coats — NO ANSWER and STILL RUNNING are different facts, and a design
// that spells them identically cannot tell them apart afterwards. Silence is produced EQUALLY by a
// live job, a dead worker and a severed proxy: the request dies at the intermediary's idle timeout
// while the work completes (the user is charged and shown an error), the retry restarts instead of
// continuing (the external bill doubles), and the user who can see no state presses the button again.
//
// Three sides are covered here, deliberately:
//   1. BEHAVIOUR  — the real utility, real files, real exit codes (P1-P17)
//   2. FORCE      — the rule's text still MANDATES, not suggests (P18-P19); a polite rephrasing
//                   must turn this suite red, because a suite that tests a contract's VOCABULARY
//                   and not its FORCE has already been observed to pass an optional obligation
//                   (MEASURED on this package, commit 37916bd3)
//   3. WIRING     — the seam, the counters and the mutation registry agree (P20-P22)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-job-contract.cjs');
const CONTRACT = 'docs/long-job-contract.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Build a throwaway project and run the REAL checker over it. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-job-')));
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

const ID = 'job_id';
const STATES = ['выполняется', 'успех', 'отказ'];
const SEEN = {
  'выполняется': '«идёт нарезка, 2 из 7»',
  'успех': 'список готовых клипов со ссылками',
  'отказ': '«не удалось: ffmpeg код 1» и кнопка «повторить»',
};
const PROOF = 'GET /api/jobs/j-42 → 200, job_id=j-42, 2026-09-01';
const healthyRows = () => STATES.map((name) => ({ name, status: 'ПРОВЕРЕН', seen: SEEN[name], evidence: PROOF }));

/**
 * A contract in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function contract({
  long = 'да', id = ID,
  lives = 'ответ `POST /api/clips` → поле `job_id`; чтение `GET /api/jobs/{job_id}`',
  issued = 'до начала работы', create = 'идентификатор', ceiling = '15 мин', window = '60 с',
  silence = 'неизвестно', resume = 'идемпотентный-ключ', run = 'ВЫПОЛНЕНА', reason = null,
  rows = healthyRows(),
} = {}) {
  const line = (label, value) => (value === null ? '' : '**' + label + ':** ' + value + '\n');
  return '# Контракт долгой задачи\n\n'
    + line('Долгие задачи', long)
    + line('Идентификатор задачи', id)
    + line('Где живёт', lives)
    + line('Выдаётся', issued)
    + line('Ответ на создание', create)
    + line('Предельное время задачи', ceiling)
    + line('Таймаут посредника', window)
    + line('Молчание', silence)
    + line('Продолжение при повторе', resume)
    + line('Проверка выполнена', run)
    + line('Причина', reason)
    + '\n## Состояния\n\n'
    + '| Состояние | Статус | Что видит пользователь | Доказательство |\n'
    + '|---|---|---|---|\n'
    + rows.map((r) => '| ' + r.name + ' | ' + r.status + ' | ' + r.seen + ' | ' + r.evidence + ' |')
      .join('\n') + (rows.length ? '\n' : '');
}

describe('the long-job checker answers three questions and never confuses two of them', () => {
  test('P1 - a contract with a handle, three states and a resuming retry is exit 0', () => {
    const r = check({ [CONTRACT]: contract() });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /все 3 состояния различимы и проверены по идентификатору `job_id`/, r.out);
    assert.match(r.out, /выдаётся ДО начала работы/, r.out);
    // Both durations are printed next to the verdict, always — see P14.
    assert.match(r.out, /потолок 15 мин против окна 60 с/, r.out);
    // The receipt must state what it does NOT prove, or a reader upgrades it into a survival proof.
    assert.match(r.out, /Ограничение:/, r.out);
  });

  test('P2 - no contract at all is exit 2, and the hint refuses the wrong reading', () => {
    const r = check({});
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/long-job-contract\.md/, r.out);
    // «no file» means the QUESTION was never asked — never «there is no long work».
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/, r.out);
  });

  test('P3 - «долгие задачи: нет» is a legitimate answer and exits 2, never 0', () => {
    const r = check({ [CONTRACT]: contract({ long: 'нет' }) });
    assert.equal(r.code, 2, 'a product with no long work has nothing to check: ' + r.out);
    assert.match(r.out, /законный ответ/, r.out);
  });

  test('P4 - a missing or unrecognised declaration is exit 2 with the closed set printed', () => {
    const absent = check({ [CONTRACT]: contract({ long: null }) });
    assert.equal(absent.code, 2, absent.out);
    assert.match(absent.out, /Долгие задачи/, absent.out);

    for (const bad of ['иногда', '', 'yes']) {
      const r = check({ [CONTRACT]: contract({ long: bad }) });
      assert.equal(r.code, 2, '«' + bad + '» must not be read as a verdict: ' + r.out);
      assert.match(r.out, /допустимы ровно/, r.out);
    }
  });

  test('P5 - «НЕ ВЫПОЛНЕНА» with a closed-list reason is honest UNKNOWN, exit 2', () => {
    const ok = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: 'no-worker' }) });
    assert.equal(ok.code, 2, ok.out);
    assert.match(ok.out, /НЕ ВЫПОЛНЕНА, причина: no-worker/, ok.out);
    assert.match(ok.out, /честное «неизвестно»/, ok.out);

    // A missing reason and a free-text reason are DIFFERENT mistakes with different repairs.
    const none = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: null }) });
    assert.equal(none.code, 2, none.out);
    assert.match(none.out, /без строки `\*\*Причина:\*\*`/, none.out);

    for (const bad of ['было некогда', 'no-workers', 'no-worker и not-deployed']) {
      const r = check({ [CONTRACT]: contract({ run: 'НЕ ВЫПОЛНЕНА', reason: bad }) });
      assert.equal(r.code, 2, r.out);
      assert.match(r.out, /не из закрытого списка/, '«' + bad + '»: ' + r.out);
    }
  });

  test('P6 - LOAD-BEARING: silence declared as «выполняется» is a PROVEN defect, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ silence: 'выполняется' }) });
    assert.equal(r.code, 1, 'silence must not be readable as a state: ' + r.out);
    assert.match(r.out, /молчание объявлено состоянием «выполняется»/, r.out);
    // The reason must be the MECHANISM: three different facts are silent in exactly the same way.
    assert.match(r.out, /умерший исполнитель и оборванный посредник молчат ОДИНАКОВО/, r.out);
    assert.match(r.out, /`job_id`/, 'the identifier is what tells them apart: ' + r.out);
  });

  test('P7 - an identifier issued only WITH the result is exit 1', () => {
    const r = check({ [CONTRACT]: contract({ issued: 'после завершения' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /идентификатор выдаётся только вместе с результатом/, r.out);
    assert.match(r.out, /деньги за внешние вызовы уже потрачены/, r.out);
  });

  test('P8 - a retry that RESTARTS is failure class 2, declared and named, exit 1', () => {
    const r = check({ [CONTRACT]: contract({ resume: 'нет' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /повтор начинает работу заново/, r.out);
    assert.match(r.out, /идемпотентный-ключ \| запись-в-хранилище \| аренда-исполнителя/, r.out);
    // The webhook kinship is NAMED at the seam and the mechanism is kept distinct — the inbound
    // half belongs to the neighbouring rule and is not restated here.
    assert.match(r.out, /ВХОДЯЩИХ вебхуков — соседнее правило/, r.out);

    for (const good of ['идемпотентный-ключ', 'запись-в-хранилище', 'аренда-исполнителя']) {
      assert.equal(check({ [CONTRACT]: contract({ resume: good }) }).code, 0, good);
    }
    const bogus = check({ [CONTRACT]: contract({ resume: 'как-нибудь' }) });
    assert.equal(bogus.code, 2, 'an unmapped mechanism is «could not check», not a pass: ' + bogus.out);
  });

  test('P9 - a synchronous answer to work longer than the window is exit 1', () => {
    const r = check({ [CONTRACT]: contract({ create: 'результат' }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ответом на создание объявлен РЕЗУЛЬТАТ/, r.out);
    // Both numbers, in seconds, so the comparison is auditable and not taken on trust.
    assert.match(r.out, /15 мин \(900 с\)/, r.out);
    assert.match(r.out, /60 с \(60 с\)/, r.out);
  });

  test('P10 - BOUNDED: a synchronous answer is legal when the work fits inside the window', () => {
    // Widening this to "any synchronous answer is a defect" would refuse the correct configuration
    // of every product with one slow-ish endpoint, and a check that refuses the correct
    // configuration gets switched off. The escape it leaves is VISIBLE: both numbers are printed.
    const r = check({ [CONTRACT]: contract({ create: 'результат', ceiling: '3 с' }) });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Ограниченное исключение/, r.out);
    assert.match(r.out, /3 с < 60 с/, r.out);
    assert.match(r.out, /Занижённый потолок — ложь в самой\s+декларации/, r.out);
  });

  test('P11 - a duration without a unit is «could not check», exit 2', () => {
    for (const field of ['ceiling', 'window']) {
      const bare = check({ [CONTRACT]: contract({ [field]: '60' }) });
      assert.equal(bare.code, 2, field + ' bare number: ' + bare.out);
      assert.match(bare.out, /не разбирается как длительность/, bare.out);
      const junk = check({ [CONTRACT]: contract({ [field]: 'долго' }) });
      assert.equal(junk.code, 2, field + ' junk: ' + junk.out);
      const missing = check({ [CONTRACT]: contract({ [field]: null }) });
      assert.equal(missing.code, 2, field + ' missing: ' + missing.out);
    }
    // ...and the units that ARE recognised must keep the check usable.
    assert.equal(check({ [CONTRACT]: contract({ ceiling: '2 ч', window: '30 сек' }) }).code, 0);
    assert.equal(check({ [CONTRACT]: contract({ ceiling: '1,5 мин', window: '60 s' }) }).code, 0);
  });

  test('P12 - the identifier must be a FIELD NAME, and its home must mention it', () => {
    const described = check({ [CONTRACT]: contract({ id: 'идентификатор задачи' }) });
    assert.equal(described.code, 2, 'a description is not a field: ' + described.out);
    assert.match(described.out, /нужно ИМЯ ПОЛЯ/, described.out);

    const absent = check({ [CONTRACT]: contract({ id: null }) });
    assert.equal(absent.code, 2, absent.out);
    assert.match(absent.out, /второй раз находит свою задачу/i, absent.out);

    const orphan = check({ [CONTRACT]: contract({ lives: 'в ответе создания' }) });
    assert.equal(orphan.code, 1, 'the field is named but lives nowhere: ' + orphan.out);
    assert.match(orphan.out, /не упоминает названное поле/, orphan.out);

    const noHome = check({ [CONTRACT]: contract({ lives: null }) });
    assert.equal(noHome.code, 2, noHome.out);
  });

  test('P13 - a state left out of the table is a PROVEN omission and is NAMED', () => {
    for (const dropped of STATES) {
      const rows = healthyRows().filter((r) => r.name !== dropped);
      const r = check({ [CONTRACT]: contract({ rows }) });
      assert.equal(r.code, 1, dropped + ' silently missing: ' + r.out);
      assert.match(r.out, new RegExp(dropped), 'the missing state must be named: ' + r.out);
    }
    const empty = check({ [CONTRACT]: contract({ rows: [] }) });
    assert.equal(empty.code, 1, empty.out);
    assert.match(empty.out, /3 из 3/, empty.out);
    // The two-state design is the defect, and the message must say so in those words.
    assert.match(empty.out, /Два \(«идёт» и «готово»\) — это и есть/, empty.out);
  });

  test('P14 - two states the USER cannot tell apart are one state, exit 1', () => {
    const same = check({
      [CONTRACT]: contract({
        rows: STATES.map((name) => ({ name, status: 'ПРОВЕРЕН', seen: 'готово', evidence: PROOF })),
      }),
    });
    assert.equal(same.code, 1, same.out);
    assert.match(same.out, /выглядят для пользователя ОДИНАКОВО/, same.out);
    assert.match(same.out, /успех и отказ/, same.out);

    // Case and spacing do not separate two states for a user, and must not separate them here.
    const cosmetic = check({
      [CONTRACT]: contract({
        rows: STATES.map((name, i) => ({
          name, status: 'ПРОВЕРЕН', seen: i === 1 ? 'Готово.' : (i === 2 ? 'готово' : SEEN[name]),
          evidence: PROOF,
        })),
      }),
    });
    assert.equal(cosmetic.code, 1, 'punctuation is not a difference a user can act on: ' + cosmetic.out);

    // A state with no visible sign at all does not exist for the user.
    const blind = check({
      [CONTRACT]: contract({
        rows: healthyRows().map((r, i) => (i === 2 ? { ...r, seen: '' } : r)),
      }),
    });
    assert.equal(blind.code, 1, blind.out);
    assert.match(blind.out, /без наблюдаемого признака/, blind.out);
  });

  test('P15 - a proof that does not name the identifier is exit 1', () => {
    // The kinship with the measured deployment finding: a check must use the handle the system
    // ISSUED. Without it, "I read MY job" and "the server answered at all" are written the same.
    const anon = check({
      [CONTRACT]: contract({
        rows: healthyRows().map((r) => ({ ...r, evidence: 'проверено вручную' })),
      }),
    });
    assert.equal(anon.code, 1, anon.out);
    assert.match(anon.out, /не называет идентификатор `job_id`/, anon.out);
    for (const name of STATES) assert.match(anon.out, new RegExp(name), anon.out);

    // An empty cell and the shipped bracketed placeholder are the same fact: no proof at all.
    for (const evidence of ['', '[адрес и дата]']) {
      const r = check({
        [CONTRACT]: contract({ rows: healthyRows().map((row) => ({ ...row, evidence })) }),
      });
      assert.equal(r.code, 1, 'an untouched template must not pass: ' + r.out);
      assert.match(r.out, /без всякого доказательства/, r.out);
    }
  });

  test('P16 - «НЕ ПРОВЕРЕН» under a declared ВЫПОЛНЕНА is a contradiction, exit 1', () => {
    const rows = healthyRows().map((r, i) => (i === 2 ? { ...r, status: 'НЕ ПРОВЕРЕН' } : r));
    const r = check({ [CONTRACT]: contract({ rows }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /отказ/, r.out);
    assert.match(r.out, /ложная квитанция/, r.out);

    // A malformed or duplicated table is «could not check», never a pass and never a proven loss.
    const bogus = check({
      [CONTRACT]: contract({ rows: healthyRows().map((row) => ({ ...row, status: 'ок' })) }),
    });
    assert.equal(bogus.code, 2, bogus.out);
    assert.match(bogus.out, /нераспознанный статус состояния/, bogus.out);

    const dupe = check({
      [CONTRACT]: contract({ rows: [...healthyRows(), healthyRows()[1]] }),
    });
    assert.equal(dupe.code, 2, dupe.out);
    assert.match(dupe.out, /повторяются строки/, dupe.out);
  });

  test('P17 - a PROVEN defect outranks an unanswered question, and cannot-check is never clean', () => {
    // ORDERING, and it is deliberate: a table nobody can parse must not be able to HIDE a declared
    // «молчание = выполняется». 1 beats 2, exactly as in check-look-trace.cjs.
    const both = check({
      [CONTRACT]: contract({
        silence: 'выполняется',
        rows: healthyRows().map((row) => ({ ...row, status: 'ок' })),
      }),
    });
    assert.equal(both.code, 1, 'the malformed table swallowed the proven defect: ' + both.out);
    assert.match(both.out, /молчание объявлено состоянием/, both.out);

    const absent = spawnSync(process.execPath, [CHECK, path.join(os.tmpdir(), 'p-rep-job-absent-dir')],
      { encoding: 'utf8' });
    assert.equal(absent.status, 2, absent.stdout + absent.stderr);
    assert.match(absent.stdout, /проверка НЕ выполнена/, absent.stdout);
  });
});

/**
 * The rule's FORCE, kept apart from its vocabulary.
 *
 * MEASURED on this package 2026-09-01 (commit 37916bd3): a suite of twelve keyword predicates over
 * the swarm receipt contract was fully satisfied by a block retitled "Coordination note" whose
 * imperative had been softened to "Where convenient" — the registered mutation SURVIVED. These
 * predicates are that lesson applied here: the heading must still refuse, each obligation must still
 * read as a duty, and the closed set must still be mandatory.
 */
function ruleForceProblems(text) {
  const problems = [];
  if (!/^## «Нет ответа» — это не «выполняется»$/m.test(text)) {
    problems.push('the heading no longer refuses the silence-is-running reading');
  }
  if (!/Идентификатор ОБЯЗАН выдаваться ДО начала работы/.test(text)) {
    problems.push('the handle obligation is advisory, not imperative');
  }
  if (!/Набор ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ/.test(text)) {
    problems.push('the three states are a menu, not a mandatory set');
  }
  if (!/Повтор ОБЯЗАН ПРОДОЛЖАТЬ, а не начинать заново/.test(text)) {
    problems.push('the retry obligation is advisory, not imperative');
  }
  // The identifier requirement must be CONCRETE — «name the field», not «do it asynchronously».
  if (!/назовите ПОЛЕ/.test(text) || !/где оно живёт/.test(text)) {
    problems.push('the identifier is demanded in the abstract, without naming a field or its home');
  }
  // Each failure class must arrive with the symptom the CLIENT sees — a class named without its
  // признак is a label, and a label cannot be recognised in the field.
  for (const [cls, sign] of [
    ['разрыв', /ошибка при успешно потраченных деньгах/],
    ['повтор-заново', /счёт за внешние вызовы удваивается/],
    ['третья-копия', /жмёт кнопку ещё раз/]]) {
    if (!new RegExp('`' + cls + '`').test(text)) problems.push(cls + ' is not named');
    if (!sign.test(text)) problems.push(cls + ' carries no client-side symptom');
  }
  for (const state of ['выполняется', 'успех', 'отказ']) {
    if (!new RegExp('`' + state + '`').test(text)) problems.push('state ' + state + ' is not named');
  }
  // The neighbouring webhook rule is REFERENCED, not rewritten, and the mechanisms are kept apart.
  if (!/Смежность с вебхуками названа, но не переписана/.test(text)
    || !/своё соседнее правило/i.test(text)) {
    problems.push('the webhook adjacency is not delegated to its own neighbouring rule');
  }
  if (!/ИЗВНЕ/.test(text) || !/ваш же клиент/.test(text)) {
    problems.push('the two retry mechanisms are conflated');
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
    assert.deepEqual(ruleForceProblems(read('templates/.claude/rules/long-running-job.md')), []);
  });

  test('P19 - MUTATION: a polite rephrasing must turn this suite red', () => {
    const source = read('templates/.claude/rules/long-running-job.md');

    // Retitle only. Every keyword in the file survives; only the refusal in the heading is gone.
    const retitled = source.replace('## «Нет ответа» — это не «выполняется»', '## Замечание о состояниях');
    assert.notEqual(retitled, source, 'mutation fixture did not apply — the heading moved');
    assert.deepEqual(ruleForceProblems(retitled),
      ['the heading no longer refuses the silence-is-running reading'],
      'a retitled block must fire EXACTLY the heading predicate and nothing else');

    // Soften «ОБЯЗАН» to «желательно». This is the mutation that survived on the swarm contract.
    const softHandle = source.replace('Идентификатор ОБЯЗАН выдаваться ДО начала работы',
      'Идентификатор желательно выдавать до начала работы');
    assert.notEqual(softHandle, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(ruleForceProblems(softHandle),
      ['the handle obligation is advisory, not imperative'],
      'softening the handle duty must fire EXACTLY the mandate predicate');

    const softRetry = source.replace('Повтор ОБЯЗАН ПРОДОЛЖАТЬ, а не начинать заново',
      'Повтор желательно продолжать');
    assert.notEqual(softRetry, source, 'mutation fixture did not apply — the sentence moved');
    assert.deepEqual(ruleForceProblems(softRetry),
      ['the retry obligation is advisory, not imperative'],
      'softening the retry duty must fire EXACTLY its own predicate');

    // Downgrade the closed set to a suggestion.
    const optional = source.replace('Набор ЗАКРЫТЫЙ и ОБЯЗАТЕЛЬНЫЙ', 'Набор рекомендуемый');
    assert.deepEqual(ruleForceProblems(optional),
      ['the three states are a menu, not a mandatory set'],
      'a downgraded set must fire EXACTLY its own predicate');

    // And deleting the layer honesty must be observable on its own.
    const dishonest = source.replace('НЕ МОЖЕТ по названной причине', 'пока не сделана');
    assert.deepEqual(ruleForceProblems(dishonest), ['the layer marking hides what stays judgment']);
  });

  test('P20 - Phase 2 of /replicate calls the check as an acceptance criterion', () => {
    const cmd = read('templates/.claude/commands/replicate.md');
    assert.match(cmd, /node \.claude\/hooks\/check-job-contract\.cjs \./,
      'the pipeline must actually invoke it, not merely mention the rule');
    assert.match(cmd, /\.claude\/rules\/long-running-job\.md/, 'the rule must be reachable from the seam');
    // Exit 2 must be spelled out at the seam too, or the operator reads silence as success.
    const seam = cmd.slice(cmd.indexOf('check-job-contract'));
    assert.match(seam.slice(0, 600), /НЕ «в порядке»/, seam.slice(0, 600));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-job-contract\.cjs/, 'the hook inventory must list it');
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
    assert.ok(COMPONENTS.hooks.items['check-job-contract'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-job-contract'),
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
    assert.ok(registry['long-running-job'], 'the rule must be in the canonical registry');
    assert.equal(Number(rules[1]), Object.keys(registry).length,
      'the status line would report a phantom missing rule: ' + rules[1]);
    assert.equal(Number(rules[1]), Object.keys(COMPONENTS.rules.items).length);
  });

  test('P22 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'job-cannot-check-is-not-clean': 'templates/.claude/hooks/check-job-contract.cjs',
      'job-silence-is-not-a-state': 'templates/.claude/hooks/check-job-contract.cjs',
      'job-rule-silence-heading-is-a-refusal': 'templates/.claude/rules/long-running-job.md',
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
      const target = read(entry.file);
      assert.equal(target.split(entry.mutation.find).length - 1, 1,
        id + ': the mutation anchor must occur exactly once');
    }
  });
});
