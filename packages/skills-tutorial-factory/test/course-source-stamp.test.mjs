import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { compliantCourse } from './_fixtures.mjs';
import {
  buildCourseSource,
  readCourseSource,
  stampSource,
} from '../package-tutorial-factory/scripts/course-source-stamp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../../..');
const CANONICAL = join(PACKAGE_ROOT, 'package-tutorial-factory');
const WORKING = join(REPO_ROOT, '.claude', 'skills', 'package-tutorial-factory');
const RENDER = join(CANONICAL, 'scripts', 'render-site.mjs');
const BACKFILL = join(REPO_ROOT, 'scripts', 'backfill-course-source.mjs');
const PKG = '@dzhechkov/harness-core';

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'course-source-stamp-'));
  writeFileSync(join(dir, 'course.json'), JSON.stringify(compliantCourse(), null, 2) + '\n');
  writeFileSync(join(dir, 'README.md'), `Package: [${PKG}](https://www.npmjs.com/package/${PKG})\n`);
  return dir;
}

function fakeNpm(version) {
  const bin = mkdtempSync(join(tmpdir(), 'course-source-npm-'));
  const npm = join(bin, 'npm');
  const body = version === undefined
    ? '#!/usr/bin/env node\nprocess.stderr.write("registry unavailable\\n"); process.exit(1);\n'
    : `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(version) + '\n')});\n`;
  writeFileSync(npm, body);
  chmodSync(npm, 0o755);
  return bin;
}

function withFakeNpm(version, fn) {
  const originalPath = process.env.PATH;
  process.env.PATH = `${fakeNpm(version)}:${originalPath ?? ''}`;
  try {
    return fn();
  } finally {
    process.env.PATH = originalPath;
  }
}

test('a fresh render writes the source block with no human editing JSON', () => {
  const dir = fixtureDir();
  const coursePath = join(dir, 'course.json');
  const sitePath = join(dir, 'site', 'index.html');
  const env = { ...process.env, PATH: `${fakeNpm('0.8.11')}:${process.env.PATH ?? ''}` };

  const result = spawnSync(process.execPath, [RENDER, '--course', coursePath, '--out', sitePath], {
    encoding: 'utf-8',
    env,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const source = readCourseSource(JSON.parse(readFileSync(coursePath, 'utf-8')));
  assert.deepEqual(source && { package: source.package, version: source.version }, {
    package: PKG,
    version: '0.8.11',
  });
  assert.match(source.authoredTs, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(result.stdout, /registry/);
  assert.doesNotThrow(() => readFileSync(sitePath, 'utf-8'));
});

test('render degrades to E2_UNSTAMPED when the registry is unavailable', () => {
  const dir = fixtureDir();
  const coursePath = join(dir, 'course.json');
  const sitePath = join(dir, 'site', 'index.html');
  const env = { ...process.env, PATH: `${fakeNpm(undefined)}:${process.env.PATH ?? ''}` };

  const result = spawnSync(process.execPath, [RENDER, '--course', coursePath, '--out', sitePath], {
    encoding: 'utf-8',
    env,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const source = readCourseSource(JSON.parse(readFileSync(coursePath, 'utf-8')));
  assert.equal(source.package, PKG);
  assert.equal('version' in source, false);
  assert.match(result.stderr, /registry silent/);
  assert.doesNotThrow(() => readFileSync(sitePath, 'utf-8'));
});

test('stamp is idempotent and adds only the top-level source key', () => {
  const dir = fixtureDir();
  const coursePath = join(dir, 'course.json');
  const before = JSON.parse(readFileSync(coursePath, 'utf-8'));

  withFakeNpm('0.8.11', () => stampSource(coursePath, { quiet: true }));
  const firstRaw = readFileSync(coursePath, 'utf-8');
  const first = JSON.parse(firstRaw);
  withFakeNpm('0.8.11', () => stampSource(coursePath, { quiet: true }));
  const secondRaw = readFileSync(coursePath, 'utf-8');
  const second = JSON.parse(secondRaw);

  assert.deepEqual(second, first);
  assert.equal(secondRaw, firstRaw);
  assert.deepEqual(Object.keys(first).filter((key) => !Object.hasOwn(before, key)), ['source']);
});

test('mirrorReceipt is absent, not a placeholder', () => {
  const source = buildCourseSource({
    pkg: PKG,
    version: '0.8.11',
    authoredTs: '2026-09-02T12:00:00.000Z',
  });

  assert.equal('mirrorReceipt' in source, false);
  for (const placeholder of [null, '', 'unknown', 'pending']) {
    assert.notEqual(source.mirrorReceipt, placeholder);
  }
});

test('no npm link in README refuses and writes nothing', () => {
  const dir = fixtureDir();
  const coursePath = join(dir, 'course.json');
  writeFileSync(join(dir, 'README.md'), '# No package link\n');
  const before = readFileSync(coursePath, 'utf-8');

  assert.throws(() => stampSource(coursePath, { quiet: true }), /no npm package link/);
  assert.equal(readFileSync(coursePath, 'utf-8'), before);
});

test('backfill omits version when the registry does not answer', () => {
  const dir = fixtureDir();
  const coursePath = join(dir, 'course.json');

  const result = withFakeNpm(undefined, () => stampSource(coursePath, {
    omitAuthoredTs: true,
    stampedBy: 'backfill',
    quiet: true,
  }));
  const source = readCourseSource(JSON.parse(readFileSync(coursePath, 'utf-8')));

  assert.equal(result.version, undefined);
  assert.deepEqual(source, { package: PKG, stampedBy: 'backfill' });
  assert.equal('version' in source, false);
});

test('backfill is idempotent over a fixture tutorial tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'course-source-backfill-'));
  const tutorial = join(root, 'tutorials', 'fixture');
  const coursePath = join(tutorial, 'course.json');
  mkdirSync(tutorial, { recursive: true });
  writeFileSync(coursePath, JSON.stringify(compliantCourse(), null, 2) + '\n');
  writeFileSync(join(tutorial, 'README.md'), `Package: [${PKG}](https://www.npmjs.com/package/${PKG})\n`);
  const env = { ...process.env, PATH: `${fakeNpm('0.8.11')}:${process.env.PATH ?? ''}` };

  const first = spawnSync(process.execPath, [BACKFILL, '--root', root], { encoding: 'utf-8', env });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const firstRaw = readFileSync(coursePath, 'utf-8');
  const second = spawnSync(process.execPath, [BACKFILL, '--root', root], { encoding: 'utf-8', env });
  assert.equal(second.status, 0, second.stdout + second.stderr);

  assert.equal(readFileSync(coursePath, 'utf-8'), firstRaw);
  assert.match(second.stdout, /already-stamped=1/);
});

test('factory twin copies are byte-identical for every touched file', () => {
  for (const relative of [
    'scripts/course-source-stamp.mjs',
    'scripts/render-site.mjs',
    'SKILL.md',
    'modules/05-render.md',
  ]) {
    assert.deepEqual(
      readFileSync(join(WORKING, relative)),
      readFileSync(join(CANONICAL, relative)),
      `${relative} drifted between working and canonical factory copies`,
    );
  }
});
