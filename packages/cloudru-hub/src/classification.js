'use strict';
// Golden tool classification (ADR-004 Confirmation, layer 1) — loads
// data/tools-classification.json and derives the permission rule sets the installer
// emits. Deny-by-default: a live tool absent from the classification is a DRIFT
// FINDING, never silently allowed.

const fs = require('fs');
const path = require('path');

const CLASSIFICATION_FILE = path.join(__dirname, '..', 'data', 'tools-classification.json');
const SNAPSHOT_FILE = path.join(__dirname, '..', 'data', 'tools-list-snapshot.json');

// The MCP tool-name prefix normalization (`mcp__cloudru-vm__*` vs `mcp__cloudru_vm__*`)
// is ❌ NOT VERIFIED until a live Claude Code probe (feature README, open blocker 3).
// Until then we emit BOTH spellings — an unmatched permission rule is inert, and the
// deny-by-default direction stays safe regardless of which spelling the runtime uses.
const SERVER_PREFIXES = ['mcp__cloudru-vm__', 'mcp__cloudru_vm__'];

function loadClassification() {
  return JSON.parse(fs.readFileSync(CLASSIFICATION_FILE, 'utf8'));
}

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
}

/** Names by permission action, from the golden file. */
function namesByPermission(cls = loadClassification()) {
  const out = { allow: [], ask: [], deny: [] };
  for (const [name, c] of Object.entries(cls.tools)) out[c.permission].push(name);
  return out;
}

/** Full permission rule strings (both prefix spellings) the installer writes. */
function permissionRules(cls = loadClassification()) {
  const by = namesByPermission(cls);
  const expand = (names) => names.flatMap((n) => SERVER_PREFIXES.map((p) => p + n)).sort();
  return { allow: expand(by.allow), ask: expand(by.ask), deny: expand(by.deny) };
}

/**
 * Drift check against a LIVE tools/list (ADR-004 Confirmation: "падает, если появился
 * тул, неизвестный классификатору ИЛИ мутирующий тул отсутствует в шаблоне").
 * @param {string[]} liveNames
 * @returns {{unknown:string[], missing:string[]}} unknown = live tool not classified;
 *          missing = classified tool absent from the live list (engine drift the other way).
 */
function coverageGaps(liveNames, cls = loadClassification()) {
  const classified = new Set(Object.keys(cls.tools));
  const live = new Set(liveNames);
  return {
    unknown: liveNames.filter((n) => !classified.has(n)).sort(),
    missing: [...classified].filter((n) => !live.has(n)).sort(),
  };
}

module.exports = {
  CLASSIFICATION_FILE,
  SNAPSHOT_FILE,
  SERVER_PREFIXES,
  loadClassification,
  loadSnapshot,
  namesByPermission,
  permissionRules,
  coverageGaps,
};
