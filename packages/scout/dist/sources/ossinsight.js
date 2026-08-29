/**
 * OSSInsight trending repos scanner.
 *
 * API: GET https://api.ossinsight.io/v1/trends/repos/?period=past_week&language=All
 * No auth, 600 req/hr, returns top 100 trending repos by star velocity + activity.
 *
 * @packageDocumentation
 */
import { detectFormats, recommend } from '../analyzer.js';
const OSSINSIGHT_API = 'https://api.ossinsight.io/v1/trends/repos/';
/** Fetch trending repos from OSSInsight, filtered by agent-skill signals. */
export async function scanOssInsightTrending(options = {}) {
    const period = options.period ?? 'past_week';
    const language = options.language ?? 'All';
    const max = options.maxResults ?? 100;
    try {
        const url = `${OSSINSIGHT_API}?period=${period}&language=${encodeURIComponent(language)}`;
        const resp = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'dz-scout/0.4.0' },
        });
        if (!resp.ok)
            return [];
        const json = (await resp.json());
        const rows = json.data?.rows ?? [];
        // Filter for agent-skill-related repos by description keywords
        const agentKeywords = ['skill', 'agent', 'mcp', 'claude', 'codex', 'harness', 'plugin', 'tool-use', 'ai-agent'];
        const results = [];
        for (const row of rows) {
            const desc = (row.description ?? '').toLowerCase();
            const name = row.repo_name.toLowerCase();
            const isRelevant = agentKeywords.some((kw) => desc.includes(kw) || name.includes(kw));
            if (!isRelevant)
                continue;
            const stars = parseInt(row.stars, 10) || 0;
            const forks = parseInt(row.forks, 10) || 0;
            const score = parseFloat(row.total_score) || 0;
            // Create a mock GitHubSearchItem for format detection
            const mockItem = {
                full_name: row.repo_name,
                html_url: `https://github.com/${row.repo_name}`,
                description: row.description,
                stargazers_count: stars,
                forks_count: forks,
                pushed_at: new Date().toISOString(),
                topics: [],
                license: null,
                default_branch: 'main',
            };
            const formats = detectFormats(mockItem);
            const relevanceScore = Math.min(100, Math.round(50 + score / 100));
            results.push({
                fullName: row.repo_name,
                url: `https://github.com/${row.repo_name}`,
                description: row.description ?? '',
                stars,
                forks,
                lastCommit: new Date().toISOString(),
                topics: ['ossinsight-trending', ...(row.primary_language ? [row.primary_language.toLowerCase()] : [])],
                license: null,
                skillFormats: formats,
                skillCount: formats.length > 0 ? 1 : 0,
                novelSkills: [],
                relevanceScore,
                recommendation: recommend(relevanceScore, stars),
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
            });
            if (results.length >= max)
                break;
        }
        return results;
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=ossinsight.js.map