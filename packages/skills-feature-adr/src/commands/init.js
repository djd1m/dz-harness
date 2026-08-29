'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  fileExists, readJSON,
  ensureDir, getRelativePaths, getRelativePathsFiltered,
  createManifest, readManifest, writeManifest, getTemplatesDir,
  toManifestPath, fromManifestPath, hashFile,
  COMPONENTS, OPTIONAL_COMPONENTS, MANIFEST_FILE, getComponentFilter,
} = require('../utils');

// ---------------------------------------------------------------------------
// Keysarium integration detection
// ---------------------------------------------------------------------------

const KEYSARIUM_MANIFEST = '.keysarium.json';

function detectKeysarium(targetDir) {
  const manifestPath = path.join(targetDir, KEYSARIUM_MANIFEST);
  if (!fileExists(manifestPath)) return null;
  const manifest = readJSON(manifestPath);
  if (manifest === null) {
    // File exists but did not parse — say so distinctly instead of silently
    // pretending keysarium is absent.
    console.log(yellow('⚠') + ' .keysarium.json exists but is unreadable (corrupted?) — treating as not installed');
    return null;
  }
  return manifest;
}

function showKeysariumIntegration(keysariumManifest) {
  console.log('');
  console.log(cyan('  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'));
  // Interior width is 50 columns (the borders above/below have 50 dashes) \u2014
  // every content line must render exactly 50 visible chars wide.
  console.log(cyan('  \u2502') + bold(' @dzhechkov/keysarium detected!') + '                   ' + cyan('\u2502'));
  const v = keysariumManifest.version;
  const kv = typeof v === 'string' && v.length ? v : 'unknown';
  // ' Version: ' is 10 chars, so padding = 50 - 10 - kv.length; the Math.max
  // clamp keeps over-long version strings from producing a negative repeat.
  console.log(cyan('  \u2502') + ` Version: ${dim(kv)}` + ' '.repeat(Math.max(0, 40 - kv.length)) + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Feature ADR integrates with existing Keysarium.  ' + cyan('\u2502'));
  console.log(cyan('  \u2502') + ' Shared: .claude/commands, rules, skills          ' + cyan('\u2502'));
  console.log(cyan('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Copies a component file-by-file with per-file overwrite protection:
//   - destination missing            -> write, record in `written`
//   - destination exists + --force   -> overwrite, record in `written`
//   - destination exists, no --force -> do NOT write, record in `preserved`
// In dry-run mode nothing is written, but the same written/preserved
// classification is produced.
// Returns { missing, fileCount } where `missing` means the template source
// was absent on disk and `fileCount` is how many files the template provides.
function installComponent(key, comp, templatesDir, targetDir, opts) {
  const { force, dryRun, written, preserved, hashes } = opts;
  const src = path.join(templatesDir, comp.src);
  const destRoot = path.join(targetDir, comp.src);

  if (!fileExists(src)) {
    warn(`Template source not found: ${comp.src} \u2014 skipping.`);
    return { missing: true, fileCount: 0 };
  }

  // Build the file list from the TEMPLATE source, never a scan of the destination — otherwise
  // user-created files inside a component dir get adopted into the manifest and a later
  // `remove` deletes them (finding #8).
  // Manifest `rel` entries are stored POSIX-normalized (toManifestPath) so a
  // manifest written on Windows keeps working on posix and vice versa.
  let entries;
  if (comp.isFile) {
    entries = [{ srcFile: src, destFile: destRoot, rel: toManifestPath(comp.src) }];
  } else {
    const filterFn = getComponentFilter(comp);
    const rels = filterFn ? getRelativePathsFiltered(src, filterFn) : getRelativePaths(src);
    entries = rels.map((rel) => ({
      srcFile: path.join(src, rel),
      destFile: path.join(destRoot, rel),
      rel: toManifestPath(path.join(comp.src, rel)),
    }));
  }

  for (const entry of entries) {
    if (fileExists(entry.destFile) && !force) {
      preserved.push(entry.rel);
      continue;
    }
    if (!dryRun) {
      ensureDir(path.dirname(entry.destFile));
      fs.copyFileSync(entry.srcFile, entry.destFile);
      // Record the SHA-256 of the TEMPLATE bytes we just installed (not the
      // dest) as this file's baseline. This makes baseline == mine immediately
      // after init — the invariant the 3-way `update` decision relies on.
      // Preserved (pre-existing, not written by us) files get NO baseline: we
      // did not install those bytes, so they fall through to update's
      // conservative "no baseline → legacy" path. dry-run computes none.
      if (hashes) hashes[entry.rel] = hashFile(entry.srcFile);
    }
    written.push(entry.rel);
  }

  return { missing: false, fileCount: entries.length };
}

// Print the block of pre-existing files that were (or would be) preserved
function printPreservedBlock(preserved, dryRun) {
  console.log('');
  const verb = dryRun ? 'would be preserved' : 'preserved';
  warn(`${preserved.length} pre-existing file(s) ${verb} (not overwritten, not tracked by the manifest) — use --force to overwrite:`);
  const MAX_SHOWN = 10;
  for (const rel of preserved.slice(0, MAX_SHOWN)) {
    console.log(`  ${yellow('⚠')} ${rel}`);
  }
  if (preserved.length > MAX_SHOWN) {
    console.log(dim(`  …and ${preserved.length - MAX_SHOWN} more`));
  }
}

// Files tracked by the PREVIOUS install's manifest that the current template
// set no longer provides. They were ours (the old manifest says so), so a
// --force reinstall must clean them up or they stay on disk untracked forever.
// Contained-path check (path.resolve + prefix) before every candidate — same
// discipline remove.js uses; anything resolving outside the project is skipped.
function findOrphans(oldManifest, newFileSet, resolvedTarget) {
  if (!oldManifest || !Array.isArray(oldManifest.files)) return [];
  const orphans = [];
  for (const oldRel of oldManifest.files) {
    const posixRel = toManifestPath(oldRel);
    if (newFileSet.has(posixRel)) continue;
    const absPath = path.resolve(resolvedTarget, fromManifestPath(oldRel));
    if (absPath === resolvedTarget || !absPath.startsWith(resolvedTarget + path.sep)) continue;
    if (!fileExists(absPath)) continue;
    orphans.push({ rel: posixRel, absPath });
  }
  return orphans;
}

// Resolve which optional component keys to install based on flags
function getOptionalKeys(flags, keysariumDetected) {
  if (keysariumDetected) return []; // keysarium already provides these

  const keys = [];

  if (flags.withLearning) {
    for (const [key, comp] of Object.entries(OPTIONAL_COMPONENTS)) {
      if (comp.group === 'learning') keys.push(key);
    }
  }

  if (flags.knowledgeExtractor) {
    for (const [key, comp] of Object.entries(OPTIONAL_COMPONENTS)) {
      if (comp.group === 'knowledge-extractor') keys.push(key);
    }
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function run(options) {
  const { force, dryRun, targetDir, withLearning, knowledgeExtractor } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check for existing installation ─────────────────────────────────
  let oldManifest = null; // previous install's manifest (for orphan cleanup)
  if (fileExists(manifestPath)) {
    if (!force) {
      warn('Feature ADR skill pack is already installed in this directory.');
      info(`Run ${cyan('@dzhechkov/skills-feature-adr update')} to update, or use ${yellow('--force')} to overwrite.`);
      process.exit(1);
    }
    warn('Existing Feature ADR installation found \u2014 overwriting (--force).');
    oldManifest = readManifest(targetDir);
  }

  // ── b) Detect keysarium integration ────────────────────────────────────
  const keysariumManifest = detectKeysarium(targetDir);
  const keysariumDetected = !!keysariumManifest;

  if (keysariumManifest) {
    showKeysariumIntegration(keysariumManifest);
  }

  // Warn if flags used but keysarium already provides these
  if (keysariumDetected && (withLearning || knowledgeExtractor)) {
    console.log('');
    warn('Keysarium is already installed \u2014 it includes learning and knowledge extraction.');
    info('Flags --with-learning and --knowledge-extractor are not needed. Skipping optional components.');
    console.log('');
  }

  // ── c) Determine components ────────────────────────────────────────────
  const componentKeys = Object.keys(COMPONENTS);
  const optionalKeys = getOptionalKeys(options, keysariumDetected);
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

  if (optionalKeys.length > 0) {
    console.log('');
    info(bold('Optional components:'));
    console.log('');
    for (const key of optionalKeys) {
      const comp = OPTIONAL_COMPONENTS[key];
      console.log(`  ${yellow('+')} ${comp.label}`);
    }
  }

  console.log('');

  // ── e) Install components (classify-only when --dry-run) ────────────────
  const totalComponents = componentKeys.length + optionalKeys.length;
  const installedFiles = [];   // files written (or would-write in dry-run)
  const installedHashes = {};  // rel -> sha256 of the TEMPLATE bytes installed (baseline)
  const preservedFiles = [];   // pre-existing files NOT overwritten (no --force)
  const completedKeys = [];    // component keys processed so far (for partial manifest)
  const installedOptionalKeys = [];
  let stepNum = 0;
  const installVerb = dryRun ? 'Checking' : 'Installing';

  try {
    for (const key of componentKeys) {
      stepNum++;
      const comp = COMPONENTS[key];
      step(stepNum, totalComponents, `${installVerb} ${comp.label}...`);

      installComponent(key, comp, templatesDir, targetDir, {
        force, dryRun, written: installedFiles, preserved: preservedFiles,
        hashes: installedHashes,
      });
      completedKeys.push(key);
    }

    // ── e2) Install optional components — track which actually installed ──
    // Components whose template source is missing report missing=true;
    // we must NOT record them in the manifest, otherwise `update` reports
    // "Unknown component" on subsequent runs.
    for (const key of optionalKeys) {
      stepNum++;
      const comp = OPTIONAL_COMPONENTS[key];
      step(stepNum, totalComponents, `${installVerb} ${comp.label}...`);

      const res = installComponent(key, comp, templatesDir, targetDir, {
        force, dryRun, written: installedFiles, preserved: preservedFiles,
        hashes: installedHashes,
      });
      if (!res.missing && res.fileCount > 0) {
        installedOptionalKeys.push(key);
        completedKeys.push(key);
      }
    }
  } catch (err) {
    // ── Non-atomic install recovery: record what WAS written so far ───────
    console.log('');
    logError(`Install failed: ${err && err.message ? err.message : err}`);
    if (!dryRun) {
      try {
        const failPkg = readJSON(path.resolve(__dirname, '../../package.json'));
        const partialManifest = createManifest(
          failPkg ? failPkg.version : '0.0.0',
          completedKeys,
          installedFiles.sort(),
          installedHashes
        );
        partialManifest.partial = true;
        writeManifest(targetDir, partialManifest);
      } catch (writeErr) {
        logError(`Could not write partial manifest: ${writeErr && writeErr.message ? writeErr.message : writeErr}`);
      }
      info(`Partial install recorded in ${MANIFEST_FILE} — run \`npx @dzhechkov/skills-feature-adr remove\` to clean up, or fix the cause and re-run init.`);
    }
    process.exit(1);
  }

  // ── e3) Dry-run report: same would-write / would-preserve classification ─
  if (dryRun) {
    console.log('');
    info(`Dry run: ${installedFiles.length} file(s) would be written, ${preservedFiles.length} pre-existing file(s) would be preserved.`);
    if (preservedFiles.length > 0) {
      printPreservedBlock(preservedFiles, true);
    }
    if (force && oldManifest) {
      const dryOrphans = findOrphans(
        oldManifest,
        new Set([...installedFiles, ...preservedFiles]),
        path.resolve(targetDir)
      );
      if (dryOrphans.length > 0) {
        console.log('');
        info(`${dryOrphans.length} orphaned file(s) from the previous install would be removed:`);
        for (const o of dryOrphans) {
          console.log(`  ${yellow('⚠')} ${o.rel}`);
        }
      }
    }
    console.log('');
    warn('Dry run — no files were written.');
    process.exit(0);
  }

  if (preservedFiles.length > 0) {
    printPreservedBlock(preservedFiles, false);
    console.log('');
  }

  // ── f) Write manifest ──────────────────────────────────────────────────
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const version = pkg ? pkg.version : '0.0.0';

  // Only manifest components whose templates were actually present on disk
  const allKeys = [...componentKeys, ...installedOptionalKeys];
  const manifest = createManifest(version, allKeys, installedFiles.sort(), installedHashes);

  // Track optional features in manifest based on actual installs
  manifest.optional = {
    withLearning: installedOptionalKeys.some((k) => OPTIONAL_COMPONENTS[k]?.group === 'learning'),
    knowledgeExtractor: installedOptionalKeys.some((k) => OPTIONAL_COMPONENTS[k]?.group === 'knowledge-extractor'),
  };

  writeManifest(targetDir, manifest);
  info(`Created ${MANIFEST_FILE} manifest`);

  // ── f2) Orphan cleanup (--force reinstall) ─────────────────────────────
  // Files the OLD manifest tracked that the new install no longer provides
  // would otherwise stay on disk untracked forever. They were ours — the old
  // manifest says so — so delete them now that the new install is complete.
  if (force && oldManifest) {
    const orphans = findOrphans(
      oldManifest,
      new Set([...installedFiles, ...preservedFiles]),
      path.resolve(targetDir)
    );
    const removedOrphans = [];
    for (const o of orphans) {
      try {
        fs.unlinkSync(o.absPath);
        removedOrphans.push(o.rel);
      } catch (err) {
        warn(`Could not remove orphaned file ${o.rel}: ${err.message}`);
      }
    }
    if (removedOrphans.length > 0) {
      console.log('');
      console.log(`${green('✓')} removed ${removedOrphans.length} orphaned file(s) from the previous install:`);
      for (const rel of removedOrphans) {
        console.log(`  ${dim(rel)}`);
      }
    }
  }

  // ── g) Success summary ─────────────────────────────────────────────────
  console.log('');
  success(bold('Feature ADR skill pack installed!'));
  console.log('');

  console.log(bold('Installed components:'));
  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label}`);
  }
  for (const key of installedOptionalKeys) {
    const comp = OPTIONAL_COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label} ${yellow('[optional]')}`);
  }

  console.log('');
  console.log(bold('Next steps:'));
  console.log(`  1. Open ${cyan('Claude Code')} in this directory`);
  console.log(`  2. Run ${cyan('/feature-adr [description]')} to start the pipeline`);
  console.log(`  3. The Complexity Router will classify your feature as S/M/L/XL`);
  console.log(`  4. Then the pipeline adapts: fewer steps for S, full DAG for XL`);

  if (manifest.optional.withLearning) {
    console.log(`  5. Reward learning is active \u2014 pipeline improves from your feedback`);
  }
  if (manifest.optional.knowledgeExtractor) {
    console.log(`  ${manifest.optional.withLearning ? '6' : '5'}. Run ${cyan('/harvest features/<slug>/')} after completing a feature to extract knowledge`);
  }

  console.log('');

  console.log(bold('Complexity Tiers:'));
  console.log(`  ${green('S')}  ${dim('\u2014 1-3 files, ~15 min  (Steps: 0\u21921\u21926\u21927\u21928)')}`);
  console.log(`  ${yellow('M')}  ${dim('\u2014 4-10 files, ~45 min (Steps: 0\u21921\u21923\u21923.5\u21925\u21926\u21927\u21928)')}`);
  console.log(`  ${cyan('L')}  ${dim('\u2014 11-30 files, ~2h    (Steps: 0\u21921\u21922\u21923\u21923.5\u21924\u21925\u21926\u21927\u21928\u21929)')}`);
  console.log(`  ${bold('XL')} ${dim('\u2014 30+ files, ~4h+     (Full DAG with parallelism + fleet QE)')}`);
  console.log('');

  if (!withLearning && !knowledgeExtractor && !keysariumDetected) {
    console.log(bold('Optional features:'));
    console.log(`  ${dim('Add reward learning:')}     npx @dzhechkov/skills-feature-adr init --with-learning --force`);
    console.log(`  ${dim('Add knowledge extractor:')} npx @dzhechkov/skills-feature-adr init --knowledge-extractor --force`);
    console.log(`  ${dim('Add both:')}                npx @dzhechkov/skills-feature-adr init --with-learning --knowledge-extractor --force`);
    console.log('');
  }

  if (keysariumManifest) {
    console.log(bold('Integration:'));
    console.log(`  Feature ADR is available alongside your Keysarium pipeline.`);
    console.log(`  Use ${cyan('/casarium')} for research, ${cyan('/feature-adr')} for feature development.`);
    console.log(`  Learning and knowledge extraction are provided by Keysarium.`);
    console.log('');
  }

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
