#!/usr/bin/env node
/**
 * Stdio entry point for the DZ harness MCP server.
 *
 * Skills are read from `DZ_SKILLS_DIR`, defaulting to `.claude/skills` relative
 * to the working directory.
 */
/* v8 ignore start — thin stdio entry point; all logic is tested via createDzMcpServer */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDzMcpServer } from './server.js';
import { MCP_SERVER_TOOLS_VERSION, readPackageVersion } from './version.js';
async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--version') || args.includes('-v')) {
        if (readPackageVersion() === null) {
            console.error(`Cannot read package version from ${fileURLToPath(new URL('../package.json', import.meta.url))}`);
            process.exitCode = 1;
            return;
        }
        console.log(MCP_SERVER_TOOLS_VERSION);
        return;
    }
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`DZ harness MCP server over stdio.

Usage: dz-mcp-server-tools [--version | -v | --help | -h]

DZ_SKILLS_DIR: skills directory (default: .claude/skills relative to the working directory).`);
        return;
    }
    const skillsDir = process.env.DZ_SKILLS_DIR ?? join(process.cwd(), '.claude', 'skills');
    const server = createDzMcpServer({ skillsDir });
    await server.connect(new StdioServerTransport());
}
await main();
/* v8 ignore stop */
//# sourceMappingURL=bin.js.map