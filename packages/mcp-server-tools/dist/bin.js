#!/usr/bin/env node
/**
 * Stdio entry point for the DZ harness MCP server.
 *
 * Skills are read from `DZ_SKILLS_DIR`, defaulting to `.claude/skills` relative
 * to the working directory.
 */
/* v8 ignore start — thin stdio entry point; all logic is tested via createDzMcpServer */
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDzMcpServer } from './server.js';
const skillsDir = process.env.DZ_SKILLS_DIR ?? join(process.cwd(), '.claude', 'skills');
const server = createDzMcpServer({ skillsDir });
await server.connect(new StdioServerTransport());
/* v8 ignore stop */
//# sourceMappingURL=bin.js.map