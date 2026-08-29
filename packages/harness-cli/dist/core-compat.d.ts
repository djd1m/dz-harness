/**
 * `@dzhechkov/harness-core` compatibility guard — the import-free island.
 *
 * ## Why this module exists
 *
 * ESM resolves and link-checks **every named binding of the whole static graph** before
 * the first byte of user code runs. `bin.ts` used to `import { runCli } from './cli.js'`
 * statically, and `cli.ts` statically imports ~100 names from `@dzhechkov/harness-core`.
 * Against a cached lower core the linker threw
 * `SyntaxError: … does not provide an export named 'GRADE_SUCCESS_FLOOR'` at
 * `#asyncInstantiate` — every subcommand, `--version` included, died before any guard
 * could speak. (MEASURED against `@dzhechkov/harness-core@0.4.1`; `^0.4.0` legally
 * resolves it and the symbol only exists from core 0.4.2.)
 *
 * ## The defining constraint — negative, and enforced rather than remembered
 *
 * **This file may not import anything from `@dzhechkov/harness-core`, directly or
 * transitively — only `node:` builtins.** If it joins the graph it is guarding, it dies
 * with it and the guard is decorative. `test/core-compat-guard.test.ts` parses this
 * file's import list and asserts exactly that.
 *
 * ## Fail-open on an unreadable version — a deliberate exception
 *
 * When the installed core's version cannot be determined the guard **proceeds**. Its job
 * is to replace a bad message with a good one, not to gate execution; blocking a working
 * install because a version string was unreadable would be a self-inflicted outage
 * strictly worse than the `SyntaxError`. This is a conscious exception to the house rule
 * "inconclusive never passes", which governs gates that grant a *quality* verdict — do
 * not "fix" it. The symmetric hazard (a guard that fires wrongly and bricks a good
 * install) is covered by {@link compareSemver} treating any unparseable component as
 * compatible.
 *
 * @packageDocumentation
 */
/**
 * The lowest `@dzhechkov/harness-core` this CLI build can run against.
 *
 * Kept equal to the minimum of the declared dependency range in `package.json` — a
 * standing test (`test/core-import-floor.test.ts`, F1) fails if the two drift apart,
 * because a guard that says 0.4.7 while npm may install 0.4.2 is worse than no guard.
 */
export declare const MIN_CORE = "0.8.4";
/** The npm name of the guarded package — one literal, used by every leg below. */
export declare const CORE_PACKAGE_NAME = "@dzhechkov/harness-core";
/**
 * Compare two semver strings by `major.minor.patch`, then by prerelease.
 *
 * Rules that matter here:
 * - every component runs through a `Number.isFinite` clamp; a non-finite or missing
 *   component makes the comparison return `0` (compatible), never a false "too old";
 * - **prerelease (`-…`) and build metadata (`+…`) are parsed SEPARATELY**, because they
 *   mean opposite things. A prerelease sorts BELOW its release (`0.4.6-rc.1` < `0.4.6`),
 *   so a release-candidate core does not silently satisfy a floor it has not reached;
 *   build metadata is **ignored entirely** (`0.4.6+sha1234` === `0.4.6`), because a core
 *   built from a tagged commit is that version and refusing it would be a self-inflicted
 *   outage — exactly what ADR-003 driver D6 forbids.
 *
 *   Both halves were wrong before fix round 1 (QE F3): one capture group `(?:[-+](.*))?`
 *   swallowed either sigil, patched over by `!m[4].startsWith('build')`. MEASURED
 *   consequences: `0.4.6+sha1234` was REFUSED (false block) and `0.4.6-build.5` was
 *   ACCEPTED (false pass) against a `0.4.6` floor. A string special case is not SemVer.
 */
export declare function compareSemver(a: string, b: string): -1 | 0 | 1;
/**
 * Best-effort: what version of `@dzhechkov/harness-core` will actually be loaded?
 *
 * Three legs, in order — the obvious one does **not** work on its own:
 *
 * 1. `import.meta.resolve(CORE_PACKAGE_NAME)` (a function on node ≥20.6; `typeof`-guarded
 *    because `engines` says `>=20` and it is flagged on 20.0–20.5), then walk up to the
 *    nearest `package.json`.
 * 2. Ancestor-walk from this file for `node_modules/@dzhechkov/harness-core/package.json`
 *    — **no resolver semantics**. This leg is load-bearing rather than a fallback: an old
 *    core's `exports` map declares only `{".": {"import": …}}`, so
 *    `require.resolve('@dzhechkov/harness-core/package.json')` fails with
 *    `ERR_PACKAGE_PATH_NOT_EXPORTED` (MEASURED in this tree) — and the old core is
 *    precisely the case the guard exists for.
 * 3. `null` — the fail-open path documented at the top of this file.
 */
export declare function resolveInstalledCoreVersion(fromUrl: string): string | null;
/** The verdict of {@link checkCoreCompat}. */
export type CoreCompatVerdict = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly message: string;
};
/**
 * Decide whether the found core is usable, and if not, say so in words a user can act on.
 *
 * `found === null` ⇒ `{ ok: true }` (fail-open — see the module doc comment).
 */
export declare function checkCoreCompat(input: {
    found: string | null;
    min: string;
}): CoreCompatVerdict;
/**
 * Reactive translator for the failure the pre-emptive guard could not see.
 *
 * If the version probe fails open (leg 3) and the dynamic import then dies on a missing
 * ESM binding, the raw `SyntaxError` reads like a corrupted install or a Node problem.
 * Rewrite it into the same named form. Returns `null` for any OTHER error — the caller
 * must re-throw those unchanged, so real bugs still surface.
 */
export declare function describeMissingExportError(error: unknown, found: string | null): string | null;
//# sourceMappingURL=core-compat.d.ts.map