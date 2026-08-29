'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, copyDirTracked, fileExists, readJSON,
  ensureDir, getRelativePaths,
  createManifest, writeManifest, getTemplatesDir,
  COMPONENTS, MANIFEST_FILE,
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
  console.log(cyan('  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'));
  console.log(cyan('  \u2502') + bold(' @dzhechkov/keysarium detected!') + '                    ' + cyan('\u2502'));
  console.log(cyan('  \u2502') + ` Version: ${dim(keysariumManifest.version)}` + ' '.repeat(39 - keysariumManifest.version.length) + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Edu Site will integrate with existing Keysarium.   ' + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Shared directory: .claude/skills/                  ' + cyan('\u2502'));
  console.log(cyan('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Copy the Edu Site skill component from templates to the target directory.
 * Returns array of relative file paths that were installed.
 */
function installComponent(key, comp, templatesDir, targetDir, force) {
  const src = path.join(templatesDir, comp.src);
  const dest = path.join(targetDir, comp.src);

  if (!fileExists(src)) {
    warn(`Template source not found: ${comp.src} — skipping.`);
    return [];
  }

  // Tracked copy preserves pre-existing user files when --force is absent (no silent
  // clobber when the manifest is missing); manifest is derived from the template source.
  copyDirTracked(src, dest, force);
  return getRelativePaths(src).map((rel) => path.join(comp.src, rel));
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/skills-edu-site init` — Install the Edu Site skill pack into the target project.
 *
 * @param {object} options
 * @param {boolean} options.force     — Overwrite existing installation
 * @param {boolean} options.dryRun    — Preview without writing anything
 * @param {string}  options.targetDir — Destination project root
 */
async function run(options) {
  const { force, dryRun, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check for existing installation ──────────────────────────────────
  if (fileExists(manifestPath)) {
    if (!force) {
      warn('Edu Site skill pack is already installed in this directory.');
      info(`Run ${cyan('@dzhechkov/skills-edu-site update')} to update, or use ${yellow('--force')} to overwrite.`);
      process.exit(1);
    }
    warn('Existing Edu Site installation found — overwriting (--force).');
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
    console.log(`  ${green('+')} ${comp.label}`);
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

    const files = installComponent(key, comp, templatesDir, targetDir, force);
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
  success(bold('Edu Site skill pack installed!'));
  console.log('');

  console.log(bold('Installed components:'));
  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label}`);
  }

  console.log('');
  console.log(bold('Next steps:'));
  console.log(`  1. Open ${cyan('Claude Code')} in this directory`);
  console.log(`  2. Run ${cyan('/edu-site-generator [topic or docs path]')} to generate a site`);
  console.log(`  3. The skill will guide you through the full pipeline:`);
  console.log(`     ${cyan('Content Analysis')} ${dim('\u2014 Analyze source documentation')}`);
  console.log(`     ${cyan('Course Structure')} ${dim('\u2014 Generate learning modules')}`);
  console.log(`     ${cyan('Build & Deploy')}   ${dim('\u2014 Create React SPA with gamification')}`);
  console.log('');

  if (keysariumManifest) {
    console.log(bold('Integration:'));
    console.log(`  Edu Site skill is available alongside your Keysarium pipeline.`);
    console.log(`  Run ${cyan('@dzhechkov/keysarium list')} to see all components.`);
    console.log('');
  }

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
