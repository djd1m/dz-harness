/**
 * Smithery.ai MCP server scanner.
 *
 * API: https://smithery.ai (REST, no auth documented)
 * "Docker Hub for MCP" — 7,300+ servers.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/** Query Smithery.ai for MCP servers. */
export declare function scanSmithery(options?: {
    limit?: number | undefined;
    query?: string | undefined;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=smithery.d.ts.map