import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishDemo, verifyLive } from '../../demo-site-publisher/scripts/publish-demo.mjs';
import { sizeGate } from '../../demo-site-publisher/scripts/size-gate.mjs';
import { mediaDigest, fileRecord } from '../../demo-site-publisher/scripts/common.mjs';
import { makeTemp, writeJson } from '../_fixtures.mjs';

function ready() {
  const root = makeTemp('publish'); mkdirSync(join(root, 'video')); writeFileSync(join(root, 'index.html'), '<!doctype html><html><head></head><body><video><source src="video/demo.mp4"></video></body></html>\n'); writeFileSync(join(root, 'video', 'demo.mp4'), 'video');
  const media = [fileRecord(root, 'video/demo.mp4')]; writeJson(join(root, 'site-manifest.json'), { set: 'public-demo', media, mediaSha256: mediaDigest(media), clips: [] });
  const config = join(root, 'config.json'); writeJson(config, { set: 'public-demo', title: 'Public demo' }); sizeGate({ siteDir: root, configPath: config });
  return { root, config };
}
test('stale size report is refused', async () => {
  const f = ready(); writeFileSync(join(f.root, 'video', 'demo.mp4'), 'changed');
  await assert.rejects(publishDemo({ siteDir: f.root, configPath: f.config, sanction: 'approved', dryRun: true }), /отчёт бюджета устарел/);
});
test('old live body ≠ pushed sha ⇒ not live (I11)', async () => {
  const f = ready(); const fetchFn = async () => ({ status: 200, arrayBuffer: async () => Buffer.from('old'), headers: new Headers() });
  await assert.rejects(verifyLive({ siteDir: f.root, url: 'https://pages.invalid/x', fetchFn, attempts: 1, pollMs: 0 }), (e) => e.exitCode === 8 && /sha256/.test(e.message));
});
test('no git argv is built without a PASS report', async () => {
  const f = ready(); writeJson(join(f.root, 'size-report.json'), { verdict: 'REFUSE' }); let calls = 0;
  await assert.rejects(publishDemo({ siteDir: f.root, configPath: f.config, sanction: 'approved', remote: 'unused', execFn: () => { calls++; } }), /устарел/); assert.equal(calls, 0);
});
test('dry-run with a current report builds no git argv', async () => {
  const f = ready(); let calls = 0; const result = await publishDemo({ siteDir: f.root, configPath: f.config, sanction: 'approved', dryRun: true, execFn: () => { calls++; } });
  assert.equal(result.dryRun, true); assert.equal(calls, 0);
});
