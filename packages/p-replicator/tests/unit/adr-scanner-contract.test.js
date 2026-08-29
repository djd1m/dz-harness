'use strict';

// adr-scanner-both-shapes (ADR-001) — the content contract of the toolkit generator's ADR handling.
//
// Why content assertions: these are PROMPT modules executed by a model, so the strongest
// deterministic layer available is the text itself. Before this feature, `has_adr` required a
// docs/adr/ DIRECTORY with >5 files while /replicate writes ONE docs/ADR.md — the flag was
// unreachable and every `IF has_adr:` consumer was dead code. Worse, a naive fix (relaxing the
// threshold) would have rerouted SPARC projects, because the flag sat inside pipeline routing.
//
// P1..P5 below mirror the ADR's Confirmation section. Each is DISCRIMINATING: restoring the old
// text at any site turns the matching assertion red (verified by mutation at Step 8).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GEN = path.join(__dirname, '..', '..', 'templates', '.claude', 'skills', 'cc-toolkit-generator-enhanced');

function read(rel) {
  return fs.readFileSync(path.join(GEN, rel), 'utf-8');
}

/** Every .md under the generator skill, relative paths. */
function allModules(dir = GEN, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) allModules(p, acc);
    else if (e.name.endsWith('.md')) acc.push(path.relative(GEN, p));
  }
  return acc;
}

describe('ADR scanner contract (adr-scanner-both-shapes ADR-001)', () => {
  test('P1 — exactly ONE has_adr definition across the WHOLE generator, and it counts decisions', () => {
    // AM-1: a second `>5` copy hid in references/enhanced-recommendations.md — hence the tree-wide
    // sweep, not a single-file check.
    const defs = [];
    for (const rel of allModules()) {
      const src = read(rel);
      for (const line of src.split('\n')) {
        if (/^\s*has_adr\s*=/.test(line)) defs.push({ rel, line: line.trim() });
      }
    }
    assert.equal(defs.length, 1,
      'exactly one has_adr definition may exist; found: ' + JSON.stringify(defs));
    assert.match(defs[0].line, /collect_adrs/,
      'the one definition must count collector output (decisions), not raw files');
    assert.ok(!/>\s*5/.test(defs[0].line), 'the unreachable >5 file threshold must not survive');
  });

  test('P2 — the scan catalog names BOTH storage shapes', () => {
    const src = read(path.join('modules', '01-detect-parse.md'));
    assert.ok(src.includes('docs/adr/*.md'), 'directory shape must stay catalogued');
    assert.ok(src.includes('docs/ADR.md'), 'the single-file shape /replicate writes must be catalogued');
  });

  test('P3 — pipeline routing never consults has_adr (the SPARC-reroute trap)', () => {
    const src = read(path.join('modules', '01-detect-parse.md'));
    const m = src.match(/def detect_pipeline[\s\S]*?\n```/);
    assert.ok(m, 'detect_pipeline block must exist');
    // AM-2: strip comment lines first. A comment EXPLAINING why the flag is absent is not the flag
    // participating in routing — the first draft of this assertion failed on its own rationale
    // comment. Mention is not use; the check must read code, not prose.
    const code = m[0].split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.ok(!/\bhas_adr\b/.test(code),
      'has_adr inside detect_pipeline CODE re-creates the reroute hazard the ADR refuses');
    assert.ok(/has_idea2prd_adr_dir\s*=\s*len\(glob\(f"\{docs_path\}\/docs\/adr\/\*\.md"\)\)\s*>\s*5/.test(m[0]),
      'the shape marker must keep the byte-identical routing expression');
  });

  test('P4 — zero private ADR globs outside the collector', () => {
    // The dead-code class came from consumers re-reading a directory for themselves. Only the
    // collector (inside 01-detect-parse.md) may touch ADR paths.
    const offenders = [];
    for (const rel of allModules()) {
      if (rel === path.join('modules', '01-detect-parse.md')) continue;
      const src = read(rel);
      for (const line of src.split('\n')) {
        // AM-2: the pipeline-IDENTITY shape marker is the ONE named exception. It COUNTS files to
        // recognise which pipeline produced the docs; it never reads ADR content, so it cannot
        // re-create the dead-code class. It must carry the marker name — an unnamed glob is an
        // offender even if its expression is identical.
        // Cross-family QE (gpt-5.6-sol): keying the exemption on the NAME ANYWHERE let a private
        // glob smuggle itself past by mentioning the marker in a trailing comment. The exemption now
        // requires the line to BE the marker's assignment.
        if (/^\s*has_idea2prd_adr_dir\s*=/.test(line)) continue;
        if (/glob\([^)]*adr\/\*\.md/.test(line) || /FOR EACH adr\/\*\.md/.test(line) || /SCAN adr\/\*\.md/.test(line)) {
          offenders.push(rel + ': ' + line.trim());
        }
      }
    }
    assert.deepEqual(offenders, [],
      'consumer modules must iterate detected_docs.idea2prd.adrs, never glob for themselves');
  });

  test('P5 — the collector carries the worked examples, acid ids verbatim', () => {
    const src = read(path.join('modules', '01-detect-parse.md'));
    for (const acid of ['A1', 'A4', 'A5']) {
      assert.ok(new RegExp('\\*\\*' + acid + '\\*\\*').test(src),
        'worked example ' + acid + ' must be stated in the collector section');
    }
    assert.ok(src.includes('collect_adrs'), 'the collector must exist by its contract name');
    assert.ok(src.includes('dedupe_stable_first_by_id_then_title'),
      'the merge must dedupe STABLE-FIRST (A5) — precedence stated, not left to the helper');
  });
});
