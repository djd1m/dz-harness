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

