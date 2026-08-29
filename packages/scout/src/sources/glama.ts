/**
 * Glama.ai MCP server scanner.
 *
 * API: GET https://glama.ai/api/mcp/v1/servers/ (REST, no auth)
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';

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

    let servers: GlamaServer[] = [];
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'dz-scout/0.5.0' },
        });
        if (!resp.ok) continue;
        const data = await resp.json() as any;
        const items = Array.isArray(data) ? data :
                      data.servers ? data.servers :
                      data.data ? data.data :
                      data.items ? data.items : [];
        if (items.length > 0) { servers = items; break; }
      } catch { continue; }
    }

    if (servers.length === 0) return [];

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
  } catch {
    return [];
  }
}
