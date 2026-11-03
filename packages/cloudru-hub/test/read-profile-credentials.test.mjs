import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const classification = require('../data/tools-classification.json');
const pkg = path.resolve(import.meta.dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-read-profile-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const home = path.join(scratch, 'home');
const defaultFile = path.join(home, '.config', 'cloudru-hub', 'credentials.json');
const alternateFile = path.join(scratch, 'alternate.json');
const marker = path.join(scratch, 'engine-spawned');
const engine = path.join(scratch, 'fake-engine');
const fixture = { key_id: 'fixture-key-a', secret: 'fixture-secret-a',
  project_id: '11111111-2222-4333-8444-555555555555', region: 'ru.AZ-1' };
const alternate = { key_id: 'fixture-key-b', secret: 'fixture-secret-b',
  project_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', region: 'ru.AZ-2' };
fs.mkdirSync(path.dirname(defaultFile), { recursive: true });
fs.writeFileSync(defaultFile, JSON.stringify(fixture), { mode: 0o600 });
fs.writeFileSync(alternateFile, JSON.stringify(alternate), { mode: 0o600 });
fs.writeFileSync(engine, `#!/usr/bin/env node
const fs=require('fs');fs.appendFileSync(${JSON.stringify(marker)},'spawn\\n');
let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{b+=chunk;let end;
while((end=b.indexOf('\\n'))>=0){const line=b.slice(0,end);b=b.slice(end+1);if(!line)continue;
const m=JSON.parse(line);const match=(key,secret,project,region)=>({
key:process.env.CLOUDRU_KEY_ID===key,secret:process.env.CLOUDRU_SECRET===secret,
project:process.env.CLOUDRU_PROJECT_ID===project,region:process.env.CLOUDRU_REGION===region});
const result={content:[{type:'text',text:JSON.stringify({
a:match('fixture-key-a','fixture-secret-a','11111111-2222-4333-8444-555555555555','7c99a597-8516-494f-a2c7-d7377048681e'),
b:match('fixture-key-b','fixture-secret-b','aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','479a4ab3-3ff3-4972-95c5-7610bac5c0bb')})}]};
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}});
`, { mode: 0o755 });

function cleanEnv(extra = {}) {
  return { ...Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.toUpperCase().startsWith('CLOUDRU_'))),
  HOME: home, ...extra };
}

function runProxy(toolsets, credentialsFile, extraEnv = {}, tool = 'vm_list', fault = '') {
  fs.rmSync(marker, { force: true });
  const script = `const {runSafeMcp}=require(${JSON.stringify(path.join(pkg, 'src/safe-mcp.js'))});` +
    (fault === 'wrong-owner' ? 'process.getuid=()=>65534;' : fault === 'unreadable' ?
      `const fs=require('fs');const read=fs.readFileSync;fs.readFileSync=(file,...args)=>{if(file===${JSON.stringify(credentialsFile)})throw Object.assign(new Error('EACCES: synthetic unreadable file'),{code:'EACCES'});return read(file,...args)};` : '') +
    `const status=runSafeMcp({toolsets:${JSON.stringify(toolsets)},credentialsFile:${JSON.stringify(credentialsFile)},` +
    `resolved:{path:${JSON.stringify(engine)},verified:true,sha256:${JSON.stringify(classification.engineSha256)}}});` +
    `if(typeof status==='number')process.exitCode=status;`;
  return spawnSync(process.execPath, ['-e', script], {
    input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: tool, arguments: {} } }) + '\n',
    encoding: 'utf8', timeout: 5000, env: cleanEnv(extraEnv),
  });
}

function observed(run) {
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'spawn\n');
  return JSON.parse(JSON.parse(run.stdout.trim()).result.content[0].text);
}

const yes = { key: true, secret: true, project: true, region: true };
const no = { key: false, secret: false, project: false, region: false };

test('explicit default credential file reaches read-profile engine child', () => {
  for (const profile of ['inventory', 'compute', 'network']) {
    const run = runProxy(profile, 'default', {}, profile === 'network' ? 'vpc_list' : 'vm_list');
    assert.deepEqual(observed(run), { a: yes, b: no }, profile);
    assert.doesNotMatch(run.stdout + run.stderr, /fixture-secret-a/);
  }
});

test('alternate path selects project B without leaking credential values', () => {
  for (const profile of ['inventory', 'compute', 'network']) {
    const run = runProxy(profile, alternateFile, {}, profile === 'network' ? 'vpc_list' : 'vm_list');
    assert.deepEqual(observed(run), { a: no, b: yes }, profile);
    assert.doesNotMatch(run.stdout + run.stderr, /fixture-secret-b/);
  }
});

test('no opt-in does not read an unrelated private file for read profiles', () => {
  const unrelated = path.join(scratch, 'unrelated.json');
  fs.writeFileSync(unrelated, 'not json', { mode: 0o600 });
  for (const profile of ['inventory', 'compute', 'network']) {
    const run = runProxy(profile, undefined, { CLOUDRU_HUB_CREDENTIALS: unrelated },
      profile === 'network' ? 'vpc_list' : 'vm_list');
    assert.deepEqual(observed(run), { a: no, b: no }, profile);
  }
});

test('invalid explicit files refuse before engine spawn without exposing contents', () => {
  const missing = path.join(scratch, 'missing.json');
  const malformed = path.join(scratch, 'malformed.json');
  const unsafe = path.join(scratch, 'unsafe.json');
  const link = path.join(scratch, 'link.json');
  fs.writeFileSync(malformed, '{fixture-secret-a', { mode: 0o600 });
  fs.writeFileSync(unsafe, JSON.stringify(fixture), { mode: 0o644 });
  fs.symlinkSync(defaultFile, link);
  for (const [file, fault] of [[missing, ''], [malformed, ''], [unsafe, ''],
    [link, ''], [alternateFile, 'wrong-owner'], [alternateFile, 'unreadable']]) {
    const run = runProxy('inventory', file, {}, 'vm_list', fault);
    assert.ifError(run.error);
    assert.equal(run.status, 1, `${file}: ${run.stderr}`);
    assert.equal(fs.existsSync(marker), false, `${file}: engine spawned`);
    assert.equal(run.stdout, '');
    assert.doesNotMatch(run.stderr, /fixture-secret-a|fixture-secret-b/);
  }
});

test('deployment profiles reject credential-file before engine spawn across project contexts', () => {
  for (const [file, expected] of [[defaultFile, { a: yes, b: no }],
    [alternateFile, { a: no, b: yes }]]) {
    for (const profile of ['vm-deploy', 'k8s-deploy']) {
      for (const option of ['default', file]) {
        const run = runProxy(profile, option, { CLOUDRU_HUB_CREDENTIALS: file },
          profile === 'k8s-deploy' ? 'k8s_get' : 'vm_list');
        assert.ifError(run.error);
        assert.equal(run.status, 1, `${profile}: ${run.stderr}`);
        assert.match(run.stderr, /credentials-file.*unsupported for deployment profiles/);
        assert.equal(fs.existsSync(marker), false, `${profile}: engine spawned`);
      }
      const control = runProxy(profile, undefined, { CLOUDRU_HUB_CREDENTIALS: file },
        profile === 'k8s-deploy' ? 'k8s_get' : 'vm_list');
      assert.deepEqual(observed(control), expected, `${profile}: no-option context`);
    }
  }
});
