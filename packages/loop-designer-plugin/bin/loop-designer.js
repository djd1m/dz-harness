#!/usr/bin/env node
/**
 * `loop-designer` — the ONE entry point of this plugin (plan AM-9 / T2.9).
 *
 * Verbs:
 *   run <init|validate|render|lint|trace> [...]   dispatch to `dz`, behind the version guard
 *   init [--dir <project>] [--force] [--verify] [--print-plugin-dir]
 *   codex [--into <dir>]                          hand the authoring skill to a Codex project
 *   verify [--static] [--dir <project>]           front door to `dz skills-verify`
 *
 * ONE deterministic decision point (P-INV-16): the version guard lives HERE, in code, and never in
 * a command wrapper's prose. Prose cannot be tested and drifts silently across five files.
 *
 * dz AUTHORS, GATES and READS loops — it never RUNS one. Neither does this binary: `run render`
 * produces a script; executing it is the host harness's job (`Workflow({ scriptPath })`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DZ_RANGE, EXIT, SENTINELS } from '../lib/compat.js';
import { resolveDz } from '../lib/resolve-dz.js';
import { VERBS, runVerb } from '../lib/run-verb.js';
import { BARE_SKILL_DIR, installBareSkill, registrationExitCode, verifyWording } from '../lib/install-bare.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `loop-designer — author, gate and read agent loops (a thin, guarded front for dz ${DZ_RANGE})

  loop-designer run <${VERBS.join('|')}> [args…]   run a dz workflow verb (exit code passed through verbatim)
  loop-designer init [--dir <p>] [--force] [--verify]   marketplace-free install of the authoring skill
  loop-designer init --print-plugin-dir             print the path to pass to \`claude --plugin-dir\`
  loop-designer codex [--into <dir>]                deliver the authoring skill to a Codex project
  loop-designer verify [--static] [--dir <p>]       does the install actually REGISTER?

dz AUTHORS, GATES and READS loops — it never RUNS one. A rendered script is executed by the host
harness: Workflow({ scriptPath: '<rendered>.js' }).`;

function parse(argv) {
  const positional = [];
  const options = new Map();
  const flags = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { options.set(key, next); i += 1; }
      else flags.add(key);
    } else positional.push(arg);
  }
  return { positional, options, flags };
}

/** Sentinels go to STDERR so they never contaminate a verb's machine-readable stdout. */
function sentinel(line) {
  process.stderr.write(`${line}\n`);
}

/**
 * Resolve `dz`, printing every sentinel the resolver produced. Returns the resolution, or the exit
 * code to die with. Every command funnels through this — one decision point, five callers.
 */
function resolveOrExit() {
  const resolved = resolveDz();
  for (const note of resolved.notes) sentinel(note);
  if (!resolved.ok) {
    sentinel(`${resolved.sentinel}: ${resolved.message}`);
    return { failed: true, exitCode: resolved.exitCode };
  }
  return { failed: false, resolved };
}

/** Run a raw `dz` argv through the resolved binary, propagating its exit code verbatim. */
function runDz(resolved, args) {
  const r = spawnSync(resolved.command, [...resolved.args, ...args], { stdio: 'inherit', encoding: 'utf8' });
  if (r.error) {
    sentinel(`${SENTINELS.unavailable}: cannot run ${resolved.command}: ${r.error.message}`);
    return EXIT.unavailable;
  }
  // A child killed by a signal has `status === null` — not a success, and never 0.
  return typeof r.status === 'number' ? r.status : 1;
}

function cmdRun(rest) {
  const verb = rest[0];
  if (verb === undefined || !VERBS.includes(verb)) {
    sentinel(`loop-designer run: expected one of ${VERBS.join(', ')}`);
    return 1;
  }
  const step = resolveOrExit();
  if (step.failed) return step.exitCode;
  const result = runVerb(step.resolved, verb, rest.slice(1));
  if (result.error !== undefined) {
    sentinel(`${SENTINELS.unavailable}: ${result.error}`);
    return EXIT.unavailable;
  }
  return result.exitCode;
}

function cmdInit({ options, flags }) {
  if (flags.has('print-plugin-dir')) {
    process.stdout.write(`${packageRoot}\n`);
    return 0;
  }
  const projectDir = resolve(options.get('dir') ?? process.cwd());
  const result = installBareSkill(projectDir, { force: flags.has('force') });
  if (!result.ok) {
    sentinel(`loop-designer init: ${result.reason}`);
    for (const c of result.conflicts) sentinel(`  would replace: ${join(result.installDir, c)}`);
    for (const s of result.stale) sentinel(`  stale survivor (not in this release): ${join(result.installDir, s)}`);
    return 1;
  }
  process.stdout.write(`loop-designer init: installed ${result.written.length} file(s) into ${result.installDir}\n`);
  for (const s of result.removedStale) {
    process.stdout.write(`  removed stale file not in this release: ${join(result.installDir, s)}\n`);
  }
  process.stdout.write(`  the skill registers as "${BARE_SKILL_DIR}" (the directory name IS the registered name)\n`);
  process.stdout.write('  slash commands are NOT part of this path — they require a plugin load\n');
  if (!flags.has('verify')) return 0;

  // `--verify` maps `dz skills-verify`'s verdict LITERALLY (ADR-003 D-5): 0 pass · 1 fail ·
  // 2 inconclusive. An unconfirmed registration is never announced as success.
  const step = resolveOrExit();
  if (step.failed) return step.exitCode;
  const code = runDz(step.resolved, ['skills-verify', '--dir', projectDir, '--expect', BARE_SKILL_DIR]);
  const verdict = code === 0 ? 'pass' : code === 1 ? 'fail' : 'inconclusive';
  process.stdout.write(`loop-designer init --verify: ${verifyWording(verdict)}\n`);
  return registrationExitCode(verdict);
}

function cmdCodex({ options }) {
  const into = resolve(options.get('into') ?? process.cwd());
  const step = resolveOrExit();
  if (step.failed) return step.exitCode;
  const code = runDz(step.resolved, ['init', '--target', 'codex', '--select', 'loop-plan-author', '--project', into]);
  if (code === 0) {
    process.stdout.write(
      'loop-designer codex: a Codex session can author, validate, render and lint a loop — ' +
        'it cannot RUN one. Hand the rendered script to Claude Code.\n',
    );
  }
  return code;
}

function cmdVerify({ options, flags }) {
  const projectDir = resolve(options.get('dir') ?? packageRoot);
  const step = resolveOrExit();
  if (step.failed) return step.exitCode;
  const args = ['skills-verify', '--dir', projectDir];
  if (flags.has('static')) args.push('--static');
  else if (existsSync(join(projectDir, '.claude-plugin', 'plugin.json'))) args.push('--plugin-dir', projectDir);
  const code = runDz(step.resolved, args);
  if (code === 2) sentinel(`loop-designer verify: ${verifyWording('inconclusive')}`);
  return code;
}

export function main(argv) {
  // `run` is handled from the RAW argv, before any parsing. Everything after the verb belongs to
  // `dz`, not to this wrapper: parsing it here would silently swallow the verb's own flags — which
  // it did, and the dogfood run caught it (`run init --name x --pattern barrier` scaffolded the
  // DEFAULT plan under the DEFAULT name because the options never reached the child).
  if (argv[0] === 'run') return cmdRun(argv.slice(1));

  const { positional, options, flags } = parse(argv);
  const command = positional[0];
  if (command === undefined || command === 'help' || flags.has('help')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  switch (command) {
    case 'init': return cmdInit({ options, flags });
    case 'codex': return cmdCodex({ options, flags });
    case 'verify': return cmdVerify({ options, flags });
    default:
      sentinel(`loop-designer: unknown command "${command}"`);
      process.stdout.write(`${USAGE}\n`);
      return 1;
  }
}

/** Re-exported so the tests can pin the 0/1/2 mapping at exactly this boundary. */
export { registrationExitCode };

// `pathToFileURL`, never a hand-built `file://${path}`: `import.meta.url` is percent-encoded, so a
// raw-path comparison FAILS for any install path containing a space or a non-ASCII character — the
// binary would silently exit 0 without running `main()` at all (QE fix round 1, HIGH-1; the
// spaced/Cyrillic path shapes are pinned by test/entry-point-path-shapes.test.mjs).
//
// AND realpath BOTH sides (cross-family review 2026-08-17, gpt-5.6-sol — MEASURED here first):
// npm installs this bin as a SYMLINK (`node_modules/.bin/loop-designer`), so `process.argv[1]` is
// the symlink path while Node realpaths the ESM entry's `import.meta.url` — the href compare was
// false and the binary silently exited 0 from the MOST common installed invocation. Realpathing
// both sides makes the compare symlink-shape-invariant in either direction (it also survives
// `--preserve-symlinks-main`, where the asymmetry flips). The catch-fallback keeps the old href
// compare for exotic argv[1] values realpath cannot stat — never a bypass, only a narrower match.
function isCliEntry() {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv1);
  } catch {
    return import.meta.url === pathToFileURL(argv1).href;
  }
}
if (isCliEntry()) {
  process.exit(main(process.argv.slice(2)));
}
