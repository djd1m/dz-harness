#!/usr/bin/env node
// shingling-check — DETERMINISTIC word-shingling verbatim-overlap IP gate for the book-digitizer.
// NO deps, NO Date/random: node builtins only, so the gate is reproducible in CI and on any machine.
//
//   node shingling-check.mjs --source <dir-or-file> --output <dir-or-file> [--shingle 8] [--max-quote 25] [--json report.json]
//
// WHY: the digitizer distills copyrighted books into PARAPHRASED KUs/skills. The IP rule is that
// prose must be paraphrased — no verbatim run of >= N words (default 8) copied from the source —
// EXCEPT short, explicitly-cited quotes. This mechanically enforces that discipline (previously it
// was only agent-enforced). A verbatim run of N words is detected as an N-word shingle that exists
// in BOTH the source shingle-set and the output; consecutive overlapping shingles collapse into one
// contiguous run for reporting. Cited short quotes («…» / "…" followed by a page citation) are
// removed from the OUTPUT before shingling, so a properly-cited <= max-quote quote MUST pass.
//
// Design: deterministic (no Date/random); Unicode-aware (RU + EN, keep \p{L}\p{N}); the cited-quote
// exemption is CONSERVATIVE — it only exempts a quoted run that is both short (<= max-quote words)
// AND immediately followed by a page citation, so a borderline copy is flagged rather than silently
// passed. Exit 0 iff zero violations remain after exemptions, else 1.

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes(`--${name}`);
const sourceArg = opt('source', null);
const outputArg = opt('output', null);
const W = Math.max(1, parseInt(opt('shingle', '8'), 10) || 8);
const MAX_QUOTE = Math.max(1, parseInt(opt('max-quote', '25'), 10) || 25);
const jsonOut = opt('json', null);

if (!sourceArg || !outputArg || has('help') || has('h')) {
  console.error('usage: shingling-check --source <dir-or-file> --output <dir-or-file> [--shingle 8] [--max-quote 25] [--json report.json]');
  process.exit(2);
}

// ---- file collection --------------------------------------------------------
// A dir is recursed for *.md (SKILL.md + references/*.md + corpus chunks); a file is taken as-is.
function collect(path) {
  let st;
  try { st = statSync(path); }
  catch { console.error(`shingling-check: path not found: ${path}`); process.exit(2); }
  if (st.isFile()) return [path];
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && extname(name.name).toLowerCase() === '.md') out.push(p);
    }
  };
  walk(path);
  return out.sort();
}

// ---- normalization → tokens with original-offset mapping --------------------
// Strip markdown scaffolding + [p.N] anchors + YAML frontmatter, lowercase, and map every
// non-(letter|digit) run to a single space. We keep, per emitted token, the [start,end) offsets in
// the STRIPPED string so an offending run can be reconstructed as readable text for the report.
const CITE_NEAR = /(?:(?:с|p|стр|page|гл|pp|pg)\.?\s*\d+|\[[^\]]*\d+[^\]]*\])/i; // page-citation signal

function stripMarkdown(raw) {
  let s = raw.replace(/\r\n?/g, '\n');
  // YAML frontmatter (only if the very first line is a --- fence)
  if (s.startsWith('---\n')) {
    const end = s.indexOf('\n---', 4);
    if (end >= 0) { const after = s.indexOf('\n', end + 1); s = s.slice(after >= 0 ? after + 1 : s.length); }
  }
  // fenced code blocks ```…``` (and ~~~) — replace with spaces of equal length to preserve offsets
  s = s.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length));
  s = s.replace(/~~~[\s\S]*?~~~/g, (m) => ' '.repeat(m.length));
  // inline code `…`
  s = s.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  // markdown links [text](url) / images ![alt](url) → keep the visible text, blank the target
  s = s.replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, (m, txt) => ' ' + txt + ' '.repeat(m.length - txt.length - 1));
  return s;
}

// Blank [p.N] / [с.5] style bracketed page anchors (never part of prose). Run this AFTER the
// cited-quote exemption on the OUTPUT — the brackets are the exemption's citation signal, so they
// must still be present when blankCitedQuotes inspects a quote's tail.
function blankAnchors(s) {
  return s.replace(/\[[^\]\n]*\d[^\]\n]*\]/g, (m) => ' '.repeat(m.length));
}

// Tokenize a stripped string into { tokens:[lc words], starts:[], ends:[] } over that string.
function tokenize(stripped) {
  const tokens = [], starts = [], ends = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    tokens.push(m[0].toLowerCase());
    starts.push(m.index);
    ends.push(m.index + m[0].length);
  }
  return { tokens, starts, ends, stripped };
}

// Reconstruct a human-readable snippet spanning output token range [i, j] (inclusive).
function reconstruct(tk, i, j) {
  const raw = tk.stripped.slice(tk.starts[i], tk.ends[j]);
  return raw.replace(/\s+/g, ' ').trim();
}

// ---- cited-quote exemption (OUTPUT only) ------------------------------------
// CONSERVATIVE: blank out any quoted run of <= MAX_QUOTE words whose closing quote is immediately
// (within ~40 chars) followed by a page citation. Done on the STRIPPED string before tokenizing so
// the exempted words never enter the output shingle set. Quote styles: «…», "…", "…"(curly), '…'.
const QUOTE_PAIRS = [['«', '»'], ['“', '”'], ['"', '"'], ['‘', '’']];
function blankCitedQuotes(stripped) {
  let s = stripped;
  for (const [open, close] of QUOTE_PAIRS) {
    let out = '', idx = 0;
    while (idx < s.length) {
      const o = s.indexOf(open, idx);
      if (o < 0) { out += s.slice(idx); break; }
      // find matching close (same char for straight quotes → search after open)
      const c = s.indexOf(close, o + 1);
      if (c < 0) { out += s.slice(idx); break; }
      const inner = s.slice(o + 1, c);
      const words = inner.match(/[\p{L}\p{N}]+/gu) || [];
      const tail = s.slice(c + 1, c + 1 + 40);
      const cited = CITE_NEAR.test(tail);
      out += s.slice(idx, o); // text before the quote is kept verbatim
      if (words.length <= MAX_QUOTE && words.length >= 1 && cited) {
        // exempt: blank the ENTIRE quote span (open..close) so its shingles never form
        out += ' '.repeat(c - o + 1);
      } else {
        // not exempt: keep the quote content so a long/uncited copy is still shingled & flaggable
        out += s.slice(o, c + 1);
      }
      idx = c + 1;
    }
    s = out;
  }
  return s;
}

// ---- shingling --------------------------------------------------------------
// A shingle = W consecutive tokens joined by a single space. We store the joined string itself in a
// Set (exact, collision-free — no hashing needed for correctness); source contributes only the set.
function shinglesOf(tokens) {
  const out = [];
  for (let i = 0; i + W <= tokens.length; i++) out.push(tokens.slice(i, i + W).join(' '));
  return out;
}

// ---- table header extraction (light copy heuristic) -------------------------
// Collect the normalized header-cell SET of every markdown table. A table = a header row of pipe
// cells immediately followed by a separator row (|---|---|). Best-effort, cheap.
function tableHeaderSets(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const sets = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const sep = lines[i + 1];
    if (!/^\s*\|?\s*:?-{2,}.*\|/.test(sep) || !sep.includes('-')) continue;
    if (!lines[i].includes('|')) continue;
    const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean)
      .map((c) => (c.match(/[\p{L}\p{N}]+/gu) || []).join(' ').toLowerCase()).filter(Boolean);
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
  const stripped = blankAnchors(stripMarkdown(raw));
  const { tokens } = tokenize(stripped);
  for (const sh of shinglesOf(tokens)) sourceSet.add(sh);
  for (const t of tableHeaderSets(raw)) sourceTableSets.push(t);
}

// ---- scan OUTPUT -----------------------------------------------------------
const outputFiles = collect(outputArg);
const violations = [];     // { file, words, text, startTok, endTok }
const tableWarnings = [];  // { file, header:[...] }
let outputShingleCount = 0;

for (const f of outputFiles) {
  const raw = readFileSync(f, 'utf-8');
  let stripped = stripMarkdown(raw);       // anchors kept — needed as the citation signal
  stripped = blankCitedQuotes(stripped);   // exemption uses the still-present [с.N] anchors
  stripped = blankAnchors(stripped);       // now remove any remaining anchors before shingling
  const tk = tokenize(stripped);
  const shingles = shinglesOf(tk.tokens);
  outputShingleCount += shingles.length;

  // mark which output shingles overlap the source, then coalesce consecutive hits into runs.
  const hit = shingles.map((sh) => sourceSet.has(sh));
  let i = 0;
  while (i < hit.length) {
    if (!hit[i]) { i++; continue; }
    let j = i;
    while (j + 1 < hit.length && hit[j + 1]) j++;
    // shingles [i..j] overlap → token span [i .. j + W - 1] is one contiguous verbatim run
    const startTok = i, endTok = j + W - 1;
    violations.push({
      file: f,
      words: endTok - startTok + 1,
      text: reconstruct(tk, startTok, endTok),
      startTok, endTok,
    });
    i = j + 1;
  }

  // table-copy heuristic
  for (const oh of tableHeaderSets(raw)) {
    if (oh.size >= 2 && sourceTableSets.some((sh) => setEq(oh, sh))) {
      tableWarnings.push({ file: f, header: [...oh] });
    }
  }
}

// ---- report ----------------------------------------------------------------
const rel = (p) => { try { return relative(process.cwd(), p) || p; } catch { return p; } };
const perFile = {};
for (const v of violations) perFile[v.file] = (perFile[v.file] || 0) + 1;

const report = {
  tool: 'shingling-check',
  config: { shingle: W, maxQuote: MAX_QUOTE, source: sourceArg, output: outputArg },
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

// human summary
const line = '─'.repeat(60);
console.log(line);
console.log(`shingling-check — verbatim-overlap IP gate (w=${W}, max-quote=${MAX_QUOTE})`);
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
  ? 'PASS — no uncited verbatim run >= ' + W + ' words.'
  : `FAIL — ${violations.length} uncited verbatim run(s) >= ${W} words. Paraphrase or cite as a short quote.`);
console.log(line);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`report → ${rel(jsonOut)}`);
}

process.exit(violations.length === 0 ? 0 : 1);
