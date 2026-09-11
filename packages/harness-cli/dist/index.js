/**
 * `@dzhechkov/harness-cli` — the `dz` CLI for the DZ cross-platform harness.
 *
 * @packageDocumentation
 */
import { createRequire } from 'node:module';
/** Package version. Kept in sync with `package.json`. */
export const HARNESS_CLI_VERSION = createRequire(import.meta.url)('../package.json').version;
export { DZ_COMMANDS, runCli } from './cli.js';
// ONE definition of "a dz command" (ADR-001, feature command-count-triad). Exported so every
// consumer — the layer-1 parity test, `dz name-check`, any future doc generator — derives the four
// name sets from the same pure parser instead of growing a fourth private regex and a fourth number.
export { commandInventory, declaredCommands, dispatchedCommands, documentedCommands, stripNonCode, validateExceptionList, INTERNAL_ENTRY_POINTS, PSEUDO_COMMANDS, } from './command-inventory.js';
// The Codex hook DELIVERY seam (crossrt-2 fix round, findings 1+2): the argv→operation mapping and
// the one place a success word may be printed, exported so both can be pinned without a live codex.
export { codexHooksSummary, codexHooksSyncOptions, deliverCodexHooks, normalizeCodexHookOutcome } from './cli.js';
// Exported for its own test: the guard that keeps `--json` stdout parseable when a dependency greets
// stdout. Tested directly because the end-to-end path cannot reach it without a populated vector tier.
export { withForeignStdoutOnStderr } from './cli.js';
//# sourceMappingURL=index.js.map