'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const MISSING_HINT = 'инсайтов пока нет; /myinsights создаст первую запись\n';
const LOCAL_PACKED = 'PACKED_LOCAL_ONLY';
const DZ_PACKED = 'PACKED_DZ_ONLY';
let packDir;
let tarball;
let tarballSha256;

function run(file, args, options = {}) {
  return spawnSync(file, args, { encoding: 'utf8', ...options });
}

function assertOk(result, label) {
  assert.equal(result.status, 0,
    `${label} failed\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`);
}

function assertConsumerPath(candidate, consumer) {
  const realCandidate = fs.realpathSync(candidate);
  const realConsumer = fs.realpathSync(consumer);
  const relative = path.relative(realConsumer, realCandidate);
  assert.ok(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
    `source-only evidence rejected: ${realCandidate} is outside packed consumer ${realConsumer}`);
  return realCandidate;
}

function installConsumer() {
  const consumer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-packed-consumer-')));
  fs.writeFileSync(path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'packed-insights-consumer', private: true }) + '\n');
  const install = run(NPM, [
    'install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund',
    '--no-package-lock', tarball,
  ], { cwd: consumer });
  assertOk(install, 'fresh tarball install');

  const packageRoot = path.join(consumer, 'node_modules', '@dzhechkov', 'p-replicator');
  const cli = assertConsumerPath(path.join(packageRoot, 'bin', 'cli.js'), consumer);
  const init = run(process.execPath, [cli, 'init'], { cwd: consumer });
  assertOk(init, 'packed init');
  return { consumer, packageRoot, cli };
}

function insight(overrides = {}) {
  return {
    date: '2026-08-30',
    title: 'Packed writer creates the first carrier',
    tags: ['packed', 'insights'],
    problem: 'Source-only checks cannot prove what npm consumers receive.',
    solution: 'Install and execute the exact npm pack tarball.',
    references: ['tests/e2e/packed-insights-writer.test.js'],
    ...overrides,
  };
}

function runPackedWriter(consumer, input, options = {}) {
  const writer = assertConsumerPath(
    path.join(consumer, '.claude', 'hooks', 'write-insight.cjs'), consumer);
  return run(process.execPath, [writer], {
    cwd: path.join(consumer, '.claude'),
    env: { ...process.env, PATH: options.path === undefined ? '' : options.path,
      CLAUDE_PROJECT_DIR: consumer },
    input: JSON.stringify(input),
  });
}

function parseReceipt(result) {
  assertOk(result, 'packed writer');
  return JSON.parse(result.stdout);
}

function fakeDz(mode) {
  const bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-fake-dz-')));
  const script = path.join(bin, 'dz.js');
  const outcome = mode === 'ok'
    ? `process.stdout.write(${JSON.stringify(JSON.stringify([
      { pattern: DZ_PACKED, domain: 'p-replicator-insights' },
    ]))});`
    : mode === 'empty'
      ? "process.stdout.write('[]');"
      : 'process.exitCode = 19;';
  fs.writeFileSync(script, `'use strict';\n${outcome}\n`);
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(bin, 'dz.cmd'),
      `@\"${process.execPath}\" \"%~dp0\\dz.js\" %*\r\n`);
  } else {
    const executable = path.join(bin, 'dz');
    fs.writeFileSync(executable, `#!${process.execPath}\nrequire('./dz.js');\n`, { mode: 0o700 });
  }
  return bin;
}

function runPackedPrompt(consumer, pathValue) {
  const hook = assertConsumerPath(
    path.join(consumer, '.claude', 'hooks', 'session-insights.cjs'), consumer);
  return run(process.execPath, [hook], {
    cwd: path.join(consumer, '.claude'),
    env: { ...process.env, PATH: pathValue, CLAUDE_PROJECT_DIR: consumer },
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'packed fallback' }),
  });
}

function promptContext(result, label) {
  assertOk(result, label);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, `${label} emitted ${lines.length} envelopes`);
  return JSON.parse(lines[0]).hookSpecificOutput.additionalContext;
}

before(() => {
  packDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-pack-')));
  const packed = run(NPM, ['pack', '--json', '--pack-destination', packDir], { cwd: PKG });
  assertOk(packed, 'npm pack --json');
  const receipt = JSON.parse(packed.stdout);
  assert.equal(receipt.length, 1, 'npm pack must identify exactly one consumer artifact');
  tarball = path.join(packDir, receipt[0].filename);
  assert.ok(fs.existsSync(tarball), 'npm pack receipt names a missing tarball');
  tarballSha256 = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
  process.stdout.write(`# packed artifact ${path.basename(tarball)} sha256=${tarballSha256}\n`);
});

after(() => {
  if (packDir) fs.rmSync(packDir, { recursive: true, force: true });
});

describe('PR-022 exact packed artifact', () => {
  test('P10-packed - absent dz emits local only without dz error text', () => {
    const { consumer } = installConsumer();
    try {
      assert.equal(parseReceipt(runPackedWriter(consumer,
        insight({ title: LOCAL_PACKED }))).status, 'created');
      const context = promptContext(runPackedPrompt(consumer, ''), 'packed absent recall');
      assert.match(context, new RegExp(LOCAL_PACKED));
      assert.doesNotMatch(context, new RegExp(DZ_PACKED));
      assert.doesNotMatch(context, /dz recall unavailable/i);
    } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
  });

  test('P11-packed - armed recall emits dz only', () => {
    const { consumer } = installConsumer();
    const bin = fakeDz('ok');
    try {
      assert.equal(parseReceipt(runPackedWriter(consumer,
        insight({ title: LOCAL_PACKED }))).status, 'created');
      const context = promptContext(runPackedPrompt(consumer, bin), 'packed armed recall');
      assert.match(context, new RegExp(DZ_PACKED));
      assert.doesNotMatch(context, new RegExp(LOCAL_PACKED));
    } finally {
      fs.rmSync(bin, { recursive: true, force: true });
      fs.rmSync(consumer, { recursive: true, force: true });
    }
  });

  test('P12-packed - failing recall names degradation and emits local only', () => {
    const { consumer } = installConsumer();
    const bin = fakeDz('failing');
    try {
      assert.equal(parseReceipt(runPackedWriter(consumer,
        insight({ title: LOCAL_PACKED }))).status, 'created');
      const context = promptContext(runPackedPrompt(consumer, bin), 'packed failing recall');
      assert.match(context, /dz recall unavailable: exit 19; using local recent insights/i);
      assert.match(context, new RegExp(LOCAL_PACKED));
      assert.doesNotMatch(context, new RegExp(DZ_PACKED));
    } finally {
      fs.rmSync(bin, { recursive: true, force: true });
      fs.rmSync(consumer, { recursive: true, force: true });
    }
  });

  test('P13-packed - empty recall emits local only', () => {
    const { consumer } = installConsumer();
    const bin = fakeDz('empty');
    try {
      assert.equal(parseReceipt(runPackedWriter(consumer,
        insight({ title: LOCAL_PACKED }))).status, 'created');
      const context = promptContext(runPackedPrompt(consumer, bin), 'packed empty recall');
      assert.match(context, new RegExp(LOCAL_PACKED));
      assert.doesNotMatch(context, new RegExp(DZ_PACKED));
      assert.doesNotMatch(context, /dz recall unavailable/i);
    } finally {
      fs.rmSync(bin, { recursive: true, force: true });
      fs.rmSync(consumer, { recursive: true, force: true });
    }
  });

  test('P1 — packed harvest writer creates, appends, and deduplicates from a missing carrier without dz', () => {
    const { consumer, packageRoot } = installConsumer();
    try {
      assert.match(tarballSha256, /^[a-f0-9]{64}$/);
      assert.equal(fs.existsSync(path.join(consumer, '.claude', 'insights')), false,
        'fresh init must leave the legitimate missing state intact');
      const harvest = assertConsumerPath(
        path.join(packageRoot, 'templates', '.claude', 'commands', 'harvest.md'), consumer);
      assert.ok((fs.readFileSync(harvest, 'utf8').match(/insight/gi) || []).length > 0,
        'the packed command has no insight-writer binding');

      assert.equal(parseReceipt(runPackedWriter(consumer, insight())).status, 'created');
      const index = path.join(consumer, '.claude', 'insights', 'index.md');
      const first = fs.readFileSync(index);
      const second = insight({ title: 'Packed append keeps prior bytes', tags: ['append'] });
      assert.equal(parseReceipt(runPackedWriter(consumer, second)).status, 'appended');
      assert.ok(fs.readFileSync(index).subarray(0, first.length).equals(first));
      const beforeReplay = fs.readFileSync(index);
      assert.equal(parseReceipt(runPackedWriter(consumer,
        { ...second, date: '2026-08-31' })).status, 'duplicate');
      assert.deepEqual(fs.readFileSync(index), beforeReplay);
      assert.equal(fs.existsSync(path.join(consumer, '.dz')), false,
        'the markdown lifecycle must not create dz state');
    } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
  });

  test('P17 - deleting .dz retains the packed Markdown record and local delivery', () => {
    const { consumer } = installConsumer();
    try {
      const record = insight({ title: LOCAL_PACKED });
      const written = parseReceipt(runPackedWriter(consumer, record, { path: process.env.PATH }));
      assert.equal(written.status, 'created');
      assert.equal(written.teach.state, 'ok');

      const query = run('dz', ['recall', '--all', '--json', '--project', consumer], {
        cwd: consumer,
        env: process.env,
        timeout: 5000,
      });
      assertOk(query, 'packed real dz query');
      assert.ok(JSON.parse(query.stdout).some((row) =>
        row.domain === 'p-replicator-insights' && row.pattern.includes(LOCAL_PACKED)),
      'the exact packed writer did not establish the temporary learned projection');

      const index = path.join(consumer, '.claude', 'insights', 'index.md');
      const before = fs.readFileSync(index);
      const dzState = path.join(consumer, '.dz');
      assert.ok(fs.existsSync(dzState), 'real dz did not establish the deletion fixture');
      fs.rmSync(dzState, { recursive: true, force: true });
      assert.deepEqual(fs.readFileSync(index), before,
        'removing only .dz must not change one Markdown byte');

      const context = promptContext(runPackedPrompt(consumer, ''), 'packed fallback after .dz removal');
      assert.match(context, new RegExp(LOCAL_PACKED));
      assert.doesNotMatch(context, new RegExp(DZ_PACKED));
    } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
  });

  test('P1 - packed harvest writer completes the absent-create-append-delete lifecycle without dz', () => {
    const { consumer, cli } = installConsumer();
    try {
      const index = path.join(consumer, '.claude', 'insights', 'index.md');
      assert.equal(parseReceipt(runPackedWriter(consumer, insight())).status, 'created');
      assert.equal(parseReceipt(runPackedWriter(consumer,
        insight({ title: 'A distinct second record', solution: 'Append it.' }))).status, 'appended');

      fs.rmSync(path.join(consumer, '.claude', 'insights'), { recursive: true, force: true });
      const hook = assertConsumerPath(
        path.join(consumer, '.claude', 'hooks', 'session-insights.cjs'), consumer);
      const missing = run(process.execPath, [hook], {
        cwd: path.join(consumer, '.claude'),
        env: { ...process.env, PATH: '', CLAUDE_PROJECT_DIR: consumer },
      });
      assertOk(missing, 'packed missing-carrier hook');
      assert.equal(missing.stdout, MISSING_HINT);
      assert.equal(fs.existsSync(path.dirname(index)), false,
        'the SessionStart reader must leave the carrier absent');

      const doctor = run(process.execPath, [cli, 'doctor'], { cwd: consumer });
      assertOk(doctor, 'packed doctor after carrier removal');
      assert.match(doctor.stdout, /insights carrier:\s*NOT STARTED/i);
      assert.match(doctor.stdout, /\.claude\/insights\/index\.md/);

      assert.equal(parseReceipt(runPackedWriter(consumer,
        insight({ date: '2026-08-31' }))).status, 'created');
      assert.ok(fs.existsSync(index), 'the next real write must recreate the removed carrier');
      assert.equal(fs.existsSync(path.join(consumer, '.dz')), false);
    } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
  });

  test('P4 - packed doctor names a removed insights carrier without failing', () => {
    const { consumer, cli } = installConsumer();
    try {
      assert.equal(parseReceipt(runPackedWriter(consumer, insight())).status, 'created');
      fs.rmSync(path.join(consumer, '.claude', 'insights'), { recursive: true, force: true });
      const doctor = run(process.execPath, [cli, 'doctor'], { cwd: consumer });
      assertOk(doctor, 'packed doctor missing-state preservation');
      assert.match(doctor.stdout, /insights carrier:\s*NOT STARTED/i);
      assert.match(doctor.stdout, /no \.claude\/insights\/index\.md/i);
    } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
  });

  test('P5 - source-only evidence cannot satisfy packed acceptance', () => {
    const consumer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-provenance-')));
    try {
      const checkoutHook = path.join(PKG, 'templates', '.claude', 'hooks', 'session-insights.cjs');
      assert.throws(() => assertConsumerPath(checkoutHook, consumer),
        /source-only evidence rejected/,
        'the provenance safeguard must fire on a real checkout path');
    } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
  });
});
