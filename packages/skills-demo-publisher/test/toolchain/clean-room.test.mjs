import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { CliError, EXIT } from '../../demo-site-publisher/scripts/common.mjs';
import { scanIdentifiers } from '../../demo-site-publisher/scripts/identifier-gate.mjs';
import { makeTemp, packageRoot, skillRoot } from '../_fixtures.mjs';

void assertPreflight;
const fingerprintPath = join(skillRoot, 'references', 'clean-room.shingles.json');
const known = 'd2VibSBwZXIgc2NlbmFyaW8gZnJvbSBhIHNjZW5hcmlvcyBqc29uIGVhY2g=';
const ignored = /[\u00AD\u034F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;
function textOf(path) {
  const raw = readFileSync(path, 'utf8');
  if (extname(path) !== '.json') return raw;
  try {
    const strings = []; const visit = (v) => { if (typeof v === 'string') strings.push(v); else if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { strings.push(k); visit(x); }); }; visit(JSON.parse(raw)); return strings.join('\n');
  } catch { return raw; }
}
function tokens(path) {
  const value = textOf(path).replace(/<[^>]+>/g, '').normalize('NFKC').replace(ignored, '').replace(/(\p{L})[-‐-―−]\s*\n?\s*(\p{L})/gu, '$1$2');
  return [...value.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0].toLowerCase());
}
function hashes(path, fp) {
  const words = tokens(path); const found = new Set();
  for (let i = 0; i + fp.shingleWidth <= words.length; i++) found.add(createHash('sha256').update(`${fp.salt}\0${words.slice(i, i + fp.shingleWidth).join(' ')}`).digest('hex').slice(0, 16));
  return found;
}
function files(root) {
  if (!existsSync(root)) throw new CliError(`reference path not found: ${root}`, EXIT.INCONCLUSIVE);
  if (statSync(root).isFile()) return [root];
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)]);
}
function loadFingerprint(path = fingerprintPath) {
  let fp; try { fp = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new CliError(`${path}: fingerprint unreadable — ${error.message}`, EXIT.INCONCLUSIVE); }
  if (fp.schema !== 'dz.clean-room.shingles/1' || fp.shingleWidth !== 8 || fp.count !== fp.shingles.length) throw new CliError(`${path}: fingerprint invalid`, EXIT.INCONCLUSIVE);
  return fp;
}
function fingerprintHits(paths, fp = loadFingerprint()) {
  const reference = new Set(fp.shingles);
  return paths.filter((path) => [...hashes(path, fp)].some((hash) => reference.has(hash)));
}
function treeFingerprint(root, template) {
  const paths = ['SKILL.md', 'scripts', 'references'].flatMap((name) => existsSync(join(root, name)) ? files(join(root, name)) : []);
  const shingles = new Set(); for (const path of paths) for (const hash of hashes(path, template)) shingles.add(hash);
  return { ...template, shingles: [...shingles], count: shingles.size };
}
const shipped = () => files(packageRoot).filter((path) => !path.includes('/node_modules/') && !path.includes('/.agentic-qe/') && !path.endsWith('.dz-manifest.json') && !path.endsWith('sbom.json'));

test('a known verbatim fixture is caught against the fingerprint', () => {
  const root = makeTemp('verbatim'); const path = join(root, 'fixture.txt'); writeFileSync(path, Buffer.from(known, 'base64').toString('utf8'));
  assert.deepEqual(fingerprintHits([path]), [path]);
});
test('clean-room gate fails on a known verbatim fixture', () => {
  const root = makeTemp('red'); const path = join(root, 'fixture.mjs'); writeFileSync(path, Buffer.from(known, 'base64').toString('utf8'));
  assert.notEqual(fingerprintHits([path]).length, 0);
});
test('the same fixture passes against the committed fingerprint', () => {
  const root = makeTemp('control'); const path = join(root, 'fixture.txt'); writeFileSync(path, 'eight wholly independent words composed for a green control'); assert.deepEqual(fingerprintHits([path]), []);
});
test('fingerprint missing or unparseable ⇒ FAIL naming the path, never skip', () => {
  const path = join(makeTemp('missing-fp'), 'absent.json'); assert.throws(() => loadFingerprint(path), (e) => e.exitCode === 9 && e.message.includes(path));
});
test('reference tree absent ⇒ the test FAILS with the path named, never skips (I4)', () => {
  const path = join(makeTemp('missing-ref'), 'absent'); assert.throws(() => files(path), (e) => e.exitCode === 9 && e.message.includes(path));
});
test('every shipped file passes shingling vs scripts and references', () => {
  const fp = loadFingerprint(); const packFiles = shipped(); const hits = fingerprintHits(packFiles, fp); assert.deepEqual(hits.map((x) => relative(packageRoot, x)), []);
  const ref = process.env.DZ_CLEANROOM_REF; let mode = 'fingerprint';
  if (ref) { const live = treeFingerprint(ref, fp); assert.deepEqual(fingerprintHits(packFiles, live).map((x) => relative(packageRoot, x)), []); mode = 'both'; }
  console.log(`✓ clean-room — ${packFiles.length} files × ${fp.count} shingles, 0 hits, mode=${mode}`);
});
test('fingerprint mode and tree mode flag the identical file set', () => {
  if (!process.env.DZ_CLEANROOM_REF) { assert.equal(loadFingerprint().count > 0, true); return; }
  const fp = loadFingerprint(); const live = treeFingerprint(process.env.DZ_CLEANROOM_REF, fp); const root = makeTemp('parity'); const bad = join(root, 'bad.txt'); const good = join(root, 'good.txt'); writeFileSync(bad, Buffer.from(known, 'base64')); writeFileSync(good, 'original independent control sentence for this implementation');
  assert.deepEqual(fingerprintHits([bad, good], fp), fingerprintHits([bad, good], live));
});
test('a runtime-concatenated identifier fixture is reported', () => {
  const root = makeTemp('runtime-id'); writeFileSync(join(root, 'x.txt'), ['GT', 'MEV', 'STACK'].join('')); assert.throws(() => scanIdentifiers(root), /x\.txt:1/);
});
