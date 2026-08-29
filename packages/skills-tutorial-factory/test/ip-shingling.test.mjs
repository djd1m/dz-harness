// ADR-004 Confirmation — HARDENED after Codex QE (2026-07-28) graded the IP property F.
// Proves: (1) the shingling gate catches an EXACT 8-word verbatim run at the boundary, and that
// quotes+citation, ``` code fences, NFD normalization, and a .json output dir do NOT let a verbatim
// copy through (CRITICAL-2/HIGH-3/HIGH-4/HIGH-5); (2) a corpus/research sentinel injected into ANY
// shipped directory does NOT end up in the real `npm pack` tarball (CRITICAL-1); (3) the shipped KB is
// verbatim-clean vs the real corpus when present. The synthetic-corpus tests ALWAYS run (never skip on
// CI) — a green build can no longer be an artifact of the corpus being absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');
const REPO = resolve(PKG, '..', '..', '..');
const SHINGLING = join(PKG, 'package-tutorial-factory', 'scripts', 'shingling-check.mjs');
const KB = join(PKG, 'package-tutorial-factory', 'references', 'head-first-method.md');
const SYNTH = join(__dirname, 'fixtures', 'synthetic-corpus'); // committed, invented — always present
const REAL_CORPUS = join(REPO, 'features', 'package-tutorial-factory', 'research', 'head-first-corpus', 'corpus');
const realCorpusPresent = existsSync(REAL_CORPUS) && readdirSync(REAL_CORPUS).some((f) => f.endsWith('.md'));

// A verbatim run drawn from the INVENTED synthetic corpus (safe to embed — not any real book).
const RUN8 = 'clever café architect designed a naïve resilient distributed';       // exactly 8 words
const RUN7 = 'clever café architect designed a naïve resilient';                    // 7 words (below boundary)
const RUN10 = 'clever café architect designed a naïve resilient distributed ledger protocol'; // 10 words

function shingle(source, output) {
  return spawnSync(process.execPath, [SHINGLING, '--source', source, '--output', output], { encoding: 'utf-8' });
}
function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ip-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('EXACT 8-word verbatim run FAILS; a 7-word run PASSES (boundary — INFO-6 kept)', () => {
  withTmp((dir) => {
    const eight = join(dir, 'eight.md');
    writeFileSync(eight, `# ok\n\nSome paraphrase. ${RUN8} — then more original words follow here.\n`);
    assert.equal(shingle(SYNTH, eight).status, 1, 'exact 8-word verbatim run must FAIL');

    const seven = join(dir, 'seven.md');
    writeFileSync(seven, `# ok\n\nSome paraphrase. ${RUN7} then entirely different original trailing words.\n`);
    assert.equal(shingle(SYNTH, seven).status, 0, '7-word run is below the boundary → PASS');
  });
});

test('CRITICAL-2: a quoted, page-cited 8-word run is STILL a violation (no citation exemption)', () => {
  withTmp((dir) => {
    const f = join(dir, 'quoted.md');
    writeFileSync(f, `# ok\n\nAs the book says «${RUN8}» [p.5], which is a nice idea.\n`);
    assert.equal(shingle(SYNTH, f).status, 1, 'a page citation must NOT exempt verbatim text');
  });
});

test('HIGH-3: an 8+-word verbatim run hidden in a ``` code fence is caught', () => {
  withTmp((dir) => {
    const f = join(dir, 'fenced.md');
    writeFileSync(f, '# ok\n\nIntro paraphrase.\n\n```\n' + RUN10 + '\n```\n\nOutro.\n');
    assert.equal(shingle(SYNTH, f).status, 1, 'fenced prose must be shingled, not stripped');
  });
});

test('HIGH-4: an NFD-normalized copy of a verbatim run cannot evade', () => {
  withTmp((dir) => {
    const f = join(dir, 'nfd.md');
    writeFileSync(f, `# ok\n\nParaphrase. ${RUN8.normalize('NFD')} and then original text.\n`, 'utf-8');
    assert.equal(shingle(SYNTH, f).status, 1, 'NFD-equivalent verbatim must be normalized (NFKC) and caught');
  });
});

// --- Codex round-2 residual evasions (F→D→ close to reach B) ---
test('ROUND2-1: a zero-width char (U+200B) injected mid-word cannot evade', () => {
  withTmp((dir) => {
    const f = join(dir, 'zw.md');
    const poisoned = 'clev​er café architect designed a naïve resilient distributed'; // ZWSP inside "clever"
    writeFileSync(f, `# ok\n\nParaphrase. ${poisoned} then original text.\n`, 'utf-8');
    assert.equal(shingle(SYNTH, f).status, 1, 'default-ignorable/zero-width must be stripped before shingling');
  });
});

test('ROUND2-2: prose inside a digit-containing bracket is NOT deleted (only real page anchors are)', () => {
  withTmp((dir) => {
    const bad = join(dir, 'bracket.md');
    writeFileSync(bad, `# ok\n\nIntro [${RUN8} 1] outro.\n`); // a fake "anchor" hiding a verbatim run
    assert.equal(shingle(SYNTH, bad).status, 1, 'a bracket containing prose+digit must be scanned, not blanked');
    const anchor = join(dir, 'anchor.md');
    writeFileSync(anchor, '# ok\n\nEntirely original sentence with a genuine reference [p.24] and nothing copied.\n');
    assert.equal(shingle(SYNTH, anchor).status, 0, 'a real page anchor [p.24] must still be stripped (no false positive)');
  });
});

test('ROUND2-3a: an HTML-entity-encoded verbatim run is decoded and caught', () => {
  withTmp((dir) => {
    const f = join(dir, 'ent.md');
    // café → caf&#233;, naïve → na&#239;ve
    writeFileSync(f, '# ok\n\nParaphrase. clever caf&#233; architect designed a na&#239;ve resilient distributed here.\n');
    assert.equal(shingle(SYNTH, f).status, 1, 'HTML entities must be decoded before shingling');
  });
});

test('ROUND2-3b: a verbatim run inside YAML frontmatter is scanned (strip-but-scan)', () => {
  withTmp((dir) => {
    const f = join(dir, 'fm.md');
    writeFileSync(f, `---\ntitle: ${RUN8}\nother: value\n---\n# body\nOnly original paraphrase in the body.\n`);
    assert.equal(shingle(SYNTH, f).status, 1, 'frontmatter text must be scanned, not dropped');
  });
});

test('ROUND2-3c: a verbatim run hidden in a JSON object KEY is caught', () => {
  withTmp((dir) => {
    const outDir = join(dir, 'out');
    mkdirSync(outDir);
    writeFileSync(join(outDir, 'k.json'), JSON.stringify({ [RUN8]: 1, note: 'only original paraphrase here' }));
    assert.equal(shingle(SYNTH, outDir).status, 1, 'JSON object keys must be scanned, not only values');
  });
});

test('ROUND2-3d: a verbatim run inside an HTML comment / <script> is caught', () => {
  withTmp((dir) => {
    const c = join(dir, 'comment.html');
    writeFileSync(c, `<!doctype html><body><!-- ${RUN8} --><p>original paraphrase text</p></body>`);
    assert.equal(shingle(SYNTH, c).status, 1, 'HTML comment text must be scanned');
    const s = join(dir, 'script.html');
    writeFileSync(s, `<html><script>const x = "${RUN8}";</script><p>original words</p></html>`);
    assert.equal(shingle(SYNTH, s).status, 1, 'script text must be scanned');
  });
});

// --- Codex round-3 PART B (cheap realistic evasions) ---
test('PART-B: an inline HTML tag injected mid-word cannot split a token', () => {
  withTmp((dir) => {
    const f = join(dir, 'tag.md');
    writeFileSync(f, `# ok\n\nParaphrase. clev<span></span>er café architect designed a naïve resilient distributed then original.\n`);
    assert.equal(shingle(SYNTH, f).status, 1, 'inline HTML tags must be stripped to empty so the word rejoins');
  });
});

test('PART-B: a named-entity-encoded verbatim run (&eacute; / &iuml;) is decoded and caught', () => {
  withTmp((dir) => {
    const f = join(dir, 'named.md');
    writeFileSync(f, '# ok\n\nParaphrase. clever caf&eacute; architect designed a na&iuml;ve resilient distributed here.\n');
    assert.equal(shingle(SYNTH, f).status, 1, 'named accented entities must decode before shingling');
  });
});

test('PART-B: a verbatim run hidden in a Markdown link TITLE (and TEXT) is scanned', () => {
  withTmp((dir) => {
    const title = join(dir, 'title.md');
    writeFileSync(title, `# ok\n\nSee [the docs](http://example.com "${RUN8}") for details.\n`);
    assert.equal(shingle(SYNTH, title).status, 1, 'markdown link title must be scanned');
    const text = join(dir, 'text.md');
    writeFileSync(text, `# ok\n\nSee [${RUN8}](http://example.com) here.\n`);
    assert.equal(shingle(SYNTH, text).status, 1, 'markdown link text must be scanned');
  });
});

test('PART-B: a verbatim run in a text-bearing HTML attribute (alt/title) is scanned', () => {
  withTmp((dir) => {
    const alt = join(dir, 'alt.html');
    writeFileSync(alt, `<html><body><img src="x.png" alt="${RUN8}"><p>original words only</p></body></html>`);
    assert.equal(shingle(SYNTH, alt).status, 1, 'HTML alt attribute must be scanned');
    const title = join(dir, 'title.html');
    writeFileSync(title, `<html><body><a href="#" title="${RUN8}">link</a><p>original</p></body></html>`);
    assert.equal(shingle(SYNTH, title).status, 1, 'HTML title attribute must be scanned');
  });
});

test('HIGH-5: a verbatim run in a .json output inside a scanned dir is caught', () => {
  withTmp((dir) => {
    const outDir = join(dir, 'out');
    mkdirSync(outDir);
    writeFileSync(join(outDir, 'course.json'), JSON.stringify({ theory: `intro ${RUN8} outro`, other: 42 }));
    assert.equal(shingle(SYNTH, outDir).status, 1, 'json string values in a scanned dir must be shingled');
  });
});

test('a genuinely paraphrased passage PASSES (the gate is not vacuously failing)', () => {
  withTmp((dir) => {
    const f = join(dir, 'para.md');
    writeFileSync(f, '# ok\n\nA smart designer built a tough spread-out record system for the crew, and they cheered.\n');
    assert.equal(shingle(SYNTH, f).status, 0, 'paraphrase with no 8-word overlap must PASS');
  });
});

test('shipped method-KB has ZERO verbatim runs >=8 words vs the synthetic corpus', () => {
  assert.equal(shingle(SYNTH, KB).status, 0, 'the English distilled KB shares no 8-word run with the synthetic corpus');
});

test('shipped method-KB has ZERO verbatim runs >=8 words vs the REAL corpus (when present)', { skip: realCorpusPresent ? false : 'real corpus absent (gitignored) — run locally' }, () => {
  assert.equal(shingle(REAL_CORPUS, KB).status, 0, 'shipped KB must be verbatim-clean vs the real corpus');
});

// --- CRITICAL-1: corpus/research sentinels injected into shipped dirs must NOT ship in the tarball ---
test('a corpus/research sentinel in ANY shipped dir is EXCLUDED from the real npm pack tarball', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'pack-sentinel-'));
  const staged = join(scratch, 'package');
  const dest = join(scratch, 'packed');
  cpSync(PKG, staged, { recursive: true });
  mkdirSync(dest);
  const sentinels = [
    'package-tutorial-factory/references/corpus/SENTINEL.md',
    'package-tutorial-factory/references/research/SENTINEL.md',
    'package-tutorial-factory/references/head-first-corpus/SENTINEL.md',
    'package-tutorial-factory/scripts/corpus/SENTINEL.md',
    'package-tutorial-factory/corpus/SENTINEL.md',
  ];
  for (const rel of sentinels) {
    const abs = join(staged, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, 'SENTINEL — raw corpus text that must NEVER ship');
  }
  try {
    const npmEnv = { ...process.env, NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || join(tmpdir(), 'tf-npm') };
    const r = spawnSync('npm', ['pack', '--pack-destination', dest], { cwd: staged, encoding: 'utf-8', env: npmEnv });
    assert.equal(r.status, 0, `npm pack failed: ${r.stderr}`);
    const tgz = readdirSync(dest).find((f) => f.endsWith('.tgz'));
    assert.ok(tgz, 'npm pack should produce a tarball');
    const list = spawnSync('tar', ['-tzf', join(dest, tgz)], { encoding: 'utf-8' }).stdout;
    assert.ok(!/SENTINEL/.test(list), `tarball must not contain any SENTINEL file.\n${list}`);
    assert.ok(!/\/corpus\/|\/research\/|head-first-corpus/.test(list), `tarball must not contain corpus/research paths.\n${list}`);
    // sanity: it DID ship the real content
    assert.ok(/references\/head-first-method\.md/.test(list), 'tarball must still ship the distilled KB');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
