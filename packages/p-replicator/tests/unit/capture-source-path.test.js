'use strict';

// Инструмент оси «путь» Фазы 0.5. Слой 1 — детерминированная половина.
//
// Суть проверяемого свойства одна и та же во всех случаях: инструмент, который на неизвестном
// состоянии отвечает «снято», превращает незнание в заверение. У него ТРИ исхода, и ни один не
// имеет права выглядеть как другой:
//
//   0  СНЯТ           путь прокликан, строки FR-LOOK-nnn с осью «путь» выданы
//   1  ИСТОЧНИКА НЕТ  источник ОТКРЫЛСЯ, перехода нет — доказанный отрицательный ответ
//   2  НЕ ИЗМЕРЕНО    причина из ЗАКРЫТОГО списка, каждая означает СВОЙ ремонт
//
// Файл разделён НАМЕРЕННО. Чистые половины (robots.txt, шаг сетки, нумерация, формат строки,
// закрытый список) проверяются всегда и без браузера. Живые прогоны требуют Playwright — ВНЕШНЕГО
// предусловия пакета с нулём зависимостей, — и когда его нет, они ПРОПУСКАЮТСЯ с названной
// причиной, а не проходят: «не смогли проверить» и «проверили, всё хорошо» — разные факты.
//
// ИЗМЕРЕНО 2026-09-01 при живом прогоне: если поднять оснастку-сервер в ЭТОМ процессе и звать
// инструмент через spawnSync, сервер не ответит ни разу — spawnSync блокирует цикл событий
// родителя, и каждая проба упирается в таймаут robots.txt. Поэтому инструмент здесь запускается
// АСИНХРОННО, и это не стиль, а условие работоспособности оснастки.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TOOL = path.join(PKG, 'templates', '.claude', 'hooks', 'capture-source-path.cjs');
const lib = require(TOOL);

// ───────────────────────────────────────────────────────── внешнее предусловие

/** Ищем Playwright ТЕМ ЖЕ порядком, что и инструмент: env → проект → глобальный npm root. */
function findPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  for (const name of ['playwright', 'playwright-core']) {
    candidates.push(name);
    candidates.push(path.join(PKG, 'node_modules', name));
  }
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 15000 }).trim();
    for (const name of ['playwright', 'playwright-core']) candidates.push(path.join(root, name));
  } catch { /* npm может отсутствовать */ }
  for (const c of candidates) {
    try { if (require(c).chromium) return c; } catch { /* дальше */ }
  }
  return null;
}

const PW = findPlaywright();
const LIVE_SKIP = PW ? false
  : 'Playwright не найден на машине. Это ВНЕШНЕЕ предусловие пакета с нулём зависимостей, поэтому '
    + 'живые прогоны ПРОПУЩЕНЫ, а не зачтены. Включить: npm i -D playwright && npx playwright '
    + 'install chromium, либо PLAYWRIGHT_MODULE=/путь/к/node_modules/playwright';

// ───────────────────────────────────────────────────────── оснастка

const LANDING = `<html><head><title>Acme</title><style>
  :root{--a:1;--b:2;--c:3}
  body{margin:0;font-family:system-ui}
  h1{font-size:48px;font-weight:700;padding:16px}
  h2{font-size:24px;font-weight:600;padding:8px}
  p{font-size:16px;padding:8px;margin:8px}
  a.cta{display:inline-block;background:#123456;color:#fff;padding:12px 24px;border-radius:8px;font-weight:600}
  @media (max-width: 768px){h1{font-size:32px}}
  @media (min-width: 1024px){h1{font-size:56px}}
</style></head><body>
  <h1>Ship faster</h1><h2>Analytics</h2><p>Copy.</p>
  <a class="cta" href="/signup">Get started</a><a href="/pricing">Pricing</a>
</body></html>`;

const SIGNUP = `<html><head><title>Sign up</title><style>
  body{font-family:system-ui;margin:0}h1{font-size:32px;font-weight:700;padding:16px}
  input{padding:8px;margin:8px}button{background:#123456;color:#fff;padding:12px 24px;font-weight:600}
</style></head><body><h1>Create account</h1>
  <form><label for="e">Email</label><input id="e" type="email">
  <label for="p">Password</label><input id="p" type="password">
  <button type="submit">Create</button></form></body></html>`;

const LONELY = '<html><head><title>Lonely</title></head><body><h1>Only screen</h1>'
  + '<p>Никаких переходов.</p></body></html>';

const PAGES = { '/': LANDING, '/signup': SIGNUP, '/pricing': '<html><body><h1>Pricing</h1></body></html>',
  '/lonely': LONELY };

/** Оснастка-сервер. Возвращает журнал попаданий — по нему проверяется ВЕЖЛИВОСТЬ. */
function site({ robots = null, forbid = [] } = {}) {
  const hits = [];
  const srv = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    hits.push({ url, t: Date.now(), ua: req.headers['user-agent'] || '' });
    if (url === '/robots.txt') {
      if (robots === null) { res.writeHead(404); return res.end('nf'); }
      if (robots === 500) { res.writeHead(500); return res.end('err'); }
      res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(robots);
    }
    if (forbid.includes(url)) { res.writeHead(403); return res.end('blocked'); }
    const body = PAGES[url];
    if (!body) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body);
  });
  return { srv, hits, listen: () => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))) };
}

/** АСИНХРОННЫЙ запуск — см. измерение в шапке файла. */
function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TOOL, ...args], {
      env: { ...process.env, ...(PW ? { PLAYWRIGHT_MODULE: PW } : {}), ...env },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-path-')));
}

// ───────────────────────────────────────────────────────── слой 1: без браузера

describe('ось «путь»: детерминированная половина, работает без браузера', () => {
  test('P1 - закрытый список причин совпадает с тем, что держит check-look-trace', () => {
    // Два файла, один список. Разойдись они — одна половина принимала бы написание, которое
    // другая отвергает, и «честный отказ» стал бы вопросом того, кто первый посмотрел.
    const checker = fs.readFileSync(
      path.join(PKG, 'templates', '.claude', 'hooks', 'check-look-trace.cjs'), 'utf-8');
    for (const reason of lib.REASONS) {
      assert.ok(checker.includes("'" + reason + "'"),
        'причина «' + reason + '» есть у инструмента, но её не знает check-look-trace.cjs — '
        + 'запишут её в профиль, и проверка объявит её свободным текстом');
    }
    // Четыре причины — именно те, что добавила съёмка браузером. Каждая означает СВОЙ ремонт.
    for (const reason of ['no-browser', 'bot-protected', 'timeout', 'robots-disallowed']) {
      assert.ok(lib.REASONS.includes(reason), 'инструмент обязан уметь причину ' + reason);
    }
  });

  test('P2 - НЕГАТИВНЫЙ: причина вне закрытого списка не выпускается вовсе', async () => {
    // Обязанность списка держится КОДОМ, а не дисциплиной вызывающего. Проверяем не «в исходнике
    // нет плохих слов», а поведение: единственная дверь к коду 2 отвергает чужую причину.
    const src = fs.readFileSync(TOOL, 'utf-8');
    const guard = /if \(!REASONS\.includes\(reason\)\)/;
    assert.match(src, guard, 'функция notMeasured обязана проверять причину по списку');

    // И живая проба того, что через эту дверь проходят только они: неизвестный флаг отвергается
    // причиной ИЗ списка, а не выдуманной.
    const r = await run(['--нет-такого-флага']);
    assert.equal(r.code, 2, r.out);
    const named = lib.REASONS.filter((x) => r.out.includes('НЕ ИЗМЕРЕНО: ' + x));
    assert.equal(named.length, 1, 'ровно одна причина из закрытого списка: ' + r.out);
  });

  test('P3 - robots.txt: запрет читается, разрешение читается, длиннейшее правило побеждает', () => {
    const rules = lib.parseRobots([
      'User-agent: *',
      'Disallow: /admin',
      'Allow: /admin/public',
      '',
      'User-agent: SomeoneElse',
      'Disallow: /',
    ].join('\n'));
    assert.equal(lib.robotsAllows(rules, '/'), true, 'корень не запрещён');
    assert.equal(lib.robotsAllows(rules, '/admin'), false, 'запрет должен сработать');
    assert.equal(lib.robotsAllows(rules, '/admin/public/x'), true,
      'длиннейшее правило Allow обязано побеждать более короткий Disallow');

    // Группа под НАШ агент важнее звёздочки — иначе сайт не может дать нам отдельные правила.
    const mine = lib.parseRobots([
      'User-agent: *', 'Disallow:',
      'User-agent: ' + lib.ROBOTS_AGENT, 'Disallow: /',
    ].join('\n'));
    assert.equal(lib.robotsAllows(mine, '/anything'), false,
      'правила, адресованные нашему агенту, обязаны применяться к нам');

    // Пустой Disallow — это разрешение, а не запрет всего.
    assert.equal(lib.robotsAllows(lib.parseRobots('User-agent: *\nDisallow:\n'), '/x'), true);
    // Джокер и якорь конца.
    const wild = lib.parseRobots('User-agent: *\nDisallow: /*.pdf$\n');
    assert.equal(lib.robotsAllows(wild, '/docs/a.pdf'), false);
    assert.equal(lib.robotsAllows(wild, '/docs/a.pdf.html'), true);
  });

  test('P4 - шаг сетки выводится ДОЛЕЙ, и НОД здесь был бы неверен', () => {
    // ИЗМЕРЕНО: одно браузерное умолчание в em (у h1 при кегле 56px margin выходит 38px) обнуляет
    // НОД до 1-2 на сайте с честной сеткой 4px. Доля устойчива к чужим умолчаниям.
    const hist = { 8: 10, 16: 4, 12: 2, 20: 2, 24: 2, 38: 2 };
    const got = lib.spacingStep(hist);
    assert.equal(got.step, 4, 'шаг сетки на этой гистограмме равен 4: ' + JSON.stringify(got));
    assert.ok(got.share >= 0.9, 'доля обязана печататься и быть выше порога: ' + JSON.stringify(got));
    assert.ok(got.share <= 1, 'доля — это доля');

    // Кратное не должно выигрывать у настоящего шага: 8 покрывает 73% и обязано проиграть.
    assert.notEqual(got.step, 8, 'кратное не является шагом сетки');
    // Слишком мало данных — честный null, а не выдуманное «1px».
    assert.equal(lib.spacingStep({ 7: 1 }), null, 'на трёх точках шаг не выводится');
    // Мусорная гистограмма без общего делителя — тоже null, а не 1.
    assert.equal(lib.spacingStep({ 7: 5, 11: 5, 13: 5, 17: 5 }), null);
  });

  test('P5 - одно семейство идентификаторов: нумерация продолжает СУЩЕСТВУЮЩИЙ профиль', () => {
    const dir = tmp();
    try {
      assert.deepEqual(lib.nextId(dir), { next: 1, profileFound: false },
        'профиля нет — начинаем с 001 и говорим об этом');
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs', 'source-product-profile.md'),
        '| FR-LOOK-001 | a | облик | / | x | ЧЕРНОВИК |\n'
        + '| FR-LOOK-007 | b | облик | / | x | ЧЕРНОВИК |\n');
      assert.deepEqual(lib.nextId(dir), { next: 8, profileFound: true },
        'номер не переиспользуется: следующий за максимальным, а не за последним');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P6 - строки выпускаются в ОДНОМ семействе с осью «путь» и без чужих значений', () => {
    const step = {
      index: 2, path: '/signup', at: '2026-09-01T00:00:00Z', authWall: true,
      regularities: { fieldCount: 2, prominentCtas: 1, ctaCount: 3, headingLevels: 1 },
    };
    const row = lib.stepRow(7, step, 3, 'step-02.aria.txt');
    assert.match(row, /^\| FR-LOOK-007 \|/, 'ОДНО семейство: ' + row);
    assert.match(row, /\| путь \|/, 'ось проставлена колонкой, а не вторым пространством имён');
    assert.match(row, /ЧЕРНОВИК/, 'строка выпускается черновиком — её проверяет человек');
    assert.match(row, /экран входа/, 'пейволл обязан быть виден в строке');
    assert.equal(row.split('|').length - 1, 7, 'ровно шесть колонок таблицы: ' + row);
    assert.ok(!/FR-FLOW/.test(row), 'второго семейства нет');

    const seq = lib.sequenceRow(9, [
      { path: '/', at: '2026-09-01T00:00:00Z', authWall: false },
      { path: '/signup', at: '2026-09-01T00:00:01Z', authWall: true },
    ]);
    assert.match(seq, /2 экрана\(ов\), \/ → \/signup/, 'длина пути — закономерность: ' + seq);
    assert.equal(seq.split('|').length - 1, 7, 'и та же форма строки: ' + seq);
  });

  test('P7 - вертикальная черта в чужом тексте не ломает таблицу', () => {
    // Доступное имя чужой кнопки может содержать «|». Незаэкранированная, она превратила бы одну
    // строку в две колонки мусора — и проверка прослеживаемости читала бы битую таблицу.
    const row = lib.stepRow(1, {
      index: 1, path: '/a|b', at: 'T', authWall: false,
      regularities: { fieldCount: 0, prominentCtas: 0, ctaCount: 0, headingLevels: 1 },
    }, 1, 'e');
    assert.equal(row.split('|').length - 1, 7, 'колонок по-прежнему шесть: ' + row);
  });

  test('P8 - выбор перехода опирается на УСТОЙЧИВОЕ, а не на имена классов', () => {
    // Имена классов у сборщиков меняются каждой сборкой чужого сайта. Опора на них — это проверка,
    // которая краснеет от чужого релиза.
    const src = fs.readFileSync(TOOL, 'utf-8');
    for (const forbidden of ['className', 'classList', 'getAttribute(\'class\')', '[class']) {
      assert.ok(!src.includes(forbidden),
        'инструмент не имеет права читать имена классов, найдено: ' + forbidden);
    }
    const measure = {
      ctas: [
        { name: 'Docs', href: '/docs', tag: 'a', area: 100, top: 10, weight: 400, filled: false, aboveFold: true },
        { name: 'Get started', href: '/signup', tag: 'a', area: 300, top: 20, weight: 600, filled: true, aboveFold: true },
        { name: 'Twitter', href: 'https://x.test/acme', tag: 'a', area: 900, top: 30, weight: 700, filled: true, aboveFold: true },
      ],
    };
    const pick = lib.pickNext(measure, 'https://acme.test/', new Set(), []);
    assert.equal(pick.url, 'https://acme.test/signup',
      'заметный призыв того же источника побеждает; чужой домен не берётся вовсе');

    // Явный список доступных ИМЁН важнее заметности — это ручка для модели.
    const forced = lib.pickNext(measure, 'https://acme.test/', new Set(), ['Docs']);
    assert.equal(forced.url, 'https://acme.test/docs', '--follow обязан побеждать эвристику');

    // Уже пройденное не берётся снова: иначе обход зациклится на самом заметном призыве.
    const visited = new Set(['https://acme.test/signup']);
    assert.equal(lib.pickNext(measure, 'https://acme.test/', visited, []).url,
      'https://acme.test/docs', 'посещённое не предлагается повторно');

    // Ни одного перехода — честный null, из которого рождается исход «ИСТОЧНИКА НЕТ».
    assert.equal(lib.pickNext({ ctas: [] }, 'https://acme.test/', new Set(), []), null);
  });

  test('P9 - НЕ ИЗМЕРЕНО печатает готовую строку профиля, а не только диагноз', async () => {
    // Причина, которую некуда записать, теряется на следующем ходу. Инструмент печатает ровно те
    // строки, которые ждёт check-look-trace.cjs.
    const r = await run(['file:///etc/passwd']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /НЕ ИЗМЕРЕНО: out-of-scope/, r.out);
    assert.match(r.out, /\*\*Статус съёмки \(путь\):\*\* НЕ ИЗМЕРЕНО/, r.out);
    assert.match(r.out, /\*\*Причина \(путь\):\*\* out-of-scope/, r.out);
  });

  test('P10 - Playwright отсутствует → честный no-browser, а не падение', async () => {
    // Внешнее предусловие. У пакета НОЛЬ зависимостей, и эта утилита их не заводит: отсутствие
    // инструмента обязано быть ИСХОДОМ, а не стеком вызовов.
    const r = await run(['http://127.0.0.1:1/'],
      { PLAYWRIGHT_MODULE: '/nonexistent/playwright', PATH: '/nonexistent' });
    assert.equal(r.code, 2, 'отсутствие браузера — код 2, никогда 0: ' + r.out);
    assert.match(r.out, /НЕ ИЗМЕРЕНО: no-browser/, r.out);
    assert.match(r.out, /playwright install chromium/, 'и ремонт обязан быть назван: ' + r.out);
    assert.ok(!/Error:|TypeError|at Object/.test(r.out), 'это исход, а не стек: ' + r.out);
  });

  test('P11 - потолки вежливости зажимаются ВСЛУХ', async () => {
    const loud = await run(['http://127.0.0.1:1/', '--max-pages', '999', '--delay-ms', '1'],
      { PLAYWRIGHT_MODULE: '/nonexistent/playwright', PATH: '/nonexistent' });
    assert.match(loud.out, new RegExp('зажат до потолка вежливости ' + lib.MAX_PAGES_CAP),
      'молча зажатый потолок — это несогласованное поведение: ' + loud.out);
    assert.match(loud.out, new RegExp('поднят до минимума вежливости ' + lib.MIN_DELAY_MS), loud.out);
  });

  test('P12 - зарегистрирован как утилита, ни к какому событию не привязан, счётчики сходятся', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['capture-source-path'],
      'без регистрации doctor/verify его не потребуют');
    const settings = fs.readFileSync(path.join(PKG, 'templates', '.claude', 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('capture-source-path'),
      'хуки этого пакета не блокируют по контракту — привязанный, он мог бы только печатать');
    const statusline = fs.readFileSync(
      path.join(PKG, 'templates', '.claude', 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'статусная строка сообщила бы о призрачной нехватке хука');
  });

  test('P13 - у пакета по-прежнему НОЛЬ зависимостей', () => {
    // Playwright — внешнее предусловие. Затащи его в dependencies — и ноль-зависимый пакет
    // перестанет быть ноль-зависимым ради утилиты, которая честно живёт без него.
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf-8'));
    assert.equal(pkg.dependencies, undefined, 'dependencies обязаны отсутствовать');
    const src = fs.readFileSync(TOOL, 'utf-8');
    assert.ok(!/^const .* = require\('playwright/m.test(src),
      'модуль обязан искаться во время запуска, а не подключаться статически');
  });
});

// ───────────────────────────────────────────────────────── живые прогоны

describe('ось «путь»: живые прогоны браузером по локальной оснастке', { skip: LIVE_SKIP }, () => {
  test('P14 - СНЯТ: путь прокликан, строки выданы, нумерация продолжена', async () => {
    const { srv, listen } = site();
    const port = await listen();
    const dir = tmp();
    try {
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs', 'source-product-profile.md'),
        '| FR-LOOK-004 | палитра | облик | / | скриншот | ЧЕРНОВИК |\n');
      const r = await run([`http://127.0.0.1:${port}/`, '--project', dir,
        '--out', 'evidence', '--max-pages', '3', '--delay-ms', '250']);
      assert.equal(r.code, 0, 'путь снят — код 0: ' + r.out);
      assert.match(r.out, /FR-LOOK-005 \|/, 'нумерация продолжает профиль: ' + r.out);
      assert.match(r.out, /\| путь \|/, 'ось проставлена: ' + r.out);
      assert.ok(!/FR-LOOK-004 \|/.test(r.out), 'занятый номер не переиспользуется: ' + r.out);
      // Экран входа — законная последняя точка. За вход не ходим.
      assert.match(r.out, /экран входа/, 'пейволл обязан быть записан шагом: ' + r.out);
      // И измеренные закономерности стартового экрана, а не значения чужого оформления.
      assert.match(r.out, /шаг сетки отступов: 4px/, 'сетка 4px обязана вывестись: ' + r.out);
      assert.match(r.out, /брейкпоинты из настоящих @media: 768, 1024/, r.out);
    } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P15 - доказательства помечены чужим материалом и закрыты своим .gitignore', async () => {
    const { srv, listen } = site();
    const port = await listen();
    const dir = tmp();
    try {
      await run([`http://127.0.0.1:${port}/`, '--project', dir, '--out', 'evidence',
        '--max-pages', '2', '--delay-ms', '250']);
      const out = path.join(dir, 'evidence');
      assert.equal(fs.readFileSync(path.join(out, '.gitignore'), 'utf-8').trim(), '*',
        'каталог обязан закрываться САМ, а не чужой дисциплиной');
      assert.match(fs.readFileSync(path.join(out, 'README.txt'), 'utf-8'), /ЧУЖОГО сайта/,
        'материал обязан быть помечен');
      // DOM чужого сайта — чужой код. По умолчанию его тут нет.
      const files = fs.readdirSync(out);
      assert.ok(!files.some((f) => f.endsWith('.dom.html')),
        'DOM по умолчанию не сохраняется: ' + files.join(', '));
      assert.ok(files.some((f) => f.endsWith('.aria.txt')), 'семантический слепок — наш вывод');
      assert.ok(files.includes('capture.json'), 'измерения сохраняются');
    } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P16 - ВЕЖЛИВОСТЬ: один поток, пауза выдержана, потолок страниц соблюдён', async () => {
    const { srv, hits, listen } = site();
    const port = await listen();
    const dir = tmp();
    try {
      const r = await run([`http://127.0.0.1:${port}/`, '--project', dir, '--out', 'e',
        '--max-pages', '2', '--delay-ms', '1200']);
      assert.equal(r.code, 0, r.out);
      const pages = hits.filter((h) => h.url !== '/robots.txt');
      assert.equal(pages.length, 2, '--max-pages 2 значит ровно два экрана: '
        + JSON.stringify(pages.map((p) => p.url)));
      assert.ok(pages[1].t - pages[0].t >= 1200,
        'пауза между экранами обязана выдерживаться, измерено ' + (pages[1].t - pages[0].t) + ' мс');
      assert.match(pages[0].ua, new RegExp(lib.ROBOTS_AGENT),
        'User-Agent честный: маскировка под обычный браузер была бы обходом защиты');
    } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P17 - robots.txt спрашивается ПЕРЕД обходом, и запрет — это исход', async () => {
    const dir = tmp();
    try {
      const deny = site({ robots: 'User-agent: *\nDisallow: /\n' });
      const p1 = await deny.listen();
      const r1 = await run([`http://127.0.0.1:${p1}/`, '--project', dir, '--out', 'e',
        '--max-pages', '3']);
      assert.equal(r1.code, 2, 'запрет — код 2: ' + r1.out);
      assert.match(r1.out, /НЕ ИЗМЕРЕНО: robots-disallowed/, r1.out);
      assert.equal(deny.hits.filter((h) => h.url !== '/robots.txt').length, 0,
        'ни одной страницы не тронуто: robots.txt читается ДО обхода, а не после');
      deny.srv.close();

      // Нечитаемый robots.txt — запрет, а не разрешение: «не смогли спросить» ≠ «нам разрешили».
      const broken = site({ robots: 500 });
      const p2 = await broken.listen();
      const r2 = await run([`http://127.0.0.1:${p2}/`, '--project', dir, '--out', 'e',
        '--max-pages', '3']);
      assert.equal(r2.code, 2, r2.out);
      assert.match(r2.out, /robots-disallowed/, r2.out);
      assert.match(r2.out, /трактуется как запрет/, r2.out);
      broken.srv.close();

      // ОДНА страница — не обход, robots.txt не запрашивается вовсе.
      const one = site({ robots: 'User-agent: *\nDisallow: /\n' });
      const p3 = await one.listen();
      const r3 = await run([`http://127.0.0.1:${p3}/lonely`, '--project', dir, '--out', 'e',
        '--max-pages', '1']);
      assert.equal(one.hits.filter((h) => h.url === '/robots.txt').length, 0,
        'обхода нет — robots.txt не спрашивается: ' + r3.out);
      one.srv.close();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P18 - 403 и экран входа — исходы с НАЗВАННОЙ причиной, никогда не обход', async () => {
    const dir = tmp();
    try {
      const blocked = site({ forbid: ['/'] });
      const p1 = await blocked.listen();
      const r1 = await run([`http://127.0.0.1:${p1}/`, '--project', dir, '--out', 'e',
        '--max-pages', '1']);
      assert.equal(r1.code, 2, r1.out);
      assert.match(r1.out, /НЕ ИЗМЕРЕНО: bot-protected/, r1.out);
      assert.match(r1.out, /ЗАПРЕЩЕНО/, 'и запрет на обход защиты обязан быть сказан: ' + r1.out);
      blocked.srv.close();

      const walled = site();
      const p2 = await walled.listen();
      const r2 = await run([`http://127.0.0.1:${p2}/signup`, '--project', dir, '--out', 'e',
        '--max-pages', '2']);
      assert.equal(r2.code, 2, 'стартовый экран за входом — не «снято»: ' + r2.out);
      assert.match(r2.out, /НЕ ИЗМЕРЕНО: auth-required/, r2.out);
      walled.srv.close();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P19 - ИСТОЧНИКА НЕТ: экран открылся, перехода нет — доказанный отрицательный ответ', async () => {
    const { srv, listen } = site();
    const port = await listen();
    const dir = tmp();
    try {
      const r = await run([`http://127.0.0.1:${port}/lonely`, '--project', dir, '--out', 'e',
        '--max-pages', '3', '--delay-ms', '250']);
      assert.equal(r.code, 1, 'третий исход имеет СВОЙ код: ' + r.out);
      assert.match(r.out, /ИСТОЧНИКА НЕТ/, r.out);
      assert.match(r.out, /\*\*Статус съёмки \(путь\):\*\* ИСТОЧНИКА НЕТ/,
        'и печатает готовую строку профиля: ' + r.out);
      assert.ok(!/FR-LOOK-\d{3} \|/.test(r.out), 'строк не выпускается — записывать нечего: ' + r.out);
    } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P20 - один двоичный файл выдаёт все три исхода в одном прогоне', async () => {
    // Каждый случай выше утверждает ОДНО направление, поэтому реализация с постоянным ответом
    // прошла бы подмножество. Тот же исполняемый файл обязан выдать 0, 1 и 2.
    const { srv, listen } = site();
    const port = await listen();
    const dir = tmp();
    try {
      const seen = [
        (await run([`http://127.0.0.1:${port}/`, '--project', dir, '--out', 'a',
          '--max-pages', '2', '--delay-ms', '250'])).code,
        (await run([`http://127.0.0.1:${port}/lonely`, '--project', dir, '--out', 'b',
          '--max-pages', '2', '--delay-ms', '250'])).code,
        (await run([`http://127.0.0.1:${port}/nope`, '--project', dir, '--out', 'c',
          '--max-pages', '1'])).code,
      ];
      assert.deepEqual(seen, [0, 1, 2], 'ожидались снято/пути-нет/не-измерено: ' + JSON.stringify(seen));
    } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
