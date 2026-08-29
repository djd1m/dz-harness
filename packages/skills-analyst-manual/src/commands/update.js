'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, copyDirFiltered, fileExists, readJSON,
  ensureDir, getRelativePaths, getRelativePathsFiltered, diffFiles,
  readManifest, writeManifest, getTemplatesDir,
  COMPONENTS, MANIFEST_FILE, getComponentFilter,
} = require('../utils');

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function run(options) {
  const { dryRun, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read existing manifest ─────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('Analyst Manual skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-analyst-manual init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} \u2014 file may be corrupted.`);
    process.exit(1);
  }

  const templatesDir = getTemplatesDir();

  // ── b) Get installed components ───────────────────────────────────────
  const installedKeys = manifest.components || [];
  if (installedKeys.length === 0) {
    warn('Manifest lists no installed components. Consider running init instead.');
    process.exit(1);
  }

  info(`Current version: ${dim(manifest.version)}`);
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const newVersion = pkg ? pkg.version : manifest.version;
  info(`Available version: ${bold(newVersion)}`);
  console.log('');

  // ── c) Diff each component ────────────────────────────────────────────
  let totalAdded = 0;
  let totalModified = 0;
  let totalUnchanged = 0;
  const filesToCopy = [];

  for (const key of installedKeys) {
    const comp = COMPONENTS[key];
    if (!comp) {
      warn(`Unknown component "${key}" in manifest \u2014 skipping.`);
      continue;
    }

    const srcBase = path.join(templatesDir, comp.src);
    const destBase = path.join(targetDir, comp.src);

    if (!fileExists(srcBase)) {
      warn(`Template source not found for "${key}" \u2014 skipping.`);
      continue;
    }

    const filterFn = getComponentFilter(comp);
    const diff = diffFiles(srcBase, destBase, filterFn);

    for (const rel of diff.added) {
      filesToCopy.push({
        src: path.join(srcBase, rel),
        dest: path.join(destBase, rel),
        status: 'added',
        relPath: path.join(comp.src, rel),
      });
      totalAdded++;
    }

    for (const rel of diff.modified) {
      filesToCopy.push({
        src: path.join(srcBase, rel),
        dest: path.join(destBase, rel),
        status: 'modified',
        relPath: path.join(comp.src, rel),
      });
      totalModified++;
    }

    totalUnchanged += diff.unchanged.length;
  }

  // ── Show diff summary ─────────────────────────────────────────────────
  info(bold('Update summary:'));
  console.log(`  ${green('+')} ${totalAdded} file(s) to add`);
  console.log(`  ${yellow('~')} ${totalModified} file(s) to update`);
  console.log(`  ${dim('=')} ${totalUnchanged} file(s) unchanged`);
  console.log('');

  if (totalAdded === 0 && totalModified === 0) {
    success('Everything is up to date!');
    process.exit(0);
  }

  if (dryRun) {
    console.log(bold('Files to be changed:'));
    for (const f of filesToCopy) {
      const marker = f.status === 'added' ? green('+ ADD') : yellow('~ MOD');
      console.log(`  ${marker}  ${f.relPath}`);
    }
    console.log('');
    warn('Dry run \u2014 no files were written.');
    process.exit(0);
  }

  // ── d) Copy updated files ─────────────────────────────────────────────
  for (let i = 0; i < filesToCopy.length; i++) {
    const f = filesToCopy[i];
    const label = f.status === 'added' ? 'Adding' : 'Updating';
    step(i + 1, filesToCopy.length, `${label} ${f.relPath}`);

    ensureDir(path.dirname(f.dest));
    fs.copyFileSync(f.src, f.dest);
  }

  // ── e) Update manifest ────────────────────────────────────────────────
  const allFiles = [];
  for (const key of installedKeys) {
    const comp = COMPONENTS[key];
    if (!comp) continue;

    const destPath = path.join(targetDir, comp.src);
    const srcPath = path.join(templatesDir, comp.src);
    const filterFn = getComponentFilter(comp);
    const scanBase = fileExists(srcPath) ? srcPath : destPath;

    if (fileExists(destPath)) {
      // Scan the TEMPLATE source, not the destination, so user files aren't adopted.
      const paths = filterFn
        ? getRelativePathsFiltered(scanBase, filterFn)
        : getRelativePaths(scanBase);
      allFiles.push(...paths.map((rel) => path.join(comp.src, rel)));
    }
  }

  manifest.version = newVersion;
  manifest.updatedAt = new Date().toISOString();
  manifest.files = allFiles.sort();

  writeManifest(targetDir, manifest);
  info(`Updated ${MANIFEST_FILE} manifest`);

  // ── f) Summary ────────────────────────────────────────────────────────
  console.log('');
  success(bold('Update complete!'));
  console.log(`  ${green('+')} ${totalAdded} file(s) added`);
  console.log(`  ${yellow('~')} ${totalModified} file(s) updated`);
  console.log(`  ${dim('=')} ${totalUnchanged} file(s) unchanged`);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
