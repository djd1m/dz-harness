#!/usr/bin/env node
// book-ingest — deterministic PDF → chunked corpus + manifest (ADR-001 v2, book-knowledge-digitizer).
// NO LLM: poppler (pdfinfo/pdftotext/pdfimages) + heuristics only, so ingest is reproducible.
//   node book-ingest.mjs <book.pdf> --out <dir> [--book <slug>] [--isbn <isbn>] [--max-chunk-tokens N]
// Emits <out>/corpus/NN-<slug>.md (with [p.N] page anchors) + <out>/manifest.json.
// Design: token-budget chunker (not structure-only), per-page quality matrix, figure/table
// inventory, front-matter listed-not-skipped, corpus_version + per-chunk source_hash/watermarks.

import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const pdf = argv[0];
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
if (!pdf || !existsSync(pdf)) { console.error('usage: book-ingest <book.pdf> --out <dir> [--book <slug>] [--isbn <isbn>] [--max-chunk-tokens N]'); process.exit(2); }
const outDir = opt('out', join(process.cwd(), 'book-corpus'));
const MAX_CHUNK_TOKENS = parseInt(opt('max-chunk-tokens', '70000'), 10);
const CHUNK_BUDGET = MAX_CHUNK_TOKENS * 0.8; // QE P3: safety margin so estimator error can't overflow the extract agent
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// ---- poppler helpers --------------------------------------------------------
// `strict` rethrows on a non-zero exit (used for the PRIMARY extraction — QE P2: a poppler crash
// must NOT masquerade as an empty-but-successful book). Non-strict tolerates partial stdout.
const run = (cmd, args, strict) => {
  try { return execFileSync(cmd, args, { encoding: 'utf-8', maxBuffer: 512 * 1024 * 1024 }); }
  catch (e) { if (strict) throw new Error(`${cmd} failed (exit ${e.status ?? '?'}): ${String(e.stderr || e.message).slice(0, 200)}`); return e.stdout ? String(e.stdout) : ''; }
};
function popplerVersion() { // folded into corpus_version so cross-machine drift is attributable (QE P3)
  // `pdftotext -v` prints to STDERR and may exit non-zero → merge streams to capture it reliably.
  try { return (execSync('pdftotext -v 2>&1', { encoding: 'utf-8' }).match(/version\s+([\d.]+)/i)?.[1]) ?? 'unknown'; }
  catch (e) { return (String(e.stdout || e.stderr || '').match(/version\s+([\d.]+)/i)?.[1]) ?? 'unknown'; }
}
function pdfInfo(file) {
  const out = run('pdfinfo', [file]);
  const g = (k) => { const m = new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(out); return m ? m[1].trim() : ''; };
  return { pages: parseInt(g('Pages') || '0', 10), title: g('Title'), encrypted: g('Encrypted') };
}
// Whole-book text with per-page form-feed (\f) separators → array indexed by page-1.
function pagesOf(file, layout) {
  const args = layout ? ['-layout', file, '-'] : [file, '-'];
  const txt = run('pdftotext', args, !layout); // primary (non-layout) run is strict
  const parts = txt.split('\f');
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts;
}

// ---- per-page quality matrix (cheap, deterministic) -------------------------
const CYR_LAT = /[\p{Script=Cyrillic}\p{Script=Latin}]/u;
function pageQuality(text, layoutText, layoutAvailable) {
  const chars = text.length;
  const words = (text.match(/[\p{L}]{2,}/gu) || []).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  const mathish = (text.match(/[=≤≥±∑∏∫√∞·×÷→∈∉⊂∪∩αβγδλμσΣΩθπ∂∇]/gu) || []).length;
  const mathDensity = chars > 0 ? mathish / chars : 0;
  const coherence = chars > 0 ? letters / chars : 0;
  // two-column signal (QE P2): only when the -layout counterpart is actually available and this
  // page has real text; require a strong divergence. This alone is advisory — a run of consecutive
  // flagged pages (computed after) is what the summary should trust.
  const lines = text.split('\n').length, lLines = (layoutText || '').split('\n').length;
  const columnSignal = (layoutAvailable && chars > 200 && lines > 0) ? Math.abs(lLines - lines) / lines : 0;
  const flags = [];
  if (chars < 40) flags.push('empty');
  else if (coherence < 0.55 && chars > 200) flags.push('low_coherence');
  if (mathDensity > 0.02) flags.push('math_dense');
  if (columnSignal > 0.6) flags.push('two_column_maybe'); // renamed: raw per-page hint, confirmed by runs
  return { chars, words, mathDensity: +mathDensity.toFixed(4), coherence: +coherence.toFixed(3), flags };
}

// ---- structure detection ----------------------------------------------------
// Chapter opener (QE P2 — broadened beyond "Глава/Chapter + digit"): arabic OR roman OR
// spelled-out numeral, plus «Раздел» and «§». The capture is normalized to an index afterwards.
const NUM_WORD = { один: 1, первая: 1, два: 2, вторая: 2, три: 3, третья: 3, четыре: 4, четвертая: 4, пять: 5, пятая: 5, one: 1, first: 1, two: 2, second: 2, three: 3, third: 3 };
const CHAPTER_RE = /^\s*(?:Глава|ГЛАВА|Chapter|CHAPTER|Раздел|РАЗДЕЛ|§)\s+([IVXLC]+|\d+|[A-Za-zА-Яа-я]+)\b/;
const HEADING_RE = /^\s*(?:\d+\.\d+\.?|§\s*\d)\s+\S/; // sub-section like "5.3 Репликация" or "§ 5.3"
const romanToInt = (r) => ({ I: 1, V: 5, X: 10, L: 50, C: 100 } && r.split('').reduce((a, c, i, s) => { const v = { I: 1, V: 5, X: 10, L: 50, C: 100 }[c] || 0; const n = { I: 1, V: 5, X: 10, L: 50, C: 100 }[s[i + 1]] || 0; return a + (v < n ? -v : v); }, 0));
function chapterIndex(token, fallback) {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  if (/^[IVXLC]+$/.test(token)) return romanToInt(token) || fallback;
  return NUM_WORD[token.toLowerCase()] ?? fallback;
}
const FIG_TAB_RE = /(?:Рис(?:\.|унок)|Таблиц[аы]|Табл\.|Figure|Table)\s*\.?\s*\d+([.\-]\d+)?/gu;

function detectChapters(pages) {
  const chapters = [];
  const DOT_LEADER = /\.{4,}\s*\d+\s*$/; // "…title.......... 53" — a TOC/contents line
  pages.forEach((text, i) => {
    const lines = text.split('\n');
    // TOC/contents pages list many chapter refs with dot leaders — never a chapter START.
    if (lines.filter((l) => DOT_LEADER.test(l)).length >= 3) return;
    // A real chapter opener has "Глава N" in the first 3 non-empty lines.
    const topNonEmpty = lines.filter((l) => l.trim()).slice(0, 3);
    const hLine = topNonEmpty.find((l) => CHAPTER_RE.test(l));
    if (!hLine) return;
    const num = chapterIndex(CHAPTER_RE.exec(hLine)[1], chapters.length + 1);
    // Descriptive name: first substantial line after the heading, not a dot-leader/bullet/number,
    // trailing page number stripped ("… языки запросов   55" → "… языки запросов").
    let name = '';
    const after = lines.slice(lines.indexOf(hLine) + 1, lines.indexOf(hLine) + 8);
    for (const l of after) {
      if (DOT_LEADER.test(l)) continue;
      const s = l.replace(/\s+\d+\s*$/, '').replace(/\s{2,}\d+$/, '').replace(/^[•·▪\-\s]+/, '').trim();
      const isCaption = /^(?:Рис|Табл|Figure|Table|Листинг|Listing)\b/.test(s) || /^\d+\.\d/.test(s); // figure/subsection, not a title
      if (s.length >= 6 && (s.match(/[\p{L}]{2,}/gu) || []).length >= 2 && !/^[•·\-\d.\s]+$/.test(s) && !CHAPTER_RE.test(s) && !isCaption) { name = s; break; }
    }
    // Sanity: a good title is a short-ish noun phrase. Reject long/garbled captures (extraction
    // reading-order sometimes surfaces a body line first) → fall back to the bare "Глава N".
    const good = name && name.length <= 70 && !/^\d/.test(name) && (name.match(/\s/g) || []).length <= 8;
    chapters.push({ num, startPage: i + 1, title: good ? `Глава ${num}. ${name}` : `Глава ${num}` });
  });
  // de-dup consecutive same-number hits (running headers); keep first occurrence per number
  const seen = new Set(); const uniq = [];
  for (const c of chapters) { if (!seen.has(c.num)) { seen.add(c.num); uniq.push(c); } }
  uniq.sort((a, b) => a.startPage - b.startPage);
  for (let k = 0; k < uniq.length; k++) uniq[k].endPage = (k + 1 < uniq.length ? uniq[k + 1].startPage - 1 : pages.length);
  return uniq;
}

// ---- token-budget chunker within a chapter ----------------------------------
// Cyrillic tokenizes ~2x denser than Latin (QE P3): compute chars/token from the actual script
// mix so a "70k-token" chunk isn't really 100k and overflowing the extract agent's context.
function charsPerToken(text) {
  const cyr = (text.match(/\p{Script=Cyrillic}/gu) || []).length;
  const lat = (text.match(/\p{Script=Latin}/gu) || []).length;
  const tot = cyr + lat;
  if (tot === 0) return 3.0;
  const cyrShare = cyr / tot;                 // Cyrillic ≈ 1.9 chars/token, Latin ≈ 4.0
  return 1.9 * cyrShare + 4.0 * (1 - cyrShare);
}
let CPT = 2.5; // set per-book after extraction
const estTokens = (s) => Math.ceil(s.length / CPT);
function chunkPages(pages, startPage, endPage) {
  const chunks = []; let cur = []; let curTokens = 0;
  for (let p = startPage; p <= endPage; p++) {
    const t = estTokens(pages[p - 1] || '');
    if (t > CHUNK_BUDGET) process.stderr.write(`  ⚠ page ${p} alone ≈${t} tokens > budget ${Math.round(CHUNK_BUDGET)} — extract this page carefully\n`);
    const startsHeading = HEADING_RE.test((pages[p - 1] || '').split('\n')[0] || '');
    if (cur.length && (curTokens + t > CHUNK_BUDGET || (startsHeading && curTokens > CHUNK_BUDGET * 0.6))) {
      chunks.push([cur[0], cur[cur.length - 1]]); cur = []; curTokens = 0;
    }
    cur.push(p); curTokens += t;
  }
  if (cur.length) chunks.push([cur[0], cur[cur.length - 1]]);
  return chunks;
}

// ---- main -------------------------------------------------------------------
const info = pdfInfo(pdf);
if (!info.pages) { console.error('pdfinfo: 0 pages (encrypted? not a PDF?)'); process.exit(1); }
const bookSlug = opt('book', slugify(info.title || basename(pdf, '.pdf')));
const isbn = opt('isbn', '');
const pages = pagesOf(pdf, false);
const layoutPages = pagesOf(pdf, true);
// QE P2: only trust the two-column signal when the -layout run aligns page-for-page.
const layoutAligned = layoutPages.length === pages.length;
CPT = charsPerToken(pages.join(''));
const quality = pages.map((t, i) => pageQuality(t, layoutPages[i], layoutAligned));

// QE P2: fail LOUD instead of writing a green manifest for an empty/broken extraction.
const emptyShare = quality.filter((q) => q.flags.includes('empty')).length / Math.max(1, pages.length);
if (pages.length === 0) { console.error('ERROR: 0 pages of text extracted. Encrypted or no text layer? Run OCR (pdftoppm + tesseract) and re-ingest.'); process.exit(1); }
if (info.encrypted && info.encrypted !== 'no' && emptyShare > 0.5) { console.error(`ERROR: PDF is encrypted (${info.encrypted}) and ${Math.round(emptyShare * 100)}% pages have no text — decrypt or OCR first.`); process.exit(1); }
if (emptyShare > 0.9) { console.error(`ERROR: ${Math.round(emptyShare * 100)}% of pages have no extractable text — this looks like a scanned book. OCR (pdftoppm + tesseract) and re-ingest.`); process.exit(1); }

const chapters = detectChapters(pages);
const structureType = chapters.length >= 3 ? 'chaptered' : (chapters.length ? 'monolithic' : 'monolithic');
const firstContentPage = chapters.length ? chapters[0].startPage : 1;

// front matter = pages before the first chapter (LISTED, never silently dropped)
const frontMatter = [];
for (let p = 1; p < firstContentPage; p++) {
  const q = quality[p - 1];
  frontMatter.push({ page: p, reason: q.chars < 40 ? 'empty-text' : 'pre-first-chapter' });
}

// build chunks
mkdirSync(join(outDir, 'corpus'), { recursive: true });
const ranges = chapters.length
  ? chapters.flatMap((c) => chunkPages(pages, c.startPage, c.endPage).map((r) => ({ r, chapter: c })))
  : chunkPages(pages, firstContentPage, pages.length).map((r) => ({ r, chapter: { num: 1, title: bookSlug, startPage: firstContentPage, endPage: pages.length } }));

const manifestChunks = [];
ranges.forEach(({ r, chapter }, i) => {
  const [a, b] = r;
  let body = '';
  let figTab = 0;
  for (let p = a; p <= b; p++) {
    const pt = pages[p - 1] || '';
    body += `\n\n[p.${p}]\n${pt}`;
    figTab += (pt.match(FIG_TAB_RE) || []).length;
  }
  const seq = String(i + 1).padStart(3, '0');
  const chunkSlug = `${seq}-${slugify(chapter.title || `chapter-${chapter.num}`)}`;
  const file = join('corpus', `${chunkSlug}.md`);
  const header = `# ${chapter.title || `Chapter ${chapter.num}`}  [pp.${a}-${b}]\n`;
  const content = header + body;
  writeFileSync(join(outDir, file), content);
  const pageFlags = {};
  for (let p = a; p <= b; p++) if (quality[p - 1].flags.length) pageFlags[p] = quality[p - 1].flags;
  manifestChunks.push({
    id: chunkSlug,
    file,
    parent_chapter: chapter.num,
    chapter_title: chapter.title || null,
    pages: [a, b],
    token_estimate: estTokens(body),
    figure_table_mentions: figTab,
    page_flags: pageFlags,
    source_hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
    watermark: { extracted: false, reduced: false, indexed: false },
  });
});

const poppler = popplerVersion();
const corpusVersion = createHash('sha256')
  .update(JSON.stringify(manifestChunks.map((c) => [c.pages, c.source_hash])) + `|maxchunk=${MAX_CHUNK_TOKENS}|poppler=${poppler}`)
  .digest('hex').slice(0, 16);

const flagCounts = quality.flatMap((q) => q.flags).reduce((m, f) => ((m[f] = (m[f] || 0) + 1), m), {});
const manifest = {
  book: { slug: bookSlug, isbn, title: info.title || basename(pdf), pages: info.pages, source_file: basename(pdf) },
  structure_type: structureType,
  structure_note: chapters.length ? null : 'no chapter markers detected — single monolithic chunk-set; confirm scope at CP1',
  corpus_version: corpusVersion,
  ingested_settings: { max_chunk_tokens: MAX_CHUNK_TOKENS, chunk_budget: Math.round(CHUNK_BUDGET), chars_per_token: +CPT.toFixed(2), poppler_version: poppler },
  chapters: chapters.map((c) => ({ num: c.num, title: c.title, pages: [c.startPage, c.endPage] })),
  front_matter: frontMatter,               // listed for CP1 confirmation — never silently skipped
  chunks: manifestChunks,
  page_quality_summary: {
    total_pages: pages.length,
    pages_declared: info.pages,            // QE P2: vs extracted, so a mismatch is visible at CP1
    pages_extracted: pages.length,
    layout_aligned: layoutAligned,
    flag_counts: flagCounts,               // empty/low_coherence/math_dense/two_column_maybe tallies
    total_figure_table_mentions: manifestChunks.reduce((s, c) => s + c.figure_table_mentions, 0),
  },
  phase_state: { extracted: 0, reduced: false, distilled: false, packed: false },
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// human summary to stdout (the skill relays this at CP1)
console.log(`book-ingest: "${manifest.book.title}"`);
console.log(`  ${info.pages} pages · structure=${structureType} · ${chapters.length} chapters · ${manifestChunks.length} chunks · corpus_version=${corpusVersion}`);
console.log(`  front matter: ${frontMatter.length} pages listed (not dropped)`);
console.log(`  quality flags: ${Object.entries(flagCounts).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'}`);
console.log(`  figure/table mentions: ${manifest.page_quality_summary.total_figure_table_mentions}`);
console.log(`  → ${join(outDir, 'manifest.json')}`);
