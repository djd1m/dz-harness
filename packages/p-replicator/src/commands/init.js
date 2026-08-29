'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, cyan, bold, dim, yellow,
  info, success, warn, error: logError, step,
  copyDirRecursive, fileExists, readJSON, writeJSON, ensureDir,
  createManifest, writeManifest, readManifest, getTemplatesDir, getRelativePaths,
  COMPONENTS, MANIFEST_FILE,
  mergeSettingsJson, removeOrphanHooks,
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
  console.log(cyan('  \u2502') + ' PU skills will integrate with Keysarium setup.      ' + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Shared directories: .claude/commands, rules, agents  ' + cyan('\u2502'));
  console.log(cyan('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function installComponent(key, comp, templatesDir, targetDir, options) {
  const src = path.join(templatesDir, comp.src);
  const dest = path.join(targetDir, comp.src);

  if (!fileExists(src)) {
    warn(`Template source not found: ${comp.src} \u2014 skipping.`);
    return [];
  }

  // settings.json merge (v1.4.2 + v1.4.3 orphan detection): on --force, run
  // orphan cleanup (v1.4.3) using shippedDefaults from previous manifest, then
  // merge new template into the cleaned user settings. Use --reset-settings to
  // force full overwrite.
  if (
    comp.isFile &&
    comp.src.endsWith('.json') &&
    fileExists(dest) &&
    !(options && options.resetSettings)
  ) {
    try {
      const tplJson = readJSON(src);
      const existingJson = readJSON(dest);
      const fileKey = comp.src.split(/[/\\]/).pop();
      const oldTplJson =
        (options && options.previousManifest && options.previousManifest.shippedDefaults &&
         options.previousManifest.shippedDefaults[fileKey]) || null;

      // v1.4.3: remove hooks that were defaults in the old shipped template
      // but no longer exist in the new template (true orphans).
      const cleaned = removeOrphanHooks(existingJson, oldTplJson, tplJson);
      const mergedJson = mergeSettingsJson(cleaned, tplJson);
      writeJSON(dest, mergedJson);
      info(`Merged user customizations into ${comp.src} ${dim('(use --reset-settings to overwrite)')}`);
      return [comp.src];
    } catch (err) {
      warn(`settings merge failed (${err.message}) \u2014 falling back to overwrite`);
    }
  }

  copyDirRecursive(src, dest);

  // Single-file components (e.g., settings.json): manifest tracks the file directly,
  // since getRelativePaths(file) returns [] (it expects a directory).
  if (fs.statSync(src).isFile()) {
    return [comp.src];
  }

  // Track files from the TEMPLATE source, never a scan of the destination — matches
  // update.js's invariant (line ~112). Walking dest would adopt user-created files
  // into the manifest, and a later `remove` would then delete them (user data loss).
  return getRelativePaths(src).map((rel) => path.join(comp.src, rel));
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

function run(options) {
  const { force, dryRun, targetDir, resetSettings } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check for existing installation ──────────────────────────────────
  // Read previous manifest BEFORE we overwrite it. Used by installComponent
  // for orphan-hook detection in settings.json (v1.4.3).
  const previousManifest = readManifest(targetDir);
  if (fileExists(manifestPath)) {
    if (!force) {
      warn('P-Replicator is already installed in this directory.');
      info(`Run ${cyan('npx @dzhechkov/p-replicator update')} to update, or use ${bold('--force')} to overwrite.`);
      process.exit(1);
    }
    warn('Existing installation found \u2014 overwriting (--force).');
  }

  // ── b) Detect keysarium integration ─────────────────────────────────────
  const keysariumManifest = detectKeysarium(targetDir);
  if (keysariumManifest) {
    showKeysariumIntegration(keysariumManifest);
  }

  // ── c) Show plan ────────────────────────────────────────────────────────
  // Install only pre-shipped groups; project-generated groups have no `src` —
  // they describe artifacts created by /replicate at a later phase.
  const componentKeys = Object.keys(COMPONENTS).filter(
    (k) => COMPONENTS[k].kind === 'pre-shipped'
  );
  const templatesDir = getTemplatesDir();

  console.log('');
  info(bold('Installation plan:'));
  console.log('');

  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('+')} ${comp.label}`);
  }

  console.log('');

  if (dryRun) {
    warn('Dry run \u2014 no files were written.');
    process.exit(0);
  }

  // ── d) Install components ───────────────────────────────────────────────
  const totalComponents = componentKeys.length;
  const installedFiles = [];

  for (let i = 0; i < totalComponents; i++) {
    const key = componentKeys[i];
    const comp = COMPONENTS[key];
    step(i + 1, totalComponents, `Installing ${comp.label}...`);

    const files = installComponent(key, comp, templatesDir, targetDir, { resetSettings, previousManifest });
    installedFiles.push(...files);
  }

  // ── e) Write manifest ──────────────────────────────────────────────────
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const version = pkg ? pkg.version : '0.0.0';

  // v1.4.3: snapshot the settings.json template we just shipped, so the NEXT
  // upgrade can detect orphan hooks (hooks we used to ship but no longer do).
  const shippedDefaults = {};
  const settingsTemplatePath = path.join(templatesDir, '.claude', 'settings.json');
  if (fileExists(settingsTemplatePath)) {
    const tplContent = readJSON(settingsTemplatePath);
    if (tplContent) shippedDefaults['settings.json'] = tplContent;
  }
  const manifest = createManifest(version, componentKeys, installedFiles.sort(), shippedDefaults);
  writeManifest(targetDir, manifest);
  info(`Created ${MANIFEST_FILE} manifest`);

  // ── f) Success summary ─────────────────────────────────────────────────
  console.log('');
  success(bold('P-Replicator installed!'));
  console.log('');

  console.log(bold('Installed components:'));
  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label}`);
  }

  console.log('');
  console.log(`  ${dim('Total files:')} ${installedFiles.length}`);
  console.log('');

  console.log(bold('Next steps:'));
  console.log(`  1. Open ${cyan('Claude Code')} in this directory`);
  console.log(`  2. Run ${cyan('/replicate "Your product idea"')} for the full pipeline`);
  console.log(`  3. Follow 4-5 phases with interactive checkpoints`);
  console.log('');
  console.log(bold('Available commands after /replicate:'));
  console.log(`     ${cyan('/replicate')}  ${dim('\u2014 Full pipeline: idea \u2192 validated docs \u2192 toolkit')}`);
  console.log(`     ${cyan('/harvest')}    ${dim('\u2014 Extract reusable knowledge from projects')}`);
  console.log('');

  if (keysariumManifest) {
    console.log(bold('Integration:'));
    console.log('  PU commands are available alongside your Keysarium pipeline.');
    console.log(`  Run ${cyan('npx @dzhechkov/keysarium list')} to see all components.`);
    console.log('');
  }

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
