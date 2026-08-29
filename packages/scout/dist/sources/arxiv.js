/**
 * arXiv preprint scanner.
 *
 * API: GET http://export.arxiv.org/api/query?search_query=...
 * Free, no auth, 3s delay between calls. Atom/XML response.
 *
 * @packageDocumentation
 */
const ARXIV_API = 'http://export.arxiv.org/api/query';
const QUERIES = [
    'ti:"agent skills" AND cat:cs.AI',
    'ti:"tool use" AND ti:"LLM" AND cat:cs.AI',
    'ti:"agentic" AND ti:"workflow" AND cat:cs.SE',
];
/** Parse arXiv Atom XML response (minimal — extract entries). */
function parseAtom(xml) {
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1] ?? '';
        const id = entry.match(/<id>(.*?)<\/id>/)?.[1] ?? '';
        const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
        const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
        const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? '';
        const link = entry.match(/<link.*?href="(https:\/\/arxiv\.org\/abs\/[^"]*)".*?\/>/)?.[1] ?? id;
        entries.push({ id, title, summary, published, link });
    }
    return entries;
}
/** Fetch with retry on rate limit. */
async function fetchWithRetry(url, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'dz-scout/0.6.0' } });
            if (resp.status === 429 || (await resp.clone().text()).includes('Rate exceeded')) {
                const wait = (attempt + 1) * 5000;
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            return resp;
        }
        catch {
            return null;
        }
    }
    return null;
}
/** Search arXiv for agent-skill-related preprints. */
export async function scanArxiv(options = {}) {
    const max = options.maxPerQuery ?? 10;
    const seen = new Set();
    const results = [];
    for (const query of QUERIES) {
        try {
            const url = `${ARXIV_API}?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
            const resp = await fetchWithRetry(url);
            if (!resp || !resp.ok)
                continue;
            const xml = await resp.text();
            const entries = parseAtom(xml);
            for (const entry of entries) {
                if (seen.has(entry.id))
                    continue;
                seen.add(entry.id);
                results.push({
                    fullName: `arxiv/${entry.id.split('/').pop() ?? entry.id}`,
                    url: entry.link,
                    description: entry.title + (entry.summary ? ` — ${entry.summary.slice(0, 120)}` : ''),
                    stars: 0,
                    forks: 0,
                    lastCommit: entry.published,
                    topics: ['arxiv', 'academic-paper'],
                    license: null,
                    skillFormats: [],
                    skillCount: 0,
                    novelSkills: [],
                    relevanceScore: 55, // base score for arXiv papers — ideas, not tools
                    recommendation: 'monitor',
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                });
            }
            // Respect 3s delay
            await new Promise((r) => setTimeout(r, 3100));
        }
        catch { /* skip on error */ }
    }
    return results;
}
//# sourceMappingURL=arxiv.js.map