'use strict';

// lib/check.js — the .md ↔ .html pairing gate (ADR-001 C3, FR-3).
//
// EXIT CONTRACT (load-bearing, tested): 1 if any unpaired .md, 0 otherwise, 2 on usage error.
// There is NO --warn mode and NO warn-only outcome — a warning re-creates the discoverability
// failure one floor up, inside the very tool meant to close it.

const fs = require('fs');
const path = require('path');

// The workspace convention documented in base/skills/health-advisor.md (File Structure).
//
// 1.7.0 — THIS ARRAY IS NO LONGER DEFINED HERE. It is imported from lib/workspace-layout.js, the one
// machine definition of the layout (INV-10); the name stays exported so any external consumer that
// imports DEFAULT_SCOPE_DIRS keeps working byte-identically.
const {
  CANONICAL_DIRS, isPairingExempt,
} = require('./workspace-layout.js');

const DEFAULT_SCOPE_DIRS = CANONICAL_DIRS;

// NFR-2: never recurse into node_modules or dot-directories; never count repo boilerplate.
const SKIP_FILES = new Set(['README.md', 'CHANGELOG.md']);

function isSkippedFile(name) {
  return SKIP_FILES.has(name) || /^LICENSE/i.test(name);
}

function walk(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.name.toLowerCase().endsWith('.md') && !isSkippedFile(entry.name)) {
      acc.push(full);
    }
  }
}

// scanWorkspace({ dir, all }) -> { checked, paired, unpaired: [{ md, expectedHtml }] }
// Default scope: the conventional workspace dirs (sources/ research/ analysis/ doctors/) beneath
// `dir`; none present -> `dir` itself. `all: true` -> the whole tree under `dir`.
// Paths in the result are relative to `dir` (a rule a patient can read in their own folder).
function scanWorkspace({ dir = process.cwd(), all = false } = {}) {
  const root = path.resolve(dir);
  let scopes;
  if (all) {
    scopes = [root];
  } else {
    scopes = DEFAULT_SCOPE_DIRS.map((d) => path.join(root, d)).filter(
      (d) => fs.existsSync(d) && fs.statSync(d).isDirectory()
    );
    if (scopes.length === 0) scopes = [root];
  }

  const collected = [];
  for (const scope of scopes) walk(scope, collected);

  // THE RAW ZONE IS EXEMPT, AND THE EXEMPTION IS NAMED (C-2, INV-11's sibling property).
  // Files under sources/raw/** are IMMUTABLE PRIMARY SOURCES written by `intake-archive`, not
  // deliverables awaiting a render — an ingested archive may contain `.md` that will never have an
  // `.html` sibling. The gate itself is UNWEAKENED outside that one path: the exemption is a single
  // named prefix from lib/workspace-layout.js, tested in BOTH directions
  // (test/check-raw-excluded-pairing.test.js), and it is applied to the pairing CANDIDATE list —
  // there is no new outcome, no new flag, and no warn mode.
  const mdFiles = collected.filter((md) => !isPairingExempt(path.relative(root, md)));

  const unpaired = [];
  for (const md of mdFiles) {
    const expectedHtml = path.join(path.dirname(md), path.basename(md, path.extname(md)) + '.html');
    if (!fs.existsSync(expectedHtml)) {
      unpaired.push({ md: path.relative(root, md), expectedHtml: path.relative(root, expectedHtml) });
    }
  }

  return {
    checked: mdFiles.length,
    paired: mdFiles.length - unpaired.length,
    unpaired,
    scanned: scopes.map((s) => (s === root ? '.' : path.relative(root, s))),
  };
}

// CLI adapter for `check`. Returns the process exit code.
function runCheck({ dir, all, json, cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd, dir || '.');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`[ERROR] health-advisor check: not a directory: ${root}`);
    return 2;
  }

  const result = scanWorkspace({ dir: root, all: !!all });
  // THE single exit point of the gate (architecture §7's discrimination seam): text mode and
  // JSON mode both return this value — there is no second place where the verdict is decided.
  const exitCode = result.unpaired.length > 0 ? 1 : 0;

  if (json) {
    // Same exit codes as text mode — a JSON mode that always exits 0 is how a gate dies quietly.
    console.log(
      JSON.stringify(
        { checked: result.checked, paired: result.paired, unpaired: result.unpaired },
        null,
        2
      )
    );
    return exitCode;
  }

  if (result.checked === 0) {
    console.log(`nothing to check — scanned: ${result.scanned.join(', ')}`);
    return exitCode;
  }

  if (result.unpaired.length > 0) {
    // Each unpaired entry prints its own fix command in the AM-5-admissible form: the binary that
    // just printed it (process.argv[1]) — never an `npx`/`health-advisor` string that may not
    // resolve on the reader's machine.
    const self = process.argv[1] || 'bin/health-advisor.js';
    for (const u of result.unpaired) {
      console.log(`${u.md} → missing ${u.expectedHtml}   fix: node ${self} render ${u.md}`);
    }
    console.log(`checked ${result.checked}, paired ${result.paired}, unpaired ${result.unpaired.length}`);
  } else {
    console.log(`checked ${result.checked}, paired ${result.paired}`);
  }
  return exitCode;
}

module.exports = { scanWorkspace, runCheck, DEFAULT_SCOPE_DIRS };
