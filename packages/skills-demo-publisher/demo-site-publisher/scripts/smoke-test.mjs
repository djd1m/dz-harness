import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPreflight } from './preflight.mjs';
import { loadDemo, loadDemoSet } from './demo-schema.mjs';
import { recordDemo } from './record-demo.mjs';
import { renderCards } from './render-cards.mjs';
import { buildMontage, mediaProfile } from './build-montage.mjs';
import { renderDemoSite } from './render-site.mjs';
import { verifySite } from './verify-site.mjs';
import { sizeGate } from './size-gate.mjs';
import { scanIdentifiers } from './identifier-gate.mjs';
import { CliError, EXIT, isLoopback, parseArgs, runCli } from './common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, '..', '..');
const fixture = (name) => join(pack, 'test', 'fixtures', name);
function serveMock(path) {
  const body = readFileSync(path);
  const server = createServer((request, response) => {
    if (request.url === '/' || request.url === '/index.html') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(body); }
    else { response.writeHead(404); response.end('not found'); }
  });
  return new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', () => resolve(server)));
}

export async function smokeTest({ demoPath = fixture('demo.smoke.json'), configPath = fixture('demo-site.config.smoke.json'), outRoot, env = process.env } = {}) {
  const demo = loadDemo(demoPath); const config = loadDemoSet(configPath);
  if (!isLoopback(demo.baseUrl)) throw new CliError(`offline-сценарий содержит сетевой URL: ${demo.baseUrl}`, EXIT.ERROR);
  let preflight;
  try { preflight = await assertPreflight({ env, needWebm: config.webm }); }
  catch (error) { if (error.exitCode === EXIT.PREFLIGHT_MISSING) throw new CliError(`✗ smoke — INCONCLUSIVE: ${error.message}`, EXIT.INCONCLUSIVE); throw error; }
  const root = outRoot || mkdtempSync(join(tmpdir(), 'dz-demo-smoke-')); const recording = join(root, 'recording'); const cards = join(root, 'cards'); const montage = join(root, 'montage'); const siteRoot = join(root, 'site');
  const server = await serveMock(fixture('mock-page.html')); const address = server.address(); const baseUrl = `http://127.0.0.1:${address.port}`;
  const checks = [];
  const check = (label, value) => { if (!value) throw new CliError(`✗ smoke — ${label}`); checks.push(label); };
  try {
    check('loopback server', address.address === '127.0.0.1');
    for (const name of ['scale', 'pad', 'fps', 'format', 'setpts', 'fade', 'overlay', 'concat']) check(`filter ${name}`, preflight.filters.includes(name));
    check('encoder h264', !preflight.missing.includes('libx264')); check('probe', !!preflight.ffprobe); check('browser', !!preflight.chromium);
    const recordingManifest = await recordDemo({ demoPath, configPath, outDir: recording, baseUrl, offline: true, env });
    check('scenario count', recordingManifest.scenarios.length === demo.scenarios.length);
    for (const scenario of recordingManifest.scenarios) check(`record ${scenario.id}`, scenario.status === 'ok' && existsSync(join(recording, scenario.clip)));
    for (const scenario of demo.scenarios) check(`screens ${scenario.id}`, readdirSync(join(recording, 'steps', scenario.id)).length === scenario.steps.length);
    const cardFiles = await renderCards({ demoPath, configPath, outDir: cards, env }); check('cards', cardFiles.length === 2 + demo.scenarios.length * 2);
    const montageManifest = await buildMontage({ demoPath, configPath, recordingDir: recording, cardDir: cards, outDir: montage, env });
    check('montage file', existsSync(join(montage, 'montage.mp4'))); check('subtitle srt', existsSync(join(montage, 'montage.srt'))); check('subtitle vtt', existsSync(join(montage, 'montage.ru.vtt')));
    const profile = mediaProfile(join(montage, 'montage.mp4'), env); check('codec', profile.codec_name === 'h264'); check('pixel format', profile.pix_fmt === 'yuv420p'); check('frame rate', profile.r_frame_rate === '30/1');
    check('duration budget', montageManifest.seconds <= config.budget.maxMontageSeconds); for (const clip of montageManifest.clips) check(`clip budget ${clip.id}`, clip.seconds <= config.budget.maxClipSeconds);
    const site = renderDemoSite({ demoPath, configPath, montageDir: montage, outRoot: siteRoot }); const verified = verifySite(site);
    check('site pages', verified.pages === 2); const page = readFileSync(join(site, demo.slug, 'index.html'), 'utf8');
    check('Russian lang', page.includes('<html lang="ru">')); check('native video', page.includes('<video controls')); check('Russian track', page.includes('srclang="ru"')); check('no demo script', !page.includes('<script'));
    const budget = sizeGate({ siteDir: site, configPath }); check('size PASS', budget.verdict === 'PASS'); check('identifier gate', scanIdentifiers(site).hits === 0);
    console.log(`✓ smoke — ${checks.length}/${checks.length}`);
    return { checks, root, site };
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { demo: 'value', config: 'value', out: 'value' });
  await smokeTest({ demoPath: args.demo, configPath: args.config, outRoot: args.out });
}
runCli(main, import.meta.url);
