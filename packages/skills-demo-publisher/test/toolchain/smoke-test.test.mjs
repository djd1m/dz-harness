import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { smokeTest } from '../../demo-site-publisher/scripts/smoke-test.mjs';
import { fixturePath, makeTemp, readJson, writeJson } from '../_fixtures.mjs';

test('smoke gate runs end to end and exits 0 when the toolchain is present', async () => {
  await assertPreflight(); const result = await smokeTest(); assert.ok(result.checks.length >= 31); assert.ok(existsSync(result.site));
});
test('INCONCLUSIVE is exit 9 and the label says which tool is missing', async () => {
  await assert.rejects(smokeTest({ env: { ...process.env, DEMO_FFMPEG: '/nonexistent' } }), (e) => e.exitCode === 9 && /INCONCLUSIVE.*ffmpeg/.test(e.message));
});
test('a scenario selector that does not exist on the mock page fails the recording lane and names the selector', async () => {
  await assertPreflight(); const root = makeTemp('selector'); const demo = readJson(fixturePath('demo.smoke.json')); const selector = '[data-testid="does-not-exist"]';
  demo.scenarios = [{ id: '01-missing', title: 'Missing', caption: 'Проверяем отказ', steps: [{ goto: '/' }, { click: selector }] }]; const demoPath = join(root, 'demo.json'); writeJson(demoPath, demo);
  await assert.rejects(smokeTest({ demoPath, outRoot: root }), (e) => e.message.includes(selector) && e.message.includes('01-missing'));
  const path = join(root, 'recording', 'recording-manifest.json'); assert.ok(existsSync(path)); assert.equal(readJson(path).scenarios.some((s) => s.id === '01-missing' && s.status === 'ok'), false);
});
