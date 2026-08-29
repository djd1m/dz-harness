'use strict';
// cloudru-hub CLI — thin npm launcher for the cloudru-vm MCP engine (ADR-002).
// Zero dependencies, CommonJS, boots from any cwd (dz release smoke contract).

const { spawn, spawnSync } = require('child_process');
const { resolveEngine } = require('./resolve');
const { loadClassification, loadSnapshot, coverageGaps } = require('./classification');
const { install } = require('./install');
const { compileSkill, writeCompiled } = require('./dialects');
const PKG = require('../package.json');

function showHelp(write) {
  write(`cloudru-hub ${PKG.version} — unofficial Cloud.ru Evolution launcher (NOT affiliated with Cloud.ru)

The cloudru-vm engine binary is resolved at RUNTIME, never bundled in this package.
Engine additions authored by Тимур (publication approved — grant record in LICENSE Part 2);
launcher, adapters and CLI foundation by Dmitry Zhechkov (MIT).

Usage: cloudru-hub <command> [options]

Commands:
  resolve [--json]         Locate the engine binary (env CLOUDRU_VM_BIN → ~/.cloudru-hub/config.json
                           enginePath → optional platform package) and verify its sha256 pin.
  self-test [--json]       End-to-end local check: resolve → sha256 → engine version → live
                           tools/list probe → golden-classification coverage. Exit 0 = all green.
  mcp                      Run the resolved engine as an MCP stdio server (what .mcp.json points at).
  install --target <t>     Emit the per-target integration per ADR-005 tiering:
                           claude-code (full: .mcp.json + permission brake + PreToolUse veto, with an
                           EXECUTED veto probe), codex (plan-only), agents-md|gemini (pointer-only),
                           openclaude|opencode|cursor|windsurf|copilot (refused: DEGRADED until live probe).
           [--dir <path>]  Project directory (default: cwd).  [--npx] use the npx form in .mcp.json.
  compile-skill --canonical <dir> --target <t> --out <dir>
                           Generate a target dialect of the canonical skill tree (ADR-006). The
                           canonical corpus is NOT shipped here; point --canonical at the skill/
                           directory of an engine distribution.
  version                  Print launcher version and pinned engine hashes.
  help                     This text.

Local testing (this server, no publish): docs/LOCAL-TESTING.md`);
}

function parseArgs(argv) {
  const flags = new Set();
  const opts = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--npx' || a === '--help' || a === '-h') flags.add(a.replace(/^-+/, ''));
    else if (a.startsWith('--')) { opts.set(a.slice(2), argv[i + 1]); i++; }
    else positional.push(a);
  }
  return { flags, opts, positional };
}

function jsonRpcProbe(binPath, timeoutMs = 20_000) {
  const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n';
  const r = spawnSync(binPath, ['mcp'], { input: req, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return { error: String(r.error.message || r.error) };
  const line = String(r.stdout || '').split('\n').find((l) => l.trim().startsWith('{'));
  if (!line) return { error: 'engine produced no JSON-RPC response line' };
  try {
    const parsed = JSON.parse(line);
    const tools = parsed && parsed.result && Array.isArray(parsed.result.tools) ? parsed.result.tools : null;
    if (!tools) return { error: 'tools/list response carries no result.tools' };
    return { tools };
  } catch (e) {
    return { error: 'unparseable tools/list response: ' + e.message };
  }
}

function cmdResolve(flags, write) {
  const r = resolveEngine();
  if (r.error) { write(r.error); return 1; }
  if (flags.has('json')) { write(JSON.stringify(r, null, 2)); return 0; }
  write(`engine   ${r.path}`);
  write(`source   ${r.source}`);
  write(`sha256   ${r.sha256}`);
  write(`pinned   ${r.pinned || '<no pin for ' + r.key + '>'}`);
  write(`verified ${r.verified ? 'yes — matches the pinned baseline' : 'NO — not the pinned baseline (tolerated for env/config paths)'}`);
  return 0;
}

function cmdSelfTest(flags, write) {
  const out = { steps: [], ok: false };
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); if (!flags.has('json')) write(`${ok ? '✓' : '✗'} ${name}: ${detail}`); return ok; };

  const r = resolveEngine();
  if (r.error) { step('resolve', false, r.error.split('\n')[0]); if (flags.has('json')) write(JSON.stringify(out, null, 2)); return 1; }
  step('resolve', true, `${r.path} (source: ${r.source})`);
  step('sha256', true, `${r.sha256}${r.verified ? ' — MATCHES pinned baseline' : ' — no pin match (dev build?)'}`);

  const ver = spawnSync(r.path, ['version'], { encoding: 'utf8', timeout: 10_000 });
  const verOk = ver.status === 0;
  step('engine-version', verOk, verOk ? String(ver.stdout || '').trim() : `exit ${ver.status}`);

  const probe = jsonRpcProbe(r.path);
  if (probe.error) { step('tools-list', false, probe.error); if (flags.has('json')) write(JSON.stringify(out, null, 2)); return 1; }
  const names = probe.tools.map((t) => t.name);
  const snap = loadSnapshot();
  step('tools-list', true, `${names.length} tools live (snapshot: ${snap.toolCount})`);

  const gaps = coverageGaps(names);
  const gapsOk = gaps.unknown.length === 0;
  step('classification-coverage', gapsOk, gapsOk
    ? `every live tool is classified (${Object.keys(loadClassification().tools).length} golden entries)${gaps.missing.length ? `; ${gaps.missing.length} classified tool(s) absent live: ${gaps.missing.join(', ')}` : ''}`
    : `UNCLASSIFIED live tools (deny-by-default — update data/tools-classification.json): ${gaps.unknown.join(', ')}`);

  out.ok = out.steps.every((s) => s.ok);
  if (flags.has('json')) write(JSON.stringify(out, null, 2));
  else write(out.ok ? 'self-test: ALL GREEN' : 'self-test: FAILED');
  return out.ok ? 0 : 1;
}

function cmdMcp() {
  const r = resolveEngine();
  if (r.error) { process.stderr.write(r.error + '\n'); return 1; }
  const child = spawn(r.path, ['mcp'], { stdio: 'inherit' });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code === null ? 1 : code));
  child.on('error', (e) => { process.stderr.write('cloudru-hub mcp: ' + e.message + '\n'); process.exit(1); });
  return null; // async — exit via child
}

function main(argv, write = (s) => process.stdout.write(s + '\n')) {
  const { flags, opts, positional } = parseArgs(argv);
  const cmd = positional[0] || 'help';
  if (flags.has('help') || flags.has('h') || cmd === 'help') { showHelp(write); return 0; }

  switch (cmd) {
    case 'version':
      write(`cloudru-hub ${PKG.version}`);
      write(`pinned engine: ${PKG.cloudruHub.engineVersion}`);
      for (const [k, v] of Object.entries(PKG.cloudruHub.binaryHashes)) write(`  ${k}  sha256 ${v}`);
      return 0;
    case 'resolve':
      return cmdResolve(flags, write);
    case 'self-test':
      return cmdSelfTest(flags, write);
    case 'mcp': {
      const rc = cmdMcp();
      return rc === null ? null : rc;
    }
    case 'install': {
      const target = opts.get('target');
      if (!target) { write('cloudru-hub install: --target is required (claude-code|codex|agents-md|gemini|…)'); return 1; }
      const res = install(target, opts.get('dir') || process.cwd(), { npx: flags.has('npx') });
      for (const line of res.lines) write(line);
      return res.code;
    }
    case 'compile-skill': {
      const canonical = opts.get('canonical');
      const target = opts.get('target');
      const outDir = opts.get('out');
      if (!canonical || !target || !outDir) { write('cloudru-hub compile-skill: --canonical <dir> --target <t> --out <dir> are all required'); return 1; }
      const result = compileSkill(canonical, target);
      write(`compile-skill ${target}: ${Object.keys(result.files).length} file(s), router ${result.report.routerChars} chars, ${result.report.dangling.length} dangling link(s) unlinked`);
      for (const d of result.report.dangling) write(`  dangling: ${d}`);
      if (!result.ok) { for (const e of result.report.errors) write(`  ERROR: ${e}`); return 1; }
      writeCompiled(result, outDir);
      write(`compile-skill: wrote ${outDir}`);
      return 0;
    }
    default:
      write(`cloudru-hub: unknown command "${cmd}"`);
      showHelp(write);
      return 1;
  }
}

if (require.main === module) {
  const rc = main(process.argv.slice(2));
  if (rc !== null) process.exitCode = rc;
}

module.exports = { main, jsonRpcProbe };
