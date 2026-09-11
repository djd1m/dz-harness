// Where THIS harness-core installation lives on disk (feature `destructive-command-guard`, task T8,
// cross-family review round 3, both P1 findings).
//
// WHY A GUARD NEEDS TO KNOW ITS OWN ADDRESS. Both emitted hook bodies — the Claude PreToolUse hook
// and the Codex veto helper — are files that run OUTSIDE this package: one in a consumer's
// `.claude/hooks/`, one in `$CODEX_HOME/dz-hooks/`. They cannot `require('@dzhechkov/harness-core')`,
// because Node resolves a bare specifier from the FILE's location, and neither location has the
// package above it. So they resolve by PATH — and the paths they were given were all relative to the
// project being guarded. MEASURED 2026-09-05, the documented global-install workflow
// (`npm install -g @dzhechkov/harness-cli`, then a target repo with no local install):
//   every candidate → ERR_MODULE_NOT_FOUND, helper exits 0, `rm -rf .agentic-qe` ALLOWED.
// The guard was advertised, installed, trusted — and inert. The tests hid it by symlinking the
// package into the temp project, which is exactly the condition a real target repo does not have.
//
// The fix is to bake the EMITTING installation's absolute path into the body at emission time, as a
// FALLBACK after the project-local candidates: a consumer that has its own harness-core keeps using
// its own copy, and everyone else reaches the installation that wrote the hook.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The directory holding this module's own compiled siblings.
 *
 * In a published install that is `<pkg>/dist`; under vitest, where the SOURCE is executed, it is
 * `<pkg>/src`. Callers that need a BUILT sibling must therefore ask for {@link harnessCoreDistDir},
 * which normalises the second case — a body that baked `<pkg>/src/foo.js` would be a path that
 * exists in no installation at all.
 */
export function harnessCoreModuleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * The directory the emitted hook bodies must point at: the one holding the BUILT modules.
 *
 * `src` → its sibling `dist`, anything else → itself. The mapping is deliberately this narrow: the
 * only two layouts that exist are "running the build" and "running the sources under the test
 * runner", and inventing a search would turn a fact into a guess.
 */
export function harnessCoreDistDir(): string {
  const dir = harnessCoreModuleDir();
  return dir.endsWith('/src') || dir.endsWith('\\src') ? `${dir.slice(0, -3)}dist` : dir;
}
