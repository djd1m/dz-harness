/**
 * Official MCP Registry scanner.
 *
 * API: GET https://registry.modelcontextprotocol.io/v0/servers
 *
 * Response shape (v0):
 * ```json
 * {
 *   "servers": [
 *     {
 *       "server": {
 *         "name": "ac.inference.sh/mcp",
 *         "description": "...",
 *         "title": "inference.sh",
 *         "version": "1.0.1",
 *         "repository": { "url": "https://github.com/owner/repo", "source": "github" },
 *         "websiteUrl": "https://example.com",
 *         "remotes": [{ "type": "streamable-http", "url": "https://..." }]
 *       },
 *       "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", ... } }
 *     }
 *   ],
 *   "metadata": { "nextCursor": "...", "count": 123 }
 * }
 * ```
 *
 * Each entry is wrapped in a `server` key. The server `name` is a dotted/slash
 * identifier (e.g. `ac.inference.sh/mcp`) — there is no separate `namespace`
 * field. Entries that lack a usable name are skipped rather than emitted as
 * `mcp/undefined/undefined` garbage.
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';

const MCP_REGISTRY_API = 'https://registry.modelcontextprotocol.io/v0/servers';

interface McpRepository {
  readonly url?: string;
  readonly source?: string;
  readonly id?: string;
  readonly subfolder?: string;
}

interface McpRemote {
  readonly type?: string;
  readonly url?: string;
}

interface McpServer {
  readonly name?: string;
  readonly description?: string;
  readonly title?: string;
  readonly version?: string;
  readonly repository?: McpRepository;
  readonly websiteUrl?: string;
  readonly remotes?: readonly McpRemote[];
}

interface McpRegistryEntry {
  readonly server?: McpServer;
  readonly _meta?: Record<string, unknown>;
}

interface McpRegistryResponse {
  readonly servers?: readonly McpRegistryEntry[];
  readonly metadata?: { readonly nextCursor?: string; readonly count?: number };
}

/** Derive the best available canonical URL for a server entry. */
function deriveUrl(server: McpServer): string | undefined {
  const repoUrl = server.repository?.url;
  if (repoUrl) return repoUrl;
  if (server.websiteUrl) return server.websiteUrl;
  const remoteUrl = server.remotes?.find((r) => r.url)?.url;
  if (remoteUrl) return remoteUrl;
  // Fall back to the registry's by-name URL only when we have a real name.
  if (server.name) {
    return `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(server.name)}`;
  }
  return undefined;
}

/** Map one registry entry to a RepoProfile, or null if it is unusable. */
function toProfile(entry: McpRegistryEntry): RepoProfile | null {
  const server = entry.server;
  // Skip wrapper-less or nameless entries instead of emitting undefined garbage.
  if (!server || typeof server.name !== 'string' || server.name.trim() === '') {
    return null;
  }

  const url = deriveUrl(server);
  if (!url) return null;

  const now = new Date().toISOString();
  return {
    fullName: `mcp/${server.name}`,
    url,
    description: server.description ?? server.title ?? '',
    stars: 0,
    forks: 0,
    lastCommit: now,
    topics: ['mcp-server', 'mcp-registry'],
    license: null,
    skillFormats: ['mcp-server'] as const,
    skillCount: 1,
    novelSkills: [],
    relevanceScore: 70, // canonical registry = high base relevance
    recommendation: 'monitor' as const,
    firstSeen: now,
    lastSeen: now,
  };
}

/**
 * Parse a raw MCP Registry API response into RepoProfiles.
 *
 * Exported for testing against captured fixtures.
 */
export function parseMcpRegistryResponse(data: unknown): RepoProfile[] {
  if (data === null || typeof data !== 'object') return [];
  // The v0 API always wraps entries in `{ servers: [...] }`. A bare array is
  // not part of the real schema, but tolerate it defensively.
  const entries = Array.isArray(data)
    ? (data as McpRegistryEntry[])
    : ((data as McpRegistryResponse).servers ?? []);

  const profiles: RepoProfile[] = [];
  for (const entry of entries) {
    const profile = toProfile(entry);
    if (profile) profiles.push(profile);
  }
  return profiles;
}

/** Query the official MCP Registry for servers. */
export async function scanMcpRegistry(
  options: { search?: string; limit?: number } = {},
): Promise<RepoProfile[]> {
  const limit = options.limit ?? 30;
  const search = options.search ?? '';

  try {
    const url = search
      ? `${MCP_REGISTRY_API}?search=${encodeURIComponent(search)}&limit=${limit}`
      : `${MCP_REGISTRY_API}?limit=${limit}`;

    const resp = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'dz-scout/0.5.0' },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as unknown;
    return parseMcpRegistryResponse(data);
  } catch {
    return [];
  }
}
