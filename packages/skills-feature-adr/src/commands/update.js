'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, copyDirFiltered, fileExists, readJSON,
  ensureDir, getRelativePaths, getRelativePathsFiltered, diffFiles,
  readManifest, writeManifest, getTemplatesDir,
  toManifestPath, fromManifestPath, hashFile, safeHashFile, classifyThreeWay,
  COMPONENTS, OPTIONAL_COMPONENTS, MANIFEST_FILE, getComponentFilter,
} = require('../utils');

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function run(options) {
  const { dryRun, force, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read existing manifest ─────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('Feature ADR skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-feature-adr init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} \u2014 file may be corrupted.`);
    process.exit(1);
  }

  const templatesDir = getTemplatesDir();

  // ── b) Get installed components ───────────────────────────────────────
  const manifestKeys = manifest.components || [];
  if (manifestKeys.length === 0) {
    warn('Manifest lists no installed components. Consider running init instead.');
    process.exit(1);
  }
  // UNION the manifest's components with the CORE components the NEW template provides. A component
  // ADDED upstream AFTER this install (e.g. `workflows`, bundled in a later release) would otherwise be
  // invisible to `update` — never installed, and worse, a file it ships (`.claude/workflows/feature-adr.js`)
  // could be mis-flagged as an orphan "dropped from template" and DELETED. Installing the union fixes
  // both: new core components get added, and every file the current template provides stays in the
  // rebuilt file-set, so it is updated (never orphaned). Optional components are only touched if they
  // were already installed (they stay driven by the manifest).
  const newCoreKeys = Object.keys(COMPONENTS).filter((k) => fileExists(path.join(templatesDir, COMPONENTS[k].src)));
  const installedKeys = [...new Set([...manifestKeys, ...newCoreKeys])];

  info(`Current version: ${dim(manifest.version)}`);
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const newVersion = pkg ? pkg.version : manifest.version;
  info(`Available version: ${bold(newVersion)}`);
  console.log('');

  // ── c) Diff each component ────────────────────────────────────────────
  // Per-file SHA-256 baseline hashes written at init/last-update (may be absent on a
  // legacy array-only manifest → null → every differing file is treated as
  // "no baseline → legacy" and gets the conservative 2-way keep+warn).
  const manifestHashes = manifest.hashes || null;
  let totalAdded = 0;
  let totalModified = 0;
  let totalUnchanged = 0;
  const filesToCopy = [];
  // Files the user has locally modified. These are markdown prompt files users
  // are expected to tune, so by default we KEEP them (never clobber). Only
  // --force overwrites them, and then only after writing a .bak sibling.
  const keptModified = [];

  for (const key of installedKeys) {
    // Optional components (--with-learning / --knowledge-extractor) live in
    // OPTIONAL_COMPONENTS, not COMPONENTS \u2014 looking only in COMPONENTS treated them
    // as "Unknown component" and dropped their files from the manifest on every
    // update (finding #7). Resolve from both registries.
    const comp = COMPONENTS[key] || OPTIONAL_COMPONENTS[key];
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

    // Single-file components (--with-learning / --knowledge-extractor extras like
    // lib/memory-protocol.md): diffFiles/getRelativePaths readdir a DIRECTORY and
    // cannot handle them \u2014 without this branch, a deleted learning file is never
    // detected ("Everything is up to date!" while doctor flags it missing).
    if (comp.isFile) {
      if (!fileExists(destBase)) {
        filesToCopy.push({ src: srcBase, dest: destBase, status: 'added', relPath: comp.src });
        totalAdded++;
      } else {
        const mine = safeHashFile(destBase);
        if (mine === null) {
          warn(`Skipped ${comp.src} — could not read the installed file (removed mid-update?).`);
          continue;
        }
        const theirs = hashFile(srcBase);
        if (mine === theirs) {
          totalUnchanged++;
        } else {
          const posix = toManifestPath(comp.src);
          const baseline = manifestHashes ? manifestHashes[posix] : undefined;
          const verdict = classifyThreeWay({ baseline, mine, theirs });
          const entry = { src: srcBase, dest: destBase, status: 'modified', relPath: comp.src };
          // 'update' → user did NOT edit, upstream evolved → APPLY (the fix).
          // 'keep'/'legacy' → keep + warn (true "locally modified"); --force
          // still overwrites either after a .bak.
          if (verdict === 'update' || force) {
            filesToCopy.push(entry);
            totalModified++;
          } else {
            keptModified.push(entry);
          }
        }
      }
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

    // diff.modified = "src bytes != dest bytes" only. That collapses two very
    // different cases: (a) the user edited the file, (b) the template evolved
    // upstream and the user never touched it. The per-file baseline lets us
    // tell them apart via a true 3-way compare instead of blindly keeping both.
    for (const rel of diff.modified) {
      const srcFile = path.join(srcBase, rel);
      const destFile = path.join(destBase, rel);
      const relPath = path.join(comp.src, rel);
      const posix = toManifestPath(relPath);
      const baseline = manifestHashes ? manifestHashes[posix] : undefined;
      const mine = safeHashFile(destFile);    // current installed bytes (null if vanished mid-update)
      if (mine === null) {
        warn(`Skipped ${relPath} — could not read the installed file (removed mid-update?).`);
        continue;
      }
      const theirs = hashFile(srcFile);   // new template bytes
      const verdict = classifyThreeWay({ baseline, mine, theirs });
      const entry = { src: srcFile, dest: destFile, status: 'modified', relPath };

      // NB: diff.modified guarantees the bytes already differ, so mine !== theirs
      // here and classifyThreeWay never returns 'unchanged' on this path — the
      // three reachable verdicts are 'update', 'keep', 'legacy'.
      if (verdict === 'update' || force) {
        // 'update' → baseline == mine → user did NOT edit → apply upstream (the bug
        //   fix: previously this was silently reported "locally modified, kept").
        // force   → overwrite a genuine edit too, after a .bak (copy-loop below).
        filesToCopy.push(entry);
        totalModified++;
      } else {
        // 'keep'  → baseline != mine AND theirs != mine → genuine local edit
        //           (now a TRUE "locally modified, kept").
        // 'legacy'→ no baseline → conservative fallback (differs ⇒ keep+warn).
        keptModified.push(entry);
      }
    }

    totalUnchanged += diff.unchanged.length;
  }

  // Re-derive the manifest's `files` array and the per-file `hashes` baseline
  // from the CURRENT template set. `hashes[rel]` is set to the NEW template's
  // bytes (D4): uniform "baseline = theirs" makes the next `update` idempotent
  // (an applied file becomes 'unchanged', a kept edit stays 'keep', a legacy
  // file self-heals into the 3-way regime — all with zero further writes) and a
  // file whose template no longer exists keeps whatever baseline it had. Records
  // from the TEMPLATE source only — NEVER scans destPath, or user-owned files
  // get adopted into manifest.files (and a later remove would delete them).
  function rebuildManifestData() {
    const allFiles = [];
    const newHashes = {};
    const oldHashes = manifest.hashes || {};
    const prevFiles = Array.isArray(manifest.files) ? manifest.files : [];
    for (const key of installedKeys) {
      const comp = COMPONENTS[key] || OPTIONAL_COMPONENTS[key];
      if (!comp) continue;

      const srcPath = path.join(templatesDir, comp.src);
      const destPath = path.join(targetDir, comp.src);
      const filterFn = getComponentFilter(comp);

      // Template source missing → keep the previous manifest entries verbatim.
      if (!fileExists(srcPath)) {
        // Compare in POSIX form so old manifests with native (backslash)
        // separators still match; re-store the kept entries POSIX-normalized.
        const compPosix = toManifestPath(comp.src);
        const kept = prevFiles.filter((rel) => {
          const relPosix = toManifestPath(rel);
          return relPosix === compPosix || relPosix.startsWith(compPosix + '/');
        });
        for (const rel of kept) {
          const relPosix = toManifestPath(rel);
          allFiles.push(relPosix);
          // No template to re-hash — preserve the prior baseline if we had one.
          if (oldHashes[relPosix] != null) newHashes[relPosix] = oldHashes[relPosix];
        }
        warn(`component '${key}' not found in current templates — manifest entries kept as-is`);
        continue;
      }

      // Single-file components: record the file itself. getRelativePaths() would
      // readdir it — without this branch the 3 learning files silently drop out
      // of the manifest on every rebuild, and a later `remove` strands them.
      if (comp.isFile) {
        if (fileExists(destPath)) {
          const posix = toManifestPath(comp.src);
          allFiles.push(posix);
          newHashes[posix] = hashFile(srcPath); // theirs = new template bytes
        }
        continue;
      }

      if (fileExists(destPath)) {
        const paths = filterFn
          ? getRelativePathsFiltered(srcPath, filterFn)
          : getRelativePaths(srcPath);
        for (const rel of paths) {
          const posix = toManifestPath(path.join(comp.src, rel));
          allFiles.push(posix);
          newHashes[posix] = hashFile(path.join(srcPath, rel)); // theirs
        }
      }
    }
    return { allFiles, newHashes };
  }

  // ── Upstream DELETIONS ────────────────────────────────────────────────
  // Files this install previously tracked (manifest.files) that the CURRENT
  // template no longer provides. They were ours — the old manifest says so — so a
  // proper update removes them instead of letting them linger (diffFiles computed
  // `missing` but the old update never consumed it). User-created files are NEVER
  // in the manifest, so they can never be orphaned here. `rebuildManifestData`'s
  // allFiles is the authoritative NEW set (and already re-keeps a whole component
  // whose template dir went missing), so old − new = true upstream deletions.
  const newFileSet = new Set(rebuildManifestData().allFiles.map(toManifestPath));
  const prevManifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
  const orphans = prevManifestFiles
    .map(toManifestPath)
    .filter((rel, i, a) => a.indexOf(rel) === i) // dedup
    .filter((rel) => !newFileSet.has(rel))
    .filter((rel) => fileExists(path.join(targetDir, fromManifestPath(rel))));

  // ── Show diff summary ─────────────────────────────────────────────────
  info(bold('Update summary:'));
  console.log(`  ${green('+')} ${totalAdded} file(s) to add`);
  console.log(`  ${yellow('~')} ${totalModified} file(s) to update`);
  if (orphans.length > 0) {
    console.log(`  ${red('-')} ${orphans.length} file(s) to remove (dropped from template)`);
  }
  if (keptModified.length > 0) {
    console.log(`  ${yellow('\u26a0')} ${keptModified.length} file(s) locally modified, kept`);
  }
  console.log(`  ${dim('=')} ${totalUnchanged} file(s) unchanged`);
  console.log('');

  if (keptModified.length > 0) {
    console.log(yellow('\u26a0') + ' ' + bold('locally modified, kept (use --force to overwrite):'));
    for (const f of keptModified) {
      console.log(`  ${yellow('~ KEEP')} ${f.relPath}`);
    }
    console.log('');
  }

  if (totalAdded === 0 && totalModified === 0 && orphans.length === 0) {
    // Nothing to copy, but the MANIFEST may still be stale: a component newly covered by the union
    // (or a file the template ships that the old manifest never tracked) must be re-tracked so the
    // manifest matches reality \u2014 otherwise a later `remove`/`update` mis-reasons about ownership. Also
    // refreshes the per-file baseline so a legacy (no-hashes) install self-heals into the 3-way regime.
    // Never bump the version (no template bytes applied) and never write under --dry-run.
    if (!dryRun) {
      const { allFiles, newHashes } = rebuildManifestData();
      const prevFiles = JSON.stringify((manifest.files || []).map(toManifestPath).sort());
      const nextFiles = JSON.stringify(allFiles.slice().sort());
      const compsChanged = JSON.stringify((manifest.components || []).slice().sort()) !== JSON.stringify(installedKeys.slice().sort());
      if (prevFiles !== nextFiles || compsChanged || Object.keys(newHashes).length > 0) {
        manifest.files = allFiles.sort();
        manifest.components = installedKeys;
        if (Object.keys(newHashes).length > 0) manifest.hashes = newHashes;
        manifest.updatedAt = new Date().toISOString();
        writeManifest(targetDir, manifest);
      }
    }
    success(keptModified.length > 0 ? 'No files to update \u2014 locally modified file(s) kept.' : 'Everything is up to date!');
    process.exit(0);
  }

  if (dryRun) {
    console.log(bold('Files to be changed:'));
    for (const f of filesToCopy) {
      const marker = f.status === 'added' ? green('+ ADD') : yellow('~ MOD');
      const note = f.status === 'modified' ? dim(' (will back up to .bak)') : '';
      console.log(`  ${marker}  ${f.relPath}${note}`);
    }
    for (const rel of orphans) {
      console.log(`  ${red('- DEL')}  ${rel} ${dim('(dropped from template)')}`);
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
    // --force on a locally modified file: preserve the user's version as a
    // sibling .bak before overwriting.
    if (f.status === 'modified' && fileExists(f.dest)) {
      fs.copyFileSync(f.dest, `${f.dest}.bak`);
      console.log(`         ${dim(`backed up to ${f.relPath}.bak`)}`);
    }
    fs.copyFileSync(f.src, f.dest);
  }

  // ── d2) Remove upstream-dropped files (manifest-tracked orphans) ──────
  let removed = 0;
  for (const rel of orphans) {
    const abs = path.join(targetDir, fromManifestPath(rel));
    try {
      fs.rmSync(abs);
      console.log(`         ${red('- removed')} ${rel} ${dim('(dropped from template)')}`);
      removed++;
    } catch {
      warn(`could not remove ${rel} (already gone?) — skipped`);
    }
  }

  // ── e) Update manifest ────────────────────────────────────────────────
  const { allFiles, newHashes } = rebuildManifestData();

  manifest.version = newVersion;
  manifest.updatedAt = new Date().toISOString();
  manifest.files = allFiles.sort();
  // Additive: only attach `hashes` when we actually have baseline hashes, so a
  // no-op/empty rebuild never introduces an empty key.
  if (Object.keys(newHashes).length > 0) {
    manifest.hashes = newHashes;
  }

  writeManifest(targetDir, manifest);
  info(`Updated ${MANIFEST_FILE} manifest`);

  // ── f) Summary ────────────────────────────────────────────────────────
  console.log('');
  success(bold('Update complete!'));
  console.log(`  ${green('+')} ${totalAdded} file(s) added`);
  console.log(`  ${yellow('~')} ${totalModified} file(s) updated`);
  if (removed > 0) {
    console.log(`  ${red('-')} ${removed} file(s) removed (dropped from template)`);
  }
  if (keptModified.length > 0) {
    console.log(`  ${yellow('⚠')} ${keptModified.length} file(s) locally modified, kept`);
  }
  console.log(`  ${dim('=')} ${totalUnchanged} file(s) unchanged`);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
