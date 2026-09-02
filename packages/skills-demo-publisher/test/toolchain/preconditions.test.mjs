import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { smokeTest } from '../../demo-site-publisher/scripts/smoke-test.mjs';

void assertPreflight;
test('smoke gate fails loudly when the montage engine is absent', async () => {
  await assert.rejects(smokeTest({ env: { ...process.env, DEMO_FFMPEG: '/nonexistent' } }), (error) => error.exitCode === 9 && /INCONCLUSIVE.*ffmpeg/.test(error.message));
});
test('a network attempt under --offline is a gate failure (A4)', async () => {
  const { smokeTest } = await import('../../demo-site-publisher/scripts/smoke-test.mjs');
  const root = await import('../_fixtures.mjs').then((m) => m.makeTemp('network'));
  const demo = join(root, 'demo.json'); const { writeFileSync } = await import('node:fs');
  writeFileSync(demo, JSON.stringify({ slug: 'network', title: 'Network', baseUrl: 'http://example.com', scenarios: [{ id: '01-open', title: 'Open', caption: 'Text', steps: [{ goto: '/' }] }] }));
  await assert.rejects(smokeTest({ demoPath: demo }), /сетевой URL/);
});
