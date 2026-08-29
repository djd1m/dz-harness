// The iron guardrails as layer-1 tests (feature hermes-claude-adaptation) — POST-GRANT state.
// ADR-001 AM-2 (2026-08-12): the Hermes author's publication approval is recorded
// (features/hermes-claude-adaptation/03_adr/grant-record-2026-08-12.md), the hold is
// SATISFIED. The hold-era protections (private:true, PENDING placeholder, EPRIVATE probe)
// retired; what must now hold forever:
//   1. LICENSE carries the recorded grant (Grant-Confirmation URL), honest attribution,
//      and NO fabricated grant wording on the author's behalf.
//   2. The `licenseHold` trigger field STAYS so the dz guard `licence-hold` rule keeps
//      verifying LICENSE/NOTICES/SPDX on every publish (a satisfied hold passes with it).
//   3. package.json.license matches the SPDX id of the actual LICENSE text (ADR-001
//      Confirmation), and covers ONLY the owner's code.
//   4. ZERO upstream engine bytes in the tarball — unchanged.
// Discrimination: test/mutation-registry.json flips each protection and requires red here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pkgDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const license = fs.readFileSync(path.join(pkgDir, 'LICENSE'), 'utf8');

const PENDING_MARKER = '<!-- PENDING:';

test('LICENSE is post-grant and honest: no PENDING placeholder, grant recorded with a confirmation link, no fabricated grant wording', () => {
  assert.ok(license.length > 400);
  assert.ok(license.includes('MIT License'), 'owner code is MIT');
  assert.ok(license.includes('Dmitry Zhechkov'), 'owner copyright line');
  assert.ok(!license.includes(PENDING_MARKER), 'the PENDING placeholder must be gone post-grant');
  assert.match(license, /GRANT RECORDED/, 'the grant record paragraph exists');
  assert.match(license, /Grant-Confirmation:\s*https?:\/\/\S+/, 'the Grant-Confirmation line carries a URL (dz guard licence-hold requires it)');
  assert.match(license, /owner-attested/, 'honesty: the approval is stated as owner-attested, not as a written artifact we do not hold');
  assert.ok(!/Hermes author(.|\n){0,120}hereby grants/i.test(license), 'no fabricated grant wording');
  assert.ok(!/hereby grants/i.test(license), 'no grant-deed language fabricated on anyone’s behalf');
});

test('LICENSE attribution chain (owner condition + ADR-001 AM-1): engine additions credited to their author, CLI foundation to the owner, zero engine bytes', () => {
  assert.ok(license.includes('Тимур'), 'the Hermes engine author is credited by name');
  assert.match(license, /ZERO bytes of the engine additions|ZERO bytes of them/, 'zero-engine-bytes statement present');
  assert.match(license, /nothing in this file grants any\s+third party rights to the engine additions/, 'no rights to engine additions are granted by this LICENSE');
});

test('the licenseHold trigger for the dz guard rule STAYS declared post-grant (satisfied hold passes with it in place)', () => {
  assert.ok(pkg.licenseHold && typeof pkg.licenseHold === 'object', 'licenseHold field present — deleting it disarms the guard layer');
  assert.match(pkg.licenseHold.adr, /001-licence-and-provenance-precondition/);
});

test('package.json.license matches the SPDX id of the actual LICENSE text (ADR-001 Confirmation), and the pack is publishable', () => {
  assert.ok(license.includes('MIT License'), 'LICENSE Part 1 is the MIT text');
  assert.equal(pkg.license, 'MIT', 'license field must equal the SPDX id of the LICENSE file');
  assert.notEqual(pkg.private, true, 'post-grant the pack must be publishable');
});

test('THIRD_PARTY_NOTICES.md exists, non-empty, and preserves the MinIO Apache-2.0 NOTICE (ADR-001 point 4)', () => {
  const notices = fs.readFileSync(path.join(pkgDir, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.ok(notices.length > 400);
  for (const dep of ['minio-go', 'cobra', 'golang.org/x/crypto', 'yaml.v3']) assert.ok(notices.includes(dep), dep);
  assert.ok(notices.includes('MinIO Project'), 'MinIO NOTICE preserved');
});

test('files[] is the explicit whitelist — no globs, no engine paths (files[] = silent publication contract)', () => {
  assert.deepEqual(pkg.files, [
    'bin/', 'src/', 'templates/', 'data/', 'docs/', 'test/',
    'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.dz-manifest.json', 'sbom.json',
  ]);
  for (const entry of pkg.files) {
    assert.ok(!/native|engine|skill\//.test(entry), `files[] entry "${entry}" looks like an engine path`);
    assert.ok(!entry.includes('*'), 'no globs');
  }
});

test('npm pack --dry-run: the tarball contains ZERO upstream engine bytes (no ELF, no Go sources, no engine binary name)', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8', timeout: 60_000 });
  const report = JSON.parse(out);
  const entries = report[0].files.map((f) => f.path);
  assert.ok(entries.length > 10, 'tarball is non-trivial');
  for (const rel of entries) {
    assert.ok(!/\.go$/.test(rel), `Go source in tarball: ${rel}`);
    assert.ok(!/(^|\/)cloudru-vm$/.test(rel), `engine binary name in tarball: ${rel}`);
    assert.ok(!/(^|\/)(native|engine|engine-build)(\/|$)/.test(rel), `engine dir in tarball: ${rel}`);
    const full = path.join(pkgDir, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile() && fs.statSync(full).size >= 4) {
      const fd = fs.openSync(full, 'r');
      const head = Buffer.alloc(4);
      fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);
      assert.ok(!head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), `ELF binary in tarball: ${rel}`);
    }
  }
  // spot-check the deliverables that MUST be in the tarball
  for (const must of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'bin/cloudru-hub.js', 'templates/.claude/hooks/cloudru-ssh-guard.cjs', 'data/tools-classification.json']) {
    assert.ok(entries.includes(must), `${must} missing from tarball`);
  }
});
