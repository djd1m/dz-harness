'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const CHECK = path.join(PKG, 'templates', '.claude', 'hooks', 'check-review-contract.cjs');
const SLUG = 'traceability-floor';
const SPEC = [
  '# Specification',
  '',
  '### AC-trace-1 First criterion',
  '',
  'The first contour is observable.',
  '',
  '```markdown',
  '### AC-ignored-9 Example only',
  '```',
  '',
  '### AC-trace-2 Second criterion',
  '',
  'The second contour is observable.',
  '',
].join('\n');

function digest(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function report(options) {
  const o = options || {};
  const rows = o.rows || [
    '| AC-trace-1 | met | tests/trace.test.js — proves the first contour |',
    '| AC-trace-2 | unverifiable | |',
  ];
  return [
    '# Review report',
    ...(o.family === null ? [] : ['Reviewer family: ' + (o.family || 'claude')]),
    'Spec revision: sha256:' + (o.revision || digest(SPEC)),
    '',
    ...(o.section === false ? [] : [
      '## Spec conformance',
      ...(o.table === false ? [] : [
        '| Criterion | Verdict | Evidence |',
        '|-----------|---------|----------|',
        ...rows,
      ]),
    ]),
    '',
  ].join('\n');
}

function check(options) {
  const o = options || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-review-')));
  const feature = path.join(root, 'docs', 'features', SLUG);
  fs.mkdirSync(feature, { recursive: true });
  try {
    const specPath = path.join(feature, '01_specification.md');
    if (o.symlinkSpec) {
      const target = path.join(root, 'spec-target.md');
      fs.writeFileSync(target, SPEC);
      fs.symlinkSync(target, specPath);
    } else {
      fs.writeFileSync(specPath, SPEC);
    }
    if (!o.missingReport) {
      const reportPath = path.join(feature, 'review-report.md');
      fs.writeFileSync(reportPath, o.body === undefined ? report() : o.body);
      if (o.unreadableReport) fs.chmodSync(reportPath, 0o000);
    }
    const result = spawnSync(process.execPath, [CHECK, root, SLUG], { encoding: 'utf8' });
    return { code: result.status, out: (result.stdout || '') + (result.stderr || '') };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function namedGap(options, pattern) {
  const result = check(options);
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, pattern, result.out);
}

test('honest input exits 0 and prints the measured counts', () => {
  const result = check();
  assert.equal(result.code, 0, result.out);
  assert.match(result.out,
    /PASS review-contract feature=traceability-floor AC-ids=2 rows=2/,
    result.out);
});

test('missing reviewer family is a named gap', () => {
  namedGap({ body: report({ family: null }) }, /GAP Reviewer family line missing/);
});

test('reviewer family outside the vocabulary is a named gap', () => {
  namedGap({ body: report({ family: 'gpt' }) }, /GAP Reviewer family invalid value=gpt/);
});

test('revision mismatch names both 12-character prefixes', () => {
  const wrong = '0'.repeat(64);
  const actual = digest(SPEC).slice(0, 12);
  namedGap(
    { body: report({ revision: wrong }) },
    new RegExp('GAP Spec revision mismatch report=000000000000 specification=' + actual),
  );
});

test('missing Spec conformance section is a named gap', () => {
  namedGap({ body: report({ section: false }) }, /GAP Spec conformance section missing/);
});

test('missing Spec conformance table is a named gap', () => {
  namedGap({ body: report({ table: false }) }, /GAP Spec conformance table missing or malformed/);
});

test('an AC id with no row is named', () => {
  namedGap({ body: report({ rows: [
    '| AC-trace-1 | met | tests/trace.test.js — proves the first contour |',
  ] }) }, /GAP AC-trace-2 has no Spec conformance row/);
});

test('a row id absent from the specification is named', () => {
  namedGap({ body: report({ rows: [
    '| AC-trace-1 | met | tests/trace.test.js — proves the first contour |',
    '| AC-trace-2 | unverifiable | |',
    '| AC-invented-3 | met | tests/trace.test.js — invented contour |',
  ] }) }, /GAP AC-invented-3 row id is not in the specification/);
});

test('a duplicate row is named', () => {
  namedGap({ body: report({ rows: [
    '| AC-trace-1 | met | tests/trace.test.js — first proof |',
    '| AC-trace-1 | met | tests/trace.test.js — duplicate proof |',
    '| AC-trace-2 | unverifiable | |',
  ] }) }, /GAP AC-trace-1 duplicate Spec conformance row/);
});

test('a verdict outside the vocabulary is named', () => {
  namedGap({ body: report({ rows: [
    '| AC-trace-1 | passed | tests/trace.test.js — first proof |',
    '| AC-trace-2 | unverifiable | |',
  ] }) }, /GAP AC-trace-1 verdict invalid value=passed/);
});

test('empty evidence on met and not met rows is named', () => {
  for (const verdict of ['met', 'not met']) {
    namedGap({ body: report({ rows: [
      '| AC-trace-1 | ' + verdict + ' | |',
      '| AC-trace-2 | unverifiable | |',
    ] }) }, new RegExp('GAP AC-trace-1 evidence empty for verdict=' + verdict));
  }
});

test('unreadable or missing report → exit 2', () => {
  for (const options of [{ missingReport: true }, { unreadableReport: true }]) {
    const result = check(options);
    assert.equal(result.code, 2, result.out);
    assert.match(result.out, /NOT-ESTABLISHED review contract: review report/, result.out);
  }
});

test('symlinked spec → exit 2', () => {
  const result = check({ symlinkSpec: true });
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /NOT-ESTABLISHED review contract: specification is a symlink/, result.out);
});

test('the family line is disclosure only: every vocabulary value passes, gpt fails', () => {
  for (const family of ['claude', 'codex', 'human', 'unknown']) {
    const result = check({ body: report({ family }) });
    assert.equal(result.code, 0, family + ': ' + result.out);
  }
  namedGap({ body: report({ family: 'gpt' }) }, /GAP Reviewer family invalid value=gpt/);
});
