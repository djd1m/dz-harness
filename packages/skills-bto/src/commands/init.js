'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, copyDirFiltered, fileExists, readJSON,
  ensureDir, getRelativePaths, getRelativePathsFiltered,
  createManifest, writeManifest, getTemplatesDir,
  COMPONENTS, MANIFEST_FILE, getComponentFilter,
} = require('../utils');

// ---------------------------------------------------------------------------
// Keysarium integration detection
// ---------------------------------------------------------------------------

const KEYSARIUM_MANIFEST = '.keysarium.json';

/**
 * Check if @dzhechkov/keysarium is installed in the target directory.
 * Returns the keysarium manifest or null if not found.
 */
function detectKeysarium(targetDir) {
  const manifestPath = path.join(targetDir, KEYSARIUM_MANIFEST);
  if (!fileExists(manifestPath)) return null;
  return readJSON(manifestPath);
}

/**
 * Show integration message when keysarium is detected.
 */
function showKeysariumIntegration(keysariumManifest) {
  console.log('');
  console.log(cyan('  ┌──────────────────────────────────────────────────┐'));
  console.log(cyan('  │') + bold(' @dzhechkov/keysarium detected!') + '                    ' + cyan('│'));
  console.log(cyan('  │') + ` Version: ${dim(keysariumManifest.version)}` + ' '.repeat(39 - keysariumManifest.version.length) + cyan('│'));
  console.log(cyan('  │') + ' BTO will integrate with existing Keysarium setup.  ' + cyan('│'));
  console.log(cyan('  │') + ' Shared directories: .claude/commands, rules, agents' + cyan('│'));
  console.log(cyan('  └──────────────────────────────────────────────────┘'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Copy a single BTO component from templates to the target directory.
 * Handles both full-directory (skill) and filtered (commands, rules, agents) components.
 * Returns array of relative file paths that were installed.
 */
function installComponent(key, comp, templatesDir, targetDir) {
  const src = path.join(templatesDir, comp.src);
  const dest = path.join(targetDir, comp.src);

  if (!fileExists(src)) {
    warn(`Template source not found: ${comp.src} — skipping.`);
    return [];
  }

  const filterFn = getComponentFilter(comp);

  if (filterFn) {
    // Filtered component — only copy matching files from shared directory
    copyDirFiltered(src, dest, filterFn);
    return getRelativePathsFiltered(src, filterFn).map((rel) => path.join(comp.src, rel));
  }

  // Non-filtered component — copy entire directory or file
  if (comp.isFile) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return [comp.src];
  }

  copyDirRecursive(src, dest);
  return getRelativePaths(src).map((rel) => path.join(comp.src, rel));
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/skills-bto init` — Install the BTO skill pack into the target project.
 *
 * @param {object} options
 * @param {boolean} options.force     — Overwrite existing installation
 * @param {boolean} options.dryRun    — Preview without writing anything
 * @param {string}  options.targetDir — Destination project root
 */
async function run(options) {
  const { force, dryRun, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check for existing BTO installation ─────────────────────────────
  if (fileExists(manifestPath)) {
    if (!force) {
      warn('BTO skill pack is already installed in this directory.');
      info(`Run ${cyan('@dzhechkov/skills-bto update')} to update, or use ${yellow('--force')} to overwrite.`);
      process.exit(1);
    }
    warn('Existing BTO installation found — overwriting (--force).');
  }

  // ── b) Detect keysarium integration ─────────────────────────────────────
  const keysariumManifest = detectKeysarium(targetDir);
  if (keysariumManifest) {
    showKeysariumIntegration(keysariumManifest);
  }

  // ── c) Determine components ─────────────────────────────────────────────
  const componentKeys = Object.keys(COMPONENTS);
  const templatesDir = getTemplatesDir();

  // ── d) Show plan ────────────────────────────────────────────────────────
  console.log('');
  info(bold('Installation plan:'));
  console.log('');

  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    const filterNote = comp.filter ? dim(` (filtered: ${comp.filter}*)`): '';
    console.log(`  ${green('+')} ${comp.label}${filterNote}`);
  }

  console.log('');

  if (dryRun) {
    warn('Dry run — no files were written.');
    process.exit(0);
  }

  // ── e) Install components ───────────────────────────────────────────────
  const totalComponents = componentKeys.length;
  const installedFiles = [];

  for (let i = 0; i < totalComponents; i++) {
    const key = componentKeys[i];
    const comp = COMPONENTS[key];
    step(i + 1, totalComponents, `Installing ${comp.label}...`);

    const files = installComponent(key, comp, templatesDir, targetDir);
    installedFiles.push(...files);
  }

  // ── f) Write manifest ──────────────────────────────────────────────────
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const version = pkg ? pkg.version : '0.0.0';

  const manifest = createManifest(version, componentKeys, installedFiles.sort());
  writeManifest(targetDir, manifest);
  info(`Created ${MANIFEST_FILE} manifest`);

  // ── g) Success summary ─────────────────────────────────────────────────
  console.log('');
  success(bold('BTO skill pack installed!'));
  console.log('');

  console.log(bold('Installed components:'));
  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label}`);
  }

  console.log('');
  console.log(bold('Next steps:'));
  console.log(`  1. Open ${cyan('Claude Code')} in this directory`);
  console.log(`  2. Run ${cyan('/bto [description]')} for the full BTO pipeline`);
  console.log(`  3. Or use individual phases:`);
  console.log(`     ${cyan('/bto-build')} ${dim('\u2014 Generate skill or command')}`);
  console.log(`     ${cyan('/bto-test')}  ${dim('\u2014 Multi-agent evaluation')}`);
  console.log('');

  if (keysariumManifest) {
    console.log(bold('Integration:'));
    console.log(`  BTO commands are available alongside your Keysarium pipeline.`);
    console.log(`  Run ${cyan('@dzhechkov/keysarium list')} to see all components.`);
    console.log('');
  }

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
