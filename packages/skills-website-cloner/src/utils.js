'use strict';

const fs = require('fs');
const path = require('path');

// Colors
const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
function wrap(code, text) { if (!supportsColor) return text; return `\x1b[${code}m${text}\x1b[0m`; }
function green(text)  { return wrap('32', text); }
function red(text)    { return wrap('31', text); }
function yellow(text) { return wrap('33', text); }
function blue(text)   { return wrap('34', text); }
function cyan(text)   { return wrap('36', text); }
function bold(text)   { return wrap('1',  text); }
function dim(text)    { return wrap('2',  text); }
function gray(text)   { return wrap('90', text); }

// Logging
function info(msg)    { console.log(blue('[INFO]') + ' ' + msg); }
function success(msg) { console.log(green('[OK]') + '   ' + msg); }
function warn(msg)    { console.log(yellow('[WARN]') + ' ' + msg); }
function error(msg)   { console.log(red('[ERROR]') + ' ' + msg); }
function step(n, total, msg) { console.log(cyan(`[${n}/${total}]`) + ' ' + msg); }

// File operations
function copyDirRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isFile()) { ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); return; }
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyDirRecursive(path.join(src, entry), path.join(dest, entry));
    }
  }
}

function copyDirFiltered(src, dest, filterFn) {
  const stat = fs.statSync(src);
  if (!stat.isDirectory()) {
    if (filterFn(path.basename(src))) { ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); }
    return;
  }
  ensureDir(dest);
  for (const entry of fs.readdirSync(src)) {
    if (!filterFn(entry)) continue;
    const srcEntry = path.join(src, entry);
    const destEntry = path.join(dest, entry);
    if (fs.statSync(srcEntry).isDirectory()) { copyDirRecursive(srcEntry, destEntry); }
    else { fs.copyFileSync(srcEntry, destEntry); }
  }
}

function fileExists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function writeJSON(p, data) { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8'); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function getRelativePaths(dir) {
  const results = [];
  function walk(current, rel) {
    for (const entry of fs.readdirSync(current)) {
      const full = path.join(current, entry);
      const relPath = rel ? path.join(rel, entry) : entry;
      if (fs.statSync(full).isDirectory()) { walk(full, relPath); } else { results.push(relPath); }
    }
  }
  if (fileExists(dir) && fs.statSync(dir).isDirectory()) walk(dir, '');
  return results;
}

function getRelativePathsFiltered(dir, filterFn) {
  const results = [];
  if (!fileExists(dir) || !fs.statSync(dir).isDirectory()) return results;
  for (const entry of fs.readdirSync(dir)) {
    if (!filterFn(entry)) continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      for (const rel of getRelativePaths(full)) results.push(path.join(entry, rel));
    } else { results.push(entry); }
  }
  return results;
}

function diffFiles(srcDir, destDir, filterFn) {
  const srcFiles = new Set(filterFn ? getRelativePathsFiltered(srcDir, filterFn) : getRelativePaths(srcDir));
  const destFiles = new Set(filterFn ? getRelativePathsFiltered(destDir, filterFn) : getRelativePaths(destDir));
  const added = [], modified = [], unchanged = [], missing = [];
  for (const rel of srcFiles) {
    if (!destFiles.has(rel)) { added.push(rel); }
    else {
      const a = fs.readFileSync(path.join(srcDir, rel));
      const b = fs.readFileSync(path.join(destDir, rel));
      if (a.equals(b)) { unchanged.push(rel); } else { modified.push(rel); }
    }
  }
  for (const rel of destFiles) { if (!srcFiles.has(rel)) missing.push(rel); }
  return { added, modified, unchanged, missing };
}

// Manifest
const MANIFEST_FILE = '.skills-website-cloner.json';
function readManifest(targetDir) { return readJSON(path.join(targetDir, MANIFEST_FILE)); }
function writeManifest(targetDir, data) { writeJSON(path.join(targetDir, MANIFEST_FILE), data); }
function createManifest(version, components, files) {
  return { version, installedAt: new Date().toISOString(), components, files };
}

// Templates
function getTemplatesDir() { return path.join(__dirname, '..', 'templates'); }

// Components — Website Cloner specific (single imported skill, no bundled deps)
const COMPONENTS = {
  skill_clone: {
    src: '.claude/skills/clone-website',
    label: 'Clone Website Skill (reverse-engineer site → Next.js clone)',
    group: 'core',
  },
  commands: {
    src: '.claude/commands',
    label: 'Clone Website Command (1 command)',
    group: 'core',
    filter: 'clone-website',
  },
};

function getComponentFilter(comp) {
  if (!comp.filter) return null;
  const prefix = comp.filter;
  return (filename) => filename.startsWith(prefix);
}

module.exports = {
  green, red, yellow, blue, cyan, bold, dim, gray,
  info, success, warn, error, step,
  copyDirRecursive, copyDirFiltered, fileExists, readJSON, writeJSON, ensureDir,
  getRelativePaths, getRelativePathsFiltered, diffFiles,
  MANIFEST_FILE, readManifest, writeManifest, createManifest,
  getTemplatesDir, COMPONENTS, getComponentFilter,
};
