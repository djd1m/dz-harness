// ADR-004 Confirmation acid tests for the PreToolUse veto hook — the brake must be
// EXECUTED, not merely present. Discrimination: test/mutation-registry.json deletes the
// sshpass regex / the rollout guard and REQUIRES these tests to go red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(dir, '..', 'templates', '.claude', 'hooks', 'cloudru-ssh-guard.cjs');
const { decide } = require(HOOK);

function runHook(payload) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr };
}

test('sshpass to a Cloud.ru VM ip is vetoed (exit 2, reason on stderr)', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'sshpass -p hunter2 ssh user1@1.2.3.4' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /sshpass/);
});

test('ssh without -i to user1@ip is vetoed', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ssh user1@1.2.3.4 docker ps' } });
  assert.equal(r.status, 2);
});

test('keyed ssh (-i) is allowed (exit 0)', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ssh -i /home/u/.ssh/id_ed25519 user1@1.2.3.4 uptime' } });
  assert.equal(r.status, 0);
});

test('non-ssh Bash commands pass', () => {
  assert.equal(runHook({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }).status, 0);
});

test('kubectl rollout restart via the MCP tool is vetoed — the MEASURED engine classifier hole (05 §2.3)', () => {
  for (const toolName of ['mcp__cloudru-vm__k8s_kubectl', 'mcp__cloudru_vm__k8s_kubectl']) {
    const r = runHook({ tool_name: toolName, tool_input: { args: 'rollout restart deployment/app' } });
    assert.equal(r.status, 2, `${toolName} rollout restart must be denied`);
    assert.match(r.stderr, /rollout/);
  }
});

test('kubectl rollout status|history stay allowed', () => {
  assert.equal(runHook({ tool_name: 'mcp__cloudru-vm__k8s_kubectl', tool_input: { args: 'rollout status deployment/app' } }).status, 0);
  assert.equal(runHook({ tool_name: 'mcp__cloudru-vm__k8s_kubectl', tool_input: { args: 'rollout history deployment/app' } }).status, 0);
});

test('unparseable stdin fails open (a broken hook must not brick every Bash call)', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('--help exits 0 without reading stdin (release smoke contract)', () => {
  const out = execFileSync(process.execPath, [HOOK, '--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(out, /veto hook/);
});

test('decide() unit: rollout undo denied, config view untouched by this hook', () => {
  assert.ok(decide({ tool_name: 'mcp__cloudru-vm__k8s_kubectl', tool_input: { args: 'rollout undo deployment/app' } }));
  assert.equal(decide({ tool_name: 'mcp__cloudru-vm__k8s_kubectl', tool_input: { args: 'get pods' } }), null);
});
