import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const skillRoot = join(packageRoot, 'demo-site-publisher');
export const fixturePath = (...parts) => join(packageRoot, 'test', 'fixtures', ...parts);
export const makeTemp = (name) => mkdtempSync(join(tmpdir(), `dz-demo-${name}-`));
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  return path;
}
