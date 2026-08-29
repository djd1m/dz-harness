'use strict';

// scripts/sync-templates.js copies <found root>/.claude/{skills,commands,agents,rules,hooks} over
// templates/.claude/ — the directory that becomes the npm tarball. It finds its source by walking up
// to five parents and taking the FIRST one containing .claude/skills, which inside a monorepo is the
// MONOREPO, whose .claude/skills holds a whole different toolkit.
//
// Nothing had fired only because package.json's prepublishOnly points at the publish gate, not here.
// "Safe because dead" is not a safety property: a dead script can be revived by anyone who does not
// know what it does — and two places used to invite exactly that, a test helper printing
// "Run prepublishOnly first: node scripts/sync-templates.js" and an architecture doc calling it the
// prepublishOnly hook.
//
// These tests run the REAL script as a real subprocess against real fixtures and compare the tree
// before and after, because a script that exits 0 having copied two hundred files and one that exits
// 0 having copied nothing look identical from the outside.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Is this copy sitting inside the monorepo?
 *
 * A POSITIVE fact — the sibling packages EXIST — never the absence of something. An absence-based
 * check would also fire on a broken checkout and quietly disable the guard exactly when something
 * is wrong.
 *
 * MEASURED 2026-08-27: `npm test` from the published 1.9.0 tarball was 288/296. Both failures were
 * monorepo-only BY CONSTRUCTION — one needs `scripts/`, which files[] does not ship; the other
 * compares copies across sibling PACKAGES. Neither says anything about a user's installation, and
 * shipping them red means a user who runs our tests is told their install is broken when it is not.
 *
 * The skip is only acceptable because tests/unit/shipped-suite-context.test.js asserts these files
 * RUN — not skip — inside the monorepo. Without that the skip rots into permanent the day this
 * detection breaks, and nothing would say so.
 */
function insideMonorepo() {
  const siblings = path.resolve(__dirname, '..', '..', '..');   // packages/@dzhechkov
  try {
    return fs.statSync(path.join(siblings, 'harness-core', 'package.json')).isFile();
  } catch { return false; }
}

const MONOREPO_ONLY = !insideMonorepo();
if (MONOREPO_ONLY) {
  console.log('# SKIP (monorepo-only): sibling package @dzhechkov/harness-core is not present, so '
    + 'this file cannot compare across packages. This says nothing about your installation.');
}

const PKG_DIR = path.resolve(__dirname, '..', '..');
const SCRIPT_SRC = path.join(PKG_DIR, 'scripts', 'sync-templates.js');
const MARKER = '.p-replicator-sync-source';
const DECLARATION = 'p-replicator-sync-source: v1';

/** A fixture shaped like the real geometry: <root>/.claude/skills, and the package one level down
 *  with its own templates/.claude tree. `marker` decides whether the root claims to be the source. */
function fixture(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-sync-')));
  if (o.rootHasClaude !== false) {
    fs.mkdirSync(path.join(root, '.claude', 'skills', 'intruder'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'skills', 'intruder', 'SKILL.md'),
      '# a skill that belongs to the monorepo, not to this package\n');
  }
  // A VALID marker is a regular file carrying the declaration. Cross-family QE: the first fixture
  // wrote an EMPTY file, which institutionalised exactly the weakest form of the authorization.
  if (o.marker === true) fs.writeFileSync(path.join(root, MARKER), DECLARATION + '\n');
  if (o.marker === 'empty') fs.writeFileSync(path.join(root, MARKER), '');
  if (o.marker === 'dir') fs.mkdirSync(path.join(root, MARKER));
  if (o.marker === 'symlink') {
    const real = path.join(root, 'elsewhere');
    fs.writeFileSync(real, DECLARATION + '\n');
    fs.symlinkSync(real, path.join(root, MARKER));
  }
  if (o.marker === 'wrong') fs.writeFileSync(path.join(root, MARKER), 'yes please\n');

  const pkg = path.join(root, 'packages', 'p-replicator');
  fs.mkdirSync(path.join(pkg, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT_SRC, path.join(pkg, 'scripts', 'sync-templates.js'));
  fs.mkdirSync(path.join(pkg, 'templates', '.claude', 'skills', 'shipped'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'templates', '.claude', 'skills', 'shipped', 'SKILL.md'),
    '# the package\'s own shipped skill\n');
  return { root, pkg };
}

/** SHA-256 of every file under a directory, keyed by relative path. */
function treeHash(dir) {
  const out = {};
  const walk = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const rel = path.join(base, e.name);
      if (e.isDirectory()) walk(full, rel);
      else out[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}

function runScript(pkgDir) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(pkgDir, 'scripts', 'sync-templates.js')],
      { cwd: pkgDir, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out: stdout || '' };
  } catch (err) {
    return {
      code: err.status == null ? 1 : err.status,
      out: (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : ''),
    };
  }
}

const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });
const readPkg = (rel) => fs.readFileSync(path.join(PKG_DIR, rel), 'utf-8');

describe.skip = describe.skip || (() => {});
(MONOREPO_ONLY ? describe.skip : describe)('a publish-time copy that was safe only because nobody called it', () => {
  test('P1 — an unmarked root is REFUSED, and not one byte of templates/ changes', () => {
    const f = fixture({});
    try {
      const templates = path.join(f.pkg, 'templates');
      const before = treeHash(templates);
      const r = runScript(f.pkg);
      const after = treeHash(templates);
      assert.notEqual(r.code, 0,
        'a refusal must exit non-zero; exit 0 is how a guard becomes invisible to a caller');
      assert.deepEqual(after, before,
        'the refusal path must touch nothing — the check has to precede every write, not follow it');
      assert.ok(!fs.existsSync(path.join(templates, '.claude', 'skills', 'intruder')),
        'the monorepo skill must not have arrived in what becomes the tarball');
    } finally { cleanup(f.root); }
  });

  test('P2 — the refusal says what it found and why, not just that it stopped', () => {
    const f = fixture({});
    try {
      const out = runScript(f.pkg).out;
      assert.match(out, /REFUSING to sync/, 'it must say it refused');
      assert.ok(out.includes(f.root),
        'and name the root it found, or the reader cannot tell which directory it objected to');
      assert.match(out, /becomes the npm tarball/,
        'and say what was at stake, or the refusal reads as a configuration nag');
      assert.ok(out.includes(DECLARATION),
        'and say how to opt in — quoting the exact declaration, or someone will delete the check');
      assert.match(out, /a directory, a symlink, or an empty file is NOT a declaration/,
        'and say which near-misses do not count, since those are the accidental ones');
    } finally { cleanup(f.root); }
  });

  test('P3 — a MARKED root still syncs: the guard must not break the legitimate path', () => {
    // A guard that also blocks the intended use is a deletion wearing a disguise.
    const f = fixture({ marker: true });
    try {
      const r = runScript(f.pkg);
      assert.equal(r.code, 0, 'an opted-in root must proceed: ' + r.out);
      assert.ok(fs.existsSync(path.join(f.pkg, 'templates', '.claude', 'skills', 'intruder', 'SKILL.md')),
        'and the source files must actually arrive');
      assert.ok(fs.existsSync(path.join(f.pkg, 'templates', '.claude', 'skills', 'shipped', 'SKILL.md')),
        'while MERGE mode preserves what the package already shipped');
    } finally { cleanup(f.root); }
  });

  test('P8 — a near-miss marker does NOT authorize: empty, directory, symlink, wrong text', () => {
    // Cross-family QE: any node satisfies existsSync, so an empty file committed by accident, or a
    // stray directory, would have permanently authorized overwriting the tarball. lstat keeps a
    // symlink from vouching for a tree this script cannot see, and the declaration is content nobody
    // types by accident.
    for (const kind of ['empty', 'dir', 'symlink', 'wrong']) {
      const f = fixture({ marker: kind });
      try {
        const templates = path.join(f.pkg, 'templates');
        const before = treeHash(templates);
        const r = runScript(f.pkg);
        assert.notEqual(r.code, 0, 'a ' + kind + ' marker must not authorize the copy');
        assert.deepEqual(treeHash(templates), before,
          'and must touch nothing: ' + kind);
      } finally { cleanup(f.root); }
    }
  });

  test('P9 — the script header does not claim to be the prepublishOnly hook', () => {
    // The same false claim lived in three places. Fixing the doc and the helper while leaving the
    // script's own docblock saying it "runs automatically before npm publish" would have left the
    // lie in the most authoritative one.
    const src = readPkg(path.join('scripts', 'sync-templates.js'));
    const header = src.slice(0, src.indexOf('const fs ='));
    assert.ok(!/prepublishOnly hook/.test(header),
      'the header must not call it the prepublishOnly hook');
    assert.ok(!/Run automatically before/.test(header),
      'nor say it runs automatically — it does not, and that belief is what gets it run');
    assert.match(header, /OPT-IN, and NOT part of publishing/,
      'it must say what it actually is, at the top where a reader looks first');
  });

  test('P4 — no candidate root at all: the pre-existing skip is unchanged', () => {
    const f = fixture({ rootHasClaude: false });
    try {
      const r = runScript(f.pkg);
      assert.equal(r.code, 0, 'this path was always benign and must stay exit 0: ' + r.out);
      assert.match(r.out, /Not in repo context — skipping sync/,
        'and keep its existing message — this feature adds a guard, it does not rewrite the script');
    } finally { cleanup(f.root); }
  });

  test('P5 — no helper tells a reader to run it', () => {
    // The helper printed "Run prepublishOnly first: node scripts/sync-templates.js" when templates/
    // was missing: a live invitation to the hazardous command, in the one situation where a reader
    // is already confused.
    assert.ok(!readPkg(path.join('tests', 'snapshot', 'update-baseline.js')).includes('sync-templates'),
      'update-baseline.js must not name the script as a recovery step');
  });

  test('P6 — the architecture doc no longer calls it the prepublishOnly hook', () => {
    // Being false in THIS direction is the worst one: it makes the script sound sanctioned and
    // current, which is exactly the belief that gets it run.
    const doc = readPkg(path.join('README', 'eng', '05_architecture.md'));
    assert.ok(!/`scripts\/sync-templates\.js` — runs as `prepublishOnly` hook/.test(doc),
      'the doc must not claim it runs as prepublishOnly — it does not');
    assert.match(doc, /refuses to run unless the root it finds carries a `\.p-replicator-sync-source` marker/,
      'and must record what it actually is now');
  });

  test('P7 — prepublishOnly does not point at it', () => {
    // The regression guard on the fact that kept it dormant. If someone wires it into publishing,
    // this goes red — and after this feature the guard would stop it anyway, which is the point:
    // reviving it is now safe rather than catastrophic.
    const pkg = JSON.parse(readPkg('package.json'));
    const hook = (pkg.scripts && pkg.scripts.prepublishOnly) || '';
    assert.ok(!hook.includes('sync-templates'),
      'publishing must not run the template overwrite: ' + hook);
    assert.match(hook, /prepublish-gate\.mjs/, 'publishing runs the gate');
  });
});
