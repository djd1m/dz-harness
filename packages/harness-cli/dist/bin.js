#!/usr/bin/env node
/**
 * `dz` executable entry point.
 *
 * Two phases, and the split is load-bearing (feature dz-cli-defects, D5):
 *
 *   phase 1 — ZERO `@dzhechkov/harness-core` imports: probe the installed core version
 *             and refuse with a NAMED message if it is below `MIN_CORE`;
 *   phase 2 — `await import('./cli.js')`, which is where the ~100-name static graph is
 *             linked. A STATIC import here would link that graph before any guard could
 *             run, which is exactly how a cached lower core produced a bare
 *             `SyntaxError: … does not provide an export named 'GRADE_SUCCESS_FLOOR'`
 *             with nothing pointing at the cause.
 */
import { checkCoreCompat, describeMissingExportError, resolveInstalledCoreVersion, MIN_CORE } from './core-compat.js';
const foundCore = resolveInstalledCoreVersion(import.meta.url);
const compat = checkCoreCompat({ found: foundCore, min: MIN_CORE });
if (!compat.ok) {
    // stderr, and no stack: the user needs one actionable line, not a trace.
    console.error(compat.message);
    process.exitCode = 1;
}
else {
    let code;
    try {
        const { runCli } = await import('./cli.js');
        code = await runCli(process.argv.slice(2));
    }
    catch (error) {
        // The version probe fails OPEN, so a missing-binding link error can still reach us.
        // Translate exactly that class into the named form; re-throw everything else
        // unchanged so real bugs still surface.
        const named = describeMissingExportError(error, foundCore);
        if (named === null)
            throw error;
        console.error(named);
        code = 1;
    }
    // `process.exit()` here TRUNCATED large output on a pipe, silently and at exactly the
    // pipe buffer size. On a pipe (not a TTY, not a file) Node's stdout is ASYNCHRONOUS, so
    // `process.exit` discards whatever has not flushed yet: `dz recall --all --json > file`
    // wrote 122826 bytes while `dz recall --all --json | jq` got exactly 65536 and a parse
    // error. That is data loss in the documented sharing path, and silent — the exit code
    // was 0 and the JSON simply stopped mid-string.
    //
    // So: set the code and let the process end when the event loop drains, which is what
    // flushes stdout. `process.exitCode` preserves the status without the race.
    process.exitCode = code;
}
//# sourceMappingURL=bin.js.map