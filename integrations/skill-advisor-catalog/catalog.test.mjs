import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, recordHash, validateRecord, compileCatalog, catalogTable } from './catalog.mjs';
import { retrieve, materialize, pickerInput } from './search.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'advisor-catalog-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'pack'));
  const manifest = JSON.stringify({ name: '@test/deploy', version: '1.0.0', files: ['SKILL.md'] });
  const source = '---\nname: deploy\n---\nDeploy an application on a virtual machine. Credentials are requested only when missing.';
  writeFileSync(join(root, 'pack/package.json'), manifest);
  writeFileSync(join(root, 'pack/SKILL.md'), source);
  const record = { id: 'vm-deploy', package: { name: '@test/deploy', version: '1.0.0', manifest: 'pack/package.json' },
    skillIds: ['deploy'], title: 'Развернуть приложение', intent: 'Деплой приложения на виртуальную машину',
    queries: ['развёртывание сервиса сервер'], whenToUse: ['Нужна виртуальная машина'], whenNotToUse: [],
    outcome: 'Приложение на виртуальной машине', prerequisites: [], steps: ['Деплой'], limitations: [],
    sources: [{ path: 'pack/package.json', sha256: digest(manifest) }, { path: 'pack/SKILL.md', sha256: digest(source) }],
    evidence: [{ path: 'pack/SKILL.md', quote: 'Credentials are requested only when missing.' }], courseUrl: null };
  const receipt = () => ({ id: record.id, recordHash: recordHash(record), reviewer: 'independent-fixture', verdict: 'approved', reason: 'Fixture only' });
  return { root, record, receipt };
}

test('approved current record compiles; clone and table preserve limitations', t => {
  const { root, record, receipt } = fixture(t); record.limitations = ['Не гарантирует SLA'];
  const catalog = compileCatalog([record], [receipt()], root);
  assert.equal(catalog.records.length, 1); assert.match(catalogTable(catalog), /Не гарантирует SLA/u);
  record.outcome = 'tampered'; assert.notEqual(catalog.records[0].outcome, 'tampered');
});
test('changed conditions invalidate earlier content approval', t => {
  const { root, record, receipt } = fixture(t); const review = receipt(); record.prerequisites.push('All credentials required');
  const result = compileCatalog([record], [review], root);
  assert.equal(result.records.length, 0); assert.match(result.excluded[0].reason, /stale review/u);
});
test('changed source bytes invalidate only affected scenario', t => {
  const { root, record, receipt } = fixture(t);
  writeFileSync(join(root, 'pack/SKILL.md'), 'new source');
  const result = compileCatalog([record], [receipt()], root);
  assert.equal(result.records.length, 0); assert.match(result.excluded[0].reason, /Stale source/u);
});
test('manifest version drift, invented quotes, missing skill and invented courses fail', t => {
  const { root, record } = fixture(t);
  for (const mutate of [r => r.package.version = '2.0.0', r => r.evidence[0].quote = 'This never occurs in the source',
    r => r.skillIds = ['invented'], r => r.courseUrl = 'https://example.org/fake']) {
    const copy = structuredClone(record); mutate(copy); assert.throws(() => validateRecord(copy, root));
  }
});
test('source paths and escaping symlinks cannot read outside repository', t => {
  const { root, record } = fixture(t);
  for (const path of ['../secret', '/etc/passwd']) {
    const copy = structuredClone(record); copy.package.manifest = path; assert.throws(() => validateRecord(copy, root));
  }
  symlinkSync('/etc/passwd', join(root, 'outside'));
  record.package.manifest = 'outside'; assert.throws(() => validateRecord(record, root));
});
test('missing/rejected approval excludes; ambiguous duplicate receipts fail', t => {
  const { root, record, receipt } = fixture(t);
  assert.equal(compileCatalog([record], [], root).records.length, 0);
  assert.equal(compileCatalog([record], [{ ...receipt(), verdict: 'rejected' }], root).records.length, 0);
  assert.throws(() => compileCatalog([record], [receipt(), receipt()], root));
  assert.throws(() => compileCatalog([record, record], [receipt()], root));
});
test('canonical review binding ignores key order but includes every content field', t => {
  const { record } = fixture(t);
  assert.equal(recordHash(record), recordHash(Object.fromEntries(Object.entries(record).reverse())));
  assert.notEqual(recordHash(record), recordHash({ ...record, courseUrl: 'https://example.org' }));
});
test('retrieval excludes limitations as positive relevance and handles empty/unmatched queries', t => {
  const { root, record, receipt } = fixture(t); record.limitations = ['Не печатает шоколадные скульптуры'];
  const catalog = compileCatalog([record], [receipt()], root);
  assert.equal(retrieve(catalog, 'развернуть приложение').candidates[0].id, record.id);
  assert.equal(retrieve(catalog, '').decision, 'clarify');
  assert.equal(retrieve(catalog, 'шоколадные скульптуры').decision, 'no-match');
  assert.throws(() => retrieve(catalog, 'a', 0));
});
test('picker cannot introduce unseen cards, fabricated prose or mutate retained cards', t => {
  const { root, record, receipt } = fixture(t);
  const result = retrieve(compileCatalog([record], [receipt()], root), 'развернуть приложение');
  assert.throws(() => materialize(result, { decision: 'recommend', scenarioIds: ['invented'] }));
  assert.throws(() => materialize(result, { decision: 'no-match', scenarioIds: [record.id] }));
  const answer = materialize(result, { decision: 'recommend', scenarioIds: [record.id], why: 'Invented capability' });
  assert.equal(answer.why, undefined); assert.equal(answer.records[0].outcome, record.outcome);
  answer.records[0].outcome = 'tampered'; assert.equal(result.candidates[0].record.outcome, record.outcome);
  assert.equal(materialize(result, { decision: 'clarify', scenarioIds: [] }).records.length, 0);
  assert.equal(pickerInput(result).candidates[0].id, record.id);
  assert.deepEqual(pickerInput(result).candidates[0].steps, record.steps);
  assert.deepEqual(pickerInput(result).candidates[0].evidence, record.evidence);
});

test('a skill from another package cannot be relabeled as the selected package', t => {
  const {root, record} = fixture(t);
  mkdirSync(join(root, 'other'));
  const other='---\nname: other-skill\n---\nA totally different skill.';
  writeFileSync(join(root,'other/SKILL.md'),other);
  record.sources.push({path:'other/SKILL.md',sha256:digest(other)});
  record.skillIds=['other-skill'];
  assert.throws(()=>validateRecord(record,root),/Selected skill/);
});
test('reformatted quotes are not literal source evidence', t => {
  const {root,record}=fixture(t);
  record.evidence[0].quote='Credentials are requested\nonly when missing.';
  assert.throws(()=>validateRecord(record,root),/Unverified source quote/);
});
