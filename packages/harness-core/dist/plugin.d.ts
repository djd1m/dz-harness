/**
 * Claude Plugin format generator — creates .claude-plugin/ from harness inventory.
 *
 * Generates plugin.json and marketplace.json compatible with the Claude
 * plugin ecosystem (pi-claude-marketplace, skill-hub, anthropics/claude-plugins-official).
 *
 * @packageDocumentation
 */
import type { Registry } from './registry.js';
/** Plugin manifest. */
export interface PluginManifest {
    readonly name: string;
    readonly displayName: string;
    readonly description: string;
    readonly version: string;
    readonly repository: string;
    readonly license: string;
    readonly keywords: readonly string[];
    readonly skillPacks: readonly {
        name: string;
        skills: number;
        description: string;
    }[];
    readonly totalSkills: number;
    /** Explicit skill directory paths (relative to plugin source) for discovery. */
    readonly skills: readonly string[];
}
/** Generate .claude-plugin/ directory from registry. */
export declare function generatePlugin(projectRoot: string, registry: Registry, opts?: {
    version?: string | undefined;
    repository?: string | undefined;
}): {
    pluginJsonPath: string;
    marketplaceJsonPath: string;
};
//# sourceMappingURL=plugin.d.ts.map