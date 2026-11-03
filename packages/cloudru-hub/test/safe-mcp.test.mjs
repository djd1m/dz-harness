import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cls = require('../data/tools-classification.json');
const { GROUPS, selectedToolNames } = require('../src/toolsets.js');
const pkg = path.resolve(import.meta.dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-safe-mcp-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const credentials = path.join(scratch, 'credentials.json');
fs.writeFileSync(credentials, JSON.stringify({
  key_id: 'fixture-key@example.com',
  secret: 'fixture-secret@example.com',
  project_id: '00000000-0000-4000-8000-000000000001',
}), { mode: 0o600, flag: 'wx' });

function childEnv(credentialsFile = credentials, extra = {}) {
  const clean = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.toUpperCase().startsWith('CLOUDRU')));
  return {
    ...clean,
    ...extra,
    HOME: fs.mkdtempSync(path.join(scratch, 'home-')),
    CLOUDRU_HUB_CREDENTIALS: credentialsFile,
  };
}

function safeMcpScript(engine, toolsets = 'all') {
  return `const {runSafeMcp}=require(${JSON.stringify(path.join(pkg, 'src/safe-mcp.js'))});const status=runSafeMcp({toolsets:${JSON.stringify(toolsets)},resolved:{path:${JSON.stringify(engine)},verified:true,sha256:${JSON.stringify(cls.engineSha256)}}});if(typeof status==='number')process.exitCode=status;`;
}

const fake = path.join(scratch, 'fake-engine');
const log = path.join(scratch, 'forwarded.jsonl');
fs.writeFileSync(fake, `#!/usr/bin/env node
const fs=require('fs');let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{b+=x;let i;while((i=b.indexOf('\\n'))>=0){const line=b.slice(0,i);b=b.slice(i+1);if(!line)continue;const m=JSON.parse(line);fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(m)+'\\n');if(!Object.hasOwn(m,'id'))continue;let result={};if(m.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{},resources:{}},serverInfo:{name:'fake',version:'1'}};else if(m.method==='tools/list')result={tools:[{name:'vm_list'},{name:'deploy'},{name:'secret_value'},{name:'unknown_new'}]};else if(m.method==='tools/call')result={content:[{type:'text',text:'executed '+m.params.name}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}});
`);
fs.chmodSync(fake, 0o755);

const msg = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
function spawnSafeMcp(lines, toolsets = 'all', credentialsFile = credentials) {
  fs.writeFileSync(log, '');
  return spawnSync(process.execPath, ['-e', safeMcpScript(fake, toolsets)], {
    input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 5000,
    env: childEnv(credentialsFile, { FAKE_LOG: log }),
  });
}

function run(lines, toolsets = 'all') {
  const r = spawnSafeMcp(lines, toolsets);
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr || r.error?.message);
  return { responses: r.stdout.trim().split('\n').map(JSON.parse), forwarded: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
}

test('explicit missing credentials refuse startup with a diagnostic before JSON parsing', () => {
  const missing = path.join(scratch, 'absent-credentials.json');
  assert.equal(fs.existsSync(missing), false);
  const r = spawnSafeMcp([msg(1, 'tools/list')], 'k8s-deploy', missing);
  assert.ifError(r.error);
  assert.equal(r.status, 1, r.stderr || r.error?.message);
  assert.match(r.stderr, /cloudru-hub mcp-safe: ENOENT:.*absent-credentials\.json/);
  assert.equal(r.stdout, '');
  assert.equal(fs.readFileSync(log, 'utf8'), '');
});

test('safe proxy filters listed tools and blocks ask, deny, unknown and other methods before engine', () => {
  const out = run([
    msg(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }),
    msg(2, 'tools/list'),
    msg(3, 'tools/call', { name: 'deploy', arguments: { confirmed: true } }),
    msg(4, 'tools/call', { name: 'secret_value', arguments: {} }),
    msg(5, 'tools/call', { name: 'unknown_new', arguments: {} }),
    msg(6, 'resources/read', { uri: 'file:///etc/passwd' }),
    msg(7, 'tools/call', { name: 'vm_list', arguments: {} }),
  ]);
  const byId = Object.fromEntries(out.responses.map((r) => [r.id, r]));
  assert.deepEqual(byId[2].result.tools.map((t) => t.name), ['vm_list']);
  assert.deepEqual(Object.keys(byId[1].result.capabilities), ['tools']);
  for (const id of [3, 4, 5, 6]) assert.ok(byId[id].error, `request ${id} blocked`);
  assert.match(byId[7].result.content[0].text, /executed vm_list/);
  assert.deepEqual(out.forwarded.filter((m) => m.method === 'tools/call').map((m) => m.params.name), ['vm_list']);
});

test('k8s_get recovery selectors pass existing read profiles while paid creates stay denied', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(pkg, 'data/tools-list-snapshot.json'), 'utf8'));
  assert.equal(snapshot.toolCount, 146);
  assert.equal(snapshot.tools.length, 146);
  for (const profile of ['all', 'kubernetes', 'k8s-deploy']) {
    const out = run([
      msg(1, 'tools/call', { name: 'k8s_get', arguments: { receipts: true, limit: 10 } }),
      msg(2, 'tools/call', { name: 'k8s_get', arguments: { receipt_id: 'a'.repeat(64) } }),
      msg(3, 'tools/call', { name: 'k8s_create', arguments: { confirmed: true } }),
      msg(4, 'tools/call', { name: 'k8s_add_nodepool', arguments: { confirmed: true } }),
    ], profile);
    const byId = Object.fromEntries(out.responses.map((r) => [r.id, r]));
    assert.match(byId[1].result.content[0].text, /executed k8s_get/);
    assert.match(byId[2].result.content[0].text, /executed k8s_get/);
    assert.ok(byId[3].error, `${profile}: k8s_create must be denied`);
    assert.ok(byId[4].error, `${profile}: k8s_add_nodepool must be denied`);
    assert.deepEqual(out.forwarded.map((m) => m.params.name), ['k8s_get', 'k8s_get']);
  }
});

test('Hermes keepalive gets the filtered tool list while the serial engine is busy', async () => {
  const serial = path.join(scratch, 'serial-engine');
  const serialLog = path.join(scratch, 'serial-forwarded.jsonl');
  fs.writeFileSync(serial, `#!/usr/bin/env node
const fs=require('fs');let buffer='',busy=false;const queue=[];
function next(){if(busy||!queue.length)return;busy=true;const m=queue.shift();fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(m)+'\\n');
const result=m.method==='tools/list'?{tools:[{name:'vm_list'},{name:'deploy'}]}:{content:[{type:'text',text:'done'}]};
const done=()=>{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');busy=false;next();};
if(m.method==='tools/call')setTimeout(done,1500);else done();}
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line)queue.push(JSON.parse(line));}next();});
`);
  fs.chmodSync(serial, 0o755);
  fs.writeFileSync(serialLog, '');
  const child = spawn(process.execPath, ['-e', safeMcpScript(serial)], {
    stdio: ['pipe', 'pipe', 'pipe'], env: childEnv(credentials, { FAKE_LOG: serialLog }),
  });
  const responses = new Map();
  const listeners = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      const response = JSON.parse(line);
      responses.set(response.id, response);
      listeners.get(response.id)?.(response);
    }
  });
  const waitFor = (id, timeoutMs) => new Promise((resolve, reject) => {
    if (responses.has(id)) return resolve(responses.get(id));
    const timer = setTimeout(() => reject(new Error(`MCP response ${id} timed out`)), timeoutMs);
    listeners.set(id, (response) => { clearTimeout(timer); listeners.delete(id); resolve(response); });
  });
  try {
    child.stdin.write(msg(1, 'tools/list') + '\n');
    assert.deepEqual((await waitFor(1, 2000)).result.tools.map((t) => t.name), ['vm_list']);
    child.stdin.write(msg(2, 'tools/call', { name: 'vm_list', arguments: {} }) + '\n');
    child.stdin.write(msg(3, 'tools/list') + '\n');
    assert.deepEqual((await waitFor(3, 1000)).result.tools.map((t) => t.name), ['vm_list']);
    assert.equal((await waitFor(2, 2500)).result.content[0].text, 'done');
    child.stdin.end();
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const forwarded = fs.readFileSync(serialLog, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(forwarded.map((m) => m.method), ['tools/list', 'tools/call']);
  } finally {
    child.kill();
  }
});

test('Go case-insensitive JSON aliases cannot change the validated method or tool name', () => {
  const out = run([
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', Method: 'tools/call', params: { name: 'vm_list', Name: 'deploy', arguments: {} }, Params: { name: 'deploy', arguments: { confirmed: true } } }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping', Method: 'tools/call', Params: { name: 'deploy', arguments: { confirmed: true } } }),
    JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'deploy' }, Params: { name: 'vm_list' } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', Method: 'tools/call', Params: { name: 'deploy' } }),
    '{"jsonrpc":"2.0","id":4,"method":"tools/call","method":"resources/read","params":{"name":"vm_list"}}',
  ]);
  assert.equal(out.responses.find((r) => r.id === 1).result.content[0].text, 'executed vm_list');
  assert.ok(out.responses.find((r) => r.id === 3).error);
  assert.ok(out.responses.find((r) => r.id === 4).error);
  assert.deepEqual(out.forwarded, [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'vm_list', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
  ]);
});

test('a failed backend closes the proxy and resolves pending requests without host EOF', async () => {
  const crashing = path.join(scratch, 'crashing-engine');
  fs.writeFileSync(crashing, '#!/usr/bin/env node\nprocess.stdin.once("data", () => process.exit(2));\n');
  fs.chmodSync(crashing, 0o755);
  const child = spawn(process.execPath, ['-e', safeMcpScript(crashing)], {
    stdio: ['pipe', 'pipe', 'pipe'], env: childEnv(),
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stdin.write(msg(1, 'tools/list') + '\n');
  const timer = setTimeout(() => child.kill(), 2000);
  const code = await new Promise((resolve) => child.on('exit', resolve));
  clearTimeout(timer);
  assert.equal(code, 1);
  assert.match(output, /Cloud.ru engine connection closed/);
});

test('safe proxy rejects malformed JSON and batch requests', () => {
  const out = run(['not-json', JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }])]);
  assert.equal(out.responses.length, 2);
  assert.ok(out.responses.every((r) => r.error));
  assert.equal(out.forwarded.length, 0);
});

test('production command refuses an engine with a different hash', () => {
  const r = spawnSync(process.execPath, [path.join(pkg, 'bin/cloudru-hub.js'), 'mcp-safe'], {
    input: msg(1, 'tools/list') + '\n', encoding: 'utf8', timeout: 5000,
    env: childEnv(credentials, { CLOUDRU_VM_BIN: fake }),
  });
  assert.ifError(r.error);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pinned engine SHA-256 required/);
  assert.equal(r.stdout, '');
});

test('named toolsets reduce the visible surface and each member is allow-classified', () => {
  for (const group of Object.keys(GROUPS)) {
    const names = selectedToolNames(group);
    assert.ok(names.length > 0);
    for (const name of names) assert.equal(cls.tools[name].permission, 'allow');
  }
  const out = run([msg(1, 'tools/list'), msg(2, 'tools/call', { name: 'deploy', arguments: { confirmed: true } })], 'inventory');
  assert.deepEqual(out.responses.find((r) => r.id === 1).result.tools.map((x) => x.name), ['vm_list']);
  assert.equal(out.forwarded.filter((m) => m.method === 'tools/call').length, 0);
  assert.throws(() => selectedToolNames('inventory,all'), /invalid toolsets/);
});
