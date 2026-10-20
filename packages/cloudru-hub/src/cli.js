'use strict';
// cloudru-hub CLI — thin npm launcher for the cloudru-vm MCP engine (ADR-002).
// Zero dependencies, CommonJS, boots from any cwd (dz release smoke contract).

const { spawn, spawnSync } = require('child_process');
const { resolveEngine } = require('./resolve');
const { loadClassification, loadSnapshot, coverageGaps } = require('./classification');
const { install } = require('./install');
const { runSafeMcp } = require('./safe-mcp');
const { issueApproval } = require('./deploy-approval');
const { issueK8sApproval } = require('./k8s-approval');
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
  self-test [--json]       Local check: resolve → sha256 → engine version → live tools/list
                           → golden-classification coverage. Exit 0 = all green.
  mcp                      Run the resolved engine as an MCP stdio server (what .mcp.json points at).
  mcp-safe [--toolsets <groups>]  Run a pinned MCP proxy; vm-deploy and k8s-deploy enable bounded deployment.
  approve --plan-id <id> --max-monthly-rub <amount> [--site-sha256 <digest>]
                           Authorize one exact VM plan for ten minutes within a RUB/month cap.
                           Static sites require the artifact digest shown by deploy_plan.
  k8s-approve --cluster-id <uuid> --namespace <name> --manifest <file> --manifest-sha256 <digest>
                           Authorize one exact three-resource Snake manifest on an existing cluster.
  install --target <t>     claude-code: permissions + executed hook probe;
                           codex|opencode|pi: project MCP config using mcp-safe;
                           hermes: guarded $HERMES_HOME/config.yaml entry using mcp-safe;
                           openclaude|cursor|windsurf|copilot: refused pending live probe.
           [--dir <path>]  Project directory (default: cwd). [--toolsets <groups>] defaults to
                           inventory for safe hosts; all|compute|kubernetes|data|network|storage|billing|vm-deploy|k8s-deploy.
                           [--hermes-home <dir>] overrides $HERMES_HOME for Hermes.
                           [--npx] use the npx form in Claude .mcp.json.
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
  const r = spawnSync(process.execPath, [require('path').join(__dirname, 'probe-child.js'), binPath], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
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
  write(`verified ${r.verified ? 'yes — matches the pinned baseline' : 'NO — not the pinned baseline (resolution only; MCP launch refused)'}`);
  return 0;
}

function cmdSelfTest(flags, write) {
  const out = { steps: [], ok: false };
  const step = (name, ok, detail) => { out.steps.push({ name, ok, detail }); if (!flags.has('json')) write(`${ok ? '✓' : '✗'} ${name}: ${detail}`); return ok; };

  const r = resolveEngine();
  if (r.error) { step('resolve', false, r.error.split('\n')[0]); if (flags.has('json')) write(JSON.stringify(out, null, 2)); return 1; }
  step('resolve', true, `${r.path} (source: ${r.source})`);
  step('sha256', r.verified, `${r.sha256}${r.verified ? ' — MATCHES pinned baseline' : ' — DOES NOT MATCH pinned baseline'}`);
  if (!r.verified) {
    if (flags.has('json')) write(JSON.stringify(out, null, 2));
    return 1;
  }

  const ver = spawnSync(r.path, ['version'], { encoding: 'utf8', timeout: 10_000 });
  const verOk = ver.status === 0;
  step('engine-version', verOk, verOk ? String(ver.stdout || '').trim() : `exit ${ver.status}`);

  const probe = jsonRpcProbe(r.path);
  if (probe.error) { step('tools-list', false, probe.error); if (flags.has('json')) write(JSON.stringify(out, null, 2)); return 1; }
  const names = probe.tools.map((t) => t.name);
  const snap = loadSnapshot();
  step('tools-list', names.length === snap.toolCount, `${names.length} tools live (snapshot: ${snap.toolCount})`);

  const gaps = coverageGaps(names);
  const gapsOk = gaps.unknown.length === 0 && gaps.missing.length === 0;
  step('classification-coverage', gapsOk, gapsOk
    ? `every live tool is classified (${Object.keys(loadClassification().tools).length} golden entries)${gaps.missing.length ? `; ${gaps.missing.length} classified tool(s) absent live: ${gaps.missing.join(', ')}` : ''}`
    : `tool drift: unclassified=${gaps.unknown.join(', ') || '<none>'}; missing=${gaps.missing.join(', ') || '<none>'}`);

  out.ok = out.steps.every((s) => s.ok);
  if (flags.has('json')) write(JSON.stringify(out, null, 2));
  else write(out.ok ? 'self-test: ALL GREEN' : 'self-test: FAILED');
  return out.ok ? 0 : 1;
}

function cmdMcp() {
  const r = resolveEngine();
  if (r.error) { process.stderr.write(r.error + '\n'); return 1; }
  if (!r.verified) {
    process.stderr.write(`cloudru-hub mcp: engine sha256 ${r.sha256} does not match pinned ${r.pinned || '<none>'}; refusing to launch\n`);
    return 1;
  }
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
    case 'mcp-safe':
      return runSafeMcp({ toolsets: opts.get('toolsets') || 'all' });
    case 'approve': {
      const amount = Number(opts.get('max-monthly-rub'));
      if (!opts.get('plan-id') || !opts.has('max-monthly-rub') || !Number.isFinite(amount) || amount < 0) {
        write('cloudru-hub approve: --plan-id and non-negative --max-monthly-rub are required');
        return 1;
      }
      try {
        const approval = issueApproval(opts.get('plan-id'), amount, process.env, Date.now(), opts.get('site-sha256') || '');
        write(flags.has('json') ? JSON.stringify(approval, null, 2) :
          `approved ${approval.planId}: ${approval.vmName}, estimated ${approval.estimatedMonthlyRub} RUB/month (cap ${approval.maxMonthlyRub}); expires ${new Date(approval.expiresAt).toISOString()}${approval.staticSite ? `; static source ${approval.staticSite.source}, SHA-256 ${approval.staticSite.sha256} (${approval.staticSite.sizeBytes} bytes, ${approval.staticSite.files.length} files), ${approval.staticSite.ingress}; ${approval.staticSite.estimateScope}` : ''}`);
        return 0;
      } catch (error) {
        write(`cloudru-hub approve: ${error.message}`);
        return 1;
      }
    }
    case 'k8s-approve': {
      try {
        const approval = issueK8sApproval(opts.get('cluster-id'), opts.get('namespace'),
          opts.get('manifest'), opts.get('manifest-sha256'));
        write(flags.has('json') ? JSON.stringify(approval, null, 2) :
          `approved ${approval.approvalId}: cluster ${approval.clusterId}, namespace ${approval.namespace}, SHA-256 ${approval.manifestSha256}; expires ${new Date(approval.expiresAt).toISOString()}`);
        return 0;
      } catch (error) {
        write(`cloudru-hub k8s-approve: ${error.message}`);
        return 1;
      }
    }
    case 'install': {
      const target = opts.get('target');
      if (!target) { write('cloudru-hub install: --target is required (claude-code|codex|agents-md|gemini|…)'); return 1; }
      const res = install(target, opts.get('dir') || process.cwd(), { npx: flags.has('npx'), toolsets: opts.get('toolsets') || 'inventory', hermesHome: opts.get('hermes-home') });
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
