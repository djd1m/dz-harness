// Round-3 PART C — the NARROWED promise must stay stated. This test asserts the honest-scope notes are
// present in the shipped README and module 03; private ADR checks live in CLI integration, so the narrowed
// promise cannot silently regrow into an over-claim (a doc regression fails CI, not just review).
//   node --test test/honest-scope.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
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

};

for (const [file, phrases] of Object.entries(REQUIRED)) {
  test(`honest-scope notes present in ${file.replace(PKG + '/', '')}`, () => {
    const body = norm(read(file));
    for (const p of phrases) {
      assert.ok(body.includes(norm(p)), `missing honest-scope phrase "${p}" in ${file}`);
    }
  });
}
