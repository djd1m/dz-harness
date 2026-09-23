import { createRequire } from 'node:module';

/** Read our own version; consumers choose how to handle an unavailable source. */
export function readPackageVersion(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../package.json') as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch { return null; }
}

/** An unknown version must not prevent the MCP server from serving. */
export const MCP_SERVER_TOOLS_VERSION = readPackageVersion() ?? 'unknown';
