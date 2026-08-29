/**
 * `@dzhechkov/mcp-server-tools` — an MCP server exposing DZ harness operations.
 *
 * It surfaces the harness as Model Context Protocol tools so any MCP client
 * (Claude Code, Codex, …) can list skills, read a skill, compile a skill for a
 * target platform, and verify a skill — without shelling out to the CLI.
 *
 * @packageDocumentation
 */
export { MCP_SERVER_TOOLS_VERSION } from './version.js';
export { createDzMcpServer } from './server.js';
export { listSkills, loadSkill } from './skills.js';
//# sourceMappingURL=index.js.map