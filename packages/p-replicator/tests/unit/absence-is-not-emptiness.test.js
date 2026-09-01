'use strict';

// A thing that is there but says nothing was reported as fine, in two places a caller reads for the
// same purpose: "is my toolkit intact?".
//
// REPRODUCED 2026-08-27 before the fix: 31 files truncated to zero bytes — every SKILL.md, command,
// rule and agent — and `verify` printed "[OK] All artifacts verified." with exit 0, `doctor` likewise.
// DELETING a file was caught (exit 1). Cause: fileExists() is fs.accessSync — it asks whether the
// path resolves, never what is in it.
//
// Why that is worse than it looks, and the evidence is from the same day: a twin test against the
// harness's own registration event measured that a SKILL.md without YAML frontmatter is NOT
// registered (35 -> 36 -> 37 as frontmatter was added). A zero-byte SKILL.md certainly has none. So
// "all artifacts verified" over 31 empty files asserts the integrity of a toolkit that cannot load.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const CLI = path.join(PKG, 'bin', 'cli.js');

/** A fresh install in a throwaway directory. */
function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-empty-')));
  execFileSync(process.execPath, [CLI, 'init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

const run = (dir, cmd) => {
  const r = spawnSync(process.execPath, [CLI, cmd], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

describe('an artifact that is there but says nothing is not verified', () => {
  test('P1 - truncated artifacts fail both health checks and are named', () => {
    const dir = project();
    try {
      const victims = [
        path.join(dir, '.claude', 'rules', 'docker-ports.md'),
        path.join(dir, '.claude', 'commands', 'replicate.md'),
        path.join(dir, '.claude', 'skills', 'explore', 'SKILL.md'),
      ];
      for (const f of victims) fs.writeFileSync(f, '');

      const v = run(dir, 'verify');
      assert.notEqual(v.code, 0,
        'a toolkit whose skills cannot load is not verified: ' + v.out);
      const d = run(dir, 'doctor');
      assert.notEqual(d.code, 0, 'doctor must agree with verify: ' + d.out);

      // NAMED, not counted. A count sends a reader to inspect files by hand.
      for (const f of victims) {
        const base = path.basename(f) === 'SKILL.md' ? 'explore' : path.basename(f, '.md');
        assert.ok(v.out.includes(base),
          'verify must name the offending artifact ' + base + ': ' + v.out);
      }
    } finally { cleanup(dir); }
  });

  test('P2 - whitespace-only counts as empty', () => {
    // A file holding a newline is exactly as dead as one holding nothing, and a naive size check
    // would pass it.
    const dir = project();
    try {
      fs.writeFileSync(path.join(dir, '.claude', 'rules', 'git-workflow.md'), '\n   \n\t\n');
      const v = run(dir, 'verify');
      assert.notEqual(v.code, 0, 'whitespace is not content: ' + v.out);
    } finally { cleanup(dir); }
  });

  test('P3 - missing and empty stay SEPARABLE words', () => {
    // Their cures differ: missing -> run update; empty -> something truncated your file, and update
    // would silently repair it without you ever learning that. Naming both "missing" moves the
    // silence up one level instead of removing it.
    const dirA = project();
    const dirB = project();
    try {
      fs.rmSync(path.join(dirA, '.claude', 'rules', 'docker-ports.md'));
      fs.writeFileSync(path.join(dirB, '.claude', 'rules', 'docker-ports.md'), '');
      const a = run(dirA, 'verify');
      const b = run(dirB, 'verify');
      assert.notEqual(a.code, 0);
      assert.notEqual(b.code, 0);
      assert.match(a.out, /missing/i, 'a deleted artifact is missing: ' + a.out);
      assert.match(b.out, /empty|пуст/i, 'a truncated artifact is EMPTY, not missing: ' + b.out);
      assert.ok(!/\bempty\b/i.test(a.out.split('\n').filter((l) => l.includes('docker-ports')).join('\n')),
        'the deleted one must not be called empty: ' + a.out);
    } finally { cleanup(dirA); cleanup(dirB); }
  });

  test('P4 - fileExists keeps its old meaning', () => {
    // 31 call sites. Several ask a genuine presence question about files that may legitimately hold
    // nothing. This asserts the old predicate was NOT repurposed — a future reader must not "fix" it.
    const { fileExists } = require(path.join(PKG, 'src', 'utils.js'));
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-fe-')));
    try {
      const f = path.join(dir, 'empty.txt');
      fs.writeFileSync(f, '');
      assert.equal(fileExists(f), true,
        'fileExists answers about PRESENCE and must keep doing so');
      assert.equal(fileExists(path.join(dir, 'nope.txt')), false);
    } finally { cleanup(dir); }
  });

  test('P5 - artifactState reports three states', () => {
    const { artifactState } = require(path.join(PKG, 'src', 'utils.js'));
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-as-')));
    try {
      fs.writeFileSync(path.join(dir, 'empty.txt'), '');
      fs.writeFileSync(path.join(dir, 'ws.txt'), '  \n\t ');
      fs.writeFileSync(path.join(dir, 'real.txt'), 'content');
      assert.equal(artifactState(path.join(dir, 'nope.txt')), 'missing');
      assert.equal(artifactState(path.join(dir, 'empty.txt')), 'empty');
      assert.equal(artifactState(path.join(dir, 'ws.txt')), 'empty');
      assert.equal(artifactState(path.join(dir, 'real.txt')), 'present');
    } finally { cleanup(dir); }
  });

  test('P6 - none of the three insights states changes the exit code', () => {
    // A project that has recorded no insight is a NEW project. A check that refuses a new project is
    // a check people disable, and then the real signal goes with it. The defect was never the
    // emptiness — it was that emptiness and ABSENCE were indistinguishable, so a carrier that never
    // existed looked exactly like one being used and found empty. That is how 27 recorded insights
    // became 0 without anyone noticing.
    const dir = project();
    try {
      const idx = path.join(dir, '.claude', 'insights', 'index.md');

      const absent = run(dir, 'doctor');
      assert.equal(absent.code, 0, 'a fresh project must not fail: ' + absent.out);

      fs.mkdirSync(path.dirname(idx), { recursive: true });
      fs.writeFileSync(idx, '# Insights\n');
      const zero = run(dir, 'doctor');
      assert.equal(zero.code, 0, 'zero entries must not fail either: ' + zero.out);

      const writer = path.join(dir, '.claude', 'hooks', 'write-insight.cjs');
      const written = spawnSync(process.execPath, [writer], {
        cwd: dir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
        input: JSON.stringify({
          date: '2026-08-30',
          title: 'Doctor reads writer output',
          tags: ['doctor'],
          problem: 'A synthetic fixture could drift from the real writer format.',
          solution: 'Create the populated state through the installed writer.',
          references: ['tests/unit/absence-is-not-emptiness.test.js'],
        }),
        encoding: 'utf8',
      });
      assert.equal(written.status, 0, written.stderr || written.stdout);
      const some = run(dir, 'doctor');
      assert.equal(some.code, 0);

      // Three states, three DIFFERENT strings. Two that read alike are the defect.
      // Specific: the component list also contains the word 'insights' (/myinsights, session-insights.cjs).
      const lineOf = (out) => (out.split('\n').find((l) => /insights carrier/i.test(l)) || '').trim();
      const [a, z, s] = [lineOf(absent.out), lineOf(zero.out), lineOf(some.out)];
      assert.ok(a && z && s, 'doctor must say something about insights in all three states: '
        + JSON.stringify([a, z, s]));
      assert.notEqual(a, z, 'ABSENT and ZERO-ENTRY must not read alike: ' + JSON.stringify([a, z]));
      assert.notEqual(z, s, 'ZERO-ENTRY and POPULATED must not read alike: ' + JSON.stringify([z, s]));
    } finally { cleanup(dir); }
  });

  test('P8 - doctor says EMPTY for every component kind, settings included', () => {
    // Cross-family review found my first pass swapped the CONDITION to artifactState and left the
    // two-way branch, so a whitespace-only artifact was reported as "missing" — the exact collapse
    // AR-4 forbids. Worse: settings.json and the hooks were still on fileExists, so a ZERO-BYTE
    // settings.json — no hooks wired at all — received a checkmark.
    //
    // Matched on the EXACT label the line carries, not a substring: `replicate` also occurs inside
    // `replicate-coordinator`, and a loose matcher read a passing line as the failing one. Third
    // time this class has bitten today.
    const dir = project();
    try {
      const victims = {
        '/replicate': path.join(dir, '.claude', 'commands', 'replicate.md'),
        'doc-validator': path.join(dir, '.claude', 'agents', 'doc-validator.md'),
        'docker-ports': path.join(dir, '.claude', 'rules', 'docker-ports.md'),
        'explore': path.join(dir, '.claude', 'skills', 'explore', 'SKILL.md'),
        'settings.json': path.join(dir, '.claude', 'settings.json'),
      };
      for (const f of Object.values(victims)) fs.writeFileSync(f, '  \n\t ');

      const d = run(dir, 'doctor');
      assert.notEqual(d.code, 0, d.out);
      for (const label of Object.keys(victims)) {
        const line = d.out.split('\n')
          .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
          .find((l) => l.startsWith('\u2717 ' + label + ' ') || l === '\u2717 ' + label);
        assert.ok(line, label + ' must appear as a FAILING line: ' + d.out);
        assert.match(line, /EMPTY, cannot load/,
          label + ' must be EMPTY, not missing and never a checkmark: ' + JSON.stringify(line));
      }
    } finally { cleanup(dir); }
  });

  test('P10 - a zero-byte HOOK is reported too, when settings.json still parses', () => {
    // The hook checks live inside the branch that runs only when settings.json is readable, so P8
    // cannot reach them: killing settings.json hides its own children. Asserted separately, which
    // is the honest shape — and it proves the hook path is on artifactState, not fileExists.
    const dir = project();
    try {
      fs.writeFileSync(path.join(dir, '.claude', 'hooks', 'check-ports.cjs'), '');
      const d = run(dir, 'doctor');
      assert.notEqual(d.code, 0, d.out);
      const line = d.out.split('\n')
        .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
        .find((l) => l.startsWith('\u2717 check-ports.cjs'));
      assert.ok(line, 'a zero-byte hook must not receive a checkmark: ' + d.out);
      assert.match(line, /EMPTY, cannot load/, line);
    } finally { cleanup(dir); }
  });

  test('P9 - verify reports the carrier in all three states, failing none', () => {
    // FR-5 asks for three SURFACES. The first pass shipped two and left verify producing identical
    // output for absent, empty and populated — the same indistinguishability, one surface over.
    const dir = project();
    try {
      const idx = path.join(dir, '.claude', 'insights', 'index.md');
      const seen = [];
      const carrierLine = (out) => (out.split('\n').find((l) => /insights carrier/i.test(l)) || '').trim();

      let r = run(dir, 'verify'); seen.push(carrierLine(r.out));
      assert.equal(r.code, 0, 'a fresh project must not fail verify: ' + r.out);

      fs.mkdirSync(path.dirname(idx), { recursive: true });
      fs.writeFileSync(idx, '# Insights\n');
      r = run(dir, 'verify'); seen.push(carrierLine(r.out));
      assert.equal(r.code, 0, 'zero entries must not fail verify: ' + r.out);

      fs.writeFileSync(idx, '# Insights\n\n## 2026-08-27 — a rake\n\nBody.\n');
      r = run(dir, 'verify'); seen.push(carrierLine(r.out));
      assert.equal(r.code, 0);

      assert.ok(seen.every(Boolean), 'verify must say something in all three states: ' + JSON.stringify(seen));
      assert.equal(new Set(seen).size, 3, 'three states, three DIFFERENT lines: ' + JSON.stringify(seen));
    } finally { cleanup(dir); }
  });

  test('P7 - the statusline distinguishes no-carrier from zero-entries', () => {
    const dir = project();
    try {
      const hook = path.join(dir, '.claude', 'hooks', 'statusline.cjs');
      const strip = new RegExp('\\x1b\\[[0-9;]*m', 'g');
      const render = () => spawnSync(process.execPath, [hook],
        { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' })
        .stdout.replace(strip, '');

      const absent = render();
      const idx = path.join(dir, '.claude', 'insights', 'index.md');
      fs.mkdirSync(path.dirname(idx), { recursive: true });
      fs.writeFileSync(idx, '# Insights\n');
      const zero = render();

      const seg = (out) => (out.split('\n').find((l) => /Insight/i.test(l)) || '');
      assert.notEqual(seg(absent), seg(zero),
        'a carrier that never existed rendered identically to one found empty — that is the defect: '
        + JSON.stringify([seg(absent), seg(zero)]));
    } finally { cleanup(dir); }
  });
});
