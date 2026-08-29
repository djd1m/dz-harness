import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'cli.js');

function run(args, cwd) {
  return execFileSync('node', [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

test('version prints package.json version', () => {
  const out = run(['--version'], here).trim();
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  assert.equal(out, pkg.version);
});

test('init copies the bundled skills + command + rule + shard and writes a manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-init-'));
  try {
    run(['init'], dir);

    // manifest
    const manifestPath = join(dir, '.design-thinking.json');
    assert.ok(existsSync(manifestPath), 'manifest written');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, '@dzhechkov/design-thinking');
    assert.ok(manifest.files.length > 0);

    // the orchestrator + required deps
    for (const s of ['design-thinking', 'explore', 'goap-research-ed25519', 'frontend-design', 'six-thinking-hats']) {
      assert.ok(existsSync(join(dir, '.claude/skills', s, 'SKILL.md')), `${s}/SKILL.md installed`);
    }
    // command, rule, shard
    assert.ok(existsSync(join(dir, '.claude/commands/design-thinking.md')), 'command installed');
    assert.ok(existsSync(join(dir, '.claude/rules/design-thinking-conventions.md')), 'rule installed');
    assert.ok(existsSync(join(dir, '.claude/shards/design-thinking.shard.md')), 'shard installed');

    // every manifest file actually exists on disk
    for (const f of manifest.files) {
      assert.ok(existsSync(join(dir, f)), `manifest file present: ${f}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init refuses to overwrite without --force, succeeds with it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-force-'));
  try {
    run(['init'], dir);
    // second init without --force must exit non-zero
    assert.throws(() => run(['init'], dir), /Command failed|exited with/i);
    // with --force it succeeds
    const out = run(['init', '--force'], dir);
    assert.match(out, /installed/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-dry-'));
  try {
    run(['init', '--dry-run'], dir);
    assert.ok(!existsSync(join(dir, '.design-thinking.json')), 'no manifest on dry-run');
    assert.ok(!existsSync(join(dir, '.claude')), 'no .claude on dry-run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Audit regression: re-init after a deleted manifest must record the EXISTING
// (skipped) files in the new manifest — doctor must not certify "0 files" as healthy.
test('re-init after manifest deletion records all existing files in the manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-remanifest-'));
  try {
    run(['init'], dir);
    const manifestPath = join(dir, '.design-thinking.json');
    const original = JSON.parse(readFileSync(manifestPath, 'utf8'));
    rmSync(manifestPath);

    run(['init'], dir); // no --force: all files exist → skipped, must still be manifested
    const rebuilt = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(rebuilt.files.length, original.files.length, 'manifest must list skipped files too');
    const healthy = run(['doctor'], dir);
    assert.match(healthy, new RegExp(original.files.length + ' files present'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Audit regression: doctor must fail cleanly (no stack trace) on a corrupt manifest.
test('doctor handles corrupt and malformed manifests without a stack trace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-corrupt-'));
  try {
    run(['init'], dir);
    const manifestPath = join(dir, '.design-thinking.json');

    writeFileSync(manifestPath, '{not json');
    let threw = null;
    try { run(['doctor'], dir); } catch (e) { threw = e; }
    assert.ok(threw, 'doctor must exit non-zero on corrupt manifest');
    assert.match(String(threw.stdout || ''), /corrupt/i);
    assert.doesNotMatch(String(threw.stdout || '') + String(threw.stderr || ''), /SyntaxError|at Object|node:internal/);

    writeFileSync(manifestPath, '{"name":"x","version":"1.0.0"}'); // valid JSON, no files[]
    threw = null;
    try { run(['doctor'], dir); } catch (e) { threw = e; }
    assert.ok(threw, 'doctor must exit non-zero on manifest without files[]');
    assert.match(String(threw.stdout || ''), /corrupt/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Audit regression: unknown options must be rejected, not silently swallowed.
test('unknown options and stray arguments are rejected with exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-badflag-'));
  try {
    assert.throws(() => run(['init', '--froce'], dir), /Command failed|exited with/i);
    assert.ok(!existsSync(join(dir, '.design-thinking.json')), 'typo flag must not install');
    assert.throws(() => run(['init', 'extra-positional'], dir), /Command failed|exited with/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor reports healthy after install, unhealthy when a file is removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dt-doctor-'));
  try {
    run(['init'], dir);
    const healthy = run(['doctor'], dir);
    assert.match(healthy, /Healthy/i);

    rmSync(join(dir, '.claude/commands/design-thinking.md'));
    assert.throws(() => run(['doctor'], dir), /Command failed|exited with/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
