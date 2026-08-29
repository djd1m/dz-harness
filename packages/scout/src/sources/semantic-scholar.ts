/**
 * Semantic Scholar academic paper scanner.
 *
 * API: GET https://api.semanticscholar.org/graph/v1/paper/search?query=...
 * Free, 1 req/sec (auth), 5000/5min (unauth). JSON response.
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';

const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';

interface S2Paper {
  readonly paperId: string;
  readonly title: string;
  readonly abstract: string | null;
  readonly citationCount: number;
  readonly year: number;
  readonly url: string;
}

const QUERIES = ['agent tool use LLM', 'agentic workflows code generation', 'MCP model context protocol'];

/** Fetch with retry on 429. */
async function fetchWithRetry(url: string, maxRetries = 2): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'dz-scout/0.6.0' } });
      if (resp.status === 429) {
        const wait = (attempt + 1) * 5000; // 5s, 10s
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch { return null; }
  }
  return null;
}

/** Search Semantic Scholar for agent-skill-related papers. */
export async function scanSemanticScholar(options: { maxPerQuery?: number | undefined; year?: string | undefined } = {}): Promise<RepoProfile[]> {
  const max = options.maxPerQuery ?? 10;
  const yearFilter = options.year ?? '2025-2026';
  const seen = new Set<string>();
  const results: RepoProfile[] = [];

  for (const query of QUERIES) {
    try {
      const url = `${S2_API}?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,citationCount,year,url&year=${yearFilter}&limit=${max}`;
      const resp = await fetchWithRetry(url);
      if (!resp || !resp.ok) continue;
      const data = (await resp.json()) as { data: S2Paper[] };

      for (const paper of (data.data ?? [])) {
        if (seen.has(paper.paperId)) continue;
        seen.add(paper.paperId);

        results.push({
          fullName: `paper/${paper.paperId}`,
          url: paper.url ?? `https://www.semanticscholar.org/paper/${paper.paperId}`,
          description: paper.title + (paper.abstract ? ` — ${paper.abstract.slice(0, 150)}` : ''),
          stars: paper.citationCount,
          forks: 0,
          lastCommit: `${paper.year}-01-01T00:00:00Z`,
          topics: ['academic-paper', 'semantic-scholar'],
          license: null,
          skillFormats: [],
          skillCount: 0,
          novelSkills: [],
          relevanceScore: Math.min(100, 50 + paper.citationCount / 5),
          recommendation: paper.citationCount >= 50 ? 'integrate' : paper.citationCount >= 10 ? 'monitor' : 'skip' as const,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
      }

      // Respect rate limit: 1 req/sec
      await new Promise((r) => setTimeout(r, 1100));
    } catch { /* skip on error */ }
  }

  return results.sort((a, b) => b.stars - a.stars);
}
