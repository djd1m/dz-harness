'use strict';
// Per-target installer — Claude settings plus guarded MCP registrations for other hosts.
//
// Tier map (ADR-005 Decision, applied verbatim):
//   claude-code  FULL candidate — full install path (this module emits it)
//   codex / opencode / pi — project-scoped, pinned read-only MCP proxy;
//                host activation still needs a live probe
//   hermes       guarded MCP entry in $HERMES_HOME/config.yaml (complex YAML refused)
//   openclaude / cursor / windsurf / copilot
//                DEGRADED-until-proven — installer REFUSES (no live probe delivered yet)
//   agents-md / gemini
//                POINTER-ONLY — ≤2048-char pointer + no-veto warning, never a fake install
//
// The installer NEVER claims success without executing the brake: after emitting files it
// RUNS the forbidden-command fixtures through the emitted hook and requires the block
// (ADR-004/ADR-005: "наличие файла хука — не evidence"; layout ≠ registration).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { spawnSync } = require('child_process');
const YAML = require('yaml');
const { permissionRules, loadClassification } = require('./classification');
const { resolveEngine } = require('./resolve');
const { selectedToolNames } = require('./toolsets');

const HOOK_TEMPLATE = path.join(__dirname, '..', 'templates', '.claude', 'hooks', 'cloudru-ssh-guard.cjs');
const POINTER_TEMPLATE = path.join(__dirname, '..', 'data', 'pointer-section.md');

const TIERS = {
  'claude-code': 'full',
  codex: 'safe-mcp',
  hermes: 'safe-mcp',
  opencode: 'safe-mcp',
  pi: 'safe-mcp',
  openclaude: 'degraded',
  cursor: 'degraded',
  windsurf: 'degraded',
  copilot: 'degraded',
  'agents-md': 'pointer',
  gemini: 'pointer',
};

const DEGRADED_REASONS = {
  openclaude: 'all three legs exist upstream (.mcp.json, PreToolUse deny, .openclaude/skills) but NOTHING has been probed live — degraded-until-proven (ADR-005).',
  cursor: 'veto hooks documented only; R3 broken by the .mdc adapter, R4 truncation history (~40 tools) unresolved (ADR-005).',
  windsurf: 'R4 FAILS as-is: Cascade budget 100 tools < 144 — needs the engine tool-profile before any delivery (ADR-005).',
  copilot: 'only Copilot CLI is a candidate; the coding agent fails R2 by construction ("will not ask for your approval" + hook timeout fail-open) (ADR-005).',
};

// ── pure merge helpers (p-replicator pattern: add, union, never overwrite/remove user config) ──

function mergeHookEvents(existing, template) {
  const merged = { ...existing };
  for (const [event, tplGroups] of Object.entries(template)) {
    const cur = Array.isArray(merged[event]) ? merged[event] : [];
    const result = cur.map((m) => ({ ...m, hooks: [...(m.hooks || [])] }));
    for (const tplEntry of tplGroups) {
      const target = result.find((e) => e.matcher === tplEntry.matcher);
      if (!target) {
        result.push({ ...tplEntry, hooks: [...(tplEntry.hooks || [])] });
        continue;
      }
      const existingCmds = new Set(target.hooks.map((h) => h.command));
      for (const tplHook of tplEntry.hooks || []) {
        if (!existingCmds.has(tplHook.command)) target.hooks.push(tplHook);
      }
    }
    merged[event] = result;
  }
  return merged;
}

function unionSorted(a, b) {
  return [...new Set([...(a || []), ...(b || [])])].sort();
}

/** Union-merge our settings fragment into an existing settings object. User entries are
 *  never removed; our deny additions cannot be silently dropped (union). */
function mergeSettings(existing, fragment) {
  const merged = { ...(existing || {}) };
  if (fragment.permissions) {
    const cur = merged.permissions && typeof merged.permissions === 'object' ? merged.permissions : {};
    merged.permissions = {
      ...cur,
      allow: unionSorted(cur.allow, fragment.permissions.allow),
      ask: unionSorted(cur.ask, fragment.permissions.ask),
      deny: unionSorted(cur.deny, fragment.permissions.deny),
    };
  }
  if (fragment.enabledMcpjsonServers) {
    merged.enabledMcpjsonServers = unionSorted(merged.enabledMcpjsonServers, fragment.enabledMcpjsonServers);
  }
  if (fragment.hooks) merged.hooks = mergeHookEvents(merged.hooks || {}, fragment.hooks);
  return merged;
}

/** The settings fragment for claude-code — the ADR-004 brake as data. */
function claudeSettingsFragment(hookCommand) {
  const rules = permissionRules();
  return {
    permissions: { allow: rules.allow, ask: rules.ask, deny: rules.deny },
    enabledMcpjsonServers: ['cloudru-vm'],
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: hookCommand, timeout: 10 }] },
        { matcher: 'mcp__cloudru[-_]vm__k8s_kubectl', hooks: [{ type: 'command', command: hookCommand, timeout: 10 }] },
      ],
    },
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

const SAFE_SERVER = 'cloudru_hub';
const longRunningProfile = (toolsets) => toolsets === 'vm-deploy' || toolsets === 'k8s-deploy';
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function safeCommand(toolsets) {
  return { command: process.execPath, args: [path.join(__dirname, '..', 'bin', 'cloudru-hub.js'), 'mcp-safe', '--toolsets', toolsets] };
}

function installClaudeK8s(projectDir, opts = {}) {
  if (opts.npx) return { code: 2, lines: ['cloudru-hub install: k8s-deploy requires the local guarded launcher; npx package publication is not assumed.'] };
  const file = path.join(projectDir, '.mcp.json');
  const settingsFile = path.join(projectDir, '.claude', 'settings.json');
  if ((fs.existsSync(file) && !readJson(file)) || (fs.existsSync(settingsFile) && !readJson(settingsFile))) {
    return { code: 2, lines: ['cloudru-hub install: existing Claude JSON is invalid; refusing to replace it.'] };
  }
  const mcp = readJson(file) || {};
  if (!record(mcp)) return { code: 2, lines: ['cloudru-hub install: Claude MCP JSON root must be an object.'] };
  if (mcp.mcpServers && !record(mcp.mcpServers)) {
    return { code: 2, lines: ['cloudru-hub install: existing Claude MCP server map is invalid.'] };
  }
  const servers = mcp.mcpServers || {};
  if (servers['cloudru-vm'] || servers.cloudru_vm) return { code: 2, lines: ['cloudru-hub install: raw Cloud.ru MCP server is present; remove it from this isolated project before enabling k8s-deploy.'] };
  const cmd = safeCommand('k8s-deploy');
  const desired = { command: cmd.command, args: cmd.args };
  if (servers[SAFE_SERVER] && !isDeepStrictEqual(servers[SAFE_SERVER], desired)) {
    return { code: 2, lines: ['cloudru-hub install: existing cloudru_hub server differs from the guarded k8s-deploy command.'] };
  }
  const settings = readJson(settingsFile) || {};
  if (!record(settings)) return { code: 2, lines: ['cloudru-hub install: Claude settings JSON root must be an object.'] };
  if (settings.enabledMcpjsonServers && !Array.isArray(settings.enabledMcpjsonServers)) {
    return { code: 2, lines: ['cloudru-hub install: existing Claude enabled server list is invalid.'] };
  }
  if (settings.enabledMcpjsonServers?.some((name) => name === 'cloudru-vm' || name === 'cloudru_vm')) {
    return { code: 2, lines: ['cloudru-hub install: raw Cloud.ru MCP server is enabled in Claude settings; use an isolated project.'] };
  }
  mcp.mcpServers = { ...servers, [SAFE_SERVER]: desired };
  writeJson(file, mcp);
  writeJson(settingsFile, { ...settings, enabledMcpjsonServers: unionSorted(settings.enabledMcpjsonServers, [SAFE_SERVER]) });
  return { code: 0, lines: [`cloudru-hub install: guarded k8s-deploy server written to ${file}.`,
    '  Claude Code activation and actual agent calls remain unverified until inference access returns.'] };
}

function installJsonMcp(target, projectDir, toolsets) {
  const opencode = target === 'opencode';
  const file = path.join(projectDir, opencode ? 'opencode.json' : '.pi/mcp.json');
  if (opencode && fs.existsSync(path.join(projectDir, 'opencode.jsonc'))) {
    return { code: 2, lines: ['cloudru-hub install: REFUSED — opencode.jsonc exists; merge the safe server manually to avoid competing project configs.'] };
  }
  let config = {};
  if (fs.existsSync(file)) {
    try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return { code: 2, lines: [`cloudru-hub install: REFUSED — ${file} is not strict JSON; no changes written.`] }; }
  }
  if (!config || Array.isArray(config) || typeof config !== 'object') return { code: 2, lines: ['cloudru-hub install: REFUSED — config root is not an object.'] };
  const parent = opencode ? config.mcp : config.mcpServers;
  if (parent != null && (Array.isArray(parent) || typeof parent !== 'object')) return { code: 2, lines: ['cloudru-hub install: REFUSED — MCP config is not an object.'] };
  const servers = parent || {};
  if (servers['cloudru-vm'] || servers.cloudru_vm) return { code: 2, lines: ['cloudru-hub install: REFUSED — a raw cloudru-vm server already exists; remove it before enabling the safe server.'] };
  const cmd = safeCommand(toolsets);
  const entry = opencode
    ? { type: 'local', command: [cmd.command, ...cmd.args], enabled: true, ...(longRunningProfile(toolsets) ? { timeout: 1_200_000 } : {}) }
    : { ...cmd, enabled: true, ...(longRunningProfile(toolsets) ? { timeout: 1200 } : {}), description: toolsets === 'vm-deploy' ? 'Pinned Cloud.ru VM deployment with local plan approval' : toolsets === 'k8s-deploy' ? 'Pinned Cloud.ru Kubernetes deployment with exact-manifest approval' : 'Pinned Cloud.ru MCP tools with cloud mutations blocked' };
  if (servers[SAFE_SERVER] && JSON.stringify(servers[SAFE_SERVER]) !== JSON.stringify(entry)) {
    return { code: 2, lines: [`cloudru-hub install: REFUSED — ${SAFE_SERVER} already has a different configuration.`] };
  }
  servers[SAFE_SERVER] = entry;
  if (opencode) config.mcp = servers;
  else config.mcpServers = servers;
  writeJson(file, config);
  return { code: 0, lines: [`cloudru-hub install: wrote ${file} with ${SAFE_SERVER} → mcp-safe.`, '  Activation requires a trusted project and a host-side connection probe; no live host claim made.'] };
}

function installCodex(projectDir, toolsets) {
  const file = path.join(projectDir, '.codex', 'config.toml');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const cmd = safeCommand(toolsets);
  const tools = selectedToolNames(toolsets);
  const inheritedEnv = longRunningProfile(toolsets)
    ? ['CLOUDRU_VM_BIN', 'CLOUDRU_HUB_CREDENTIALS', 'CLOUDRU_VM_HOME', 'CLOUDRU_HUB_APPROVALS']
    : ['CLOUDRU_VM_BIN'];
  if (tools.some((name) => name.startsWith('billing_'))) {
    for (const name of ['CLOUDRU_HUB_CREDENTIALS', 'CLOUDRU_AGREEMENT_ID', 'CLOUDRU_KEY_ID', 'CLOUDRU_SECRET', 'CLOUDRU_PROJECT_ID', 'CLOUDRU_REGION']) {
      if (!inheritedEnv.includes(name)) inheritedEnv.push(name);
    }
  }
  const entry = `# cloudru-hub safe BEGIN\n[mcp_servers.${SAFE_SERVER}]\ncommand = ${JSON.stringify(cmd.command)}\nargs = ${JSON.stringify(cmd.args)}\nenv_vars = ${JSON.stringify(inheritedEnv)}\nrequired = true\nenabled_tools = ${JSON.stringify(tools)}\ndefault_tools_approval_mode = ${JSON.stringify(longRunningProfile(toolsets) ? 'auto' : 'prompt')}\n${longRunningProfile(toolsets) ? 'tool_timeout_sec = 1200\n' : ''}# cloudru-hub safe END\n`;
  // TOML has quoted/dotted keys and inline tables. A regex that checks only a
  // bare section name can leave a raw server enabled alongside this one. The
  // zero-dependency installer therefore owns its exact block and refuses any
  // other MCP declaration for manual review rather than guessing its meaning.
  const remainder = existing.includes(entry) ? existing.replace(entry, '') : existing;
  if (/mcp_servers|^\s*(?:\[\s*["']|["'][^"']+["']\s*=)|\\u[0-9a-f]{4}/im.test(remainder)) {
    return { code: 2, lines: ['cloudru-hub install: REFUSED — existing MCP/TOML syntax needs manual review before adding a safe server.'] };
  }
  if (remainder !== existing) return { code: 0, lines: [`cloudru-hub install: ${file} already contains the safe server.`] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, existing.trimEnd() + '\n' + entry);
  return { code: 0, lines: [`cloudru-hub install: wrote ${file} with ${tools.length} classified tools and mcp-safe.`, '  Codex loads project config only in a trusted project; run a live host probe before claiming activation.'] };
}

function hermesBlock(toolsets, enginePath, indent = '  ') {
  const cmd = safeCommand(toolsets);
  const include = selectedToolNames(toolsets);
  return [
    `${indent}# cloudru-hub safe BEGIN`,
    `${indent}${SAFE_SERVER}:`,
    `${indent}${indent}command: ${JSON.stringify(cmd.command)}`,
    `${indent}${indent}args: ${JSON.stringify(cmd.args)}`,
    `${indent}${indent}env:`,
    `${indent}${indent}${indent}CLOUDRU_VM_BIN: ${JSON.stringify(enginePath)}`,
    `${indent}${indent}enabled: true`,
    `${indent}${indent}timeout: ${longRunningProfile(toolsets) ? 1200 : 120}`,
    `${indent}${indent}tools:`,
    `${indent}${indent}${indent}include: [${include.map((name) => JSON.stringify(name)).join(', ')}]`,
    `${indent}# cloudru-hub safe END`,
  ].join('\n') + '\n';
}

function installHermes(toolsets, opts = {}) {
  const home = path.resolve(opts.hermesHome || process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'));
  const file = path.join(home, 'config.yaml');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const refuse = (reason) => ({ code: 2, lines: [`cloudru-hub install: REFUSED — ${reason}; ${file} was not changed.`] });
  let original;
  let before;
  try {
    original = YAML.parseDocument(existing, { uniqueKeys: true });
    if (original.errors.length || (original.contents && (!YAML.isMap(original.contents) || original.contents.flow))) {
      return refuse('existing YAML is invalid or not a block mapping');
    }
    before = original.toJS() || {};
    if (before.mcp_servers != null && (Array.isArray(before.mcp_servers) || typeof before.mcp_servers !== 'object')) {
      return refuse('mcp_servers is not a mapping');
    }
  } catch { return refuse('existing YAML could not be parsed'); }
  if (/\t|^---\s*$|^\.\.\.\s*$/m.test(existing)) return refuse('complex YAML needs manual review');
  const sections = [...existing.matchAll(/^mcp_servers:\s*(?:#.*)?$/gm)];
  if (sections.length > 1) return refuse('duplicate mcp_servers sections');
  if (!sections.length && /^mcp_servers\s*:/m.test(existing)) return refuse('mcp_servers is not a plain top-level mapping');
  if (!sections.length && /(?:^|\n)\s*["']?mcp_servers["']?\s*:/m.test(existing)) return refuse('complex mcp_servers syntax needs manual review');
  // YAML duplicate keys may be accepted with last-value-wins semantics. A
  // quoted second mcp_servers key could hide the server we just inserted.
  if ((existing.match(/mcp_servers/g) || []).length !== sections.length || /\\[uxU][0-9a-f]+/i.test(existing)) {
    return refuse('duplicate or escaped YAML keys need manual review');
  }

  let indent = '  ';
  let insertAt = existing.length;
  let blockText = '';
  if (sections.length) {
    const section = sections[0];
    const contentStart = section.index + section[0].length + (existing[section.index + section[0].length] === '\n' ? 1 : 0);
    const next = /^\S[^\n]*$/gm;
    next.lastIndex = contentStart;
    const match = next.exec(existing);
    insertAt = match ? match.index : existing.length;
    blockText = existing.slice(contentStart, insertAt);
    const indents = [...blockText.matchAll(/^([ ]+)(\S.*)$/gm)]
      .filter((m) => !m[2].startsWith('#')).map((m) => m[1].length);
    if (indents.length) {
      const min = Math.min(...indents);
      indent = ' '.repeat(min);
      if (min > 8) return refuse('unusual mcp_servers indentation');
    }
  } else if (/\b(?:cloudru[-_]vm|cloudru_hub)\b/i.test(existing)) {
    return refuse('Cloud.ru configuration is already mentioned');
  }

  // Hermes deliberately strips non-baseline environment variables before
  // starting MCP servers. Resolve the engine now and pass only its path in
  // the server-specific env; the proxy hashes the file again at runtime.
  const engine = opts.resolvedEngine || resolveEngine();
  if (engine.error || !engine.verified || !engine.path || engine.sha256 !== loadClassification().engineSha256) {
    return refuse('a locally available, hash-verified Cloud.ru engine is required for Hermes');
  }
  const enginePath = path.resolve(engine.path);
  const block = hermesBlock(toolsets, enginePath, indent);
  if (/\b(?:cloudru[-_]vm|cloudru_hub)\b/i.test(existing.replace(block, ''))) {
    return refuse('a Cloud.ru server is already mentioned outside this exact safe block');
  }
  if (blockText.includes('# cloudru-hub safe BEGIN')) {
    const remainder = blockText.replace(block, '');
    if (remainder !== blockText && !/\b(?:cloudru[-_]vm|cloudru_hub)\b|[&*]|<<\s*:/i.test(remainder)) {
      return { code: 0, lines: [`cloudru-hub install: ${file} already contains the safe server.`] };
    }
    return refuse('existing cloudru-hub block differs from the requested toolset');
  }
  if (/\b(?:cloudru[-_]vm|cloudru_hub)\b|[&*]|<<\s*:/i.test(blockText)) return refuse('Cloud.ru server or YAML aliases already occur in mcp_servers');
  const updated = sections.length
    ? existing.slice(0, insertAt) + (insertAt && existing[insertAt - 1] !== '\n' ? '\n' : '') + block + existing.slice(insertAt)
    : existing.trimEnd() + (existing.trim() ? '\n\n' : '') + 'mcp_servers:\n' + block;
  try {
    const candidate = YAML.parseDocument(updated, { uniqueKeys: true });
    if (candidate.errors.length) return refuse('generated YAML failed syntax validation');
    const cmd = safeCommand(toolsets);
    const expected = {
      ...before,
      mcp_servers: {
        ...(before.mcp_servers || {}),
        [SAFE_SERVER]: { command: cmd.command, args: cmd.args, env: { CLOUDRU_VM_BIN: enginePath }, enabled: true, timeout: longRunningProfile(toolsets) ? 1200 : 120, tools: { include: selectedToolNames(toolsets) } },
      },
    };
    if (!isDeepStrictEqual(candidate.toJS(), expected)) return refuse('generated YAML would change other configuration');
  } catch { return refuse('generated YAML could not be validated'); }
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const tmp = path.join(home, `.config.yaml.cloudru-hub-${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, updated, { flag: 'wx', mode: fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600 });
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
  return { code: 0, lines: [`cloudru-hub install: wrote ${file} with ${selectedToolNames(toolsets).length} classified tools and mcp-safe.`, '  Restart Hermes and inspect loaded MCP tools before claiming activation.'] };
}

/**
 * Execute the emitted brake against the ADR-004 acid fixtures and REQUIRE the veto.
 * Returns {ok, results:[{fixture, expected, got}]}. An installer that skips this and
 * declares success anyway is the health-advisor-1.2.0 failure class.
 */
function probeBrake(hookPath) {
  const fixtures = [
    { name: 'sshpass-password-ssh', payload: { tool_name: 'Bash', tool_input: { command: 'sshpass -p hunter2 ssh user1@1.2.3.4' } }, expect: 2 },
    { name: 'keyed-ssh-allowed', payload: { tool_name: 'Bash', tool_input: { command: 'ssh -i /tmp/key user1@1.2.3.4 uptime' } }, expect: 0 },
    { name: 'kubectl-rollout-restart-denied', payload: { tool_name: 'mcp__cloudru-vm__k8s_kubectl', tool_input: { args: 'rollout restart deployment/app' } }, expect: 2 },
    { name: 'kubectl-rollout-status-allowed', payload: { tool_name: 'mcp__cloudru-vm__k8s_kubectl', tool_input: { args: 'rollout status deployment/app' } }, expect: 0 },
  ];
  const results = [];
  let ok = true;
  for (const f of fixtures) {
    const r = spawnSync(process.execPath, [hookPath], { input: JSON.stringify(f.payload), encoding: 'utf8', timeout: 10_000 });
    const got = typeof r.status === 'number' ? r.status : -1;
    if (got !== f.expect) ok = false;
    results.push({ fixture: f.name, expected: f.expect, got });
  }
  return { ok, results };
}

/** Install files or print guarded setup instructions; code 0 emitted, 2 refused, 3 manual setup. */
function install(target, projectDir, opts = {}) {
  const lines = [];
  const tier = TIERS[target];
  if (!tier) {
    return { code: 1, lines: [`cloudru-hub install: unknown target "${target}" (known: ${Object.keys(TIERS).join(', ')})`] };
  }
  const toolsets = opts.toolsets || 'inventory';
  if (target === 'claude-code' && toolsets === 'k8s-deploy') {
    try { selectedToolNames(toolsets); }
    catch (error) { return { code: 1, lines: [`cloudru-hub install: ${error.message}`] }; }
    return installClaudeK8s(projectDir, opts);
  }
  if (['codex', 'opencode', 'pi', 'hermes'].includes(target)) {
    try { selectedToolNames(toolsets); }
    catch (error) { return { code: 1, lines: [`cloudru-hub install: ${error.message}`] }; }
  }

  if (tier === 'degraded') {
    return {
      code: 2,
      lines: [
        `cloudru-hub install: REFUSED for target "${target}" (tier DEGRADED, ADR-005).`,
        `  Reason: ${DEGRADED_REASONS[target]}`,
        '  A mutating flow without a live-probed deterministic brake is not delivered on any tier.',
      ],
    };
  }

  if (tier === 'pointer') {
    const pointer = fs.readFileSync(POINTER_TEMPLATE, 'utf8');
    const out = path.join(projectDir, 'CLOUDRU-POINTER.md');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(out, pointer);
    return {
      code: 0,
      lines: [
        `cloudru-hub install: target "${target}" is POINTER-ONLY (ADR-005) — no tools, no executable instructions, no fake support.`,
        `  Wrote ${out} (${Buffer.byteLength(pointer)} bytes). Append it to your ${target === 'gemini' ? 'GEMINI.md' : 'AGENTS.md'}.`,
        '  ⚠ It contains the mandatory no-veto warning — do not strip it.',
      ],
    };
  }

  if (tier === 'safe-mcp') {
    if (target === 'codex') return installCodex(projectDir, toolsets);
    if (target === 'hermes') return installHermes(toolsets, opts);
    return installJsonMcp(target, projectDir, toolsets);
  }

  // ── claude-code FULL path ──
  const claudeDir = path.join(projectDir, '.claude');
  const hookDest = path.join(claudeDir, 'hooks', 'cloudru-ssh-guard.cjs');
  fs.mkdirSync(path.dirname(hookDest), { recursive: true });
  fs.copyFileSync(HOOK_TEMPLATE, hookDest);
  fs.chmodSync(hookDest, 0o755);
  const hookCommand = 'node .claude/hooks/cloudru-ssh-guard.cjs';

  // .mcp.json (project root — .claude/mcp.json is NOT read by Claude Code, measured gap G5)
  const mcpFile = path.join(projectDir, '.mcp.json');
  const mcp = readJson(mcpFile) || {};
  const servers = mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : {};
  const launcherBin = path.join(__dirname, '..', 'bin', 'cloudru-hub.js');
  servers['cloudru-vm'] = opts.npx
    ? { command: 'npx', args: ['-y', '@dzhechkov/cloudru-hub', 'mcp'] }
    : { command: 'node', args: [launcherBin, 'mcp'] };
  mcp.mcpServers = servers;
  writeJson(mcpFile, mcp);

  // .claude/settings.json — permissions brake + hooks (merge, never clobber)
  const settingsFile = path.join(claudeDir, 'settings.json');
  const merged = mergeSettings(readJson(settingsFile), claudeSettingsFragment(hookCommand));
  writeJson(settingsFile, merged);

  const rules = permissionRules();
  lines.push(`cloudru-hub install: claude-code files emitted into ${projectDir}`);
  lines.push(`  .mcp.json                 cloudru-vm server (${opts.npx ? 'npx form' : 'local launcher path'})`);
  lines.push(`  .claude/settings.json     permissions: ${rules.allow.length} allow / ${rules.ask.length} ask / ${rules.deny.length} deny rules (both mcp__cloudru-vm__ and mcp__cloudru_vm__ spellings until the prefix is live-probed)`);
  lines.push('  .claude/hooks/cloudru-ssh-guard.cjs  PreToolUse veto (Bash ssh-guard + kubectl rollout guard)');

  // The EXECUTED veto — success is conditional on the block being observed.
  const probe = probeBrake(hookDest);
  for (const r of probe.results) {
    lines.push(`  probe ${r.fixture}: expected exit ${r.expected}, got ${r.got} ${r.expected === r.got ? '✓' : '✗'}`);
  }
  if (!probe.ok) {
    lines.push('cloudru-hub install: ✗ the emitted brake did NOT veto the forbidden fixture — NOT installed (a non-executing hook is indistinguishable from an absent one).');
    return { code: 1, lines };
  }
  lines.push('cloudru-hub install: ✓ veto EXECUTED and observed on the forbidden fixtures.');
  lines.push('  Remaining manual probe (cannot be machine-checked from here, ADR-004 Confirmation): in a fresh');
  lines.push('  Claude Code session, call a mutating tool (e.g. mcp__cloudru-vm__deploy) and confirm a permission');
  lines.push('  prompt appears instead of execution; record which mcp__ prefix spelling the runtime used.');
  return { code: 0, lines };
}

module.exports = {
  TIERS,
  DEGRADED_REASONS,
  HOOK_TEMPLATE,
  mergeSettings,
  mergeHookEvents,
  claudeSettingsFragment,
  probeBrake,
  installClaudeK8s,
  install,
};
