import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CliError, EXIT, parseArgs, receipt, runCli } from './common.mjs';

const encoded = ['cGRweA==', 'R1RNRVZTVEFDSw==', 'd2lraS5jbG91ZC5ydQ==', 'ZHB6aGVjaGtvdg==', 'NzI4MzI3MzA4', 'U0IgU2Fucw==', 'IzI2RDA3Qw==', 'L2NhYmluZXQ=', 'Y2F0YWxvZy1za2lsbC1yb3c='];
export const forbiddenIdentifiers = () => encoded.map((value) => Buffer.from(value, 'base64').toString('utf8'));
function walk(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => entry.name === 'node_modules' ? [] : entry.isDirectory() ? walk(join(root, entry.name)) : [join(root, entry.name)]);
}
export function scanIdentifiers(root, { site = false } = {}) {
  const hits = [];
  const checked = walk(root).filter((path) => !site || /\.(?:html?|vtt|srt|json|css)$/i.test(path));
  for (const path of checked) {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) for (const token of forbiddenIdentifiers()) if (lines[index].includes(token)) hits.push(`${relative(root, path)}:${index + 1}: ${token}`);
  }
  if (hits.length) throw new CliError(`запрещённые идентификаторы:\n${hits.join('\n')}`, EXIT.CLEANROOM_VIOLATION);
  return { files: checked.length, hits: 0 };
}
async function main() {
  const args = parseArgs(process.argv.slice(2), { root: 'value', site: 'value' });
  const root = args.site || args.root;
  if (!root) throw new CliError('нужен --root или --site', EXIT.USAGE_OR_SCHEMA);
  const result = scanIdentifiers(root, { site: Boolean(args.site) }); receipt('identifier-gate', `${result.files} файлов, 0 совпадений`);
}
runCli(main, import.meta.url);
