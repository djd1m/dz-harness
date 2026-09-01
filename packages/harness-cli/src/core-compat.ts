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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The lowest `@dzhechkov/harness-core` this CLI build can run against.
 *
 * Kept equal to the minimum of the declared dependency range in `package.json` — a
 * standing test (`test/core-import-floor.test.ts`, F1) fails if the two drift apart,
 * because a guard that says 0.4.7 while npm may install 0.4.2 is worse than no guard.
 */
// 0.8.7: the statusline statically imports the ETA parser/estimator surface. An older core fails
// during ESM linking before runCli can print a useful diagnostic, so the import-free preflight must
// refuse it first.
export const MIN_CORE = '0.8.7';

/** The npm name of the guarded package — one literal, used by every leg below. */
export const CORE_PACKAGE_NAME = '@dzhechkov/harness-core';

/**
 * Compare the dot-separated identifiers of two SemVer prerelease strings (§11.4).
 *
 * Numeric identifiers compare numerically and rank BELOW alphanumeric ones; when every
 * shared identifier is equal, the longer list is the higher version.
 */
function comparePrerelease(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  const xs = a.split('.');
  const ys = b.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i += 1) {
    const x = xs[i];
    const y = ys[i];
    // A shorter identifier list is the LOWER version (`1.0.0-rc` < `1.0.0-rc.1`).
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const nx = Number(x);
      const ny = Number(y);
      if (nx !== ny) return nx < ny ? -1 : 1;
      continue;
    }
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (xNum !== yNum) return xNum ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

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
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): { nums: number[]; pre: string | null } | null => {
    // Prerelease and build metadata get one capture EACH, in SemVer's own order.
    const m = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?\s*$/.exec(v);
    if (m === null) return null;
    const nums = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!nums.every((n) => Number.isFinite(n))) return null;
    // m[5] (build metadata) is deliberately never read: SemVer §10 says it is not
    // part of precedence.
    return { nums, pre: m[4] !== undefined && m[4].length > 0 ? m[4] : null };
  };
  const pa = parse(a);
  const pb = parse(b);
  // Unparseable on either side ⇒ "compatible": never brick a working install on a
  // version string we failed to read.
  if (pa === null || pb === null) return 0;
  for (let i = 0; i < 3; i += 1) {
    const x = pa.nums[i] ?? 0;
    const y = pb.nums[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return comparePrerelease(pa.pre, pb.pre);
}

/** Read `.version` out of a `package.json`, or `null` if it is missing/unreadable. */
function readVersion(packageJsonPath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

/** Walk up from `start` to the nearest enclosing `package.json`, reading its version. */
function versionFromEnclosingPackage(start: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const version = readVersion(candidate);
      if (version !== null) return version;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

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
export function resolveInstalledCoreVersion(fromUrl: string): string | null {
  const meta = import.meta as unknown as { resolve?: (specifier: string) => string };
  if (typeof meta.resolve === 'function') {
    try {
      const resolved = meta.resolve(CORE_PACKAGE_NAME);
      const version = versionFromEnclosingPackage(dirname(fileURLToPath(resolved)));
      if (version !== null) return version;
    } catch {
      /* fall through to the filesystem walk */
    }
  }

  let dir: string;
  try {
    dir = dirname(fileURLToPath(fromUrl));
  } catch {
    dir = resolve('.');
  }
  for (;;) {
    const candidate = join(dir, 'node_modules', ...CORE_PACKAGE_NAME.split('/'), 'package.json');
    if (existsSync(candidate)) {
      const version = readVersion(candidate);
      if (version !== null) return version;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The verdict of {@link checkCoreCompat}. */
export type CoreCompatVerdict = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Decide whether the found core is usable, and if not, say so in words a user can act on.
 *
 * `found === null` ⇒ `{ ok: true }` (fail-open — see the module doc comment).
 */
export function checkCoreCompat(input: { found: string | null; min: string }): CoreCompatVerdict {
  const { found, min } = input;
  if (found === null) return { ok: true };
  if (compareSemver(found, min) >= 0) return { ok: true };
  return {
    ok: false,
    message: [
      `dz: needs ${CORE_PACKAGE_NAME} >= ${min}, found ${found}`,
      '    Your resolver reused a cached lower core. Fix: rm -rf ~/.npm/_npx && npx @dzhechkov/harness-cli@latest --version',
      `    (or: npm i -D ${CORE_PACKAGE_NAME}@latest)`,
    ].join('\n'),
  };
}

/**
 * Reactive translator for the failure the pre-emptive guard could not see.
 *
 * If the version probe fails open (leg 3) and the dynamic import then dies on a missing
 * ESM binding, the raw `SyntaxError` reads like a corrupted install or a Node problem.
 * Rewrite it into the same named form. Returns `null` for any OTHER error — the caller
 * must re-throw those unchanged, so real bugs still surface.
 */
export function describeMissingExportError(error: unknown, found: string | null): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /does not provide an export named '?([A-Za-z0-9_$]+)'?/.exec(message);
  if (match === null) return null;
  return [
    `dz: this build needs ${CORE_PACKAGE_NAME} >= ${MIN_CORE}${found !== null ? `, found ${found}` : ''}`,
    `    The installed core does not export ${JSON.stringify(match[1] ?? '')}, which this CLI imports.`,
    '    Fix: rm -rf ~/.npm/_npx && npx @dzhechkov/harness-cli@latest --version',
    `    (or: npm i -D ${CORE_PACKAGE_NAME}@latest)`,
  ].join('\n');
}
