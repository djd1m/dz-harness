import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const { install } = require('../src/install.js');
const { selectedToolNames } = require('../src/toolsets.js');
const classification = require('../data/tools-classification.json');
const packageDir = path.resolve(import.meta.dirname, '..');
const engine = { path: '/verified/cloudru-vm', verified: true, sha256: classification.engineSha256 };
const roots = [];
const scratch = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-install-')); roots.push(dir); return dir; };
const overlay = (dir) => path.join(dir, '.cloudru-hub', 'deepseek.cordis.patch.yml');
const run = (dir, opts = {}) => install('deepseek-harness', dir, { resolvedEngine: engine, ...opts });
after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

test('dry-run prints literal official patch and exact profile commands without creating project', () => {
  const dir = path.join(scratch(), 'new project');
  const result = run(dir, { dryRun: true });
  assert.equal(result.code, 0, result.lines.join('\n'));
  assert.equal(fs.existsSync(dir), false);
  const content = result.lines[1] + '\n';
  const parsed = YAML.parseDocument(content, { uniqueKeys: true });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.contents.items.length, 1);
  const entry = parsed.toJS()[0].insert[0];
  assert.equal(entry.id, 'cloudru-hub-mcp');
  assert.equal(entry.name, '@deepseek-ai/dsh-mcp-client');
  assert.deepEqual(entry.config, {
    serverName: 'cloudru_hub', transport: 'stdio', command: process.execPath,
    args: [path.join(packageDir, 'bin/cloudru-hub.js'), 'mcp-safe', '--toolsets', 'inventory'],
    env: { CLOUDRU_VM_BIN: engine.path }, cwd: dir,
    failOnStartupError: true, toolCallTimeoutMs: 120_000,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
  });
  assert.equal(selectedToolNames('inventory').length, 11);
  assert.match(result.lines.join('\n'), /dsh --profile <existing-profile> --patch .* --dump-config/);
  assert.match(result.lines.join('\n'), /dsh --profile <existing-profile> --patch /);
  assert.doesNotMatch(content, /!!js|CLOUDRU_HUB_CREDENTIALS|SECRET|GITHUB_TOKEN/);
});

test('apply is private and byte-idempotent, with no user file changes', () => {
  const dir = scratch();
  const user = path.join(dir, 'cordis.patch.yml');
  fs.writeFileSync(user, 'user: data\n');
  assert.equal(run(dir).code, 0);
  const file = overlay(dir);
  const first = fs.readFileSync(file);
  assert.deepEqual(first, Buffer.from(run(dir, { dryRun: true }).lines[1] + '\n'));
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const before = fs.statSync(file).mtimeMs;
  assert.equal(run(dir).code, 0);
  assert.deepEqual(fs.readFileSync(file), first);
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.equal(fs.readFileSync(user, 'utf8'), 'user: data\n');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['deepseek.cordis.patch.yml']);
});

test('existing managed directory and unrelated file are preserved', () => {
  const dir = scratch();
  const managed = path.join(dir, '.cloudru-hub');
  fs.mkdirSync(managed);
  fs.writeFileSync(path.join(managed, 'notes.txt'), 'keep me\n');
  assert.equal(run(dir).code, 0);
  assert.equal(fs.readFileSync(path.join(managed, 'notes.txt'), 'utf8'), 'keep me\n');
});

test('refuses mismatched, malformed and aliased overlays without changing bytes', () => {
  for (const contents of ['other: value\n', '[unterminated\n', '- &x {insert: []}\n- *x\n']) {
    const dir = scratch();
    fs.mkdirSync(path.dirname(overlay(dir)));
    fs.writeFileSync(overlay(dir), contents);
    assert.equal(run(dir).code, 2);
    assert.equal(run(dir, { dryRun: true }).code, 2);
    assert.equal(fs.readFileSync(overlay(dir), 'utf8'), contents);
  }
});

test('rejects symlink overlay, managed directory and project path', () => {
  const root = scratch();
  const target = path.join(root, 'target');
  fs.mkdirSync(target);
  const dir = path.join(root, 'project');
  fs.symlinkSync(target, dir);
  assert.equal(run(dir).code, 2);
  fs.unlinkSync(dir);
  fs.mkdirSync(dir);
  fs.symlinkSync(target, path.join(dir, '.cloudru-hub'));
  assert.equal(run(dir).code, 2);
  fs.unlinkSync(path.join(dir, '.cloudru-hub'));
  fs.mkdirSync(path.join(dir, '.cloudru-hub'));
  const other = path.join(root, 'other');
  fs.writeFileSync(other, 'user');
  fs.symlinkSync(other, overlay(dir));
  assert.equal(run(dir).code, 2);
  assert.equal(fs.readFileSync(other, 'utf8'), 'user');
});

test('rejects unverified engine and unsupported toolsets before writes', () => {
  for (const opts of [
    { resolvedEngine: { ...engine, verified: false } },
    { resolvedEngine: { ...engine, sha256: 'bad' } },
    { toolsets: 'inventory,all' },
    { toolsets: 'unknown' },
  ]) {
    const dir = path.join(scratch(), 'new');
    assert.notEqual(run(dir, opts).code, 0);
    assert.equal(fs.existsSync(dir), false);
  }
  const dir = scratch();
  assert.equal(run(dir, { toolsets: 'vm-deploy', dryRun: true }).lines[1].includes('toolCallTimeoutMs: 1200000'), true);
  assert.equal(run(dir, { toolsets: 'k8s-deploy', dryRun: true }).lines[1].includes('toolCallTimeoutMs: 1200000'), true);
});

test('CLI rejects dry-run on other hosts before writes', () => {
  const dir = path.join(scratch(), 'missing');
  const result = spawnSync(process.execPath, [path.join(packageDir, 'bin/cloudru-hub.js'), 'install', '--target', 'codex', '--dir', dir, '--dry-run'], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /--dry-run is supported only/);
  assert.equal(fs.existsSync(dir), false);
});

test('two real child processes cannot replace competing toolset overlay', async () => {
  const dir = scratch();
  const childScript = `const { install } = require(${JSON.stringify(path.join(packageDir, 'src/install.js'))});
    const e = ${JSON.stringify(engine)};
    process.stdout.write('READY\\n');
    process.stdin.once('data', () => { const r = install('deepseek-harness', process.argv[1], { toolsets: process.argv[2], resolvedEngine: e }); process.stdout.write(JSON.stringify(r)); });`;
  const children = ['inventory', 'compute'].map((spec) => spawn(process.execPath, ['-e', childScript, dir, spec], { stdio: ['pipe', 'pipe', 'pipe'] }));
  const ready = (child) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child did not reach race barrier')), 5_000);
    const onData = (chunk) => { if (String(chunk).includes('READY\n')) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', onData);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', () => { clearTimeout(timer); reject(new Error('child exited before race barrier')); });
  });
  const collect = (child) => new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const results = children.map(collect);
  try { await Promise.all(children.map(ready)); }
  catch (error) { for (const child of children) child.kill(); await Promise.allSettled(results); throw error; }
  for (const child of children) child.stdin.end('go\n');
  const done = await Promise.all(results);
  assert.deepEqual(done.map((r) => r.code), [0, 0], JSON.stringify(done));
  for (const result of done) assert.ok(result.stdout, `child produced no installer response: ${JSON.stringify(result)}`);
  const responses = done.map((r) => JSON.parse(r.stdout.replace(/^READY\n/, '')));
  assert.deepEqual(responses.map((r) => r.code).sort(), [0, 2], JSON.stringify(responses));
  const winning = responses.findIndex((r) => r.code === 0);
  const actual = YAML.parse(fs.readFileSync(overlay(dir), 'utf8'))[0].insert[0].config.args.at(-1);
  assert.equal(actual, ['inventory', 'compute'][winning]);
  assert.deepEqual(fs.readdirSync(path.dirname(overlay(dir))), ['deepseek.cordis.patch.yml']);
});
