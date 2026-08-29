'use strict';

// All three autocommit hooks opened with `if (!fs.existsSync(TARGET)) process.exit(0);`, so a DELETED
// roadmap was "nothing to do" — though a deletion is exactly the change these hooks exist to record.
// The history showed the file being maintained and then, silently, not.
//
// THE TRAP, measured before a line was written: simply deleting that guard breaks the failure
// reporting that shipped the day before.
//
//   git add -- <a path that never existed>   → exit 128, "fatal: pathspec … did not match any files"
//   git add -- <a tracked file, deleted>     → exit 0, and diff --cached then reports a change
//
// A failing git call now prints one line, so the naive fix would print a failure on EVERY session
// stop in every project without this artifact — which is most of them. That is the noise the same
// feature's own comment warns trains people to ignore notices. P3 is the guard on it.
//
// The discriminator is `git ls-files -- <path>`: entries for a path git knows, nothing for one it
// does not. It must run BEFORE staging: staging a deletion removes the entry from the index, after
// which the same question answers "not tracked". (`--error-unmatch` discriminates just as well, for
// files and directories alike — an earlier note here said otherwise and was withdrawn after
// re-measuring. `ls-files --` is preferred only because it answers with data instead of throwing.)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');

const HOOKS = [
  { name: 'autocommit-roadmap', remove: /auto-remove/,
    make: (root) => {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      const f = path.join(root, '.claude', 'feature-roadmap.json');
      fs.writeFileSync(f, '{"v":1}\n');
      return { drop: () => fs.rmSync(f), touch: () => fs.writeFileSync(f, '{"v":2}\n') };
    } },
  { name: 'autocommit-insights', remove: /auto-remove/,
    make: (root) => {
      const d = path.join(root, '.claude', 'insights');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'index.md'), '## one\n');
      return { drop: () => fs.rmSync(d, { recursive: true }),
        touch: () => fs.writeFileSync(path.join(d, 'index.md'), '## one\n## two\n') };
    } },
  { name: 'autocommit-plans', remove: /auto-remove/,
    make: (root) => {
      const d = path.join(root, 'docs', 'plans');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'a.md'), '# plan\n');
      return { drop: () => fs.rmSync(d, { recursive: true }),
        touch: () => fs.writeFileSync(path.join(d, 'a.md'), '# plan v2\n') };
    } },
];

function project(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-del-')));
  fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
  for (const h of HOOKS) {
    fs.copyFileSync(path.join(TPL, 'hooks', h.name + '.cjs'),
      path.join(root, '.claude', 'hooks', h.name + '.cjs'));
  }
  if (o.git !== false) {
    const git = (a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'test']);
  }
  return root;
}

const git = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const commitAll = (root) => {
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: root, stdio: 'ignore' });
};

function run(root, hookName) {
  const r = spawnSync(process.execPath,
    [path.join(root, '.claude', 'hooks', hookName + '.cjs')],
    { cwd: root, env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root }),
      encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

describe('a deleted artifact is recorded, and an absent one is still silent', () => {
  test('P1 — deleting a tracked target produces a commit and leaves the tree clean', () => {
    const root = project({});
    try {
      const h = HOOKS[0];
      const ctl = h.make(root);
      commitAll(root);
      const before = Number(git(root, ['rev-list', '--count', 'HEAD']));
      ctl.drop();

      const r = run(root, h.name);
      assert.equal(r.code, 0, 'the hook must stay non-blocking: ' + r.out);
      assert.equal(Number(git(root, ['rev-list', '--count', 'HEAD'])), before + 1,
        'the deletion must be committed, not treated as nothing to do');
      assert.equal(git(root, ['status', '--porcelain']), '',
        'and the tree must be left clean, not merely staged');
    } finally { cleanup(root); }
  });

  test('P2 — the commit names the removal, so the event is findable in the log', () => {
    // The owner's stated purpose: be able to spot the event and undo it. A deletion recorded as
    // "auto-update" is findable only by reading diffs.
    const root = project({});
    try {
      const h = HOOKS[0];
      const ctl = h.make(root);
      commitAll(root);
      ctl.drop();
      run(root, h.name);
      const subject = git(root, ['log', '-1', '--format=%s']);
      assert.match(subject, h.remove,
        'the subject must say the artifact was removed: ' + JSON.stringify(subject));
    } finally { cleanup(root); }
  });

  test('P3 — a project that never had the artifact stays SILENT', () => {
    // The guard on the naive fix. Deleting the existence check outright would make `git add` exit
    // 128 here, and the failure reporting that shipped yesterday would print a line on every session
    // stop in every project without this artifact.
    const root = project({});
    try {
      fs.writeFileSync(path.join(root, 'unrelated.txt'), 'x\n');
      commitAll(root);
      for (const h of HOOKS) {
        const r = run(root, h.name);
        assert.equal(r.code, 0, h.name + ' must exit 0');
        assert.equal(r.out.trim(), '',
          h.name + ' printed something for an artifact this project never had: ' + r.out);
      }
      assert.equal(git(root, ['rev-list', '--count', 'HEAD']), '1',
        'and nothing may be committed');
    } finally { cleanup(root); }
  });

  test('P4 — not a git repository: silent, exit 0', () => {
    const root = project({ git: false });
    try {
      const r = run(root, HOOKS[0].name);
      assert.equal(r.code, 0);
      assert.equal(r.out.trim(), '', 'not-a-repo is not a failure to report: ' + r.out);
    } finally { cleanup(root); }
  });

  test('P5 — an existing, changed target still commits as before', () => {
    const root = project({});
    try {
      const h = HOOKS[0];
      const ctl = h.make(root);
      commitAll(root);
      ctl.touch();
      const before = Number(git(root, ['rev-list', '--count', 'HEAD']));
      assert.equal(run(root, h.name).code, 0);
      assert.equal(Number(git(root, ['rev-list', '--count', 'HEAD'])), before + 1,
        'the ordinary update path must be untouched');
      assert.doesNotMatch(git(root, ['log', '-1', '--format=%s']), /auto-remove/,
        'and an update must NOT be labelled a removal');
    } finally { cleanup(root); }
  });

  test('P6 — an existing, unchanged target is silent', () => {
    const root = project({});
    try {
      const h = HOOKS[0];
      h.make(root);
      commitAll(root);
      const before = Number(git(root, ['rev-list', '--count', 'HEAD']));
      const r = run(root, h.name);
      assert.equal(r.code, 0);
      assert.equal(r.out.trim(), '', 'nothing to commit must stay silent: ' + r.out);
      assert.equal(Number(git(root, ['rev-list', '--count', 'HEAD'])), before,
        'and must not create an empty commit');
    } finally { cleanup(root); }
  });

  test('P8 — a PARTIAL deletion is still a removal, even though the directory remains', () => {
    // Cross-family QE: classifying from `existsSync` on the DIRECTORY was wrong. Deleting one file
    // inside it — or every tracked file while an ignored one keeps the directory present — left the
    // path existing, so the commit said "auto-save" and the removal was unfindable by the very
    // search this feature promises. The classification now comes from what git actually STAGED.
    const root = project({});
    try {
      const d = path.join(root, 'docs', 'plans');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'a.md'), 'a\n');
      fs.writeFileSync(path.join(d, 'b.md'), 'b\n');
      commitAll(root);
      fs.rmSync(path.join(d, 'a.md'));           // the directory still exists

      const r = run(root, 'autocommit-plans');
      assert.equal(r.code, 0, r.out);
      assert.ok(fs.existsSync(d), 'the fixture must leave the directory in place');
      assert.match(git(root, ['log', '-1', '--format=%s']), /auto-remove/,
        'one deleted file inside a surviving directory is still a removal: '
        + git(root, ['log', '-1', '--format=%s']));
    } finally { cleanup(root); }
  });

  test('P9 — a real git failure is not laundered into "never existed"', () => {
    // The `ls-files` answer decides whether a deletion is recorded at all. A bare catch that turned
    // every failure into an empty answer would silently skip the deletion — a bypass of the feature
    // itself, wearing the shape of the ordinary case.
    for (const h of HOOKS) {
      const src = fs.readFileSync(path.join(TPL, 'hooks', h.name + '.cjs'), 'utf-8');
      const at = src.indexOf("git(['ls-files'");
      assert.ok(at > 0, h.name + ' must ask git whether the path is tracked');
      const around = src.slice(at - 200, at + 200);
      assert.ok(!/catch\s*\{\s*tracked\s*=\s*''/.test(around),
        h.name + ' swallows a real ls-files failure as "not tracked": ' + around);
    }
  });

  test('P7 — all three hooks record their own deletion identically', () => {
    // Two of the three watch a DIRECTORY rather than a file, so the deletion path has to work for
    // both shapes — that is what this case proves, and it is why the fixtures differ.
    for (const h of HOOKS) {
      const root = project({});
      try {
        const ctl = h.make(root);
        commitAll(root);
        const before = Number(git(root, ['rev-list', '--count', 'HEAD']));
        ctl.drop();
        const r = run(root, h.name);
        assert.equal(r.code, 0, h.name + ' must exit 0: ' + r.out);
        assert.equal(Number(git(root, ['rev-list', '--count', 'HEAD'])), before + 1,
          h.name + ' did not record its deletion');
        assert.match(git(root, ['log', '-1', '--format=%s']), h.remove,
          h.name + ' did not name the removal');
      } finally { cleanup(root); }
    }
  });
});
