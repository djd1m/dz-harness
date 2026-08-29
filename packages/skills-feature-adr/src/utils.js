'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function copyDirFiltered(src, dest, filterFn) {
  const stat = fs.statSync(src);

  if (!stat.isDirectory()) {
    if (filterFn(path.basename(src))) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src);
  for (const entry of entries) {
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

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

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
// Content hashing — SHA-256 baseline for the 3-way update decision
//
// The manifest stores, per file, the SHA-256 of the TEMPLATE bytes that were
// installed at init time. `update` then knows three inputs — baseline (what
// init wrote), mine (current install), theirs (new template) — and can tell a
// user edit apart from an upstream evolution instead of collapsing both to
// "src != dest". Pure Node built-in `crypto`; zero dependencies.
// ===========================================================================

// Hash an arbitrary Buffer/string. Used by tests and by hashFile.
function hashBytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Hash a file's bytes on disk. Synchronous, matching the rest of this module.
function hashFile(absPath) {
  return hashBytes(fs.readFileSync(absPath));
}

// Best-effort hashFile: returns null if the file cannot be read (e.g. it vanished
// between the diff scan and the re-hash — a TOCTOU window in `update`). Callers
// treat a null hash as "can't classify this file" and skip it with a warning
// instead of crashing the whole update with an uncaught stack trace.
function safeHashFile(absPath) {
  try {
    return hashFile(absPath);
  } catch {
    return null;
  }
}

// PURE three-way classifier — the whole truth table, no I/O, unit-testable.
//   baseline == null (or absent) → 'legacy'   → caller falls back to the
//                                                conservative 2-way keep+warn
//   mine === theirs              → 'unchanged' → already matches upstream
//   baseline === mine            → 'update'    → user did NOT edit → take theirs
//   else                         → 'keep'      → user edited AND upstream moved
//                                                → true "locally modified, kept"
function classifyThreeWay({ baseline, mine, theirs }) {
  if (baseline == null) return 'legacy';
  if (mine === theirs) return 'unchanged';
  if (baseline === mine) return 'update';
  return 'keep';
}

// ===========================================================================
// Manifest — .skills-feature-adr.json management
// ===========================================================================

const MANIFEST_FILE = '.skills-feature-adr.json';

// Manifest entries are always stored with POSIX '/' separators so a manifest
// written on Windows keeps working on posix and vice versa (portability).

// WRITE side: normalize a path to POSIX form before storing it in a manifest.
function toManifestPath(p) {
  return String(p).replace(/\\/g, '/');
}

// READ side: accept BOTH separator kinds (old manifests may carry native
// backslashes) and return a native-separator path safe for path.resolve/join.
function fromManifestPath(p) {
  return String(p).split(/[\\/]+/).join(path.sep);
}

function readManifest(targetDir) {
  return readJSON(path.join(targetDir, MANIFEST_FILE));
}

function writeManifest(targetDir, data) {
  writeJSON(path.join(targetDir, MANIFEST_FILE), data);
}

function createManifest(version, components, files, hashes) {
  const manifest = {
    version: version,
    installedAt: new Date().toISOString(),
    components: components,
    files: files,
  };
  // `hashes` is additive and optional: include it only when a non-empty map is
  // supplied so legacy/partial callers (3-arg) stay byte-for-byte compatible
  // and old manifests keep their array-only shape.
  if (hashes && Object.keys(hashes).length > 0) {
    manifest.hashes = hashes;
  }
  return manifest;
}

// ===========================================================================
// Templates path
// ===========================================================================

function getTemplatesDir() {
  return path.join(__dirname, '..', 'templates');
}

// ===========================================================================
// Component definitions — Feature ADR-specific
//
// Feature ADR components live in shared directories alongside other skill packs.
// Each component with a `filter` property uses prefix-based filtering:
//   - commands: only files matching `feature-adr*.md`
//   - rules:    only files matching `feature-adr*.md`
//   - shards:   only files matching `feature-adr*.shard.md`
//   - skill:    entire `.claude/skills/feature-adr/` directory (no filter needed)
// ===========================================================================

const COMPONENTS = {
  skill: {
    src: '.claude/skills/feature-adr',
    label: 'Feature ADR Skill (11 modules + references + agentic-qe)',
    group: 'core',
  },
  skill_explore: {
    src: '.claude/skills/explore',
    label: 'Explore Skill (task clarification)',
    group: 'deps',
  },
  skill_solver: {
    src: '.claude/skills/problem-solver-enhanced',
    label: 'Problem Solver Enhanced (TRIZ + Game Theory)',
    group: 'deps',
  },
  skill_frontend: {
    src: '.claude/skills/frontend-design',
    label: 'Frontend Design Skill (UI implementation)',
    group: 'deps',
  },
  commands: {
    src: '.claude/commands',
    label: 'Feature ADR Command (1 command)',
    group: 'core',
    filter: 'feature-adr',
  },
  rules: {
    src: '.claude/rules',
    label: 'Feature ADR Conventions (1 rule)',
    group: 'core',
    filter: 'feature-adr',
  },
  shards: {
    src: '.claude/shards',
    label: 'Feature ADR Governance Shard (1 shard)',
    group: 'core',
    filter: 'feature-adr',
  },
  workflows: {
    src: '.claude/workflows',
    label: 'Canonical feature-adr pipeline (ultracode workflow form)',
    group: 'core',
  },
};

// Optional components — installed only with explicit flags
const OPTIONAL_COMPONENTS = {
  // --with-learning
  learning_lib_memory: {
    src: 'lib/memory-protocol.md',
    label: 'Memory Protocol (reward-calibrated learning)',
    group: 'learning',
    isFile: true,
  },
  learning_lib_reward: {
    src: 'lib/reward-tracker.md',
    label: 'Reward Tracker (analytics & pattern detection)',
    group: 'learning',
    isFile: true,
  },
  learning_rule: {
    src: '.claude/rules/reward-learning.md',
    label: 'Reward Learning Rules',
    group: 'learning',
    isFile: true,
  },
  // --knowledge-extractor
  knowledge_extractor_skill: {
    src: '.claude/skills/knowledge-extractor',
    label: 'Knowledge Extractor Skill (5 agents, 7 categories, 8 gates)',
    group: 'knowledge-extractor',
  },
  knowledge_extractor_command: {
    src: '.claude/commands',
    label: 'Harvest Command (/harvest)',
    group: 'knowledge-extractor',
    filter: 'harvest',
  },
};

// ===========================================================================
// Filter helpers
// ===========================================================================

function getComponentFilter(comp) {
  if (!comp.filter) return null;

  const prefix = comp.filter; // 'feature-adr'

  return (filename) => {
    return filename.startsWith(prefix);
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

  // Content hashing / 3-way classifier
  hashBytes,
  hashFile,
  safeHashFile,
  classifyThreeWay,

  // Manifest
  MANIFEST_FILE,
  toManifestPath,
  fromManifestPath,
  readManifest,
  writeManifest,
  createManifest,

  // Templates
  getTemplatesDir,

  // Components
  COMPONENTS,
  OPTIONAL_COMPONENTS,

  // Filters
  getComponentFilter,
};
