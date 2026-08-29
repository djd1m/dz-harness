/**
 * GitHub repository scanner — search + pagination + rate limiting.
 *
 * @packageDocumentation
 */

import type { GitHubSearchItem, ScanOptions } from './types.js';
import {
  createRateLimitState,
  getDelay,
  markRetry,
  markSuccess,
  shouldRetry,
  updateFromHeaders,
} from './rate-limiter.js';

const DEFAULT_TOPICS = [
  'agent-skills',
  'claude-code-skills',
  'agentskills-io',
  'mcp-server',
  'ai-harness',
  'claude-code-plugin',
];

const GITHUB_API = 'https://api.github.com';
const PER_PAGE = 30;

/** Build search query for a single topic. GitHub doesn't support OR between topic qualifiers. */
export function buildSearchQuery(topic: string, since?: string): string {
  const dateFilter = since ? ` pushed:>=${since}` : '';
  return `topic:${topic}${dateFilter}`;
}

/** Fetch one page of search results from GitHub. */
async function fetchPage(
  query: string,
  page: number,
  token?: string,
): Promise<{ items: GitHubSearchItem[]; totalCount: number; headers: Headers }> {
  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${PER_PAGE}&page=${page}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dz-scout/0.1.0',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    if (resp.status === 403 || resp.status === 429) {
      throw new Error(`rate-limited: ${resp.status}`);
    }
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { total_count: number; items: GitHubSearchItem[] };
  return { items: data.items, totalCount: data.total_count, headers: resp.headers };
}

/** Scan GitHub for repositories matching skill-related topics. Searches each topic separately and deduplicates. */
export async function scanGitHub(options: ScanOptions = {}): Promise<{
  items: GitHubSearchItem[];
  totalCount: number;
}> {
  const topics = options.topics ?? DEFAULT_TOPICS;
  const maxResults = options.maxResults ?? 100;
  const perTopic = Math.max(10, Math.ceil(maxResults / topics.length));
  const state = createRateLimitState();

  const seen = new Set<string>();
  const allItems: GitHubSearchItem[] = [];
  let totalCount = 0;

  for (const topic of topics) {
    const query = buildSearchQuery(topic, options.since);
    const maxPages = Math.ceil(perTopic / PER_PAGE);

    // Reset the retry budget per topic. Otherwise a topic that exhausts all
    // retries WITHOUT a success leaves retryCount at MAX_RETRIES, so every
    // subsequent topic breaks on its first transient error with zero retries —
    // silently under-reporting their results (audit #9). markSuccess zeroes it.
    markSuccess(state);

    for (let page = 1; page <= maxPages; page++) {
      const delay = getDelay(state);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));

      try {
        const result = await fetchPage(query, page, options.token);
        updateFromHeaders(state, result.headers);
        markSuccess(state);
        totalCount += result.totalCount;

        for (const item of result.items) {
          if (!seen.has(item.full_name)) {
            seen.add(item.full_name);
            allItems.push(item);
          }
        }

        if (result.items.length < PER_PAGE) break;
        if (allItems.length >= maxResults) break;
      } catch (error) {
        if (shouldRetry(state)) {
          markRetry(state);
          page--;
          continue;
        }
        // Skip this topic on persistent failure, continue with next
        break;
      }
    }

    if (allItems.length >= maxResults) break;
  }

  return { items: allItems.slice(0, maxResults), totalCount };
}
