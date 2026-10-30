'use strict';

// Project-owned, opt-in Cordis patch for the official DeepSeek MCP client.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { resolveEngine } = require('./resolve');
const { loadClassification } = require('./classification');
const { selectedToolNames } = require('./toolsets');

const FILE = 'deepseek.cordis.patch.yml';
const refuse = (reason) => ({ code: 2, lines: [`cloudru-hub install: REFUSED — ${reason}; no overlay changed.`] });
const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;

function inspectPath(file, kind) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`${kind} is a symlink: ${file}`);
    if (kind === 'overlay' ? !stat.isFile() : !stat.isDirectory()) throw new Error(`${kind} is not a ${kind === 'overlay' ? 'file' : 'directory'}: ${file}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function inspectParents(dir) {
  const parts = [];
  for (let current = dir; current !== path.dirname(current); current = path.dirname(current)) parts.push(current);
  for (const part of parts.reverse()) inspectPath(part, 'project directory');
}

function existingOverlay(file, candidate) {
  if (!inspectPath(file, 'overlay')) return false;
  const bytes = fs.readFileSync(file, 'utf8');
  const doc = YAML.parseDocument(bytes, { uniqueKeys: true });
  if (doc.errors.length) throw new Error('existing overlay is malformed');
  YAML.visit(doc, { Alias: () => { throw new Error('existing overlay contains a YAML alias'); } });
  if (bytes !== candidate) throw new Error('existing overlay differs from the requested configuration');
  return true;
}

function installDeepseek(projectDir, opts = {}) {
  const project = path.resolve(projectDir);
  const managed = path.join(project, '.cloudru-hub');
  const file = path.join(managed, FILE);
  const toolsets = opts.toolsets || 'inventory';
  try {
    selectedToolNames(toolsets);
    inspectParents(project);
    inspectPath(managed, 'managed directory');
    inspectPath(file, 'overlay');
    const engine = opts.resolvedEngine || resolveEngine();
    if (engine.error || !engine.verified || !engine.path || engine.sha256 !== loadClassification().engineSha256) {
      return refuse('a locally available, hash-verified pinned Cloud.ru engine is required');
    }
    const longRunning = toolsets === 'vm-deploy' || toolsets === 'k8s-deploy';
    const patch = [{ insert: [{
      id: 'cloudru-hub-mcp',
      name: '@deepseek-ai/dsh-mcp-client',
      config: {
        serverName: 'cloudru_hub', transport: 'stdio', command: process.execPath,
        args: [path.join(__dirname, '..', 'bin', 'cloudru-hub.js'), 'mcp-safe', '--toolsets', toolsets],
        env: { CLOUDRU_VM_BIN: path.resolve(engine.path) }, cwd: project,
        failOnStartupError: true, toolCallTimeoutMs: longRunning ? 1_200_000 : 120_000,
        reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
      },
    }] }];
    const candidate = YAML.stringify(patch);
    const dump = `dsh --profile <existing-profile> --patch ${quote(file)} --dump-config`;
    const start = `dsh --profile <existing-profile> --patch ${quote(file)}`;
    const commands = [`  Config dump: ${dump}`, `  Startup:     ${start}`, '  Replace <existing-profile> with your existing profile name; restart and probe the registered tools.', '  The patch alone does not prove plugin activation.'];
    const present = existingOverlay(file, candidate);
    if (opts.dryRun) return { code: 0, lines: [`cloudru-hub install: dry-run candidate for ${file}:`, candidate.trimEnd(), ...commands] };
    if (present) return { code: 0, lines: [`cloudru-hub install: identical overlay already exists at ${file}.`, ...commands] };

    fs.mkdirSync(project, { recursive: true, mode: 0o700 });
    inspectParents(project);
    try { fs.mkdirSync(managed, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    inspectPath(managed, 'managed directory');
    const lock = path.join(managed, '.deepseek-install.lock');
    let lockFd;
    let temp;
    try {
      lockFd = fs.openSync(lock, 'wx', 0o600);
      if (existingOverlay(file, candidate)) return { code: 0, lines: [`cloudru-hub install: identical overlay already exists at ${file}.`, ...commands] };
      temp = path.join(managed, `.deepseek.cordis.patch.yml.${process.pid}.${require('crypto').randomBytes(8).toString('hex')}.tmp`);
      fs.writeFileSync(temp, candidate, { flag: 'wx', mode: 0o600 });
      // link is an atomic no-clobber final creation, including against writers
      // that do not use this installer's short-lived admission lock.
      fs.linkSync(temp, file);
      return { code: 0, lines: [`cloudru-hub install: wrote ${file}.`, ...commands] };
    } finally {
      if (temp) { try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); }
    }
  } catch (error) {
    return refuse(error.code === 'EEXIST' ? `another installer or overlay writer is active at ${file}` : error.message);
  }
}

module.exports = { installDeepseek };
