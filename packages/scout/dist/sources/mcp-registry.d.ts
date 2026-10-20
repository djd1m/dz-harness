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
/**
 * Parse a raw MCP Registry API response into RepoProfiles.
 *
 * Exported for testing against captured fixtures.
 */
export declare function parseMcpRegistryResponse(data: unknown): RepoProfile[];
/** Query the official MCP Registry for servers. */
export declare function scanMcpRegistry(options?: {
    search?: string;
    limit?: number;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=mcp-registry.d.ts.map