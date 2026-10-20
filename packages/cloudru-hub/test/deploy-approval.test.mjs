import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readCredentials } = require('../src/credentials.js');
const { issueApproval } = require('../src/deploy-approval.js');
const cls = require('../data/tools-classification.json');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-deploy-guard-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const projectId = '11111111-2222-3333-4444-555555555555';
const vmId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const otherVM = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const planId = 'plan-123456abcdef';
const file = path.join(scratch, 'credentials.json');
const planFile = path.join(scratch, '.cloudru-vm', 'plans', `${planId}.json`);
const log = path.join(scratch, 'forwarded.jsonl');
const fake = path.join(scratch, 'fake-engine');
const env = { ...process.env, CLOUDRU_HUB_CREDENTIALS: file, CLOUDRU_HUB_APPROVALS: path.join(scratch, 'approvals'), CLOUDRU_VM_HOME: scratch, FAKE_LOG: log };
fs.writeFileSync(file, JSON.stringify({ key_id: 'test-key', secret: 'test-secret', project_id: projectId, region: 'ru.AZ-2' }), { mode: 0o600 });
fs.mkdirSync(path.dirname(planFile), { recursive: true });
const plan = { plan_id: planId, project_id: projectId, expires_at: new Date(Date.now() + 1800000).toISOString(), vm: { name: 'snake-pilot' }, ssh: { login: 'user1' }, cost: { currency: 'RUB', total_monthly_rub: 42 } };
const savePlan = () => fs.writeFileSync(planFile, JSON.stringify(plan));
savePlan();
fs.writeFileSync(fake, `#!/usr/bin/env node
const fs=require('fs');let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{b+=x;let i;while((i=b.indexOf('\\n'))>=0){const line=b.slice(0,i);b=b.slice(i+1);if(!line)continue;const m=JSON.parse(line);fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(m)+'\\n');if(!Object.hasOwn(m,'id'))continue;let result={};if(m.method==='tools/list')result={tools:[{name:'deploy_apply'},{name:'vm_exec'},{name:'destroy'}]};else if(m.method==='tools/call'){const deployment=process.env.FAKE_DEPLOY_OUTCOME?JSON.parse(process.env.FAKE_DEPLOY_OUTCOME):{vm_id:'${vmId}',status:'running',public_ip:'203.0.113.10',password:'generated-secret'};result={isError:m.params.name==='deploy_apply'&&!!process.env.FAKE_DEPLOY_ERROR,content:[{type:'text',text:m.params.name==='deploy_apply'?JSON.stringify(deployment):JSON.stringify({status:'ok'})}]};}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}});
`);
fs.chmodSync(fake, 0o755);
const rpc = (id, name, args = {}) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
function run(lines, overrides = {}) {
  fs.writeFileSync(log, '');
  const script = `const {runSafeMcp}=require(${JSON.stringify(path.resolve(import.meta.dirname, '../src/safe-mcp.js'))});runSafeMcp({toolsets:'vm-deploy',resolved:{path:${JSON.stringify(fake)},verified:true,sha256:${JSON.stringify(cls.engineSha256)}}});`;
  const r = spawnSync(process.execPath, ['-e', script], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 5000, env: { ...env, ...overrides } });
  assert.equal(r.status, 0, r.stderr || r.error?.message);
  return { responses: r.stdout.trim().split('\n').map(JSON.parse), forwarded: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
}

test('credentials require owner-only regular file and do not interpolate shell text', () => {
  assert.equal(readCredentials(env).projectId, projectId);
  assert.equal(readCredentials(env).env.CLOUDRU_KEY_ID, 'test-key');
  fs.chmodSync(file, 0o644);
  assert.throws(() => readCredentials(env), /0600/);
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(file, '{"secret":THIS_IS_A_FAKE_SECRET_FOR_QE}', { mode: 0o600 });
  assert.throws(() => readCredentials(env), (error) => error.message === 'credentials file is not valid JSON');
  fs.writeFileSync(file, JSON.stringify({ key_id: 'test-key', secret: 'test-secret', project_id: projectId, region: 'ru.AZ-2' }), { mode: 0o600 });
});

test('cost cap and project must match the persisted plan before approval', () => {
  assert.throws(() => issueApproval(planId, 41, env), /cost exceeds/);
  plan.project_id = otherVM;
  savePlan();
  assert.throws(() => issueApproval(planId, 100, env), /project differs/);
  plan.project_id = projectId;
  savePlan();
});

test('approved plan is single-use; remote commands are confined to its VM', () => {
  issueApproval(planId, 50, env);
  const out = run([
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    rpc(2, 'deploy_apply', { plan_id: planId, confirmed: false }),
    rpc(3, 'deploy_apply', { plan_id: planId, confirmed: true }),
  ]);
  const followup = run([
    rpc(4, 'vm_exec', { vm: otherVM, command: 'id' }),
    rpc(5, 'vm_exec', { vm: vmId, user: 'root', command: 'whoami' }),
    rpc(6, 'destroy', { confirmed: true }),
  ]);
  const by = Object.fromEntries([...out.responses, ...followup.responses].map((x) => [x.id, x]));
  assert.deepEqual(by[1].result.tools.map((x) => x.name), ['deploy_apply', 'vm_exec']);
  assert.equal(by[2].result.isError, false);
  assert.doesNotMatch(JSON.stringify(by[2]), /generated-secret/);
  for (const id of [3, 4, 6]) assert.ok(by[id].error, `request ${id} blocked`);
  assert.equal(by[5].result.content[0].text, JSON.stringify({ status: 'ok' }));
  const calls = [...out.forwarded, ...followup.forwarded].filter((x) => x.method === 'tools/call');
  assert.deepEqual(calls.map((x) => x.params), [
    { name: 'deploy_apply', arguments: { plan_id: planId, confirmed: true } },
    { name: 'vm_exec', arguments: { vm: vmId, user: 'user1', command: 'whoami' } },
  ]);
});

test('a changed plan invalidates the exact approval', () => {
  const second = 'plan-abcdef123456';
  const secondFile = path.join(path.dirname(planFile), `${second}.json`);
  fs.writeFileSync(secondFile, JSON.stringify({ ...plan, plan_id: second }));
  issueApproval(second, 50, env);
  fs.writeFileSync(secondFile, JSON.stringify({ ...plan, plan_id: second, cost: { currency: 'RUB', total_monthly_rub: 49 } }));
  const out = run([rpc(1, 'deploy_apply', { plan_id: second, confirmed: true })]);
  assert.match(out.responses[0].error.message, /approval does not match/);
  assert.equal(out.forwarded.length, 0);
});

test('partial deploy preserves its VM UUID for recovery and redacts nested secrets', () => {
  const third = 'plan-123456fedcba';
  fs.writeFileSync(path.join(path.dirname(planFile), `${third}.json`), JSON.stringify({ ...plan, plan_id: third }));
  issueApproval(third, 50, env);
  const outcome = { status: 'state_persistence_failed', result: { vm_id: otherVM, status: 'running', password: 'generated-secret' }, error: 'local state write failed' };
  const out = run([rpc(1, 'deploy_apply', { plan_id: third })], { FAKE_DEPLOY_OUTCOME: JSON.stringify(outcome), FAKE_DEPLOY_ERROR: '1' });
  assert.equal(out.responses[0].result.isError, true);
  const returned = JSON.parse(out.responses[0].result.content[0].text);
  assert.equal(returned.result.vm_id, otherVM);
  assert.equal(returned.result.password, undefined);
  assert.match(returned.recovery, /Inspect/);
  const denied = run([rpc(2, 'vm_exec', { vm: otherVM, command: 'id' })]);
  assert.ok(denied.responses[0].error);
});

test('static site requires the reviewed digest and never grants an SSH command session', () => {
  const id = 'plan-aabbccddeeff';
  const digest = 'a'.repeat(64);
  const sitePlan = { ...plan, plan_id: id, ports: [80], network: { floating_ip: true, subnet_id: 'subnet-a', attach_fip_id: otherVM },
    static_site: { source: 'fixtures/snake/index.html', sha256: digest, size_bytes: 12, source_base64: Buffer.from('hello snake!').toString('base64'),
      files: [{ path: 'index.html', sha256: digest, size_bytes: 12, content_base64: Buffer.from('hello snake!').toString('base64') }] } };
  const siteFile = path.join(path.dirname(planFile), `${id}.json`);
  fs.writeFileSync(siteFile, JSON.stringify(sitePlan));
  assert.throws(() => issueApproval(id, 50, env), /site-sha256/);
  assert.throws(() => issueApproval(id, 50, env, Date.now(), 'b'.repeat(64)), /site-sha256/);
  const approved = issueApproval(id, 50, env, Date.now(), digest);
  assert.equal(approved.staticSite.sha256, digest);
  assert.match(approved.staticSite.ingress, /dedicated security group/);
  assert.match(approved.staticSite.estimateScope, /public IP charges excluded/);
  const outcome = { vm_id: otherVM, status: 'running', public_ip: '203.0.113.10', http_verification: { verified: true } };
  const out = run([rpc(1, 'deploy_apply', { plan_id: id })], { FAKE_DEPLOY_OUTCOME: JSON.stringify(outcome) });
  assert.equal(out.responses[0].result.isError, false);
  const denied = run([rpc(2, 'vm_exec', { vm: otherVM, command: 'id' })]);
  assert.ok(denied.responses[0].error);
});

test('static-site artifact and same-price network changes invalidate approval', () => {
  const site = { source: 'snake.zip', sha256: 'c'.repeat(64), size_bytes: 20, source_base64: Buffer.from('test').toString('base64'),
    files: [{ path: 'index.html', sha256: 'd'.repeat(64), size_bytes: 10, content_base64: 'aGVsbG8=' }] };
  for (const [suffix, mutation] of [
    ['010101010101', (p) => { p.static_site.sha256 = 'e'.repeat(64); }],
    ['020202020202', (p) => { p.network.subnet_id = 'subnet-b'; }],
    ['030303030303', (p) => { p.vm.zone = { id: 'zone-b', name: 'AZ-2' }; }],
  ]) {
    const id = `plan-${suffix}`;
    const original = { ...plan, plan_id: id, ports: [80], network: { floating_ip: true, subnet_id: 'subnet-a', attach_fip_id: otherVM },
      vm: { ...plan.vm, zone: { id: 'zone-a', name: 'AZ-1' } }, static_site: structuredClone(site) };
    const filename = path.join(path.dirname(planFile), `${id}.json`);
    fs.writeFileSync(filename, JSON.stringify(original));
    issueApproval(id, 50, env, Date.now(), site.sha256);
    mutation(original);
    fs.writeFileSync(filename, JSON.stringify(original));
    const out = run([rpc(1, 'deploy_apply', { plan_id: id })]);
    assert.match(out.responses[0].error.message, /approval does not match/);
    assert.equal(out.forwarded.length, 0);
  }
});
