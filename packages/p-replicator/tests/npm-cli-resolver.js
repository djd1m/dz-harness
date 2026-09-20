'use strict';

/**
 * Which npm may a test use? — CommonJS twin of
 * `packages/@dzhechkov/harness-cli/test/npm-cli-resolver.ts` (ADR-001 of feature
 * `repo-sweep-honesty`, FR-3 + FR-4).
 *
 * WHY A TWIN AND NOT A SHARED HELPER. This package PUBLISHES its `tests/` directory (see the
 * `files` field of its package.json), so an import reaching outside the package would travel into
 * the tarball as a broken reference to a file the consumer never receives. The two packages also
 * live in different module systems — harness-cli is `type: "module"` TypeScript, this one is
 * CommonJS JavaScript — so one file fit for both does not exist. What is shared instead is the
 * CONTRACT: `npm-resolver-cases.json`, one byte-identical copy per package, held in step by
 * `packages/@dzhechkov/harness-core/test/npm-resolver-cases-twin-drift.test.ts`.
 *
 * THE DEFECT THIS REPLACES. The previous fallback here read
 * `npm_execpath && fs.existsSync(npm_execpath) ? npm_execpath : <global npm>`. Under `pnpm test`,
 * `npm_execpath` is pnpm.cjs; that file EXISTS; so the fallback never fired in the one case it was
 * written for, and pnpm was loaded as if it were the npm CLI — `Unknown option: 'dry-run'`
 * (MEASURED 2026-09-18). The question is therefore identity, not existence.
 *
 * WHAT "IDENTITY" MEANS HERE — three facts a look-alike cannot borrow together (review r1, HIGH-5):
 *   1. the candidate is DEREFERENCED first (`realpath`), because a genuine npm is normally reached
 *      through a symlink (`/usr/bin/npm` -> `../lib/node_modules/npm/bin/npm-cli.js`, MEASURED) and
 *      resolving modules from `/usr/bin` finds nothing — the real npm was being REJECTED;
 *   2. the nearest enclosing `package.json` says `"name": "npm"`, because module resolution answers
 *      a question about a DIRECTORY, so without this any intruder dropped into a tree that contains
 *      `libnpmpack` was ACCEPTED;
 *   3. `libnpmpack` resolves from the dereferenced file and lives in the SAME installation.
 */

const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

/** The module whose resolvability IS npm's identity. Nothing else about npm is checked. */
const NPM_IDENTITY_MODULE = 'libnpmpack';

/** Where npm's CLI entry point sits inside a global module root. */
const NPM_CLI_RELATIVE_PATH = path.join('npm', 'bin', 'npm-cli.js');

/** The name the enclosing package.json must carry for a file to be part of npm. */
const NPM_PACKAGE_NAME = 'npm';

/** How far up the tree the enclosing `package.json` is looked for. npm's CLI is 2 levels deep. */
const PACKAGE_ROOT_SEARCH_DEPTH = 8;

/**
 * `true` when `child` is `parent` itself or lies underneath it.
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
function isInside(parent, child) {
  if (!parent || !child) return false;
  const base = parent.endsWith(path.sep) ? parent.slice(0, -path.sep.length) : parent;
  return child === base || child.startsWith(base + path.sep);
}

/**
 * @param {string} candidate
 * @returns {string|null}
 */
function realPathOrNull(candidate) {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

/**
 * The directory of the npm PACKAGE that contains `realCandidate`, or `null` when the nearest
 * enclosing `package.json` belongs to something else (or there is none at all).
 *
 * @param {string} realCandidate
 * @returns {string|null}
 */
function npmPackageRoot(realCandidate) {
  let dir = path.dirname(realCandidate);
  for (let depth = 0; depth < PACKAGE_ROOT_SEARCH_DEPTH; depth += 1) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        return parsed && typeof parsed === 'object' && parsed.name === NPM_PACKAGE_NAME ? dir : null;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * The dereferenced path of `candidate` when it really is npm's CLI, otherwise `null`.
 * @param {string|undefined|null} candidate
 * @returns {string|null}
 */
function resolveNpmCliPath(candidate) {
  if (typeof candidate !== 'string' || candidate === '') return null;
  if (!fs.existsSync(candidate)) return null;
  const real = realPathOrNull(candidate);
  if (real === null) return null;

  const packageRoot = npmPackageRoot(real);
  if (packageRoot === null) return null;

  let resolved;
  try {
    resolved = Module.createRequire(real).resolve(NPM_IDENTITY_MODULE);
  } catch {
    return null;
  }
  const realResolved = realPathOrNull(resolved) || resolved;
  // The identity module must belong to the SAME installation: either inside npm's own package, or
  // hoisted into the `node_modules` directory that holds it.
  const sameInstall = isInside(packageRoot, realResolved) || isInside(path.dirname(packageRoot), realResolved);
  return sameInstall ? real : null;
}

/**
 * Is the file at `candidate` npm itself? The boolean face of {@link resolveNpmCliPath}.
 * @param {string|undefined|null} candidate
 * @returns {boolean}
 */
function isNpmCli(candidate) {
  return resolveNpmCliPath(candidate) !== null;
}

/**
 * @param {string[]} roots
 * @returns {string[]}
 */
function dedupe(roots) {
  const seen = new Set();
  const unique = [];
  for (const root of roots) {
    if (!root) continue;
    const normalised = path.resolve(root);
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    unique.push(normalised);
  }
  return unique;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function pathEntries(env) {
  const raw = typeof env.PATH === 'string' ? env.PATH : (typeof env.Path === 'string' ? env.Path : '');
  return raw.split(path.delimiter).filter((entry) => entry !== '');
}

/**
 * Module roots that come from this MACHINE.
 *
 * MEASURED 2026-09-18 and load-bearing: `Module.globalPaths` on this machine is
 * ['/root/.node_modules', '/root/.node_libraries', '/usr/lib/node'] and does NOT contain
 * '/usr/lib/node_modules', where npm actually lives. A lookup that trusted `globalPaths` alone
 * could report "npm not installed" on a machine that has npm, so the layout derived from
 * `process.execPath` is tried first.
 *
 * @param {string} [execPath]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function ambientGlobalRoots(execPath, env) {
  const exec = typeof execPath === 'string' && execPath !== '' ? execPath : process.execPath;
  const environment = env || process.env;
  const binDir = path.dirname(exec);
  const nodePath = typeof environment.NODE_PATH === 'string' ? environment.NODE_PATH : '';
  return dedupe([
    path.join(binDir, '..', 'lib', 'node_modules'),
    path.join(binDir, '..', '..', 'lib', 'node_modules'),
    path.join(binDir, 'node_modules'),
    ...nodePath.split(path.delimiter).filter((entry) => entry !== ''),
    ...Module.globalPaths,
  ]);
}

/**
 * npm's configured install prefix — the same value `npm config get prefix` prints, obtained WITHOUT
 * spawning npm.
 *
 * Why not spawn it: running npm to find npm is circular (on the machine where the answer matters
 * most the spawn is exactly what fails), and a subprocess inside a resolver every test calls is a
 * hang risk on a loaded runner. The sources are npm's own, in npm's own order: the
 * `npm_config_prefix` environment variable, then the user config file (`$npm_config_userconfig`,
 * else `$HOME/.npmrc`).
 *
 * HONEST GAP: npm's builtin and global config files are not read, so a prefix set ONLY in
 * `/usr/etc/npmrc` is not seen. The env is the only source consulted, never the ambient
 * `homedir()`, so a caller handing in a bare env gets a deterministic answer.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|undefined}
 */
function npmConfigPrefix(env) {
  const environment = env || process.env;
  const direct = environment.npm_config_prefix;
  if (typeof direct === 'string' && direct !== '') return direct;

  const home = typeof environment.HOME === 'string' && environment.HOME !== ''
    ? environment.HOME
    : (typeof environment.USERPROFILE === 'string' ? environment.USERPROFILE : '');
  const userConfig = typeof environment.npm_config_userconfig === 'string' && environment.npm_config_userconfig !== ''
    ? environment.npm_config_userconfig
    : (home ? path.join(home, '.npmrc') : '');
  if (!userConfig || !fs.existsSync(userConfig)) return undefined;

  try {
    for (const rawLine of fs.readFileSync(userConfig, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
      const match = /^prefix\s*=\s*(.+)$/.exec(line);
      if (match && match[1] !== undefined) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Module roots under npm's configured prefix (both the POSIX and the Windows layout).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function npmPrefixRoots(env) {
  const prefix = npmConfigPrefix(env);
  if (prefix === undefined) return [];
  return dedupe([path.join(prefix, 'lib', 'node_modules'), path.join(prefix, 'node_modules')]);
}

/**
 * Module roots derived from the directories on PATH. A machine whose npm lives under an unrelated
 * prefix (nvm, asdf, Homebrew, a per-user install) is invisible to `process.execPath` and to
 * `globalPaths` alike, but its `bin` directory is on PATH by construction.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function pathRoots(env) {
  const environment = env || process.env;
  const roots = [];
  for (const entry of pathEntries(environment)) {
    roots.push(path.join(entry, '..', 'lib', 'node_modules'), path.join(entry, 'node_modules'));
  }
  return dedupe(roots);
}

/**
 * The `npm` executables sitting on PATH. Each is DEREFERENCED and identity-checked, which is what
 * makes the usual `bin/npm -> ../lib/node_modules/npm/bin/npm-cli.js` symlink a usable answer.
 *
 * `npm.cmd` / `npm.ps1` on Windows are batch wrappers, not JavaScript; they are not candidates for
 * a resolver whose answer is fed to `node <path>`, and they are deliberately not listed.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function pathNpmExecutables(env) {
  return pathEntries(env || process.env).map((entry) => path.join(entry, 'npm'));
}

/**
 * Every root this resolver would search for a given machine + environment, in order.
 * @param {string} [execPath]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function defaultGlobalRoots(execPath, env) {
  return dedupe([...ambientGlobalRoots(execPath, env), ...npmPrefixRoots(env), ...pathRoots(env)]);
}

/**
 * The ladder, in the one order ADR-001 fixes:
 *   npm_execpath (only if it IS npm) -> the installed npm -> an honest, named unavailability.
 *
 * `options.globalRoots` replaces the AMBIENT roots only; the env-derived roots (npm's configured
 * prefix, PATH) always apply, because they describe the environment the caller handed in.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ globalRoots?: string[] }} [options]
 * @returns {{kind:'npm-cli', path:string, source:'npm_execpath'|'global-install'}|{kind:'unavailable', reason:string}}
 */
function resolveNpmCli(env, options) {
  const environment = env || process.env;
  const settings = options || {};
  const handedOver = environment.npm_execpath;

  const handedOverReal = resolveNpmCliPath(handedOver);
  if (handedOverReal !== null) {
    return { kind: 'npm-cli', path: handedOverReal, source: 'npm_execpath' };
  }

  const roots = dedupe([
    ...(Array.isArray(settings.globalRoots) ? settings.globalRoots : ambientGlobalRoots(process.execPath, environment)),
    ...npmPrefixRoots(environment),
    ...pathRoots(environment),
  ]);
  for (const root of roots) {
    const found = resolveNpmCliPath(path.join(root, NPM_CLI_RELATIVE_PATH));
    if (found !== null) {
      return { kind: 'npm-cli', path: found, source: 'global-install' };
    }
  }

  const executables = pathNpmExecutables(environment);
  for (const executable of executables) {
    const found = resolveNpmCliPath(executable);
    if (found !== null) {
      return { kind: 'npm-cli', path: found, source: 'global-install' };
    }
  }

  const handedOverNote = typeof handedOver !== 'string' || handedOver === ''
    ? 'npm_execpath was not set'
    : `npm_execpath=${handedOver} is not npm (module '${NPM_IDENTITY_MODULE}' does not resolve from it)`;
  return {
    kind: 'unavailable',
    reason: `npm not found: ${handedOverNote}; `
      + `no '${NPM_CLI_RELATIVE_PATH}' whose '${NPM_IDENTITY_MODULE}' resolves was found under `
      + `[${roots.join(', ')}]`
      + `, nor an 'npm' executable on PATH [${executables.join(', ')}]`,
  };
}

/**
 * FR-4 — a skip must be AUDIBLE. A silent `skip` is how a test stops proving anything without
 * anyone noticing, so the reason (which names the missing tool) is written to the suite's output
 * before the test steps aside.
 *
 * @param {{kind:'unavailable', reason:string}} resolution
 * @param {((line: string) => void)|null} [write]
 * @returns {string}
 */
function announceNpmSkip(resolution, write) {
  const emit = typeof write === 'function' ? write : (line) => console.log(line);
  const line = `SKIPPED — this test needs the real npm packer. ${resolution.reason}`;
  emit(line);
  return line;
}

module.exports = {
  NPM_IDENTITY_MODULE,
  NPM_CLI_RELATIVE_PATH,
  NPM_PACKAGE_NAME,
  ambientGlobalRoots,
  announceNpmSkip,
  defaultGlobalRoots,
  isNpmCli,
  npmConfigPrefix,
  npmPackageRoot,
  npmPrefixRoots,
  pathNpmExecutables,
  pathRoots,
  resolveNpmCli,
  resolveNpmCliPath,
};
