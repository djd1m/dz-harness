import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(pkg, 'bin/cloudru-hub.js');
const example = join(pkg, 'docs/cost-compare.example.json');
const exampleText = readFileSync(example, 'utf8');
const source = JSON.parse(exampleText);
const dirs = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
function directory() { const dir = mkdtempSync(join(tmpdir(), 'cloudru-cost-test-')); dirs.push(dir); return dir; }
function invoke(input, flags = [], env = {}) {
  const dir = directory(), path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(input));
  const result = spawnSync(process.execPath, [cli, 'cost-compare', '--input', path, '--json', ...flags], {
    cwd: dir, env: { ...process.env, CLOUDRU_VM_BIN: join(dir, 'no-engine'), CLOUDRU_HUB_CONFIG: join(dir, 'no-config'), ...env },
    encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  return result;
}
function invokeRaw(raw) {
  const dir = directory(), path = join(dir, 'input.json');
  writeFileSync(path, raw);
  const result = spawnSync(process.execPath, [cli, 'cost-compare', '--input', path, '--json'], {
    cwd: dir, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  return result;
}
function editRaw(from, to) {
  assert.ok(exampleText.includes(from), `missing fixture anchor ${from}`);
  return exampleText.replace(from, to);
}
function run(input) {
  const result = invoke(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}
function reject(mutator, pattern) {
  const input = structuredClone(source);
  mutator(input);
  const result = invoke(input);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stdout, '', 'invalid input must not emit partial success JSON');
  assert.match(result.stderr, pattern);
}
function complete(input) {
  input.equivalence = { status: 'assumed', assumptions: ['Only modeled infrastructure cost is compared; application equivalence is an operator assumption.'] };
  for (const scenario of input.scenarios) {
    scenario.resources.trafficGB = '7.5';
    scenario.categories.traffic = { status: 'priced', items: [{
      id: 'synthetic-traffic', description: 'Test-only invented traffic tariff', quantity: '7.5', unit: 'traffic-GB', rateRub: '0.12',
      tariff: { url: 'https://example.invalid/test-only-rate', version: 'synthetic-test', asOf: '2026-10-21', vatBasis: 'included', pageOrRow: 'test fixture only' },
    }] };
  }
  return input;
}

test('packaged official-rate example has independent 24h subtotals, capacity and no winner', () => {
  const result = run(source);
  assert.deepEqual(result.scenarios.map(item => item.knownSubtotalRubExact), ['251.6616', '466.1376']);
  assert.deepEqual(result.scenarios.map(item => item.categories.storage.totalRubExact), ['22.8384', '30.4512']);
  assert.deepEqual(result.scenarios.map(item => item.capacity.normalSlots), [6, 6]);
  assert.deepEqual(result.scenarios.map(item => item.capacity.survivingSlots), [4, 4]);
  assert.deepEqual(result.scenarios.map(item => item.capacity.feasible), [true, true]);
  assert.deepEqual(result.scenarios.map(item => item.unpriced.map(entry => entry.category)), [['traffic'], ['traffic']]);
  assert.equal(result.comparison.eligible, false);
  assert.equal(result.comparison.winner, null);
  assert.equal(result.comparison.savingsRubExact, null);
  assert.match(result.scenarios[0].categories.compute.items[0].formula, /24 hours/);
  assert.equal(result.scenarios[1].categories.compute.items[0].tariff.version, '260918');
  assert.match(result.scenarios[0].categories.compute.items[0].formula, /3 instance × 2\.9707 RUB\/instance-hour × 24 hours/);
});

test('human output includes modeled formulas, tariff provenance, unknowns and assumptions', () => {
  const dir = directory(), path = join(dir, 'input.json'); writeFileSync(path, JSON.stringify(source));
  const result = spawnSync(process.execPath, [cli, 'cost-compare', '--input', path], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 instance × 2\.9707 RUB\/instance-hour × 24 hours/);
  assert.match(result.stdout, /evolution-compute\.pdf version 261014/);
  assert.match(result.stdout, /unpriced traffic/);
  assert.match(result.stdout, /assumption:/);
  assert.match(result.stdout, /No winner/);
});

test('fractional horizon keeps exact sums and rounds display only at output', () => {
  const input = structuredClone(source); input.horizonHours = '1.5';
  const result = run(input);
  assert.deepEqual(result.scenarios.map(item => item.knownSubtotalRubExact), ['15.72885', '29.1336']);
  assert.deepEqual(result.scenarios.map(item => item.categories.storage.totalRubExact), ['1.4274', '1.9032']);
  assert.deepEqual(result.scenarios.map(item => item.knownSubtotalRubDisplay), ['15.73', '29.13']);
});

test('test-only traffic is charged once, then conditional lower modeled cost is identified', () => {
  for (const [horizon, expected, savings] of [
    ['24', ['252.5616', '467.0376'], '214.476'],
    ['1.5', ['16.62885', '30.0336'], '13.40475'],
  ]) {
    const input = complete(structuredClone(source)); input.horizonHours = horizon;
    const result = run(input);
    assert.deepEqual(result.scenarios.map(item => item.knownSubtotalRubExact), expected);
    assert.deepEqual(result.scenarios.map(item => item.categories.traffic.totalRubExact), ['0.9', '0.9']);
    assert.equal(result.comparison.eligible, true);
    assert.equal(result.comparison.winner, 'vm');
    assert.equal(result.comparison.savingsRubExact, savings);
    assert.match(result.comparison.basis, /conditional/);
    assert.deepEqual(result.equivalence.assumptions, input.equivalence.assumptions);
  }
});

test('aggregate CPU cannot conceal per-node packing failure', () => {
  const input = complete(structuredClone(source));
  input.workload.replicas = 4;
  input.workload.cpuPerReplica = '1.5';
  const result = run(input);
  assert.deepEqual(result.scenarios.map(item => item.capacity.normalSlots), [3, 3]);
  assert.deepEqual(result.scenarios.map(item => item.capacity.feasible), [false, false]);
  assert.equal(result.comparison.winner, null);
});

test('one-node failure capacity is distinct from normal capacity', () => {
  const input = complete(structuredClone(source));
  input.workload.replicas = 5;
  input.workload.survivingReplicas = 5;
  const failed = run(input);
  assert.deepEqual(failed.scenarios.map(item => item.capacity.normalSlots), [6, 6]);
  assert.deepEqual(failed.scenarios.map(item => item.capacity.survivingSlots), [4, 4]);
  assert.equal(failed.comparison.winner, null);
  input.workload.survivingReplicas = 4;
  const fit = run(input);
  assert.deepEqual(fit.scenarios.map(item => item.capacity.feasible), [true, true]);
  assert.equal(fit.comparison.winner, 'vm');
});

test('guaranteed CPU share, reservation and exact decimal floor determine per-node slots', () => {
  const input = complete(structuredClone(source));
  for (const scenario of input.scenarios) {
    scenario.nodes.cpu = '4'; scenario.nodes.cpuShare = '0.5'; scenario.nodes.reservedCpu = '0.5';
  }
  input.workload.cpuPerReplica = '0.5';
  const result = run(input);
  assert.deepEqual(result.scenarios.map(item => item.capacity.perNodeCpuSlots), [3, 3]);
  const tenth = complete(structuredClone(source));
  for (const scenario of tenth.scenarios) { scenario.nodes.cpu = '0.3'; scenario.nodes.cpuShare = '1'; }
  tenth.workload.cpuPerReplica = '0.1';
  assert.deepEqual(run(tenth).scenarios.map(item => item.capacity.perNodeCpuSlots), [3, 3]);
});

test('a tie is explicit and carries no winner or savings', () => {
  const input = complete(structuredClone(source));
  const vm = input.scenarios[0];
  const k8s = input.scenarios[1];
  // Test-only unit rates: 66 VM hourly units versus 87 K8s hourly units,
  // a 21 × 24 = 504 RUB difference, offset by 7.5 × (67.32 − 0.12).
  vm.categories.compute.items[0].rateRub = '1';
  vm.categories.storage.items[0].rateRub = '1';
  vm.categories.publicIp.items[0].rateRub = '1';
  k8s.categories.compute.items[0].rateRub = '1';
  k8s.categories.controlPlane.items[0].rateRub = '1';
  k8s.categories.storage.items[0].rateRub = '1';
  k8s.categories.publicIp.items[0].rateRub = '1';
  k8s.categories.snat.items[0].rateRub = '1';
  // VM has 66 hourly units; K8s has 87. Add the same 7.5GB traffic to both; tie via VM traffic premium.
  vm.categories.traffic.items[0].rateRub = '67.32';
  k8s.categories.traffic.items[0].rateRub = '0.12';
  const result = run(input);
  assert.deepEqual(result.scenarios.map(item => item.knownSubtotalRubExact), ['2088.9', '2088.9']);
  assert.equal(result.comparison.eligible, true);
  assert.equal(result.comparison.tie, true);
  assert.equal(result.comparison.winner, null);
  assert.equal(result.comparison.savingsRubExact, null);
});

test('unknown equivalence alone suppresses a winner even with complete prices', () => {
  const input = complete(structuredClone(source));
  input.equivalence = source.equivalence;
  const result = run(input);
  assert.deepEqual(result.scenarios.map(item => item.complete), [true, true]);
  assert.equal(result.comparison.winner, null);
});

test('raw flags reject duplicates, missing values, unknown options and positionals', () => {
  const dir = directory(), path = join(dir, 'input.json'); writeFileSync(path, JSON.stringify(source));
  for (const flags of [[], ['--input'], ['--input', path, '--input', path], ['--input', path, '--json', '--json'], ['--input', path, '--rate', '1'], ['--input', path, 'extra']]) {
    const result = spawnSync(process.execPath, [cli, 'cost-compare', ...flags], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 1, JSON.stringify(flags)); assert.equal(result.stdout, ''); assert.match(result.stderr, /cost-compare/);
  }
});

test('input must be a bounded regular file and cannot be a symlink', () => {
  const dir = directory();
  const large = join(dir, 'large.json'); writeFileSync(large, ' '.repeat(128 * 1024 + 1));
  const link = join(dir, 'link.json'); symlinkSync(example, link);
  for (const path of [large, link, '/dev/null']) {
    const result = spawnSync(process.execPath, [cli, 'cost-compare', '--input', path, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1, path); assert.equal(result.stdout, ''); assert.match(result.stderr, /cost-compare/);
  }
});

for (const [name, raw, pattern] of [
  ['top-level duplicate horizon', editRaw('"horizonHours": "24"', '"horizonHours": "8760", "horizonHours": "24"'), /duplicate decoded object member/],
  ['nested duplicate CPU declaration', editRaw('"cpu": "2", "ramGB": "4"', '"cpu": "4", "cpu": "2", "ramGB": "4"'), /duplicate decoded object member/],
  ['sibling scenario duplicate id', editRaw('"id": "k8s",', '"id": "other", "id": "k8s",'), /duplicate decoded object member/],
  ['escaped-equivalent duplicate member', editRaw('"horizonHours": "24"', '"horizonHours": "8760", "horizon\\u0048ours": "24"'), /duplicate decoded object member/],
  ['rounded fractional replica token', JSON.stringify(source).replace('"replicas":3', '"replicas":3.0000000000000001'), /numeric tokens must be canonical/],
  ['unsafe integer replica token', JSON.stringify(source).replace('"replicas":3', '"replicas":9007199254740993'), /numeric tokens must be canonical/],
  ['infinite exponent token', JSON.stringify(source).replace('"replicas":3', '"replicas":1e309'), /numeric tokens must be canonical/],
  ['malformed exponent token', JSON.stringify(source).replace('"replicas":3', '"replicas":3e+'), /object member requires/],
  ['excessive JSON nesting', `${'['.repeat(65)}0${']'.repeat(65)}`, /nesting exceeds/],
  ['raw numeric value for decimal-string horizon', editRaw('"horizonHours": "24"', '"horizonHours": 24'), /horizonHours/],
]) test(`raw JSON rejects ${name} before accepting a result`, () => {
  const result = invokeRaw(raw);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
});

test('canonical safe integer tokens and quoted braces/commas remain accepted', () => {
  const input = structuredClone(source);
  input.workload.replicas = 3;
  input.equivalence.reason = 'unknown: text contains "quotes", braces { } and comma, without object members';
  const result = invokeRaw(JSON.stringify(input));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).workload.replicas, 3);
});

test('CLI path cannot resolve an engine, spawn, access network or require credentials', () => {
  const dir = directory(), preload = join(dir, 'forbid.cjs');
  writeFileSync(preload, `
const Module = require('module'); const original = Module._load;
Module._load = function(request, parent, main) {
  if (parent?.filename.endsWith('/src/cli.js') && ['./resolve','./classification','./install','./safe-mcp','./deploy-approval','./k8s-approval','./dialects'].includes(request)) throw Error('legacy engine/auth module load forbidden');
  if (request === 'yaml') throw Error('external dependency load forbidden');
  return original.apply(this, arguments);
};
const child = require('child_process'); for (const name of ['spawn','spawnSync','exec','execFile']) child[name] = () => { throw Error('spawn forbidden'); };
for (const name of ['http','https','net']) { const mod = require(name); for (const key of ['request','get','connect','createConnection']) if (key in mod) mod[key] = () => { throw Error('network forbidden'); }; }
global.fetch = () => { throw Error('fetch forbidden'); };
`);
  const input = join(dir, 'input.json'); writeFileSync(input, JSON.stringify(source));
  const result = spawnSync(process.execPath, ['--require', preload, cli, 'cost-compare', '--input', input, '--json'], {
    cwd: dir, env: { PATH: '/nonexistent', CLOUDRU_VM_BIN: '/no-engine', CLOUDRU_HUB_CONFIG: '/no-config' }, encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).comparison.winner, null);
});

for (const [label, mutate, pattern] of [
  ['unknown schema field', x => { x.hidden = true; }, /unknown field/],
  ['non-RUB currency', x => { x.currency = 'USD'; }, /currency/],
  ['different VAT basis', x => { x.vatBasis = 'excluded'; }, /vatBasis/],
  ['scientific rate', x => { x.scenarios[0].categories.compute.items[0].rateRub = '1e3'; }, /rateRub/],
  ['monthly unit', x => { x.scenarios[0].categories.compute.items[0].unit = 'instance-month'; }, /unit/],
  ['wrong unit category', x => { x.scenarios[0].categories.storage.items[0].unit = 'instance-hour'; }, /unit/],
  ['missing tariff version', x => { delete x.scenarios[0].categories.compute.items[0].tariff.version; }, /version/],
  ['HTTP tariff URL', x => { x.scenarios[0].categories.compute.items[0].tariff.url = 'http://example.invalid'; }, /url/],
  ['wrong tariff VAT basis', x => { x.scenarios[0].categories.compute.items[0].tariff.vatBasis = 'excluded'; }, /vatBasis/],
  ['unbound worker quantity', x => { x.scenarios[0].categories.compute.items[0].quantity = '2'; }, /quantities must sum/],
  ['unbound storage quantity', x => { x.scenarios[0].categories.storage.items[0].quantity = '59'; }, /quantities must sum/],
  ['unbound IP quantity', x => { x.scenarios[0].categories.publicIp.items[0].quantity = '2'; }, /quantities must sum/],
  ['noninteger service count', x => { x.scenarios[0].categories.compute.items[0].quantity = '3.5'; }, /integer service count/],
  ['missing K8s control plane', x => { x.scenarios[1].controlPlaneCount = 0; }, /controlPlaneCount/],
  ['unpriced compute with zero declaration', x => { x.scenarios[0].nodes.count = 0; }, /nodes.count/],
  ['not-used positive storage', x => { x.scenarios[0].categories.storage = { status: 'not-used', reason: 'omitted' }; }, /not-used requires/],
  ['unknown traffic silently zero', x => { x.scenarios[0].resources.trafficGB = '0'; }, /declared zero quantity/],
  ['priced unknown traffic', x => { x.scenarios[0].categories.traffic = { status: 'priced', items: [] }; }, /priced requires/],
  ['oversubscribed reservations', x => { x.scenarios[0].nodes.reservedCpu = '3'; }, /reservations exceed/],
  ['declared node failure exceeds topology', x => { x.workload.failedNodes = 4; }, /failedNodes/],
  ['bad CPU share', x => { x.scenarios[0].nodes.cpuShare = '1.1'; }, /cpuShare/],
  ['survival above replicas', x => { x.workload.survivingReplicas = 4; }, /survivingReplicas/],
  ['duplicate kinds', x => { x.scenarios[1].kind = 'vm'; x.scenarios[1].controlPlaneCount = 0; x.scenarios[1].categories.controlPlane = { status: 'not-used', reason: 'none' }; }, /one scenario of each kind/],
  ['missing equivalence assumption', x => { x.equivalence = { status: 'assumed', assumptions: [] }; }, /assumptions/],
]) test(`rejects ${label} without partial output`, () => reject(mutate, pattern));
