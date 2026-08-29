'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  fileExists, readManifest,
  MANIFEST_FILE, fromManifestPath,
} = require('../utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confirmPrompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

function removeFile(filePath) {
  try {
    if (fileExists(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    warn(`Could not remove ${filePath}: ${err.message}`);
  }
  return false;
}

function removeEmptyDirs(dirPath, stopDir) {
  try {
    const root = path.resolve(stopDir);
    let current = path.resolve(dirPath);

    // Containment-based loop: never stat/rmdir/climb outside the project root
    while (current !== root && current.startsWith(root + path.sep)) {
      if (!fileExists(current)) {
        current = path.dirname(current);
        continue;
      }

      const stat = fs.statSync(current);
      if (!stat.isDirectory()) break;

      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        fs.rmdirSync(current);
        current = path.dirname(current);
      } else {
        break;
      }
    }
  } catch {
    // Silently ignore — directory cleanup is best-effort
  }
}

// Directories shared with @dzhechkov/keysarium — never delete their files
// when keysarium is installed in the same project.
const KEYSARIUM_SHARED_DIRS = [
  ['.claude', 'skills', 'explore'],
  ['.claude', 'skills', 'problem-solver-enhanced'],
  ['.claude', 'skills', 'frontend-design'],
];

function isKeysariumShared(relParts) {
  return KEYSARIUM_SHARED_DIRS.some(
    (dir) => relParts.length > dir.length && dir.every((seg, i) => relParts[i] === seg)
  );
}

// Classify a manifest entry:
//   'outside' — resolves outside the project root (possible tampering)
//   'shared'  — lives in a keysarium-shared directory (preserve)
//   'ok'      — safe to remove
function classifyManifestEntry(relPath, resolvedTarget, keysariumDetected) {
  // Manifest entries may carry either separator kind (a manifest written on
  // Windows has backslashes) — normalize to native before resolving.
  const absPath = path.resolve(resolvedTarget, fromManifestPath(relPath));

  if (absPath !== resolvedTarget && !absPath.startsWith(resolvedTarget + path.sep)) {
    return { absPath, kind: 'outside' };
  }

  if (keysariumDetected) {
    const relParts = path.relative(resolvedTarget, absPath).split(path.sep);
    if (isKeysariumShared(relParts)) {
      return { absPath, kind: 'shared' };
    }
  }

  return { absPath, kind: 'ok' };
}

function printOutsideWarning(outsideEntries) {
  console.log(
    `  ${yellow('⚠')} ${outsideEntries.length} manifest entr${outsideEntries.length === 1 ? 'y' : 'ies'} outside the project ${outsideEntries.length === 1 ? 'was' : 'were'} skipped (possible tampering):`
  );
  for (const p of outsideEntries) {
    console.log(`    ${dim(p)}`);
  }
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function run(options) {
  const { force, dryRun, targetDir } = options;
  const resolvedTarget = path.resolve(targetDir);
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read manifest ──────────────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    warn('Feature ADR skill pack is not installed in this directory \u2014 nothing to remove.');
    process.exit(0);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} \u2014 file may be corrupted.`);
    info(`You can manually delete ${MANIFEST_FILE} and the installed files.`);
    process.exit(1);
  }

  const files = manifest.files || [];
  const components = manifest.components || [];

  // ── b) Show what will be removed ──────────────────────────────────────
  console.log('');
  info(bold('The following Feature ADR components will be removed:'));
  console.log('');

  for (const key of components) {
    console.log(`  ${red('-')} ${key}`);
  }

  console.log('');
  console.log(`  ${dim(`${files.length} file(s) total`)}`);
  console.log(`  ${dim(`+ ${MANIFEST_FILE} manifest`)}`);
  console.log('');

  const keysariumPath = path.join(targetDir, '.keysarium.json');
  const keysariumDetected = fileExists(keysariumPath);
  if (keysariumDetected) {
    info('@dzhechkov/keysarium detected \u2014 shared directories will be preserved.');
  }

  if (dryRun) {
    console.log(bold('Files to be removed:'));
    const outsideDry = [];
    for (const relPath of files) {
      const { absPath, kind } = classifyManifestEntry(relPath, resolvedTarget, keysariumDetected);
      if (kind === 'outside') {
        outsideDry.push(relPath);
        console.log(`  ${yellow('- OUT')}  ${relPath}`);
        continue;
      }
      if (kind === 'shared') {
        console.log(`  ${dim('- KEEP')} ${relPath} ${dim('(shared with Keysarium)')}`);
        continue;
      }
      const exists = fileExists(absPath);
      const marker = exists ? red('- DEL') : dim('- N/A');
      console.log(`  ${marker}  ${relPath}`);
    }
    console.log(`  ${red('- DEL')}  ${MANIFEST_FILE}`);
    console.log('');
    if (outsideDry.length > 0) {
      printOutsideWarning(outsideDry);
      console.log('');
    }
    warn('Dry run \u2014 no files were removed.');
    process.exit(0);
  }

  // ── c) Confirm unless --force ─────────────────────────────────────────
  if (!force) {
    // Without a TTY, rl.question never resolves (CI / piped stdin) — the
    // process would hang or silently exit. Reject with a copy-paste command.
    if (!process.stdin.isTTY) {
      logError('non-interactive session detected — re-run with --force to confirm removal');
      info(`Run: ${cyan('npx @dzhechkov/skills-feature-adr remove --force')}`);
      process.exit(1);
    }
    const confirmed = await confirmPrompt(
      yellow('This will remove all Feature ADR skill pack files. Continue? (y/N) ')
    );

    if (!confirmed) {
      info('Aborted \u2014 no files were removed.');
      process.exit(0);
    }
  }

  // ── d) Remove files ───────────────────────────────────────────────────
  let removedCount = 0;
  let skippedCount = 0;
  let preservedCount = 0;
  const outsideEntries = [];
  const dirsToCheck = new Set();

  for (let i = 0; i < files.length; i++) {
    const relPath = files[i];
    const { absPath, kind } = classifyManifestEntry(relPath, resolvedTarget, keysariumDetected);

    if (kind === 'outside') {
      outsideEntries.push(relPath);
      step(i + 1, files.length, `Skipping ${relPath} (outside project)`);
      continue;
    }

    if (kind === 'shared') {
      preservedCount++;
      step(i + 1, files.length, `Preserving ${relPath} (shared with Keysarium)`);
      continue;
    }

    step(i + 1, files.length, `Removing ${relPath}`);

    if (removeFile(absPath)) {
      removedCount++;
      dirsToCheck.add(path.dirname(absPath));
    } else {
      skippedCount++;
    }
  }

  // Remove empty directories (bottom-up), only feature-adr-exclusive ones.
  // dirsToCheck contains only parents of files actually deleted, so preserved
  // (keysarium-shared) directories are never pruned.
  const sortedDirs = Array.from(dirsToCheck).sort((a, b) => b.length - a.length);
  for (const dir of sortedDirs) {
    removeEmptyDirs(dir, resolvedTarget);
  }

  // ── e) Remove manifest ────────────────────────────────────────────────
  removeFile(manifestPath);
  info(`Removed ${MANIFEST_FILE} manifest`);

  // ── f) Summary ────────────────────────────────────────────────────────
  console.log('');
  success(bold('Feature ADR skill pack removal complete!'));
  console.log(`  ${green('\u2713')} ${removedCount} file(s) removed`);
  if (preservedCount > 0) {
    console.log(`  ${green('\u2713')} preserved (shared with Keysarium): ${preservedCount} file(s)`);
  }
  if (skippedCount > 0) {
    console.log(`  ${dim('-')} ${skippedCount} file(s) already missing (skipped)`);
  }
  if (outsideEntries.length > 0) {
    printOutsideWarning(outsideEntries);
  }
  console.log('');
  info(`To reinstall, run: ${cyan('@dzhechkov/skills-feature-adr init')}`);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
