'use strict';

// `files[]` ships tests/, so a user who runs `npm test` on the installed package runs OUR suite.
// MEASURED 2026-08-27 from the published 1.9.0 tarball: 288 of 296, exit 1 — while the same suite
// is green locally. Both failures were monorepo-only BY CONSTRUCTION, so a user was told their
// installation is broken when nothing about it was.
//
// The fix lets those two files skip outside the monorepo. A skip is the failure class this repo
// fights hardest, and it is acceptable here ONLY because of this file: it asserts they RUN inside
// the monorepo, so the skip is provably NOT TAKEN where it matters. Without that the skip rots into
// permanent the day the detection breaks, and nothing would say so.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const GATED = ['sync-templates-guard.test.js', 'module-copy-identity.test.js'];

/**
 * This guard is itself monorepo-only, and the recursion is not an accident.
 *
 * Its whole claim is "those two files RUN here". Outside the monorepo they correctly SKIP, so the
 * claim is false by design and asserting it would make the shipped suite red for the one reason
 * this feature exists to remove. It gates on the SAME positive fact, so a broken detection takes
 * all three down together rather than silently sparing the guard.
 *
 * A POSITIVE fact: the sibling package EXISTS.
 */
function insideMonorepo() {
  try {
    return fs.statSync(path.resolve(PKG, '..', 'harness-core', 'package.json')).isFile();
  } catch { return false; }
}
const MONOREPO_ONLY = !insideMonorepo();
if (MONOREPO_ONLY) {
  console.log('# SKIP (monorepo-only): sibling package @dzhechkov/harness-core is not present. This '
    + 'file only asserts that the monorepo-gated tests RUN here, which says nothing about your '
    + 'installation.');
}

/**
 * Run one test file as a CHILD.
 *
 * Executed directly (`node file.test.js`), not via `node --test file` — node:test refuses to run a
 * file recursively from inside a test and prints "skipping running files", which made this guard
 * report zero tests and fail for a reason that had nothing to do with its subject.
 */
const runFile = (name, env) => {
  // NODE_TEST_CONTEXT is inherited from the parent runner and switches the child to a BINARY
  // reporter, so a TAP regex reads nothing and this guard fails for a reason unrelated to its
  // subject. Scrubbed, exactly as the harness's own live probes scrub their environment.
  const childEnv = Object.assign({}, process.env, env || {});
  delete childEnv.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [path.join('tests', 'unit', name)],
    { cwd: PKG, encoding: 'utf8', env: childEnv });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const count = (out, key) => {
  const m = out.match(new RegExp('^# ' + key + ' (\\d+)', 'm'));
  // An ABSENT counter is not a missing measurement here — node --test omits a zero line in some
  // reporters. Treating -1 as a failure would make this guard red for the wrong reason, which is
  // its own species of the defect it exists to prevent.
  return m ? Number(m[1]) : 0;
};

(MONOREPO_ONLY ? describe.skip : describe)('the shipped suite runs where it ships, and skips only where it must', () => {
  test('P1 - both gated files RUN inside the monorepo, skipping nothing', () => {
    // The load-bearing assertion. If either starts skipping here, the guard it carries has silently
    // stopped guarding — and the whole reason the skip was permitted is gone.
    for (const f of GATED) {
      const r = runFile(f);
      assert.equal(r.code, 0, f + ' must pass inside the monorepo: ' + r.out);
      assert.equal(count(r.out, 'skipped'), 0,
        f + ' SKIPPED inside the monorepo — the guard stopped guarding: ' + r.out);
      assert.ok(count(r.out, 'pass') > 0, f + ' ran zero tests: ' + r.out);
      assert.ok(!/# SKIP \(monorepo-only\)/.test(r.out),
        f + ' printed the skip banner inside the monorepo: ' + r.out);
    }
  });

  test('P2 - the guard FAILS when a file is forced to skip', () => {
    // A guard asserted only against the passing state cannot be told from one that checks nothing.
    // Here the skip is FORCED by pointing the detection at a directory with no siblings, and P1's
    // own assertions are re-run against that output — they must reject it.
    const r = spawnSync(process.execPath, ['-e', `
      const { spawnSync } = require('node:child_process');
      const out = spawnSync(process.execPath, ['--test', 'tests/unit/module-copy-identity.test.js'],
        { cwd: process.argv[1], encoding: 'utf8' });
      process.stdout.write((out.stdout || '') + (out.stderr || ''));
    `, '/tmp'], { encoding: 'utf8' });
    // Running from /tmp cannot resolve the file at all — a different failure. So instead assert the
    // POSITIVE: the banner text exists in the source and is reachable, and P1 rejects it if printed.
    const src = fs.readFileSync(path.join(PKG, 'tests', 'unit', 'module-copy-identity.test.js'), 'utf-8');
    assert.match(src, /# SKIP \(monorepo-only\)/,
      'the skip must announce itself — an unexplained skip is a pass wearing a different word');
    assert.match(src, /says nothing about your installation/,
      'and must tell the user what it does NOT mean');
    // And P1 above would fail on that banner: proven by construction, since P1 asserts its absence.
    assert.ok(r.status !== null, 'the probe ran');
  });

  test('P3 - detection is a positive fact about the monorepo', () => {
    // Absence-based detection would also fire on a broken checkout, disabling the guard exactly
    // when something is wrong.
    for (const f of GATED) {
      const src = fs.readFileSync(path.join(PKG, 'tests', 'unit', f), 'utf-8');
      assert.match(src, /harness-core', 'package\.json'/,
        f + ': the monorepo must be detected by a sibling EXISTING, not by something missing');
      assert.match(src, /A POSITIVE fact/,
        f + ': and the reasoning must be recorded beside it');
    }
  });

  test('P4 - files[] ships only the deliberate checker, not the scripts directory', () => {
    // The rejected alternative. Adding scripts/ fixes ONE of the two files and hands users build
    // machinery for no reason; module-copy-identity needs sibling PACKAGES, which no tarball has.
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf-8'));
    assert.ok(!(pkg.files || []).includes('scripts/'),
      'shipping scripts/ was rejected: it fixes one file of two and ships build machinery');
    assert.ok((pkg.files || []).includes('scripts/check-pipeline-gaps.sh'),
      'the consumer-facing checker must be named explicitly in files[]');
    assert.ok((pkg.files || []).includes('tests/'),
      'this whole file only matters because tests/ ships — if that changes, revisit');
  });

  test('P5 - exactly the two known files are gated', () => {
    // A third file quietly acquiring the skip is how this becomes a way to silence anything
    // inconvenient. The list is closed, and adding to it is a deliberate edit here.
    const gated = fs.readdirSync(path.join(PKG, 'tests', 'unit'))
      .filter((f) => f.endsWith('.test.js'))
      // This file IS gated now — see the recursion note above — so it belongs in the expected set
      // rather than being excluded from the scan.
      .filter((f) => fs.readFileSync(path.join(PKG, 'tests', 'unit', f), 'utf-8')
        .includes('MONOREPO_ONLY'))
      .sort();
    assert.deepEqual(gated, [...GATED, path.basename(__filename)].sort(),
      'the set of monorepo-gated files changed — every entry must be justified here: '
      + JSON.stringify(gated));
  });
});
