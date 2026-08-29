/**
 * Verb dispatch and EXIT-CODE TRANSPARENCY (ADR-002 D-5, AM-5, P-INV-15).
 *
 * The wrapped commands do not speak boolean. `dz workflow-lint` exits **0 pass · 1 fail · 3
 * inconclusive**; `dz skills-verify` exits **0 pass · 1 fail · 2 inconclusive**. Collapsing a 3
 * into a 1 — or worse, into a 0 — would let a wrapper report an *inconclusive* gate as a decided
 * one, which is precisely the class of defect the boundary between "gate" and "wrapper" exists to
 * prevent. So this file propagates the child's code byte-for-byte and adds nothing of its own.
 */

import { spawnSync } from 'node:child_process';

/** verb → the `dz` argv it stands for. The wrapper re-implements NOTHING (P-INV-4). */
export const VERB_ARGS = {
  init: ['workflow', 'init'],
  validate: ['workflow', 'validate'],
  render: ['workflow', 'render'],
  lint: ['workflow-lint'],
  trace: ['workflow-trace'],
};

export const VERBS = Object.keys(VERB_ARGS);

/**
 * Run one verb through an already-resolved `dz` and return the child's exact exit code.
 *
 * @param {{command: string, args: string[]}} resolved
 * @param {string} verb
 * @param {string[]} rest    forwarded VERBATIM — this wrapper does not re-derive the verb's flags
 * @param {{spawn?: typeof spawnSync, stdio?: 'inherit'|'pipe'}} [options]
 */
export function runVerb(resolved, verb, rest, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const mapped = VERB_ARGS[verb];
  if (mapped === undefined) {
    return { exitCode: 1, error: `unknown verb "${verb}" — expected one of: ${VERBS.join(', ')}` };
  }
  const argv = [...resolved.args, ...mapped, ...rest];
  const r = spawn(resolved.command, argv, { stdio: options.stdio ?? 'inherit', encoding: 'utf8' });
  if (r.error) return { exitCode: 1, error: `cannot run ${resolved.command}: ${r.error.message}` };
  // A child killed by a signal has `status === null`. That is not a success and must not become 0.
  if (typeof r.status !== 'number') {
    return { exitCode: 1, error: `${resolved.command} terminated without an exit status${r.signal ? ` (signal ${r.signal})` : ''}` };
  }
  return { exitCode: r.status, ...(typeof r.stdout === 'string' ? { stdout: r.stdout } : {}) };
}
