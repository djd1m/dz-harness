'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, fileExists, readJSON,
  ensureDir, getRelativePaths, diffFiles,
  hashFile,
  readManifest, writeManifest, getTemplatesDir,
  COMPONENTS, MANIFEST_FILE,
} = require('../utils');

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/keysarium update` — Update an existing toolkit installation.
 *
 * @param {object} options
 * @param {boolean} options.dryRun    — Preview without writing anything
 * @param {boolean} options.force     — Back up and replace a locally edited planner agent
 * @param {string}  options.targetDir — Destination project root
 */
async function run(options) {
  const { dryRun, force, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read existing manifest ───────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('Keysarium is not installed in this directory.');
    info(`Run ${cyan('npx @dzhechkov/keysarium init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError('Failed to read .keysarium.json — file may be corrupted.');
    process.exit(1);
  }

  const templatesDir = getTemplatesDir();

  // ── b) Get installed components ─────────────────────────────────────────
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

  // ── c) Diff each component ──────────────────────────────────────────────
  let totalAdded = 0;
  let totalModified = 0;
  let totalUnchanged = 0;
  let preservedPlanner = false;
  const filesToCopy = []; // { src, dest, status, relPath }
  const plannerRel = path.join('.claude', 'agents', 'code-goal-planner.md');
  // The unmodified wrapper shipped before the full agent was introduced.
  const legacyPlannerHash = 'fd6faca31bacfa3c70c0ff2a8ba152957d952b8590b4df0934ffd19af5078592';

  for (const key of installedKeys) {
    const comp = COMPONENTS[key];
    if (!comp) {
      warn(`Unknown component "${key}" in manifest — skipping.`);
      continue;
    }

    const srcBase = path.join(templatesDir, comp.src);
    const destBase = path.join(targetDir, comp.src);

    if (!fileExists(srcBase)) {
      warn(`Template source not found for "${key}" — skipping.`);
      continue;
    }

    if (comp.isFile) {
      // Single file comparison
      if (!fileExists(destBase)) {
        filesToCopy.push({ src: srcBase, dest: destBase, status: 'added', relPath: comp.src });
        totalAdded++;
      } else {
        const srcContent = fs.readFileSync(srcBase);
        const destContent = fs.readFileSync(destBase);
        if (srcContent.equals(destContent)) {
          totalUnchanged++;
        } else {
          filesToCopy.push({ src: srcBase, dest: destBase, status: 'modified', relPath: comp.src });
          totalModified++;
        }
      }
    } else {
      // Directory — use diffFiles utility
      const diff = diffFiles(srcBase, destBase);

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
        const relPath = path.join(comp.src, rel);
        let backup = false;
        if (relPath === plannerRel) {
          const currentHash = hashFile(path.join(destBase, rel));
          const baseline = manifest.templateHashes?.[plannerRel];
          const clean = currentHash === baseline || (!baseline && currentHash === legacyPlannerHash);
          if (!clean && !force) {
            preservedPlanner = true;
            continue;
          }
          backup = !clean;
        }
        filesToCopy.push({
          src: path.join(srcBase, rel),
          dest: path.join(destBase, rel),
          status: 'modified',
          relPath,
          backup,
        });
        totalModified++;
      }

      totalUnchanged += diff.unchanged.length;
    }
  }

  // ── Show diff summary ───────────────────────────────────────────────────
  info(bold('Update summary:'));
  console.log(`  ${green('+')} ${totalAdded} file(s) to add`);
  console.log(`  ${yellow('~')} ${totalModified} file(s) to update`);
  console.log(`  ${dim('=')} ${totalUnchanged} file(s) unchanged`);
  if (preservedPlanner) warn(`Local edit preserved: ${plannerRel}. Use --force to back up and replace it.`);
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
      if (f.backup) console.log(`         backup: ${f.relPath}.bak`);
    }
    console.log('');
    warn('Dry run — no files were written.');
    process.exit(0);
  }

  // ── d) Copy updated files ──────────────────────────────────────────────
  for (let i = 0; i < filesToCopy.length; i++) {
    const f = filesToCopy[i];
    const label = f.status === 'added' ? 'Adding' : 'Updating';
    step(i + 1, filesToCopy.length, `${label} ${f.relPath}`);

    ensureDir(path.dirname(f.dest));
    if (f.backup) fs.copyFileSync(f.dest, `${f.dest}.bak`);
    fs.copyFileSync(f.src, f.dest);
  }

  // ── e) Update manifest ─────────────────────────────────────────────────
  const allFiles = [];
  for (const key of installedKeys) {
    const comp = COMPONENTS[key];
    if (!comp) continue;
    const destPath = path.join(targetDir, comp.src);
    const srcPath = path.join(templatesDir, comp.src);
    if (comp.isFile) {
      if (fileExists(destPath)) {
        allFiles.push(comp.src);
      }
    } else if (fileExists(destPath)) {
      // Record files from the TEMPLATE source, not a scan of the destination —
      // otherwise user-created files in dest get adopted into the manifest and
      // a later `remove` would delete them.
      const paths = getRelativePaths(fileExists(srcPath) ? srcPath : destPath);
      allFiles.push(...paths.map((rel) => path.join(comp.src, rel)));
    }
  }

  manifest.version = newVersion;
  manifest.updatedAt = new Date().toISOString();
  manifest.files = allFiles.sort();
  const installedPlanner = path.join(targetDir, plannerRel);
  const templatePlanner = path.join(templatesDir, plannerRel);
  if (fileExists(installedPlanner) && fileExists(templatePlanner)
      && hashFile(installedPlanner) === hashFile(templatePlanner)) {
    manifest.templateHashes = { ...manifest.templateHashes, [plannerRel]: hashFile(templatePlanner) };
  }

  writeManifest(targetDir, manifest);
  info('Updated .keysarium.json manifest');

  // ── f) Summary ─────────────────────────────────────────────────────────
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
