'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { readCredentials, UUID } = require('./credentials');

const PLAN_ID = /^plan-[0-9a-f]{12}$/;

function stateRoot(env = process.env) { return env.CLOUDRU_VM_HOME || os.homedir(); }
function approvalRoot(env = process.env) { return env.CLOUDRU_HUB_APPROVALS || path.join(os.homedir(), '.config', 'cloudru-hub', 'approvals'); }
function planPath(id, env = process.env) {
  if (!PLAN_ID.test(id)) throw new Error('invalid plan_id');
  return path.join(stateRoot(env), '.cloudru-vm', 'plans', `${id}.json`);
}
function readPlan(id, env = process.env, now = Date.now()) {
  const file = planPath(id, env);
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 65536) throw new Error('plan file is not a bounded regular file');
  const raw = fs.readFileSync(file);
  const plan = JSON.parse(raw);
  if (plan.plan_id !== id || !UUID.test(plan.project_id || '')) throw new Error('plan identity or project is invalid');
  const expires = Date.parse(plan.expires_at);
  if (!Number.isFinite(expires) || expires <= now) throw new Error('plan expired');
  const price = plan.cost && plan.cost.total_monthly_rub;
  if (!plan.cost || plan.cost.currency !== 'RUB' || !Number.isFinite(price) || price < 0) throw new Error('plan cost is not a finite RUB estimate');
  if (typeof plan.vm?.name !== 'string' || !plan.vm.name) throw new Error('plan VM name is invalid');
  if (!plan.static_site && (typeof plan.ssh?.login !== 'string' || !plan.ssh.login)) throw new Error('plan SSH login is invalid');
  if (plan.static_site) {
    const site = plan.static_site;
    if (!/^[0-9a-f]{64}$/.test(site.sha256 || '') || !Number.isSafeInteger(site.size_bytes) || site.size_bytes < 1 || site.size_bytes > 20 * 1024 ||
        typeof site.source_base64 !== 'string' || site.source_base64.length > 28 * 1024 ||
        !Array.isArray(site.files) || site.files.length < 1 || site.files.length > 32 ||
        !Array.isArray(plan.ports) || plan.ports.length !== 1 || plan.ports[0] !== 80 || plan.network?.floating_ip !== true ||
        typeof plan.network?.attach_fip_id !== 'string' || !UUID.test(plan.network.attach_fip_id)) {
      throw new Error('static-site plan artifact or network scope is invalid');
    }
  }
  return { plan, hash: crypto.createHash('sha256').update(raw).digest('hex'), price, expires };
}
function approvalPath(id, env = process.env) { return path.join(approvalRoot(env), `${id}.json`); }
function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) throw new Error('approval directory must be private (0700)');
}
function readPrivateJson(file) {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 || st.size > 65536 ||
      (typeof process.getuid === 'function' && st.uid !== process.getuid())) throw new Error('approval file must be private, owned and bounded');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function issueApproval(id, maxMonthlyRub, env = process.env, now = Date.now(), reviewedSiteSha256 = '') {
  const { plan, hash, price, expires } = readPlan(id, env, now);
  if (plan.static_site && reviewedSiteSha256 !== plan.static_site.sha256) {
    throw new Error('static-site approval requires --site-sha256 matching the reviewed artifact');
  }
  const credentials = readCredentials(env);
  if (credentials.projectId !== plan.project_id) throw new Error('plan project differs from credentials project');
  if (!Number.isFinite(maxMonthlyRub) || maxMonthlyRub < price) throw new Error('monthly cost exceeds operator cap');
  const root = approvalRoot(env);
  ensurePrivateDir(root);
  const record = {
    planId: id,
    planHash: hash,
    projectId: plan.project_id,
    vmName: plan.vm.name,
    sshUser: plan.ssh?.login || '',
    siteMode: !!plan.static_site,
    maxMonthlyRub,
    issuedAt: now,
    expiresAt: Math.min(expires, now + 10 * 60_000),
  };
  fs.writeFileSync(approvalPath(id, env), JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  return { planId: id, projectId: record.projectId, vmName: record.vmName, estimatedMonthlyRub: price, maxMonthlyRub, expiresAt: record.expiresAt,
    ...(plan.static_site ? { staticSite: { source: plan.static_site.source, sha256: plan.static_site.sha256, sizeBytes: plan.static_site.size_bytes,
      files: plan.static_site.files.map((file) => ({ path: file.path, sha256: file.sha256, sizeBytes: file.size_bytes })),
      ingress: 'dedicated security group: TCP 80 from 0.0.0.0/0', estimateScope: 'compute and disk only; public IP charges excluded' } } : {}) };
}

function consumeApproval(id, env = process.env, now = Date.now()) {
  const { plan, hash, price } = readPlan(id, env, now);
  const credentials = readCredentials(env);
  const file = approvalPath(id, env);
  const a = readPrivateJson(file);
  if (a.planId !== id || a.planHash !== hash || a.projectId !== plan.project_id || a.projectId !== credentials.projectId || a.siteMode !== !!plan.static_site ||
      a.vmName !== plan.vm.name || !Number.isFinite(a.maxMonthlyRub) || price > a.maxMonthlyRub ||
      !Number.isFinite(a.expiresAt) || a.expiresAt <= now) throw new Error('approval does not match current plan, project, cost or time');
  const spent = path.join(approvalRoot(env), `${id}.used-${crypto.randomBytes(8).toString('hex')}.json`);
  fs.renameSync(file, spent); // one caller consumes the pending path; a replay cannot.
  return a;
}

function recordDeployedVM(approval, result, env = process.env, now = Date.now()) {
  const vmId = result && result.vm_id;
  if (!UUID.test(vmId || '') || result.status !== 'running') throw new Error('deploy did not return a running VM UUID');
  const root = approvalRoot(env);
  ensurePrivateDir(root);
  const session = { planId: approval.planId, projectId: approval.projectId, vmId, sshUser: approval.sshUser, expiresAt: now + 2 * 60 * 60_000 };
  fs.writeFileSync(path.join(root, `${approval.planId}.session.json`), JSON.stringify(session) + '\n', { flag: 'wx', mode: 0o600 });
  return session;
}

function approvedVM(requestedId, env = process.env, now = Date.now()) {
  const root = approvalRoot(env);
  if (!fs.existsSync(root)) throw new Error('no approved deployment session');
  ensurePrivateDir(root);
  const sessions = fs.readdirSync(root).filter((name) => /^plan-[0-9a-f]{12}\.session\.json$/.test(name));
  const credentials = readCredentials(env);
  if (requestedId && !UUID.test(requestedId)) throw new Error('vm_exec requires an approved VM UUID');
  const live = sessions.map((name) => readPrivateJson(path.join(root, name)))
    .filter((s) => s.expiresAt > now && s.projectId === credentials.projectId && UUID.test(s.vmId || ''));
  const matching = requestedId ? live.filter((s) => s.vmId === requestedId) : live;
  if (matching.length !== 1) throw new Error('vm_exec requires exactly one matching active approved VM session');
  return matching[0];
}

module.exports = { stateRoot, approvalRoot, planPath, readPlan, issueApproval, consumeApproval, recordDeployedVM, approvedVM };
