import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadDemo, loadDemoSet } from './demo-schema.mjs';
import { assertPreflight } from './preflight.mjs';
import { CURSOR_OVERLAY, tap } from './cursor-overlay.mjs';
import { CliError, EXIT, isLoopback, parseArgs, receipt, runCli, writeJsonAtomic } from './common.mjs';

const cleanName = (value) => value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'step';

async function perform(page, step, baseUrl) {
  if (step.type === 'goto') await page.goto(new URL(step.value, baseUrl).href, { waitUntil: 'networkidle' });
  else if (step.type === 'tap') await tap(page, step.value, step);
  else if (step.type === 'click') await tap(page, step.value, step);
  else if (step.type === 'fill') await page.locator(step.value).fill(step.text ?? '');
  else if (step.type === 'type') await page.locator(step.value).pressSequentially(step.text ?? '');
  else if (step.type === 'press') await page.locator(step.value).press(step.key ?? 'Enter');
  else if (step.type === 'wait') {
    if (typeof step.value === 'number') await page.waitForTimeout(step.value);
    else await page.locator(step.value).waitFor({ state: 'visible' });
  } else if (step.type === 'screenshot' || step.type === 'caption') return;
}

export async function recordDemo({ demoPath, configPath, outDir, baseUrl, offline = false, browserType, env = process.env }) {
  const demo = loadDemo(demoPath);
  const config = loadDemoSet(configPath);
  const origin = baseUrl || demo.baseUrl;
  if (offline && !isLoopback(origin)) throw new CliError(`--offline разрешает только loopback URL: ${origin}`, EXIT.USAGE_OR_SCHEMA);
  const preflight = await assertPreflight({ env, needWebm: config.webm });
  const { chromium } = browserType ? { chromium: browserType } : await import('playwright');
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: preflight.chromium, args: offline
      // OFFLINE = «внешняя сеть недоступна», НЕ «недоступно вообще всё»: макетная страница
      // дымового прогона живёт на 127.0.0.1, и она обязана открываться. Директива
      // `<-loopback>` ОТМЕНЯЕТ штатный обход прокси для петли, то есть гнала бы и 127.0.0.1
      // через мёртвый прокси — ИЗМЕРЕНО 2026-09-02: два теста инструментальной полосы падали с
      // ERR_PROXY_CONNECTION_FAILED на собственном макете. Без неё поведение верное: петля
      // напрямую, всё остальное — в мёртвый прокси и, значит, отказ.
      ? ['--proxy-server=127.0.0.1:1']
      : [] });
  const manifest = { schema: 1, demo: demo.slug, title: demo.title, purpose: demo.purpose, viewport: config.encode.viewport, scenarios: [] };
  try {
    for (const scenario of demo.scenarios) {
      const videoDir = join(outDir, '.video', scenario.id);
      const shots = join(outDir, 'steps', scenario.id);
      mkdirSync(videoDir, { recursive: true }); mkdirSync(shots, { recursive: true });
      const context = await browser.newContext({ viewport: config.encode.viewport, recordVideo: { dir: videoDir, size: config.encode.viewport } });
      const page = await context.newPage();
      await page.addInitScript({ content: CURSOR_OVERLAY });
      if (offline) await page.route('**/*', (route) => isLoopback(route.request().url()) ? route.continue() : route.abort('blockedbyclient'));
      const video = page.video();
      const started = process.hrtime.bigint();
      const steps = [];
      try {
        for (let index = 0; index < scenario.steps.length; index++) {
          const step = scenario.steps[index];
          await perform(page, step, origin);
          const shot = join(shots, `${String(index + 1).padStart(2, '0')}-${cleanName(step.id || step.type)}.png`);
          await page.screenshot({ path: shot, fullPage: false });
          steps.push({ index: index + 1, id: step.id || step.type, action: step.type, atMs: Number(process.hrtime.bigint() - started) / 1e6, screenshot: `steps/${scenario.id}/${shot.split('/').pop()}`, caption: step.type === 'caption' ? step.value : null });
        }
        await context.close();
        const source = await video.path();
        const clip = join(outDir, `${scenario.id}.webm`);
        try { renameSync(source, clip); } catch { copyFileSync(source, clip); }
        manifest.scenarios.push({ id: scenario.id, title: scenario.title, status: 'ok', rawVideoPath: `${scenario.id}.webm`, clip: `${scenario.id}.webm`, seconds: Number(process.hrtime.bigint() - started) / 1e9, caption: scenario.caption, steps });
      } catch (error) {
        await context.close().catch(() => {});
        manifest.scenarios.push({ id: scenario.id, status: 'error', error: error.message });
        writeJsonAtomic(join(outDir, 'recording-manifest.json'), manifest);
        throw new CliError(`${scenario.id}: ${error.message}`, EXIT.ERROR);
      }
    }
  } finally { await browser.close(); }
  writeJsonAtomic(join(outDir, 'recording-manifest.json'), manifest);
  receipt('record', `${manifest.scenarios.length} сценария → ${resolve(outDir)}`);
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { demo: 'required', config: 'required', out: 'required', 'base-url': 'value', offline: 'boolean' });
  await recordDemo({ demoPath: args.demo, configPath: args.config, outDir: args.out, baseUrl: args['base-url'], offline: args.offline === true });
}
runCli(main, import.meta.url);
