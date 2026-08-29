'use strict';

// The project-type scanner probed seven paths from one parameter, and the paths disagreed about what
// that parameter was. MEASURED before the fix:
//
//   {docs_path}/docs/ddd/ · /.ai-context/ · /docs/tests/*.feature · /docs/adr/*.md · /docs/ADR.md
//        → all five imply docs_path is the PROJECT ROOT
//   {docs_path}/Architecture.md · {docs_path}/Solution_Strategy.md
//        → these two imply docs_path is `docs/`
//
// And the pipeline writes those two files to docs/ (commands/replicate.md:234,237). So the SPARC
// probes looked exactly where the pipeline does not write: the scanner could not recognise its own
// output as SPARC-shaped.
//
// The parameter description was the root of it — one sentence naming two directories: "In Claude
// Code / replicate context this is `docs/` (project root)." A reader implementing a probe picked
// whichever half they read last. Nobody passes the parameter explicitly (a sweep of SKILL.md and
// commands/replicate.md for `docs_path` returns nothing), so that sentence IS the specification.
//
// Both the field report and the reviewing swarm got this wrong in opposite directions: the report
// said all six probes were wrong, the swarm said the table was wrong and the probes right. Five
// probes are right, two are wrong, and the table contradicts itself.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULE = path.join(__dirname, '..', '..', 'templates', '.claude', 'skills',
  'cc-toolkit-generator-enhanced', 'modules', '01-detect-parse.md');
const read = () => fs.readFileSync(MODULE, 'utf-8');

/** Every path this module probes, as written. */
function probes() {
  const src = read();
  return [...src.matchAll(/\{docs_path\}\/([^"')\s]+)/g)].map((m) => m[1]);
}

describe('every probe resolves from ONE anchor, and the anchor is named once', () => {
  test('P1 — no probe implies an anchor other than the project root', () => {
    // The property is AGREEMENT across all of them, not the correctness of any single path. A
    // top-level SPARC artifact would mean docs_path is `docs/` for that probe and the root for the
    // others — which is the state this feature removes.
    // DERIVED, not typed. Cross-family QE: the first version hard-coded seven basenames, so a probe
    // for Research_Findings.md — a real pipeline document I had not listed — would have escaped it.
    // The authoritative list is the pipeline's own: replicate.md writes every SPARC document to docs/.
    const replicate = fs.readFileSync(path.join(__dirname, '..', '..', 'templates', '.claude',
      'commands', 'replicate.md'), 'utf-8');
    const written = new Set([...replicate.matchAll(/^- `docs\/([A-Z][A-Za-z_]*\.md)`/gm)].map((m) => m[1]));
    assert.ok(written.size >= 9,
      'the pipeline document list must be readable from replicate.md: ' + [...written]);

    const disagreeing = probes().filter((p) => written.has(p));
    assert.deepEqual(disagreeing, [],
      'these probe a document the pipeline writes to docs/, as if it were at the project root — '
      + 'which only makes sense if docs_path is `docs/`, while every other probe treats it as the '
      + 'root: ' + JSON.stringify(disagreeing));

    // And the prose must not re-introduce the ambiguity the probes just lost. Five sites carried it.
    const src = read();
    assert.ok(!/top-level or docs\//.test(src),
      'the scan catalog still preserves the "top-level or docs/" reading this feature removes');
    for (const doc of ['Architecture.md', 'Solution_Strategy.md', 'PRD.md', 'Specification.md']) {
      const bare = new RegExp('(?<![/\\w])`' + doc.replace('.', '\\.') + '`');
      assert.ok(!bare.test(src),
        'a pipeline document is named without its docs/ prefix, which reads as project-root: ' + doc);
    }
  });

  test('P2 — the two SPARC probes look under docs/, where the pipeline writes', () => {
    const src = read();
    assert.match(src, /has_sparc_arch = exists\(f"\{docs_path\}\/docs\/Architecture\.md"\)/,
      'commands/replicate.md:237 writes docs/Architecture.md');
    assert.match(src, /has_sparc_sol\s+= exists\(f"\{docs_path\}\/docs\/Solution_Strategy\.md"\)/,
      'commands/replicate.md:234 writes docs/Solution_Strategy.md');
  });

  test('P3 — the root-level probe stays at the root', () => {
    // .ai-context/ sits beside .claude/, not under docs/. Moving it "for consistency" would break a
    // probe that was correct all along — the failure mode the field report actually proposed.
    assert.ok(probes().includes('.ai-context/'),
      'the .ai-context probe must remain anchored at the project root: ' + JSON.stringify(probes()));
    assert.ok(!probes().includes('docs/.ai-context/'),
      '.ai-context/ is a root-level directory; probing it under docs/ finds nothing');
  });

  test('P4 — the parameter names ONE directory', () => {
    const src = read();
    const row = src.split('\n').find((l) => l.startsWith('| `docs_path` |'));
    assert.ok(row, 'the parameter table row must exist');
    assert.ok(!/this is `docs\/` \(project root\)/.test(row),
      'the row still names two different directories in one breath — that sentence is what split '
      + 'the probes in the first place: ' + row);
    assert.match(row, /the PROJECT ROOT/,
      'it must name the anchor unambiguously');
    assert.match(row, /not `docs\/`/,
      'and rule out the other reading explicitly, since that reading is what produced the split');
  });

  test('P5 — both ADR shapes are still collected', () => {
    // This logic shipped in an earlier feature (one decision per file, and /replicate's single
    // docs/ADR.md). Re-anchoring must not disturb it.
    const src = read();
    assert.match(src, /glob\(f"\{docs_path\}\/docs\/adr\/\*\.md"\)/, 'shape A: a directory of files');
    assert.match(src, /f"\{docs_path\}\/docs\/ADR\.md"/, 'shape B: /replicate\'s single file');
    assert.match(src, /has_adr = len\(collect_adrs\(docs_path\)\) > 0/,
      'and the one definition that unifies them');
  });
});
