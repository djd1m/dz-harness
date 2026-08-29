/**
 * The `dz` resolution state machine (05_architecture.md §3.2, ADR-002, plan T2.7).
 *
 *   Probe → Parse → {in-range | older | newer} → [capability probe] → FastPath | Npx | Refuse
 *
 * Two properties are load-bearing and each has its own test:
 *   · **P-INV-13** — an UNPARSEABLE `dz --version` never opens the fast path.
 *   · **P-INV-14** — a STALE global `dz` cannot win by PATH precedence. Being first on PATH is not
 *     a qualification.
 *
 * The probe function is INJECTED so the whole machine is testable without a real binary; the
 * default implementation is the only IO in this file and lives at the bottom.
 */

import { spawnSync } from 'node:child_process';

import { DZ_NPX_SPEC, DZ_RANGE, EXIT, SENTINELS, capabilityProbePasses, classifyDzVersion, parseDzVersion } from './compat.js';

/**
 * @typedef {(command: string, args: string[]) => { status: number|null, stdout: string, stderr: string, error?: Error }} Probe
 */

/** The real probe: run a command, capture its output, never throw. */
export function defaultProbe(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000 });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    ...(r.error ? { error: r.error } : {}),
  };
}

/**
 * Decide how (and whether) to invoke `dz`.
 *
 * @param {{ probe?: Probe, allowNpx?: boolean }} [options]
 * @returns {{ ok: true, command: string, args: string[], via: 'global'|'npx', notes: string[], version: string|null }
 *          | { ok: false, sentinel: string, message: string, exitCode: number, notes: string[] }}
 */
export function resolveDz(options = {}) {
  const probe = options.probe ?? defaultProbe;
  const allowNpx = options.allowNpx ?? true;
  const notes = [];

  // ── 1. The global fast path (F8): ask the `dz` on PATH what it is ──
  const global = probe('dz', ['--version']);
  if (global.error === undefined) {
    const version = parseDzVersion(global.stdout);
    const klass = classifyDzVersion(version);

    if (klass === 'in-range') {
      return { ok: true, command: 'dz', args: [], via: 'global', notes, version: version.raw };
    }

    if (klass === 'newer') {
      // Above the range is not automatically wrong — but it is not automatically right either.
      // Ask the binary whether it still has the verbs this plugin wraps (plan P2-b).
      const help = probe('dz', ['workflow', '--help']);
      if (capabilityProbePasses(help.status, `${help.stdout}${help.stderr}`)) {
        // ACCEPTED path ⇒ informational line, NEVER a `LOOP-DZ-*` sentinel (QE fix round 1,
        // HIGH-2). The sentinels are the authoritative REFUSAL channel every wrapper publishes;
        // emitting one on a success would teach a consumer to read a working run as a refusal.
        notes.push(
          `loop-designer: newer dz ${version.raw} accepted via capability probe (declared range ${DZ_RANGE})`,
        );
        return { ok: true, command: 'dz', args: [], via: 'global', notes, version: version.raw };
      }
      notes.push(
        `${SENTINELS.stale}: global dz ${version.raw} is newer than ${DZ_RANGE} and its capability probe FAILED ` +
          '(dz workflow --help did not list the wrapped verbs) — falling back to npx',
      );
    } else if (klass === 'below-floor') {
      // Right minor, pre-floor patch: this binary refuses the `--plugin-dir` flag (introduced in
      // 0.4.6) by name, so the user would get an unexplained child error. Name the real reason and
      // hand them the upgrade (QE fix round 1, MEDIUM-6).
      notes.push(
        `${SENTINELS.stale}: global dz ${version.raw} is below the ${DZ_RANGE} floor — this plugin passes ` +
          '--plugin-dir, introduced in harness-cli 0.4.6; upgrade with `npm i -g @dzhechkov/harness-cli` — falling back to npx',
      );
    } else {
      // `older` also covers "could not be parsed at all". Both must be named, because the two have
      // very different diagnostics for a human, and neither may open the fast path.
      notes.push(
        version === null
          ? `${SENTINELS.stale}: the dz on PATH did not print a parseable version (exit status is not evidence of a version) — falling back to npx`
          : `${SENTINELS.stale}: global dz ${version.raw} is older than ${DZ_RANGE} — falling back to npx`,
      );
    }
  }

  // ── 2. The npx fallback (F8) ──
  if (!allowNpx) {
    return {
      ok: false,
      sentinel: SENTINELS.unavailable,
      message: `no usable dz in ${DZ_RANGE} and the npx fallback is disabled`,
      exitCode: EXIT.unavailable,
      notes,
    };
  }

  // Resolve BEFORE running the verb. A fetch that fails mid-verb would leave partial work behind;
  // asking the fetched binary for its version first costs one cheap call and makes the failure
  // atomic — nothing ran (ADR-002 amendment B-2: `LOOP-DZ-UNAVAILABLE` covers fetch failure, not
  // merely npx absence). This is also why `dz --version` had to exist before this plugin could.
  const npx = probe('npx', ['-y', DZ_NPX_SPEC, '--version']);
  if (npx.error !== undefined) {
    return {
      ok: false,
      sentinel: SENTINELS.unavailable,
      message: `no dz in ${DZ_RANGE} on PATH and npx is not available (${npx.error.message}) — nothing was run`,
      exitCode: EXIT.unavailable,
      notes,
    };
  }
  const npxVersion = parseDzVersion(npx.stdout);
  if (npx.status !== 0 || npxVersion === null) {
    return {
      ok: false,
      sentinel: SENTINELS.unavailable,
      message:
        `npx could not deliver ${DZ_NPX_SPEC} (offline, registry outage or timeout) — nothing was run. ` +
        `Install it once with: npm i -g @dzhechkov/harness-cli`,
      exitCode: EXIT.unavailable,
      notes,
    };
  }
  if (classifyDzVersion(npxVersion) !== 'in-range') {
    return {
      ok: false,
      sentinel: SENTINELS.rangeUnsatisfiable,
      message: `npx resolved dz ${npxVersion.raw}, which is outside ${DZ_RANGE} — nothing was run`,
      exitCode: EXIT.rangeUnsatisfiable,
      notes,
    };
  }

  return { ok: true, command: 'npx', args: ['-y', DZ_NPX_SPEC], via: 'npx', notes, version: npxVersion.raw };
}
