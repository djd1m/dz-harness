/**
 * Multi-source aggregator — runs all scanners and deduplicates.
 *
 * @packageDocumentation
 */
import { scanGitHub } from '../scanner.js';
import { analyzeRepo } from '../analyzer.js';
import { scanNpm } from './npm.js';
import { scanHN } from './hn.js';
import { scanMcpRegistry } from './mcp-registry.js';
import { scanGlama } from './glama.js';
import { scanOssInsightTrending } from './ossinsight.js';
import { scanSmithery } from './smithery.js';
import { scanSemanticScholar } from './semantic-scholar.js';
import { scanArxiv } from './arxiv.js';
import { scanEcc } from './ecc.js';
import { scanAgentbox } from './agentbox.js';
/** Aggregate results from all sources, deduplicated by fullName. */
export async function scanAllSources(options = {}) {
    const results = [];
    const seen = new Set();
    const totals = {
        github: 0, npm: 0, hackernews: 0, 'mcp-registry': 0, glama: 0,
        'ossinsight-trending': 0, smithery: 0, 'semantic-scholar': 0, arxiv: 0, ecc: 0, agentbox: 0,
    };
    const statuses = {
        github: { health: 'ok' }, npm: { health: 'ok' }, hackernews: { health: 'ok' },
        'mcp-registry': { health: 'ok' }, glama: { health: 'ok' }, 'ossinsight-trending': { health: 'ok' },
        smithery: { health: 'ok' }, 'semantic-scholar': { health: 'ok' }, arxiv: { health: 'ok' },
        ecc: { health: 'ok' }, agentbox: { health: 'ok' },
    };
    const failed = (source, err) => {
        const raw = err instanceof Error ? err.message : String(err);
        statuses[source] = { health: 'failed', reason: raw.split('\n')[0]?.slice(0, 160) ?? 'unknown failure' };
    };
    function addResults(items, source) {
        for (const item of items) {
            totals[source]++;
            if (!seen.has(item.fullName)) {
                seen.add(item.fullName);
                results.push({ ...item, source });
            }
        }
    }
    // Phase 1: Fast sources (no rate limit delays) — run in parallel
    const fastSettled = await Promise.allSettled([
        scanGitHub(options).then(({ items }) => items.map(analyzeRepo)),
        scanNpm({ maxPerKeyword: 15 }),
        scanHN({ maxPerQuery: 10, since: options.since }),
        scanMcpRegistry({ limit: 20 }),
        scanGlama({ limit: 20 }),
        scanOssInsightTrending({ period: 'past_week' }),
        scanSmithery({ limit: 20 }),
        scanEcc({ limit: 100 }),
        scanAgentbox({ limit: 100 }),
    ]);
    const fastSources = ['github', 'npm', 'hackernews', 'mcp-registry', 'glama', 'ossinsight-trending', 'smithery', 'ecc', 'agentbox'];
    for (let i = 0; i < fastSettled.length; i++) {
        const result = fastSettled[i];
        const source = fastSources[i];
        // `allSettled` never rejects, which is exactly how a 401 became a silent zero. The rejection is
        // now RECORDED against its source instead of being dropped on the floor.
        if (result.status === 'fulfilled')
            addResults(result.value, source);
        else
            failed(source, result.reason);
    }
    // Phase 2: Academic sources (have mandatory rate limit delays) — run sequentially
    try {
        const s2Results = await scanSemanticScholar({ maxPerQuery: 5 });
        addResults(s2Results, 'semantic-scholar');
    }
    catch (err) {
        failed('semantic-scholar', err);
    }
    try {
        const arxivResults = await scanArxiv({ maxPerQuery: 5 });
        addResults(arxivResults, 'arxiv');
    }
    catch (err) {
        failed('arxiv', err);
    }
    // Sort by relevance score descending
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return { results, totalBySource: totals, statusBySource: statuses };
}
//# sourceMappingURL=index.js.map