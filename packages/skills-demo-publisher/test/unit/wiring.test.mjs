import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { packageRoot } from '../_fixtures.mjs';

const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const generated = new Set(['.dz-manifest.json', 'sbom.json']);
function files(path = packageRoot) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const target = join(path, entry.name);
    return entry.isDirectory() ? files(target) : [relative(packageRoot, target)];
  });
}

test('tree ⇔ files[] ⇔ scripts.test is a set equality', () => {
  const declared = pkg.files.filter((path) => !generated.has(path)).sort();
  const actual = files().filter((path) => !path.startsWith('.agentic-qe/') && !generated.has(path)).sort();
  assert.deepEqual(actual, declared);
  assert.equal(pkg.scripts.test, 'node --test test/unit/*.test.mjs');
  assert.equal(pkg.scripts['test:toolchain'], 'node --test --test-concurrency=1 test/toolchain/*.test.mjs');
});

test('no literal process.exit outside common.mjs', () => {
  const offenders = files(join(packageRoot, 'demo-site-publisher', 'scripts')).filter((path) => {
    if (path.endsWith('/common.mjs')) return false;
    return /process\.exit\(\s*\d/.test(readFileSync(join(packageRoot, path), 'utf8'));
  });
  assert.deepEqual(offenders, []);
});

test('all recorder pointer interactions use the tap helper', () => {
  const source = readFileSync(join(packageRoot, 'demo-site-publisher', 'scripts', 'record-demo.mjs'), 'utf8');
  assert.doesNotMatch(source, /locator\([^)]*\)\.click|page\.mouse\.(?:down|up|click)/);
  assert.match(source, /step\.type === 'click'\) await tap\(/);
  assert.match(source, /step\.type === 'tap'\) await tap\(/);
});

test('package has zero runtime deps other than playwright', () => {
  assert.deepEqual(Object.keys(pkg.dependencies), ['playwright']);
});

test('unit lane spawns no toolchain and every toolchain test imports the preflight probe', () => {
  const unit = files(join(packageRoot, 'test', 'unit'));
  for (const path of unit) {
    const text = readFileSync(join(packageRoot, path), 'utf8');
    assert.doesNotMatch(text, /from ['"]playwright['"]|spawnSync\(['"]ffmpeg|execFileSync\(['"]ffmpeg/);
  }
  for (const path of files(join(packageRoot, 'test', 'toolchain')).filter((p) => p.endsWith('.test.mjs'))) {
    assert.match(readFileSync(join(packageRoot, path), 'utf8'), /scripts\/preflight\.mjs/);
  }
});

test('no unit test references ../../../scripts', () => {
  const needle = ['..', '..', '..', 'scripts'].join('/');
  const guardFile = 'test/unit/wiring.test.mjs';
  for (const path of files(join(packageRoot, 'test', 'unit'))) {
    if (path.split(sep).join('/') === guardFile) continue;
    assert.equal(readFileSync(join(packageRoot, path), 'utf8').includes(needle), false, path);
  }
});

test('fingerprint is registered and contains no readable eight-word run', () => {
  const rel = 'demo-site-publisher/references/clean-room.shingles.json';
  assert.ok(pkg.files.includes(rel));
  const value = JSON.parse(readFileSync(join(packageRoot, rel), 'utf8'));
  assert.equal(value.count, value.shingles.length);
  assert.equal(value.generatedFrom.fileCount, 24);
  assert.doesNotMatch(JSON.stringify(value.shingles), /(?:[A-Za-z]+\s+){7}[A-Za-z]+/);
});

test('each ADR confirmation test name maps to exactly one lane path in files[]', () => {
  for (const name of ['preflight.test.mjs', 'build-montage.test.mjs', 'site-build.test.mjs', 'size-gate.test.mjs', 'clean-room.test.mjs']) {
    assert.equal(pkg.files.filter((path) => path.endsWith(`/${name}`)).length, 1, name);
  }
});

test('every chunk in the manifest names a commit sha and a status transcript', () => {
  const manifest = join(packageRoot, '..', '..', '..', 'features', 'demo-site-publisher', '07_code_changes', 'change_manifest.md');
  assert.ok(existsSync(manifest), manifest);
  const text = readFileSync(manifest, 'utf8'); const chunks = text.split(/^### Chunk /m).slice(1);
  assert.ok(chunks.length > 0, 'manifest has no chunk records');
  for (const chunk of chunks) {
    assert.match(chunk, /Commit SHA: (?:[a-f0-9]{7,40}|BLOCKED \(.git is read-only\))/);
    assert.match(chunk, /Status transcript:\n```text\n[\s\S]*?\n```/);
    if (/Commit SHA: BLOCKED/.test(chunk)) assert.match(chunk, /Landing verdict: NOT LANDED/);
  }
});

test('test suite contains no skip declarations', () => {
  for (const path of files(join(packageRoot, 'test'))) {
    assert.doesNotMatch(readFileSync(join(packageRoot, path), 'utf8'), /test\.skip|skip:\s*true/);
  }
});
