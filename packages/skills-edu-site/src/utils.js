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
 * Copy from a TEMPLATE source into dest. When `force` is false, a pre-existing
 * destination file is PRESERVED rather than clobbered — so `init` without --force
 * never silently overwrites a user-modified file when the manifest is absent.
 */
function copyDirTracked(src, dest, force) {
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    if (fileExists(dest) && !force) return;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return;
  }
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyDirTracked(path.join(src, entry), path.join(dest, entry), force);
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
 * Compare files between srcDir and destDir.
 * Returns { added, modified, unchanged, missing }.
 *   added:     files in src but not in dest
 *   modified:  files in both but with different content
 *   unchanged: files in both with identical content
 *   missing:   files in dest but not in src (would be removed on clean install)
 */
function diffFiles(srcDir, destDir) {
  const srcFiles = new Set(getRelativePaths(srcDir));
  const destFiles = new Set(getRelativePaths(destDir));

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
// Manifest — .skills-edu-site.json management
// ===========================================================================

const MANIFEST_FILE = '.skills-edu-site.json';

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
// Component definitions — Edu Site skill pack
//
// The Edu Site skill pack has a single component: the skill directory.
// No commands, rules, agents, or shards are included.
// ===========================================================================

const COMPONENTS = {
  skill: {
    src: '.claude/skills/edu-site-generator',
    label: 'Edu Site Skill (8 modules)',
    group: 'core',
  },
};

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
  copyDirTracked,
  fileExists,
  readJSON,
  writeJSON,
  ensureDir,
  getRelativePaths,
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
};
