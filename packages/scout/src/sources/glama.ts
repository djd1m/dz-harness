/**
 * Glama.ai MCP server scanner.
 *
 * API: GET https://glama.ai/api/mcp/v1/servers/ (REST, no auth)
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';
import { SourceRefusal, fetchWithBudget, isSourceRefusal } from './source-outcome.js';

const GLAMA_API = 'https://glama.ai/api/mcp/v1/servers/';

interface GlamaServer {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly url: string;
  readonly stars?: number;
  readonly category?: string;
}

/** Query Glama.ai for MCP servers. */
export async function scanGlama(options: { limit?: number } = {}): Promise<RepoProfile[]> {
  const limit = options.limit ?? 30;

  try {
    // Try multiple API formats — Glama's API structure may vary
    const urls = [
      `${GLAMA_API}?limit=${limit}`,
      `https://glama.ai/api/mcp/v1/servers?limit=${limit}`,
      `https://glama.ai/api/mcp/servers?limit=${limit}`,
    ];

    // ЗДЕСЬ ОБЩЕЕ ПРАВИЛО ЧАСТИЧНОГО УСПЕХА НЕ ПРИМЕНЯЕТСЯ, и это осознанно. Три адреса — не три
    // части одного опроса, а ПРОБЫ одного и того же: у Glama форма API менялась, и 404 на первом
    // варианте — ожидаемый ход поиска, а не потеря данных. Поэтому источник считается отказавшим
    // только если отказали ВСЕ пробы; ответ хотя бы одной — измерение, даже если он пуст.
    let servers: GlamaServer[] = [];
    let answered = false;
    const refusals: SourceRefusal[] = [];
    for (const url of urls) {
      try {
        const resp = await fetchWithBudget(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'dz-scout/0.5.0' },
        });
        const data = await resp.json() as any;
        answered = true;
        const items = Array.isArray(data) ? data :
                      data.servers ? data.servers :
                      data.data ? data.data :
                      data.items ? data.items : [];
        if (items.length > 0) { servers = items; break; }
      } catch (err) {
        refusals.push(isSourceRefusal(err)
          ? err
          : new SourceRefusal('failed', `glama ${url}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`));
        continue;
      }
    }

    const firstRefusal = refusals[0];
    if (!answered && firstRefusal !== undefined) throw firstRefusal;
    if (servers.length === 0) return [];   // ответили и ничего не показали — измеренный ноль

    return servers.map((s) => ({
      fullName: `glama/${s.slug ?? s.name}`,
      url: s.url ?? `https://glama.ai/mcp/servers/${s.slug}`,
      description: s.description ?? s.name,
      stars: s.stars ?? 0,
      forks: 0,
      lastCommit: new Date().toISOString(),
      topics: ['mcp-server', 'glama', ...(s.category ? [s.category] : [])],
      license: null,
      skillFormats: ['mcp-server'] as const,
      skillCount: 1,
      novelSkills: [],
      relevanceScore: Math.min(100, 60 + (s.stars ?? 0) / 10),
      recommendation: (s.stars ?? 0) >= 50 ? 'integrate' : 'monitor' as const,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    }));
  } catch (err) {
    if (isSourceRefusal(err)) throw err;
    throw new SourceRefusal('failed', `glama: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
  }
}
