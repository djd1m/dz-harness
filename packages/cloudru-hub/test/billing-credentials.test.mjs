import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readCredentials } = require('../src/credentials.js');
const classification = require('../data/tools-classification.json');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-billing-credentials-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const credentials = path.join(scratch, 'credentials.json');
const engine = path.join(scratch, 'fake-engine');
const projectId = '11111111-2222-3333-4444-555555555555';
const agreementId = 'agreement-123';

fs.writeFileSync(engine, `#!/usr/bin/env node
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const result = { content: [{ type: 'text', text: JSON.stringify({
      agreement: process.env.CLOUDRU_AGREEMENT_ID || null,
      keyId: process.env.CLOUDRU_KEY_ID || null,
      projectId: process.env.CLOUDRU_PROJECT_ID || null,
    }) }] };
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n');
  }
});
`, { mode: 0o755 });

function callBilling(extraEnv = {}, toolsets = 'billing') {
  const script = `const {runSafeMcp}=require(${JSON.stringify(path.resolve(import.meta.dirname, '../src/safe-mcp.js'))});` +
    `const result=runSafeMcp({toolsets:${JSON.stringify(toolsets)},resolved:{path:${JSON.stringify(engine)},verified:true,sha256:${JSON.stringify(classification.engineSha256)}}});if(result!==null)process.exitCode=result;`;
  const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'billing_balance', arguments: {} } }) + '\n';
  return spawnSync(process.execPath, ['-e', script], {
    input, encoding: 'utf8', timeout: 5000,
    env: { ...process.env, CLOUDRU_HUB_CREDENTIALS: credentials, ...extraEnv },
  });
}

test('billing profile forwards agreement ID and auth from owner-only credentials to the Go child', () => {
  fs.writeFileSync(credentials, JSON.stringify({
    key_id: 'synthetic-key', secret: 'synthetic-secret', project_id: projectId,
    agreement_id: agreementId,
  }), { mode: 0o600 });
  const run = callBilling({ CLOUDRU_AGREEMENT_ID: 'stale-env-agreement' });
  assert.equal(run.status, 0, run.stderr);
  const response = JSON.parse(run.stdout.trim());
  assert.deepEqual(JSON.parse(response.result.content[0].text), {
    agreement: agreementId, keyId: 'synthetic-key', projectId,
  });
  assert.doesNotMatch(run.stdout + run.stderr, /synthetic-secret/);
});

test('agreement ID is optional in the file and can still come from the environment', () => {
  fs.writeFileSync(credentials, JSON.stringify({
    key_id: 'synthetic-key', secret: 'synthetic-secret', project_id: projectId,
  }), { mode: 0o600 });
  const run = callBilling({ CLOUDRU_AGREEMENT_ID: agreementId });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(JSON.parse(run.stdout.trim()).result.content[0].text).agreement, agreementId);
});

test('mixed and all profiles also forward the agreement ID when billing is selected', () => {
  fs.writeFileSync(credentials, JSON.stringify({
    key_id: 'synthetic-key', secret: 'synthetic-secret', project_id: projectId,
    agreement_id: agreementId,
  }), { mode: 0o600 });
  for (const profile of ['inventory,billing', 'all']) {
    const run = callBilling({}, profile);
    assert.equal(run.status, 0, `${profile}: ${run.stderr}`);
    assert.equal(JSON.parse(JSON.parse(run.stdout.trim()).result.content[0].text).agreement, agreementId);
  }
});

test('billing keeps an environment-only setup when no credential file exists', () => {
  const run = callBilling({
    HOME: path.join(scratch, 'empty-home'),
    CLOUDRU_HUB_CREDENTIALS: '',
    CLOUDRU_AGREEMENT_ID: agreementId,
    CLOUDRU_KEY_ID: 'environment-key',
    CLOUDRU_PROJECT_ID: projectId,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(JSON.parse(run.stdout.trim()).result.content[0].text), {
    agreement: agreementId, keyId: 'environment-key', projectId,
  });
});

test('explicit missing or malformed billing credential files fail closed', () => {
  const missing = callBilling({ CLOUDRU_HUB_CREDENTIALS: path.join(scratch, 'missing.json') });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cloudru-hub mcp-safe:/);
  fs.writeFileSync(credentials, JSON.stringify({
    key_id: 'synthetic-key', secret: 'synthetic-secret', project_id: projectId,
    agreement_id: 'bad\nvalue',
  }), { mode: 0o600 });
  const malformed = callBilling();
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /agreement_id/);
  assert.equal(malformed.stdout, '');
  assert.throws(() => readCredentials({ CLOUDRU_HUB_CREDENTIALS: credentials }), /agreement_id/);
});
