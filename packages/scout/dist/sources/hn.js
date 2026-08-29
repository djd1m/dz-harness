/**
 * Hacker News Algolia scanner — searches for agent-skill stories.
 *
 * API: GET https://hn.algolia.com/api/v1/search?query=... (no auth, no rate limit)
 *
 * @packageDocumentation
 */
const HN_API = 'https://hn.algolia.com/api/v1/search';
const QUERIES = ['claude code skills', 'mcp server', 'agent skills SKILL.md'];
/** Search HN for agent-skill stories. Returns as RepoProfiles with HN metadata. */
export async function scanHN(options = {}) {
    const max = options.maxPerQuery ?? 10;
    const seen = new Set();
    const results = [];
    for (const query of QUERIES) {
        try {
            let url = `${HN_API}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${max}`;
            if (options.since) {
                const ts = Math.floor(new Date(options.since).getTime() / 1000);
                url += `&numericFilters=created_at_i>${ts}`;
            }
            const resp = await fetch(url, { headers: { 'User-Agent': 'dz-scout/0.3.0' } });
            if (!resp.ok)
                continue;
            const data = (await resp.json());
            for (const hit of data.hits) {
                const id = hit.objectID;
                if (seen.has(id))
                    continue;
                seen.add(id);
                results.push({
                    fullName: `hn/${hit.objectID}`,
                    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
                    description: hit.title,
                    stars: hit.points,
                    forks: hit.num_comments,
                    lastCommit: hit.created_at,
                    topics: ['hacker-news'],
                    license: null,
                    skillFormats: [],
                    skillCount: 0,
                    novelSkills: [],
                    relevanceScore: Math.min(100, Math.round(hit.points / 5 + hit.num_comments / 3)),
                    recommendation: hit.points >= 100 ? 'integrate' : hit.points >= 30 ? 'monitor' : 'skip',
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                });
            }
        }
        catch { /* skip on error */ }
    }
    return results.sort((a, b) => b.stars - a.stars);
}
//# sourceMappingURL=hn.js.map