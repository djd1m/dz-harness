#!/usr/bin/env node
// extract-brief — DEFAULT lightweight doc-harvest concept extractor (ADR-002).
// node builtins only; deterministic. Produces a *Concept Brief* from a harness package's
// documentation-bearing surface (README + every SKILL.md + package.json exports/bin + test names),
// dependency-ordered (PocketFlow OrderChapters, docs instead of raw source). It NEVER builds a
// knowledge graph; when the doc surface is too thin it returns an escalation SIGNAL for
// understand-anything rather than emitting a 1-topic course.
//
//   node extract-brief.mjs --pkg <package-dir> [--min-topics 3] [--source-floor 5] [--doc-floor 1500] [--json brief.json]
//
// Output brief: { package, topics[], escalate: null | 'understand-anything' | 'insufficient-surface',
//                 counts: { skills, sourceFiles }, generatedFrom: 'doc-harvest' }
// Each topic carries id, title, keyConcepts[], suggestedExercise (heuristic), dependsOn[], kind, and
// a `source` provenance pointer — the INPUT Step-2 authoring consumes to write course sections (the
// Step-0 topics[] projection is then DERIVED from the authored course via toStepZero; the shapes are
// compatible, not identical — brief topics add dependsOn/kind/order, Step-0 adds methodPattern).
//
// F1 (dogfood 2026-07-29, fixed 2026-07-30): a package WITHOUT SKILL.md files used to cap at 2 topics
// (whole README collapsed to ONE overview topic + one API topic) and therefore ALWAYS escalated —
// even harness-cli's 186 KB / 24-section README (MEASURED — reproducer: extract-brief --pkg
// ../harness-cli on the pre-F1 script → "topics: 2, ESCALATE"). Now every SUBSTANTIVE README ##
// section is its own topic (the README IS a curriculum outline), and escalation is decided by DOC
// VOLUME (--doc-floor, substantive chars), with the topic floor kept only as the degenerate-course
// backstop. Course SIZING stays a Step-2 authoring decision — the harvester reports everything
// teachable, it does not curate.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename, relative, resolve } from 'node:path';

const argv = process.argv.slice(2);
// a value that is itself an option flag means the value was omitted — fall back to the default
// instead of silently consuming the next token (Codex QE #10)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); const v = i >= 0 ? argv[i + 1] : undefined; return v === undefined || String(v).startsWith('--') ? d : v; };
const has = (n) => argv.includes(`--${n}`);
// strict numeric parse: Number() rejects '1500junk' and reads '1e6' as 1000000 — parseInt did the
// opposite on both (Codex QE #10); non-finite falls back to the default, then clamps
const clampInt = (v, def, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : def; };

const pkgDir = opt('pkg', null);
const MIN_TOPICS = clampInt(opt('min-topics', '3'), 3, 1, 100);
const SOURCE_FLOOR = clampInt(opt('source-floor', '5'), 5, 1, 100000);
const DOC_FLOOR = clampInt(opt('doc-floor', '1500'), 1500, 1, 10000000); // substantive doc chars
const jsonOut = opt('json', null);

if (!pkgDir || has('help') || has('h')) {
  console.error('usage: extract-brief --pkg <package-dir> [--min-topics 3] [--source-floor 5] [--doc-floor 1500] [--json brief.json]');
  process.exit(2);
}

// ---- fs helpers (deterministic, sorted) -------------------------------------
function walk(dir, pred, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (e.isFile() && pred(p, e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => { try { return relative(pkgDir, p) || basename(p); } catch { return p; } };
const readSafe = (p) => { try { return readFileSync(p, 'utf-8'); } catch { return ''; } };

// Extract front-matter name + description from a SKILL.md.
function parseSkill(raw) {
  const out = { name: null, description: '' };
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  const block = fm ? fm[1] : raw.slice(0, 800);
  const nm = block.match(/^name:\s*(.+)$/m);
  if (nm) out.name = nm[1].trim();
  const dm = block.match(/description:\s*(?:[>|]\s*)?([\s\S]*?)(?:\n[a-z_]+:|\n---|$)/);
  if (dm) out.description = dm[1].replace(/\s+/g, ' ').trim().slice(0, 400);
  return out;
}

// Heuristic exercise type per topic kind (varied so the downstream course isn't monotone).
const EX_CYCLE = ['quiz', 'flashcards', 'matching', 'scenario', 'builder', 'drag-and-drop'];

// ---- harvest ----------------------------------------------------------------
const skillFiles = walk(pkgDir, (_p, n) => n === 'SKILL.md');
const sourceFiles = walk(pkgDir, (p) => ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(extname(p)) && !/\.test\./.test(p));
const testFiles = walk(pkgDir, (p) => /\.test\.(m?js|ts|tsx)$/.test(p) || /(^|\/)test(s)?\//.test(p));

const topics = [];
const usedIds = new Set();
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'topic';
// duplicate headings must not silently merge into one id — dedupe with a numeric suffix
const uniqueId = (base) => {
  let id = base, n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
};

// F1: README ## sections that carry no teachable content — legal/meta boilerplate — never become
// topics and never count toward doc volume. EXACT match on the normalized heading (emoji/punctuation
// stripped, lowercased) — a prefix match would wrongly discard real features like "License Management"
// (Codex QE #5).
const BOILERPLATE = new Set([
  'license', 'licence', 'changelog', 'contributing', 'contributors', 'credits', 'credit',
  'acknowledgements', 'acknowledgments', 'badges', 'table of contents', 'toc', 'contents', 'status',
  'code of conduct', 'release notes', 'version history', 'support', 'related projects', 'see also',
]);
// punctuation becomes a SPACE, never vanishes — 'Code-of-Conduct' must normalize to
// 'code of conduct', not 'codeofconduct' (Codex QE round-2 #6)
const normHeading = (h) => String(h).replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
// A section is SUBSTANTIVE when its body carries at least this many characters (code fences count —
// code is teachable content). Below it, the section is an index/stub line, not a topic.
const SECTION_FLOOR = 300;

// CommonMark-faithful fence tracking (Codex QE round-2 #1/#2): an opener is 0–3 spaces of indent
// then a run of >=3 backticks OR tildes; it closes ONLY on the SAME character with a run at least
// as long. A `~~~` inside a backtick fence is content; a 4-space-indented ``` is an indented code
// block, not a fence. Honest scope: list-embedded fences (`- ```md`) are not tracked (module 01).
// walkLines() is the ONE fence walker shared by section splitting and fence stripping, so the two
// can never disagree about what is inside a fence (round-2 #3 was exactly such a disagreement).
function walkLines(text, onLine) {
  let fence = null;                                        // { ch, len } while inside a fence
  for (const line of String(text).split('\n')) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (m) {
      const ch = m[1][0], len = m[1].length;
      if (!fence) { fence = { ch, len }; onLine(line, true); continue; }
      if (fence.ch === ch && len >= fence.len) { fence = null; onLine(line, true); continue; }
      onLine(line, true); continue;                        // a non-matching delimiter is fence CONTENT
    }
    onLine(line, fence !== null);
  }
}

// Split a README into { heading, body } sections on ## boundaries, FENCE-AWARE: a "## " line inside
// a code fence is example content, not a section (Codex QE #1 — the harness-cli README's code
// samples were harvested as bogus topics). Line-walk, LF-normalized. Honest scope: ATX `##` headings
// only — setext/HTML headings are out of scope (documented in module 01).
function readmeSections(raw) {
  const out = [{ heading: null, body: [] }];               // [0] = pre-## intro
  walkLines(String(raw).replace(/\r\n?/g, '\n'), (line, inFence) => {
    if (!inFence && /^##\s+/.test(line)) {
      out.push({ heading: line.replace(/^##\s+/, '').replace(/[`*#]/g, '').trim(), body: [] });
      return;
    }
    out[out.length - 1].body.push(line);
  });
  const intro = out[0].body.join('\n');
  const sections = out.slice(1).map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }));
  return { intro, sections };
}
// Strip fenced code lines — used before harvesting ### subheads / first sentences so example code
// cannot pollute keyConcepts. Shares walkLines, so an UNCLOSED fence strips to EOF exactly as the
// section splitter suppresses it (Codex QE round-2 #3).
function stripFences(s) {
  const kept = [];
  walkLines(s, (line, inFence) => { if (!inFence) kept.push(line); });
  return kept.join('\n');
}

// 1) One overview topic from README (foundational — ordered first) + one topic per substantive
// ## section (F1: the README IS the curriculum outline; it must not collapse to a single topic).
const readmePath = ['README.md', 'readme.md'].map((f) => join(pkgDir, f)).find((p) => existsSync(p));
let docChars = 0;                        // substantive teachable characters (drives escalation, F1)
let substantiveSections = [];
let overviewTopicId = null;              // skills depend on the OVERVIEW, never on a sibling skill (r2 #4)
if (readmePath) {
  const raw = readSafe(readmePath).replace(/\r\n?/g, '\n');  // CRLF-normalized once (Codex QE #4)
  const h1 = ((raw.match(/^#\s+(.+)$/m) || [])[1] || basename(resolve(pkgDir))).trim();
  const { sections } = readmeSections(raw);
  substantiveSections = sections.filter((s) => s.heading && !BOILERPLATE.has(normHeading(s.heading)) && s.body.length >= SECTION_FLOOR);
  // Doc volume = substantive section bodies + SKILL.md files ONLY. The pre-## intro is deliberately
  // EXCLUDED: badges / generated TOCs / marketing prose there could otherwise supply the whole floor
  // and suppress a deserved escalation (Codex QE #2).
  docChars += substantiveSections.reduce((n, s) => n + s.body.length, 0);
  const heads = substantiveSections.map((s) => s.heading);   // ALL of them — the old slice(0,8) silently dropped curriculum
  // The overview exists only when there is at least one substantive section — a README of pure
  // boilerplate/badges must not mint a topic (Codex QE #2).
  if (heads.length >= 1) {
    topics.push({
      id: uniqueId(kebab(`overview-${h1}`)),
      title: `Overview: ${h1}`.slice(0, 80),
      keyConcepts: heads,
      suggestedExercise: 'flashcards',
      dependsOn: [],
      source: rel(readmePath),
      kind: 'overview',
    });
  }
  overviewTopicId = topics.length ? topics[0].id : null;
  const overviewId = overviewTopicId;
  for (const s of substantiveSections) {
    // key concepts: ### subheadings when present (fence-stripped, bounded at 8 per section — the
    // FULL curriculum lives in the topics themselves), else the section's first prose sentence
    const bodyProse = stripFences(s.body);
    const subs = [...bodyProse.matchAll(/^\s*###\s+(.+)$/gm)].map((m) => m[1].replace(/[`*#]/g, '').trim()).filter(Boolean);
    const firstSentence = (bodyProse.match(/[^.!?\n]{10,220}[.!?]/) || [s.heading])[0].trim();
    const id = uniqueId(kebab(s.heading));
    topics.push({
      id,
      title: s.heading.slice(0, 80),
      keyConcepts: subs.length ? subs.slice(0, 8) : [firstSentence],
      suggestedExercise: EX_CYCLE[topics.length % EX_CYCLE.length],
      dependsOn: overviewId ? [overviewId] : [],
      // provenance pointer, unique per topic (dup headings share a slug but not an id) — NOT a
      // guaranteed GitHub anchor (Codex QE #8, documented in module 01)
      source: `${rel(readmePath)}#${id}`,
      kind: 'readme-section',
    });
  }
}

// 2) One topic per SKILL.md (each skill IS a teachable unit; its description states the decision moment).
for (const sf of skillFiles) {
  const skillRaw = readSafe(sf).replace(/\r\n?/g, '\n');   // CRLF-normalized like the README (r2 #5)
  docChars += skillRaw.trim().length;
  const meta = parseSkill(skillRaw);
  const name = meta.name || basename(join(sf, '..'));
  topics.push({
    id: uniqueId(kebab(name)),
    title: name,
    keyConcepts: meta.description ? [meta.description] : [name],
    suggestedExercise: EX_CYCLE[topics.length % EX_CYCLE.length],
    dependsOn: overviewTopicId ? [overviewTopicId] : [],   // never a sibling skill (r2 #4)
    source: rel(sf),
    kind: 'skill',
  });
}

// 3) API topic from package.json bin/exports (behavior stated by the interface).
const pkgJsonPath = join(pkgDir, 'package.json');
if (existsSync(pkgJsonPath)) {
  let pj = {};
  try { pj = JSON.parse(readSafe(pkgJsonPath)); } catch { /* ignore */ }
  // string-form bin/exports are legal package.json (Codex QE #9): "bin": "cli.js" must yield the
  // command name, never Object.keys of a string ('0','1',…)
  const api = [
    ...(typeof pj.bin === 'string' ? [pj.name || basename(resolve(pkgDir))] : Object.keys(pj.bin || {})),
    ...(typeof pj.exports === 'string' ? ['.'] : (pj.exports && typeof pj.exports === 'object' ? Object.keys(pj.exports) : [])),
    ...(pj.main ? [pj.main] : []),
  ].filter(Boolean);
  if (api.length >= 1 && skillFiles.length === 0) {
    // only add a dedicated API topic when there is no per-skill coverage (avoid over-counting doc-rich packs)
    topics.push({
      id: uniqueId(kebab(`api-${pj.name || basename(pkgDir)}`)),
      title: `Public API & commands`,
      keyConcepts: api.slice(0, 8),
      suggestedExercise: 'builder',
      dependsOn: topics.map((t) => t.id).slice(0, 1),
      source: 'package.json',
      kind: 'api',
    });
  }
}

// ---- dependency ordering (foundational → advanced): overview → README sections → skills → api ---
const kindRank = { overview: 0, 'readme-section': 1, skill: 2, api: 3 };
topics.sort((a, b) => (kindRank[a.kind] - kindRank[b.kind]));
topics.forEach((t, i) => { t.order = i + 1; });

// ---- escalation (ADR-002, re-based by F1) -----------------------------------
// PRIMARY signal: substantive DOC VOLUME. The old topic-count trigger always fired for no-SKILL.md
// packs (structural ceiling of 2 topics — even a 186 KB README escalated). The topic floor remains
// only as the degenerate-course backstop: below MIN_TOPICS a course is not a course regardless of
// how fat one section is. Doc-thin WITH real source surface → understand-anything (a code-deep
// pass). Doc-thin AND code-thin → insufficient-surface (report it, never stub).
// The topic backstop counts CONTENT topics only (readme-section + skill) — the overview and the
// manifest-derived API topic are scaffolding and must not vault a one-section README over the
// floor (Codex QE #3).
const contentTopics = topics.filter((t) => t.kind === 'readme-section' || t.kind === 'skill').length;
let escalate = null;
if (docChars < DOC_FLOOR || contentTopics < MIN_TOPICS) {
  escalate = sourceFiles.length >= SOURCE_FLOOR ? 'understand-anything' : 'insufficient-surface';
}

const brief = {
  package: basename(resolve(pkgDir)),
  generatedFrom: 'doc-harvest',
  counts: { skills: skillFiles.length, sourceFiles: sourceFiles.length, tests: testFiles.length, topics: topics.length, contentTopics, readmeSections: substantiveSections.length, docChars },
  minTopics: MIN_TOPICS,
  docFloor: DOC_FLOOR,
  escalate,
  topics,
};

const line = '─'.repeat(60);
console.log(line);
console.log(`extract-brief — doc-harvest concept extractor (ADR-002)`);
console.log(line);
console.log(`package: ${brief.package}`);
console.log(`skills: ${skillFiles.length}  source-files: ${sourceFiles.length}  tests: ${testFiles.length}  readme-sections: ${substantiveSections.length}  doc-chars: ${docChars}`);
console.log(`topics harvested: ${topics.length} (topic floor ${MIN_TOPICS}, doc floor ${DOC_FLOOR})`);
for (const t of topics) console.log(`  ${t.order}. [${t.kind}] ${t.title}  ← ${t.source}`);
console.log(escalate ? `ESCALATE → ${escalate}` : 'doc-harvest sufficient (no escalation)');
console.log(line);

if (jsonOut) { const { writeFileSync } = await import('node:fs'); writeFileSync(jsonOut, JSON.stringify(brief, null, 2)); console.log(`brief → ${jsonOut}`); }

// exit 0 on a usable brief; exit 3 (distinct, non-fatal) when escalation is signalled so a caller can branch.
process.exit(escalate ? 3 : 0);
