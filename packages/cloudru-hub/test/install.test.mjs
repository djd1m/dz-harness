// Installer tests — ADR-005 tiering + ADR-004 brake emission with EXECUTED veto.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const { install, mergeSettings, claudeSettingsFragment, probeBrake, HOOK_TEMPLATE, TIERS } = require('../src/install.js');
const { permissionRules } = require('../src/classification.js');
const pinnedEngine = { path: '/verified/cloudru-vm', verified: true, sha256: require('../data/tools-classification.json').engineSha256 };

// Every scratch dir is removed at the end (after() + process exit) unless DZ_KEEP_TMP=1 —
// MEASURED 2026-09-20: 42 cloudru-hub-test-* dirs per full sweep (backlog 7cb6f9b7).
const created = [];
const removeCreated = () => {
  if (process.env.DZ_KEEP_TMP === '1') return;
  for (const d of created.splice(0)) fs.rmSync(d, { recursive: true, force: true });
};
after(removeCreated);
process.on('exit', removeCreated);
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-hub-test-')); created.push(d); return d; };

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
  for (const target of ['openclaude', 'cursor', 'windsurf', 'copilot']) {
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

test('codex installs a project-scoped safe server and preserves unrelated TOML', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.codex'));
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), 'model = "other"\n');
  const res = install('codex', dir);
  assert.equal(res.code, 0, res.lines.join('\n'));
  const out = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
  assert.match(out, /model = "other"/);
  assert.match(out, /\[mcp_servers\.cloudru_hub\]/);
  assert.match(out, /mcp-safe/);
  assert.match(out, /enabled_tools = .*"vm_list"/);
  assert.match(out, /--toolsets","inventory"/);
  assert.doesNotMatch(out, /"deploy"/);
  assert.match(out, /default_tools_approval_mode = "prompt"/);
  assert.equal(install('codex', dir).code, 0, 'same install is idempotent');
});

test('OpenCode and Pi install a safe MCP server without replacing unrelated JSON', () => {
  for (const target of ['opencode', 'pi']) {
    const dir = tmp();
    const file = path.join(dir, target === 'pi' ? '.pi/mcp.json' : 'opencode.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(target === 'pi' ? { mcpServers: { other: { command: 'test' } }, theme: 'x' } : { mcp: { other: { type: 'remote', url: 'https://example.com/mcp' } }, theme: 'x' }));
    assert.equal(install(target, dir).code, 0);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const servers = target === 'pi' ? data.mcpServers : data.mcp;
    assert.ok(servers.other);
    assert.equal(data.theme, 'x');
    assert.match(JSON.stringify(servers.cloudru_hub), /mcp-safe/);
    assert.equal(install(target, dir).code, 0);
  }
});

test('installers refuse a competing raw Cloud.ru server', () => {
  for (const target of ['codex', 'opencode', 'pi']) {
    const dir = tmp();
    if (target === 'codex') {
      fs.mkdirSync(path.join(dir, '.codex'));
      fs.writeFileSync(path.join(dir, '.codex/config.toml'), '[mcp_servers.cloudru-vm]\ncommand = "raw"\n');
    } else {
      const file = path.join(dir, target === 'pi' ? '.pi/mcp.json' : 'opencode.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(target === 'pi' ? { mcpServers: { 'cloudru-vm': {} } } : { mcp: { 'cloudru-vm': {} } }));
    }
    assert.equal(install(target, dir).code, 2, target);
  }
});

test('Codex refuses quoted and inline TOML MCP declarations before changing the file', () => {
  const variants = [
    '[mcp_servers."cloudru-vm"]\ncommand = "raw"\n',
    '[mcp_servers."cloudru_hub"]\ncommand = "raw"\n',
    'mcp_servers = { cloudru_hub = { command = "raw" } }\n',
    '["\\u006dcp_servers"."cloudru-vm"]\ncommand = "raw"\n',
  ];
  for (const source of variants) {
    const dir = tmp();
    const file = path.join(dir, '.codex/config.toml');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, source);
    const res = install('codex', dir);
    assert.equal(res.code, 2, source);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  }
});

test('Hermes installs a guarded nonempty include list without changing unrelated YAML', () => {
  const dir = tmp();
  const file = path.join(dir, 'config.yaml');
  const source = 'plugins:\n  enabled: true\nmcp_servers:\n  github:\n    command: "other"\nagent:\n  model: "test"\n';
  fs.writeFileSync(file, source);
  const res = install('hermes', dir, { hermesHome: dir, resolvedEngine: pinnedEngine });
  assert.equal(res.code, 0, res.lines.join('\n'));
  const out = fs.readFileSync(file, 'utf8');
  assert.deepEqual(Object.keys(YAML.parse(out).mcp_servers).sort(), ['cloudru_hub', 'github']);
  assert.match(out, /mcp-safe/);
  assert.match(out, /vm_list/);
  assert.match(out, /--toolsets/);
  assert.match(out, /include: \[/);
  assert.equal(YAML.parse(out).mcp_servers.cloudru_hub.env.CLOUDRU_VM_BIN, pinnedEngine.path);
  assert.doesNotMatch(out, /"deploy"/);
  assert.match(out, /plugins:\n  enabled: true/);
  assert.match(out, /  github:\n    command: "other"/);
  assert.match(out, /agent:\n  model: "test"/);
  assert.equal(install('hermes', dir, { hermesHome: dir, resolvedEngine: pinnedEngine }).code, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), out, 'second install is idempotent');
});

test('Hermes keeps valid comments and refuses a flow-root document', () => {
  const commented = tmp();
  const file = path.join(commented, 'config.yaml');
  fs.writeFileSync(file, 'mcp_servers:\n  other:\n    command: harmless\n # explanatory comment\n');
  assert.equal(install('hermes', commented, { hermesHome: commented, resolvedEngine: pinnedEngine }).code, 0);
  assert.equal(YAML.parse(fs.readFileSync(file, 'utf8')).mcp_servers.other.command, 'harmless');
  assert.equal(YAML.parse(fs.readFileSync(file, 'utf8')).mcp_servers.cloudru_hub.tools.include.length, 11);

  const flow = tmp();
  const flowFile = path.join(flow, 'config.yaml');
  fs.writeFileSync(flowFile, '{ model: harmless }\n');
  assert.equal(install('hermes', flow, { hermesHome: flow }).code, 2);
  assert.equal(fs.readFileSync(flowFile, 'utf8'), '{ model: harmless }\n');
});

test('Hermes refuses missing or hash-mismatched engine without writing config', () => {
  for (const resolvedEngine of [
    { error: 'engine absent' },
    { ...pinnedEngine, sha256: '0'.repeat(64) },
    { ...pinnedEngine, verified: false },
  ]) {
    const dir = tmp();
    const file = path.join(dir, 'config.yaml');
    fs.writeFileSync(file, 'agent:\n  model: test\n');
    const res = install('hermes', dir, { hermesHome: dir, resolvedEngine });
    assert.equal(res.code, 2);
    assert.equal(fs.readFileSync(file, 'utf8'), 'agent:\n  model: test\n');
  }
});

test('Hermes refuses raw Cloud.ru entries and complex YAML without writing', () => {
  for (const source of [
    'mcp_servers:\n  cloudru-vm:\n    command: raw\n',
    'mcp_servers: {cloudru_hub: {command: raw}}\n',
    'mcp_servers: &servers\n  github: {}\n',
    'mcp_servers:\n  other:\n    command: harmless\n# comment\n  cloudru-vm:\n    command: raw\n',
    'mcp_servers:\n  other:\n    command: harmless\n"mcp_servers":\n  cloudru-vm:\n    command: raw\n',
  ]) {
    const dir = tmp();
    const file = path.join(dir, 'config.yaml');
    fs.writeFileSync(file, source);
    assert.equal(install('hermes', dir, { hermesHome: dir }).code, 2, source);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  }
});

test('toolset selection validates before install and limits Codex enabled_tools', () => {
  const dir = tmp();
  const invalid = install('codex', dir, { toolsets: 'inventory,all' });
  assert.equal(invalid.code, 1);
  assert.deepEqual(fs.readdirSync(dir), []);
  const ok = install('codex', dir, { toolsets: 'billing' });
  assert.equal(ok.code, 0);
  const config = fs.readFileSync(path.join(dir, '.codex/config.toml'), 'utf8');
  assert.match(config, /billing_balance/);
  assert.doesNotMatch(config, /vm_list/);
  assert.match(config, /CLOUDRU_HUB_CREDENTIALS/);
  assert.match(config, /CLOUDRU_AGREEMENT_ID/);
  assert.match(config, /CLOUDRU_KEY_ID/);
});

test('vm-deploy installs guarded tools and long-call timeouts for Codex, Hermes, OpenCode and Pi', () => {
  const codexDir = tmp();
  assert.equal(install('codex', codexDir, { toolsets: 'vm-deploy' }).code, 0);
  const config = fs.readFileSync(path.join(codexDir, '.codex/config.toml'), 'utf8');
  for (const name of ['deploy_plan', 'deploy_apply', 'vm_exec']) assert.match(config, new RegExp(`"${name}"`));
  for (const name of ['destroy', 'secret_value', 'stack_apply']) assert.doesNotMatch(config, new RegExp(`"${name}"`));
  assert.match(config, /--toolsets","vm-deploy"/);
  assert.match(config, /tool_timeout_sec = 1200/);
  assert.match(config, /env_vars = \["CLOUDRU_VM_BIN","CLOUDRU_HUB_CREDENTIALS","CLOUDRU_VM_HOME","CLOUDRU_HUB_APPROVALS"\]/);
  assert.match(config, /default_tools_approval_mode = "auto"/);

  const hermesDir = tmp();
  assert.equal(install('hermes', hermesDir, { hermesHome: hermesDir, toolsets: 'vm-deploy', resolvedEngine: pinnedEngine }).code, 0);
  const yaml = YAML.parse(fs.readFileSync(path.join(hermesDir, 'config.yaml'), 'utf8'));
  assert.ok(yaml.mcp_servers.cloudru_hub.tools.include.includes('deploy_apply'));
  assert.ok(!yaml.mcp_servers.cloudru_hub.tools.include.includes('destroy'));
  assert.equal(yaml.mcp_servers.cloudru_hub.timeout, 1200);

  const opencodeDir = tmp();
  assert.equal(install('opencode', opencodeDir, { toolsets: 'vm-deploy' }).code, 0);
  const opencode = JSON.parse(fs.readFileSync(path.join(opencodeDir, 'opencode.json'), 'utf8'));
  assert.equal(opencode.mcp.cloudru_hub.timeout, 1_200_000, 'OpenCode uses milliseconds');
  assert.equal(install('opencode', opencodeDir, { toolsets: 'vm-deploy' }).code, 0);

  const piDir = tmp();
  assert.equal(install('pi', piDir, { toolsets: 'vm-deploy' }).code, 0);
  const pi = JSON.parse(fs.readFileSync(path.join(piDir, '.pi/mcp.json'), 'utf8'));
  assert.equal(pi.mcpServers.cloudru_hub.timeout, 1200, 'Pi uses seconds');
  assert.equal(install('pi', piDir, { toolsets: 'vm-deploy' }).code, 0);
});

test('k8s-deploy installs the bounded profile across five hosts and refuses a raw Claude server', () => {
  const codexDir = tmp();
  assert.equal(install('codex', codexDir, { toolsets: 'k8s-deploy' }).code, 0);
  const codex = fs.readFileSync(path.join(codexDir, '.codex/config.toml'), 'utf8');
  assert.match(codex, /k8s-deploy/);
  assert.match(codex, /tool_timeout_sec = 1200/);
  assert.doesNotMatch(codex, /k8s_create/);

  const hermesDir = tmp();
  assert.equal(install('hermes', hermesDir, { toolsets: 'k8s-deploy', hermesHome: hermesDir, resolvedEngine: pinnedEngine }).code, 0);
  const hermes = YAML.parse(fs.readFileSync(path.join(hermesDir, 'config.yaml'), 'utf8'));
  assert.deepEqual(hermes.mcp_servers.cloudru_hub.tools.include, ['k8s_apply', 'k8s_get', 'k8s_kubectl', 'k8s_list', 'k8s_nodepools', 'k8s_options']);
  assert.equal(hermes.mcp_servers.cloudru_hub.timeout, 1200);

  const opencodeDir = tmp();
  assert.equal(install('opencode', opencodeDir, { toolsets: 'k8s-deploy' }).code, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(opencodeDir, 'opencode.json'), 'utf8')).mcp.cloudru_hub.timeout, 1_200_000);

  const piDir = tmp();
  assert.equal(install('pi', piDir, { toolsets: 'k8s-deploy' }).code, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(piDir, '.pi/mcp.json'), 'utf8')).mcpServers.cloudru_hub.timeout, 1200);

  const claudeDir = tmp();
  assert.equal(install('claude-code', claudeDir, { toolsets: 'k8s-deploy' }).code, 0);
  const mcp = JSON.parse(fs.readFileSync(path.join(claudeDir, '.mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers.cloudru_hub.args.includes('k8s-deploy'));
  assert.equal(mcp.mcpServers['cloudru-vm'], undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(claudeDir, '.claude/settings.json'), 'utf8')).enabledMcpjsonServers, ['cloudru_hub']);
  assert.equal(install('claude-code', claudeDir, { toolsets: 'k8s-deploy' }).code, 0);
  assert.equal(install('claude-code', claudeDir, { toolsets: 'k8s-deploy', npx: true }).code, 2);
  const rawDir = tmp();
  fs.writeFileSync(path.join(rawDir, '.mcp.json'), JSON.stringify({ mcpServers: { 'cloudru-vm': { command: 'unsafe' } } }));
  assert.equal(install('claude-code', rawDir, { toolsets: 'k8s-deploy' }).code, 2);
  const invalidMcp = tmp();
  fs.writeFileSync(path.join(invalidMcp, '.mcp.json'), '[]\n');
  assert.equal(install('claude-code', invalidMcp, { toolsets: 'k8s-deploy' }).code, 2);
  assert.equal(fs.readFileSync(path.join(invalidMcp, '.mcp.json'), 'utf8'), '[]\n');
  const invalidSettings = tmp();
  fs.mkdirSync(path.join(invalidSettings, '.claude'));
  fs.writeFileSync(path.join(invalidSettings, '.claude/settings.json'), '[]\n');
  assert.equal(install('claude-code', invalidSettings, { toolsets: 'k8s-deploy' }).code, 2);
  assert.equal(fs.readFileSync(path.join(invalidSettings, '.claude/settings.json'), 'utf8'), '[]\n');
});

test('unknown target is an error listing the known ones', () => {
  const res = install('emacs', tmp());
  assert.equal(res.code, 1);
  assert.ok(res.lines[0].includes('unknown target'));
  assert.equal(Object.keys(TIERS).length, 11);
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
