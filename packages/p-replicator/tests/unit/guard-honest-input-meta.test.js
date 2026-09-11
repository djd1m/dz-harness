'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const HOOKS = path.join(PKG, 'templates', '.claude', 'hooks');
const TESTS = path.join(PKG, 'tests', 'unit');
const HONEST_INPUT_TITLE = /clean|чист|honest|exits? 0/i;

function testTitles(source) {
  return [...source.matchAll(/\b(?:test|it)\s*\(\s*(['"`])([^\r\n]*?)\1/g)]
    .map((match) => match[2]);
}

function auditHonestInputs(hooksDir, testsDir) {
  const hooks = fs.readdirSync(hooksDir)
    .filter((name) => /^check-.*\.cjs$/.test(name))
    .sort();
  const issues = [];
  for (const hook of hooks) {
    const testFile = hook.replace(/\.cjs$/, '.test.js');
    const testPath = path.join(testsDir, testFile);
    if (!fs.existsSync(testPath)) {
      issues.push({ hook, testFile, reason: 'missing-test' });
      continue;
    }
    const titles = testTitles(fs.readFileSync(testPath, 'utf8'));
    if (!titles.some((title) => HONEST_INPUT_TITLE.test(title))) {
      issues.push({ hook, testFile, reason: 'missing-honest-input-title' });
    }
  }
  return { hooks, issues };
}

test('catalog requires an honest-input title for every shipped check-*.cjs', () => {
  const result = auditHonestInputs(HOOKS, TESTS);
  assert.ok(result.hooks.length > 0, 'an empty hook catalog cannot prove the invariant');
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues, null, 2));
});

test('honest-input catalog probe reports a fake check with no same-named test', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-honest-meta-')));
  const hooksCopy = path.join(root, 'hooks');
  const testsCopy = path.join(root, 'unit');
  try {
    fs.cpSync(HOOKS, hooksCopy, { recursive: true });
    fs.cpSync(TESTS, testsCopy, { recursive: true });
    fs.writeFileSync(path.join(hooksCopy, 'check-zzz.cjs'), "'use strict';\n");

    const result = auditHonestInputs(hooksCopy, testsCopy);
    assert.ok(result.hooks.includes('check-zzz.cjs'),
      'the derived enumeration must see a newly added catalog entry');
    assert.deepEqual(result.issues.filter((issue) => issue.hook === 'check-zzz.cjs'), [{
      hook: 'check-zzz.cjs', testFile: 'check-zzz.test.js', reason: 'missing-test',
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * ВТОРОЙ УКУС — на ветку, которую первый не трогал.
 *
 * ИЗМЕРЕНО 2026-09-03: удаление проверки `missing-honest-input-title` из аудита оставляло ОБА
 * метатеста зелёными. Первый укус подкладывает хук БЕЗ теста и потому доказывает только ветку
 * `missing-test`; вторая ветка не проверялась ничем и могла быть удалена незаметно. Страж,
 * половина которого удаляется без единого красного теста, охраняет ровно ту половину, что осталась.
 */
test('honest-input catalog probe reports a test file with no honest-input title', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-honest-meta2-')));
  const hooksCopy = path.join(root, 'hooks');
  const testsCopy = path.join(root, 'unit');
  try {
    fs.cpSync(HOOKS, hooksCopy, { recursive: true });
    fs.cpSync(TESTS, testsCopy, { recursive: true });
    fs.writeFileSync(path.join(hooksCopy, 'check-yyy.cjs'), "'use strict';\n");
    // Тест ЕСТЬ — и в нём нет ни одного заголовка честного входа. Это ровно та форма, которую
    // первый укус пропускает: файл на месте, обязанность не выполнена.
    fs.writeFileSync(path.join(testsCopy, 'check-yyy.test.js'),
      "'use strict';\nconst { test } = require('node:test');\n" +
      "test('refuses on a bad input', () => {});\n");

    const result = auditHonestInputs(hooksCopy, testsCopy);
    assert.deepEqual(result.issues.filter((issue) => issue.hook === 'check-yyy.cjs'), [{
      hook: 'check-yyy.cjs', testFile: 'check-yyy.test.js', reason: 'missing-honest-input-title',
    }], 'ветка отсутствующего заголовка обязана иметь собственный укус, иначе её удалят молча');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * ЧЕСТНАЯ ГРАНИЦА ЭТОГО ИНВАРИАНТА, названная здесь, чтобы её не пришлось выводить.
 *
 * Проверяется ЗАГОЛОВОК теста, а не его содержание. Заголовок «honest input exits 0» над пустым
 * телом инвариант удовлетворяет. То есть страж ловит ЗАБЫВЧИВОСТЬ (никто не написал такого теста)
 * и не ловит ОБМАН (написали заголовок, не написав проверки).
 *
 * Это осознанная граница, а не недосмотр: доказать по телу теста, что он действительно прогоняет
 * честный вход, значит разбирать чужой код, а разбор кода регулярным выражением — тот самый
 * механизм, который в этом пакете уже дважды давал ложные вердикты. Забывчивость при этом и есть
 * массовый случай: заголовок пишут те, кто про обязанность помнит.
 */
test('the invariant is a TITLE check, and that boundary is stated rather than implied', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.match(source, /Проверяется ЗАГОЛОВОК теста, а не его содержание/,
    'граница инварианта обязана быть написана в файле, а не подразумеваться');
});

