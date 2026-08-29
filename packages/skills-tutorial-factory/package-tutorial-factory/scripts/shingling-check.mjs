#!/usr/bin/env node
// PROVENANCE (AM-3): forked from
//   packages/@dzhechkov/skills-book-digitizer/scripts/shingling-check.mjs
// then HARDENED across two Codex QE rounds (2026-07-28, ADR-004 IP property) into a stricter IP gate.
// This copy has DIVERGED from the digitizer's — do NOT blindly re-sync. It closes these evasions:
//   round-1  no cited-quote exemption (a run >=8 words violates regardless of quotes/[p.N]); fenced &
//            inline code prose is shingled; NFKC + de-hyphenation; scans .md/.mdx/.txt/.json/.html/.htm.
//   round-2  zero-width / default-ignorable code points stripped before tokenizing; ONLY real page
//            anchors blanked (a bracket with prose words is scanned, not deleted); HTML entities decoded;
//            YAML frontmatter is strip-but-SCAN; JSON OBJECT KEYS scanned (not only values); HTML
//            comment/<script>/<style> TEXT scanned.
//
// DETERMINISTIC word-shingling verbatim-overlap IP gate. NO deps, NO Date/random.
//
//   node shingling-check.mjs --source <dir-or-file> --output <dir-or-file> [--shingle 8] [--json report.json]
//
// A verbatim run of N words is an N-word shingle present in BOTH the source and the output; consecutive
// overlapping shingles collapse into one contiguous run. Exit 0 iff zero violations, else 1.

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes(`--${name}`);
const sourceArg = opt('source', null);
const outputArg = opt('output', null);
const W = Math.max(1, parseInt(opt('shingle', '8'), 10) || 8);
const jsonOut = opt('json', null);

if (!sourceArg || !outputArg || has('help') || has('h')) {
  console.error('usage: shingling-check --source <dir-or-file> --output <dir-or-file> [--shingle 8] [--json report.json]');
  process.exit(2);
}

const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.json', '.html', '.htm']);

// ---- file collection (HIGH-5: all text-bearing formats, not just .md) -------
function collect(path) {
  let st;
  try { st = statSync(path); }
  catch { console.error(`shingling-check: path not found: ${path}`); process.exit(2); }
  if (st.isFile()) return [path]; // a file passed directly is taken as-is regardless of extension
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && TEXT_EXT.has(extname(name.name).toLowerCase())) out.push(p);
    }
  };
  walk(path);
  return out.sort();
}

// ---- HTML entity decoding (Codex round-2 #3) --------------------------------
// Decode numeric (&#8230; / &#x2026;) and common named entities so an entity-encoded verbatim run is
// caught. Iterate a few times to unwind multi-encoding (&amp;#8230; → &#8230; → …).
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', copy: '©', reg: '®', trade: '™',
  shy: '', middot: '·', bull: '•', deg: '°', sect: '§', para: '¶', dagger: '†', euro: '€', pound: '£',
  // accented Latin letters (round-3 PART-B: complete the map so &eacute; etc. decode)
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', oelig: 'œ',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ', szlig: 'ß', scaron: 'š',
  // NOTE: names are looked up case-INSENSITIVELY (so &Eacute; also maps here). That folds case — fine,
  // because shingling lowercases every token anyway; é and É are equivalent for verbatim detection.
};
function fromCP(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '';
  try { return String.fromCodePoint(n); } catch { return ''; }
}
function decodeEntitiesOnce(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => fromCP(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => fromCP(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, n.toLowerCase()) ? NAMED_ENTITIES[n.toLowerCase()] : m));
}
function decodeEntities(s) {
  let prev = s;
  for (let i = 0; i < 3; i++) { const next = decodeEntitiesOnce(prev); if (next === prev) break; prev = next; }
  return prev;
}

// ---- per-format text extraction (HIGH-5 + round-2 #3) -----------------------
// Recursively pull every string value AND every OBJECT KEY out of parsed JSON — a verbatim run hidden
// in a key (Codex round-2) must be scanned too.
function jsonStrings(v, acc) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) for (const x of v) jsonStrings(x, acc);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { acc.push(k); jsonStrings(v[k], acc); }
  return acc;
}
function extractText(path, raw) {
  const ext = extname(path).toLowerCase();
  if (ext === '.json') {
    try { return jsonStrings(JSON.parse(raw), []).join('\n'); }
    catch { return raw; } // malformed JSON → shingle the raw text (fail-safe: never hide prose)
  }
  if (ext === '.html' || ext === '.htm') {
    // Extract text-bearing attributes (round-3 PART-B) BEFORE tags are stripped, keep comment/script
    // TEXT (round-2). Tags themselves are stripped to EMPTY by normalizeText so `clev<span></span>er`
    // rejoins to `clever`.
    const attrs = [...raw.matchAll(/\b(?:alt|title|aria-label|aria-labelledby|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
      .map((m) => m[1] != null ? m[1] : m[2]).join(' ');
    const body = raw.replace(/<!--/g, ' ').replace(/-->/g, ' '); // de-delimit comments, keep their text
    return body + ' ' + attrs;
  }
  return stripMarkdown(raw); // .md/.mdx/.txt and any file passed directly
}

// ---- markdown scaffolding strip (HIGH-3: keep code PROSE, drop only fences) --
function stripMarkdown(raw) {
  let s = raw.replace(/\r\n?/g, '\n');
  // YAML frontmatter: STRIP-BUT-SCAN (round-2) — remove only the leading --- fences, KEEP the yaml text
  // so a verbatim run hidden in frontmatter is still shingled.
  s = s.replace(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/, (_m, body) => '\n' + body + '\n');
  // Remove ONLY the fence delimiter lines (```lang / ``` / ~~~), KEEP the fenced body (HIGH-3). Same
  // for inline code: drop the backticks, keep the inner text.
  s = s.replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, ' ');
  s = s.replace(/`([^`\n]*)`/g, ' $1 ');
  // De-delimit HTML comments so their text is scanned (round-3 PART-B); tags stripped later.
  s = s.replace(/<!--/g, ' ').replace(/-->/g, ' ');
  // markdown links/images [text](url "title") → keep the link TEXT and the TITLE (round-3 PART-B), drop
  // only the url. Reference-style [text][ref] keeps the text.
  s = s.replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, (_m, txt, target) => {
    const title = (target.match(/["']([^"']*)["']\s*$/) || [])[1] || '';
    return ' ' + txt + ' ' + title + ' ';
  });
  s = s.replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, (_m, txt) => ' ' + txt + ' ');
  return s;
}

// Blank ONLY real page anchors (round-2 #2): a bracket that is nothing but an optional page prefix +
// digits (+ optional range). A bracket that contains letters/words is PROSE and must NOT be deleted,
// so `[<verbatim run> 1]` can no longer hide a run.
const PAGE_ANCHOR = /\[\s*(?:p|pp|pg|page|с|стр|гл)?\.?\s*\d+(?:\s*[-–—]\s*\d+)?\s*\]/gi;
function blankAnchors(s) {
  return s.replace(PAGE_ANCHOR, (m) => ' '.repeat(m.length));
}

// ---- normalization → tokens (HIGH-4 + round-2 #1) ---------------------------
// Default-ignorable / zero-width code points (U+200B/C/D, U+FEFF, U+2060, bidi controls, soft hyphen…)
// are NOT removed by NFKC, so a run with a zero-width injected mid-word would evade. Strip them all.
const IGNORABLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]|\p{Default_Ignorable_Code_Point}/gu;
function normalizeText(s) {
  return decodeEntities(s)
    .replace(/<[^>]+>/g, '')                        // strip inline HTML tags to EMPTY so `clev<span></span>er` → `clever` (round-3 PART-B)
    .normalize('NFKC')
    .replace(IGNORABLE, '')                         // zero-width / default-ignorable (round-2 #1)
    .replace(/(\p{L})[-‐-―−]\s*\n?\s*(\p{L})/gu, '$1$2'); // join hyphenation within/across lines
}
function tokenize(stripped) {
  const norm = normalizeText(stripped);
  const tokens = [], starts = [], ends = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m;
  while ((m = re.exec(norm)) !== null) {
    tokens.push(m[0].toLowerCase());
    starts.push(m.index);
    ends.push(m.index + m[0].length);
  }
  return { tokens, starts, ends, stripped: norm };
}
function reconstruct(tk, i, j) {
  return tk.stripped.slice(tk.starts[i], tk.ends[j]).replace(/\s+/g, ' ').trim();
}

// ---- shingling --------------------------------------------------------------
function shinglesOf(tokens) {
  const out = [];
  for (let i = 0; i + W <= tokens.length; i++) out.push(tokens.slice(i, i + W).join(' '));
  return out;
}

// ---- table header extraction (light copy heuristic) -------------------------
function tableHeaderSets(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const sets = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const sep = lines[i + 1];
    if (!/^\s*\|?\s*:?-{2,}.*\|/.test(sep) || !sep.includes('-')) continue;
    if (!lines[i].includes('|')) continue;
    const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean)
      .map((c) => (normalizeText(c).match(/[\p{L}\p{N}]+/gu) || []).join(' ').toLowerCase()).filter(Boolean);
    if (cells.length >= 2) sets.push(new Set(cells));
  }
  return sets;
}
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ---- build SOURCE ----------------------------------------------------------
const sourceFiles = collect(sourceArg);
const sourceSet = new Set();
const sourceTableSets = [];
for (const f of sourceFiles) {
  const raw = readFileSync(f, 'utf-8');
  const stripped = blankAnchors(extractText(f, raw));
  const { tokens } = tokenize(stripped);
  for (const sh of shinglesOf(tokens)) sourceSet.add(sh);
  for (const t of tableHeaderSets(raw)) sourceTableSets.push(t);
}

// ---- scan OUTPUT -----------------------------------------------------------
const outputFiles = collect(outputArg);
const violations = [];
const tableWarnings = [];
let outputShingleCount = 0;

for (const f of outputFiles) {
  const raw = readFileSync(f, 'utf-8');
  const stripped = blankAnchors(extractText(f, raw)); // NO cited-quote exemption (CRITICAL-2)
  const tk = tokenize(stripped);
  const shingles = shinglesOf(tk.tokens);
  outputShingleCount += shingles.length;

  const hit = shingles.map((sh) => sourceSet.has(sh));
  let i = 0;
  while (i < hit.length) {
    if (!hit[i]) { i++; continue; }
    let j = i;
    while (j + 1 < hit.length && hit[j + 1]) j++;
    const startTok = i, endTok = j + W - 1;
    violations.push({ file: f, words: endTok - startTok + 1, text: reconstruct(tk, startTok, endTok), startTok, endTok });
    i = j + 1;
  }

  for (const oh of tableHeaderSets(raw)) {
    if (oh.size >= 2 && sourceTableSets.some((sh) => setEq(oh, sh))) tableWarnings.push({ file: f, header: [...oh] });
  }
}

// ---- report ----------------------------------------------------------------
const rel = (p) => { try { return relative(process.cwd(), p) || p; } catch { return p; } };
const perFile = {};
for (const v of violations) perFile[v.file] = (perFile[v.file] || 0) + 1;

const report = {
  tool: 'shingling-check',
  hardened: 'no cited-quote exemption; code fences shingled; NFKC+de-hyphen; json/html/txt/mdx scanned',
  config: { shingle: W, source: sourceArg, output: outputArg },
  sourceFiles: sourceFiles.length,
  outputFiles: outputFiles.length,
  sourceShingles: sourceSet.size,
  outputShingles: outputShingleCount,
  totalViolations: violations.length,
  perFile: Object.fromEntries(Object.entries(perFile).map(([k, v]) => [rel(k), v])),
  samples: violations.slice(0, 15).map((v) => ({ file: rel(v.file), words: v.words, text: v.text })),
  tableWarnings: tableWarnings.map((t) => ({ file: rel(t.file), header: t.header })),
  pass: violations.length === 0,
};

const line = '─'.repeat(60);
console.log(line);
console.log(`shingling-check — verbatim-overlap IP gate (w=${W}, hardened)`);
console.log(line);
console.log(`source: ${sourceFiles.length} file(s), ${sourceSet.size} unique ${W}-word shingles`);
console.log(`output: ${outputFiles.length} file(s), ${outputShingleCount} shingles scanned`);
console.log(`verbatim runs (violations): ${violations.length}`);
if (violations.length) {
  console.log('\nper-file:');
  for (const [f, n] of Object.entries(report.perFile)) console.log(`  ${n}  ${f}`);
  console.log(`\nsample runs (up to 15):`);
  for (const s of report.samples) {
    const snip = s.text.length > 120 ? s.text.slice(0, 117) + '…' : s.text;
    console.log(`  [${s.words}w] ${rel(s.file)}\n        "${snip}"`);
  }
}
if (tableWarnings.length) {
  console.log(`\ntable-copy warnings (RESTRUCTURE, don't transcribe): ${tableWarnings.length}`);
  for (const t of report.tableWarnings.slice(0, 10)) console.log(`  ${t.file}: [${t.header.join(' | ')}]`);
}
console.log(line);
console.log(violations.length === 0
  ? 'PASS — no verbatim run >= ' + W + ' words.'
  : `FAIL — ${violations.length} verbatim run(s) >= ${W} words. Paraphrase (quotes/citations do NOT exempt).`);
console.log(line);

if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(report, null, 2)); console.log(`report → ${rel(jsonOut)}`); }

process.exit(violations.length === 0 ? 0 : 1);
