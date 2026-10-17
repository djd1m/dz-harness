/**
 * The DZ harness MCP server — registers the harness tools on an `McpServer`.
 *
 * @packageDocumentation
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Adapter, Platform } from '@dzhechkov/core';
/** Configuration for {@link createDzMcpServer}. */
export interface DzMcpServerOptions {
    /** Directory the server reads skills from (`<dir>/<id>/SKILL.md`). */
    readonly skillsDir: string;
}
/**
 * Adapter for every supported platform, keyed by platform name.
 *
 * The key set must equal `PLATFORMS` (`@dzhechkov/core`) — the `Record<Platform, Adapter>` type enforces
 * it at compile time, and `test/adapters-cover-platforms.test.ts` enforces it structurally so a platform
 * added to core reds the suite until it is wired here. Exported so that test can read the keys.
 */
export declare const ADAPTERS: Record<Platform, Adapter>;
/**
 * Build a configured DZ harness {@link McpServer} — `skill_list`, `skill_get`,
 * `skill_compile`, and `harness_verify` registered against `options.skillsDir`.
 * The caller connects it to a transport (stdio in production, in-memory in tests).
 */
export declare function createDzMcpServer(options: DzMcpServerOptions): McpServer;
//# sourceMappingURL=server.d.ts.map