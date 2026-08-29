'use strict';

// Each autocommit hook ended in a bare swallow — `catch (_err) { process.exit(0); }` — and the
// comment beside it said "never break Claude session on commit failures". The goal was right and the
// method was wrong: NOT BREAKING THE SESSION and SAYING NOTHING are different things, and only the
// first one is the contract, because the contract is about the exit code.
//
// This is not a hypothetical class. It is the class that hid a permanent defect: git commit put -m
// AFTER the `--`, so git read the message as a pathspec and every commit failed, from every
// directory, forever. Three hooks had never committed anything and nothing said so. It surfaced on
// 2026-08-26 only because a test asserted an EFFECT rather than an exit code.
//
// NOT changed here, and left to the owner: whether a DELETED target should be committed. That is a
// product question — is removing your roadmap something you want auto-committed? — and it is filed.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');

const HOOKS = [
  { name: 'autocommit-roadmap', artifact: '.claude/feature-roadmap.json',
    write: (root) => {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      return { file: path.join(root, '.claude', 'feature-roadmap.json'), body: '{"v":1}\n' };
    } },
  { name: 'autocommit-insights', artifact: '.claude/insights/',
    write: (root) => {
      fs.mkdirSync(path.join(root, '.claude', 'insights'), { recursive: true });
      return { file: path.join(root, '.claude', 'insights', 'index.md'), body: '## one\n' };
    } },
  { name: 'autocommit-plans', artifact: 'docs/plans/',
    write: (root) => {
      fs.mkdirSync(path.join(root, 'docs', 'plans'), { recursive: true });
      return { file: path.join(root, 'docs', 'plans', 'a.md'), body: '# plan\n' };
    } },
];

/** A project with the hooks installed. `identity` decides whether git can commit at all. */
function project(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-report-')));
  fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
  for (const h of HOOKS) {
    fs.copyFileSync(path.join(TPL, 'hooks', h.name + '.cjs'),
      path.join(root, '.claude', 'hooks', h.name + '.cjs'));
  }
  if (o.git !== false) {
    const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    git(['init', '-q']);
    // An EMPTY identity is a real, common failure: git refuses to commit and says why. It is the
    // cheapest way to drive the failure path without breaking the fixture in an artificial way.
    git(['config', 'user.email', o.identity === false ? '' : 'test@example.invalid']);
    git(['config', 'user.name', o.identity === false ? '' : 'test']);
  }
  return root;
}

/** Run a hook and capture BOTH streams. The stream matters: MEASURED in the Claude Code binary,
 *  a hook exiting 0 has its stderr discarded ("Exit code 0 - stdout/stderr not shown") while stdout
 *  can be surfaced ("Exit code 0 - stdout shown in transcript mode (ctrl+o)"). The first version of
 *  this feature wrote its notice to stderr — the one stream guaranteed to be invisible. */
function runHook(root, hookName) {
  const script = path.join(root, '.claude', 'hooks', hookName + '.cjs');
  const env = Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root });
  const out = require('node:child_process').spawnSync(process.execPath, [script],
    { cwd: root, env, encoding: 'utf8' });
  return { code: out.status, stdout: out.stdout || '', stderr: out.stderr || '' };
}

const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

describe('an autocommit hook that cannot commit says so, once, without blocking', () => {
  test('P1 — a real git failure is REPORTED, and the exit code is still 0', () => {
    const root = project({ identity: false });
    try {
      const h = HOOKS[0];
      const t = h.write(root);
      fs.writeFileSync(t.file, t.body);
      const r = runHook(root, h.name);
      assert.equal(r.code, 0,
        'the non-blocking contract is about the EXIT CODE and must be untouched');
      assert.ok(r.stdout.includes('[' + h.name + ']'),
        'the line must name the hook, or the reader cannot tell which artifact is uncommitted: '
        + r.stdout);
      assert.ok(r.stdout.includes(h.artifact),
        'and name the artifact: ' + r.stdout);
      // WHY, not just what. git's own words are the only thing that says why, and they are only
      // available because stderr is piped rather than ignored.
      assert.match(r.stdout, /identity/i,
        "git's own reason must survive into the message: " + r.stdout);
      assert.equal(r.stdout.trim().split('\n').length, 1,
        'exactly one line — a hook that floods output is a hook people silence: ' + r.stdout);
      assert.equal(r.stderr.trim(), '',
        'the notice must NOT go to stderr: a hook exiting 0 has its stderr discarded, so writing '
        + 'there is writing nowhere');
      // The stage must be accurate. The outer catch also sees staging failures and a missing git
      // binary, and calling either of those "could not commit" sends the reader to the wrong place.
      assert.match(r.stdout, /could not commit/,
        'this fixture fails AT the commit, so that is what the line must say: ' + r.stdout);
    } finally { cleanup(root); }
  });

  test('P2 — nothing to commit is SILENT: a notice that cries wolf gets ignored', () => {
    // The ordinary case, on most sessions, for all three hooks. If it printed, the next REAL failure
    // would scroll past with the noise.
    const root = project({});
    try {
      const h = HOOKS[0];
      const t = h.write(root);
      fs.writeFileSync(t.file, t.body);
      execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: root, stdio: 'ignore' });
      const r = runHook(root, h.name);
      assert.equal(r.code, 0);
      assert.equal(r.stdout.trim(), '',
        'the ordinary no-op path must stay silent: ' + r.stdout);
    } finally { cleanup(root); }
  });

  test('P3 — not a git repository at all: silent, exit 0', () => {
    const root = project({ git: false });
    try {
      const h = HOOKS[0];
      const t = h.write(root);
      fs.writeFileSync(t.file, t.body);
      const r = runHook(root, h.name);
      assert.equal(r.code, 0);
      assert.equal(r.stdout.trim(), '', 'not-a-repo is not a failure to report: ' + r.stdout);
    } finally { cleanup(root); }
  });

  test('P4 — the target is absent: silent, exit 0', () => {
    const root = project({});
    try {
      const r = runHook(root, HOOKS[0].name);
      assert.equal(r.code, 0);
      assert.equal(r.stdout.trim(), '',
        'an absent artifact is nothing to commit, not a failure: ' + r.stdout);
    } finally { cleanup(root); }
  });

  test('P7 — a repository probe failure other than a plain non-repo is reported', () => {
    // Every rev-parse failure used to be read as "not a git repository", so a machine with no git on
    // PATH, a dubious-ownership refusal, or a permission error looked exactly like an ordinary
    // non-repo directory. Two very different facts, one silence.
    const root = project({ git: false });
    try {
      const h = HOOKS[0];
      const t = h.write(root);
      fs.writeFileSync(t.file, t.body);
      // A directory owned by nobody this process can vouch for is hard to fake portably; the
      // distinction itself is asserted on the source, and the ordinary case is proven live by P3.
      const src = fs.readFileSync(path.join(TPL, 'hooks', h.name + '.cjs'), 'utf-8');
      assert.match(src, /not a git repository/i,
        'the ordinary case must be recognised by NAME, not by "any failure here is ordinary"');
      assert.match(src, /throw probeErr/,
        'and everything else must be re-thrown into the reporting path');
      assert.equal(runHook(root, h.name).code, 0, 'and the ordinary case still exits 0');
    } finally { cleanup(root); }
  });

  test('P5 — all three hooks behave identically', () => {
    // They are the same shape; a difference between them would be a second thing to remember.
    for (const h of HOOKS) {
      const root = project({ identity: false });
      try {
        const t = h.write(root);
        fs.writeFileSync(t.file, t.body);
        const r = runHook(root, h.name);
        assert.equal(r.code, 0, h.name + ' must exit 0');
        assert.ok(r.stdout.includes('[' + h.name + ']'),
          h.name + ' must report the failure too: ' + r.stdout);
      } finally { cleanup(root); }
    }
  });

  test('P6 — no hook still carries the bare swallow', () => {
    for (const h of HOOKS) {
      const src = fs.readFileSync(path.join(TPL, 'hooks', h.name + '.cjs'), 'utf-8');
      assert.ok(!/catch \(_err\) \{\s*(\/\/[^\n]*\n\s*)*process\.exit\(0\);\s*\}/.test(src),
        h.name + ' still swallows every failure without a word');
      assert.match(src, /process\.stdout\.write/,
        h.name + ' must report on stdout — stderr on exit 0 is discarded, so it is not a channel');
      assert.ok(!/process\.stderr\.write/.test(src),
        h.name + ' must not write its notice to the stream nobody reads');
      assert.match(src, /let stage = 'start'/,
        h.name + ' must track WHICH operation failed, or "could not commit" is claimed for a '
        + 'staging failure and a missing git binary too');
      // The reason is only available because git's stderr is piped. Ignoring it leaves a message
      // that names what failed and not why, which is half a report.
      // The PROPERTY is that git's stderr is captured, not the exact array. The first version pinned
      // ['ignore','ignore','pipe'] literally and went red when stdout was later piped too — for a
      // different feature that needed to READ a git answer. Pinning a shape instead of a property
      // makes a compatible change look like a regression.
      const stdio = src.match(/const SILENT = \{ stdio: (\[[^\]]*\])/);
      assert.ok(stdio, h.name + ' must configure git stdio explicitly');
      const streams = JSON.parse(stdio[1].replace(/'/g, '"'));
      assert.equal(streams[2], 'pipe',
        h.name + " must capture git's own words on stderr rather than discard them: " + stdio[1]);
    }
  });
});
