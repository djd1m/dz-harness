/**
 * Glama.ai MCP server scanner.
 *
 * API: GET https://glama.ai/api/mcp/v1/servers/ (REST, no auth)
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/** Query Glama.ai for MCP servers. */
export declare function scanGlama(options?: {
    limit?: number;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=glama.d.ts.map