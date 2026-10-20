/**
 * Semantic Scholar academic paper scanner.
 *
 * API: GET https://api.semanticscholar.org/graph/v1/paper/search?query=...
 * Free, 1 req/sec (auth), 5000/5min (unauth). JSON response.
 *
 * @packageDocumentation
 */
import { SourceRefusal, fetchJsonWithBudget, isSourceRefusal, refuseIfNothingMeasured } from './source-outcome.js';
const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const QUERIES = ['agent tool use LLM', 'agentic workflows code generation', 'MCP model context protocol'];
/**
 * Обращение с повтором на 429, с сохранением ФОРМЫ отказа.
 *
 * Прежде эта функция возвращала `null` на любой беде, а вызывающий писал `if (!resp) continue` —
 * то есть исчерпанный лимит запросов, обрыв связи и честный пустой ответ становились одним и тем
 * же. Теперь она БРОСАЕТ типизированный отказ, и его форма доезжает до аггрегатора.
 */
async function fetchWithRetry(url, maxRetries = 2) {
    let last;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Тело читается ПОД ТЕМ ЖЕ бюджетом, что и заголовки: ответ, у которого заголовки пришли за
            // миллисекунду, а тело не приходит никогда, иначе подвесил бы прогон навсегда.
            return await fetchJsonWithBudget(url, { headers: { 'User-Agent': 'dz-scout/0.6.0' } });
        }
        catch (err) {
            last = isSourceRefusal(err)
                ? err
                : new SourceRefusal('failed', `${url}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
            // Повторяется ТОЛЬКО исчерпанный лимит: 404 и 500 от повтора не выздоравливают, а ждать
            // на них значит тратить бюджет прогона на заведомо тот же ответ.
            if (last.status !== 429 || attempt === maxRetries)
                throw last;
            await new Promise((r) => setTimeout(r, (attempt + 1) * 5000)); // 5 с, затем 10 с
        }
    }
    throw last ?? new SourceRefusal('failed', `${url}: повторы исчерпаны без ответа`);
}
/** Search Semantic Scholar for agent-skill-related papers. */
export async function scanSemanticScholar(options = {}) {
    const max = options.maxPerQuery ?? 10;
    const yearFilter = options.year ?? '2025-2026';
    const seen = new Set();
    const results = [];
    const refusals = [];
    let measuredCalls = 0;
    for (const query of QUERIES) {
        try {
            const url = `${S2_API}?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,citationCount,year,url&year=${yearFilter}&limit=${max}`;
            const data = await fetchWithRetry(url);
            measuredCalls += 1;
            for (const paper of (data.data ?? [])) {
                if (seen.has(paper.paperId))
                    continue;
                seen.add(paper.paperId);
                results.push({
                    fullName: `paper/${paper.paperId}`,
                    url: paper.url ?? `https://www.semanticscholar.org/paper/${paper.paperId}`,
                    description: paper.title + (paper.abstract ? ` — ${paper.abstract.slice(0, 150)}` : ''),
                    // Оговорка (d5eac068): у статьи нет звёзд — здесь ЦИТИРОВАНИЯ, величина другой природы.
                    // Оговорка (d5eac068): у статьи нет звёзд — здесь ЦИТИРОВАНИЯ, величина другой природы.
                    stars: paper.citationCount,
                    forks: 0,
                    lastCommit: `${paper.year}-01-01T00:00:00Z`,
                    topics: ['academic-paper', 'semantic-scholar'],
                    license: null,
                    skillFormats: [],
                    skillCount: 0,
                    novelSkills: [],
                    relevanceScore: Math.min(100, 50 + paper.citationCount / 5),
                    recommendation: paper.citationCount >= 50 ? 'integrate' : paper.citationCount >= 10 ? 'monitor' : 'skip',
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                });
            }
            // Respect rate limit: 1 req/sec
            await new Promise((r) => setTimeout(r, 1100));
        }
        catch (err) {
            refusals.push(isSourceRefusal(err)
                ? err
                : new SourceRefusal('failed', `scanSemanticScholar: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`));
        }
    }
    refuseIfNothingMeasured(measuredCalls, refusals, 'scanSemanticScholar');
    return results.sort((a, b) => b.stars - a.stars);
}
//# sourceMappingURL=semantic-scholar.js.map