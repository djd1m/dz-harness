'use strict';
// Per-target installer — ADR-005 tiering (tier derived from flow requirements R1–R5,
// live-probe discipline) + ADR-004 brake emission (permission ask/deny + PreToolUse veto).
//
// Tier map (ADR-005 Decision, applied verbatim):
//   claude-code  FULL candidate — full install path (this module emits it)
//   codex        FULL candidate #2 — plan printed, NOT auto-applied (delivery requires an
//                EXECUTED veto probe; project hooks.json is a measured silent no-op)
//   openclaude / opencode / cursor / windsurf / copilot
//                DEGRADED-until-proven — installer REFUSES (no live probe delivered yet)
//   agents-md / gemini
//                POINTER-ONLY — ≤2048-char pointer + no-veto warning, never a fake install
//
// The installer NEVER claims success without executing the brake: after emitting files it
// RUNS the forbidden-command fixtures through the emitted hook and requires the block
// (ADR-004/ADR-005: "наличие файла хука — не evidence"; layout ≠ registration).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { permissionRules } = require('./classification');

const HOOK_TEMPLATE = path.join(__dirname, '..', 'templates', '.claude', 'hooks', 'cloudru-ssh-guard.cjs');
const POINTER_TEMPLATE = path.join(__dirname, '..', 'data', 'pointer-section.md');

const TIERS = {
  'claude-code': 'full',
  codex: 'plan-only',
  openclaude: 'degraded',
  opencode: 'degraded',
  cursor: 'degraded',
  windsurf: 'degraded',
  copilot: 'degraded',
  'agents-md': 'pointer',
  gemini: 'pointer',
};

const DEGRADED_REASONS = {
  openclaude: 'all three legs exist upstream (.mcp.json, PreToolUse deny, .openclaude/skills) but NOTHING has been probed live — degraded-until-proven (ADR-005).',
  opencode: 'MCP + veto plugins are documented, zero live runs; R4 (tool budget deferral) unverified (ADR-005).',
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

/**
 * Install into a project dir for a target. Pure I/O orchestration; returns
 * {code, lines:[...]} — code 0 success, 2 refused (degraded), 3 plan-only, 1 failure.
 */
function install(target, projectDir, opts = {}) {
  const lines = [];
  const tier = TIERS[target];
  if (!tier) {
    return { code: 1, lines: [`cloudru-hub install: unknown target "${target}" (known: ${Object.keys(TIERS).join(', ')})`] };
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

  if (tier === 'plan-only') {
    // codex: strongest non-Claude-Code target, but hooks are user-global-only and a
    // non-executed veto is indistinguishable from an absent one (measured, codex.md §3).
    return {
      code: 3,
      lines: [
        'cloudru-hub install: target "codex" — plan printed, NOT auto-applied (ADR-005: delivery requires an EXECUTED veto probe).',
        '  1. codex mcp add cloudru-vm -- cloudru-hub mcp        # registers the stdio server in ~/.codex/config.toml',
        `  2. Merge into ~/.codex/hooks.json (user-global ONLY — project hooks.json is a measured silent no-op):`,
        `     {"hooks":{"preToolUse":[{"command":"node ${HOOK_TEMPLATE}"}]}}`,
        '  3. MANDATORY probe: in a codex session run `sshpass -p x ssh user1@1.2.3.4` and CONFIRM the block message.',
        '     A hook file on disk is NOT evidence (health-advisor 1.2.0 lesson: layout ≠ registration).',
      ],
    };
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
  install,
};
