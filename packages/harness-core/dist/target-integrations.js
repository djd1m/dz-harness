/** Exhaustive target companion policy and once-per-install manifest aggregation. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeIntegrationAdapter } from '@dzhechkov/adapter-claude';
import { INTEGRATION_MANIFEST_MAX_BYTES, INTEGRATION_REGISTRATION_MAX_COUNT, canonicalIntegrationJson, integrationManifestDigest, parseHarnessIntegrationManifestJson, } from '@dzhechkov/core';
import { TARGET_NAMES } from './targets.js';
const refusedAdapter = (target) => ({
    target,
    plan(manifest) {
        const refusals = [];
        if (Object.keys(manifest.mcpServers ?? {}).length > 0) {
            refusals.push({ component: 'mcp', reasonCode: TARGET_INTEGRATION_POLICY[target].mcp.reasonCode ?? 'NO_QUALIFYING_LIVE_RECEIPT', remediation: 'run dz integrations-verify for this exact target product and version' });
        }
        if ((manifest.hooks?.length ?? 0) > 0) {
            refusals.push({ component: 'hooks', reasonCode: TARGET_INTEGRATION_POLICY[target].hooks.reasonCode ?? 'NO_QUALIFYING_LIVE_RECEIPT', remediation: 'run dz integrations-verify with a hook canary and negative control' });
        }
        return { fragments: [], refusals };
    },
});
/** Closed 10×2 policy. No fallback/default is permitted. */
export const TARGET_INTEGRATION_POLICY = {
    'claude-code': {
        mcp: { disposition: 'receipt', receiptVersion: '2.1.235' },
        hooks: { disposition: 'refused', reasonCode: 'NO_ACTIVATION_RECEIPT' },
    },
    codex: {
        mcp: { disposition: 'refused', reasonCode: 'PROJECT_CARRIER_NOT_OBSERVED' },
        hooks: { disposition: 'legacy-post-write', reasonCode: 'CURRENT_LIVE_CHECK_FAILED' },
    },
    cursor: {
        mcp: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
        hooks: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
    },
    copilot: {
        mcp: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
        hooks: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
    },
    windsurf: {
        mcp: { disposition: 'refused', reasonCode: 'PRODUCT_SURFACE_AMBIGUOUS' },
        hooks: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
    },
    gemini: {
        mcp: { disposition: 'refused', reasonCode: 'NO_QUALIFYING_LIVE_RECEIPT' },
        hooks: { disposition: 'refused', reasonCode: 'NO_QUALIFYING_LIVE_RECEIPT' },
    },
    opencode: {
        mcp: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
        hooks: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
    },
    openclaude: {
        mcp: { disposition: 'refused', reasonCode: 'PROJECT_CARRIER_NOT_DOCUMENTED' },
        hooks: { disposition: 'refused', reasonCode: 'TARGET_BINARY_UNAVAILABLE' },
    },
    hermes: {
        mcp: { disposition: 'refused', reasonCode: 'LIVE_PROBE_TIMEOUT' },
        hooks: { disposition: 'refused', reasonCode: 'NO_ACTIVATION_RECEIPT' },
    },
    'agents-md': {
        mcp: { disposition: 'refused', reasonCode: 'NO_RUNTIME_SURFACE' },
        hooks: { disposition: 'refused', reasonCode: 'NO_RUNTIME_SURFACE' },
    },
};
export const TARGET_INTEGRATIONS = Object.fromEntries(TARGET_NAMES.map((target) => [target, target === 'claude-code' ? claudeIntegrationAdapter : refusedAdapter(target)]));
export class IntegrationManifestError extends Error {
    manifestPath;
    code = 'MANIFEST_INVALID';
    constructor(manifestPath, message) {
        super(`${manifestPath}: ${message}`);
        this.manifestPath = manifestPath;
        this.name = 'IntegrationManifestError';
    }
}
/** Load, validate and aggregate every adjacent manifest before target effects. */
export function aggregateIntegrationManifests(sources) {
    const manifests = [];
    for (const source of sources) {
        const path = join(source.skillDir, source.skillId, 'INTEGRATIONS.json');
        if (!existsSync(path))
            continue;
        try {
            manifests.push({ path, value: parseHarnessIntegrationManifestJson(readFileSync(path, 'utf8')) });
        }
        catch (error) {
            throw new IntegrationManifestError(path, error instanceof Error ? error.message : String(error));
        }
    }
    if (manifests.length === 0)
        return { manifest: undefined, digest: undefined, sourcePaths: [] };
    const mcp = Object.create(null);
    const hooks = new Map();
    for (const source of manifests) {
        for (const [id, intent] of Object.entries(source.value.mcpServers ?? {})) {
            const previous = mcp[id];
            if (previous !== undefined && canonicalIntegrationJson(previous) !== canonicalIntegrationJson(intent)) {
                throw new IntegrationManifestError(source.path, `conflicting MCP registration id ${JSON.stringify(id)}`);
            }
            mcp[id] = intent;
        }
        for (const hook of source.value.hooks ?? []) {
            const previous = hooks.get(hook.id);
            if (previous !== undefined && canonicalIntegrationJson(previous) !== canonicalIntegrationJson(hook)) {
                throw new IntegrationManifestError(source.path, `conflicting hook registration id ${JSON.stringify(hook.id)}`);
            }
            hooks.set(hook.id, hook);
        }
    }
    const aggregate = {
        version: 1,
        ...(Object.keys(mcp).length > 0 ? { mcpServers: Object.fromEntries(Object.entries(mcp).sort(([a], [b]) => a.localeCompare(b))) } : {}),
        ...(hooks.size > 0 ? { hooks: [...hooks.values()].sort((a, b) => a.id.localeCompare(b.id)) } : {}),
    };
    const count = Object.keys(aggregate.mcpServers ?? {}).length + (aggregate.hooks?.length ?? 0);
    if (count > INTEGRATION_REGISTRATION_MAX_COUNT) {
        throw new IntegrationManifestError('<aggregate>', `final aggregate has ${count} registrations; maximum is ${INTEGRATION_REGISTRATION_MAX_COUNT}`);
    }
    const aggregateBytes = Buffer.byteLength(canonicalIntegrationJson(aggregate), 'utf8');
    if (aggregateBytes > INTEGRATION_MANIFEST_MAX_BYTES) {
        throw new IntegrationManifestError('<aggregate>', `final aggregate exceeds ${INTEGRATION_MANIFEST_MAX_BYTES} UTF-8 bytes`);
    }
    return {
        manifest: aggregate,
        digest: integrationManifestDigest([aggregate]),
        sourcePaths: manifests.map((source) => source.path),
    };
}
export function notRequestedOutcomes(target) {
    return [
        { target, component: 'mcp', status: 'not-requested', registrations: [] },
        { target, component: 'hooks', status: 'not-requested', registrations: [] },
    ];
}
export function refusedOutcome(target, component, reasonCode, remediation) {
    return { target, component, status: 'refused', registrations: [], reasonCode, remediation };
}
/** Static synchronous outcomes for Gemini/agents-md and other refusal-only seams. */
export function staticPolicyOutcomes(target, manifest, noHooks = false) {
    if (manifest === undefined)
        return notRequestedOutcomes(target);
    const mcpRequested = Object.keys(manifest.mcpServers ?? {}).length > 0;
    const hooksRequested = (manifest.hooks?.length ?? 0) > 0 && !noHooks;
    const mcpCell = TARGET_INTEGRATION_POLICY[target].mcp;
    const hookCell = TARGET_INTEGRATION_POLICY[target].hooks;
    return [
        mcpRequested
            ? refusedOutcome(target, 'mcp', mcpCell.reasonCode ?? 'NO_QUALIFYING_LIVE_RECEIPT', 'run dz integrations-verify for an exact-version receipt')
            : { target, component: 'mcp', status: 'not-requested', registrations: [] },
        hooksRequested
            ? refusedOutcome(target, 'hooks', hookCell.reasonCode ?? 'NO_ACTIVATION_RECEIPT', 'run dz integrations-verify with a hook canary and negative control')
            : { target, component: 'hooks', status: 'not-requested', registrations: [] },
    ];
}
//# sourceMappingURL=target-integrations.js.map