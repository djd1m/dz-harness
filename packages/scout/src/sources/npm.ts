/**
 * npm Registry scanner — searches for agent-skill packages.
 *
 * API: GET /-/v1/search?text=keywords:<kw>&size=N (no auth, free)
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';

const NPM_API = 'https://registry.npmjs.org/-/v1/search';
const KEYWORDS = ['mcp-server', 'claude-code', 'agent-skills', 'agentskills-io', 'claude-plugin', 'claude-code-plugin'];

interface NpmPackage {
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly links: { readonly npm: string; readonly repository?: string };
  readonly publisher: { readonly username: string };
  readonly version: string;
}

interface NpmSearchResult {
  readonly package: NpmPackage;
  readonly score: { readonly final: number };
}

/** Search npm for agent-skill packages. Returns deduplicated RepoProfiles. */
export async function scanNpm(options: { maxPerKeyword?: number } = {}): Promise<RepoProfile[]> {
  const max = options.maxPerKeyword ?? 20;
  const seen = new Set<string>();
  const results: RepoProfile[] = [];

  for (const kw of KEYWORDS) {
    try {
      const url = `${NPM_API}?text=keywords:${encodeURIComponent(kw)}&size=${max}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'dz-scout/0.3.0' } });
      if (!resp.ok) continue;
      const data = (await resp.json()) as { objects: NpmSearchResult[] };

      for (const obj of data.objects) {
        const pkg = obj.package;
        if (seen.has(pkg.name)) continue;
        seen.add(pkg.name);

        results.push({
          fullName: pkg.name,
          url: pkg.links.npm,
          description: pkg.description ?? '',
          stars: Math.round(obj.score.final * 100),
          forks: 0,
          lastCommit: new Date().toISOString(),
          topics: [...pkg.keywords],
          license: null,
          skillFormats: pkg.keywords.some((k) => k === 'mcp-server') ? ['mcp-server']
            : pkg.keywords.some((k) => k === 'claude-plugin' || k === 'claude-code-plugin') ? ['claude-plugin']
            : ['agentskills-io'],
          skillCount: 1,
          novelSkills: [],
          relevanceScore: Math.round(obj.score.final * 100),
          recommendation: obj.score.final >= 0.7 ? 'integrate' : obj.score.final >= 0.4 ? 'monitor' : 'skip',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
      }
    } catch { /* skip on error */ }
  }

  return results;
}
