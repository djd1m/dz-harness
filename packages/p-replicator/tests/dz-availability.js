'use strict';

/**
 * Backlog 1b4857a6. Several cases here need a REAL `dz` on PATH — they delete or read the `.dz`
 * state that only dz creates. The insight writer already reports the two ways that can go wrong
 * with DIFFERENT words: `absent` is ENOENT on the spawn (no dz anywhere), `failed` is dz running
 * and erroring. Conflating them is what made these cases green on a developer machine, where a
 * global dz happens to be installed, and red on a CI runner, where nothing installs one:
 * MEASURED 2026-09-19 (runs 35433442559, 35434913155, 35444026540) — `'absent' !== 'ok'`.
 *
 * So a MISSING TOOL is an audible skip and a BROKEN TOOL stays red. The skip is printed as well as
 * registered, because a silent skip is how a test stops proving anything without anyone noticing —
 * the same contract `announceNpmSkip` keeps in `tests/npm-cli-resolver.js`.
 *
 * Deliberately self-contained: `tests/` is published with this package (see `files` in
 * package.json), so nothing here may reach outside it.
 */

/**
 * @param {{skip:(reason:string)=>void}} t — the node:test context
 * @param {string} teachState — the writer's `teach.state`
 * @param {string} caseNote — what this case needs dz FOR, in one clause
 * @returns {boolean} true when the case must stop (dz is absent and the skip is registered)
 */
function skipWhenDzAbsent(t, teachState, caseNote) {
  if (teachState !== 'absent') return false;
  const reason = `SKIPPED — this case needs a real \`dz\` on PATH (${caseNote}); the writer `
    + 'reported teach.state=absent, which is ENOENT on the spawn — no dz was found, not dz failing.';
  process.stdout.write(`${reason}\n`);
  t.skip(reason);
  return true;
}

module.exports = { skipWhenDzAbsent };
