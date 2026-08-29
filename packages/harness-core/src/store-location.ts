/**
 * store-location — one sentence about WHERE a learning store lives, used by every command that
 * touches one.
 *
 * MEASURED 2026-08-27: `dz teach` and `dz recall` both resolve their store as
 * `resolve(cwd, --project ?? '.')` (`cli.ts:2882`, `:3450`) — plain cwd, no git-root walk, no
 * upward search, and no config key or environment variable to pin a canonical root. Neither
 * command printed the path.
 *
 * So a user who runs `dz teach` in eight project directories gets eight isolated stores and
 * believes they are accumulating. The path alone does not reveal that: `/home/u/proj/.dz` looks
 * equally deliberate whether it was chosen or defaulted into. **That difference is the defect**,
 * so the line names the SOURCE, not only the location.
 *
 * This ships BEFORE the intended per-session mode on purpose. A mode set once and forgotten lies
 * silently, and a mode is only safe when its effect is visible on every operation it governs.
 */

import { join } from 'node:path';

/**
 * Who decided this path. `global` is separate from `cwd`/`explicit` because the advice differs:
 * "pass --project" is useful for a cwd-derived store and MISLEADING for the home store, which
 * neither the cwd nor --project chose (cross-family QE, 2026-08-27: `--project /tmp/p --to global`
 * printed the right path under the wrong explanation).
 */
export type StoreOrigin = 'explicit' | 'cwd' | 'global';

export interface StoreLocation {
  /** Absolute path of the store directory — `<projectRoot>/.dz`. */
  readonly path: string;
  /** Where the project root came from: an explicit `--project`, or the current directory. */
  readonly origin: StoreOrigin;
}

/**
 * Describe the store a command is about to use.
 *
 * `projectOption` is the RAW `--project` value as the user typed it (or `undefined`), and
 * `resolvedRoot` is what the command already computed. Both are taken rather than re-resolving,
 * so this helper can never disagree with the command about which directory was chosen — a second,
 * independent resolution is exactly how two lookalike code paths come to name different stores.
 */
export function describeStoreLocation(
  resolvedRoot: string,
  projectOption: string | undefined,
  /**
   * Overrides the derived origin when the caller KNOWS what chose the path — today only the
   * cross-project home store, which neither the cwd nor `--project` selected. Omit it and the
   * origin is derived exactly as before, so every existing call is unchanged.
   */
  origin?: StoreOrigin,
): StoreLocation {
  return {
    path: join(resolvedRoot, '.dz'),
    origin: origin ?? (projectOption === undefined ? 'cwd' : 'explicit'),
  };
}

/**
 * The one human line, shared by every command.
 *
 * Two commands writing this sentence independently is how they come to disagree about what a store
 * is — the lookalike-normalisation class this repo has already paid for once.
 *
 * `verb` is what the command did with the store, so the line reads naturally in both directions:
 * "store (written): …" and "store (read): …".
 */
export function storeLocationLine(loc: StoreLocation, verb: 'written' | 'read'): string {
  const because = loc.origin === 'explicit'
    ? 'from --project'
    : loc.origin === 'global'
      ? 'the cross-project store in your home directory'
      : 'from the current directory — pass --project to choose deliberately';
  return `  store (${verb}): ${loc.path}  [${because}]`;
}
