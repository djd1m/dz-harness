'use strict';
// Skill dialect compiler — ADR-006: one canonical source, per-target variants are
// GENERATED from data/dialects.json, never hand-forked. The canonical corpus is
// UPSTREAM CONTENT and is NOT shipped in this package (ADR-001 guardrail: zero
// upstream bytes); the compiler reads it from a directory the caller points at
// (typically `skill/cloudru-hub/` next to the runtime-resolved engine).
//
// Layer-1 guarantees enforced HERE, not by reviewer judgment (ADR-006 Confirmation):
//   - dialect: no forbidden Hermes token survives in any emitted variant (hard fail);
//   - links:   a dangling relative .md link is UNLINKED (text kept) and counted —
//              "инструкция указывает в пустоту" is closed for all targets at once;
//   - size:    router ≤ routerMaxChars for lossy layouts (hard fail), reported for all;
//   - determinism: compilation is a pure function of (canonical bytes, config) — the
//              test compiles twice and requires byte-identity.

const fs = require('fs');
const path = require('path');

const DIALECTS_FILE = path.join(__dirname, '..', 'data', 'dialects.json');

function loadDialects() {
  return JSON.parse(fs.readFileSync(DIALECTS_FILE, 'utf8'));
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function applyReplacements(text, replacements) {
  let out = text;
  for (const r of replacements) out = out.replace(new RegExp(r.find, r.flags || 'g'), r.replace);
  return out;
}

/** Keep only `name:`/`description:` (with indented continuations) in the frontmatter —
 *  ADR-006 Consequences: `metadata.hermes` and friends do not travel. */
function filterFrontmatter(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return text;
  const head = text.slice(4, end).split('\n');
  const kept = [];
  let keeping = false;
  for (const line of head) {
    if (/^(name|description):/.test(line)) { keeping = true; kept.push(line); continue; }
    if (/^\S/.test(line)) { keeping = false; continue; }
    if (keeping) kept.push(line); // indented continuation of a kept key
  }
  return '---\n' + kept.join('\n') + text.slice(end);
}

const LINK_RE = /\[([^\]]*)\]\(([^)#\s]+[^)]*)\)/g;

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Unlink dangling relative links against the EMITTED layout; return {text, dangling[]}. */
function resolveLinks(text, fileRel, emittedFiles) {
  const have = new Set(emittedFiles.map((f) => f.split(path.sep).join('/')));
  const dangling = [];
  const out = text.replace(LINK_RE, (m, label, target) => {
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith('mailto:')) return m;
    const clean = target.split('#')[0];
    if (clean === '') return m;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel.split(path.sep).join('/')), clean));
    if (have.has(resolved)) return m;
    dangling.push(`${fileRel}: (${target})`);
    return label; // keep the words, drop the pointer into the void
  });
  return { text: out, dangling };
}

/**
 * Compile the canonical skill tree for one target.
 * @returns {{ok:boolean, files:Record<string,string>, report:{dangling:string[],
 *            forbidden:string[], routerChars:number, errors:string[]}}}
 * `files` maps relative path -> emitted content (caller writes them; keeps this pure).
 */
function compileSkill(canonicalDir, target, config = loadDialects()) {
  const targetCfg = config.targets[target];
  const errors = [];
  if (!targetCfg) {
    return { ok: false, files: {}, report: { dangling: [], forbidden: [], routerChars: 0, errors: [`unknown dialect target "${target}" (known: ${Object.keys(config.targets).join(', ')})`] } };
  }
  const rels = listFiles(canonicalDir);
  const emitted = {};
  for (const rel of rels) {
    const full = path.join(canonicalDir, rel);
    if (rel.endsWith('.md')) {
      let text = fs.readFileSync(full, 'utf8');
      text = applyReplacements(text, targetCfg.replacements);
      if (rel === 'SKILL.md') text = filterFrontmatter(text);
      emitted[rel] = text;
    } else {
      emitted[rel] = fs.readFileSync(full, 'utf8');
    }
  }

  // link resolution against the emitted layout
  const emittedList = Object.keys(emitted);
  const dangling = [];
  for (const rel of emittedList) {
    if (!rel.endsWith('.md')) continue;
    const r = resolveLinks(emitted[rel], rel, emittedList);
    emitted[rel] = r.text;
    dangling.push(...r.dangling);
  }

  // dialect gate: forbidden tokens must be GONE (hard fail — a lying variant never ships)
  const forbidden = [];
  for (const rel of emittedList) {
    if (!rel.endsWith('.md')) continue;
    for (const token of config.forbiddenHermesTokens) {
      if (emitted[rel].includes(token)) forbidden.push(`${rel}: "${token}"`);
    }
  }
  // codename gate (2026-08-10, cross-model QE MEDIUM; token set expanded AM-2): the token
  // DENYLIST above only catches the 8 enumerated dialect constructs — compiling the real
  // corpus returned ok=true while the bare codename survived 5× (MEASURED). This is the
  // POSITIVE invariant instead: NO occurrence of an engine-IDENTITY codename, in ANY case,
  // in ANY emitted file (not just .md) — so the next unknown leak spelling is caught too.
  // The set now covers the full engine identity: `hermes`, plus the go-module owner
  // `dzhechko`, the CLI name `cloudru-vm-cli`, and `captainkeys` (captainkeys.go).
  // WORD-BOUNDARY (\b…\b), not raw substring: NECESSARY because a substring `dzhechko`
  // over-blocks the legitimately-shipped published scope `@dzhechkov` (dzhechko + v) — a
  // must-ship token, MEASURED. Word boundaries also drop harmless false positives like
  // "thermes"/"arithmetic" WITHOUT weakening the net against any OBSERVED real leak shape
  // (`~/.hermes/`, `hermes-agent`, prose "Hermes", Cyrillic-suffixed `hermesовский` — all
  // word-bounded; \b treats Cyrillic/`.`/`-`/`/` as non-word, so those still hard-fail).
  // Trade-off: a codename embedded inside a longer ALL-Latin word (e.g. `hermesbot`) is
  // NOT caught — but no such spelling has been observed and the compile fails LOUD at
  // build time on the maintainer's controlled corpus. The denylist is kept for the
  // construct-level tokens (tool_search, hermes cron, …) whose value is the precise
  // per-construct report; the codename scan is the net under it. New legitimate upstream
  // mentions must gain a scrub replacement in data/dialects.json — the compile fails
  // loudly until they do (never ships a leak).
  for (const rel of emittedList) {
    for (const codename of config.forbiddenCodenames || []) {
      const hits = (emitted[rel].match(new RegExp('\\b' + escapeRegExp(codename) + '\\b', 'gi')) || []).length;
      if (hits > 0) forbidden.push(`${rel}: codename "${codename}" x${hits} (case-insensitive, word-boundary)`);
    }
  }
  if (forbidden.length > 0) errors.push(`forbidden Hermes-dialect tokens survive: ${forbidden.join('; ')}`);

  // size gate
  const routerChars = (emitted['SKILL.md'] || '').length;
  if (targetCfg.layout !== 'lossless' && routerChars > config.routerMaxChars) {
    errors.push(`router SKILL.md is ${routerChars} chars > ${config.routerMaxChars} cap for lossy target ${target}`);
  }

  return { ok: errors.length === 0, files: emitted, report: { dangling, forbidden, routerChars, errors } };
}

/** Write a compile result to disk (only when ok). */
function writeCompiled(result, outDir) {
  if (!result.ok) throw new Error('refusing to write a failed compile: ' + result.report.errors.join('; '));
  for (const [rel, content] of Object.entries(result.files)) {
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
}

module.exports = { DIALECTS_FILE, loadDialects, compileSkill, writeCompiled, filterFrontmatter, resolveLinks };
