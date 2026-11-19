import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanPackageInventory, verifyCatalogCoverage} from './catalog-inventory.mjs';
import {compileCatalog, recordHash} from './catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const data = resolve(root, 'docs/proposals/skill-advisor-scenarios/full-catalog');
const read = name => JSON.parse(readFileSync(join(data, name), 'utf8'));
const inventory = read('inventory.json');
const publication = read('publication.json');
const records = read('records.json').records;
const receipts = read('reviews.json').reviews;
const publishedPaths = publication.packages.flatMap(pkg => pkg.skills.map(skill => `${pkg.name}\0${skill.path}`));
const scannedPaths = doc => doc.packages.flatMap(pkg => pkg.skills.filter(skill => skill.shipped)
  .map(skill => `${pkg.name}\0${skill.path.slice(pkg.directory.length + 1)}`));

// The publication snapshot is independent of the source walk and catalog records.
test('source scan and approved catalog cover every published package and skill', async () => {
  const scanned = await scanPackageInventory(root, publication);
  assert.equal(recordHash(scanned), recordHash(inventory));
  assert.deepEqual(new Set(scannedPaths(scanned)), new Set(publishedPaths));
  const catalog = compileCatalog(records, receipts, root);
  assert.deepEqual(catalog.excluded, []);
  assert.equal(catalog.records.length, records.length);
  const coverage = verifyCatalogCoverage(scanned, catalog.records);
  assert.equal(coverage.packages, publication.packages.length);
  assert.equal(coverage.skillPaths, new Set(publishedPaths).size);
});

test('coverage rejects omission of any package or published skill path', () => {
  const auxiliary = [
    ...['analyst-manual-full', 'explore', 'goap-research-ed25519', 'problem-solver-enhanced']
      .map(name => `packages/health-advisor/base/skills/base/${name}/SKILL.md`),
    'packages/keysarium/templates/.agents/skills/casarium/SKILL.md',
    'packages/loop-designer-plugin/.codex-plugin/skills/loop-plan-author/SKILL.md',
  ];
  const shipped = new Set(inventory.packages.flatMap(pkg => pkg.skills.filter(s => s.shipped).map(s => s.path)));
  for (const path of auxiliary) assert.ok(shipped.has(path), path);
  for (const pkg of inventory.packages) {
    assert.throws(() => verifyCatalogCoverage(inventory, records.filter(r => r.package.name !== pkg.name)),
      /Incomplete catalog coverage/, pkg.name);
    for (const skill of pkg.skills.filter(s => s.shipped)) {
      const remaining = records.filter(r => !(r.package.name === pkg.name && r.skillIds.includes(skill.id) &&
        r.sources.some(source => source.path === skill.path)));
      assert.throws(() => verifyCatalogCoverage(inventory, remaining), /Incomplete catalog coverage/, skill.path);
    }
  }
});

test('coverage rejects fabricated supporting skills and stale package versions', () => {
  const supporting = records.find(r => r.kind === 'package');
  assert.ok(supporting);
  const forged = structuredClone(records);
  forged.find(r => r.id === supporting.id).skillIds.push('fabricated-skill');
  assert.throws(() => verifyCatalogCoverage(inventory, forged), /Unknown or unsupported skill|Supporting package/);
  const stale = structuredClone(records);
  stale[0].package.version = '0.0.0-stale';
  assert.throws(() => verifyCatalogCoverage(inventory, stale), /Unknown or stale scenario package/);
});

test('source and publication drift cannot match the captured inventory', async t => {
  const fixture = mkdtempSync(join(tmpdir(), 'advisor-inventory-test-'));
  t.after(() => rmSync(fixture, {recursive: true, force: true}));
  cpSync(join(root, 'packages'), join(fixture, 'packages'), {recursive: true});
  symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  const stale = structuredClone(publication);
  stale.packages[0].version = '0.0.0-stale';
  await assert.rejects(scanPackageInventory(fixture, stale), /stale publication/i);
  const skill = inventory.packages.flatMap(p => p.skills).find(s => s.shipped);
  const skillFile = join(fixture, skill.path);
  const bytes = readFileSync(skillFile);
  writeFileSync(skillFile, Buffer.concat([bytes, Buffer.from('\nchanged\n')]));
  await assert.rejects(scanPackageInventory(fixture, publication), /Published skill\/source mismatch/);
  writeFileSync(skillFile, bytes);
  rmSync(skillFile);
  await assert.rejects(scanPackageInventory(fixture, publication), /Published skill missing from source/);
  writeFileSync(skillFile, bytes);
  const pkg = inventory.packages.find(p => p.skills.length === 0);
  rmSync(join(fixture, pkg.directory), {recursive: true});
  await assert.rejects(scanPackageInventory(fixture, publication), /Package\/publication inventory sets differ/);
});

test('approval binds the actual record and fails closed on mutation or rejection', () => {
  const original = records[0];
  const receipt = receipts.find(r => r.id === original.id);
  assert.ok(receipt);
  assert.equal(compileCatalog([original], [receipt], root).records.length, 1);
  const changed = {...original, intent: original.intent + ' changed'};
  for (const [record, review] of [[changed, receipt], [original, {...receipt, verdict: 'rejected'}], [original, null]]) {
    const result = compileCatalog([record], review ? [review] : [], root);
    assert.equal(result.records.length, 0);
    assert.equal(result.excluded.length, 1);
  }
});
test('package overviews are complete, unique and cannot substitute for an atomic skill',()=>{
 const overviews=records.filter(r=>r.kind==='package-overview');
 assert.equal(overviews.length,inventory.packages.filter(p=>p.skills.some(s=>s.shipped)).length);
 for(const overview of overviews){
  assert.deepEqual(overview.skillIds,[]);
  assert.throws(()=>verifyCatalogCoverage(inventory,records.filter(r=>r.id!==overview.id)),/Missing package overview/);
  assert.throws(()=>verifyCatalogCoverage(inventory,[...records,{...overview,id:overview.id+'-duplicate'}]),/duplicate package overview/);
  const receipt=receipts.find(r=>r.id===overview.id);
  assert.equal(compileCatalog([{...overview,outcome:overview.outcome+' unsupported'}],[receipt],root).records.length,0);
 }
 const support=records.find(r=>r.kind==='package');
 assert.throws(()=>verifyCatalogCoverage(inventory,[...records,{...support,id:support.id+'-overview',kind:'package-overview'}]),/package overview/);
});
