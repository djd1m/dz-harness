// Round-3 PART C — the NARROWED promise must stay stated. This test asserts the honest-scope notes are
// present in the README, module 03, and the ADR-003/004 confirmation notes, so the deliberately narrowed
// promise cannot silently regrow into an over-claim (a doc regression fails CI, not just review).
//   node --test test/honest-scope.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const REPO = resolve(PKG, '..', '..', '..');
const read = (p) => readFileSync(p, 'utf-8');
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');

// For each doc, the load-bearing honest-scope assertions that MUST be present (matched case/space-insensitively).
const REQUIRED = {
  [join(PKG, 'README.md')]: [
    'not a drm',
    'not a semantic judge',
    'determined placeholder course can pass',
    'requires that review before a course is considered done',
    'ip defense is layered',
    'adversarial obfuscation',
    'out of scope',
  ],
  [join(PKG, 'package-tutorial-factory', 'modules', '03-headfirst-gate.md')]: [
    'not a drm',
    'not a semantic judge',
    'determined placeholder course can pass',
    'requires that plane-2 review before a course is considered done',
    'plane-2',
  ],
  [join(REPO, 'features', 'package-tutorial-factory', '03_adr', '003-method-enforcement-split.md')]: [
    'not a drm',
    'not a semantic judge',
    'determined placeholder course can pass',
    'requires that plane-2 review before a course is done',
  ],
  [join(REPO, 'features', 'package-tutorial-factory', '03_adr', '004-corpus-ip-and-provenance.md')]: [
    'ip defense',
    'layered',
    'not a drm',
    'out of scope',
  ],
};

for (const [file, phrases] of Object.entries(REQUIRED)) {
  test(`honest-scope notes present in ${file.replace(REPO + '/', '')}`, () => {
    const body = norm(read(file));
    for (const p of phrases) {
      assert.ok(body.includes(norm(p)), `missing honest-scope phrase "${p}" in ${file}`);
    }
  });
}
