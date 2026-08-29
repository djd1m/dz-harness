/**
 * Our harness inventory — what we already have.
 *
 * @packageDocumentation
 */
/** All @dzhechkov/* package names. */
export declare const OUR_PACKAGES: readonly ["core", "memory", "harness-core", "harness-cli", "harness-presets", "mcp-server-tools", "adapter-claude", "adapter-codex", "adapter-opencode", "adapter-hermes", "skills-meta", "skills-qe", "skills-bto", "skills-analyst-manual", "skills-edu-site", "skills-transcript-site", "skills-feature-adr", "keysarium", "keysarium-core", "health-advisor", "p-replicator", "evidence-wiki", "sitedoc", "scout"];
/** Known skill IDs across all our packages. */
export declare const OUR_SKILL_IDS: Set<string>;
/** Check if a skill ID is novel (not in our inventory). */
export declare function isNovelSkill(skillId: string): boolean;
//# sourceMappingURL=inventory.d.ts.map