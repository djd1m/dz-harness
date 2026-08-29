'use strict';

// /replicate writes docs/ADR.md in Phase 1 — commands/replicate.md:243, "(if applicable)" — and
// nothing ever reads it again. A decision could be written down, agreed, and quietly not built.
//
// This cannot be a script: MEASURED, `find templates -name '*.mjs' -o -name 'check*.js'` returns
// nothing — the templates carry no executable gate at all. It is a mandatory prose step held by this
// test, the shape that shipped for scenario coverage the day before.
//
// TWO TRAPS INHERITED VERBATIM from that sibling, both found the expensive way:
//   - PLACEMENT. A step inside the fenced [MANUAL] checkpoint block is skipped by an AUTO run, so a
//     "mandatory" step would run in half of runs. "Precedes the checkpoint text" and "outside the
//     MANUAL-only block" are two different facts and only the second is the property.
//   - BOTH DIRECTIONS. A one-way check lets a reference to a decision nobody wrote read exactly like
//     coverage.
//
// WHAT THIS CLAIMS, and the artifact says so itself: a decision is NAMED downstream. NOT that it was
// implemented — no comparison of identifiers can establish that. The nearest precedent, the K2 gate,
// records the same limit about its own coverage check in its own source.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPLICATE = path.join(__dirname, '..', '..', 'templates', '.claude', 'commands',
  'replicate.md');
const read = () => fs.readFileSync(REPLICATE, 'utf-8');

/** Phase 2, from its heading to Phase 3's. */
function phase2(src) {
  const start = src.indexOf('### Phase 2: VALIDATION');
  const end = src.indexOf('### Phase 3', start + 1);
  assert.ok(start > 0 && end > start, 'replicate.md must have a Phase 2 before Phase 3');
  return { start, end, text: src.slice(start, end) };
}

describe('a recorded decision cannot be quietly left unbuilt (PR-007 G5)', () => {
  test('P1 — the step is INSIDE Phase 2 and OUTSIDE the [MANUAL] checkpoint block', () => {
    const src = read();
    const { text } = phase2(src);
    const step = text.indexOf('**Шаг 2.9 — ПОКРЫТИЕ РЕШЕНИЙ');
    assert.ok(step > 0, 'the coverage step must live inside Phase 2');

    const checkpoint = text.indexOf('**Checkpoint:**');
    assert.ok(checkpoint > step,
      'and BEFORE the checkpoint, not after it: ' + step + ' vs ' + checkpoint);

    // The checkpoint's body is a fenced block an AUTO run may skip. The step must not be in it —
    // and this is asserted from the FENCE, not inferred from the ordering above, because those are
    // two different facts and the sibling feature shipped the weaker one first.
    const fenceStart = text.indexOf('```', checkpoint);
    const fenceEnd = text.indexOf('```', fenceStart + 3);
    assert.ok(fenceStart > 0 && fenceEnd > fenceStart, 'the checkpoint must have a fenced body');
    assert.ok(step < fenceStart || step > fenceEnd,
      'the step sits inside the MANUAL-only fenced block, where an AUTO run skips it');
  });

  test('P2 — the reconciliation runs BOTH ways, and both may say none', () => {
    const { text } = phase2(read());
    assert.match(text, /Recorded but named nowhere:/,
      'decisions nobody mentions must be listed');
    assert.match(text, /Named downstream but absent from docs\/ADR\.md:/,
      'and references matching no decision — without this, a dangling ADR-009 reads as coverage');
    assert.match(text, /Both tables are required, and both may be the single word `none`/,
      'an empty table and a forgotten table look identical');
  });

  test('P3 — the block is required in EVERY case, including all-covered', () => {
    const { text } = phase2(read());
    assert.match(text, /## Decision Coverage/,
      'the required output block must be named, or "reconcile" is advice');
    assert.match(text, /in every case\*\*, including\s+the one where everything is covered/,
      'an absent block and a block saying "all covered" are indistinguishable to the next reader');
  });

  test('P4 — three states of the ADR file, each with its own line', () => {
    // Cross-family QE found two defects here. The first version had ONE empty case, so an ADR file
    // that exists but records no ids was unclassified. And its sentence claimed the project "recorded
    // no architectural decisions" — which absence of one FILE cannot establish; decisions may live
    // where this step does not look, and asserting otherwise is a false claim in a generated report.
    const { text } = phase2(read());
    assert.match(text, /Three states of the ADR file/, 'all three must be enumerated');
    assert.match(text, /docs\/ADR\.md is absent, so no decision ids were collected from it/,
      'the absent case must say what is absent — the FILE — and nothing more');
    assert.ok(!/recorded no architectural decisions/.test(text),
      'the step must not claim what it cannot see: decisions may live elsewhere');
    assert.match(text, /exists but records no decision ids/,
      'a present-but-empty ADR is a third state, not the same as an absent file');
    assert.match(text, /In all three states the second table\s*\n?still runs/,
      'a dangling reference is a defect whether or not an ADR file was ever written');
  });

  test('P7 — the searched files are ENUMERATED, and the two self-defeating ones excluded', () => {
    // The finding that mattered most: "across the SPARC documents" did not exclude docs/ADR.md, whose
    // own headings contain every id — so every decision appeared named and the check passed BY
    // CONSTRUCTION, on any project. And docs/validation-report.md is where this step WRITES, so
    // counting it would let the previous run's output satisfy the next one.
    const { text } = phase2(read());
    assert.match(text, /Where to look, named file by file/,
      'the search set must be enumerated, not described');
    for (const f of ['docs/PRD.md', 'docs/Specification.md', 'docs/Architecture.md']) {
      assert.ok(text.includes(f), 'the search set must name: ' + f);
    }
    assert.match(text, /Two files are EXCLUDED/, 'and the exclusions must be explicit');
    assert.match(text, /the check would pass by construction/,
      'with the reason for excluding the ADR file itself');
    assert.match(text, /the check would start proving itself/,
      'and for excluding the report this step writes');
  });

  test('P8 — a mention is DEFINED, and a superseded decision has a policy', () => {
    const { text } = phase2(read());
    assert.match(text, /The exact token `ADR-<nnn>`, case-sensitive/,
      '"mention" must be defined, or every reader draws a different line');
    assert.match(text, /Not a title, not a paraphrase/,
      'and what does NOT count must be named too');
    assert.match(text, /A superseded decision needs no current mention/,
      'an id that outlives its decision needs a stated policy, or it reads as a permanent gap');
  });

  test('P5 — the artifact states its own limit', () => {
    // A coverage block LOOKS like proof of implementation. The backlog item demanded this restraint
    // explicitly, and the limit belongs in the template a reader sees, not only in a feature report.
    const { text } = phase2(read());
    assert.match(text, /It does NOT establish that the decision was implemented/,
      'the limit must be written into the artifact');
    assert.match(text, /the decision was written down and then forgotten/,
      'and the class it DOES catch must be named, so the claim is bounded on both sides');
  });

  test('P6 — the decision id has a defined form, or there is nothing to trace on', () => {
    const { text } = phase2(read());
    assert.match(text, /`ADR-<nnn>` — three digits, assigned in order, never\s+reused/,
      'an id without a form and a uniqueness rule is an intention, not an identifier');
  });
});
