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

function info(msg)  { console.log(blue('[INFO]') + ' ' + msg); }
function success(msg) { console.log(green('[OK]') + '   ' + msg); }
function warn(msg)  { console.log(yellow('[WARN]') + ' ' + msg); }
function error(msg) { console.log(red('[ERROR]') + ' ' + msg); }

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
 * Copy from a TEMPLATE source into dest, tracking which files were written.
 * Walks the SOURCE tree (never the destination), so only template-originated
 * files are ever recorded — a user-created file in dest with no template
 * counterpart is never touched and never returned (prevents `remove` from
 * deleting user data). When `force` is false, a pre-existing destination file
 * is PRESERVED (skipped) rather than clobbered (protects user-modified files
 * on a re-install where the manifest was lost).
 *
 * @returns {{copied: string[], skipped: string[]}} relative paths (to dest root)
 */
function copyDirTracked(src, dest, force, rel = '', acc = { copied: [], skipped: [] }) {
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    if (fileExists(dest) && !force) {
      acc.skipped.push(rel);
    } else {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
      acc.copied.push(rel);
    }
    return acc;
  }
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyDirTracked(path.join(src, entry), path.join(dest, entry), force,
        rel ? path.join(rel, entry) : entry, acc);
    }
  }
  return acc;
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
// Manifest — .keysarium.json management
// ===========================================================================

const MANIFEST_FILE = '.keysarium.json';

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
// Component definitions
// ===========================================================================

/**
 * Count the units a component contributes, by inspecting the real templates/ tree.
 *
 * `countMode` decides what a "unit" is:
 *   'dirs'  — immediate subdirectories (one skill pack = one directory)
 *   'files' — every file, recursively (lib/, docs/ ship nested files)
 *   'md'    — immediate *.md files (one command / rule / shard / agent = one file)
 *
 * Returns null when the count cannot be determined (missing dir, unreadable),
 * so callers can degrade to a bare label instead of printing a wrong number.
 */
function countTemplateUnits(comp) {
  if (comp.isFile) return null;

  const srcPath = path.join(getTemplatesDir(), comp.src);

  try {
    if (!fs.statSync(srcPath).isDirectory()) return null;
  } catch {
    return null;
  }

  try {
    if (comp.countMode === 'files') {
      return getRelativePaths(srcPath).length;
    }

    const entries = fs.readdirSync(srcPath, { withFileTypes: true });

    if (comp.countMode === 'dirs') {
      return entries.filter((e) => e.isDirectory()).length;
    }

    // default: 'md'
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).length;
  } catch {
    return null;
  }
}

/**
 * Component definitions.
 *
 * IMPORTANT: `label` is a COMPUTED getter — the parenthetical count is read from the
 * shipped templates/ tree at access time, never hardcoded. Adding a command / rule /
 * skill to templates/ changes what `init`, `init --dry-run` and `list` print, with no
 * source edit. (Regression this guards: the labels used to be frozen strings reading
 * "8 skill packs / 13 slash commands / 10 rules / 7 shards / 4 modules" long after the
 * tree had grown past all five numbers.)
 */
const COMPONENT_SPECS = {
  skills:    { src: '.claude/skills',        name: 'Skills',           unit: 'skill packs',    countMode: 'dirs',  group: 'core' },
  commands:  { src: '.claude/commands',      name: 'Commands',         unit: 'slash commands', countMode: 'md',    group: 'core' },
  rules:     { src: '.claude/rules',         name: 'Rules',            unit: 'auto-loaded rules', countMode: 'md', group: 'core' },
  shards:    { src: '.claude/shards',        name: 'Shards',           unit: 'context shards', countMode: 'md',    group: 'core' },
  agents:    { src: '.claude/agents',        name: 'Agent templates',  unit: 'swarm configs',  countMode: 'md',    group: 'core' },
  hooks:     { src: '.claude/settings.json', name: 'Hooks configuration', group: 'core', isFile: true },
  lib:       { src: 'lib',                   name: 'Library modules',  unit: 'modules',        countMode: 'files', group: 'extended' },
  docs:      { src: 'docs',                  name: 'Documentation',    unit: 'guides',         countMode: 'files', group: 'docs' },
  claude_md: { src: 'CLAUDE.md',             name: 'Master instructions', group: 'core', isFile: true },
  harvest:   { src: 'TOOLKIT_HARVEST.md',    name: 'Knowledge harvest tracker', group: 'core', isFile: true },
};

/**
 * The shipped `*.md` filenames for a directory component, read from templates/.
 *
 * This is the single source of truth for "what SHOULD be installed" — `doctor` derives its
 * named checks from it, so a new command/rule/shard is named-checked the moment it lands in
 * templates/, with no second list to keep in sync. Returns [] when templates/ is unreadable.
 */
function getTemplateFileNames(componentKey) {
  const comp = COMPONENT_SPECS[componentKey];
  if (!comp || comp.isFile) return [];

  try {
    return fs
      .readdirSync(path.join(getTemplatesDir(), comp.src), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const COMPONENTS = {};
for (const [key, spec] of Object.entries(COMPONENT_SPECS)) {
  const comp = Object.assign({}, spec);
  Object.defineProperty(comp, 'label', {
    enumerable: true,
    get() {
      const n = countTemplateUnits(this);
      if (n === null || !this.unit) return this.name;
      return `${this.name} (${n} ${this.unit})`;
    },
  });
  COMPONENTS[key] = comp;
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
  countTemplateUnits,
  getTemplateFileNames,
};
