'use strict';
// Named, auditable discovery groups. Each member must remain classified allow.
const { loadClassification } = require('./classification');

const GROUPS = Object.freeze({
  inventory: ['status', 'list', 'vm_list', 'vm_get', 'list_zones', 'list_images', 'list_flavors', 'list_disk_types', 'list_subnets', 'org_projects', 'org_quotas'],
  compute: ['vm_list', 'vm_get', 'disk_list', 'list_flavors', 'list_disk_types', 'list_zones', 'list_images', 'list_subnets', 'list_security_groups', 'list_floating_ips'],
  kubernetes: ['k8s_list', 'k8s_get', 'k8s_options', 'k8s_plan', 'k8s_nodepools'],
  data: ['pg_list', 'pg_get', 'pg_versions', 'pg_specs', 'pg_databases', 'pg_users', 'pg_backups', 'kafka_list', 'kafka_get', 'kafka_versions', 'kafka_specs', 'redis_list', 'redis_get', 'redis_versions', 'redis_specs'],
  network: ['vpc_list', 'vpc_get', 'vpc_routes', 'snat_list', 'lb_list', 'lb_get', 'tg_list', 'tg_get', 'dns_zones', 'dns_zone_get', 'dns_records', 'dns_record_get'],
  storage: ['disk_list', 's3_buckets', 's3_ls', 's3_get'],
  billing: ['billing_balance', 'billing_consumption', 'billing_finops'],
});

// A separate, opt-in workflow. Mutators pass the proxy's local plan/VM guard;
// combining this with a read-only group would blur that boundary.
const VM_DEPLOY = Object.freeze([
  'deploy_plan', 'deploy_preflight', 'deploy_apply', 'deploy_reconcile', 'vm_exec', 'vm_list', 'vm_get',
  'list_zones', 'list_images', 'list_flavors', 'list_disk_types',
  'list_subnets', 'list_security_groups', 'status',
]);
const K8S_DEPLOY = Object.freeze([
  'k8s_list', 'k8s_get', 'k8s_options', 'k8s_nodepools', 'k8s_apply', 'k8s_kubectl',
]);

function selectedToolNames(spec = 'all', cls = loadClassification()) {
  if (spec === 'vm-deploy') {
    for (const name of VM_DEPLOY) {
      const permission = cls.tools[name]?.permission;
      if (permission !== (['deploy_apply', 'vm_exec'].includes(name) ? 'ask' : 'allow')) {
        throw new Error(`vm-deploy tool classification changed: ${name}`);
      }
    }
    return [...VM_DEPLOY].sort();
  }
  if (spec === 'k8s-deploy') {
    for (const name of K8S_DEPLOY) {
      const permission = cls.tools[name]?.permission;
      if (permission !== (['k8s_apply', 'k8s_kubectl'].includes(name) ? 'ask' : 'allow')) {
        throw new Error(`k8s-deploy tool classification changed: ${name}`);
      }
    }
    return [...K8S_DEPLOY].sort();
  }
  const names = Object.entries(cls.tools).filter(([, v]) => v.permission === 'allow').map(([name]) => name);
  if (spec === 'all') return names.sort();
  const parts = String(spec).split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0 || parts.includes('all') || parts.some((p) => !Object.hasOwn(GROUPS, p))) {
    throw new Error(`invalid toolsets "${spec}"; choose all, vm-deploy, k8s-deploy, or comma-separated ${Object.keys(GROUPS).join(', ')}`);
  }
  const selected = [...new Set(parts.flatMap((p) => GROUPS[p]))].sort();
  for (const name of selected) {
    if (!cls.tools[name] || cls.tools[name].permission !== 'allow') throw new Error(`toolset contains non-allow tool: ${name}`);
  }
  return selected;
}

module.exports = { GROUPS, VM_DEPLOY, K8S_DEPLOY, selectedToolNames };
