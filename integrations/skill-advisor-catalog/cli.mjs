#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { compileCatalog, catalogTable } from './catalog.mjs';
import { retrieve, pickerInput } from './search.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'docs/proposals/skill-advisor-scenarios');
const read = path => JSON.parse(readFileSync(resolve(directory, path), 'utf8'));
export function currentCatalog() {
  const records = ['a', 'b'].flatMap(part => read(`catalog/part-${part}.json`).records);
  return compileCatalog(records, read('catalog/reviews.json').reviews, root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = currentCatalog();
  if (process.argv[2] === 'build') {
    writeFileSync(resolve(directory, 'catalog/approved.json'), JSON.stringify(catalog, null, 2) + '\n');
    writeFileSync(resolve(directory, 'SCENARIOS.md'), catalogTable(catalog));
    console.log(JSON.stringify({ revision: catalog.revision, approved: catalog.records.length, excluded: catalog.excluded }));
    if (catalog.excluded.length) process.exitCode = 1;
  } else if (process.argv[2] === 'search' && process.argv[3]) {
    const result = retrieve(catalog, process.argv.slice(3).join(' '));
    console.log(JSON.stringify({ decision: result.decision, ...pickerInput(result), excluded: catalog.excluded }, null, 2));
  } else {
    console.error('Usage: node integrations/skill-advisor-catalog/cli.mjs build|search <query>');
    process.exitCode = 2;
  }
}
