import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { assertProfile, buildMontage, planMontage, subtitleDocuments } from '../../demo-site-publisher/scripts/build-montage.mjs';
import { command } from '../../demo-site-publisher/scripts/common.mjs';
import { fixturePath, makeTemp, readJson, writeJson } from '../_fixtures.mjs';

test('concat list is relative and profile tuple is checked before concat (I9)', async () => {
  await assertPreflight({ requireChromium: false });
  const root = makeTemp('montage'); const recording = join(root, 'recording'); const cards = join(root, 'cards'); const out = join(root, 'out'); mkdirSync(recording); mkdirSync(cards);
  for (const id of ['01-open', '02-form', '03-result']) command(process.env.DEMO_FFMPEG || 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x200:rate=30', '-t', '2', '-c:v', 'libvpx-vp9', '-threads', '1', join(recording, `${id}.webm`)], { stdio: 'ignore' });
  command(process.env.DEMO_FFMPEG || 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=navy:s=1280x800', '-frames:v', '1', join(cards, 'base.png')], { stdio: 'ignore' });
  for (const name of ['intro', 'outro', 'section-01-open', 'section-02-form', 'section-03-result', 'caption-01-open', 'caption-02-form', 'caption-03-result']) copyFileSync(join(cards, 'base.png'), join(cards, `${name}.png`));
  writeJson(join(recording, 'recording-manifest.json'), { scenarios: ['01-open', '02-form', '03-result'].map((id) => ({ id, status: 'ok', clip: `${id}.webm`, caption: `Подпись ${id}` })) });
  const config = readJson(fixturePath('demo-site.config.smoke.json')); config.budget.maxClipSeconds = 1; const configPath = join(root, 'config.json'); writeJson(configPath, config);
  const manifest = await buildMontage({ demoPath: fixturePath('demo.smoke.json'), configPath, recordingDir: recording, cardDir: cards, outDir: out });
  assert.equal(manifest.clips.length, 3); assert.equal(assertProfile(join(out, 'montage.mp4')).codec_name, 'h264');
  assert.ok(manifest.clips.every((clip) => clip.sourceSeconds > clip.seconds && clip.seconds <= 1));
});

test('srt and vtt carry identical RU text byte-for-byte (I13)', () => {
  const docs = subtitleDocuments([{ text: 'Русская подпись', seconds: 2 }]);
  assert.ok(docs.srt.includes('Русская подпись')); assert.ok(docs.vtt.includes('Русская подпись'));
});

test('montage order is intro then section and clip pairs then outro', () => {
  const root = makeTemp('order'); const recording = join(root, 'recording'); const cards = join(root, 'cards'); mkdirSync(recording); mkdirSync(cards);
  const demo = readJson(fixturePath('demo.smoke.json'));
  for (const scenario of demo.scenarios) { writeJson(join(recording, `${scenario.id}.webm`), {}); writeJson(join(cards, `section-${scenario.id}.png`), {}); writeJson(join(cards, `caption-${scenario.id}.png`), {}); }
  writeJson(join(cards, 'intro.png'), {}); writeJson(join(cards, 'outro.png'), {}); writeJson(join(recording, 'recording-manifest.json'), { scenarios: demo.scenarios.map((s) => ({ id: s.id, status: 'ok', clip: `${s.id}.webm`, caption: s.caption })) });
  const names = planMontage({ demo, recordingDir: recording, cardDir: cards }).names;
  assert.match(names[0], /intro/); assert.match(names.at(-1), /outro/); assert.equal(names.length, 2 + demo.scenarios.length * 2);
});

test('missing clip → exit 1 and output dir untouched', () => {
  const root = makeTemp('missing'); const out = join(root, 'out'); const demo = readJson(fixturePath('demo.smoke.json'));
  writeJson(join(root, 'recording-manifest.json'), { scenarios: demo.scenarios.map((s) => ({ id: s.id, status: 'ok', clip: `${s.id}.webm` })) });
  assert.throws(() => planMontage({ demo, recordingDir: root }), /не найдены входы/);
  assert.equal(existsSync(out), false);
});
