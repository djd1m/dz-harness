import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const cls = require('../data/tools-classification.json');
const { selectedToolNames } = require('../src/toolsets.js');
const { PILOT_IMAGE, validateManifest, issueK8sApproval, consumeK8sApproval, k8sSession } = require('../src/k8s-approval.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-k8s-approval-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const clusterId = '11111111-2222-4333-8444-555555555555';
const projectId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const credentials = path.join(scratch, 'credentials.json');
fs.writeFileSync(credentials, JSON.stringify({ key_id: 'test-only', secret: 'test-only', project_id: projectId }), { mode: 0o600 });
const env = { ...process.env, CLOUDRU_HUB_CREDENTIALS: credentials, CLOUDRU_HUB_APPROVALS: path.join(scratch, 'approvals') };

function docs() {
  const metadata = (name) => ({ name, namespace: 'snake-pilot' });
  const app = 'snake-game';
  return [
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: metadata('snake-game-html'), data: { 'index.html': '<!doctype html><title>Snake</title>' } },
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata: metadata(app), spec: {
      replicas: 1, selector: { matchLabels: { app } }, template: { metadata: { labels: { app } }, spec: {
        automountServiceAccountToken: false, securityContext: { runAsNonRoot: true },
        containers: [{ name: app, image: PILOT_IMAGE, command: ['httpd'], args: ['-f', '-p', '8080', '-h', '/www'],
          ports: [{ containerPort: 8080 }], readinessProbe: { httpGet: { path: '/', port: 8080 } },
          resources: { requests: { cpu: '50m', memory: '32Mi' }, limits: { cpu: '100m', memory: '64Mi' } },
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, runAsUser: 10001, runAsGroup: 10001, capabilities: { drop: ['ALL'] } },
          volumeMounts: [{ name: 'html', mountPath: '/www', readOnly: true }] }],
        volumes: [{ name: 'html', configMap: { name: 'snake-game-html' } }],
      } } } },
    { apiVersion: 'v1', kind: 'Service', metadata: metadata(app), spec: { type: 'ClusterIP', selector: { app }, ports: [{ port: 80, targetPort: 8080 }] } },
  ];
}
const serialize = (resources) => resources.map((r) => YAML.stringify(r)).join('---\n');
const manifest = serialize(docs());
const digest = require('crypto').createHash('sha256').update(manifest).digest('hex');
const manifestFile = path.join(scratch, 'snake.yaml');
fs.writeFileSync(manifestFile, manifest);

test('bounded Kubernetes manifest accepts exactly the reviewed pod-native resources', () => {
  assert.deepEqual(validateManifest(manifest, 'snake-pilot').resources.map((r) => r.kind), ['ConfigMap', 'Deployment', 'Service']);
  assert.deepEqual(selectedToolNames('k8s-deploy'), ['k8s_apply', 'k8s_get', 'k8s_kubectl', 'k8s_list', 'k8s_nodepools', 'k8s_options']);
  for (const name of selectedToolNames('k8s-deploy')) {
    assert.equal(cls.tools[name].permission, ['k8s_apply', 'k8s_kubectl'].includes(name) ? 'ask' : 'allow');
  }
});

test('unexpected mutators, exposure, privilege, image and namespace are rejected', () => {
  const mutations = [
    (r) => { r[1].spec.template.spec.volumes.push({ name: 'host', hostPath: { path: '/etc' } }); },
    (r) => { r[1].spec.template.spec.containers[0].securityContext.privileged = true; },
    (r) => { r[1].spec.template.spec.containers[0].command = ['sh']; },
    (r) => { r[1].spec.template.spec.containers[0].image = 'docker.io/library/busybox@sha256:' + 'f'.repeat(64); },
    (r) => { r[2].spec.type = 'LoadBalancer'; },
    (r) => { r[0].metadata.namespace = 'default'; },
    (r) => { r.push({ apiVersion: 'v1', kind: 'Secret', metadata: { name: 's', namespace: 'snake-pilot' } }); },
  ];
  for (const mutate of mutations) {
    const r = docs(); mutate(r);
    assert.throws(() => validateManifest(serialize(r), 'snake-pilot'));
  }
});

test('web-image profile accepts a reviewed digest-pinned application and refuses privilege or exposure drift', () => {
  const app = 'lesson-web';
  const image = `registry.example.com/lesson-web@sha256:${'a'.repeat(64)}`;
  const web = [
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: app, namespace: 'lesson-app' }, spec: {
      replicas: 1, selector: { matchLabels: { app } }, template: { metadata: { labels: { app } }, spec: {
        automountServiceAccountToken: false, securityContext: { runAsNonRoot: true },
        containers: [{ name: app, image, ports: [{ containerPort: 8080 }], readinessProbe: { httpGet: { path: '/health', port: 8080 } },
          resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { cpu: '200m', memory: '256Mi' } },
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, runAsUser: 10001,
            runAsGroup: 10001, capabilities: { drop: ['ALL'] } } }],
      } } } },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: app, namespace: 'lesson-app' },
      spec: { type: 'ClusterIP', selector: { app }, ports: [{ port: 80, targetPort: 8080 }] } },
  ];
  const raw = serialize(web);
  assert.equal(validateManifest(raw, 'lesson-app', 'web-image').image, image);
  assert.throws(() => validateManifest(raw, 'lesson-app'), /three valid YAML documents/);
  for (const mutate of [
    (r) => { r[0].spec.template.spec.containers[0].image = 'registry.example.com/lesson-web:latest'; },
    (r) => { r[0].spec.template.spec.containers[0].image = `https://registry.example.com/lesson-web@sha256:${'a'.repeat(64)}`; },
    (r) => { r[0].spec.template.spec.hostNetwork = true; },
    (r) => { r[0].spec.template.spec.containers[0].securityContext.privileged = true; },
    (r) => { r[1].spec.type = 'LoadBalancer'; },
    (r) => { r[0].metadata.namespace = 'default'; },
    (r) => { r[0].metadata.name = r[1].metadata.name = '123'; r[0].spec.selector.matchLabels.app = r[0].spec.template.metadata.labels.app = r[1].spec.selector.app = '123'; r[0].spec.template.spec.containers[0].name = '123'; },
  ]) {
    const changed = structuredClone(web); mutate(changed);
    assert.throws(() => validateManifest(serialize(changed), 'lesson-app', 'web-image'));
  }
  const source = path.join(scratch, 'lesson-app.yaml');
  fs.writeFileSync(source, raw);
  const reviewed = require('crypto').createHash('sha256').update(raw).digest('hex');
  const approval = issueK8sApproval(clusterId, 'lesson-app', source, reviewed, env, Date.now(), 'web-image');
  assert.equal(approval.profile, 'web-image');
  assert.equal(consumeK8sApproval(approval.approvalId, env).manifest, raw);
  fs.writeFileSync(source, serialize([{ ...web[0], metadata: { name: 'changed', namespace: 'lesson-app' } }, web[1]]));
  assert.throws(() => issueK8sApproval(clusterId, 'lesson-app', source, reviewed, env, Date.now(), 'web-image'), /digest differs|must match/);
});

test('digest, project, expiry and single-use approval bind the exact manifest', () => {
  assert.throws(() => issueK8sApproval(clusterId, 'snake-pilot', manifestFile, '0'.repeat(64), env), /digest differs/);
  const a = issueK8sApproval(clusterId, 'snake-pilot', manifestFile, digest, env, 1000);
  assert.equal(a.manifestSha256, digest);
  const used = consumeK8sApproval(a.approvalId, env, 1100);
  assert.equal(used.manifest, manifest);
  assert.equal(k8sSession(a.approvalId, env, 1200).namespace, 'snake-pilot');
  assert.throws(() => consumeK8sApproval(a.approvalId, env, 1200));
  const b = issueK8sApproval(clusterId, 'snake-pilot', manifestFile, digest, env, 2000);
  const otherCredentials = path.join(scratch, 'other.json');
  fs.writeFileSync(otherCredentials, JSON.stringify({ key_id: 'test-other', secret: 'test-other', project_id: 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb' }), { mode: 0o600 });
  assert.throws(() => consumeK8sApproval(b.approvalId, { ...env, CLOUDRU_HUB_CREDENTIALS: otherCredentials }, 2100), /does not match/);
  assert.throws(() => consumeK8sApproval(b.approvalId, env, 2000 + 10 * 60_000));
});

test('MCP proxy forwards only locally approved apply and four fixed verification queries', () => {
  const a = issueK8sApproval(clusterId, 'snake-pilot', manifestFile, digest, env);
  const engine = path.join(scratch, 'fake-engine');
  const log = path.join(scratch, 'forwarded.jsonl');
  fs.writeFileSync(engine, `#!/usr/bin/env node
const fs=require('fs');let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{b+=x;let i;while((i=b.indexOf('\\n'))>=0){const line=b.slice(0,i);b=b.slice(i+1);if(!line)continue;const m=JSON.parse(line);fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(m)+'\\n');if(!Object.hasOwn(m,'id'))continue;let result={};if(m.method==='tools/list')result={tools:[{name:'k8s_apply'},{name:'k8s_kubectl'},{name:'k8s_create'}]};else result={content:[{type:'text',text:'{"status":"applied"}'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}});
`);
  fs.chmodSync(engine, 0o755);
  const script = `const {runSafeMcp}=require(${JSON.stringify(path.resolve(import.meta.dirname, '../src/safe-mcp.js'))});runSafeMcp({toolsets:'k8s-deploy',resolved:{path:${JSON.stringify(engine)},verified:true,sha256:${JSON.stringify(cls.engineSha256)}}});`;
  const msg = (id, name, args) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  const lines = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    msg(2, 'k8s_apply', { approval_id: a.approvalId, cluster_id: 'wrong', confirmed: true }),
    msg(3, 'k8s_apply', { approval_id: a.approvalId }),
    msg(4, 'k8s_apply', { approval_id: a.approvalId }),
    msg(5, 'k8s_kubectl', { approval_id: a.approvalId, query: 'delete' }),
    msg(6, 'k8s_kubectl', { approval_id: a.approvalId, query: 'pods', args: 'delete pods -A' }),
    msg(7, 'k8s_kubectl', { approval_id: a.approvalId, query: 'pods' }),
    msg(8, 'k8s_kubectl', { approval_id: a.approvalId, query: 'deployment' }),
    msg(9, 'k8s_kubectl', { approval_id: a.approvalId, query: 'service' }),
    msg(10, 'k8s_kubectl', { approval_id: a.approvalId, query: 'rollout' }),
    msg(11, 'k8s_create', { confirmed: true }),
    msg(12, 'k8s_apply', { approval_id: a.approvalId, create_only: false }),
  ];
  fs.writeFileSync(log, '');
  const r = spawnSync(process.execPath, ['-e', script], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 5000,
    env: { ...env, FAKE_LOG: log } });
  assert.equal(r.status, 0, r.stderr);
  const responses = r.stdout.trim().split('\n').map(JSON.parse);
  const byId = Object.fromEntries(responses.map((x) => [x.id, x]));
  assert.deepEqual(byId[1].result.tools.map((x) => x.name), ['k8s_apply', 'k8s_kubectl']);
  assert.deepEqual(Object.keys(byId[1].result.tools[0].inputSchema.properties), ['approval_id']);
  for (const id of [2, 4, 5, 6, 11, 12]) assert.ok(byId[id].error, `request ${id} rejected`);
  const forwarded = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse).filter((x) => x.method === 'tools/call');
  assert.deepEqual(forwarded.map((x) => x.params.name), ['k8s_apply', 'k8s_kubectl', 'k8s_kubectl', 'k8s_kubectl', 'k8s_kubectl']);
  assert.deepEqual(forwarded[0].params.arguments, { cluster_id: clusterId, namespace: 'snake-pilot', manifest, create_only: true, confirmed: true });
  assert.deepEqual(forwarded[1].params.arguments, { cluster_id: clusterId, args: '-n snake-pilot get pods -l app=snake-game -o json' });
  assert.deepEqual(forwarded[2].params.arguments, { cluster_id: clusterId, args: '-n snake-pilot get deployment snake-game -o json' });
  assert.deepEqual(forwarded[3].params.arguments, { cluster_id: clusterId, args: '-n snake-pilot get service snake-game -o json' });
  assert.deepEqual(forwarded[4].params.arguments, { cluster_id: clusterId, args: '-n snake-pilot rollout status deployment/snake-game --timeout=90s' });
});
