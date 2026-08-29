import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratchRoots = [];

function scratch(label) {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  scratchRoots.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort teardown must continue so one stubborn fixture does not strand the rest.
    }
  }
});

function diagnostic(run) {
  return [run.error?.stack, run.stdout, run.stderr]
    .filter(Boolean)
    .join('\n')
    .slice(-16_000);
}

function childEnvironment(suiteTmp) {
  const env = { ...process.env, TMPDIR: suiteTmp };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const realSuitePath = join(root, 'test', 'story-page.test.mjs');

function runnableSuiteCopy(observerRoot) {
  const childTest = join(observerRoot, 'story-page-forced-failure.test.mjs');
  const packageStoryUrl = new URL('../package-story-page/', import.meta.url).href;
  const source = readFileSync(realSuitePath, 'utf8')
    .replaceAll("from '../package-story-page/", `from '${packageStoryUrl}`)
    .replace(
      "const root = fileURLToPath(new URL('..', import.meta.url));",
      `const root = ${JSON.stringify(root)};`,
    );
  assert.notEqual(source, readFileSync(realSuitePath, 'utf8'), 'scratch suite path anchors were not rewritten');
  writeFileSync(childTest, `${source}\n\ntest('forced failure for the guard', () => { throw new Error('forced'); });\n`);
  return childTest;
}

let fullSuiteObservation;

function observeFullSuite() {
  if (fullSuiteObservation) return fullSuiteObservation;

  const observerRoot = scratch('story-full-suite-observer');
  const suiteTmp = join(observerRoot, 'tmp');
  mkdirSync(suiteTmp);
  writeFileSync(join(suiteTmp, 'keep-me.txt'), 'foreign fixture\n');
  const concurrentFixture = join(suiteTmp, 'story-package-CONCURRENT');
  mkdirSync(concurrentFixture);

  const run = spawnSync(process.execPath, ['--test', 'test/story-page.test.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: childEnvironment(suiteTmp),
    maxBuffer: 16 * 1024 * 1024,
    timeout: 600_000,
  });

  fullSuiteObservation = {
    entries: readdirSync(suiteTmp).sort(),
    concurrentFixture,
    foreignContents: readFileSync(join(suiteTmp, 'keep-me.txt'), 'utf8'),
    run,
  };
  return fullSuiteObservation;
}

test('a full suite run leaves its scratch TMPDIR empty', { timeout: 660_000 }, () => {
  const observation = observeFullSuite();
  assert.equal(observation.run.status, 0, diagnostic(observation.run));
  // npm may write node-compile-cache under os.tmpdir(), but NODE_COMPILE_CACHE is unset here; a future Node child-cache default would make this exact-empty check spuriously red.
  assert.deepEqual(observation.entries.filter((entry) => !['keep-me.txt', 'story-package-CONCURRENT'].includes(entry)), []);
});

test('a failing child suite still leaves nothing behind', { timeout: 660_000 }, () => {
  const observerRoot = scratch('story-failing-suite-observer');
  const suiteTmp = join(observerRoot, 'tmp');
  mkdirSync(suiteTmp);
  const childTest = runnableSuiteCopy(observerRoot);

  const run = spawnSync(process.execPath, ['--test', childTest], {
    cwd: root,
    encoding: 'utf8',
    env: childEnvironment(suiteTmp),
    maxBuffer: 1024 * 1024,
    timeout: 600_000,
  });

  assert.ok(Number.isInteger(run.status) && run.status !== 0, diagnostic(run));
  assert.deepEqual(readdirSync(suiteTmp), []);
});

test("a concurrent run's live fixture survives the cleanup", { timeout: 660_000 }, () => {
  const observation = observeFullSuite();
  assert.equal(existsSync(observation.concurrentFixture), true);
  assert.equal(statSync(observation.concurrentFixture).isDirectory(), true);
});

test('cleanup removes only what the suite created', { timeout: 660_000 }, () => {
  const observation = observeFullSuite();
  assert.deepEqual(observation.entries, ['keep-me.txt', 'story-package-CONCURRENT']);
  assert.equal(observation.foreignContents, 'foreign fixture\n');
});
