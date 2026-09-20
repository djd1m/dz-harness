'use strict';

/**
 * The case table IS the contract — feature `repo-sweep-honesty`, T4 (FR-3, FR-4, ADR-001).
 *
 * This is the CommonJS half of a twin pair. It drives `tests/npm-resolver-cases.json`, which is a
 * byte-identical copy of the table that harness-cli's TypeScript twin drives; the two copies are
 * held in step by a guard in harness-core. Neither implementation may grow a behaviour the other
 * lacks, because neither test decides what to check — the table does.
 *
 * The placeholders are resolved WITHOUT the resolver under test (npm through `npm root -g`, pnpm
 * through `which`), so a bug in the resolver cannot also supply its own fixture.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const NodeModule = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  NPM_CLI_RELATIVE_PATH,
  NPM_IDENTITY_MODULE,
  ambientGlobalRoots,
  announceNpmSkip,
  defaultGlobalRoots,
  isNpmCli,
  npmConfigPrefix,
  npmPackageRoot,
  resolveNpmCli,
  resolveNpmCliPath,
} = require('../npm-cli-resolver.js');

const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'npm-resolver-cases.json'), 'utf8'));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-npm-resolver-'));
const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-npm-empty-root-'));
const decoyCli = path.join(scratch, 'decoy-cli.js');
fs.writeFileSync(decoyCli,
  '// An existing file that is not npm. An existsSync check accepts it; identity does not.\nmodule.exports = {};\n');
const missingPath = path.join(scratch, 'definitely-absent', NPM_CLI_RELATIVE_PATH);

process.on('exit', () => {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(emptyRoot, { recursive: true, force: true });
});

/** npm, located independently of the code under test. */
function locateRealNpmCli() {
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const candidate = path.join(globalRoot, NPM_CLI_RELATIVE_PATH);
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** pnpm, located independently of the code under test — an existing file that is NOT npm. */
function locateRealPnpmCli() {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const found = execFileSync(which, ['pnpm'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)[0];
    if (!found || found.trim() === '') return null;
    const real = fs.realpathSync(found.trim());
    return fs.existsSync(real) ? real : null;
  } catch {
    return null;
  }
}

/**
 * A file that is NOT npm, sitting in a tree where `libnpmpack` DOES resolve — the fixture a
 * resolution-only identity check accepts (review r1, HIGH-5), built without touching the real npm.
 */
function buildIntruder() {
  const tree = path.join(scratch, 'intruder-tree');
  const fake = path.join(tree, 'node_modules', NPM_IDENTITY_MODULE);
  fs.mkdirSync(fake, { recursive: true });
  fs.writeFileSync(path.join(fake, 'package.json'), '{"name":"libnpmpack","version":"0.0.0","main":"index.js"}\n');
  fs.writeFileSync(path.join(fake, 'index.js'), 'module.exports = {};\n');
  const intruder = path.join(tree, 'intruder-cli.js');
  fs.writeFileSync(intruder, '// Not npm. Only its NEIGHBOURHOOD looks like npm.\nmodule.exports = {};\n');
  return intruder;
}

/** A symlink to the real npm-cli.js — how a genuine npm is normally reached. */
function buildNpmSymlink(realNpm) {
  if (realNpm === null) return null;
  const link = path.join(scratch, 'npm-link.js');
  try {
    fs.symlinkSync(realNpm, link);
  } catch {
    return null;
  }
  return link;
}

/** A PATH-style bin directory whose `npm` entry is a symlink to the real CLI. */
function buildNpmBinDir(realNpm) {
  if (realNpm === null) return null;
  const dir = path.join(scratch, 'fake-bin');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(realNpm, path.join(dir, 'npm'));
  } catch {
    return null;
  }
  return dir;
}

/** npm's install prefix, derived from `npm root -g` — again, without the resolver under test. */
function locateNpmPrefix() {
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (globalRoot === '') return null;
    const parent = path.dirname(globalRoot);
    return path.basename(globalRoot) === 'node_modules' && path.basename(parent) === 'lib'
      ? path.dirname(parent)
      : parent;
  } catch {
    return null;
  }
}

/** A HOME directory whose `.npmrc` carries `prefix=<npmPrefix>` — npm's own user config. */
function buildNpmrcHome(prefix) {
  if (prefix === null) return null;
  const home = path.join(scratch, 'npmrc-home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.npmrc'), `; a user config, exactly as npm writes one\nprefix=${prefix}\n`);
  return home;
}

const realNpmCli = locateRealNpmCli();
const npmPrefix = locateNpmPrefix();

const PLACEHOLDERS = {
  npmCli: realNpmCli,
  pnpmCli: locateRealPnpmCli(),
  decoyCli,
  intruderCli: buildIntruder(),
  npmCliSymlink: buildNpmSymlink(realNpmCli),
  npmPrefix,
  npmrcHome: buildNpmrcHome(npmPrefix),
  npmBinDir: buildNpmBinDir(realNpmCli),
  missingPath,
  emptyRoot,
};

function expand(name) {
  if (!(name in PLACEHOLDERS)) throw new Error(`case table uses an unknown placeholder '${name}'`);
  if (PLACEHOLDERS[name] === null) throw new Error(`placeholder '${name}' is not available on this machine`);
  return PLACEHOLDERS[name];
}

function missingRequirements(entry) {
  return entry.requires.filter((name) => !(name in PLACEHOLDERS) || PLACEHOLDERS[name] === null);
}

test('the table is a real table: it has cases, and every placeholder it names is documented', () => {
  assert.ok(TABLE.cases.length > 0, 'the shared case table is empty');
  for (const entry of TABLE.cases) {
    assert.ok(entry.why, `case ${entry.id} must say why it exists`);
    for (const name of entry.requires) {
      assert.ok(name in TABLE.placeholders, `case ${entry.id} requires undocumented placeholder ${name}`);
    }
    if (entry.given.npmExecPath !== null) {
      assert.ok(entry.given.npmExecPath in PLACEHOLDERS,
        `case ${entry.id} names a placeholder this twin cannot build: ${entry.given.npmExecPath}`);
    }
  }
});

for (const entry of TABLE.cases) {
  test(`${entry.id} — ${entry.why}`, (t) => {
    const missing = missingRequirements(entry);
    if (missing.length > 0) {
      // FR-4: the skip is audible and names the tool that could not be found.
      console.log(`SKIPPED — case '${entry.id}' needs ${missing.join(', ')}, which this machine does not`
        + ` provide (looked for ${NPM_CLI_RELATIVE_PATH} / pnpm).`);
      t.skip(`missing ${missing.join(', ')}`);
      return;
    }

    const env = {};
    if (entry.given.npmExecPath !== null) env.npm_execpath = expand(entry.given.npmExecPath);
    for (const [name, placeholder] of Object.entries(entry.given.env || {})) {
      env[name] = expand(placeholder);
    }
    const options = entry.given.globalRoots === 'defaultRoots'
      ? {}
      : { globalRoots: entry.given.globalRoots.map(expand) };

    // LOW-7: the null-argument case exercises the SIGNATURE, so it must not be handed an object.
    const result = entry.given.nullArguments === true ? resolveNpmCli(null, null) : resolveNpmCli(env, options);

    assert.equal(result.kind, entry.expect.kind, `case ${entry.id}: ${JSON.stringify(result)}`);
    if (result.kind === 'npm-cli') {
      if (entry.expect.source !== undefined) {
        assert.equal(result.source, entry.expect.source, `case ${entry.id} source`);
      }
      if (entry.expect.path !== undefined) assert.equal(result.path, expand(entry.expect.path));
      // Whatever was chosen must actually BE npm — the property, re-checked at the outcome.
      assert.equal(isNpmCli(result.path), true, `case ${entry.id}: chosen path is not npm`);
    } else {
      for (const fragment of entry.expect.reasonIncludes || []) {
        assert.ok(result.reason.includes(fragment),
          `case ${entry.id}: reason does not name '${fragment}': ${result.reason}`);
      }
    }
  });
}

test('the identity check rejects an existing non-npm file that an existence check would accept', () => {
  assert.equal(fs.existsSync(decoyCli), true);
  assert.equal(isNpmCli(decoyCli), false);
});

test('global roots are derived from process.execPath, not only Module.globalPaths', () => {
  // MEASURED 2026-09-18: Module.globalPaths here omits /usr/lib/node_modules, where npm lives.
  assert.equal(ambientGlobalRoots('/usr/bin/node', {})[0], '/usr/lib/node_modules');
  // The composed list keeps the ambient roots first and adds the env-derived ones after.
  assert.equal(defaultGlobalRoots('/usr/bin/node', {})[0], '/usr/lib/node_modules');
});

test('the identity check rejects an intruder whose NEIGHBOURHOOD resolves libnpmpack', () => {
  // review r1, HIGH-5. The fixture genuinely passed the old check: libnpmpack really resolves from
  // here. What it is not is npm.
  const intruder = PLACEHOLDERS.intruderCli;
  assert.ok(intruder, 'the intruder fixture was not built');
  assert.doesNotThrow(() => NodeModule.createRequire(intruder).resolve(NPM_IDENTITY_MODULE));
  assert.equal(isNpmCli(intruder), false);
});

test('a symlink to npm is dereferenced before it is judged, and the REAL path is returned', (t) => {
  const link = PLACEHOLDERS.npmCliSymlink;
  const real = PLACEHOLDERS.npmCli;
  if (link === null || real === null) {
    console.log('SKIPPED — no installed npm to symlink on this machine; nothing to dereference.');
    t.skip('no npm to symlink');
    return;
  }
  assert.throws(() => NodeModule.createRequire(link).resolve(NPM_IDENTITY_MODULE));
  assert.equal(isNpmCli(link), true);
  assert.equal(resolveNpmCliPath(link), real);
});

test('npmPackageRoot names npm own package directory, and refuses anything else', (t) => {
  const real = PLACEHOLDERS.npmCli;
  if (real === null) {
    console.log('SKIPPED — no installed npm on this machine to take a package root from.');
    t.skip('no npm installed');
    return;
  }
  assert.equal(npmPackageRoot(real), path.join(path.dirname(real), '..'));
  assert.equal(npmPackageRoot(decoyCli), null);
});

test('npm configured prefix is read from the environment, never from the ambient home directory', () => {
  assert.equal(npmConfigPrefix({}), undefined);
  assert.equal(npmConfigPrefix({ npm_config_prefix: '/opt/somewhere' }), '/opt/somewhere');
  if (PLACEHOLDERS.npmrcHome !== null) {
    assert.equal(npmConfigPrefix({ HOME: PLACEHOLDERS.npmrcHome }), PLACEHOLDERS.npmPrefix);
  }
});

test('explicit null arguments behave like omitted ones (twin parity, LOW-7)', () => {
  assert.doesNotThrow(() => resolveNpmCli(null, null));
  assert.doesNotThrow(() => resolveNpmCli(undefined, undefined));
});

test('FR-4 — an unavailable npm is announced with a line naming the missing tool', () => {
  const unavailable = resolveNpmCli({ npm_execpath: decoyCli }, { globalRoots: [emptyRoot] });
  assert.equal(unavailable.kind, 'unavailable');
  const lines = [];
  const line = announceNpmSkip(unavailable, (value) => lines.push(value));
  assert.deepEqual(lines, [line]);
  assert.ok(line.includes('SKIPPED'), line);
  assert.ok(line.includes('npm'), line);
  assert.ok(line.includes(NPM_IDENTITY_MODULE), line);
  assert.ok(line.includes(NPM_CLI_RELATIVE_PATH), line);
});

test('FR-4 — an explicit null writer behaves exactly like an omitted one (LOW-7)', () => {
  const unavailable = resolveNpmCli({ npm_execpath: decoyCli }, { globalRoots: [emptyRoot] });
  const seen = [];
  const original = console.log;
  console.log = (...args) => { seen.push(args.map(String).join(' ')); };
  try {
    announceNpmSkip(unavailable, null);
  } finally {
    console.log = original;
  }
  assert.equal(seen.length, 1);
  assert.ok(seen[0].includes('SKIPPED'), seen[0]);
});

test('FR-4 — the announcement writes somewhere by default, so omission cannot silence it', () => {
  const unavailable = resolveNpmCli({}, { globalRoots: [emptyRoot] });
  const seen = [];
  const original = console.log;
  console.log = (...args) => { seen.push(args.map(String).join(' ')); };
  try {
    announceNpmSkip(unavailable);
  } finally {
    console.log = original;
  }
  assert.equal(seen.length, 1);
  assert.ok(seen[0].includes('npm not found'), seen[0]);
});
