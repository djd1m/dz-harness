'use strict';

// limits.js — the budget registry loader and the `--limits` override contract (P1-3).
//
// A SEPARATE MODULE, and why: three unrelated files need the same resolved budgets (zip.js for the
// declared-size plan, extract.js for the ACTUAL-byte cap, transport.js for the download cap), and the
// CLI must validate an override BEFORE any network call or write. Putting the loader in any one of
// those three would have made the other two import a module for a reason unrelated to its name.
// The plan's file list names `registry/limits.json`; this is its reader.
//
// THERE IS EXACTLY ONE LIMITS KNOB: `--limits <file>`. No per-limit CLI flag exists in v1 (P1-3).
// The reason is not minimalism — it is that a dozen numeric flags is a dozen places to forget
// `Number.isFinite`, and this repository has already paid for that lesson once ("every numeric config
// clamp needs Number.isFinite"). One knob, one strict schema, one validator.
//
// AN OVER-CEILING VALUE IS REFUSED, NEVER SILENTLY CLAMPED DOWN. A clamp-down would let an operator
// ask for 8 GiB, be quietly given 2 GiB, and read the success as agreement. `usage error, exit 2` is
// the honest answer; the operator then chooses a number the tool will actually honour.
//
// THE MEMORY MODEL IS WHY max_download_bytes DEFAULTS TO 512 MiB (P1-2). zip.js parses the verified
// blob from a single in-memory buffer — in-memory BY DESIGN, because the alternative is a
// streaming-unzip dependency and NFR-4 says zero new runtime deps. Peak RSS therefore tracks archive
// size, so the shipped default is 512 MiB and the 2 GiB hard ceiling is reachable only by an
// explicit, visible `--limits` override.

const fs = require('node:fs');
const path = require('node:path');

const { IntakeUsageError } = require('./errors.js');

const SCHEMA = 'ha-intake-limits-1';

// Resolved from __dirname, NEVER process.cwd(): an installed skill at
// .claude/skills/health-advisor-intake-archive/engine/ runs with the user's project as the cwd.
const REGISTRY_PATH = path.join(__dirname, 'registry', 'limits.json');

const LIMIT_KEYS = Object.freeze([
  'max_entries',
  'max_entry_bytes',
  'max_total_bytes',
  'max_entry_ratio',
  'max_total_ratio',
  'max_path_depth',
  'max_name_bytes',
  'max_download_bytes',
  'max_redirects',
  'idle_timeout_ms',
  'total_timeout_ms',
]);

// The ONE limit an override may RAISE, and how far. Every other limit's ceiling is its registry
// default, so an override can only ever tighten it.
const RAISABLE_CEILINGS = Object.freeze({ max_download_bytes: 2147483648 });

function isPositiveInteger(v) {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 1;
}

/**
 * loadRegistryLimits() -> frozen limits object.
 *
 * A CORRUPT REGISTRY IS A HARD FAILURE, not a fallback to hard-coded numbers. A guard that silently
 * substitutes its own defaults when its configuration is unreadable is a guard whose configuration
 * nobody can trust — and the substituted numbers would be a second definition of the budgets.
 */
function loadRegistryLimits(registryPath = REGISTRY_PATH) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (err) {
    throw new IntakeUsageError(
      `intake limits registry unreadable at ${registryPath}: ${err.message}. The budgets are not ` +
      'optional and there is no built-in fallback set — a hardening budget that can silently vanish ' +
      'is not a budget. Nothing was read, dialled or written.',
      { reason: 'registry_unreadable' }
    );
  }
  if (raw === null || typeof raw !== 'object' || raw.schema !== SCHEMA) {
    throw new IntakeUsageError(
      `intake limits registry at ${registryPath} is not a ${SCHEMA} document (schema: ` +
      `${JSON.stringify(raw && raw.schema)}).`,
      { reason: 'registry_schema' }
    );
  }
  const out = {};
  for (const key of LIMIT_KEYS) {
    const value = raw[key];
    // Number.isFinite-clamped at LOAD, for registry values exactly as for overrides. A NaN that
    // reaches a comparison makes every `>` false — which is a budget that admits everything while
    // reading as enforced.
    if (!isPositiveInteger(value)) {
      throw new IntakeUsageError(
        `intake limits registry: ${key} must be a finite positive integer, got ${JSON.stringify(value)}.`,
        { reason: 'registry_value' }
      );
    }
    out[key] = value;
  }
  return Object.freeze(out);
}

/**
 * ceilingFor(key, registry) -> the highest value an override may set for `key`.
 */
function ceilingFor(key, registry) {
  return Object.prototype.hasOwnProperty.call(RAISABLE_CEILINGS, key)
    ? RAISABLE_CEILINGS[key]
    : registry[key];
}

/**
 * validateOverride(override, registry) -> frozen merged limits | throws IntakeUsageError.
 *
 * Strict subset of LIMIT_KEYS. `schema` is tolerated (a copied registry file is a natural thing for
 * an operator to edit down), nothing else is. Runs at CLI input-validation time — before the network,
 * before the lock, before a byte is written.
 */
function validateOverride(override, registry) {
  if (override === undefined || override === null) return registry;
  if (typeof override !== 'object' || Array.isArray(override)) {
    throw new IntakeUsageError(
      `--limits file must contain a JSON OBJECT of limit keys, got ${Array.isArray(override) ? 'an array' : typeof override}.`,
      { reason: 'limits_not_object' }
    );
  }
  const merged = { ...registry };
  for (const [key, value] of Object.entries(override)) {
    if (key === 'schema') {
      if (value !== SCHEMA) {
        throw new IntakeUsageError(
          `--limits file declares schema ${JSON.stringify(value)}; this build reads ${SCHEMA}.`,
          { reason: 'limits_schema' }
        );
      }
      continue;
    }
    if (!LIMIT_KEYS.includes(key)) {
      // An unknown key is a TYPO with a security consequence: `max_total_byte` would be accepted,
      // ignored, and the operator would believe a cap was raised or lowered when nothing changed.
      throw new IntakeUsageError(
        `--limits file: unknown limit "${key}". Known limits: ${LIMIT_KEYS.join(', ')}. ` +
        'An unknown key is refused rather than ignored — an ignored key reads as an applied one.',
        { reason: 'limits_unknown_key', key }
      );
    }
    if (!isPositiveInteger(value)) {
      throw new IntakeUsageError(
        `--limits file: ${key} must be a finite positive integer, got ${JSON.stringify(value)}. ` +
        'Non-finite, negative, zero, string and null values are REFUSED, never clamped: a clamped ' +
        'value is a limit the operator never chose.',
        { reason: 'limits_bad_value', key }
      );
    }
    const ceiling = ceilingFor(key, registry);
    if (value > ceiling) {
      throw new IntakeUsageError(
        `--limits file: ${key}=${value} exceeds its hard ceiling ${ceiling}` +
        (Object.prototype.hasOwnProperty.call(RAISABLE_CEILINGS, key)
          ? ' (the only raisable limit, and this is as far as it goes — zip parsing is in-memory by design)'
          : ' (its registry default; an override may only LOWER this limit)') +
        '. Refused, not clamped down.',
        { reason: 'limits_over_ceiling', key }
      );
    }
    merged[key] = value;
  }
  return Object.freeze(merged);
}

/**
 * readLimitsFile(filePath) -> the parsed override object | throws IntakeUsageError.
 */
function readLimitsFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new IntakeUsageError(`--limits ${filePath}: cannot read (${err.code || err.message}).`, { reason: 'limits_unreadable' });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new IntakeUsageError(`--limits ${filePath}: not valid JSON (${err.message}).`, { reason: 'limits_not_json' });
  }
}

/**
 * resolveLimits({ limitsFile, override, registryPath }) -> frozen limits. The ONE entry point run.js
 * and cli.js use, so registry-then-override precedence has a single home.
 */
function resolveLimits({ limitsFile = null, override = null, registryPath = REGISTRY_PATH } = {}) {
  const registry = loadRegistryLimits(registryPath);
  const raw = limitsFile !== null ? readLimitsFile(limitsFile) : override;
  return validateOverride(raw, registry);
}

module.exports = {
  SCHEMA,
  REGISTRY_PATH,
  LIMIT_KEYS,
  RAISABLE_CEILINGS,
  loadRegistryLimits,
  validateOverride,
  readLimitsFile,
  resolveLimits,
  ceilingFor,
};
