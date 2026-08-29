/**
 * Smithery.ai MCP server scanner.
 *
 * API: https://smithery.ai (REST, no auth documented)
 * "Docker Hub for MCP" — 7,300+ servers.
 *
 * @packageDocumentation
 */
const SMITHERY_API = 'https://registry.smithery.ai/servers';
/** Query Smithery.ai for MCP servers. */
export async function scanSmithery(options = {}) {
    const limit = options.limit ?? 25;
    const query = options.query ?? '';
    try {
        const url = query
            ? `${SMITHERY_API}?q=${encodeURIComponent(query)}&pageSize=${limit}`
            : `${SMITHERY_API}?pageSize=${limit}`;
        const resp = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'dz-scout/0.5.0' },
        });
        if (!resp.ok)
            return [];
        const data = (await resp.json());
        const servers = Array.isArray(data) ? data : (data.servers ?? []);
        return servers.map((s) => ({
            fullName: `smithery/${s.qualifiedName ?? s.displayName}`,
            url: s.homepage ?? `https://smithery.ai/server/${s.qualifiedName}`,
            description: s.description ?? s.displayName ?? '',
            stars: s.useCount ?? 0,
            forks: 0,
            lastCommit: s.createdAt ?? new Date().toISOString(),
            topics: ['mcp-server', 'smithery'],
            license: null,
            skillFormats: ['mcp-server'],
            skillCount: 1,
            novelSkills: [],
            relevanceScore: Math.min(100, 65 + (s.useCount ?? 0) / 20),
            recommendation: (s.useCount ?? 0) >= 100 ? 'integrate' : 'monitor',
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
        }));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=smithery.js.map