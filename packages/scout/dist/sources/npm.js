/**
 * npm Registry scanner — searches for agent-skill packages.
 *
 * API: GET /-/v1/search?text=keywords:<kw>&size=N (no auth, free)
 *
 * @packageDocumentation
 */
const NPM_API = 'https://registry.npmjs.org/-/v1/search';
const KEYWORDS = ['mcp-server', 'claude-code', 'agent-skills', 'agentskills-io', 'claude-plugin', 'claude-code-plugin'];
/** Search npm for agent-skill packages. Returns deduplicated RepoProfiles. */
export async function scanNpm(options = {}) {
    const max = options.maxPerKeyword ?? 20;
    const seen = new Set();
    const results = [];
    for (const kw of KEYWORDS) {
        try {
            const url = `${NPM_API}?text=keywords:${encodeURIComponent(kw)}&size=${max}`;
            const resp = await fetch(url, { headers: { 'User-Agent': 'dz-scout/0.3.0' } });
            if (!resp.ok)
                continue;
            const data = (await resp.json());
            for (const obj of data.objects) {
                const pkg = obj.package;
                if (seen.has(pkg.name))
                    continue;
                seen.add(pkg.name);
                results.push({
                    fullName: pkg.name,
                    url: pkg.links.npm,
                    description: pkg.description ?? '',
                    stars: Math.round(obj.score.final * 100),
                    forks: 0,
                    lastCommit: new Date().toISOString(),
                    topics: [...pkg.keywords],
                    license: null,
                    skillFormats: pkg.keywords.some((k) => k === 'mcp-server') ? ['mcp-server']
                        : pkg.keywords.some((k) => k === 'claude-plugin' || k === 'claude-code-plugin') ? ['claude-plugin']
                            : ['agentskills-io'],
                    skillCount: 1,
                    novelSkills: [],
                    relevanceScore: Math.round(obj.score.final * 100),
                    recommendation: obj.score.final >= 0.7 ? 'integrate' : obj.score.final >= 0.4 ? 'monitor' : 'skip',
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                });
            }
        }
        catch { /* skip on error */ }
    }
    return results;
}
//# sourceMappingURL=npm.js.map