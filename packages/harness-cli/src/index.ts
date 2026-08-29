/**
 * `@dzhechkov/harness-cli` — the `dz` CLI for the DZ cross-platform harness.
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';

/** Package version. Kept in sync with `package.json`. */
export const HARNESS_CLI_VERSION: string =
  (createRequire(import.meta.url)('../package.json') as { version: string }).version;

export { DZ_COMMANDS, runCli } from './cli.js';
export type { CliIo, ReleaseExecRunner } from './cli.js';
// The Codex hook DELIVERY seam (crossrt-2 fix round, findings 1+2): the argv→operation mapping and
// the one place a success word may be printed, exported so both can be pinned without a live codex.
export { codexHooksSummary, codexHooksSyncOptions, deliverCodexHooks } from './cli.js';
// Exported for its own test: the guard that keeps `--json` stdout parseable when a dependency greets
// stdout. Tested directly because the end-to-end path cannot reach it without a populated vector tier.
export { withForeignStdoutOnStderr } from './cli.js';
export type { CodexHooksSummary, CodexHooksSyncInput } from './cli.js';
