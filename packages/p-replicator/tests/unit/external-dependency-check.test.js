'use strict';

// Every validation lens compared documents to documents. MEASURED — replicate.md's Phase-2 table
// listed five: stories→PRD, AC→stories, Architecture.md, Pseudocode.md, cross-document coherence.
// Nothing anywhere asked whether the outside world agrees, so a requirement could rest on a
// capability the provider does not have and reach code generation unchallenged. It is the only
// contact-with-reality defect in this pipeline; everything else it checks, it can check by reading
// its own output.
//
// TWO honesty constraints bind this suite, both from the field report:
//   1. check-pipeline-gaps.sh, which the report cites, DOES NOT EXIST. P7 keeps it uncited.
//   2. No external fact may be baked in. What an API can do DRIFTS: a fixture asserting one would
//      fail when the world changes and pass when our own rule breaks. P6 asserts the ABSENCE of
//      vendor names, and no assertion here mentions a capability of any real service.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const read = (rel) => fs.readFileSync(path.join(TPL, rel), 'utf-8');

const SPARC = 'skills/sparc-prd-mini/SKILL.md';
const REPLICATE = 'commands/replicate.md';

/** The External Dependencies section of the Phase-5 Architecture.md template. Scoped, because an
 *  assertion over a whole file passes on any prose that happens to mention the words. */
function inventory() {
  const src = read(SPARC);
  const start = src.indexOf('## External Dependencies\n');
  assert.ok(start > 0, 'the Phase-5 template must carry an External Dependencies section');
  const end = src.indexOf('## Data Architecture', start);
  assert.ok(end > start, 'and it must sit before Data Architecture, where the stack is still in view');
  return src.slice(start, end);
}

/** Phase 2 of replicate.md — a lens declared in a later phase validates nothing. */
function phase2() {
  const src = read(REPLICATE);
  const start = src.indexOf('### Phase 2: VALIDATION');
  const end = src.indexOf('### Phase 3', start);
  assert.ok(start > 0 && end > start, 'replicate.md must have a Phase 2 before Phase 3');
  return src.slice(start, end);
}

describe('the pipeline asks whether the outside world can do what a requirement needs (PR-010)', () => {
  test('P1 — the inventory exists and carries all five columns', () => {
    const block = inventory();
    // The HEADER ROW, not five words scattered through prose. Cross-family QE: a paragraph
    // containing all five labels would have replaced the table without failing.
    const header = block.split('\n').find((l) => l.startsWith('| Capability needed |')) || '';
    assert.notEqual(header, '', 'the inventory must have a table header row starting with the '
      + 'capability column');
    for (const col of ['Capability needed', 'Provider / API', 'Evidence', 'Verdict',
      'Requirements relying on it']) {
      assert.ok(header.includes(col), 'the header row must carry the column: ' + col);
    }
    // One row per CAPABILITY, not per vendor: a provider can do one of two things you need.
    assert.match(block, /One row per capability, not one row\s+per vendor/,
      'the granularity must be stated, or one row hides two questions');
  });

  test('P2 — the evidence rule is CLOSED on both sides', () => {
    // Saying what evidence IS leaves every reader to decide what it is not. The three ways this
    // check gets faked are named, so a row using one of them is visibly not evidence.
    const block = inventory();
    assert.match(block, /link to the PROVIDER'S OWN documentation/,
      'what counts must be stated precisely — not "a source"');
    assert.match(block, /plus the date it was checked/,
      'a citation without a date cannot be re-checked later');
    // Cross-family QE, the load-bearing finding: CONFIRMED was self-attested, and a plausible URL is
    // the cheapest forgery there is. A verbatim quote is what a link alone cannot fake.
    assert.match(block, /verbatim QUOTE from\s+that page stating the capability/,
      'a non-fabricable artifact must be required, not just a link');
    assert.match(block, /a URL nobody opened/,
      'and the link-alone forgery must be named as not-evidence');
    assert.match(block, /do NOT count/, 'and the rule must be closed on the other side too');
    for (const fake of ['landing page', 'pricing page', 'recollection']) {
      assert.ok(block.includes(fake), 'the not-evidence list must name: ' + fake);
    }
  });

  test('P3 — exactly three verdicts, and the empty case is explicit', () => {
    const block = inventory();
    // Each verdict must be a ROW of the verdict table, not a word somewhere in the prose. Found by
    // mutation: renaming the UNCONFIRMED row to UNKNOWN left the vocabulary broken and the first
    // version of this assertion green, because the word still appeared in the paragraph below it.
    for (const v of ['CONFIRMED', 'UNCONFIRMED', 'CONTRADICTED']) {
      assert.match(block, new RegExp('^\\| ' + v + ' \\|', 'm'),
        'the verdict must be a row of the verdict table, not merely mentioned: ' + v);
    }
    // Two values would collapse "we checked and it cannot" into "nobody checked", which overstates
    // one and hides the other. The reason has to be written down or the third value looks redundant.
    assert.match(block, /exactly three, because two would hide a difference that\s+matters/,
      'the reason for three values must be recorded, or a later edit will merge two of them');
    // EXACTLY three: the first version asserted the three exist and let a fourth in silently.
    const verdictRows = block.split('\n')
      .filter((l) => /^\| [A-Z_]+ \|/.test(l) && !l.startsWith('| Verdict |'));
    assert.equal(verdictRows.length, 3,
      'the verdict table must have exactly three rows, not merely contain the three: '
      + JSON.stringify(verdictRows));
    assert.match(block, /No external dependencies —\s+this product calls no third-party service/,
      'a project with none must say so: an empty section and an absent one look identical');
  });

  test('P4 — Phase 2 declares the sixth lens, inside Phase 2', () => {
    const block = phase2();
    const lensRow = block.split('\n').find((l) => l.startsWith('| `validator-dependencies` |')) || '';
    assert.notEqual(lensRow, '',
      'the lens must be a ROW of the validator table, not a mention in prose');
    assert.match(lensRow, /External Dependencies/,
      'and its scope column must name the section it reads: ' + lensRow);
    assert.match(lensRow, /evidence that names that capability/,
      'and its criteria column must say what it checks for: ' + lensRow);
    assert.match(block, /the only one that looks OUTSIDE the\s+documents/,
      'and say what makes it different from the other five, or it reads as a sixth of the same kind');
  });

  test('P5 — the exit criteria carry BOTH consequences, and UNCONFIRMED does not pass silently', () => {
    // Anchored to the exit-criteria ROW each term belongs to. Cross-family QE: three independent
    // phrase matches anywhere in Phase 2 would pass on explanatory prose that changed no verdict.
    const rows = {};
    for (const l of phase2().split('\n')) {
      const m = l.match(/^\| (🟢 READY|🟡 CAVEATS|🔴 NEEDS WORK) \|/);
      if (m) rows[m[1]] = l;
    }
    assert.ok(rows['🟢 READY'] && rows['🟡 CAVEATS'] && rows['🔴 NEEDS WORK'],
      'the exit-criteria table must carry all three verdict rows');
    assert.match(rows['🔴 NEEDS WORK'], /any external dependency is `CONTRADICTED`/,
      'a contradicted dependency must send the run back, in the row that sends it back');
    assert.match(rows['🟡 CAVEATS'], /every `UNCONFIRMED` dependency NAMED row by row/,
      'an unconfirmed dependency must be NAMED in the CAVEATS row — an unnamed caveat is one '
      + 'nobody acts on');
    assert.match(rows['🟢 READY'], /no external dependency `UNCONFIRMED` or `CONTRADICTED`/,
      'and READY must exclude both, or the strongest verdict is the one that checks least');
    // And the consequence must be scoped to the REQUIREMENT: without that, an inventory of nothing
    // but UNCONFIRMED rows reaches Phase 3 with a caveat and feasibility is never established.
    assert.match(inventory(), /cannot enter Phase 3 — defer, remove or replace them/,
      'UNCONFIRMED must stop the requirements that rest on it, or the check is optional in practice');
  });

  test('P6 — NO vendor fact is baked in: external facts drift', () => {
    // A fixture asserting what some API can do would fail when the world changes and pass when our
    // own rule breaks. The template must teach the SHAPE and name nobody.
    const block = inventory();
    const vendors = ['Anthropic', 'OpenAI', 'Stripe', 'Twilio', 'SendGrid', 'AWS', 'Google Cloud',
      'Azure', 'Firebase', 'Supabase'];
    for (const v of vendors) {
      assert.ok(!block.includes(v),
        'the template must name no real provider — capabilities drift and a stale fact recorded as '
        + 'evidence is worse than none. Found: ' + v);
    }
    // A denylist can only ever catch the names on it. The positive assertion is what actually holds:
    // the example row's own cells must be bracketed placeholders, so there is no cell for a real
    // vendor to sit in. The list above stays as a cheap second net.
    const exampleRow = block.split('\n')
      .find((l) => l.startsWith('| [') && l.includes('CONFIRMED')) || '';
    assert.notEqual(exampleRow, '', 'the template must show one example row');
    const cells = exampleRow.split('|').map((c) => c.trim()).filter(Boolean);
    for (const cell of cells) {
      assert.ok(/^\[|^CONFIRMED$/.test(cell) || cell.startsWith('['),
        'every example cell must be a bracketed placeholder or the verdict itself, so no real '
        + 'provider can sit in the row: ' + cell);
    }
    assert.match(block, /are PLACEHOLDERS/, 'and it must say the example names are placeholders');
    assert.match(block, /a stale fact recorded as evidence is worse than\s+none/,
      'with the reason, so a later editor does not helpfully fill in a real one');
  });

  test('P8 — the agent that DISPATCHES the swarm lists the same lenses as the command', () => {
    // Found by an independent reviewer after the fact: commands/replicate.md gained the sixth lens
    // and templates/.claude/agents/doc-validator.md did not. Two files describing one swarm, one of
    // them a lens short — and the sha256 snapshot test cannot see it, because both files hash fine.
    const cmd = read(REPLICATE);
    const agent = fs.readFileSync(path.join(TPL, 'agents', 'doc-validator.md'), 'utf-8');
    const names = (src) => new Set([...src.matchAll(/\| `(validator-[a-z-]+)`/g)].map((m) => m[1]));
    const inCmd = names(cmd);
    const inAgent = names(agent);
    assert.ok(inCmd.size >= 6, 'the command must dispatch at least six lenses: ' + [...inCmd]);
    assert.deepEqual([...inAgent].sort(), [...inCmd].sort(),
      'the dispatching agent and the command disagree about the swarm: '
      + JSON.stringify({ agent: [...inAgent], command: [...inCmd] }));
    // And the count in the agent's own prose must match the table it introduces.
    const stated = agent.match(/Launch (\d+) parallel validation agents/);
    assert.ok(stated, 'doc-validator.md must state how many it launches');
    assert.equal(Number(stated[1]), inAgent.size,
      'doc-validator.md says ' + stated[1] + ' but tables ' + inAgent.size);
  });

  test('P7 — nothing cites check-pipeline-gaps.sh, which does not exist', () => {
    // The report cites it. MEASURED — a repo-wide find returns nothing. Pointing a reader at a
    // script that is not there is a worse failure than the gap it was cited to close.
    for (const f of [SPARC, REPLICATE]) {
      assert.ok(!read(f).includes('check-pipeline-gaps'),
        f + ' references a script that does not exist in this repository');
    }
    // The premise, asserted rather than assumed: if someone ever ADDS the script, this goes red and
    // whoever added it has to revisit the rule instead of leaving a stale prohibition behind.
    const pkgRoot = path.join(__dirname, '..', '..');
    const candidates = ['check-pipeline-gaps.sh', path.join('scripts', 'check-pipeline-gaps.sh'),
      path.join('bin', 'check-pipeline-gaps.sh')];
    for (const c of candidates) {
      assert.ok(!fs.existsSync(path.join(pkgRoot, c)),
        'the script now exists at ' + c + ' — this rule was written on the premise that it does '
        + 'not, so revisit it rather than deleting this assertion');
    }
  });
});
