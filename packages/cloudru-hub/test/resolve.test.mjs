// Engine resolution tests — ADR-002: runtime resolution, sha256 pin, loud esbuild-style error.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { resolveEngine, sha256File, platformKey } = require('../src/resolve.js');
const PKG = require('../package.json');

// Every scratch dir is removed at the end (after() + process exit) unless DZ_KEEP_TMP=1 —
// MEASURED 2026-09-20: 18 cloudru-resolve-* dirs per full sweep (backlog 7cb6f9b7).
const created = [];
const removeCreated = () => {
  if (process.env.DZ_KEEP_TMP === '1') return;
  for (const d of created.splice(0)) fs.rmSync(d, { recursive: true, force: true });
};
after(removeCreated);
process.on('exit', removeCreated);
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-resolve-')); created.push(d); return d; };

test('env CLOUDRU_VM_BIN wins and is hashed; a non-pinned file reports verified:false but resolves', () => {
  const dir = tmp();
  const fake = path.join(dir, 'cloudru-vm');
  fs.writeFileSync(fake, 'fake-engine-bytes');
  const r = resolveEngine({ CLOUDRU_VM_BIN: fake, CLOUDRU_HUB_CONFIG: path.join(dir, 'none.json') });
  assert.equal(r.path, fake);
  assert.equal(r.source, 'env');
  assert.equal(r.sha256, crypto.createHash('sha256').update('fake-engine-bytes').digest('hex'));
  assert.equal(r.verified, false);
});

test('mcp refuses a non-pinned engine before executing it', () => {
  const dir = tmp();
  const marker = path.join(dir, 'executed');
  const fake = path.join(dir, 'cloudru-vm');
  fs.writeFileSync(fake, `#!/bin/sh\ntouch "${marker}"\n`);
  fs.chmodSync(fake, 0o755);
  const result = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '../bin/cloudru-hub.js'), 'mcp'], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, CLOUDRU_VM_BIN: fake, CLOUDRU_HUB_CONFIG: path.join(dir, 'none.json') },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match pinned .*refusing to launch/);
  assert.equal(fs.existsSync(marker), false);
});

test('self-test stops on a non-pinned engine before version or MCP probe', () => {
  const dir = tmp();
  const marker = path.join(dir, 'executed');
  const fake = path.join(dir, 'cloudru-vm');
  fs.writeFileSync(fake, `#!/bin/sh\ntouch "${marker}"\n`);
  fs.chmodSync(fake, 0o755);
  const result = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '../bin/cloudru-hub.js'), 'self-test', '--json'], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, CLOUDRU_VM_BIN: fake, CLOUDRU_HUB_CONFIG: path.join(dir, 'none.json') },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.steps.map((step) => [step.name, step.ok]), [['resolve', true], ['sha256', false]]);
  assert.equal(fs.existsSync(marker), false);
});

test('a file matching the pinned baseline hash reports verified:true', () => {
  // Only meaningful on linux-x64 (the single pinned platform, ADR-002 point 4).
  const key = platformKey();
  const pinned = PKG.cloudruHub.binaryHashes[key];
  if (!pinned) return; // other platforms have no pin — nothing to verify here
  const dir = tmp();
  const fake = path.join(dir, 'cloudru-vm');
  fs.writeFileSync(fake, 'x');
  const r = resolveEngine({ CLOUDRU_VM_BIN: fake, CLOUDRU_HUB_CONFIG: path.join(dir, 'none.json') });
  assert.equal(r.verified, r.sha256 === pinned);
});

test('config enginePath is used when env is unset', () => {
  const dir = tmp();
  const fake = path.join(dir, 'engine');
  fs.writeFileSync(fake, 'config-engine');
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ enginePath: fake }));
  const r = resolveEngine({ CLOUDRU_HUB_CONFIG: cfg });
  assert.equal(r.source, 'config');
  assert.equal(r.path, fake);
});

test('nothing resolvable → loud error naming all three paths and the platform-package status', () => {
  const dir = tmp();
  const r = resolveEngine({ CLOUDRU_HUB_CONFIG: path.join(dir, 'absent.json') });
  assert.ok(r.error);
  assert.match(r.error, /CLOUDRU_VM_BIN/);
  assert.match(r.error, /enginePath/);
  assert.match(r.error, /never bundled/);
  // post-grant (ADR-001 AM-2) the missing platform package awaits its ADR-002 trusted-CI
  // build — it is no longer a licence hold, and the error must say so honestly.
  assert.match(r.error, /ADR-002 trusted-CI/);
});

test('a dangling env path falls through to the error, not a crash', () => {
  const dir = tmp();
  const r = resolveEngine({ CLOUDRU_VM_BIN: path.join(dir, 'nope'), CLOUDRU_HUB_CONFIG: path.join(dir, 'absent.json') });
  assert.ok(r.error);
  assert.match(r.error, /set, but not a file/);
});

test('sha256File matches node crypto', () => {
  const dir = tmp();
  const f = path.join(dir, 'f');
  fs.writeFileSync(f, 'abc');
  assert.equal(sha256File(f), crypto.createHash('sha256').update('abc').digest('hex'));
});

test('the pinned linux-x64 hash is the rebuilt private engine sha256', () => {
  assert.equal(
    PKG.cloudruHub.binaryHashes['linux-x64'],
    '89c5073418927ee71ac1de381eaba5ab69d599d615edc51b868d876e712dbf10',
  );
});
