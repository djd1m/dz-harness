import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderDemoSite } from '../../demo-site-publisher/scripts/render-site.mjs';
import { verifySite } from '../../demo-site-publisher/scripts/verify-site.mjs';
import { fixturePath, makeTemp, writeJson } from '../_fixtures.mjs';

function build(webm = false, configPath = fixturePath('demo-site.config.smoke.json')) {
  const root = makeTemp('contract'); const montage = join(root, 'montage'); mkdirSync(montage);
  writeFileSync(join(montage, 'montage.mp4'), 'mp4'); writeFileSync(join(montage, 'montage.ru.vtt'), 'WEBVTT\n');
  if (webm) writeFileSync(join(montage, 'montage.webm'), 'webm');
  writeJson(join(montage, 'montage-manifest.json'), { seconds: 4 });
  return renderDemoSite({ demoPath: fixturePath('demo.smoke.json'), configPath, montageDir: montage, outRoot: root });
}
test('every declared video variant exists and every produced variant is referenced', () => {
  const site = build(true); const html = readFileSync(join(site, 'smoke-demo', 'index.html'), 'utf8');
  assert.match(html, /smoke-demo\.mp4/); assert.match(html, /smoke-demo\.webm/); assert.deepEqual(verifySite(site), { pages: 2, externalRefs: 0 });
});
test('a configured WebM variant without its artifact is refused', () => {
  const root = makeTemp('declared-webm'); const config = join(root, 'config.json'); writeJson(config, { set: 'local-smoke', title: 'Локальные демонстрации', webm: true });
  assert.throws(() => build(false, config), (e) => e.exitCode === 5 && /WebM заявлен/.test(e.message));
});
test('external CDN script is refused (I5)', () => {
  const site = build(); const page = join(site, 'smoke-demo', 'index.html'); writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', '<script src="https://example.test/x.js"></script></body>'));
  assert.throws(() => verifySite(site), /внешняя ссылка|demo-страница/);
});
test('dangling <source> is refused (I6)', () => {
  const site = build(); const page = join(site, 'smoke-demo', 'index.html'); writeFileSync(page, readFileSync(page, 'utf8').replace('smoke-demo.mp4', 'missing.mp4'));
  assert.throws(() => verifySite(site), /не существует/);
});
test('an unreferenced produced video is refused', () => {
  const site = build(); writeFileSync(join(site, 'video', 'orphan.webm'), 'webm');
  assert.throws(() => verifySite(site), /orphan\.webm.*не связано/);
});
test('demo pages contain zero <script> tags', () => { const site = build(); assert.doesNotMatch(readFileSync(join(site, 'smoke-demo', 'index.html'), 'utf8'), /<script/); });
test('two renders are byte-identical (I12)', () => {
  const a = build(); const b = build();
  for (const rel of ['index.html', 'smoke-demo/index.html', 'site-manifest.json', 'video/smoke-demo.ru.vtt']) assert.equal(readFileSync(join(a, rel), 'utf8'), readFileSync(join(b, rel), 'utf8'));
});
