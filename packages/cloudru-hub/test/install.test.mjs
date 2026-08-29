// Installer tests — ADR-005 tiering + ADR-004 brake emission with EXECUTED veto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { install, mergeSettings, claudeSettingsFragment, probeBrake, HOOK_TEMPLATE, TIERS } = require('../src/install.js');
const { permissionRules } = require('../src/classification.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-hub-test-'));

test('claude-code install emits .mcp.json + permission brake + hook, and the veto is EXECUTED', () => {
  const dir = tmp();
  const res = install('claude-code', dir);
  assert.equal(res.code, 0, res.lines.join('\n'));

  const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers['cloudru-vm'], 'cloudru-vm server registered');

  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  const rules = permissionRules();
  assert.deepEqual(settings.permissions.ask, rules.ask);
  assert.deepEqual(settings.permissions.deny, rules.deny);
  assert.deepEqual(settings.permissions.allow, rules.allow);
  assert.deepEqual(settings.enabledMcpjsonServers, ['cloudru-vm']);
  assert.ok(settings.hooks.PreToolUse.some((g) => g.matcher === 'Bash'));
  assert.ok(settings.hooks.PreToolUse.some((g) => g.matcher === 'mcp__cloudru[-_]vm__k8s_kubectl'));

  assert.ok(fs.existsSync(path.join(dir, '.claude', 'hooks', 'cloudru-ssh-guard.cjs')));
  // the installer's own output must show the probe executed and vetoing
  assert.ok(res.lines.some((l) => l.includes('veto EXECUTED')));
  assert.ok(res.lines.some((l) => l.includes('probe sshpass-password-ssh: expected exit 2, got 2 ✓')));
});

test('every mutating tool of the golden classification is under ask/deny in the emitted settings — none reachable without a human click (ADR-004)', () => {
  const dir = tmp();
  install('claude-code', dir);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  const guarded = new Set([...settings.permissions.ask, ...settings.permissions.deny]);
  const cls = require('../data/tools-classification.json');
  for (const [name, c] of Object.entries(cls.tools)) {
    if (c.permission === 'allow') continue;
    for (const prefix of ['mcp__cloudru-vm__', 'mcp__cloudru_vm__']) {
      assert.ok(guarded.has(prefix + name), `${prefix}${name} must be ask/deny`);
    }
  }
});

test('install merges — existing user settings are preserved, never clobbered', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(git status:*)'], deny: ['WebFetch'] },
    hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'node my-hook.js' }] }] },
    statusLine: { type: 'command', command: 'my-status' },
  }));
  const res = install('claude-code', dir);
  assert.equal(res.code, 0);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.ok(s.permissions.allow.includes('Bash(git status:*)'), 'user allow kept');
  assert.ok(s.permissions.deny.includes('WebFetch'), 'user deny kept');
  assert.ok(s.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'node my-hook.js')), 'user Stop hook kept');
  assert.equal(s.statusLine.command, 'my-status', 'user statusLine kept');
  assert.ok(s.permissions.deny.includes('mcp__cloudru-vm__secret_value'), 'our deny added');
});

test('install is idempotent — second run does not duplicate rules or hooks', () => {
  const dir = tmp();
  install('claude-code', dir);
  install('claude-code', dir);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  const rules = permissionRules();
  assert.equal(s.permissions.ask.length, rules.ask.length);
  const bashGroups = s.hooks.PreToolUse.filter((g) => g.matcher === 'Bash');
  assert.equal(bashGroups.length, 1);
  assert.equal(bashGroups[0].hooks.length, 1);
});

test('DEGRADED targets are refused with the ADR-005 reason — never a fake install', () => {
  for (const target of ['openclaude', 'opencode', 'cursor', 'windsurf', 'copilot']) {
    const dir = tmp();
    const res = install(target, dir);
    assert.equal(res.code, 2, target);
    assert.ok(res.lines.join('\n').includes('REFUSED'), target);
    assert.ok(res.lines.join('\n').includes('ADR-005'), target);
    assert.equal(fs.readdirSync(dir).length, 0, `${target}: nothing may be written`);
  }
});

test('POINTER-ONLY targets get the ≤2048-char pointer with the mandatory no-veto warning', () => {
  for (const target of ['agents-md', 'gemini']) {
    const dir = tmp();
    const res = install(target, dir);
    assert.equal(res.code, 0, target);
    const pointer = fs.readFileSync(path.join(dir, 'CLOUDRU-POINTER.md'), 'utf8');
    assert.ok(pointer.length <= 2048, `${target}: pointer is ${pointer.length} chars > 2048 (ADR-006 cap)`);
    assert.ok(Buffer.byteLength(pointer) <= 4096, `${target}: pointer exceeds the 4 KB byte cap (ADR-005)`);
    assert.match(pointer, /ПРЕДУПРЕЖДЕНИЕ/, 'warning line is mandatory');
    assert.match(pointer, /вето|veto/i, 'must warn about the missing veto');
    assert.ok(!/tool_search|hermes cron/.test(pointer), 'pointer carries no Hermes dialect');
  }
});

test('codex is plan-only: prints the user-global steps + mandatory live probe, applies nothing', () => {
  const dir = tmp();
  const res = install('codex', dir);
  assert.equal(res.code, 3);
  const out = res.lines.join('\n');
  assert.ok(out.includes('codex mcp add'));
  assert.ok(out.includes('~/.codex/hooks.json'));
  assert.ok(out.includes('MANDATORY probe'));
  assert.equal(fs.readdirSync(dir).length, 0, 'nothing written');
});

test('unknown target is an error listing the known ones', () => {
  const res = install('emacs', tmp());
  assert.equal(res.code, 1);
  assert.ok(res.lines[0].includes('unknown target'));
  assert.equal(Object.keys(TIERS).length, 9);
});

test('probeBrake discriminates: a hook that stops vetoing FAILS the probe (broken-brake control)', () => {
  const dir = tmp();
  const brokenHook = path.join(dir, 'broken-guard.cjs');
  // A "hook" that allows everything — the brake with its regexes deleted.
  fs.writeFileSync(brokenHook, '#!/usr/bin/env node\nprocess.exit(0);\n');
  const probe = probeBrake(brokenHook);
  assert.equal(probe.ok, false, 'a pass-everything hook must fail the probe');
  const shouldHaveBlocked = probe.results.filter((r) => r.expected === 2);
  assert.ok(shouldHaveBlocked.every((r) => r.got === 0), 'the paid-step commands got through — and the probe saw it');
  // and the real template passes
  assert.equal(probeBrake(HOOK_TEMPLATE).ok, true);
});

test('mergeSettings unions permissions and never drops a deny', () => {
  const merged = mergeSettings(
    { permissions: { deny: ['X'] } },
    claudeSettingsFragment('node hook.cjs'),
  );
  assert.ok(merged.permissions.deny.includes('X'));
  assert.ok(merged.permissions.deny.includes('mcp__cloudru-vm__secret_value'));
});
