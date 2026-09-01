import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), 'utf8'));

test('public distribution is an explicit CP5 owner decision', () => {
  const pkg = readJson('package.json');
  const sources = readJson('sources.json');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(sources.distribution?.state, 'public');
  assert.equal(sources.distribution?.decided_by, 'owner');
});

test('gateway, families and references are complete', () => {
  const skill = readFileSync(join(root, 'fundamental-software-architecture-guide/SKILL.md'), 'utf8');
  const family = readJson('family-manifest.json');
  const routes = readJson('route-manifest.json');
  const references = readdirSync(join(root, 'fundamental-software-architecture-guide/references'))
    .filter((name) => name.endsWith('.md'));
  assert.match(skill, /^name: fundamental-software-architecture-guide$/m);
  assert.equal(family.families.length, 6);
  assert.equal(family.families.filter((item) => item.routable !== false).length, 5);
  assert.equal(routes.routes.length, 26);
  assert.equal(references.length, 26);
});

test('CP3.5 routing receipt meets the declared gate', () => {
  const gate = readJson('fundamental-software-architecture-guide/evals/gate-summary-v2.json');
  assert.equal(gate.pass, true);
  assert.ok(gate.gateway.activation >= 0.8);
  assert.ok(gate.internal.sibling_steal <= 0.1);
  assert.equal(gate.gateway.hard_negative_violations, 0);
  assert.equal(gate.fallbacks, 0);
});

test('shipped brain slice contains 315 KU and is read-only sidecar safe', () => {
  const dbPath = join(root, 'brain/fundamental-software-architecture.sqlite');
  assert.ok(statSync(dbPath).size > 0);
  const header = readFileSync(dbPath).subarray(0, 20);
  assert.equal(header[18], 1, 'SQLite write version must use rollback journaling, not WAL');
  assert.equal(header[19], 1, 'SQLite read version must use rollback journaling, not WAL');
  const scratch = mkdtempSync(join(tmpdir(), 'fsa-pack-test-'));
  const copyPath = join(scratch, 'brain.sqlite');
  try {
    copyFileSync(dbPath, copyPath);
    const db = new DatabaseSync(copyPath, { readOnly: true });
    const count = db.prepare('select count(*) as n from book_knowledge').get().n;
    const books = db.prepare('select distinct book from book_knowledge order by book').all();
    db.close();
    assert.equal(count, 315);
    assert.deepEqual(books.map((row) => row.book), ['fundamental-software-architecture']);
    assert.equal(existsSync(`${copyPath}-shm`), false);
    assert.equal(existsSync(`${copyPath}-wal`), false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// The v3 signer canonicalises exactly ONE path before hashing it — the root `package.json`, whose
// key order a packer may rewrite (harness-core/src/sign.ts:81 `CANONICALISED_PACK_FILES`). Every
// other entry is hashed byte-for-byte. The first draft of this test asserted a RAW digest for all
// entries, which was true only under the retired v1 scheme; it went red the moment the pack was
// re-signed at v3 (MEASURED 2026-09-01: package.json raw 84d3a718… vs signed 40bdc6f6…). A test
// that pins a retired hashing rule blocks the very re-sign the release gate requires.
const CANONICALISED = new Set(['package.json']);

test('signed manifest hashes every declared payload byte', () => {
  const manifest = readJson('.dz-manifest.json');
  assert.ok(typeof manifest.signature === 'string' && manifest.signature.length > 0);
  assert.equal(manifest.manifest.version, 3, 'manifest must use the current v3 signing scheme');
  let checked = 0;
  for (const entry of manifest.manifest.files) {
    const abs = join(root, entry.path);
    assert.ok(existsSync(abs), `${entry.path} is signed but absent`);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, entry.path);
    if (CANONICALISED.has(entry.path)) continue; // hashed canonically, not raw — verified below
    assert.equal(createHash('sha256').update(readFileSync(abs)).digest('hex'), entry.sha256, entry.path);
    checked += 1;
  }
  assert.ok(checked >= manifest.manifest.files.length - CANONICALISED.size);
});

// The byte-hash loop above cannot judge the canonicalised entry or the Ed25519 signature itself.
// Inside the monorepo both the signer and the pinned trust root are reachable, so this runs the
// REAL consumer verifier. Outside it (a plain npm install of this pack) the verifier is absent —
// that case is reported as a NAMED degraded check, never silently skipped as a pass.
test('manifest verifies against the pinned trust root', async () => {
  const signerPath = join(root, '..', 'harness-core', 'dist', 'sign.js');
  const trustRoot = join(root, '..', '..', '..', 'keys', 'dz.pub');
  if (!existsSync(signerPath) || !existsSync(trustRoot)) {
    // Degraded, and said out loud: shape only — 64 raw Ed25519 bytes under base64.
    assert.equal(Buffer.from(readJson('.dz-manifest.json').signature, 'base64').length, 64,
      'DEGRADED CHECK (no verifier in this install): signature is not 64 Ed25519 bytes');
    return;
  }
  const { verifyManifest } = await import(pathToFileURL(signerPath).href);
  const result = verifyManifest(root, readJson('.dz-manifest.json'), readFileSync(trustRoot, 'utf8'));
  assert.equal(result.ok, true, JSON.stringify(result.failures ?? []));
});
