'use strict';

// Read-only MCP boundary for hosts whose hook/permission paths have not been
// live-probed. The host never gets a raw engine channel through this command.
const { spawn } = require('child_process');
const { loadClassification } = require('./classification');
const { resolveEngine } = require('./resolve');
const { selectedToolNames } = require('./toolsets');
const { readCredentials, readOptionalCredentials } = require('./credentials');
const { consumeApproval, recordDeployedVM, approvedVM } = require('./deploy-approval');
const { consumeK8sApproval, k8sSession, verificationArgs } = require('./k8s-approval');

const MAX_LINE = 1024 * 1024;
const idKey = (id) => JSON.stringify(id);
const errorResponse = (id, message, code = -32000) => ({ jsonrpc: '2.0', id, error: { code, message } });

function redactDeploySecrets(value) {
  if (Array.isArray(value)) return value.map(redactDeploySecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/password|secret|private.?key|access.?token/i.test(key))
    .map(([key, item]) => [key, redactDeploySecrets(item)]));
}

function lineReader(stream, onLine, onError) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_LINE * 2) return onError('MCP input exceeded line limit');
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (Buffer.byteLength(line) > MAX_LINE) return onError('MCP line exceeded limit');
      if (line) onLine(line);
    }
    if (Buffer.byteLength(buffer) > MAX_LINE) onError('MCP line exceeded limit');
  });
  stream.on('end', () => { if (buffer.trim()) onError('incomplete MCP line'); });
}

function runSafeMcp(options = {}) {
  const resolved = options.resolved || resolveEngine();
  const cls = options.classification || loadClassification();
  const stderr = options.stderr || process.stderr;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  let selected;
  const deployProfile = options.toolsets === 'vm-deploy';
  const k8sProfile = options.toolsets === 'k8s-deploy';
  let credentials;
  try {
    selected = new Set(selectedToolNames(options.toolsets || 'all', cls));
    if (deployProfile || k8sProfile) credentials = readCredentials(options.env || process.env);
    else if ([...selected].some((name) => name.startsWith('billing_'))) {
      credentials = readOptionalCredentials(options.env || process.env);
    }
  }
  catch (error) { stderr.write(`cloudru-hub mcp-safe: ${error.message}\n`); return 1; }
  if (resolved.error || !resolved.verified || resolved.sha256 !== cls.engineSha256) {
    stderr.write('cloudru-hub mcp-safe: pinned engine SHA-256 required; refusing to start\n');
    return 1;
  }

  const engine = spawn(resolved.path, ['mcp'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: credentials ? { ...(options.env || process.env), ...credentials.env } : (options.env || process.env),
  });
  const pending = new Map();
  // The pinned engine's tool inventory is fixed for this process. Keep a
  // filtered copy so a host keepalive can be answered while Go is handling a
  // long deploy_apply request on its serial stdio loop.
  let cachedToolsList = null;
  let stopped = false;
  let inputEnded = false;
  let closing = false;
  const emit = (obj) => stdout.write(JSON.stringify(obj) + '\n');
  const stop = (reason) => {
    if (stopped) return;
    stopped = true;
    stderr.write(`cloudru-hub mcp-safe: ${reason}\n`);
    for (const key of pending.keys()) {
      emit(errorResponse(JSON.parse(key), 'Cloud.ru engine connection closed'));
    }
    pending.clear();
    stdin.destroy();
    engine.stdin.end();
    if (!engine.killed) engine.kill();
    process.exitCode = 1;
  };
  engine.on('error', (error) => stop(`engine failed: ${error.message}`));
  engine.on('exit', (code) => {
    if (!stopped && !closing) stop(`engine exited with status ${code === null ? 'unknown' : code}`);
  });
  engine.stdin.on('error', (error) => stop(`engine input failed: ${error.message}`));
  const closeIfDone = () => {
    if (inputEnded && pending.size === 0 && !closing) {
      closing = true;
      engine.stdin.end();
    }
  };
  stdin.on('end', () => { inputEnded = true; closeIfDone(); });

  lineReader(stdin, (line) => {
    if (stopped) return;
    let message;
    try { message = JSON.parse(line); } catch { emit(errorResponse(null, 'invalid JSON', -32700)); return; }
    if (!message || Array.isArray(message) || typeof message !== 'object' || message.jsonrpc !== '2.0') {
      emit(errorResponse(null, 'invalid JSON-RPC request', -32600)); return;
    }
    const hasId = Object.hasOwn(message, 'id');
    const method = message.method;
    if (!hasId) {
      if (method === 'notifications/initialized') {
        engine.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
      }
      return;
    }
    if (typeof method !== 'string' || (typeof message.id !== 'string' && !Number.isSafeInteger(message.id))) {
      emit(errorResponse(message.id ?? null, 'invalid JSON-RPC request', -32600)); return;
    }
    const key = idKey(message.id);
    if (pending.has(key)) { emit(errorResponse(message.id, 'duplicate request id', -32600)); return; }
    if (method === 'tools/list' && cachedToolsList &&
        (!Object.hasOwn(message, 'params') ||
         (message.params && !Array.isArray(message.params) && typeof message.params === 'object' && Object.keys(message.params).length === 0))) {
      emit({ jsonrpc: '2.0', id: message.id, result: cachedToolsList });
      return;
    }
    let params;
    let approval;
    if (method === 'tools/call') {
      const input = message.params;
      const name = input && !Array.isArray(input) && typeof input === 'object' ? input.name : undefined;
      if (typeof name !== 'string' || !selected.has(name)) {
        emit(errorResponse(message.id, `tool ${typeof name === 'string' ? name : '<missing>'} is unavailable in this profile`));
        return;
      }
      const args = input.arguments === undefined ? {} : input.arguments;
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        emit(errorResponse(message.id, 'tool arguments must be an object', -32602)); return;
      }
      // Go's encoding/json accepts case-insensitive struct field aliases. Never forward
      // the original envelope: {name:"vm_list",Name:"deploy"} can otherwise execute deploy.
      if (deployProfile && name === 'deploy_apply') {
        try {
          if (typeof args.plan_id !== 'string') throw new Error('plan_id is required');
          approval = consumeApproval(args.plan_id, options.env || process.env);
          params = { name, arguments: { plan_id: args.plan_id, confirmed: true } };
        } catch (error) { emit(errorResponse(message.id, `deployment approval rejected: ${error.message}`)); return; }
      } else if (deployProfile && name === 'vm_exec') {
        try {
          if (typeof args.command !== 'string' || !args.command.trim() || args.command.length > 65536) {
            throw new Error('command must be a non-empty string of at most 65536 characters');
          }
          const vm = approvedVM(args.vm || args.vm_id, options.env || process.env);
          params = { name, arguments: { vm: vm.vmId, user: vm.sshUser, command: args.command } };
        } catch (error) { emit(errorResponse(message.id, `vm_exec rejected: ${error.message}`)); return; }
      } else if (k8sProfile && name === 'k8s_apply') {
        try {
          if (Object.keys(args).length !== 1 || typeof args.approval_id !== 'string') throw new Error('only approval_id is accepted');
          const approved = consumeK8sApproval(args.approval_id, options.env || process.env);
          params = { name, arguments: { cluster_id: approved.clusterId, namespace: approved.namespace,
            manifest: approved.manifest, create_only: true, confirmed: true } };
        } catch (error) { emit(errorResponse(message.id, `Kubernetes approval rejected: ${error.message}`)); return; }
      } else if (k8sProfile && name === 'k8s_kubectl') {
        try {
          if (Object.keys(args).length !== 2 || typeof args.approval_id !== 'string' || typeof args.query !== 'string') {
            throw new Error('only approval_id and query are accepted');
          }
          const session = k8sSession(args.approval_id, options.env || process.env);
          params = { name, arguments: { cluster_id: session.clusterId, args: verificationArgs(session, args.query) } };
        } catch (error) { emit(errorResponse(message.id, `Kubernetes verification rejected: ${error.message}`)); return; }
      } else {
        params = { name, arguments: args };
      }
    } else if (!['initialize', 'ping', 'tools/list'].includes(method)) {
      emit(errorResponse(message.id, `method ${method} is unavailable in read-only mode`, -32601));
      return;
    } else if (method === 'initialize') {
      // The pinned engine requires the client's protocol version and capabilities.
      const p = message.params;
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        emit(errorResponse(message.id, 'initialize params must be an object', -32602)); return;
      }
      params = { protocolVersion: p.protocolVersion, capabilities: p.capabilities, clientInfo: p.clientInfo };
    }
    pending.set(key, { method, approval });
    engine.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, method, ...(params ? { params } : {}) }) + '\n');
  }, stop);

  lineReader(engine.stdout, (line) => {
    if (stopped) return;
    let message;
    try { message = JSON.parse(line); } catch { stop('engine emitted invalid JSON'); return; }
    if (!message || typeof message !== 'object' || !Object.hasOwn(message, 'id')) {
      // MCP progress/log notifications are not needed for the safe read-only surface.
      return;
    }
    const key = idKey(message.id);
    const request = pending.get(key);
    if (!request) { stop('engine emitted an unsolicited response'); return; }
    const { method, approval } = request;
    pending.delete(key);
    if (method === 'tools/list' && !message.error) {
      if (!message.result || !Array.isArray(message.result.tools)) { stop('engine tools/list response malformed'); return; }
      message.result = { ...message.result, tools: message.result.tools.filter((tool) =>
        tool && typeof tool.name === 'string' && selected.has(tool.name)).map((tool) => {
        if (!k8sProfile) return tool;
        if (tool.name === 'k8s_apply') return { ...tool,
          description: 'Apply one locally reviewed Snake manifest to one existing cluster. Pass only the local approval ID.',
          inputSchema: { type: 'object', properties: { approval_id: { type: 'string' } }, required: ['approval_id'], additionalProperties: false } };
        if (tool.name === 'k8s_kubectl') return { ...tool,
          description: 'Read only pods, deployment, service or rollout status for the previously approved Snake workload.',
          inputSchema: { type: 'object', properties: { approval_id: { type: 'string' },
            query: { type: 'string', enum: ['pods', 'deployment', 'service', 'rollout'] } },
          required: ['approval_id', 'query'], additionalProperties: false } };
        return tool;
      }) };
      // A paginated list could conceal tools from filtering/coverage checks.
      if (message.result.nextCursor) { stop('engine tools/list pagination is unsupported'); return; }
      cachedToolsList = message.result;
    }
    if (method === 'initialize' && message.result && message.result.capabilities) {
      message.result = { ...message.result, capabilities: { tools: message.result.capabilities.tools || {} } };
    }
    if (approval && !message.error) {
      // The engine returns an MCP text result containing its JSON deploy result.
      // Keep the model from seeing a generated login password: vm_exec uses the
      // engine-managed SSH key. Ambiguous responses require inspection.
      const item = message.result?.content?.find((x) => x.type === 'text');
      let deploy;
      try { deploy = JSON.parse(item?.text || ''); }
      catch {
        message.result = { isError: true, content: [{ type: 'text', text: 'deploy_apply returned an unreadable outcome; inspect the live VM inventory before retrying' }] };
        emit(message); closeIfDone(); return;
      }
      if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) {
        message.result = { isError: true, content: [{ type: 'text', text: 'deploy_apply returned an invalid outcome; inspect the live VM inventory before retrying' }] };
        emit(message); closeIfDone(); return;
      }
      const safe = redactDeploySecrets(deploy);
      if (!message.result?.isError && approval.siteMode && deploy.status === 'running' && deploy.http_verification?.verified === true) {
        // Static-site delivery is verified over HTTP. It does not imply SSH is
        // available, so never create a vm_exec session for this VM.
      } else if (!message.result?.isError && !approval.siteMode && deploy.status === 'running') {
        try {
          const session = recordDeployedVM(approval, deploy, options.env || process.env);
          safe.approved_vm_session_expires_at = new Date(session.expiresAt).toISOString();
        } catch (error) {
          message.result.isError = true;
          safe.recovery = `VM may exist but the approved execution session was not recorded: ${error.message}. Inspect VM inventory before retrying.`;
        }
      } else {
        message.result.isError = true;
        safe.recovery = 'A VM may exist. Inspect the returned VM UUID and live inventory before retrying; a fresh plan and approval may be needed.';
      }
      item.text = JSON.stringify(safe);
    }
    emit(message);
    closeIfDone();
  }, stop);
  return null;
}

module.exports = { runSafeMcp, MAX_LINE };
