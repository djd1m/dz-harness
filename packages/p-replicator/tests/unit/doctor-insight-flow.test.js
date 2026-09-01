'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const CLI = path.join(PKG, 'bin', 'cli.js');
const DOCTOR = path.join(PKG, 'src', 'commands', 'doctor.js');
const REFERENCE_TIME = new Date(2026, 7, 30, 12, 0, 0);
const WINDOW_DATES = ['2026-08-28', '2026-08-29', '2026-08-30'];

function tempProject(prefix = 'p-rep-doctor-flow-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  execFileSync(process.execPath, [CLI, 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function git(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ...(options.env || {}) },
  });
  assert.equal(result.status, 0,
    `git ${args.join(' ')} failed: ${result.stderr || result.error || ''}`);
  return result.stdout || '';
}

function initGit(root) {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'P-Replicator Test']);
  git(root, ['config', 'user.email', 'p-replicator@example.invalid']);
}

let commitSequence = 0;
function commit(root, subject, date) {
  commitSequence += 1;
  fs.writeFileSync(path.join(root, `.doctor-flow-${commitSequence}.txt`), `${subject}\n${date}\n`);
  git(root, ['add', '-A']);
  const env = {
    GIT_AUTHOR_DATE: `${date}T12:00:00`,
    GIT_COMMITTER_DATE: `${date}T12:00:00`,
  };
  git(root, ['commit', '-qm', subject], { env });
}

function writeInsights(root, records) {
  const index = path.join(root, '.claude', 'insights', 'index.md');
  fs.mkdirSync(path.dirname(index), { recursive: true });
  fs.writeFileSync(index, ['# Project Insights', '', ...records.map(({ date, title }, i) => [
    `## ${date} — ${title}`,
    '',
    '**Problem:**',
    `Problem ${i + 1}.`,
    '',
    '**Solution:**',
    `Solution ${i + 1}.`,
    '',
    '---',
    '',
  ].join('\n'))].join('\n'));
  return index;
}

function runDoctor(root) {
  delete require.cache[require.resolve(DOCTOR)];
  const doctor = require(DOCTOR);
  const lines = [];
  const originalLog = console.log;
  const previousExitCode = process.exitCode;
  console.log = (...args) => lines.push(args.map(String).join(' '));
  process.exitCode = undefined;
  try {
    doctor({ targetDir: root, now: REFERENCE_TIME });
    return { code: process.exitCode ?? 0, out: lines.join('\n') + '\n' };
  } finally {
    console.log = originalLog;
    process.exitCode = previousExitCode;
  }
}

function flowLines(out) {
  return out.split('\n').filter((line) => /Insight flow/i.test(line));
}

function assertWindow(line) {
  assert.match(line, /2026-08-28/);
  assert.match(line, /2026-08-30/);
}

function measuredProject(prefix) {
  const root = tempProject(prefix);
  initGit(root);
  commit(root, 'feat: establish project history', '2026-08-27');
  return root;
}

describe('doctor insight-flow observation', () => {
  test('P1 reports one shared three-day window with structural fix and insight counts', () => {
    const root = measuredProject();
    try {
      commit(root, 'fix: first in-window repair', WINDOW_DATES[0]);
      commit(root, 'fix(api): second in-window repair', WINDOW_DATES[1]);
      commit(root, 'fix: third in-window repair', WINDOW_DATES[2]);
      commit(root, 'feat: fix wording in documentation', WINDOW_DATES[2]);
      commit(root, 'docs: describe fix commits', WINDOW_DATES[2]);
      commit(root, 'fix: outside the window', '2026-08-31');
      writeInsights(root, [
        { date: '2026-08-27', title: 'Outside before' },
        { date: WINDOW_DATES[0], title: 'First in window' },
        { date: WINDOW_DATES[2], title: 'Second in window' },
        { date: '2026-08-31', title: 'Outside after' },
      ]);

      const result = runDoctor(root);
      const lines = flowLines(result.out);
      assert.equal(lines.length, 1, result.out);
      assertWindow(lines[0]);
      assert.match(lines[0], /3 fix commits/);
      assert.match(lines[0], /2 insight records/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P2 reports A1 no repository as not performed without changing exit code', () => {
    const root = tempProject();
    try {
      const result = runDoctor(root);
      const lines = flowLines(result.out);
      assert.equal(lines.length, 1, result.out);
      assert.match(lines[0], /check NOT performed/);
      assert.match(lines[0], /not a git repository/);
      assert.doesNotMatch(lines[0], /0 fix commits/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P3 reports A2 no readable history as not performed without changing exit code', () => {
    const root = tempProject();
    try {
      initGit(root);
      const result = runDoctor(root);
      const lines = flowLines(result.out);
      assert.equal(lines.length, 1, result.out);
      assert.match(lines[0], /check NOT performed/);
      assert.match(lines[0], /no readable git history/);
      assert.doesNotMatch(lines[0], /0 fix commits/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P4 treats A3 missing insights carrier as measured zero', () => {
    const root = measuredProject();
    try {
      commit(root, 'fix: measured without a carrier', WINDOW_DATES[1]);
      const result = runDoctor(root);
      const line = flowLines(result.out)[0] || '';
      assertWindow(line);
      assert.match(line, /1 fix commit(?:s)?/);
      assert.match(line, /0 insight records/);
      assert.doesNotMatch(line, /NOT performed/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P5 treats A4 zero fix commits as measured zero', () => {
    const root = measuredProject();
    try {
      commit(root, 'feat: in-window non-fix work', WINDOW_DATES[1]);
      writeInsights(root, [{ date: WINDOW_DATES[1], title: 'One measured insight' }]);
      const result = runDoctor(root);
      const line = flowLines(result.out)[0] || '';
      assertWindow(line);
      assert.match(line, /0 fix commits/);
      assert.match(line, /1 insight record(?:s)?/);
      assert.doesNotMatch(line, /NOT performed/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P6 keeps claimant-shaped 19/0 evidence neutral and non-gating', () => {
    const root = measuredProject();
    try {
      for (let i = 1; i <= 19; i += 1) {
        commit(root, `fix: claimant-shaped repair ${i}`, WINDOW_DATES[(i - 1) % 3]);
      }
      const result = runDoctor(root);
      const lines = flowLines(result.out);
      assert.equal(lines.length, 1, result.out);
      assertWindow(lines[0]);
      assert.match(lines[0], /19 fix commits/);
      assert.match(lines[0], /0 insight records/);
      assert.doesNotMatch(lines[0], /healthy|clean|few|warning|problem|broken|unused|capture/i);
      assert.doesNotMatch(lines[0], /[✓✗⚠!]/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P7 re-reads git and insights on each invocation', () => {
    const root = measuredProject();
    try {
      commit(root, 'fix: first live repair', WINDOW_DATES[0]);
      const index = writeInsights(root,
        [{ date: WINDOW_DATES[0], title: 'First live insight' }]);
      const first = flowLines(runDoctor(root).out)[0] || '';
      assert.match(first, /1 fix commit(?:s)?/);
      assert.match(first, /1 insight record(?:s)?/);

      commit(root, 'fix(core): second live repair', WINDOW_DATES[2]);
      fs.appendFileSync(index, [
        `## ${WINDOW_DATES[2]} — Second live insight`,
        '',
        '**Problem:** Changed after the first doctor run.',
        '',
        '**Solution:** Read the carrier again.',
        '',
      ].join('\n'));
      const second = flowLines(runDoctor(root).out)[0] || '';
      assert.match(second, /2 fix commits/);
      assert.match(second, /2 insight records/);
    } finally { cleanup(root); }
  });

  test('P8 reports an unreadable insight carrier as not performed', () => {
    const root = measuredProject();
    try {
      commit(root, 'fix: carrier failure remains unknown', WINDOW_DATES[1]);
      const index = path.join(root, '.claude', 'insights', 'index.md');
      fs.mkdirSync(index, { recursive: true });
      const result = runDoctor(root);
      const line = flowLines(result.out)[0] || '';
      assert.match(line, /check NOT performed/);
      assert.match(line, /insight carrier.*unreadable/i);
      assert.doesNotMatch(line, /insight records/);
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });

  test('P9 preserves existing zero and nonzero doctor exits across flow states', () => {
    for (const broken of [false, true]) {
      const root = tempProject();
      try {
        if (broken) {
          fs.rmSync(path.join(root, '.claude', 'rules', 'docker-ports.md'));
        }
        const expected = broken ? 1 : 0;
        const noRepository = runDoctor(root);
        assert.equal(noRepository.code, expected, noRepository.out);
        assert.match(flowLines(noRepository.out)[0] || '', /NOT performed/);

        initGit(root);
        commit(root, 'fix: measured state', WINDOW_DATES[1]);
        const measured = runDoctor(root);
        assert.equal(measured.code, expected, measured.out);
        assert.match(flowLines(measured.out)[0] || '', /1 fix commit(?:s)?/);

        const index = path.join(root, '.claude', 'insights', 'index.md');
        fs.mkdirSync(index, { recursive: true });
        const unavailable = runDoctor(root);
        assert.equal(unavailable.code, expected, unavailable.out);
        assert.match(flowLines(unavailable.out)[0] || '', /NOT performed/);
      } finally { cleanup(root); }
    }
  });

  test('P10 package scripts include the doctor insight-flow suite', () => {
    const pkg = require(path.join(PKG, 'package.json'));
    for (const name of ['test', 'test:unit']) {
      const occurrences = pkg.scripts[name]
        .split('doctor-insight-flow.test.js').length - 1;
      assert.equal(occurrences, 1, `${name} must run the suite exactly once`);
    }
  });

  test('P11 README describes the doctor insight-flow observation as informational and non-gating', () => {
    const readme = fs.readFileSync(path.join(PKG, 'README.md'), 'utf8');
    const start = readme.indexOf('### Doctor insight-flow observation');
    const end = readme.indexOf('\n### ', start + 1);
    assert.ok(start >= 0 && end > start, 'README must contain a bounded doctor insight-flow section');
    const section = readme.slice(start, end);
    assert.match(section, /three calendar days/i);
    assert.match(section, /git history/i);
    assert.match(section, /\.claude\/insights\/index\.md/);
    assert.match(section, /fix commits[\s\S]*insight records/i);
    assert.match(section, /check NOT performed/);
    assert.match(section, /does not change[^.]*exit status/i);
    assert.match(section, /does not interpret|no threshold/i);
    assert.doesNotMatch(section, /19\s+fix|0\s+insight/i,
      'claimant field figures are not locally reproduced product evidence');
  });

  test('P12 uses argument-array git execution for metacharacter paths and subjects', () => {
    const root = measuredProject('p rep ; touch P12_SIDE_EFFECT ; ');
    try {
      commit(root, 'fix(shell): $(touch P12_SUBJECT_SIDE_EFFECT)', WINDOW_DATES[1]);
      const result = runDoctor(root);
      const line = flowLines(result.out)[0] || '';
      assert.match(line, /1 fix commit(?:s)?/);
      assert.equal(fs.existsSync(path.join(root, 'P12_SIDE_EFFECT')), false,
        'targetDir metacharacters must never reach a shell');
      assert.equal(fs.existsSync(path.join(root, 'P12_SUBJECT_SIDE_EFFECT')), false,
        'commit subjects are data, never executable text');
      assert.equal(result.code, 0, result.out);
    } finally { cleanup(root); }
  });
});
