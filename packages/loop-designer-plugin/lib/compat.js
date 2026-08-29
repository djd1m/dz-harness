/**
 * The pure half of the `dz` version guard (ADR-002 D-2/D-3, amended by plan P2-b).
 *
 * The hole this closes was MEASURED, not imagined: before `harness-cli` 0.4.6, `dz --version`
 * printed the entire USAGE manual and exited **0**. A wrapper that keyed on the exit status would
 * have concluded "this `dz` answered me, it must be fine" and then invoked a pre-0.4 binary with
 * 0.4 semantics. So the rule here is absolute and has its own test:
 *
 *   **exit status is never evidence of a version. Only a parsed number is.**
 *
 * No IO in this file. Everything below takes text and returns a value.
 */

/**
 * The range this plugin is written against. Single source — README and wrappers quote it.
 *
 * The floor is 0.4.6, not 0.4.0 (QE fix round 1, MEDIUM-6): `loop-designer verify` passes
 * `--plugin-dir`, and that flag was INTRODUCED in `harness-cli` 0.4.6 — a 0.4.0–0.4.5 binary
 * refuses it by name and the user gets an unexplained child error instead of a named refusal.
 * `^0.4.6` means `>=0.4.6 <0.5.0` (caret on a 0.x pins the minor).
 */
export const DZ_RANGE = '^0.4.6';

/** The npm spec the fallback installs. Kept beside the range so the two cannot drift — the
 *  `^0.4.6` floor also stops a warm npx cache from serving a pre-floor 0.4.x. */
export const DZ_NPX_SPEC = '@dzhechkov/harness-cli@^0.4.6';

/** The 0.4.x floor patch, named once so the classifier and the refusal message cannot drift. */
export const DZ_FLOOR_PATCH = 6;

/**
 * Parse `dz --version` output into a semver triple, or `null`.
 *
 * `null` is returned for EVERY shape that is not a version: usage text, an empty string, a banner,
 * the literal `unknown`. A caller must treat `null` exactly like "older" — never like "probably
 * fine" (P-INV-13).
 */
export function parseDzVersion(stdout) {
  if (typeof stdout !== 'string') return null;
  const firstLine = stdout.split('\n').map((l) => l.trim()).find((l) => l !== '');
  if (firstLine === undefined) return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(firstLine);
  if (m === null) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Every numeric component is checked: `Number('1e999')` is Infinity, and an Infinity minor would
  // compare as "newer" forever.
  if (![major, minor, patch].every((n) => Number.isFinite(n))) return null;
  return { major, minor, patch, raw: `${major}.${minor}.${patch}` };
}

/**
 * Where a parsed version sits relative to `^0.4.6` (i.e. `>=0.4.6 <0.5.0`).
 *
 *   `in-range`    — 0.4.6+, use it.
 *   `below-floor` — 0.4.0–0.4.5: right minor, but predates `--plugin-dir` (introduced 0.4.6).
 *                   Refused like `older`, with a specific upgrade hint the caller emits.
 *   `older`       — below the range: stale, must not be trusted.
 *   `newer`       — above the range. NOT a refusal (plan P2-b): a hard refusal here would break
 *                   every user the day `harness-cli` 0.5 ships. The caller runs a capability probe
 *                   and refuses only if the probe fails.
 *
 * `null` in ⇒ `'older'` out: an unreadable version is treated as the unsafe case, never the safe one.
 */
export function classifyDzVersion(version) {
  if (version === null || version === undefined) return 'older';
  const { major, minor, patch } = version;
  if (major === 0 && minor === 4) return patch >= DZ_FLOOR_PATCH ? 'in-range' : 'below-floor';
  if (major > 0 || (major === 0 && minor > 4)) return 'newer';
  return 'older';
}

/**
 * The stderr sentinels. These — not the exit codes — are the AUTHORITATIVE refusal channel
 * (ADR-002 amendment B-2): this wrapper propagates its child's exit code verbatim, and nothing
 * pins a future `dz` subcommand to the current 0/1/2/3 contract, so a numeric code can collide.
 * A sentinel line cannot.
 */
export const SENTINELS = {
  /** A global `dz` was found and REJECTED (stale, unparseable, below the floor, or failed its
   *  capability probe). NEVER emitted on an accepted resolution (QE fix round 1, HIGH-2): a
   *  sentinel on a success path teaches consumers to read a working run as a refusal. */
  stale: 'LOOP-DZ-STALE',
  /** No usable `dz` at all: none on PATH and npx is absent OR its fetch failed (offline/outage). */
  unavailable: 'LOOP-DZ-UNAVAILABLE',
  /** npx answered, but with a `dz` outside the declared range. */
  rangeUnsatisfiable: 'LOOP-DZ-RANGE-UNSATISFIABLE',
  /** A command wrapper's `${CLAUDE_PLUGIN_ROOT}` did not resolve at RUN TIME; the wrapper fell
   *  through to the npx form instead of dying with a raw MODULE_NOT_FOUND stack (AM-10). Emitted
   *  by the wrapper's shell block, not by this binary — named here so the vocabulary has one home. */
  pluginRootUnset: 'LOOP-DZ-PLUGIN-ROOT-UNSET',
};

/** Exit codes for the wrapper's OWN failures. Documented as advisory — key on the sentinel. */
export const EXIT = { unavailable: 4, rangeUnsatisfiable: 5 };

/**
 * Does a `dz workflow --help` transcript prove the verbs this plugin wraps actually exist?
 *
 * Used only on an above-range `dz`. Substrings, not a parse: the help text's exact layout is not a
 * contract, but the presence of a verb's own usage line is the cheapest honest evidence that the
 * verb is there. Absence ⇒ the probe FAILS ⇒ fall through to npx (never "assume it's fine").
 */
export const PROBE_MARKERS = [
  'dz workflow init',
  'dz workflow validate',
  'dz workflow render',
  'dz workflow-lint',
  'dz workflow-trace',
];

export function capabilityProbePasses(status, stdout) {
  if (status !== 0) return false;
  const text = typeof stdout === 'string' ? stdout : '';
  return PROBE_MARKERS.every((marker) => text.includes(marker));
}
