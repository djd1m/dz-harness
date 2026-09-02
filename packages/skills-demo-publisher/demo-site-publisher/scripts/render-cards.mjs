import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadDemo, loadDemoSet } from './demo-schema.mjs';
import { assertPreflight } from './preflight.mjs';
import { parseArgs, receipt, runCli } from './common.mjs';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function pageHtml(title, subtitle, caption = false) {
  const alignment = caption ? 'align-items:flex-end;padding:0 52px 56px' : 'align-items:center;padding:72px';
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:${caption ? 'transparent' : '#101a2e'};font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff}body{display:flex;${alignment};justify-content:center;text-align:center}main{max-width:1080px;background:${caption ? '#101a2eee' : 'transparent'};padding:${caption ? '18px 30px' : '0'};border-radius:16px}h1{font-size:${caption ? '36px' : '68px'};margin:0;line-height:1.15}p{font-size:28px;color:#dce7ff}</style><body><main><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</main></body></html>`;
}

export async function renderCards({ demoPath, configPath, outDir, browserType, env = process.env }) {
  const demo = loadDemo(demoPath); const config = loadDemoSet(configPath);
  const preflight = await assertPreflight({ env, needWebm: config.webm });
  const { chromium } = browserType ? { chromium: browserType } : await import('playwright');
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: preflight.chromium });
  const page = await browser.newPage({ viewport: config.encode.viewport });
  const items = [
    ['intro', demo.cards.intro || demo.title, demo.purpose, false],
    ...demo.scenarios.flatMap((s) => [[`section-${s.id}`, s.title, '', false], [`caption-${s.id}`, s.caption, '', true]]),
    ['outro', demo.cards.outro || 'Готово', '', false],
  ];
  try {
    for (const [name, title, subtitle, caption] of items) {
      await page.setContent(pageHtml(title, subtitle, caption), { waitUntil: 'load' });
      await page.screenshot({ path: join(outDir, `${name}.png`), omitBackground: caption });
    }
  } finally { await browser.close(); }
  receipt('cards', `${items.length} PNG`);
  return items.map(([name]) => `${name}.png`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { demo: 'required', config: 'required', out: 'required' });
  await renderCards({ demoPath: args.demo, configPath: args.config, outDir: args.out });
}
runCli(main, import.meta.url);
