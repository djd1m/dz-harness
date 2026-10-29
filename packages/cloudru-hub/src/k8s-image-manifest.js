'use strict';

// A narrow generic web workload: one digest-pinned image, one Deployment and
// one internal Service. The reviewed digest is the security boundary; source
// build and image registry publication are separate operator steps.
const YAML = require('yaml');
const { isDeepStrictEqual } = require('util');
const DNS = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SERVICE_NAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IMAGE = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;
const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const fields = (obj, allowed, label) => {
  if (!isRecord(obj) || Object.keys(obj).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields`);
};
const equal = (actual, expected, label) => {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`${label} differs from the reviewed web-image profile`);
};

function validateImageManifest(raw, namespace) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) < 1 || Buffer.byteLength(raw) > 64 * 1024) throw new Error('manifest must be 1..65536 bytes');
  if (typeof namespace !== 'string' || !DNS.test(namespace) || namespace.length > 63 || namespace === 'default' || namespace === 'kube-system') {
    throw new Error('a dedicated DNS namespace is required');
  }
  const docs = YAML.parseAllDocuments(raw, { uniqueKeys: true, maxAliasCount: 0 });
  if (docs.length !== 2 || docs.some((doc) => doc.errors.length)) throw new Error('web-image manifest needs exactly Deployment and Service');
  const resources = docs.map((doc) => doc.toJS({ maxAliasCount: 0 }));
  const deployment = resources.find((r) => r?.kind === 'Deployment');
  const service = resources.find((r) => r?.kind === 'Service');
  if (!deployment || !service || deployment === service) throw new Error('web-image manifest needs Deployment and Service');
  for (const [r, kind, api] of [[deployment, 'Deployment', 'apps/v1'], [service, 'Service', 'v1']]) {
    fields(r, ['apiVersion', 'kind', 'metadata', 'spec'], kind);
    if (r.apiVersion !== api || r.kind !== kind) throw new Error(`invalid ${kind} API`);
    fields(r.metadata, ['name', 'namespace'], `${kind} metadata`);
    if (!SERVICE_NAME.test(r.metadata.name || '') || r.metadata.namespace !== namespace) throw new Error(`${kind} must use the reviewed namespace and a Service-compatible name`);
  }
  const app = deployment.metadata.name;
  if (service.metadata.name !== app) throw new Error('Service name must match Deployment');
  const spec = deployment.spec;
  fields(spec, ['replicas', 'selector', 'template'], 'Deployment spec');
  if (spec.replicas !== 1) throw new Error('only one replica is allowed');
  fields(spec.selector, ['matchLabels'], 'selector');
  equal(spec.selector.matchLabels, { app }, 'selector');
  fields(spec.template, ['metadata', 'spec'], 'pod template');
  fields(spec.template.metadata, ['labels'], 'pod metadata');
  equal(spec.template.metadata.labels, { app }, 'pod labels');
  const pod = spec.template.spec;
  fields(pod, ['automountServiceAccountToken', 'securityContext', 'containers'], 'pod spec');
  if (pod.automountServiceAccountToken !== false) throw new Error('service account token must be disabled');
  equal(pod.securityContext, { runAsNonRoot: true }, 'pod security context');
  if (!Array.isArray(pod.containers) || pod.containers.length !== 1) throw new Error('exactly one container is required');
  const container = pod.containers[0];
  fields(container, ['name', 'image', 'ports', 'readinessProbe', 'resources', 'securityContext'], 'container');
  if (container.name !== app || !IMAGE.test(container.image || '') || container.image.includes('://') || container.image.includes('//')) throw new Error('container needs a digest-pinned OCI image');
  equal(container.ports, [{ containerPort: 8080 }], 'container ports');
  equal(container.readinessProbe, { httpGet: { path: '/health', port: 8080 } }, 'readiness probe');
  equal(container.securityContext, { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true,
    runAsUser: 10001, runAsGroup: 10001, capabilities: { drop: ['ALL'] } }, 'container security context');
  const requests = container.resources?.requests;
  const limits = container.resources?.limits;
  fields(container.resources, ['requests', 'limits'], 'resources');
  fields(requests, ['cpu', 'memory'], 'requests');
  fields(limits, ['cpu', 'memory'], 'limits');
  const cpu = (v, max) => typeof v === 'string' && /^[1-9][0-9]{0,3}m$/.test(v) && Number.parseInt(v, 10) <= max;
  const mem = (v, max) => typeof v === 'string' && /^[1-9][0-9]{0,3}Mi$/.test(v) && Number.parseInt(v, 10) <= max;
  if (!cpu(requests.cpu, 500) || !cpu(limits.cpu, 1000) || !mem(requests.memory, 512) || !mem(limits.memory, 1024) ||
      Number.parseInt(requests.cpu, 10) > Number.parseInt(limits.cpu, 10) ||
      Number.parseInt(requests.memory, 10) > Number.parseInt(limits.memory, 10)) throw new Error('resources exceed bounded web-image limits');
  fields(service.spec, ['type', 'selector', 'ports'], 'Service spec');
  if (service.spec.type !== 'ClusterIP') throw new Error('Service must be internal ClusterIP');
  equal(service.spec.selector, { app }, 'Service selector');
  equal(service.spec.ports, [{ port: 80, targetPort: 8080 }], 'Service ports');
  return { app, image: container.image, resources: [{ kind: 'Deployment', name: app }, { kind: 'Service', name: app }] };
}

module.exports = { validateImageManifest };
