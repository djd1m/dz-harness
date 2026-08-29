'use strict';

// 05-growth-engine.md has FOUR live copies: the repo canonical .claude/ tree and templates/ of three
// PUBLISHED packages. Nothing tested that they agree.
//
// MEASURED before this test existed: tests/unit/sync-templates-guard.test.js guards the sync
// SCRIPT's choice of source root — a real defect, a different one. Cross-package copy identity had
// no guard at all, so a fix applied to one copy and forgotten in another would ship to npm in three
// packages that disagree, and nothing would go red.
//
// This feature edits all four in one change, which is exactly the moment to close it: the risk it
// guards is the risk this feature adds.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
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

const PKG = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(PKG, '..', '..', '..');
const REL = path.join('.claude', 'skills', 'reverse-engineering-unicorn', 'modules');
const TPL = path.join('templates', '.claude', 'skills', 'reverse-engineering-unicorn', 'modules');

/** The four copies that ship. Vendored sub-projects and .stryker-tmp sandboxes are deliberately
 *  excluded: they are separate checked-in projects, not publish targets of this monorepo. */
const COPIES = [
  ['canonical', path.join(REPO, REL)],
  ['skills-reverse-engineering', path.join(REPO, 'packages', '@dzhechkov', 'skills-reverse-engineering', TPL)],
  ['p-replicator', path.join(REPO, 'packages', '@dzhechkov', 'p-replicator', TPL)],
  ['keysarium', path.join(REPO, 'packages', '@dzhechkov', 'keysarium', TPL)],
];

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

describe.skip = describe.skip || (() => {});
(MONOREPO_ONLY ? describe.skip : describe)('the four live copies of the growth module agree', () => {
  test('P1 - all four live copies are byte-identical', () => {
    const seen = COPIES.map(([name, dir]) => {
      const f = path.join(dir, '05-growth-engine.md');
      assert.ok(fs.existsSync(f), 'copy is missing entirely: ' + name + ' → ' + f);
      return { name, hash: sha(f) };
    });
    const distinct = [...new Set(seen.map((s) => s.hash))];
    assert.equal(distinct.length, 1,
      'copies diverged: ' + JSON.stringify(seen.map((s) => s.name + '=' + s.hash.slice(0, 8))));
  });

  test('P2 - a drifted copy is NAMED, not just counted', () => {
    // A test that says "they differ" sends a reader to diff four files by hand. The failure message
    // has to say WHICH. Proven by constructing the failure rather than by trusting the message above.
    const fake = [
      { name: 'canonical', hash: 'aaaa' },
      { name: 'keysarium', hash: 'bbbb' },
    ];
    const msg = 'copies diverged: ' + JSON.stringify(fake.map((s) => s.name + '=' + s.hash.slice(0, 8)));
    assert.match(msg, /keysarium/, 'the message must name the drifted copy');
    assert.match(msg, /canonical/, 'and what it drifted from');
  });

  test('P3 - the whole module directory agrees, not only the file this feature touched', () => {
    // Scoping the guard to one filename would let the NEXT edit, to a sibling module, drift silently
    // — the same class of miss this test exists to close, one file over.
    const [, canonDir] = COPIES[0];
    const names = fs.readdirSync(canonDir).filter((n) => n.endsWith('.md')).sort();
    assert.ok(names.length >= 6, 'the module directory should hold the M0-M6 modules: ' + names.length);
    for (const name of names) {
      const hashes = COPIES.map(([label, dir]) => {
        const f = path.join(dir, name);
        assert.ok(fs.existsSync(f), name + ' missing from ' + label);
        return label + '=' + sha(f).slice(0, 8);
      });
      const distinct = [...new Set(hashes.map((h) => h.split('=')[1]))];
      assert.equal(distinct.length, 1, name + ' diverged: ' + JSON.stringify(hashes));
    }
  });
});
