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
export {};
//# sourceMappingURL=bin.d.ts.map