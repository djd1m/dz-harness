import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { CliError, EXIT, parseArgs, receipt, runCli, sortedDir } from './common.mjs';

const ATTR = /\b(?:src|href)=(["'])(.*?)\1/gi;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
function htmlFiles(root) {
  return sortedDir(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? htmlFiles(join(root, entry.name)) : entry.name.endsWith('.html') ? [join(root, entry.name)] : []);
}
function assertBasicHtml(text, path) {
  if (!/^<!doctype html>/i.test(text) || !/<html\b[^>]*>.*<\/html>/is.test(text) || !/<head\b[^>]*>.*<\/head>/is.test(text) || !/<body\b[^>]*>.*<\/body>/is.test(text)) throw new CliError(`${path}: HTML не замкнут`, EXIT.SITE_INVALID);
}
export function verifySite(siteDir) {
  if (!existsSync(siteDir) || !statSync(siteDir).isDirectory()) throw new CliError(`${siteDir}: каталог сайта не найден`, EXIT.SITE_INVALID);
  const errors = []; const pages = htmlFiles(siteDir); const referenced = new Set();
  for (const page of pages) {
    const text = readFileSync(page, 'utf8');
    try { assertBasicHtml(text, page); } catch (e) { errors.push(e.message); }
    if (relative(siteDir, page).split(/[\\/]/).length > 1 && /<script\b/i.test(text)) errors.push(`${page}: demo-страница содержит <script>`);
    if (/@import\b|url\s*\(\s*['"]?(?:https?:|\/\/)/i.test(text)) errors.push(`${page}: внешняя CSS-ссылка`);
    for (const match of text.matchAll(ATTR)) {
      const ref = match[2];
      if (!ref || ref.startsWith('#')) continue;
      if (EXTERNAL.test(ref)) errors.push(`${page}: внешняя ссылка ${ref}`);
      else {
        const target = resolve(dirname(page), ref.split(/[?#]/)[0]); const root = resolve(siteDir);
        if (!(target === root || target.startsWith(`${root}${sep}`)) || !existsSync(target)) errors.push(`${page}: ссылка не существует ${ref}`);
        else referenced.add(target);
      }
    }
  }
  const videoDir = join(siteDir, 'video');
  if (existsSync(videoDir)) for (const entry of sortedDir(videoDir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:mp4|webm)$/i.test(entry.name) && !referenced.has(resolve(videoDir, entry.name))) errors.push(`${join(videoDir, entry.name)}: видео не связано ни с одной страницей`);
  }
  if (!pages.length) errors.push(`${siteDir}: нет HTML`);
  if (errors.length) throw new CliError(errors.join('\n'), EXIT.SITE_INVALID);
  return { pages: pages.length, externalRefs: 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { site: 'required' });
  const result = verifySite(args.site); receipt('verify-site', `${result.pages} страниц, 0 внешних ссылок`);
}
runCli(main, import.meta.url);
