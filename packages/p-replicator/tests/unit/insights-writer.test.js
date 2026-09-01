'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const WRITER = path.join(TPL, 'hooks', 'write-insight.cjs');
const HARVEST = path.join(TPL, 'commands', 'harvest.md');
const CLI = path.join(PKG, 'bin', 'cli.js');

function tempProject(prefix = 'p-rep-insight-') {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function payload(overrides = {}) {
  return {
    date: '2026-08-30',
    title: 'Anchor writes at the project root',
    tags: ['hooks', 'project-root'],
    problem: 'A changed working directory hid the project carrier.',
    solution: 'Resolve the carrier from the explicit project root.',
    references: ['templates/.claude/hooks/session-insights.cjs:19'],
    ...overrides,
  };
}

function runWriter(root, input, options = {}) {
  const env = { ...process.env, PATH: options.path === undefined ? '' : options.path };
  if (options.withEnv === false) delete env.CLAUDE_PROJECT_DIR;
  else env.CLAUDE_PROJECT_DIR = root;
  const writer = options.writer || WRITER;
  return spawnSync(process.execPath, [writer], {
    cwd: options.cwd || root,
    env,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  });
}

function absentDz() {
  return { status: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' };
}

function receipt(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function requireWriter() {
  assert.ok(fs.existsSync(WRITER),
    'the packaged write-insight.cjs boundary does not exist yet');
  delete require.cache[require.resolve(WRITER)];
  return require(WRITER);
}

describe('PR-022 harvest insight persistence', () => {
  test('P1 - quick and full reject a real writer failure while marker stays non-writing', () => {
    const command = fs.readFileSync(HARVEST, 'utf8');
    assert.match(command, /REQUIRED INSIGHT PERSISTENCE GATE/,
      'quick/full need one named mandatory gate before their completion report');
    assert.match(command, /write-insight\.cjs/,
      'the command must invoke the executable persistence boundary');
    assert.match(command, /created.*appended.*duplicate/s,
      'only the three canonical receipts may authorize completion');
    assert.match(command, /writer exits non-zero.*MUST NOT\s+report.*completed/is,
      'a real persistence failure must stop the ordinary completion report');
    assert.match(command, /marker.*does not invoke.*write-insight/is,
      'marker requests future work and must remain non-writing');
    assert.match(command, /no candidate.*write nothing.*capture remains\s+incomplete/is,
      'a findings-free run must stay non-writing and may not fabricate completion');

    const root = tempProject();
    try {
      const failed = runWriter(root, '{not-json');
      assert.notEqual(failed.status, 0, 'malformed JSON must exercise a real writer failure');
      assert.equal(fs.existsSync(path.join(root, '.claude', 'insights')), false,
        'a failed candidate must not manufacture the missing carrier');
    } finally { cleanup(root); }
  });

  test('P2 - writer creates appends preserves legacy bytes and deduplicates exact payloads', () => {
    const { writeInsight } = requireWriter();
    const root = tempProject();
    try {
      const index = path.join(root, '.claude', 'insights', 'index.md');
      const first = writeInsight(root, payload(), { runner: absentDz });
      assert.equal(first.status, 'created');
      assert.equal(first.entryCount, 1);
      const created = fs.readFileSync(index, 'utf8');
      assert.match(created, /^## 2026-08-30 — Anchor writes at the project root/m);
      assert.match(created, /<!-- insight-id: sha256:[a-f0-9]{64} -->/);

      const distinct = payload({ title: 'Unicode path stays intact', tags: ['utf-8'],
        problem: 'Путь с пробелами ломал запись.', solution: 'Передавать JSON через stdin.',
        references: [] });
      const appended = writeInsight(root, distinct, { runner: absentDz });
      assert.equal(appended.status, 'appended');
      assert.ok(fs.readFileSync(index, 'utf8').startsWith(created),
        'append must preserve every already-committed byte as a prefix');

      const beforeReplay = fs.readFileSync(index);
      const duplicate = writeInsight(root, { ...distinct, date: '2026-08-31' }, { runner: absentDz });
      assert.equal(duplicate.status, 'duplicate', 'date is not part of semantic identity');
      assert.deepEqual(fs.readFileSync(index), beforeReplay,
        'an exact normalized replay must perform no carrier write');

      const legacyEntry = [
        '## 2026-08-29 — Manually captured legacy record',
        '',
        '**Tags:** manual',
        '',
        '**Problem:**',
        'This entry predates writer identity markers.',
        '',
        '**Solution:**',
        'Keep every legacy byte intact.',
        '',
        '---',
        '',
      ].join('\n');
      fs.appendFileSync(index, legacyEntry);
      const legacyPrefix = fs.readFileSync(index);

      const sameDateDistinct = writeInsight(root,
        { ...distinct, solution: 'Use structured stdin.' }, { runner: absentDz });
      assert.equal(sameDateDistinct.status, 'appended',
        'same-date payloads remain distinct when a semantic field changes');
      assert.ok(fs.readFileSync(index).subarray(0, legacyPrefix.length).equals(legacyPrefix),
        'writer append must preserve a marker-free /myinsights legacy record byte-for-byte');
      assert.equal(sameDateDistinct.entryCount, 4);
    } finally { cleanup(root); }
  });

  test('P3 - CLI validates before mutation and stays project-root anchored', () => {
    requireWriter();
    const spaced = tempProject('p rep insight utf8 ');
    try {
      const nested = path.join(spaced, 'nested', 'work');
      fs.mkdirSync(nested, { recursive: true });
      const ok = runWriter(spaced, payload({ title: 'Путь с пробелами',
        problem: 'Текущий каталог изменился.', solution: 'Якорь остаётся у корня.' }), { cwd: nested });
      assert.equal(receipt(ok).status, 'created');
      assert.ok(fs.readFileSync(path.join(spaced, '.claude', 'insights', 'index.md'), 'utf8')
        .includes('Путь с пробелами'));
      assert.equal(fs.existsSync(path.join(nested, '.claude')), false,
        'cwd drift must not create a second project tree');
    } finally { cleanup(spaced); }

    const invalidCases = [
      ['invalid JSON', '{'],
      ['invalid calendar date', payload({ date: '2026-02-30' })],
      ['blank required field', payload({ problem: '  ' })],
      ['non-string array member', payload({ tags: ['ok', 3] })],
      ['missing field', (() => { const p = payload(); delete p.references; return p; })()],
    ];
    for (const [name, input] of invalidCases) {
      const root = tempProject();
      try {
        const result = runWriter(root, input);
        assert.notEqual(result.status, 0, name + ' must be rejected');
        assert.equal(fs.existsSync(path.join(root, '.claude', 'insights')), false,
          name + ' mutated the carrier before validation completed');
      } finally { cleanup(root); }
    }

    const broken = tempProject();
    try {
      fs.writeFileSync(path.join(broken, '.claude'), 'not a directory\n');
      const result = runWriter(broken, payload());
      assert.notEqual(result.status, 0, 'an unavailable carrier must fail loudly');
      assert.equal(fs.readFileSync(path.join(broken, '.claude'), 'utf8'), 'not a directory\n');
    } finally { cleanup(broken); }
  });

  test('P4 - installed writer output remains readable by the hook and doctor', () => {
    requireWriter();
    const root = tempProject();
    try {
      const init = spawnSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
      assert.equal(init.status, 0, init.stderr || init.stdout);
      assert.equal(fs.existsSync(path.join(root, '.claude', 'insights')), false,
        'init must preserve the legitimate pre-first-write missing state');

      const installedWriter = path.join(root, '.claude', 'hooks', 'write-insight.cjs');
      const written = runWriter(root, payload(), { writer: installedWriter });
      assert.equal(receipt(written).status, 'created');

      const hook = spawnSync(process.execPath,
        [path.join(root, '.claude', 'hooks', 'session-insights.cjs')], {
          cwd: path.join(root, '.claude'),
          env: { ...process.env, PATH: '', CLAUDE_PROJECT_DIR: root },
          input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'anchor writes' }),
          encoding: 'utf8',
        });
      assert.equal(hook.status, 0, hook.stderr);
      assert.match(hook.stdout, /Anchor writes at the project root/);

      const doctor = spawnSync(process.execPath, [CLI, 'doctor'], { cwd: root, encoding: 'utf8' });
      assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
      assert.match(doctor.stdout, /insights carrier.*1 entr/i);
    } finally { cleanup(root); }
  });

  test('P16 - Markdown success dominates absent failed and timed-out teach', () => {
    const { writeInsight } = requireWriter();
    const cases = [
      ['absent', { status: null, error: { code: 'ENOENT' }, stdout: '', stderr: '' }, 'absent'],
      ['failed', { status: 9, stdout: '', stderr: 'private stderr' }, 'failed'],
      ['timeout', { status: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' }, 'failed'],
    ];
    for (const [name, processResult, expectedState] of cases) {
      const root = tempProject(`p-rep-teach-${name}-`);
      let importPath;
      try {
        const result = writeInsight(root, payload({ title: `Markdown survives ${name} teach` }), {
          runner(file, args, options) {
            assert.equal(file, 'dz');
            assert.deepEqual(args.slice(0, 2), ['teach', '--from-json']);
            assert.equal(args[args.length - 2], '--project');
            assert.equal(args[args.length - 1], root);
            assert.equal(options.cwd, root);
            assert.equal(options.timeout, 1500);
            assert.equal(options.maxBuffer, 1024 * 1024);
            assert.equal(options.shell, false);
            importPath = args[2];
            assert.equal(fs.statSync(importPath).mode & 0o777, 0o600);
            const imported = JSON.parse(fs.readFileSync(importPath, 'utf8'));
            assert.equal(imported.length, 1);
            assert.equal(imported[0].domain, 'p-replicator-insights');
            return processResult;
          },
        });
        assert.equal(result.status, 'created');
        assert.equal(result.teach.state, expectedState);
        assert.match(fs.readFileSync(path.join(root, '.claude', 'insights', 'index.md'), 'utf8'),
          new RegExp(`Markdown survives ${name} teach`));
        assert.equal(fs.existsSync(importPath), false, 'private teach import must be removed');
      } finally { cleanup(root); }
    }

    const broken = tempProject('p-rep-teach-no-write-');
    let calls = 0;
    try {
      fs.writeFileSync(path.join(broken, '.claude'), 'not a directory\n');
      assert.throws(() => writeInsight(broken, payload(), {
        runner() { calls += 1; return { status: 0, stdout: '', stderr: '' }; },
      }));
      assert.equal(calls, 0, 'a failed Markdown write must make zero dz calls');
    } finally { cleanup(broken); }
  });

  test('P16b - duplicate replay imports one learned row', () => {
    const { writeInsight, stableTeachText, normalizePayload } = requireWriter();
    const root = tempProject('p-rep-real-dz-teach-');
    try {
      const record = payload({ title: 'Replay-safe learned projection' });
      const first = writeInsight(root, record);
      const replay = writeInsight(root, { ...record, date: '2026-08-31' });
      assert.equal(first.status, 'created');
      assert.equal(first.teach.state, 'ok');
      assert.equal(replay.status, 'duplicate');
      assert.equal(replay.teach.state, 'ok');

      const queried = spawnSync('dz', [
        'recall', '--all', '--json', '--project', root,
      ], { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
      assert.equal(queried.status, 0, queried.stderr || queried.stdout);
      const rows = JSON.parse(queried.stdout);
      const expected = stableTeachText(normalizePayload(record));
      const matches = rows.filter((row) =>
        row.domain === 'p-replicator-insights' && row.pattern === expected);
      assert.equal(matches.length, 1,
        `two exact replays must leave one learned row, got ${matches.length}`);
    } finally { cleanup(root); }
  });
});
