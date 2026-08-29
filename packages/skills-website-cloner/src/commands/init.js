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

function detectKeysarium(targetDir) {
  const manifestPath = path.join(targetDir, KEYSARIUM_MANIFEST);
  if (!fileExists(manifestPath)) return null;
  return readJSON(manifestPath);
}

function showKeysariumIntegration(keysariumManifest) {
  console.log('');
  console.log(cyan('  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'));
  console.log(cyan('  \u2502') + bold(' @dzhechkov/keysarium detected!') + '                    ' + cyan('\u2502'));
  console.log(cyan('  \u2502') + ` Version: ${dim(keysariumManifest.version)}` + ' '.repeat(39 - keysariumManifest.version.length) + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Website Cloner integrates with existing Keysarium.  ' + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Shared: .claude/commands, skills                    ' + cyan('\u2502'));
  console.log(cyan('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function installComponent(key, comp, templatesDir, targetDir) {
  const src = path.join(templatesDir, comp.src);
  const dest = path.join(targetDir, comp.src);

  if (!fileExists(src)) {
    warn(`Template source not found: ${comp.src} \u2014 skipping.`);
    return [];
  }

  // Single file copy (for isFile components)
  if (comp.isFile) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return [comp.src];
  }

  const filterFn = getComponentFilter(comp);

  if (filterFn) {
    copyDirFiltered(src, dest, filterFn);
    return getRelativePathsFiltered(src, filterFn).map((rel) => path.join(comp.src, rel));
  }

  copyDirRecursive(src, dest);
  return getRelativePaths(src).map((rel) => path.join(comp.src, rel));
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function run(options) {
  const { force, dryRun, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check for existing installation ─────────────────────────────────
  if (fileExists(manifestPath)) {
    if (!force) {
      warn('Website Cloner skill pack is already installed in this directory.');
      info(`Run ${cyan('@dzhechkov/skills-website-cloner update')} to update, or use ${yellow('--force')} to overwrite.`);
      process.exit(1);
    }
    warn('Existing Website Cloner installation found \u2014 overwriting (--force).');
  }

  // ── b) Detect keysarium integration ────────────────────────────────────
  const keysariumManifest = detectKeysarium(targetDir);

  if (keysariumManifest) {
    showKeysariumIntegration(keysariumManifest);
  }

  // ── c) Determine components ────────────────────────────────────────────
  const componentKeys = Object.keys(COMPONENTS);
  const templatesDir = getTemplatesDir();

  // ── d) Show plan ───────────────────────────────────────────────────────
  console.log('');
  info(bold('Installation plan:'));
  console.log('');

  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    const filterNote = comp.filter ? dim(` (filtered: ${comp.filter}*)`) : '';
    console.log(`  ${green('+')} ${comp.label}${filterNote}`);
  }

  console.log('');

  if (dryRun) {
    warn('Dry run \u2014 no files were written.');
    process.exit(0);
  }

  // ── e) Install components ──────────────────────────────────────────────
  const totalComponents = componentKeys.length;
  const installedFiles = [];
  let stepNum = 0;

  for (const key of componentKeys) {
    stepNum++;
    const comp = COMPONENTS[key];
    step(stepNum, totalComponents, `Installing ${comp.label}...`);

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
  success(bold('Website Cloner skill pack installed!'));
  console.log('');

  console.log(bold('Installed components:'));
  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label}`);
  }

  console.log('');
  console.log(bold('Next steps:'));
  console.log(`  1. Open ${cyan('Claude Code')} in this directory`);
  console.log(`  2. Run ${cyan('/clone-website [topic or question]')} to start analysis`);
  console.log(`  3. The skill orchestrates explore, research, and problem-solving`);
  console.log('');

  if (keysariumManifest) {
    console.log(bold('Integration:'));
    console.log(`  Website Cloner is available alongside your Keysarium pipeline.`);
    console.log(`  Use ${cyan('/casarium')} for research, ${cyan('/clone-website')} for deep analysis.`);
    console.log('');
  }

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
