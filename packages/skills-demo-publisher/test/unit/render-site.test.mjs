import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderDemoSite } from '../../demo-site-publisher/scripts/render-site.mjs';
import { fixturePath, makeTemp, readJson, writeJson } from '../_fixtures.mjs';

function fixture() {
  const root = makeTemp('site'); const montage = join(root, 'montage'); mkdirSync(montage);
  writeFileSync(join(montage, 'montage.mp4'), 'mp4'); writeFileSync(join(montage, 'montage.ru.vtt'), 'WEBVTT\n');
  writeJson(join(montage, 'montage-manifest.json'), { seconds: 3 });
  return { root, montage };
}
test('renders a Russian self-contained demo page with native video', () => {
  const { root, montage } = fixture(); const site = renderDemoSite({ demoPath: fixturePath('demo.smoke.json'), configPath: fixturePath('demo-site.config.smoke.json'), montageDir: montage, outRoot: root });
  const html = readFileSync(join(site, 'smoke-demo', 'index.html'), 'utf8');
  assert.match(html, /<html lang="ru">/); assert.match(html, /<video controls preload="metadata"/); assert.match(html, /srclang="ru"/); assert.doesNotMatch(html, /<script/);
});

test('repeated renders build one page per demo and one aggregate manifest', () => {
  const { root, montage } = fixture(); const first = renderDemoSite({ demoPath: fixturePath('demo.smoke.json'), configPath: fixturePath('demo-site.config.smoke.json'), montageDir: montage, outRoot: root });
  const secondDemo = readJson(fixturePath('demo.smoke.json')); secondDemo.slug = 'second-demo'; secondDemo.title = 'Вторая демонстрация'; const secondPath = join(root, 'second.json'); writeJson(secondPath, secondDemo);
  const site = renderDemoSite({ demoPath: secondPath, configPath: fixturePath('demo-site.config.smoke.json'), montageDir: montage, outRoot: root }); const manifest = readJson(join(site, 'site-manifest.json'));
  assert.equal(site, first); assert.deepEqual(manifest.demos.map((item) => item.slug), ['second-demo', 'smoke-demo']); assert.equal(manifest.media.length, 4); assert.match(readFileSync(join(site, 'index.html'), 'utf8'), /second-demo\/index\.html/);
});

test('rerender removes an obsolete optional WebM for the same demo', () => {
  const { root, montage } = fixture(); writeFileSync(join(montage, 'montage.webm'), 'webm'); const config = readJson(fixturePath('demo-site.config.smoke.json')); config.webm = true; const configPath = join(root, 'webm.json'); writeJson(configPath, config);
  const site = renderDemoSite({ demoPath: fixturePath('demo.smoke.json'), configPath, montageDir: montage, outRoot: root }); assert.ok(existsSync(join(site, 'video', 'smoke-demo.webm')));
  unlinkSync(join(montage, 'montage.webm')); config.webm = false; writeJson(configPath, config); renderDemoSite({ demoPath: fixturePath('demo.smoke.json'), configPath, montageDir: montage, outRoot: root }); assert.equal(existsSync(join(site, 'video', 'smoke-demo.webm')), false);
});
