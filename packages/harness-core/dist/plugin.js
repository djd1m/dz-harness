/**
 * Claude Plugin format generator — creates .claude-plugin/ from harness inventory.
 *
 * Generates plugin.json and marketplace.json compatible with the Claude
 * plugin ecosystem (pi-claude-marketplace, skill-hub, anthropics/claude-plugins-official).
 *
 * @packageDocumentation
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
/** id→path index built from the registry, so the generator never guesses a layout. */
function skillPathIndex(registry) {
    const m = new Map();
    for (const e of registry.entries)
        if (e.path !== undefined && e.path !== '')
            m.set(`${e.pack}/${e.id}`, e.path);
    return m;
}
/** Generate .claude-plugin/ directory from registry. */
export function generatePlugin(projectRoot, registry, opts = {}) {
    const pluginDir = join(projectRoot, '.claude-plugin');
    mkdirSync(pluginDir, { recursive: true });
    // Build skill pack info from registry. Track the skill ids per pack so we can
    // emit explicit `skills` path arrays — Claude Code only discovers a plugin's
    // skills when they live under a `skills/` dir OR are listed by path in the
    // manifest. Our pack layout keeps SKILL.md dirs at the package root
    // (`skills-<pack>/<id>/SKILL.md`), so without explicit paths every installed
    // plugin reported "Skills (0)".
    const packMap = new Map();
    const packSkillIds = new Map();
    for (const entry of registry.entries) {
        const count = packMap.get(entry.pack) ?? 0;
        packMap.set(entry.pack, count + 1);
        const ids = packSkillIds.get(entry.pack) ?? [];
        ids.push(entry.id);
        packSkillIds.set(entry.pack, ids);
    }
    const packDescriptions = {
        'skills-devops': 'Infrastructure, CI/CD, security, testing, APIs, databases',
        'skills-mcp': 'MCP server integrations — search, email, productivity, memory',
        'skills-web3': 'DeFi, blockchain, crypto — quicknode, zerion, symbiosis',
        'skills-qe': 'Quality engineering — test generation, coverage, chaos',
        'skills-meta': 'Development process — explore, feature-adr, knowledge-extractor',
    };
    const skillPacks = [...packMap.entries()].map(([name, count]) => ({
        // `pack` is the REAL directory name; `name` is only the display short form. Deriving the key
        // back by re-adding the `skills-` prefix broke the moment the catalogue learned packs that
        // never had one (health-advisor, keysarium, …): the lookup missed and their entries listed
        // zero skills.
        pack: name,
        name: name.replace('skills-', ''),
        skills: count,
        description: packDescriptions[name] ?? `${count} skills`,
    }));
    const pathById = skillPathIndex(registry);
    // Explicit skill paths for the full-suite plugin (source `./`): every skill
    // dir across every pack, relative to the repo root. This is what makes
    // `claude plugin details` report the real skill count instead of 0.
    const allSkillPaths = [...packSkillIds.entries()]
        // Prefer the path the catalogue recorded; `<pack>/<id>` is only a fallback for entries built
        // before the field existed. Reconstructing it is what produced unresolvable paths for skills
        // that live under `skills/` or `templates/.claude/skills/`.
        .flatMap(([pack, ids]) => ids.map((id) => pathById.get(`${pack}/${id}`) ?? `packages/@dzhechkov/${pack}/${id}`))
        .sort();
    const pluginJson = {
        name: 'dz-harness-hub',
        displayName: 'DZ Harness Hub',
        description: `Cross-platform AI skill harness — ${registry.totalSkills} skills across ${registry.totalPacks} packs for 5 agent platforms.`,
        version: opts.version ?? '0.1.0',
        repository: opts.repository ?? 'https://github.com/djd1m/dz-harness-hub',
        license: 'MIT',
        keywords: ['agent-skills', 'agentskills.io', 'cross-platform', 'claude-plugin', ...registry.categories],
        skillPacks,
        totalSkills: registry.totalSkills,
        skills: allSkillPaths,
    };
    const marketplaceJson = {
        name: 'dz-harness-hub',
        description: pluginJson.description,
        owner: { name: 'dzhechko' },
        plugins: [
            {
                name: 'dz-harness-hub',
                displayName: 'DZ Harness Hub — Full Suite',
                source: './',
                description: pluginJson.description,
                repository: pluginJson.repository,
                license: 'MIT',
                keywords: pluginJson.keywords,
            },
            ...skillPacks.map((pack) => ({
                name: `dz-${pack.name}`,
                displayName: `DZ ${pack.name.charAt(0).toUpperCase() + pack.name.slice(1)} Skills`,
                source: `packages/@dzhechkov/${pack.pack}`,
                description: `${pack.skills} ${pack.name} skills — ${pack.description}`,
                keywords: [pack.name],
                // Listed relative to `source` — required for Claude Code to discover them. The path comes
                // from the catalogue rather than from the assumption "skill dirs sit at the pack root",
                // which holds for `skills-*` packs and for neither of the two other layouts.
                skills: (packSkillIds.get(pack.pack) ?? []).slice().sort().map((id) => {
                    const full = pathById.get(`${pack.pack}/${id}`);
                    const base = `packages/@dzhechkov/${pack.pack}/`;
                    return full !== undefined && full.startsWith(base) ? `./${full.slice(base.length)}` : `./${id}`;
                }),
            })),
        ],
    };
    const pluginJsonPath = join(pluginDir, 'plugin.json');
    const marketplaceJsonPath = join(pluginDir, 'marketplace.json');
    writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2));
    writeFileSync(marketplaceJsonPath, JSON.stringify(marketplaceJson, null, 2));
    return { pluginJsonPath, marketplaceJsonPath };
}
//# sourceMappingURL=plugin.js.map