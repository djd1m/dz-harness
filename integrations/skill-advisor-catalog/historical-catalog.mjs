/** Frozen A/B/C development catalog from PR30; never the current runtime catalog. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { compileCatalog } from './catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'docs/proposals/skill-advisor-scenarios');
const read = path => JSON.parse(readFileSync(resolve(directory, path), 'utf8'));

export function historicalCatalog() {
  const records = ['a', 'b', 'c'].flatMap(part => read(`catalog/part-${part}.json`).records);
  const receipts = ['catalog/reviews.json', 'catalog/reviews-c.json'].flatMap(path => read(path).reviews);
  return compileCatalog(records, receipts, root);
}
