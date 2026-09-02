import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSizeArgs, sizeGate } from '../../demo-site-publisher/scripts/size-gate.mjs';
import { makeTemp, writeJson } from '../_fixtures.mjs';

const MB = 1024 * 1024;
function site(sizes, budget = {}, clips = [], montageSeconds = 1) {
  const root = makeTemp('budget'); const video = join(root, 'video'); mkdirSync(video);
  sizes.forEach((size, i) => writeFileSync(join(video, `v${i}.mp4`), Buffer.alloc(size)));
  writeJson(join(root, 'site-manifest.json'), { set: 'fixture', clips, montageSeconds });
  const config = join(root, 'config.json'); writeJson(config, { set: 'fixture', title: 'Fixture', budget });
  return { root, config };
}
test('RED: a 21 MB synthetic file → exit 3 and the file is named in stderr', () => {
  const f = site([21 * MB]); assert.throws(() => sizeGate({ siteDir: f.root, configPath: f.config }), (e) => e.exitCode === 3 && /video\/v0\.mp4/.test(e.message));
});
test('a set of 6 × 17 MB (102 MB) → exit 3 naming the set total', () => {
  const f = site(Array(6).fill(17 * MB)); assert.throws(() => sizeGate({ siteDir: f.root, configPath: f.config }), /набор Σ.*maxSetMB 100/);
});
test('a 19.9 MB file → exit 0', () => { const f = site([Math.floor(19.9 * MB)]); assert.equal(sizeGate({ siteDir: f.root, configPath: f.config }).verdict, 'PASS'); });
test('maxFileMB 0 / NaN / "20" → the default 20 MB applies and the 21 MB case still fails', () => {
  for (const value of [0, null, '20']) { const f = site([21 * MB], { maxFileMB: value }); assert.throws(() => sizeGate({ siteDir: f.root, configPath: f.config }), /maxFileMB 20/); }
});
test('size gate refuses an over-budget artifact and names both numbers', () => { const f = site([21 * MB]); assert.throws(() => sizeGate({ siteDir: f.root, configPath: f.config }), /22.020.096|22 020 096|22020096/); });
test('a clip longer than maxClipSeconds is refused and names the seconds and the cap', () => { const f = site([2], {}, [{ id: 'long', seconds: 33 }]); assert.throws(() => sizeGate({ siteDir: f.root, configPath: f.config }), /33 s > 32 s/); });
test('a montage longer than maxMontageSeconds is refused and names the seconds and the cap', () => { const f = site([2], {}, [], 241); assert.throws(() => sizeGate({ siteDir: f.root, configPath: f.config }), /241 s > 240 s.*maxMontageSeconds/); });
test('size gate exposes no --force flag', () => {
  assert.throws(() => parseSizeArgs(['--force']), (e) => e.exitCode === 2 && /--force/.test(e.message));
});
test('--project refuses a config whose real-clip projection exceeds maxFileMB', () => { const f = site([1], { maxFileMB: 1, maxMontageSeconds: 240 }); assert.throws(() => sizeGate({ configPath: f.config, project: true }), /1\.88 MB > maxFileMB 1 MB/); });
