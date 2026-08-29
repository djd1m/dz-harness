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
      copyDirRecursive(path.join(src, entry), path.join(dest, entry));
    }
  }
}

/**
 * Copy a directory recursively, but only include files matching a filter.
 */
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

/**
 * Returns true if the path exists.
 */
/**
 * Three states, because two were not enough.
 *
 * `fileExists` answers about PRESENCE and is deliberately left alone — it has 31 call sites, several
 * of which ask a genuine presence question about files that may legitimately hold nothing. This is
 * the predicate for the different question: is this artifact USABLE?
 *
 * MEASURED 2026-08-27: 31 artifacts truncated to zero bytes — every SKILL.md, command, rule and
 * agent — and both `verify` and `doctor` reported clean with exit 0. Deleting one was caught. The
 * gap was exactly this: accessSync asks whether the path resolves, never what is in it.
 *
 * Whitespace counts as empty. A file holding a newline is exactly as dead as one holding nothing,
 * and a size check alone would pass it.
 */
function artifactState(filePath) {
  let body;
  try {
    body = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return 'missing';
  }
  return body.trim().length === 0 ? 'empty' : 'present';
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file. Returns null if not found or invalid.
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
// Manifest — .p-replicator.json management
// ===========================================================================

const MANIFEST_FILE = '.p-replicator.json';

function readManifest(targetDir) {
  return readJSON(path.join(targetDir, MANIFEST_FILE));
}

function writeManifest(targetDir, data) {
  writeJSON(path.join(targetDir, MANIFEST_FILE), data);
}

function createManifest(version, components, files, shippedDefaults) {
  const manifest = {
    version: version,
    installedAt: new Date().toISOString(),
    components: components,
    files: files,
  };
  // shippedDefaults (v1.4.3+): snapshot of files we shipped this install. Used
  // by next upgrade to detect orphan hooks that have been removed from the
  // current template. Currently tracks settings.json only (the file most
  // affected by user customization vs template drift).
  if (shippedDefaults && Object.keys(shippedDefaults).length > 0) {
    manifest.shippedDefaults = shippedDefaults;
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
// Component definitions — PU Unicorn Replicate
//
// All components are installed as complete directories (no prefix filtering
// needed since this is a complete package).
// ===========================================================================

// items maps are the SINGLE SOURCE OF TRUTH for component names + descriptions.
// Consumed by: doctor.js (existence checks), list.js (display), cli.js (help counts),
// verify.js (post-/replicate state check), and is the canonical contract for what
// the package ships AND what /replicate is expected to generate.
//
// `kind: 'pre-shipped'`    — installed by `npx p-replicator init` (must always exist).
// `kind: 'project-generated'` — created by `/replicate` Phase 3; items keys are full
//                            relative paths (e.g., '.claude/agents/planner.md').
const COMPONENTS = {
  skills: {
    src: '.claude/skills',
    kind: 'pre-shipped',
    label: 'Skills (10 skill packs)',
    group: 'core',
    items: {
      'explore':                       'Socratic task clarification',
      'sparc-prd-mini':                'SPARC documentation generator (11 docs)',
      'goap-research-ed25519':         'Verified research with Ed25519 anti-hallucination',
      'problem-solver-enhanced':       'First principles + TRIZ (9 modules)',
      'requirements-validator':        'INVEST/SMART validation + BDD scenarios',
      'brutal-honesty-review':         'Unvarnished technical criticism',
      'cc-toolkit-generator-enhanced': 'Modular toolkit generator (9 modules, ~165K chars)',
      'reverse-engineering-unicorn':   'Company reverse engineering + playbook',
      'pipeline-forge':                'Meta-skill: build AI pipelines from patterns',
      'knowledge-extractor':           'Extract reusable knowledge from projects',
    },
  },
  commands: {
    src: '.claude/commands',
    kind: 'pre-shipped',
    label: 'Commands (orchestration + workflow)',
    group: 'core',
    items: {
      'replicate':  'Full pipeline: idea → validated docs → toolkit',
      'harvest':    'Knowledge extraction from projects',
      'start':      'Bootstrap project from SPARC docs (monorepo + Docker)',
      'plan':       'Lightweight planning to docs/plans/ (auto-commit)',
      'feature':    'Full SPARC-mini lifecycle (PLAN → VALIDATE → IMPLEMENT → REVIEW)',
      'go':         'Intelligent pipeline router (delegates to /plan or /feature)',
      'run':        'Autonomous build loop: /next → /go → repeat',
      'next':       'Pick next feature from .claude/feature-roadmap.json',
      'docs':       'Bilingual documentation generator (RU/EN)',
      'deploy':     'Deployment workflow (dev / staging / prod)',
      'myinsights': 'Capture and recall development insights',
    },
  },
  agents: {
    src: '.claude/agents',
    kind: 'pre-shipped',
    label: 'Agents (4 orchestrators)',
    group: 'core',
    items: {
      'replicate-coordinator': 'Pipeline orchestration (Phases 0-4)',
      'product-discoverer':    'Market research (Phase 0)',
      'doc-validator':         'Documentation validation swarm (Phase 2)',
      'harvest-coordinator':   'Knowledge extraction swarm',
    },
  },
  rules: {
    src: '.claude/rules',
    kind: 'pre-shipped',
    label: 'Rules (pipeline + workflow constraints)',
    group: 'core',
    items: {
      'replicate-pipeline':       'Phase sequence, output paths, git discipline, modular skill loading',
      'skill-interface-protocol': 'view() contract, module interface, maturity tagging, composition rules',
      'git-workflow':             'Commit/push discipline, branch strategy, semantic messages',
      'insights-capture':         'When and how to capture development insights to knowledge base',
      'feature-lifecycle':        '/feature phases (PLAN → VALIDATE → IMPLEMENT → REVIEW), checkpoints, scoring',
      'docker-ports':             'Правило №0: storage ports are not published outward; loopback bind is the exception',
    },
  },
  settings: {
    src: '.claude/settings.json',
    kind: 'pre-shipped',
    label: 'Hooks config (settings.json)',
    group: 'core',
    isFile: true,
    items: {
      'settings.json': 'SessionStart insight injection + Stop auto-commit (roadmap, insights, plans)',
    },
  },
  hooks: {
    src: '.claude/hooks',
    kind: 'pre-shipped',
    label: 'Hook scripts (cross-platform Node)',
    group: 'core',
    items: {
      'session-insights':    'Inject 3 most recent insights into Claude session context',
      'autocommit-roadmap':  'Auto-commit .claude/feature-roadmap.json on Stop hook',
      'autocommit-insights': 'Auto-commit .claude/insights/ on Stop hook',
      'autocommit-plans':    'Auto-commit docs/plans/ on Stop hook',
      'statusline':          'Multi-line dashboard (pipeline, roadmap, toolkit) for Claude Code statusLine',
      'state-update':        'Argv-driven helper for pipeline commands to publish current command + phase + progress',
      'check-ports':              'Enforce docker-ports Правило №0 against a real compose (invoke deliberately; exits 0/1/2)',
      'check-growth-trace':       'Did the M5 growth seed reach docs/Specification.md (invoke deliberately; exits 0/1/2)',
      'check-docs-complete':      'Are Phase-1 documents written and placeholder-free, before the Phase-2 swarm (invoke deliberately; exits 0/1/2)',
    },
  },
  // ─── Project-generated groups (created by /replicate Phase 3) ───────────
  // items keys are FULL relative paths (e.g., '.claude/agents/planner.md').
  // Used by verify.js to report post-/replicate state; doctor.js does NOT
  // assert their presence (advisory hints only).
  projectAgents: {
    kind: 'project-generated',
    label: 'Project-specific agents (Phase 3 generated from SPARC)',
    group: 'project',
    items: {
      '.claude/agents/planner.md':       'Feature planning with algorithm templates from Pseudocode.md',
      '.claude/agents/code-reviewer.md': 'Quality review with edge cases from Refinement.md',
      '.claude/agents/architect.md':     'System design from Architecture.md + Solution_Strategy.md',
    },
  },
  projectRules: {
    kind: 'project-generated',
    label: 'Project-specific rules (Phase 3 generated from NFRs/tech stack)',
    group: 'project',
    items: {
      '.claude/rules/security.md':     'NFRs from Specification.md',
      '.claude/rules/coding-style.md': 'Conventions from Architecture.md tech stack',
      '.claude/rules/testing.md':      'Test strategy from Refinement.md',
    },
  },
  projectFiles: {
    kind: 'project-generated',
    label: 'Project files (Phase 3 generated)',
    group: 'project',
    items: {
      'CLAUDE.md':                      'Project context (root)',
      '.claude/feature-roadmap.json':   'Feature list (used by /run, /next)',
      'DEVELOPMENT_GUIDE.md':           'Step-by-step dev lifecycle',
      'docker-compose.yml':             'Container orchestration scaffold',
    },
  },
};

// ---------------------------------------------------------------------------
// Path derivation: maps a component + item key to its on-disk relative path.
// Centralizes the "where do we find item X of group Y" logic so doctor/verify/list
// don't each re-implement it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// settings.json merge (v1.4.2): preserve user customizations on `init --force`.
// Algorithm: deep-merge top-level fields (template fills only what user lacks),
// per-event-type merge for hooks, per-matcher merge for hook arrays, de-dup by
// command string. Use `--reset-settings` flag for explicit overwrite.
// ---------------------------------------------------------------------------

function mergeSettingsJson(existing, template) {
  if (!existing) return template;
  if (!template) return existing;

  const merged = { ...existing };

  // Top-level: add template fields that user doesn't have. Don't overwrite.
  for (const [key, value] of Object.entries(template)) {
    if (!(key in merged)) merged[key] = value;
  }

  // Special: hooks need structural merge.
  if (template.hooks) {
    merged.hooks = mergeHookEvents(existing.hooks || {}, template.hooks);
  }

  return merged;
}

function mergeHookEvents(existing, template) {
  const merged = { ...existing };
  for (const eventType of Object.keys(template)) {
    if (!merged[eventType]) {
      merged[eventType] = template[eventType];
    } else {
      merged[eventType] = mergeHookMatchers(merged[eventType], template[eventType]);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// removeOrphanHooks (v1.4.3): orphan detection on upgrade.
// "Orphan" = a hook command that WAS shipped by the package previously
// (in oldTemplate from manifest.shippedDefaults) but is NO LONGER in the
// current template. Such hooks should be removed from user's settings on
// upgrade — otherwise they linger forever, calling broken/missing scripts.
//
// Identity model: hooks are compared by their `command` string. User-modified
// commands have a different string and are treated as user-added (preserved).
// User-added commands (never in oldTemplate) are also preserved.
// ---------------------------------------------------------------------------

function extractCommands(hooksRoot) {
  const cmds = new Set();
  if (!hooksRoot || !hooksRoot.hooks) return cmds;
  for (const eventEntries of Object.values(hooksRoot.hooks)) {
    if (!Array.isArray(eventEntries)) continue;
    for (const matcher of eventEntries) {
      for (const h of (matcher.hooks || [])) {
        if (h && typeof h.command === 'string') cmds.add(h.command);
      }
    }
  }
  return cmds;
}

function removeOrphanHooks(existing, oldTemplate, newTemplate) {
  // First-upgrade case: no baseline → can't detect orphans. Pass-through.
  if (!oldTemplate || !existing) return existing;

  const oldCmds = extractCommands(oldTemplate);
  const newCmds = extractCommands(newTemplate);

  // Orphans: shipped previously, no longer shipped.
  const orphanCmds = new Set();
  for (const cmd of oldCmds) {
    if (!newCmds.has(cmd)) orphanCmds.add(cmd);
  }
  if (orphanCmds.size === 0) return existing;

  // Deep-clone existing while filtering out orphan commands.
  const cleaned = { ...existing };
  if (existing.hooks) {
    cleaned.hooks = {};
    for (const [eventType, entries] of Object.entries(existing.hooks)) {
      if (!Array.isArray(entries)) {
        cleaned.hooks[eventType] = entries;
        continue;
      }
      cleaned.hooks[eventType] = entries.map((matcher) => ({
        ...matcher,
        hooks: (matcher.hooks || []).filter(
          (h) => !(h && typeof h.command === 'string' && orphanCmds.has(h.command))
        ),
      }));
    }
  }
  return cleaned;
}

function mergeHookMatchers(existing, template) {
  // Clone the existing array; we'll mutate per-entry hook arrays via reference.
  const result = existing.map((m) => ({ ...m, hooks: [...(m.hooks || [])] }));
  for (const tplEntry of template) {
    const target = result.find((e) => e.matcher === tplEntry.matcher);
    if (!target) {
      // New matcher — keep it as-is
      result.push({ ...tplEntry, hooks: [...(tplEntry.hooks || [])] });
      continue;
    }
    // Same matcher — append template hooks not already present (compare by command)
    const existingCmds = new Set(target.hooks.map((h) => h.command));
    for (const tplHook of tplEntry.hooks || []) {
      if (!existingCmds.has(tplHook.command)) {
        target.hooks.push(tplHook);
      }
    }
  }
  return result;
}

function getItemRelativePath(comp, itemKey) {
  // Single-file components (settings.json)
  if (comp.isFile) return comp.src;

  // Project-generated: items keys ARE full relative paths
  if (comp.kind === 'project-generated') return itemKey;

  // Pre-shipped multi-file groups
  if (comp.src === '.claude/skills') {
    return path.join(comp.src, itemKey, 'SKILL.md');
  }
  // Hook scripts have .cjs extension
  if (comp.src === '.claude/hooks') {
    return path.join(comp.src, itemKey + '.cjs');
  }
  // commands / rules / agents are plain .md
  return path.join(comp.src, itemKey + '.md');
}

// ===========================================================================
// Exports
// ===========================================================================

module.exports = {
  artifactState,
  // Colors
  green, red, yellow, blue, cyan, bold, dim, gray,

  // Logging
  info, success, warn, error, step,

  // File operations
  copyDirRecursive, copyDirFiltered, fileExists, readJSON, writeJSON,
  ensureDir, getRelativePaths, diffFiles,

  // Manifest
  MANIFEST_FILE, readManifest, writeManifest, createManifest,

  // Templates
  getTemplatesDir,

  // Components
  COMPONENTS,
  getItemRelativePath,

  // Settings merge (v1.4.2)
  mergeSettingsJson,
  mergeHookEvents,
  mergeHookMatchers,

  // Orphan detection (v1.4.3)
  removeOrphanHooks,
  extractCommands,
};
