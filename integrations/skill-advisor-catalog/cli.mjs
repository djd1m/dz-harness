#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { compileCatalog, catalogTable } from './catalog.mjs';
import { retrieve, pickerInput } from './search.mjs';
import {verifyCatalogCoverage} from './catalog-inventory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'docs/proposals/skill-advisor-scenarios');
const read = path => JSON.parse(readFileSync(resolve(directory, path), 'utf8'));
export function currentCatalog() {
  const records = read('full-catalog/records.json').records;
  const receipts = read('full-catalog/reviews.json').reviews;
  const catalog = compileCatalog(records, receipts, root);
  if(catalog.excluded.length)throw Error('Unapproved or stale catalog: '+catalog.excluded.map(r=>r.id+': '+r.reason).join('; '));
  const inventory=read('full-catalog/inventory.json');
  return {...catalog,coverage:verifyCatalogCoverage(inventory,catalog.records),inventoryDigest:inventory.digest};
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
