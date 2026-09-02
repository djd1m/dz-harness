import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDemo, loadDemoSet } from './demo-schema.mjs';
import { CliError, EXIT, fileRecord, mediaDigest, parseArgs, receipt, runCli, sortedDir, writeJsonAtomic } from './common.mjs';
import { verifySite } from './verify-site.mjs';

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const style = `:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}body{max-width:1320px;margin:auto;padding:32px;line-height:1.55}a{color:#2874d0}video{display:block;width:100%;height:auto;background:#000;border-radius:14px}.transcript{max-width:80ch}li{margin:.6rem 0}`;
function demoPage(demo, variants) {
  const sources = [`<source src="../video/${esc(demo.slug)}.mp4" type="video/mp4">`, variants.webm ? `<source src="../video/${esc(demo.slug)}.webm" type="video/webm">` : ''].filter(Boolean).join('');
  const transcript = demo.scenarios.map((s) => `<li><strong>${esc(s.title)}</strong> — ${esc(s.caption)}</li>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(demo.title)}</title><style>${style}</style></head><body><nav><a href="../index.html">← Все демонстрации</a></nav><main><h1>${esc(demo.title)}</h1><p>${esc(demo.purpose)}</p><video controls preload="metadata" width="1280" height="800">${sources}<track kind="subtitles" src="../video/${esc(demo.slug)}.ru.vtt" srclang="ru" label="Русский" default></video><section class="transcript"><h2>Текстовая версия</h2><ol>${transcript}</ol></section></main></body></html>\n`;
}
function indexPage(config, demos) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(config.title)}</title><style>${style}</style></head><body><main><h1>${esc(config.title)}</h1><ul>${demos.map((d) => `<li><a href="${esc(d.slug)}/index.html">${esc(d.title)}</a></li>`).join('')}</ul></main></body></html>\n`;
}
export function renderDemoSite({ demoPath, configPath, montageDir, outRoot }) {
  const demo = loadDemo(demoPath); const config = loadDemoSet(configPath); const setDir = join(outRoot, config.set); const mediaDir = join(setDir, 'video'); const pageDir = join(setDir, demo.slug);
  const manifest = JSON.parse(readFileSync(join(montageDir, 'montage-manifest.json'), 'utf8'));
  for (const name of ['montage.mp4', 'montage.ru.vtt']) if (!existsSync(join(montageDir, name))) throw new CliError(`${join(montageDir, name)}: обязательный артефакт монтажа не найден`, EXIT.SITE_INVALID);
  if (config.webm && !existsSync(join(montageDir, 'montage.webm'))) throw new CliError(`${join(montageDir, 'montage.webm')}: WebM заявлен в конфигурации, но не создан`, EXIT.SITE_INVALID);
  mkdirSync(mediaDir, { recursive: true }); mkdirSync(pageDir, { recursive: true });
  const variants = { mp4: true, webm: existsSync(join(montageDir, 'montage.webm')) };
  for (const suffix of ['mp4', 'webm', 'ru.vtt']) rmSync(join(mediaDir, `${demo.slug}.${suffix}`), { force: true });
  copyFileSync(join(montageDir, 'montage.mp4'), join(mediaDir, `${demo.slug}.mp4`));
  copyFileSync(join(montageDir, 'montage.ru.vtt'), join(mediaDir, `${demo.slug}.ru.vtt`));
  if (variants.webm) copyFileSync(join(montageDir, 'montage.webm'), join(mediaDir, `${demo.slug}.webm`));
  writeFileSync(join(pageDir, 'index.html'), demoPage(demo, variants));
  const priorPath = join(setDir, 'site-manifest.json'); const prior = existsSync(priorPath) ? JSON.parse(readFileSync(priorPath, 'utf8')) : { demos: [] }; const priorBySlug = new Map((prior.demos || []).map((item) => [item.slug, item]));
  const demos = sortedDir(setDir, { withFileTypes: true }).filter((x) => x.isDirectory() && x.name !== 'video' && existsSync(join(setDir, x.name, 'index.html'))).map((x) => {
    const media = sortedDir(mediaDir).filter((name) => name.startsWith(`${x.name}.`)).map((name) => fileRecord(setDir, `video/${name}`));
    if (x.name === demo.slug) return { slug: x.name, title: demo.title, page: `${x.name}/index.html`, media, montageSeconds: manifest.seconds, clips: manifest.clips || [] };
    if (priorBySlug.has(x.name)) return { ...priorBySlug.get(x.name), media };
    const prior = readFileSync(join(setDir, x.name, 'index.html'), 'utf8');
    return { slug: x.name, title: prior.match(/<title>([^<]+)<\/title>/i)?.[1] || x.name, page: `${x.name}/index.html`, media };
  });
  writeFileSync(join(setDir, 'index.html'), indexPage(config, demos));
  writeFileSync(join(setDir, '.nojekyll'), '');
  const media = demos.flatMap((item) => item.media || []).sort((a, b) => a.rel.localeCompare(b.rel));
  const clips = demos.flatMap((item) => item.clips || []); const montageSeconds = Math.max(...demos.map((item) => item.montageSeconds || 0));
  writeJsonAtomic(join(setDir, 'site-manifest.json'), { schema: 1, set: config.set, title: config.title, demos, media, mediaSha256: mediaDigest(media), montageSeconds, clips });
  const nonVideo = ['index.html', `${demo.slug}/index.html`, `video/${demo.slug}.ru.vtt`, 'site-manifest.json'].map((rel) => fileRecord(setDir, rel));
  writeJsonAtomic(join(setDir, 'build-receipt.json'), { schema: 1, ffmpeg: manifest.ffmpeg || null, encodeProfile: manifest.profile || null, artifacts: nonVideo });
  verifySite(setDir);
  receipt('site', `${config.set}/${demo.slug}: ${media.length} media-файла`);
  return setDir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { demo: 'required', config: 'required', montage: 'required', out: 'required' });
  renderDemoSite({ demoPath: args.demo, configPath: args.config, montageDir: args.montage, outRoot: args.out });
}
runCli(main, import.meta.url);
