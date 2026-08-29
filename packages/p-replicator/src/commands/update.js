'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, fileExists, readJSON, writeJSON,
  diffFiles, getRelativePaths,
  readManifest, writeManifest, createManifest, getTemplatesDir,
  COMPONENTS, MANIFEST_FILE,
  mergeSettingsJson, removeOrphanHooks,
} = require('../utils');

function run(options) {
  const { force, dryRun, targetDir, resetSettings } = options;

  // ── a) Check for existing installation ──────────────────────────────────
  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError('P-Replicator is not installed in this directory.');
    info(`Run ${cyan('npx @dzhechkov/p-replicator init')} first.`);
    process.exit(1);
  }

  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const newVersion = pkg ? pkg.version : '0.0.0';

  info(`Installed version: ${bold(manifest.version)}`);
  info(`Package version:   ${bold(newVersion)}`);
  console.log('');

  // ── b) Diff files ───────────────────────────────────────────────────────
  const templatesDir = getTemplatesDir();
  const templateClaude = path.join(templatesDir, '.claude');
  const projectClaude = path.join(targetDir, '.claude');

  if (!fileExists(templateClaude)) {
    logError('Template .claude/ directory not found in package.');
    process.exit(1);
  }

  const { added, modified, unchanged } = diffFiles(templateClaude, projectClaude);

  console.log(bold('Changes detected:'));
  console.log(`  ${green('+')} ${added.length} new files`);
  console.log(`  ${yellow('~')} ${modified.length} modified files`);
  console.log(`  ${dim('=')} ${unchanged.length} unchanged files`);
  console.log('');

  if (added.length === 0 && modified.length === 0) {
    // P3: refresh the recorded version even when templates are byte-identical, so the manifest is not
    // a STALE version record after a metadata-only release (doctor/update kept reporting the old
    // installed version). Only the version field changes — no files touched.
    if (manifest.version !== newVersion) {
      writeManifest(targetDir, { ...manifest, version: newVersion });
      info(`Version record refreshed to ${bold(newVersion)} (templates unchanged).`);
    }
    success('Already up to date!');
    process.exit(0);
  }

  // ── c) Show details ────────────────────────────────────────────────────
  if (added.length > 0) {
    console.log(green('New files:'));
    for (const f of added) {
      console.log(`  ${green('+')} .claude/${f}`);
    }
    console.log('');
  }

  if (modified.length > 0) {
    console.log(yellow('Modified files:'));
    for (const f of modified) {
      console.log(`  ${yellow('~')} .claude/${f}`);
    }
    console.log('');
  }

  if (dryRun) {
    warn('Dry run \u2014 no files were written.');
    process.exit(0);
  }

  // ── d) Apply updates ───────────────────────────────────────────────────
  // For each modified/added file: regular copy, EXCEPT settings.json — which
  // gets the same merge + orphan-cleanup treatment as init --force (v1.4.3).
  const filesToUpdate = [...added, ...modified];
  let updated = 0;
  const oldSettingsTpl = manifest.shippedDefaults && manifest.shippedDefaults['settings.json'];

  for (const rel of filesToUpdate) {
    const src = path.join(templateClaude, rel);
    const dest = path.join(projectClaude, rel);
    const normalized = rel.replace(/\\/g, '/');
    const isSettings = normalized === 'settings.json' || normalized.endsWith('/settings.json');

    if (isSettings && fileExists(dest) && !resetSettings) {
      try {
        const tplJson = readJSON(src);
        const existingJson = readJSON(dest);
        const cleaned = removeOrphanHooks(existingJson, oldSettingsTpl || null, tplJson);
        const mergedJson = mergeSettingsJson(cleaned, tplJson);
        writeJSON(dest, mergedJson);
        info(`Merged settings.json with user customizations ${dim('(use --reset-settings to overwrite)')}`);
      } catch (err) {
        warn(`settings merge failed (${err.message}) — falling back to overwrite`);
        copyDirRecursive(src, dest);
      }
    } else {
      copyDirRecursive(src, dest);
    }
    updated++;
  }

  // ── e) Update manifest ─────────────────────────────────────────────────
  // Track ONLY files shipped by the package's templates — never walk the user's
  // .claude/ tree. Walking projectClaude would capture project-generated files
  // (e.g. /replicate output: start.md, feature.md, plan.md) into manifest.files,
  // and a subsequent `remove` would then delete them, contradicting remove.js's
  // own "project-specific files were NOT removed" guarantee.
  const newTrackedFiles = getRelativePaths(templateClaude).map((f) => '.claude/' + f);
  const newTrackedSet = new Set(newTrackedFiles);

  // Orphan cleanup: files previously tracked by the package but no longer
  // shipped (skill removed in a new package version, etc.). Safe to delete
  // because they were package-owned. Project-generated files are never in the
  // old manifest, so they are never considered orphans.
  const oldTrackedFiles = manifest.files || [];
  const orphans = oldTrackedFiles.filter(
    (f) => f.startsWith('.claude/') && !newTrackedSet.has(f)
  );

  let removedOrphans = 0;
  for (const orphan of orphans) {
    const fullPath = path.join(targetDir, orphan);
    if (fileExists(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        removedOrphans++;
      } catch (err) {
        warn(`Could not remove orphan: ${orphan} (${err.message})`);
      }
    }
  }

  // Manifest tracks only pre-shipped groups (project-generated groups describe
  // /replicate Phase 3 outputs, not files this package owns).
  const componentKeys = Object.keys(COMPONENTS).filter(
    (k) => COMPONENTS[k].kind === 'pre-shipped'
  );
  // v1.4.3: refresh shippedDefaults snapshot for the next upgrade to use.
  const shippedDefaults = {};
  const settingsTemplatePath = path.join(templateClaude, 'settings.json');
  if (fileExists(settingsTemplatePath)) {
    const tplContent = readJSON(settingsTemplatePath);
    if (tplContent) shippedDefaults['settings.json'] = tplContent;
  }
  const newManifest = createManifest(newVersion, componentKeys, newTrackedFiles.sort(), shippedDefaults);
  writeManifest(targetDir, newManifest);

  console.log('');
  let summary = `Updated ${updated} files to version ${bold(newVersion)}`;
  if (removedOrphans > 0) {
    summary += dim(` (+ ${removedOrphans} orphan${removedOrphans === 1 ? '' : 's'} removed)`);
  }
  success(summary);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
