/**
 * Hacker News Algolia scanner — searches for agent-skill stories.
 *
 * API: GET https://hn.algolia.com/api/v1/search?query=... (no auth, no rate limit)
 *
 * @packageDocumentation
 */
import { SourceRefusal, fetchWithBudget, isSourceRefusal, refuseIfNothingMeasured } from './source-outcome.js';
const HN_API = 'https://hn.algolia.com/api/v1/search';
const QUERIES = ['claude code skills', 'mcp server', 'agent skills SKILL.md'];
/** Search HN for agent-skill stories. Returns as RepoProfiles with HN metadata. */
export async function scanHN(options = {}) {
    const max = options.maxPerQuery ?? 10;
    const seen = new Set();
    const results = [];
    const refusals = [];
    let measuredCalls = 0;
    for (const query of QUERIES) {
        try {
            let url = `${HN_API}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${max}`;
            if (options.since) {
                const ts = Math.floor(new Date(options.since).getTime() / 1000);
                url += `&numericFilters=created_at_i>${ts}`;
            }
            // Прежде ответ кодом ошибки был неотличим от «по этому запросу ничего»: `if (!resp.ok)
            // continue` молчал, и витрина показывала пустоту как измеренную.
            const resp = await fetchWithBudget(url, { headers: { 'User-Agent': 'dz-scout/0.3.0' } });
            const data = (await resp.json());
            measuredCalls += 1;
            for (const hit of data.hits) {
                const id = hit.objectID;
                if (seen.has(id))
                    continue;
                seen.add(id);
                results.push({
                    fullName: `hn/${hit.objectID}`,
                    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
                    description: hit.title,
                    // Оговорка та же, что у npm: у истории нет звёзд и форков. Здесь в этих полях лежат
                    // ГОЛОСА и КОММЕНТАРИИ — величины другой природы, сравнивать их со звёздами нельзя.
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
        catch (err) {
            refusals.push(isSourceRefusal(err)
                ? err
                : new SourceRefusal('failed', `HN «${query}»: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`));
        }
    }
    refuseIfNothingMeasured(measuredCalls, refusals, 'scanHN');
    return results.sort((a, b) => b.stars - a.stars);
}
//# sourceMappingURL=hn.js.map