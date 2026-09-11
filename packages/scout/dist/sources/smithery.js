/**
 * Smithery.ai MCP server scanner.
 *
 * API: https://smithery.ai (REST, no auth documented)
 * "Docker Hub for MCP" — 7,300+ servers.
 *
 * @packageDocumentation
 */
import { SourceRefusal, fetchWithBudget, isSourceRefusal } from './source-outcome.js';
const SMITHERY_API = 'https://registry.smithery.ai/servers';
/** Query Smithery.ai for MCP servers. */
export async function scanSmithery(options = {}) {
    const limit = options.limit ?? 25;
    const query = options.query ?? '';
    // ОДНО обращение — правило частичного успеха не нужно: отказ здесь и есть отказ источника.
    try {
        const url = query
            ? `${SMITHERY_API}?q=${encodeURIComponent(query)}&pageSize=${limit}`
            : `${SMITHERY_API}?pageSize=${limit}`;
        // Прежде `if (!resp.ok) return []` превращал ответ реестра кодом ошибки в «серверов нет».
        const resp = await fetchWithBudget(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'dz-scout/0.5.0' },
        });
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
    catch (err) {
        // Перехватил — обработай по типу или пробрось. Наш отказ уходит наверх нетронутым: его форма
        // и есть измерение. Чужое исключение становится `failed`, а не пустотой.
        if (isSourceRefusal(err))
            throw err;
        throw new SourceRefusal('failed', `smithery: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
    }
}
//# sourceMappingURL=smithery.js.map