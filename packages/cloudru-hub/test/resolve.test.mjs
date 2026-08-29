// Engine resolution tests — ADR-002: runtime resolution, sha256 pin, loud esbuild-style error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveEngine, sha256File, platformKey } = require('../src/resolve.js');
const PKG = require('../package.json');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-resolve-'));

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

test('the pinned linux-x64 hash is the ADR-002 measured engine sha256', () => {
  assert.equal(
    PKG.cloudruHub.binaryHashes['linux-x64'],
    '59f83fc0678b95146ca539764d0c805bd2514b8588f198c1e835b26e54c05124',
  );
});
