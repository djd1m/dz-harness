/** Pure Claude Code companion-configuration planning. */

import type {
  CarrierFragment,
  HarnessIntegrationManifestV1,
  IntegrationPlan,
  IntegrationPlanContext,
  TargetIntegrationAdapter,
} from '@dzhechkov/core';

function sortedRecord<T>(entries: readonly (readonly [string, T])[]): Readonly<Record<string, T>> {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
}

export function planClaudeIntegrations(
  manifest: HarnessIntegrationManifestV1,
  _context: IntegrationPlanContext,
): IntegrationPlan {
  const refusals: IntegrationPlan['refusals'][number][] = [];
  const fragments: CarrierFragment[] = [];
  const mcpEntries: [string, unknown][] = [];

  for (const [id, intent] of Object.entries(manifest.mcpServers ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (intent.transport !== 'stdio' || intent.envFrom !== undefined) {
      refusals.push({
        component: 'mcp',
        reasonCode: 'INTENT_NOT_EXPRESSIBLE',
        remediation: `${id}: initial Claude receipt proves only local stdio command+args without env/header/url fields`,
      });
      continue;
    }
    mcpEntries.push([id, {
      type: 'stdio',
      command: intent.command,
      ...(intent.args !== undefined ? { args: [...intent.args] } : {}),
    }]);
  }

  if (mcpEntries.length > 0) {
    fragments.push({
      component: 'mcp',
      carrierPath: '.mcp.json',
      scope: 'project',
      format: 'json',
      rootKey: 'mcpServers',
      entries: sortedRecord(mcpEntries),
    });
  }
  if ((manifest.hooks?.length ?? 0) > 0) {
    refusals.push({
      component: 'hooks',
      reasonCode: 'NO_ACTIVATION_RECEIPT',
      remediation: 'Claude hooks require a nonce canary and negative-control activation receipt',
    });
  }
  return { fragments, refusals };
}

export const claudeIntegrationAdapter: TargetIntegrationAdapter = {
  target: 'claude-code',
  plan: planClaudeIntegrations,
};
