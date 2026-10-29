'use strict';

// An opt-in, exact-manifest approval for an existing Kubernetes cluster.
// The model never supplies the manifest, cluster, namespace or confirmation
// forwarded to the engine. The local operator reviews the file and its digest.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const YAML = require('yaml');
const { readCredentials, UUID } = require('./credentials');
const { approvalRoot } = require('./deploy-approval');
const { validateImageManifest } = require('./k8s-image-manifest');

const APPROVAL_ID = /^k8s-[0-9a-f]{12}$/;
const DNS_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_MANIFEST = 64 * 1024;
const PILOT_IMAGE = 'docker.io/library/busybox@sha256:66a6306db78bf2dbf3487f293aa8d6990d8e506fdffab9cc43fe422becf886e4';
const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
function keys(value, allowed, label) {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`${label} contains unsupported fields`);
  }
}
function exact(value, expected, label) {
  if (!isDeepStrictEqual(value, expected)) throw new Error(`${label} differs from the bounded Snake profile`);
}
function quantity(value, max, suffix = '') {
  if (typeof value !== 'string' || !new RegExp(`^[1-9][0-9]{0,4}${suffix}$`).test(value)) return false;
  return Number.parseInt(value, 10) <= max;
}

function privateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && st.uid !== process.getuid())) {
    throw new Error('approval directory must be private and owned');
  }
}

function privateJson(file) {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 || st.size > MAX_MANIFEST + 8192 ||
      (typeof process.getuid === 'function' && st.uid !== process.getuid())) {
    throw new Error('approval file must be private, owned and bounded');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateManifest(raw, namespace, profile = 'snake') {
  if (profile === 'web-image') return validateImageManifest(raw, namespace);
  if (profile !== 'snake') throw new Error('unsupported Kubernetes profile');
  if (typeof raw !== 'string' || Buffer.byteLength(raw) < 1 || Buffer.byteLength(raw) > MAX_MANIFEST) {
    throw new Error('manifest must be non-empty and at most 64 KiB');
  }
  if (typeof namespace !== 'string' || !DNS_NAME.test(namespace) || namespace.length > 63) throw new Error('invalid namespace');
  const docs = YAML.parseAllDocuments(raw, { uniqueKeys: true, maxAliasCount: 0 });
  if (docs.length !== 3 || docs.some((d) => d.errors.length)) throw new Error('manifest must contain exactly three valid YAML documents');
  const resources = docs.map((d) => d.toJS({ maxAliasCount: 0 }));
  const byKind = new Map();
  for (const r of resources) {
    if (!isRecord(r) || !isRecord(r.metadata) || typeof r.metadata.name !== 'string' || !DNS_NAME.test(r.metadata.name) ||
        r.metadata.namespace !== namespace || !['ConfigMap', 'Deployment', 'Service'].includes(r.kind) || byKind.has(r.kind)) {
      throw new Error('manifest requires one namespaced ConfigMap, Deployment and Service with valid unique names');
    }
    if (r.apiVersion !== (r.kind === 'Deployment' ? 'apps/v1' : 'v1')) throw new Error('unexpected Kubernetes apiVersion');
    keys(r.metadata, ['name', 'namespace'], 'metadata');
    byKind.set(r.kind, r);
  }
  if (byKind.size !== 3) throw new Error('manifest requires ConfigMap, Deployment and Service');
  const config = byKind.get('ConfigMap');
  const deploy = byKind.get('Deployment');
  const service = byKind.get('Service');
  const app = deploy.metadata.name;
  keys(config, ['apiVersion', 'kind', 'metadata', 'data'], 'ConfigMap');
  keys(deploy, ['apiVersion', 'kind', 'metadata', 'spec'], 'Deployment');
  keys(service, ['apiVersion', 'kind', 'metadata', 'spec'], 'Service');
  if (config.metadata.name !== `${app}-html` || service.metadata.name !== app ||
      !isRecord(config.data) || typeof config.data['index.html'] !== 'string' ||
      Buffer.byteLength(config.data['index.html']) < 1 || Buffer.byteLength(config.data['index.html']) > 20 * 1024 ||
      Object.keys(config.data).length !== 1 || config.binaryData !== undefined) {
    throw new Error('ConfigMap must contain only bounded index.html for this app');
  }
  const spec = deploy.spec;
  const pod = spec?.template?.spec;
  const container = Array.isArray(pod?.containers) && pod.containers.length === 1 ? pod.containers[0] : null;
  const image = container?.image;
  keys(spec, ['replicas', 'selector', 'template'], 'Deployment spec');
  keys(spec.selector, ['matchLabels'], 'Deployment selector');
  keys(spec.template, ['metadata', 'spec'], 'pod template');
  keys(spec.template.metadata, ['labels'], 'pod metadata');
  keys(pod, ['automountServiceAccountToken', 'securityContext', 'containers', 'volumes'], 'pod spec');
  if (container) keys(container, ['name', 'image', 'command', 'args', 'ports', 'readinessProbe', 'resources', 'securityContext', 'volumeMounts'], 'container');
  keys(service.spec, ['type', 'selector', 'ports'], 'Service spec');
  exact(spec.selector.matchLabels, { app }, 'Deployment selector');
  exact(spec.template.metadata.labels, { app }, 'pod labels');
  exact(service.spec.selector, { app }, 'Service selector');
  exact(pod.securityContext, { runAsNonRoot: true }, 'pod securityContext');
  if (container) {
    exact(container.ports, [{ containerPort: 8080 }], 'container ports');
    exact(container.securityContext, { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true,
      runAsUser: 10001, runAsGroup: 10001, capabilities: { drop: ['ALL'] } }, 'container securityContext');
    exact(container.command, ['httpd'], 'container command');
    exact(container.args, ['-f', '-p', '8080', '-h', '/www'], 'container args');
    exact(container.readinessProbe, { httpGet: { path: '/', port: 8080 } }, 'readiness probe');
  }
  if (spec?.replicas !== 1 || spec?.selector?.matchLabels?.app !== app ||
      spec?.template?.metadata?.labels?.app !== app || !isRecord(pod) ||
      pod.hostNetwork || pod.hostPID || pod.hostIPC || pod.serviceAccountName ||
      pod.automountServiceAccountToken !== false || pod.initContainers !== undefined ||
      !container || container.name !== app || image !== PILOT_IMAGE ||
      container.securityContext?.privileged === true || container.securityContext?.allowPrivilegeEscalation !== false ||
      pod.securityContext?.runAsNonRoot !== true ||
      container.readinessProbe?.httpGet?.path !== '/' || container.readinessProbe?.httpGet?.port !== 8080 ||
      !isRecord(container.resources?.requests) || !isRecord(container.resources?.limits) ||
      !container.resources.requests.cpu || !container.resources.requests.memory ||
      !quantity(container.resources.requests.cpu, 500, 'm') || !quantity(container.resources.limits.cpu, 1000, 'm') ||
      !quantity(container.resources.requests.memory, 512, 'Mi') || !quantity(container.resources.limits.memory, 1024, 'Mi') ||
      Object.keys(container.resources.requests).length !== 2 || Object.keys(container.resources.limits).length !== 2 ||
      Number.parseInt(container.resources.requests.cpu, 10) > Number.parseInt(container.resources.limits.cpu, 10) ||
      Number.parseInt(container.resources.requests.memory, 10) > Number.parseInt(container.resources.limits.memory, 10) ||
      !Array.isArray(pod.volumes) || pod.volumes.length !== 1 || pod.volumes[0]?.configMap?.name !== config.metadata.name ||
      !Array.isArray(container.volumeMounts) || container.volumeMounts.length !== 1 ||
      container.volumeMounts[0]?.name !== pod.volumes[0]?.name || !container.volumeMounts[0]?.readOnly ||
      container.volumeMounts[0]?.mountPath !== '/www') {
    throw new Error('Deployment must be a bounded non-root single-replica pod with pinned image, probes and resources');
  }
  exact(pod.volumes[0], { name: 'html', configMap: { name: config.metadata.name } }, 'pod volume');
  exact(container.volumeMounts[0], { name: 'html', mountPath: '/www', readOnly: true }, 'volume mount');
  exact(service.spec.ports, [{ port: 80, targetPort: 8080 }], 'Service ports');
  if (service.spec?.type !== 'ClusterIP' || service.spec?.selector?.app !== app ||
      !Array.isArray(service.spec?.ports) || service.spec.ports.length !== 1 ||
      service.spec.ports[0]?.port !== 80 || service.spec.ports[0]?.targetPort !== 8080 ||
      service.spec.externalIPs !== undefined || service.spec.loadBalancerIP !== undefined ||
      service.spec.loadBalancerClass !== undefined) {
    throw new Error('Service must be ClusterIP port 80 to pod port 8080 without external IPs');
  }
  return { app, resources: resources.map((r) => ({ kind: r.kind, name: r.metadata.name })), image };
}

function approvalFile(id, env = process.env) {
  if (!APPROVAL_ID.test(id)) throw new Error('invalid Kubernetes approval ID');
  return path.join(approvalRoot(env), `${id}.json`);
}

function issueK8sApproval(clusterId, namespace, manifestFile, reviewedSha256, env = process.env, now = Date.now(), profile = 'snake') {
  if (!UUID.test(clusterId || '')) throw new Error('cluster_id must be a UUID');
  if (!DIGEST.test(reviewedSha256 || '')) throw new Error('reviewed manifest SHA-256 is required');
  const st = fs.lstatSync(manifestFile);
  if (!st.isFile() || st.isSymbolicLink() || st.size < 1 || st.size > MAX_MANIFEST) {
    throw new Error('manifest source must be a bounded regular file');
  }
  const manifest = fs.readFileSync(manifestFile, 'utf8');
  const details = validateManifest(manifest, namespace, profile);
  const digest = sha256(manifest);
  if (digest !== reviewedSha256) throw new Error('manifest digest differs from reviewed SHA-256');
  const credentials = readCredentials(env);
  const root = approvalRoot(env);
  privateDir(root);
  const id = `k8s-${crypto.randomBytes(6).toString('hex')}`;
  const record = { id, projectId: credentials.projectId, clusterId, namespace, manifest, digest, profile,
    app: details.app, issuedAt: now, expiresAt: now + 10 * 60_000 };
  fs.writeFileSync(approvalFile(id, env), JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  return { approvalId: id, projectId: record.projectId, clusterId, namespace, manifestSha256: digest, profile,
    resources: details.resources, image: details.image, expiresAt: record.expiresAt,
    estimateScope: 'existing cluster only; no cluster, worker, NAT or public load balancer is created' };
}

function consumeK8sApproval(id, env = process.env, now = Date.now()) {
  const file = approvalFile(id, env);
  const a = privateJson(file);
  const credentials = readCredentials(env);
  if (a.id !== id || a.projectId !== credentials.projectId || !UUID.test(a.clusterId || '') ||
      !Number.isFinite(a.expiresAt) || a.expiresAt <= now || !DIGEST.test(a.digest || '') ||
      sha256(a.manifest) !== a.digest || validateManifest(a.manifest, a.namespace, a.profile).app !== a.app) {
    throw new Error('Kubernetes approval does not match manifest, project or time');
  }
  const spent = path.join(approvalRoot(env), `${id}.used-${crypto.randomBytes(8).toString('hex')}.json`);
  fs.renameSync(file, spent);
  const session = { id, projectId: a.projectId, clusterId: a.clusterId, namespace: a.namespace,
    app: a.app, expiresAt: now + 2 * 60 * 60_000 };
  fs.writeFileSync(path.join(approvalRoot(env), `${id}.session.json`), JSON.stringify(session) + '\n', { flag: 'wx', mode: 0o600 });
  return { clusterId: a.clusterId, namespace: a.namespace, manifest: a.manifest, app: a.app };
}

function k8sSession(id, env = process.env, now = Date.now()) {
  if (!APPROVAL_ID.test(id)) throw new Error('invalid Kubernetes approval ID');
  const s = privateJson(path.join(approvalRoot(env), `${id}.session.json`));
  if (s.id !== id || s.projectId !== readCredentials(env).projectId || !UUID.test(s.clusterId || '') ||
      typeof s.namespace !== 'string' || !DNS_NAME.test(s.namespace) ||
      typeof s.app !== 'string' || !DNS_NAME.test(s.app) || !Number.isFinite(s.expiresAt) || s.expiresAt <= now) {
    throw new Error('Kubernetes verification session is expired or mismatched');
  }
  return s;
}

function verificationArgs(session, query) {
  const prefix = `-n ${session.namespace}`;
  switch (query) {
    case 'pods': return `${prefix} get pods -l app=${session.app} -o json`;
    case 'deployment': return `${prefix} get deployment ${session.app} -o json`;
    case 'service': return `${prefix} get service ${session.app} -o json`;
    case 'rollout': return `${prefix} rollout status deployment/${session.app} --timeout=90s`;
    default: throw new Error('query must be pods, deployment, service or rollout');
  }
}

module.exports = { PILOT_IMAGE, validateManifest, issueK8sApproval, consumeK8sApproval, k8sSession, verificationArgs };
