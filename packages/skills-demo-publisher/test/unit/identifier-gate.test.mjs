import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanIdentifiers } from '../../demo-site-publisher/scripts/identifier-gate.mjs';
import { makeTemp, packageRoot } from '../_fixtures.mjs';

const planted = ['GT', 'MEV', 'STACK'].join('');
test('identifier gate catches a banned string outside scripts/', () => {
  const root = makeTemp('identifier'); mkdirSync(join(root, 'modules')); writeFileSync(join(root, 'modules', '01-scenarios.md'), planted);
  assert.throws(() => scanIdentifiers(root), (e) => e.exitCode === 6 && /modules\/01-scenarios\.md:1/.test(e.message));
});
test('real pack has zero matches', () => { assert.equal(scanIdentifiers(packageRoot).hits, 0); });
test('--site mode scans built HTML and VTT', () => {
  const root = makeTemp('identifier-site'); mkdirSync(join(root, 'video')); writeFileSync(join(root, 'index.html'), '<html></html>'); writeFileSync(join(root, 'video', 'x.ru.vtt'), planted);
  assert.throws(() => scanIdentifiers(root), /video\/x\.ru\.vtt:1/);
});
