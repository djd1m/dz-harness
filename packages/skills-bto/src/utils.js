'use strict';

const fs = require('fs');
const path = require('path');

// ===========================================================================
// Colors — ANSI escape codes (zero dependencies)
// ===========================================================================

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;

function wrap(code, text) {
  if (!supportsColor) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function green(text)  { return wrap('32', text); }
function red(text)    { return wrap('31', text); }
function yellow(text) { return wrap('33', text); }
function blue(text)   { return wrap('34', text); }
function cyan(text)   { return wrap('36', text); }
function bold(text)   { return wrap('1',  text); }
function dim(text)    { return wrap('2',  text); }
function gray(text)   { return wrap('90', text); }

// ===========================================================================
// Logging
// ===========================================================================

function info(msg)    { console.log(blue('[INFO]') + ' ' + msg); }
function success(msg) { console.log(green('[OK]') + '   ' + msg); }
function warn(msg)    { console.log(yellow('[WARN]') + ' ' + msg); }
function error(msg)   { console.log(red('[ERROR]') + ' ' + msg); }

function step(n, total, msg) {
  console.log(cyan(`[${n}/${total}]`) + ' ' + msg);
}

// ===========================================================================
// File operations — all synchronous, Node.js built-ins only
// ===========================================================================

/**
 * Copy a directory recursively from src to dest, creating dirs as needed.
 * If src is a file, copies the single file.
 */
function copyDirRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isFile()) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return;
  }

  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcEntry = path.join(src, entry);
      const destEntry = path.join(dest, entry);
      copyDirRecursive(srcEntry, destEntry);
    }
  }
}

/**
 * Copy a directory recursively, but only include files matching a filter.
 * The filter function receives the filename (not full path) and returns boolean.
 * Only applies to top-level entries; subdirectories are copied in full.
 */
function copyDirFiltered(src, dest, filterFn) {
  const stat = fs.statSync(src);

  if (!stat.isDirectory()) {
    // Single file — apply filter to its basename
    if (filterFn(path.basename(src))) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    // Apply filter only to top-level entries
    if (!filterFn(entry)) continue;

    const srcEntry = path.join(src, entry);
    const destEntry = path.join(dest, entry);
    const entryStat = fs.statSync(srcEntry);

    if (entryStat.isDirectory()) {
      copyDirRecursive(srcEntry, destEntry);
    } else {
      fs.copyFileSync(srcEntry, destEntry);
    }
  }
}

/**
 * Returns true if the path exists (file or directory).
 */
function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file. Returns null if file not found or invalid.
 */
function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write an object as JSON with 2-space indentation.
 */
function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Create a directory (and parents) if it does not exist.
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Return an array of all file paths relative to `dir`, traversed recursively.
 */
function getRelativePaths(dir) {
  const results = [];

  function walk(current, rel) {
    const entries = fs.readdirSync(current);
    for (const entry of entries) {
      const full = path.join(current, entry);
      const relPath = rel ? path.join(rel, entry) : entry;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, relPath);
      } else {
        results.push(relPath);
      }
    }
  }

  if (fileExists(dir) && fs.statSync(dir).isDirectory()) {
    walk(dir, '');
  }

  return results;
}

/**
 * Return file paths relative to `dir`, but only for entries matching the filter.
 * The filter is applied to top-level filenames only.
 * For top-level directories that match, all nested files are included.
 */
function getRelativePathsFiltered(dir, filterFn) {
  const results = [];

  if (!fileExists(dir) || !fs.statSync(dir).isDirectory()) {
    return results;
  }

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (!filterFn(entry)) continue;

    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      // Include all files inside matched subdirectory
      const nested = getRelativePaths(full);
      for (const rel of nested) {
        results.push(path.join(entry, rel));
      }
    } else {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Compare files between srcDir and destDir, respecting an optional filter.
 * Returns { added, modified, unchanged, missing }.
 *   added:     files in src but not in dest
 *   modified:  files in both but with different content
 *   unchanged: files in both with identical content
 *   missing:   files in dest but not in src (would be removed on clean install)
 */
function diffFiles(srcDir, destDir, filterFn) {
  const srcFiles = new Set(
    filterFn ? getRelativePathsFiltered(srcDir, filterFn) : getRelativePaths(srcDir)
  );
  const destFiles = new Set(
    filterFn ? getRelativePathsFiltered(destDir, filterFn) : getRelativePaths(destDir)
  );

  const added = [];
  const modified = [];
  const unchanged = [];
  const missing = [];

  for (const rel of srcFiles) {
    if (!destFiles.has(rel)) {
      added.push(rel);
    } else {
      const srcContent = fs.readFileSync(path.join(srcDir, rel));
      const destContent = fs.readFileSync(path.join(destDir, rel));
      if (srcContent.equals(destContent)) {
        unchanged.push(rel);
      } else {
        modified.push(rel);
      }
    }
  }

  for (const rel of destFiles) {
    if (!srcFiles.has(rel)) {
      missing.push(rel);
    }
  }

  return { added, modified, unchanged, missing };
}

// ===========================================================================
// Manifest — .skills-bto.json management
// ===========================================================================

const MANIFEST_FILE = '.skills-bto.json';

/**
 * Read the manifest from targetDir. Returns null if not found.
 */
function readManifest(targetDir) {
  return readJSON(path.join(targetDir, MANIFEST_FILE));
}

/**
 * Write the manifest to targetDir.
 */
function writeManifest(targetDir, data) {
  writeJSON(path.join(targetDir, MANIFEST_FILE), data);
}

/**
 * Create a fresh manifest object.
 */
function createManifest(version, components, files) {
  return {
    version: version,
    installedAt: new Date().toISOString(),
    components: components,
    files: files,
  };
}

// ===========================================================================
// Templates path
// ===========================================================================

/**
 * Returns the absolute path to the templates/ directory inside the package.
 */
function getTemplatesDir() {
  return path.join(__dirname, '..', 'templates');
}

// ===========================================================================
// Component definitions — BTO-specific
//
// BTO components live in shared directories alongside other skill packs.
// Each component with a `filter` property uses prefix-based filtering:
//   - commands: only files matching `bto*.md`
//   - rules:    only files matching `bto-*.md`
//   - agents:   only files matching `bto-*.md`
//   - skill:    entire `.claude/skills/bto/` directory (no filter needed)
// ===========================================================================

const COMPONENTS = {
  skill: {
    src: '.claude/skills/bto',
    label: 'BTO Skill Pack (4 modules)',
    group: 'core',
  },
  commands: {
    src: '.claude/commands',
    label: 'BTO Commands (verify-chain + bto*)',
    group: 'core',
    filter: 'bto',
    extra: ['verify-chain.md'],
  },
  rules: {
    src: '.claude/rules',
    label: 'BTO Quality Gate Rules (+ witness-chain)',
    group: 'core',
    filter: 'bto',
    extra: ['witness-chain.md'],
  },
  agents: {
    src: '.claude/agents',
    label: 'BTO Agent Templates (2)',
    group: 'core',
    filter: 'bto',
  },
  shards: {
    src: '.claude/shards',
    label: 'BTO Context Shards (1)',
    group: 'core',
    filter: 'bto',
  },
  lib: {
    // verify-chain.md reads lib/witness-chain.md + lib/judge-attestation.md at runtime;
    // without this component those reads fail (finding #26).
    src: 'lib',
    label: 'BTO verification protocols (witness-chain, judge-attestation)',
    group: 'core',
  },
};

// ===========================================================================
// Filter helpers — centralized prefix logic for filtered components
// ===========================================================================

/**
 * Build a filter function for a component.
 * Components with `filter: 'bto'` match files starting with 'bto' (commands)
 * or 'bto-' (rules, agents). Skill component has no filter (entire directory).
 *
 * @param {object} comp — A COMPONENTS entry
 * @returns {Function|null} — Filter function, or null if no filtering needed
 */
function getComponentFilter(comp) {
  if (!comp.filter) return null;

  // Determine the prefix pattern based on the component type
  // commands: bto*.md  (e.g., bto.md, bto-build.md)
  // rules:   bto-*.md  (e.g., bto-quality-gate.md)
  // agents:  bto-*.md  (e.g., bto-builder.md)
  const prefix = comp.filter; // 'bto'
  const extra = comp.extra || []; // explicit allowlist of non-prefixed files to include

  return (filename) => {
    return filename.startsWith(prefix) || extra.includes(filename);
  };
}

// ===========================================================================
// Exports
// ===========================================================================

module.exports = {
  // Colors
  green,
  red,
  yellow,
  blue,
  cyan,
  bold,
  dim,
  gray,

  // Logging
  info,
  success,
  warn,
  error,
  step,

  // File operations
  copyDirRecursive,
  copyDirFiltered,
  fileExists,
  readJSON,
  writeJSON,
  ensureDir,
  getRelativePaths,
  getRelativePathsFiltered,
  diffFiles,

  // Manifest
  MANIFEST_FILE,
  readManifest,
  writeManifest,
  createManifest,

  // Templates
  getTemplatesDir,

  // Components
  COMPONENTS,

  // Filters
  getComponentFilter,
};
